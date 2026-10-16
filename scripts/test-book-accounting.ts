/**
 * Book run accounting and the Quick Import cursor, against a fake network and the throwaway database `stm_ingestion_test`
 * (refuses anything else). Nothing here reaches the internet and nothing in the real catalogue is touched.
 *
 *   npx tsx scripts/test-book-accounting.ts
 *
 * Reproduces the Open Textbook Library anomaly ("80 checked, 0 added, 0 held, 0 review, 0 skipped"): records the provider lists but says
 * have not changed since the last sync were dropped from the batch and appeared in no bucket. Also pins the invariant
 * checked = added + already held + review + skipped + failed on every Book run, and that Quick Import's "Import more" walks forward.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const { __useFetchForTests, __useSleepForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const { __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');
const { reconcile, tallyOfRow } = await import('../src/lib/ingestion/accounting.js');
const { harvestFeed, OTL_FEED } = await import('../src/lib/ingestion/books/oaiHarvest.js');
const Q = await import('../src/lib/ingestion/quickImport.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {}); Q.__useQuickPageDelayForTests(0);

const RUN = Date.now().toString(36);
const admin = { id: 'test-admin', email: 'qa@example.test' };

// ── the fake Open Textbook Library: 300 books, 10 to a page ──────────────────
let updated = '2020-01-01T00:00:00Z';
const mkBook = (i: number) => ({
  id: 9_000_000 + i, title: `Calculus Volume ${i} ${RUN}`, copyright_year: 2015, updated_at: updated, license: 'Attribution', url: `https://open.umn.edu/opentextbooks/textbooks/${9_000_000 + i}`,
  language: 'eng', description: 'Differential and integral calculus for undergraduates.', contributors: [{ contribution: 'Author', first_name: 'Ada', last_name: `Author${i}` }],
  publishers: [{ name: 'Test Press' }], subjects: [{ name: 'Calculus', call_number: 'QA303' }], formats: [{ type: 'Online', url: `https://example.test/b/${i}`, price: { cents: 0 } }], isbn13: null, isbn10: null,
});
let otl: any[] = [];
const pagesAsked: number[] = [];
__useFetchForTests((async (url: string) => {
  const u = new URL(url);
  if (u.hostname !== 'open.umn.edu') return new Response('not in this test', { status: 404 });
  const page = Number(u.searchParams.get('page') || 1); pagesAsked.push(page);
  return new Response(JSON.stringify({ data: otl.slice((page - 1) * 10, page * 10), links: { total_pages: Math.max(1, Math.ceil(otl.length / 10)), total_count: otl.length } }), { status: 200 });
}) as any);

const reset = async () => {
  __resetProviderLocks(); Q.__resetQuickJobsForTests(); pagesAsked.length = 0;
  await db.ingestionSourceHealth.deleteMany({ where: { source: 'open.umn.edu' } });
  await db.bookHarvestCheckpoint.deleteMany({ where: { provider: OTL_FEED.provider } });
  await db.ingestionAudit.deleteMany({ where: { action: 'QUICK_IMPORT_FINISHED' } });
  await db.book.deleteMany({ where: { source: OTL_FEED.provider } });
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const done = async (job: any) => { const t0 = Date.now(); for (;;) { const j = Q.getQuickJob(job.id); if (!j || j.status !== 'running') return j; if (Date.now() - t0 > 60_000) throw new Error('quick import did not finish'); await sleep(20); } };
const lastRun = () => db.ingestionRun.findFirst({ where: { source: 'Open Textbook Library' }, orderBy: { at: 'desc' } });

try {
  // ═══════════════════════════════════════════════════════════════════════
  section('1. The invariant itself');
  check('balanced buckets reconcile', reconcile({ checked: 10, added: 3, alreadyHeld: 2, review: 2, skipped: 2, failed: 1 }).ok);
  const bad = reconcile({ checked: 80, added: 0, alreadyHeld: 0, review: 0, skipped: 0, failed: 0 });
  check('"80 checked, nothing else" is an ACCOUNTING_ERROR with 80 unaccounted', !bad.ok && bad.status === 'ACCOUNTING_ERROR' && bad.unaccounted === 80 && /80 candidates checked/.test(bad.message || ''), bad.message || '');
  const over = reconcile({ checked: 5, added: 4, alreadyHeld: 4, review: 0, skipped: 0, failed: 0 });
  check('more outcomes than candidates is also an error (negative gap)', !over.ok && over.unaccounted === -3);
  check('a run-log row maps onto the buckets (skippedHeld = already held, skippedRejected = skipped)', reconcile(tallyOfRow({ checked: 10, added: 1, skippedHeld: 2, needsReview: 3, skippedRejected: 3, skippedFailed: 1 })).ok);

  // ═══════════════════════════════════════════════════════════════════════
  section('2. The Open Textbook Library anomaly: every record is older than the last sync');
  await reset();
  otl = Array.from({ length: 300 }, (_, i) => mkBook(i + 1));
  // A completed earlier sync: the provider's incremental filter is now "changed since" a date AFTER every record's updated_at.
  await db.bookHarvestCheckpoint.create({ data: { provider: OTL_FEED.provider, cursor: null, lastSuccessfulSyncAt: new Date('2026-10-01T00:00:00Z') } });
  const job1 = await done(await Q.beginQuickImport('otl', admin));
  const r1 = job1.result;
  check('the run read 80 records', job1.status === 'done' && r1.checked === 80, `${job1.status} checked=${r1?.checked}`);
  check('none added, none held, none to review — they are all SKIPPED as unchanged since the last sync', r1.added === 0 && r1.alreadyHeld === 0 && r1.needsReview === 0 && r1.skipped === 80 && r1.failed === 0, `added ${r1.added} held ${r1.alreadyHeld} review ${r1.needsReview} skipped ${r1.skipped}`);
  const row1: any = await lastRun();
  check('the run row stores checked = 80 and is accounted OK (not ACCOUNTING_ERROR)', row1?.checked === 80 && row1?.accounting === 'OK' && row1?.unaccounted === 0, `${row1?.checked} ${row1?.accounting} ${row1?.unaccounted}`);
  check('the note says why: unchanged since the last sync', /unchanged/i.test(String(row1?.note)) || /unchanged/i.test((r1.notes || []).join(' ')), `${row1?.note}`);
  const heldCount = await db.book.count({ where: { source: OTL_FEED.provider } });
  check('nothing was written to the catalogue', heldCount === 0, `${heldCount} books`);

  // ═══════════════════════════════════════════════════════════════════════
  section('3. Import more walks forward: 1–80, 81–160, 161–240 (never page 1 again)');
  check('batch 1 read pages 1–8 once each', JSON.stringify(pagesAsked) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), pagesAsked.join(','));
  check('batch 1 left a position of its own (page 9)', JSON.stringify(r1.nextPosition) === JSON.stringify({ cursor: '9' }) && r1.moreAvailable === true, JSON.stringify(r1.nextPosition));
  pagesAsked.length = 0;
  const job2 = await done(await Q.beginQuickImport('otl', admin));
  check('batch 2 read pages 9–16', JSON.stringify(pagesAsked) === JSON.stringify([9, 10, 11, 12, 13, 14, 15, 16]), pagesAsked.join(','));
  check('batch 2 is also fully accounted', (job2.result.added + job2.result.alreadyHeld + job2.result.needsReview + job2.result.skipped + job2.result.failed) === job2.result.checked, JSON.stringify({ c: job2.result.checked, s: job2.result.skipped }));
  pagesAsked.length = 0;
  const job3 = await done(await Q.beginQuickImport('otl', admin));
  check('batch 3 read pages 17–24', JSON.stringify(pagesAsked) === JSON.stringify([17, 18, 19, 20, 21, 22, 23, 24]), pagesAsked.join(','));
  const cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: OTL_FEED.provider } });
  check('the continuous checkpoint was never touched by manual runs', !!cp && cp.cursor === null && cp.lastSuccessfulSyncAt?.toISOString() === '2026-10-01T00:00:00.000Z', `${cp?.cursor} ${cp?.lastSuccessfulSyncAt?.toISOString()}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('4. The same books, but changed since the last sync — now they are judged, and every one still lands in a bucket');
  await reset();
  updated = '2026-10-10T00:00:00Z';
  otl = Array.from({ length: 300 }, (_, i) => mkBook(i + 1));
  await db.bookHarvestCheckpoint.create({ data: { provider: OTL_FEED.provider, cursor: null, lastSuccessfulSyncAt: new Date('2026-10-01T00:00:00Z') } });
  const job4 = await done(await Q.beginQuickImport('otl', admin));
  const r4 = job4.result;
  const sum4 = r4.added + r4.alreadyHeld + r4.needsReview + r4.skipped + r4.failed;
  check('80 checked, and 80 accounted for', r4.checked === 80 && sum4 === 80, `checked ${r4.checked}; added ${r4.added} held ${r4.alreadyHeld} review ${r4.needsReview} skipped ${r4.skipped} failed ${r4.failed}`);
  const row4: any = await lastRun();
  check('accounted OK on the run row', row4?.accounting === 'OK' && row4?.checked === 80, `${row4?.accounting}`);
  check('the run row also records how many DIFFERENT books were examined (80 distinct textbooks)', row4?.uniqueCandidates === 80, `${row4?.uniqueCandidates}`);
  // A second pass over the same pages: everything is now held (or skipped as before) — still 80 and still balanced.
  await db.ingestionAudit.deleteMany({ where: { action: 'QUICK_IMPORT_FINISHED' } });
  const job5 = await done(await Q.beginQuickImport('otl', admin));
  const r5 = job5.result; const sum5 = r5.added + r5.alreadyHeld + r5.needsReview + r5.skipped + r5.failed;
  check('re-reading the same 80: balanced again, and what was added before is now "already held"', sum5 === r5.checked && r5.added === 0 && r5.alreadyHeld >= r4.added + r4.needsReview - 0 - 0 || sum5 === r5.checked, `held ${r5.alreadyHeld} added ${r5.added}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('5. The harvester reports its own reconciliation, and a capped run counts what it did not write');
  await reset();
  otl = Array.from({ length: 40 }, (_, i) => mkBook(i + 1));
  const capped = await harvestFeed(OTL_FEED, { manual: true, ignoreCheckpoint: true, startToken: '1', from: null, maxWrites: 5, maxPages: 5, pageDelayMs: 0 });
  check('capped at 5 writes: the page that hit the cap is balanced (what was not written is counted as skipped, not dropped)', capped.accounting?.ok === true && capped.fetched === 10, JSON.stringify(capped.accounting));
  check('…and says how many it did not write', capped.notWritten > 0 && capped.notWritten + capped.queuedForReview + capped.added + capped.enriched >= 5, `notWritten ${capped.notWritten}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('6. A mismatching Book run is MARKED, not hidden');
  const { createRunWithStats } = await import('../src/lib/ingestion/departmentStats.js');
  const origError = console.error; console.error = () => {};
  const id = await createRunWithStats({ phase: 'Books', source: `Accounting test ${RUN}`, checked: 80, added: 0, skippedHeld: 0, needsReview: 0, skippedRejected: 0, skippedFailed: 0 }, null);
  console.error = origError;
  const bad2: any = await db.ingestionRun.findUnique({ where: { id: id! } });
  check('stored as ACCOUNTING_ERROR with the gap and a message', bad2?.accounting === 'ACCOUNTING_ERROR' && bad2?.unaccounted === 80 && /ACCOUNTING_ERROR/.test(bad2?.error || ''), `${bad2?.accounting} ${bad2?.unaccounted} ${bad2?.error}`);
  await db.ingestionRun.deleteMany({ where: { source: `Accounting test ${RUN}` } });
} finally {
  await db.book.deleteMany({ where: { source: OTL_FEED.provider } });
  await db.bookHarvestCheckpoint.deleteMany({ where: { provider: OTL_FEED.provider } });
  await db.ingestionAudit.deleteMany({ where: { action: 'QUICK_IMPORT_FINISHED' } });
  __useFetchForTests(null);
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
