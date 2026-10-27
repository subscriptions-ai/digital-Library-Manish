/**
 * Bounded DOAB recovery test against the REAL DOAB, written to a CLONE of the database — never the live one.
 *
 *   createdb stm_doab_recovery; pg_dump stm_library | psql stm_doab_recovery
 *   DATABASE_URL=postgresql://…/stm_doab_recovery npx tsx scripts/doab-recovery-bounded.ts
 *
 * It starts from the checkpoint it finds (it never resets it) and runs three small stages, each from where the last one stopped:
 *   A. capped sample: at most 10 writes, checkpoint untouched (a capped run never moves it)
 *   B. one real page (100 records), checkpoint advances by exactly that page
 *   C. up to 1,000 records (ten pages)
 * and reports, for each: checked / new / existing / enriched / review / refused / failed, and the checkpoint before and after.
 * It also compares every pre-existing DOAB row before and after, to prove nothing already held was overwritten.
 * It refuses to run unless the database name says it is a throwaway copy.
 */
const url = process.env.DATABASE_URL || '';
const name = url.replace(/\?.*$/, '').split('/').pop() || '';
if (!/recovery|test/.test(name)) { console.error(`Refusing to run against "${name}": point DATABASE_URL at a throwaway copy (its name must contain "recovery" or "test").`); process.exit(2); }

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const { harvestFeed, DOAB_OAI, describeOaiToken } = await import('../src/lib/ingestion/books/oaiHarvest.js');

const cp = async () => db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } });
const counts = async () => ({ books: await db.book.count(), doab: await db.book.count({ where: { source: 'DOAB' } }), published: await db.book.count({ where: { source: 'DOAB', status: 'Published' } }), drafts: await db.book.count({ where: { source: 'DOAB', status: 'Draft' } }) });
const snap = async () => new Map<string, any>((await db.book.findMany({ where: { source: 'DOAB' } })).map((b: any) => [b.id, b]));
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

function line(label: string, r: any) {
  const held = Object.values(r.duplicates as Record<string, number>).reduce((a, b) => a + b, 0);
  const refused = r.deleted + r.unusable + r.weakSkipped + r.outsideScope + r.department.none + r.files.refused;
  console.log(`  ${label}: checked ${r.fetched} (${r.pages} page${r.pages === 1 ? '' : 's'}) · new ${r.added + r.queuedForReview} (published ${r.added}, to review ${r.queuedForReview}) · existing ${held} · enriched ${r.enriched} · refused/skipped ${refused} (deleted ${r.deleted}, unusable ${r.unusable}, no department ${r.department.none}, file refused ${r.files.refused}) · failed ${r.failed}`);
  if (r.sourceError) console.log(`     sourceError: ${r.sourceError}`);
  if (r.firstError) console.log(`     firstError: ${r.firstError}`);
  console.log(`     accounting: ${r.accounting ? (r.accounting.ok ? 'every record ended in exactly one bucket' : r.accounting.message) : 'n/a'}`);
}

const cell = (c: any) => c ? { cursor: c.cursor, offset: describeOaiToken(DOAB_OAI, c.cursor).offset, lastPageAt: c.lastPageAt, lastAttemptAt: c.lastAttemptAt, lastSuccessfulSyncAt: c.lastSuccessfulSyncAt, harvestStartedAt: c.harvestStartedAt } : null;

const start = await cp();
const before = await snap();
const c0 = await counts();
console.log(`\nDatabase: ${name}`);
console.log('Checkpoint at start:', JSON.stringify(cell(start)));
console.log('Counts at start:', JSON.stringify(c0));
if (!start?.cursor) console.log('  (no saved token: this will begin a harvest from the checkpoint rules — nothing is reset by the script)');

