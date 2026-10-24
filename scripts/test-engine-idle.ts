/**
 * The engine when nothing can be asked: it logs the stretch once, sleeps until the soonest source is due, says which that is, and is never shown
 * as "Needs attention" merely because its sources are resting. Also: the review-backlog rest for review-first Book sources, and where a dropped
 * connection dropped.
 *
 *   npx tsx scripts/test-engine-idle.ts
 *
 * Stand-in providers and a fake network, on the throwaway database `stm_ingestion_test` (refuses anything else). No real source is asked.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');

// This suite tests idling and sleeping under the ORIGINAL fair rotation (Journals → Articles → Books, no coverage engine, no local backlog). Weighted
// priority, journal coverage, review-only Book sources in the rotation and the local backlog are covered by scripts/test-always-productive.ts.
Object.assign(process.env, { INGESTION_WEIGHT_BOOKS: '1', INGESTION_WEIGHT_JOURNALS: '1', INGESTION_WEIGHT_ARTICLES: '1', INGESTION_LOCAL_WORK: '0', INGESTION_MAX_TURNS_PER_TICK: '1', INGESTION_PRODUCTIVITY_BIAS: '0', INGESTION_JOURNAL_COVERAGE: '0' });
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';
delete process.env.BOOKS_CROSSREF; delete process.env.BOOKS_PRESSBOOKS; delete process.env.BOOKS_REVIEW_BACKLOG_LIMIT;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const R = await import('../src/lib/ingestion/rotation.js');
const { loadRotationState, saveRotationState, __resetRotationState } = await import('../src/lib/ingestion/rotationState.js');
const SH = await import('../src/lib/ingestion/sourceHealth.js');
const { __resetProviderLocks, tryLockProvider, unlockProvider } = await import('../src/lib/ingestion/providerLocks.js');
const { engineStatus } = await import('../src/lib/ingestion/status.js');
const { ensureProviders } = await import('../src/lib/ingestion/engine.js');
const { buildProviders, reviewBacklogLimit } = await import('../src/lib/ingestion/providers.js');

const RUN = Date.now().toString(36);
const T_START = new Date();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
SH.__useSleepForTests(async () => {});

ensureProviders();                   // the real registry is installed once; each test then sets its own stand-ins

// ── stand-ins ──────────────────────────────────────────────────────────────
let asked: string[] = [];
let behaviour: Record<string, 'ok' | 'nothing'> = {};
const mk = (id: string, group: any, extra: any = {}) => ({
  id, label: id.toUpperCase(), group, role: 'x', tier: 'primary', healthKey: `T${RUN}-${id}`, lock: `T${RUN}-${id}`,
  turn: async () => { asked.push(id); return behaviour[id] === 'ok' ? { kind: 'ran' as const, checked: 10, added: 3, held: 7, enriched: 0, sentToReview: 0, skipped: 0, recordFailures: 0, useful: 3, more: true, ledger: {} } : { kind: 'nothing-due' as const }; },
  ...extra,
});
const rest = async (id: string, minutes: number) => {                       // a source resting on its breaker, until `minutes` from now
  const key = `T${RUN}-${id}`;
  await db.ingestionSourceHealth.deleteMany({ where: { source: key } });
  for (let i = 0; i < 3; i++) await SH.recordSourceFailure(key, 'The operation was aborted due to timeout', 'timeout');
  await db.ingestionSourceHealth.update({ where: { source: key }, data: { pausedUntil: new Date(Date.now() + minutes * 60_000) } });
};
const STATE: any = { batchSize: 100, journalsPerPass: 200, articlesPerPass: 100, booksPerPass: 200, enabled: true, consecutiveFailures: 0, lastSuccessAt: new Date(), phase: 'Idle', focus: 'auto' };
const tick = (extra: any = {}) => R.runRotationPass({ wanted: [], narrowed: false, state: STATE, ...extra }) as Promise<any>;
const idleRows = () => db.ingestionRun.count({ where: { phase: 'Idle', at: { gte: T_START } } });
const reset = async () => { await __resetRotationState(); __resetProviderLocks(); asked = []; behaviour = {}; await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `T${RUN}-` } } }); await db.ingestionRun.deleteMany({ where: { phase: 'Idle', at: { gte: T_START } } }); };
const timer = { nextTickAt: Date.now() + 60_000, lastTickAt: Date.now(), busy: false };

const J = mk('doaj', 'Journals'), A = mk('crossref', 'Articles'), B = mk('doab', 'Books'), B2 = mk('nlm', 'Books');
const CHAIN = [J, A, B, B2];

// ═══════════════════════════════════════════════════════════════════════════
section('1. Nothing can be asked: one row, then the engine sleeps');
await reset(); R.setProviders(CHAIN as any);
await rest('doaj', 95); await rest('crossref', 40); await rest('doab', 25); await rest('nlm', 60);
const first = await tick();
check('the first tick says it is waiting for source recovery', first.ran === false && /Waiting for source recovery/.test(first.note), first.note?.slice(0, 160));
check('…and names the next eligible source and the time', /Next eligible source: Books · DOAB/.test(first.note) && /Next attempt: \d/.test(first.note), first.note?.slice(-90));
check('next is the source that comes back FIRST (DOAB, 25 min), not the first in the list', first.next?.provider === 'doab' && first.nextAt === first.next.at);
check('one row was written', (await idleRows()) === 1);
const ingState0 = await db.ingestionState.findUnique({ where: { id: 'singleton' } });
let counted = 0;
const countPass = async () => { counted++; };
const sleeps: any[] = [];
for (let i = 0; i < 8; i++) sleeps.push(await tick({ countPass }));
check('the next eight ticks all sleep', sleeps.every(r => r.sleeping === true), sleeps.map(r => r.sleeping).join(','));
check('…and write no row at all (still exactly one)', (await idleRows()) === 1);
check('…and ask no provider', asked.length === 0);
check('…and are not counted as passes', counted === 0);
check('…and leave the engine state untouched (last run time unchanged)', (await db.ingestionState.findUnique({ where: { id: 'singleton' } }))?.lastRunAt?.getTime() === ingState0?.lastRunAt?.getTime());
check('a sleeping tick answers with the same words', sleeps[0].note === first.note, `${String(first.note).length} vs ${String(sleeps[0].note).length}\n   ${first.note}\n   ${sleeps[0].note}`);

section('2. What wakes it');
const f = await tick({ force: true, countPass });
check('"Run extra pass now" looks at once (not asleep)…', f.sleeping === false && counted === 1);
check('…but says nothing new, so writes no second row', (await idleRows()) === 1);
const settings = await tick({ state: { ...STATE, booksPerPass: 300 } });
check('changing a per-pass setting wakes it', settings.sleeping === false);
check('…and with the same picture still writes no new row', (await idleRows()) === 1);
await R.wakeEngine();
const woken = await tick();
check('wakeEngine() (settings saved, engine resumed) wakes it', woken.sleeping === false);
check('…and still no new row for an unchanged picture', (await idleRows()) === 1);
const s1 = await loadRotationState();
s1.idle!.nextAt = new Date(Date.now() - 1000).toISOString(); await saveRotationState(s1);
const due = await tick();
check('when the time comes it looks again', due.sleeping === false);
await db.ingestionSourceHealth.update({ where: { source: `T${RUN}-doab` }, data: { pausedUntil: new Date(Date.now() - 1000) } });
behaviour.doab = 'ok';
const s2 = await loadRotationState(); s2.idle!.nextAt = new Date(Date.now() - 1000).toISOString(); await saveRotationState(s2);
const back = await tick();
check('a source whose rest is over is asked, and the engine is working again', back.ran === true && back.provider === 'doab', JSON.stringify({ ran: back.ran, p: back.provider }));
check('…and the sleep record is gone', (await loadRotationState()).idle === null);
await rest('doab', 30);
const again = await tick();
check('if it goes quiet again that is a new stretch with its own row', again.ran === false && (await idleRows()) === 2, `${await idleRows()} rows`);

section('3. A source held with no end time is not slept through');
await reset(); R.setProviders(CHAIN as any);
await rest('doaj', 90); await rest('crossref', 90); await rest('nlm', 90);
tryLockProvider(B.lock, 'quick-import');                       // a Quick Import is on DOAB
const held = await tick();
check('with one source busy (no end time) the engine does not claim a time to sleep until', held.nextAt === null, String(held.nextAt));
const held2 = await tick();
check('it looks again at the next tick (cheaply) instead of sleeping…', held2.sleeping === false);
check('…and still logs the stretch once', (await idleRows()) === 1);
unlockProvider(B.lock, 'quick-import');
behaviour.doab = 'ok';
const free = await tick();
check('and the moment the source is free it runs', free.ran === true && free.provider === 'doab');

section('4. Everything exhausted / caught up: the time is the refresh time');
await reset(); R.setProviders(CHAIN as any);
const soon = new Date(Date.now() + 3 * 3600_000).toISOString(), later = new Date(Date.now() + 5 * 3600_000).toISOString();
const st = await loadRotationState();
st.providers = { doaj: { zeroYield: 2, exhaustedUntil: later, refreshAfter: later }, crossref: { zeroYield: 2, exhaustedUntil: later, refreshAfter: later }, doab: { zeroYield: 2, exhaustedUntil: soon, refreshAfter: soon }, nlm: { zeroYield: 2, exhaustedUntil: later, refreshAfter: later } };
await saveRotationState(st);
const caught = await tick();
check('exhausted sources count as resting until their refresh time', caught.ran === false && caught.next?.provider === 'doab' && caught.next.at === soon, JSON.stringify(caught.next));
check('one row, then it sleeps', (await idleRows()) === 1 && (await tick()).sleeping === true);

section('5. The engine status');
await reset(); R.setProviders(CHAIN as any);
await rest('doaj', 95); await rest('crossref', 40); await rest('doab', 25); await rest('nlm', 60);
await tick();
let es: any = await engineStatus({ ...STATE, passCount: 1 }, timer);
check('every source resting reads "Waiting for source recovery" — NOT "Needs attention"', es.health === 'waiting' && es.label === 'Waiting for source recovery', `${es.health} / ${es.label}`);
check('it says what comes next: "Books — <time>"', /^Books — /.test(es.next?.text || '') && es.waiting?.next?.label === 'DOAB', JSON.stringify(es.next));
check('and when it will try', !!es.waiting?.nextAttemptAt);
check('no reason is a failure of the engine', !es.reasons.some((r: string) => /passes in a row|abandoned/.test(r)), es.reasons.join(' | ').slice(0, 200));
es = await engineStatus({ ...STATE, enabled: false }, timer);
check('switched off reads "Paused"', es.health === 'paused' && es.label === 'Paused');
es = await engineStatus({ ...STATE, consecutiveFailures: 5 }, timer);
check('the engine itself failing five passes in a row IS "Needs attention"', es.health === 'attention' && es.label === 'Needs attention', es.health);
await reset(); R.setProviders(CHAIN as any); behaviour = { doaj: 'ok', crossref: 'ok', doab: 'ok', nlm: 'ok' };
await tick();
es = await engineStatus({ ...STATE }, timer);
check('a working engine reads "Running"', es.health === 'running' && es.label === 'Running', es.health);
check('…with nothing to wait for', es.waiting === null);
await reset(); R.setProviders(CHAIN as any); behaviour = { doaj: 'ok' };
await rest('crossref', 40); await rest('doab', 25); await rest('nlm', 60);
await tick();
es = await engineStatus({ ...STATE }, timer);
check('one family resting while another works is still "Running"', es.health === 'running', es.health);

section('6. NLM caught up (zero-yield 3/3) is not a failure');
await reset();
const NLM = mk('nlm', 'Books', { healthKey: `T${RUN}-nlm2`, lock: `T${RUN}-nlm2` });
R.setProviders([NLM] as any);
await db.ingestionSourceHealth.deleteMany({ where: { source: `T${RUN}-nlm2` } });
for (let i = 0; i < 3; i++) await tick({ force: true });
const h = await SH.sourceHealthState(`T${RUN}-nlm2`);
const rs: any = await R.rotationStatus({ state: STATE });
const nlm = rs.providers.find((p: any) => p.id === 'nlm');
check('its health stays Healthy with no failures', h.health === 'healthy' && h.failures === 0 && h.lifetimeFailures === 0, JSON.stringify({ h: h.health, f: h.failures }));
check('it reads "Exhausted for now" and carries a refresh time', nlm.yield === 'exhausted' && nlm.availability.state === 'exhausted' && !!nlm.refreshAfter, JSON.stringify({ y: nlm.yield, r: nlm.refreshAfter }));
check('the refresh time is the one it will be asked again at', nlm.refreshAfter === nlm.availability.until);
const nextCall = asked.length;
await tick({ force: true });
check('it is not asked again before then', asked.length === nextCall);

section('7. A review-first source rests while its books wait for a person');
await reset();
const providers = buildProviders();
const cr = providers.find((p: any) => p.id === 'crossrefbooks')!;
process.env.BOOKS_CROSSREF = '1';
const insertDrafts = async (n: number) => { for (let i = 0; i < n; i++) await db.book.create({ data: { title: `Backlog test ${RUN} ${i}`, status: 'Draft', source: 'CrossrefBooks', sourceRecordId: `10.9/${RUN}.${i}`, ownershipSource: 'Ingested' } as any }); };
check('the default limit is 250 and 0 turns it off', reviewBacklogLimit() === 250 && (process.env.BOOKS_REVIEW_BACKLOG_LIMIT = '0', reviewBacklogLimit() === 0) && (delete process.env.BOOKS_REVIEW_BACKLOG_LIMIT, true));
// The throwaway database may already hold Crossref drafts from a staging run; the limit is set relative to them.
const base = Number((await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "Book" where source = 'CrossrefBooks' and status = 'Draft'`))[0].n);
process.env.BOOKS_REVIEW_BACKLOG_LIMIT = String(base + 3);
await db.$executeRawUnsafe(`delete from "Book" where source = 'CrossrefBooks' and title like 'Backlog test %'`);
await insertDrafts(2);
let a = await R.availability(cr as any, await loadRotationState());
check('below the limit it is available', a.state === 'ok', JSON.stringify(a));
await insertDrafts(1);
a = await R.availability(cr as any, await loadRotationState());
check('at the limit it rests, and says why', a.state === 'unavailable' && new RegExp(`${base + 3} of its books are waiting for review`).test(a.reason || ''), a.reason || '');
check('a backlog rest has no end time — it is not slept through', a.until === null);
await db.$executeRawUnsafe(`update "Book" set status = 'Published' where source = 'CrossrefBooks' and title like 'Backlog test %' and "sourceRecordId" like $1`, `10.9/${RUN}.0`);
a = await R.availability(cr as any, await loadRotationState());
check('as books are reviewed it resumes', a.state === 'ok', JSON.stringify(a));
await db.$executeRawUnsafe(`delete from "Book" where source = 'CrossrefBooks' and title like 'Backlog test %'`);
delete process.env.BOOKS_REVIEW_BACKLOG_LIMIT; delete process.env.BOOKS_CROSSREF;

section('8. A dropped connection says where it dropped; a resting source is not asked');
await reset();
const key = `T${RUN}-reset`;
await db.ingestionSourceHealth.deleteMany({ where: { source: key } });
let calls = 0;
const resetErr = () => Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });
SH.__useFetchForTests(async () => { calls++; throw resetErr(); });
const r1 = await SH.fetchSourceJson('https://example.test/x', { source: key, attempts: 1 });
check('a reset before any reply is named as such', r1.errorKind === 'connection_reset' && /ECONNRESET/.test(r1.error || '') && /before any response/.test(r1.error || ''), r1.error);
SH.__useFetchForTests(async () => { calls++; return new Response(new ReadableStream({ start(c) { c.error(resetErr()); } }), { status: 200 }); });
const r2 = await SH.fetchSourceJson('https://example.test/x', { source: key, attempts: 1, text: true });
check('a reset part-way through the reply says so', r2.errorKind === 'connection_reset' && /while reading the response/.test(r2.error || ''), r2.error);
await db.ingestionSourceHealth.deleteMany({ where: { source: key } });
for (let i = 0; i < 3; i++) await SH.recordSourceFailure(key, 'x', 'connection_reset');
calls = 0; SH.__useFetchForTests(async () => { calls++; throw resetErr(); });
const during = await SH.fetchSourceJson('https://example.test/x', { source: key, attempts: 3 });
check('no request at all while it rests', during.paused === true && calls === 0, `${calls} requests`);
await db.ingestionSourceHealth.update({ where: { source: key }, data: { pausedUntil: new Date(Date.now() - 1000) } });
const probe = await SH.fetchSourceJson('https://example.test/x', { source: key, attempts: 3 });
check('at the retry time exactly ONE request is made (a probe, never three retries)', calls === 1 && probe.ok === false, `${calls} requests`);
const after = await SH.sourceHealthState(key);
check('a failed probe extends the rest', !!after.until && after.until.getTime() > Date.now());
SH.__useFetchForTests(null);

console.log(`\n${pass} passed, ${fail} failed`);
await db.ingestionRun.deleteMany({ where: { phase: 'Idle', at: { gte: T_START } } });
await __resetRotationState();
await db.$disconnect();
process.exit(fail ? 1 : 0);
