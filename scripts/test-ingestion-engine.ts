/**
 * Ingestion engine safety tests.
 *
 * Runs ONLY against the throwaway database `stm_ingestion_test`. It refuses to start against anything
 * else, because these tests create journals and articles and must never touch the real catalogue.
 * The upstream source is a fake that answers exactly as OpenAlex does (cursor paging, newest first),
 * so a result here is a result about our code, not about the network.
 *
 *   npx tsx scripts/test-ingestion-engine.ts
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
if (!/stm_ingestion_test$/.test(new URL(TEST_URL).pathname)) throw new Error('refusing to run: not the test database');

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const dbName = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const { ingestNextJournal, runIngestionPass, getState } = await import('../src/lib/ingestionWorker.js');
const { claimJournal, releaseClaim, WORKER_ID } = await import('../src/lib/ingestion/claims.js');
const { __useFetchForTests, __useSleepForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const { INGESTION_POLICY, noChangeCooldownMinutes, failureBackoffMinutes } = await import('../src/lib/ingestion/policy.js');

// ── a tiny harness ────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {});                           // no real waiting on retries
// Leave no pause behind from an earlier run.
await db.ingestionSourceHealth.upsert({ where: { source: 'OpenAlex' }, create: { source: 'OpenAlex' }, update: { consecutiveFailures: 0, pausedUntil: null } });

// ── a fake OpenAlex ───────────────────────────────────────────────────────
type FakeWork = { id: string; doi: string | null; title: string; year: number };
const catalogue = new Map<string, FakeWork[]>();               // issn -> works, newest first
let requestLog: { issn: string; per: number; cursor: string }[] = [];
let failNext: { status?: number; network?: boolean; times: number } | null = null;
const b64 = (n: number) => Buffer.from(String(n)).toString('base64');
const unb64 = (c: string) => (c === '*' ? 0 : Number(Buffer.from(c, 'base64').toString()));

__useFetchForTests(async (url: string) => {
  const u = new URL(url);
  const issn = /issn:([0-9X-]+)/.exec(u.searchParams.get('filter') || '')?.[1] || '';
  const per = Number(u.searchParams.get('per-page'));
  const cursor = u.searchParams.get('cursor') || '*';
  requestLog.push({ issn, per, cursor });
  if (failNext && failNext.times > 0) {
    failNext.times--;
    if (failNext.network) throw new Error('ECONNRESET');
    return new Response('boom', { status: failNext.status || 500 });
  }
  const all = catalogue.get(issn) || [];
  const start = unb64(cursor);
  const slice = all.slice(start, start + per);
  const more = start + per < all.length;
  const body = {
    meta: { next_cursor: more ? b64(start + per) : null },
    results: slice.map(w => ({
      id: w.id, doi: w.doi ? `https://doi.org/${w.doi}` : null, title: w.title, publication_year: w.year,
      publication_date: `${w.year}-01-15`, authorships: [{ author: { display_name: 'A. Author' } }],
      biblio: { volume: '1', issue: '1' }, primary_location: { landing_page_url: `https://example.org/${w.id}` },
      best_oa_location: { pdf_url: `https://example.org/${w.id}.pdf`, license: 'cc-by' }, concepts: [{ display_name: 'Test' }],
    })),
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
});

const YEAR = new Date().getFullYear();

// Every run has its own names: the test database is never wiped, so records from an earlier run must not collide.
const RUN = Date.now().toString(36);
// Departments are named per run: eligible journals left behind by an earlier run must not be picked by this one.
const DEPT_A = `Civil ${RUN}`, DEPT_LAW = `Law ${RUN}`, DEPT_DENTAL = `Dental ${RUN}`;
const works = (prefix: string, n: number): FakeWork[] =>
  Array.from({ length: n }, (_, i) => ({ id: `https://openalex.org/${RUN}${prefix}${i}`, doi: `10.9999/${RUN}${prefix}.${i}`.toLowerCase(), title: `${RUN} ${prefix} article ${i}`, year: YEAR }));

let counter = 0;
const uid = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;
const issnFor = () => { const d = String(Math.floor(Math.random() * 9e7) + 1e7); return `${d.slice(0, 4)}-${d.slice(4, 7)}X`; };

async function newJournal(opts: { issn?: string; articleCount?: number; domain?: string; title?: string } = {}) {
  return db.journal.create({
    data: {
      title: opts.title || `Test Journal ${uid()}`, issn: opts.issn || issnFor(), status: 'Accepted', rightsBasis: 'DOAJ declaration',
      licenceIsNC: false, domain: opts.domain || DEPT_A, articleCount: opts.articleCount ?? 0,
    },
  });
}
async function holdArticles(journal: any, ws: FakeWork[], extra: any = {}) {
  for (const w of ws) {
    await db.article.create({
      data: {
        title: w.title, doi: w.doi, journalId: journal.id, journalName: journal.title, journalIssn: journal.issn, year: w.year,
        domain: journal.domain, status: 'Published', source: 'OpenAlex', ownershipSource: 'Ingested',
        fingerprint: `doi:${w.doi}`, sourceRecordId: w.id, ...extra,
      },
    });
  }
}
const count = (model: string, where: any = {}) => db[model].count({ where });
async function setState(data: any) { await getState(); return db.ingestionState.update({ where: { id: 'singleton' }, data: { yearsBack: 7, articlesPerJournal: 30, batchSize: 200, ...data } }); }

// ═════════════════════════════════════════════════════════════════════════
section('ROOT CAUSE — a journal holding 29 of 30, its newest records already held, no saved cursor');
// This is the state of the 208 journals fetched before the cursor existed. The scenario is run twice, once
// with the new scheduler off (the old behaviour) and once on.
for (const mode of ['legacy', 'v2'] as const) {
  process.env.INGESTION_SCHEDULER_V2 = mode === 'v2' ? '1' : '0';
  await setState({});
  const issn = issnFor(); const ws = works(`rc${mode}`, 120); catalogue.set(issn, ws);
  const j = await newJournal({ issn, articleCount: 29 });
  await holdArticles(j, ws.slice(0, 29));                                  // the 29 newest are held
  requestLog = [];
  let visits = 0, zeroAdd = 0;
  for (; visits < 60;) {
    const cur = await db.journal.findUnique({ where: { id: j.id } });
    if (cur.articleCount >= 30) break;
    visits++;
    // In v2 a journal may be resting; the visit helper only picks eligible journals, so wait it out in test time.
    if (cur.nextEligibleAt) await db.journal.update({ where: { id: j.id }, data: { nextEligibleAt: null } });
    const r: any = await ingestNextJournal(await getState(), [DEPT_A]);
    if (!r.journal) break;
    if (r.added === 0) zeroAdd++;
  }
  const after = await db.journal.findUnique({ where: { id: j.id } });
  console.log(`    [${mode}] visits to reach the limit: ${visits}, visits that added nothing: ${zeroAdd}, requests made: ${requestLog.length}`);
  check(`[${mode}] the journal reaches its limit`, after.articleCount >= 30, `articleCount ${after.articleCount}`);
  if (mode === 'legacy') check('[legacy] reproduces the bug: many visits that add nothing', zeroAdd >= 20, `${zeroAdd} empty visits`);
  else check('[v2] fixed: it converges in a single visit with nothing wasted', zeroAdd === 0 && visits === 1 && requestLog.length === 1, `${visits} visit(s), ${requestLog.length} request(s)`);
}
process.env.INGESTION_SCHEDULER_V2 = '1';

// ═════════════════════════════════════════════════════════════════════════
section('A/G. The same record twice — held, not duplicated, never overwritten');
{
  await setState({});
  const issn = issnFor(); const ws = works('dup', 10); catalogue.set(issn, ws);
  const j = await newJournal({ issn });
  const r1: any = await ingestNextJournal(await getState(), [DEPT_A]);
  const first = await count('article', { journalId: j.id });
  const sample = await db.article.findFirst({ where: { journalId: j.id }, orderBy: { title: 'asc' } });
  await db.article.update({ where: { id: sample.id }, data: { subject: 'EDITED BY AN ADMIN' } });      // a hand edit that must survive
  await db.journal.update({ where: { id: j.id }, data: { fetchCursor: null, exhaustedAt: null, nextEligibleAt: null, articleCount: 0 } });
  const r2: any = await ingestNextJournal(await getState(), [DEPT_A]);
  const second = await count('article', { journalId: j.id });
  const after = await db.article.findUnique({ where: { id: sample.id } });
  check('first visit adds the records', r1.added === 10 && first === 10, `added ${r1.added}`);
  check('second visit adds nothing and holds all of them', r2.added === 0 && r2.skippedHeld === 10, `held ${r2.skippedHeld}`);
  check('no duplicate rows were created', second === first);
  check('an existing record is not overwritten', after.subject === 'EDITED BY AN ADMIN' && after.updatedAt.getTime() === (await db.article.findUnique({ where: { id: sample.id } })).updatedAt.getTime());
  check('new records carry the source id and provenance', (await db.article.count({ where: { journalId: j.id, source: 'OpenAlex', sourceRecordId: { not: null } } })) === 10);
}

// ═════════════════════════════════════════════════════════════════════════
section('B. A journal with nothing new is left alone, and the engine moves to another one');
{
  await setState({});
  const empty = issnFor(); catalogue.set(empty, []);                         // the source has nothing for it
  const other = issnFor(); catalogue.set(other, works('other', 5));
  // A journal that has been fetched before sorts after a never-fetched one, so make `quiet` the oldest-fetched.
  const quiet = await newJournal({ issn: empty, domain: DEPT_LAW });
  const busy = await newJournal({ issn: other, domain: DEPT_LAW });
  await db.journal.update({ where: { id: busy.id }, data: { lastIngestedAt: new Date() } });
  const v1: any = await ingestNextJournal(await getState(), [DEPT_LAW]);
  const q = await db.journal.findUnique({ where: { id: quiet.id } });
  check('the first visit finds nothing and sets a cooldown', v1.journal === quiet.title && !!q.nextEligibleAt && q.nextEligibleAt > new Date(), `next ${q.nextEligibleAt?.toISOString()}`);
  const wait = (q.nextEligibleAt.getTime() - Date.now()) / 86400000;
  check('the cooldown for a finished journal is days, not minutes (looks again next week)', wait > 6 && wait <= 7.1, `${wait.toFixed(1)} days`);
  const v2: any = await ingestNextJournal(await getState(), [DEPT_LAW]);
  check('the next visit goes to a different journal, not back to the quiet one', v2.journal === busy.title, `visited ${v2.journal}`);
  check('the cooldown is a time, not a verdict: the journal is still Accepted and not marked complete', q.status === 'Accepted' && q.nextEligibleAt !== null);
  check('cooldown lengthens with repeated no-change visits, capped', noChangeCooldownMinutes(1) < noChangeCooldownMinutes(3) && noChangeCooldownMinutes(99) === INGESTION_POLICY.cooldown.noChangeMaxMinutes);
}

// ═════════════════════════════════════════════════════════════════════════
section('C. Two workers try to claim the same journal — only one gets it');
{
  await getState();
  const j = await newJournal({ domain: 'Pharmacy' });
  const where = { id: j.id };
  const results = await Promise.all(Array.from({ length: 8 }, () => claimJournal(where, [{ createdAt: 'asc' }])));
  const winners = results.filter(Boolean);
  check('exactly one of eight simultaneous claims wins', winners.length === 1, `${winners.length} winners`);
  const row = await db.journal.findUnique({ where: { id: j.id } });
  check('the winner is recorded on the journal', row.claimedBy === WORKER_ID && !!row.claimedAt);
  const again = await claimJournal(where, [{ createdAt: 'asc' }]);
  check('a fresh claim cannot be taken again', again === null);
  await releaseClaim('journal', j.id);
  check('after release it can be claimed again', (await claimJournal(where, [{ createdAt: 'asc' }])) !== null);
  await releaseClaim('journal', j.id);
}

// ═════════════════════════════════════════════════════════════════════════
section('D. A worker crashed holding a claim — it is recovered after the timeout and the recovery is audited');
{
  await getState();
  const j = await newJournal({ domain: 'Nursing' });
  const stale = new Date(Date.now() - (INGESTION_POLICY.claim.staleAfterMinutes + 5) * 60_000);
  await db.journal.update({ where: { id: j.id }, data: { claimedAt: stale, claimedBy: 'dead-worker:1:abc' } });
  const fresh = await claimJournal({ id: j.id }, [{ createdAt: 'asc' }]);
  check('a stale claim is taken over', !!fresh && fresh.recovered === true && fresh.previousWorker === 'dead-worker:1:abc');
  const log = await db.ingestionAudit.findFirst({ where: { action: 'STALE_CLAIM_RECOVERED' }, orderBy: { at: 'desc' } });
  check('the recovery is written to the audit log', !!log && (log.meta as any).id === j.id);
  await releaseClaim('journal', j.id);
  const j2 = await newJournal({ domain: 'Nursing' });
  await db.journal.update({ where: { id: j2.id }, data: { claimedAt: new Date(), claimedBy: 'live-worker:2:xyz' } });
  check('a fresh claim by another worker is respected', (await claimJournal({ id: j2.id }, [{ createdAt: 'asc' }])) === null);
}

// ═════════════════════════════════════════════════════════════════════════
section('I. The source fails — retry, back off, keep the cursor, corrupt nothing, and pause a source that keeps failing');
{
  await setState({});
  const issn = issnFor(); catalogue.set(issn, works('fail', 80));
  const j = await newJournal({ issn, domain: DEPT_DENTAL });
  // No limit and small pages, so the first visit takes part of the journal and leaves a cursor behind.
  await setState({ articlesPerJournal: 0, batchSize: 40 });
  const ok: any = await ingestNextJournal(await getState(), [DEPT_DENTAL]);
  const mid = await db.journal.findUnique({ where: { id: j.id } });
  check('a first visit saves a cursor', !!mid.fetchCursor && ok.added > 0, `added ${ok.added}`);
  const savedCursor = mid.fetchCursor;
  const articlesBefore = await count('article', { journalId: j.id });

  failNext = { status: 503, times: 3 };                                   // all three attempts fail
  requestLog = [];
  const bad: any = await ingestNextJournal(await getState(), [DEPT_DENTAL]);
  const afterFail = await db.journal.findUnique({ where: { id: j.id } });
  check('a transient failure is retried before giving up', requestLog.length === 3, `${requestLog.length} requests`);
  check('the cursor is KEPT through a failure (dropping it is what caused the re-walk)', afterFail.fetchCursor === savedCursor);
  check('the failure is recorded with a retry time, not a verdict', afterFail.failureCount === 1 && afterFail.lastIngestionStatus === 'failed' && afterFail.nextEligibleAt > new Date(), JSON.stringify({ fc: afterFail.failureCount, st: afterFail.lastIngestionStatus, next: afterFail.nextEligibleAt, bad: bad && (bad.error || bad.note) }));
  check('a failed request writes no records', (await count('article', { journalId: j.id })) === articlesBefore);
  check('retry delay doubles each time', failureBackoffMinutes(2) === failureBackoffMinutes(1) * 2 && failureBackoffMinutes(40) === INGESTION_POLICY.cooldown.failureMaxMinutes);

  // a refused cursor (HTTP 400) is the one failure that justifies starting over
  failNext = { status: 400, times: 1 };
  await db.journal.update({ where: { id: j.id }, data: { nextEligibleAt: null } });
  await ingestNextJournal(await getState(), [DEPT_DENTAL]);
  const afterBadCursor = await db.journal.findUnique({ where: { id: j.id } });
  check('a cursor the source rejects (400) is reset, and that is not counted as the source failing', afterBadCursor.fetchCursor === null);

  // the circuit breaker: repeated failures pause the source, the engine does not crash
  await db.ingestionSourceHealth.upsert({ where: { source: 'OpenAlex' }, create: { source: 'OpenAlex' }, update: { consecutiveFailures: 0, pausedUntil: null } });
  failNext = { network: true, times: 1000 };
  for (let k = 0; k < 6; k++) {
    await db.journal.update({ where: { id: j.id }, data: { nextEligibleAt: null, claimedAt: null, claimedBy: null } });
    await ingestNextJournal(await getState(), [DEPT_DENTAL]);
  }
  const health = await db.ingestionSourceHealth.findUnique({ where: { source: 'OpenAlex' } });
  check('after repeated failures the source is paused for a while', !!health?.pausedUntil && health.pausedUntil > new Date(), `failures ${health?.consecutiveFailures}`);
  failNext = null;
  requestLog = [];
  await db.journal.update({ where: { id: j.id }, data: { nextEligibleAt: null } });
  const paused: any = await ingestNextJournal(await getState(), [DEPT_DENTAL]);
  check('while paused no request is made and the pass reports it plainly', requestLog.length === 0 && /paused/i.test(paused.note || ''), paused.note);
  const stillThere = await db.journal.findUnique({ where: { id: j.id } });
  check('the journal was released untouched when the source was paused', stillThere.claimedAt === null);
  check('the pause was audited', !!(await db.ingestionAudit.findFirst({ where: { action: 'SOURCE_PAUSED' } })));
  await db.ingestionSourceHealth.update({ where: { source: 'OpenAlex' }, data: { pausedUntil: null, consecutiveFailures: 0 } });
}

// ═════════════════════════════════════════════════════════════════════════
section('The whole pass: no work is lost when everything is resting, and the status says why');
{
  await setState({ enabled: false });
  const r: any = await runIngestionPass(['Zzz Department Nobody Has'], { force: true, only: 'articles', departments: ['Zzz Department Nobody Has'] });
  check('a pass with nothing to do says so instead of failing', !r.error && /no journal to fetch/i.test(r.note || ''), r.note);
  const st = await getState();
  check('the pass counted as a success for engine health', !!st.lastSuccessAt && st.consecutiveFailures === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