// A — capped: at most 10 writes, never touches the checkpoint.
console.log('\nA. capped sample (≤ 10 writes)');
const a = await harvestFeed(DOAB_OAI, { maxWrites: 10, maxPages: 3, pageDelayMs: 500 });
line('A', a);
const afterA = await cp();
console.log(`  checkpoint after A: ${same(cell(afterA), cell(start)) ? 'UNCHANGED (as designed for a capped run)' : 'CHANGED ' + JSON.stringify(cell(afterA))}`);

// B — one real page.
console.log('\nB. one real page (100 records)');
const b0 = await cp();
const b = await harvestFeed(DOAB_OAI, { maxPages: 1, pageDelayMs: 500 });
line('B', b);
const b1 = await cp();
console.log(`  resumed from: ${b.resumedFrom}  (checkpoint before B: ${b0?.cursor})  → resumed from the saved place: ${b.resumedFrom === (b0?.cursor ?? null)}`);
console.log(`  checkpoint before → after: offset ${describeOaiToken(DOAB_OAI, b0?.cursor ?? null).offset} → ${describeOaiToken(DOAB_OAI, b1?.cursor ?? null).offset}  (${b0?.cursor} → ${b1?.cursor})  lastPageAt ${b1?.lastPageAt?.toISOString()}`);

// C — up to 1,000 records.
console.log('\nC. up to 1,000 records (ten pages)');
const c1 = await cp();
const c = await harvestFeed(DOAB_OAI, { maxPages: 10, maxRecords: 1000, pageDelayMs: 500 });
line('C', c);
const c2 = await cp();
console.log(`  resumed from: ${c.resumedFrom}  → resumed from where B stopped: ${c.resumedFrom === (c1?.cursor ?? null)}`);
console.log(`  checkpoint before → after: offset ${describeOaiToken(DOAB_OAI, c1?.cursor ?? null).offset} → ${describeOaiToken(DOAB_OAI, c2?.cursor ?? null).offset}  (${c1?.cursor} → ${c2?.cursor})`);

// Nothing already held may have been overwritten: compare every pre-existing DOAB row.
const after = await snap();
let missing = 0, changed = 0, overwrote = 0;
const changedCols: Record<string, number> = {};
for (const [id, was] of before) {
  const now = after.get(id);
  if (!now) { missing++; continue; }
  const cols = Object.keys(was).filter(k => k !== 'updatedAt' && !same(was[k], now[k]));
  if (!cols.length) continue;
  changed++;
  for (const k of cols) {
    changedCols[k] = (changedCols[k] || 0) + 1;
    const empty = was[k] === null || was[k] === '' || (Array.isArray(was[k]) && !was[k].length) || (typeof was[k] === 'object' && was[k] !== null && !Object.keys(was[k]).length);
    if (!empty && k !== 'metadata') overwrote++;                       // a column that already had a value and now has another
  }
}
const ca = await counts();
console.log('\nContinuity and safety');
console.log(`  DOAB rows present at the start: ${before.size}; missing afterwards: ${missing}`);
console.log(`  rows changed (enriched): ${changed}; columns touched: ${JSON.stringify(changedCols)}`);
console.log(`  columns that ALREADY held a value and were replaced (excluding metadata provenance): ${overwrote}`);
const metaOnly = [...before].filter(([id, was]) => { const n = after.get(id); return n && !same(was.metadata, n.metadata); }).length;
console.log(`  rows whose metadata (provenance) gained keys: ${metaOnly}`);
console.log('  counts before:', JSON.stringify(c0));
console.log('  counts after: ', JSON.stringify(ca));
console.log(`  checkpoint reset to the beginning at any point: ${[b1, c2].some(x => x && !x.cursor && !x.lastSuccessfulSyncAt) ? 'YES' : 'no'}`);
const h = await db.ingestionSourceHealth.findUnique({ where: { source: 'DOAB' } });
console.log(`  DOAB health row: failures ${h?.consecutiveFailures ?? 0}, lastErrorKind ${h?.lastErrorKind ?? '—'}`);
await db.$disconnect();
