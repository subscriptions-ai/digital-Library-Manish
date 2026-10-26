/**
 * The adaptive scheduler and the throughput work (2026-10-26): scoring, ordering, the drain, reason codes and their audit rows, the engine's wording,
 * cursor advancement on duplicates, Crossref incremental sync, duplicate classification (unchanged / enriched / conflicting), unique-yield metrics, the review
 * queue, and a synthetic benchmark against the previous scheduler.
 *
 *   npx tsx scripts/test-adaptive-scheduler.ts
 *
 * Stand-in providers and a fake Crossref on the throwaway database `stm_ingestion_test` (refuses anything else). No real source is asked.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';
for (const k of ['INGESTION_WEIGHT_BOOKS', 'INGESTION_WEIGHT_JOURNALS', 'INGESTION_WEIGHT_ARTICLES', 'INGESTION_LOCAL_WORK', 'INGESTION_JOURNAL_COVERAGE', 'BOOKS_CROSSREF', 'BOOKS_PRESSBOOKS',
  'INGESTION_MAX_TURNS_PER_TICK', 'INGESTION_PRODUCTIVITY_BIAS', 'INGESTION_MAINTENANCE_SECONDS', 'INGESTION_CURSOR_ZERO_YIELD_TURNS', 'INGESTION_ADAPTIVE_SCHEDULER',
  'INGESTION_TICK_BUDGET_SECONDS', 'INGESTION_DRAIN_MAX_TURNS', 'INGESTION_PROVIDER_MIN_GAP_SECONDS', 'INGESTION_STARVATION_TURNS', 'INGESTION_INCREMENTAL_SYNC', 'INGESTION_MULTI_SOURCE_ENRICHMENT']) delete process.env[k];
Object.assign(process.env, { INGESTION_LOCAL_WORK: '0', INGESTION_JOURNAL_COVERAGE: '0', BOOKS_CROSSREF: '0', BOOKS_PRESSBOOKS: '0', INGESTION_PROVIDER_MIN_GAP_SECONDS: '0' });

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const R = await import('../src/lib/ingestion/rotation.js');
const S = await import('../src/lib/ingestion/scheduler.js');
const { loadRotationState, saveRotationState, __resetRotationState } = await import('../src/lib/ingestion/rotationState.js');
const SH = await import('../src/lib/ingestion/sourceHealth.js');
const { __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');
const { engineSummary, last24Hours } = await import('../src/lib/ingestion/status.js');
const { providerYield } = await import('../src/lib/ingestion/providerYield.js');
const { reviewQueue, __resetReviewCache } = await import('../src/lib/ingestion/reviewQueue.js');
const { reconcileDuplicates, licenceFamily } = await import('../src/lib/ingestion/duplicates.js');
const { visitJournalCrossref } = await import('../src/lib/ingestion/articleTurns.js');
const { finishJournalVisit, closeSweep } = await import('../src/lib/ingestionWorker.js');
const { readCursor, writeCursor } = await import('../src/lib/ingestion/journalCursor.js');
const { createRunWithStats } = await import('../src/lib/ingestion/departmentStats.js');
const M = await import('../src/lib/ingestion/maintenance.js');

const RUN = Date.now().toString(36);
const T_START = new Date();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
SH.__useSleepForTests(async () => {});

// ── stand-ins ──────────────────────────────────────────────────────────────
let asked: string[] = [];
type B = 'ok' | 'zero' | 'nothing' | 'review' | 'fail' | 'ratelimit' | 'dupheavy' | 'good';
let behaviour: Record<string, B> = {};
let turnDelayMs = 0;
const out = (checked: number, added: number, review = 0) => ({ kind: 'ran' as const, checked, added, held: Math.max(0, checked - added - review), enriched: 0, sentToReview: review, skipped: 0, recordFailures: 0, useful: added + review, more: true, ledger: {} });
const mk = (id: string, group: any, extra: any = {}) => ({
  id, label: id.toUpperCase(), group, role: 'x', tier: 'primary', healthKey: `A${RUN}-${id}`, lock: `A${RUN}-${id}`,
  turn: async () => {
    asked.push(id);
    if (turnDelayMs) await new Promise(r => setTimeout(r, turnDelayMs));
    const b = behaviour[id] ?? 'ok';
    if (b === 'nothing') return { kind: 'nothing-due' as const };
    if (b === 'zero') return out(10, 0);
    if (b === 'review') return out(10, 0, 5);
    if (b === 'dupheavy') return out(10, 1);
    if (b === 'good') return out(10, 4);
    if (b === 'fail') { await SH.recordSourceFailure(`A${RUN}-${id}`, 'The operation was aborted due to timeout', 'timeout'); return { kind: 'request-failed' as const, error: 'timeout' }; }
    if (b === 'ratelimit') { await SH.recordRateLimited(`A${RUN}-${id}`, 120_000); return { kind: 'request-failed' as const, error: 'HTTP 429', rateLimited: true }; }
    return out(10, 3);
  },
  ...extra,
});
const rest = async (id: string, minutes: number) => {
  const key = `A${RUN}-${id}`;
  await db.ingestionSourceHealth.deleteMany({ where: { source: key } });
  for (let i = 0; i < 3; i++) await SH.recordSourceFailure(key, 'The operation was aborted due to timeout', 'timeout');
  await db.ingestionSourceHealth.update({ where: { source: key }, data: { pausedUntil: new Date(Date.now() + minutes * 60_000) } });
};
const healthOf = (id: string) => SH.sourceHealthState(`A${RUN}-${id}`);
const STATE: any = { batchSize: 100, journalsPerPass: 200, articlesPerPass: 100, booksPerPass: 200, enabled: true, consecutiveFailures: 0, lastSuccessAt: new Date(), phase: 'Idle', focus: 'auto' };
const tick = (extra: any = {}) => R.runRotationPass({ wanted: [], narrowed: false, state: STATE, ...extra }) as Promise<any>;
const reset = async (providers: any[]) => {
  await __resetRotationState(); await M.__resetMaintenance(); __resetProviderLocks(); __resetReviewCache(); asked = []; behaviour = {}; turnDelayMs = 0;
  await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `A${RUN}-` } } });
  R.setProviders(providers as any); M.setMaintenanceJobs([], (async () => null) as any);
};
const auditRows = async (provider?: string) => (await db.ingestionAudit.findMany({ where: { action: 'SCHEDULER_ROTATION', at: { gte: T_START } }, orderBy: { at: 'asc' } }))
  .filter((r: any) => !provider || r.meta?.provider === provider);

const DOAJ = mk('doaj', 'Journals'), CRJ = mk('crossrefjournals', 'Journals', { tier: 'fallback', fallbackFor: ['doaj'] });
const CR = mk('crossref', 'Articles'), OA = mk('openalex', 'Articles', { tier: 'fallback', fallbackFor: ['crossref'], peerWhenProductive: true });
const EPMC = mk('europepmc', 'Articles', { tier: 'supplementary' });
const DOAB = mk('doab', 'Books'), OAPEN = mk('oapen', 'Books'), OTL = mk('otl', 'Books');

// ═══════════════════════════════════════════════════════════════════════════
section('1. Scoring (pure)');
const base = (o: any = {}) => ({ zeroYield: 0, runs: 5, lastAskedAt: new Date(Date.now() - 3600_000).toISOString(), errorEma: 0, ...o });
const sGood = S.providerScore(base({ publishRateEma: 0.4, newRateEma: 0.4 }), { available: true });
const sDup = S.providerScore(base({ publishRateEma: 0.1, newRateEma: 0.1 }), { available: true });
check('a provider that is 40 % new scores well above one that is 90 % duplicates', sGood > sDup * 2, { sGood, sDup });
check('a provider that cannot be asked scores exactly 0 (unavailable, rate limited, cooling, exhausted all arrive here as available:false)', S.providerScore(base({ publishRateEma: 0.9 }), { available: false }) === 0);
check('a provider never asked is given the benefit of the doubt (so a recovered source is tried)', S.providerScore({ zeroYield: 0 }, { available: true }) > S.providerScore(base({ publishRateEma: 0.02, newRateEma: 0.02 }), { available: true }));
check('recent request errors lower the score', S.providerScore(base({ publishRateEma: 0.4, newRateEma: 0.4, errorEma: 1 }), { available: true }) < sGood);
const reviewHeavy = base({ publishRateEma: 0, newRateEma: 0.3 });
check('backpressure: with a full review queue a source that only feeds it ranks below an empty-queue self (and below a publisher)',
  S.providerScore(reviewHeavy, { available: true, backlogPressure: 1, reviewOnly: true }) < S.providerScore(reviewHeavy, { available: true, backlogPressure: 0, reviewOnly: true })
  && S.providerScore(reviewHeavy, { available: true, backlogPressure: 1, reviewOnly: true }) < sGood);
check('…but a source that publishes is untouched by a full review queue', S.providerScore(base({ publishRateEma: 0.4, newRateEma: 0.4 }), { available: true, backlogPressure: 1 }) === sGood);
{ const rt: any = { zeroYield: 0 }; S.noteTurnFacts(rt, { checked: 100, added: 40, sentToReview: 10, held: 50, enriched: 5, requestFailures: 0 });
  check('unique yield is (added + review) ÷ checked', rt.newRateEma === 0.5 && rt.publishRateEma === 0.4 && rt.dupRateEma === 0.5 && rt.enrichRateEma === 0.05, rt);
  S.noteTurnFacts(rt, { checked: 0, added: 0, sentToReview: 0, held: 0, enriched: 0, requestFailures: 0 });
  check('a turn that looked at nothing leaves the yield rates alone', rt.newRateEma === 0.5 && rt.runs === 2, rt); }
check('quality: highly productive / productive / low yield / caught up / unavailable',
  S.qualityOf({ state: 'ok' }, base({ publishRateEma: 0.3, newRateEma: 0.3 })) === 'highly_productive'
  && S.qualityOf({ state: 'ok' }, base({ publishRateEma: 0.05, newRateEma: 0.12 })) === 'productive'
  && S.qualityOf({ state: 'ok' }, base({ publishRateEma: 0, newRateEma: 0.02 })) === 'low_yield'
  && S.qualityOf({ state: 'exhausted' }, base()) === 'caught_up'
  && S.qualityOf({ state: 'unavailable', kind: 'cooling' }, base()) === 'unavailable'
  && S.qualityOf({ state: 'ok' }, undefined) === null);
{ const o = S.adaptiveGroupOrder({ Books: 0.3, Journals: 0, Articles: 0.9 }, { Books: 3, Journals: 2, Articles: 1 }, {}, 6);
  check('the content type with the most productive provider leads, even at the lowest weight; a type with nothing to run goes last', o.order[0] === 'Articles' && o.order[2] === 'Journals', o.order); }
{ const o = S.adaptiveGroupOrder({ Books: 0.3, Journals: 0, Articles: 0.9 }, { Books: 3, Journals: 2, Articles: 1 }, { Books: 6 }, 6);
  check('starvation guard: a type passed over too long leads next', o.order[0] === 'Books' && o.starved === 'Books', o); }

// ═══════════════════════════════════════════════════════════════════════════
section('2. Scheduling: skip what cannot work, never wait for it');
await reset([DOAJ, CR, DOAB, OAPEN, OTL]); await rest('doab', 60); await rest('oapen', 60); await rest('otl', 60);
let r = await tick();
check('Books unavailable → the very first turn goes to a healthy type (no wait for the next minute)', r.ran === true && r.group !== 'Books', r.group);
check('Books providers were never asked', !asked.some(x => ['doab', 'oapen', 'otl'].includes(x)), asked);

await reset([DOAJ, CR, DOAB]);
{ const s = await loadRotationState(); s.providers.doaj = { zeroYield: 0, exhaustedUntil: new Date(Date.now() + 3600_000).toISOString() }; await saveRotationState(s); }
for (let i = 0; i < 4; i++) await tick();
check('exhausted Journals consume no turns', !asked.includes('doaj') && asked.length > 0, asked);

await reset([DOAJ, CR, DOAB]); await rest('doaj', 60); await rest('doab', 60);
r = await tick();
check('one healthy provider prevents global waiting: it runs', r.ran === true && r.provider === 'crossref', r.provider);
{ const rs = await R.rotationStatus(); const sum = engineSummary(rs, true);
  check('the engine does NOT say "Waiting for source recovery" while one provider can run', !/Waiting for source recovery\.$/.test(sum.text) && /continue/.test(sum.text), sum.text);
  check('…it says which types are waiting and which continue', /Books waiting for source recovery/.test(sum.text) && /Journals waiting for source recovery/.test(sum.text) && /Articles continue\.$/.test(sum.text), sum.text); }

await reset([DOAJ, CR, DOAB]); await rest('doaj', 60); await rest('crossref', 60); await rest('doab', 60);
{ const rs = await R.rotationStatus(); const sum = engineSummary(rs, true);
  check('with nothing able to run, and the sources down: "Waiting for source recovery."', sum.text === 'Waiting for source recovery.', sum.text); }

await reset([DOAJ, CR, DOAB]);
{ const s = await loadRotationState(); const t = new Date(Date.now() + 3600_000).toISOString(); for (const id of ['doaj', 'crossref', 'doab']) s.providers[id] = { zeroYield: 0, exhaustedUntil: t }; await saveRotationState(s); }
{ const rs = await R.rotationStatus(); const sum = engineSummary(rs, true);
  check('with nothing able to run and every source merely caught up: "Caught up for now."', sum.text === 'Caught up for now.', sum.text); }

await reset([DOAJ, CR, DOAB]);
for (const id of ['doaj', 'crossref', 'doab']) await SH.recordRateLimited(`A${RUN}-${id}`, 120_000);
{ const rs = await R.rotationStatus(); const sum = engineSummary(rs, true);
  check('every source rate limited: "Rate limited until <time>."', /^Rate limited until \d{1,2}:\d{2} [AP]M\.$/.test(sum.text), sum.text); }
check('paused engine says so', engineSummary(await R.rotationStatus(), false).text === 'Paused.');

section('2b. A provider that is due wakes a sleeping engine');
await reset([DOAJ, CR, DOAB]);
for (const id of ['doaj', 'crossref', 'doab']) {
  const key = `A${RUN}-${id}`;
  for (let i = 0; i < 3; i++) await SH.recordSourceFailure(key, 'timeout', 'timeout');
  await db.ingestionSourceHealth.update({ where: { source: key }, data: { pausedUntil: new Date(Date.now() + 1500) } });
}
r = await tick();
check('everything resting: the engine goes to sleep until the first one is due', r.ran === false && !!r.nextAt, r);
const sleptThrough = await tick();
check('a tick before that time does no work', sleptThrough.ran === false && sleptThrough.sleeping === true);
await new Promise(res => setTimeout(res, 1700));
r = await tick();
check('at the due time the very next tick runs it (no manual wake, no restart)', r.ran === true, r);

section('2c. 429 and the third failure rotate at once; a low-yield healthy provider rotates after the threshold');
await reset([DOAB, OAPEN]); behaviour.doab = 'ratelimit';
r = await tick({ only: 'books' });
check('HTTP 429: the same tick goes to the next provider', r.ran === true && r.provider === 'oapen' && r.switchedFrom?.includes('doab'), { p: r.provider, sw: r.switchedFrom });
{ const h = await healthOf('doab'); check('…the 429 is a rest until its time, not a failure count', h.health === 'rate_limited' && !!h.until && h.failures === 0, h); }
await reset([DOAB, OAPEN]); behaviour.doab = 'fail';
const seq: string[] = []; for (let i = 0; i < 3; i++) { const x = await tick({ only: 'books' }); seq.push(`${x.provider}${x.switchedFrom?.length ? '*' : ''}`); }
check('failures 1 and 2 do not rotate; the 3rd does, in the same tick', asked.filter(x => x === 'doab').length === 3 && seq[2] === 'oapen*', { seq, asked });
await reset([DOAB, OAPEN]); behaviour.doab = 'zero'; behaviour.oapen = 'ok';
for (let i = 0; i < 8; i++) await tick({ only: 'books' });
{ const s = await loadRotationState(); const h = await healthOf('doab');
  check('a healthy provider with nothing new is "exhausted for now" after 3 empty batches (not failed)', !!s.providers.doab?.exhaustedUntil && h.health === 'healthy' && h.failures === 0, { e: s.providers.doab?.exhaustedUntil, h: h.health });
  check('…and rotation went on to the other provider', asked.filter(x => x === 'oapen').length >= 4, asked); }

// ═══════════════════════════════════════════════════════════════════════════
section('3. The adaptive order and the drain');
await reset([DOAJ, CR, DOAB]);
{ const s = await loadRotationState();
  s.providers.crossref = { zeroYield: 0, runs: 6, publishRateEma: 0.45, newRateEma: 0.45, lastAskedAt: new Date(Date.now() - 3600_000).toISOString() };
  s.providers.doab = { zeroYield: 0, runs: 6, publishRateEma: 0.02, newRateEma: 0.02, lastAskedAt: new Date(Date.now() - 3600_000).toISOString() };
  await saveRotationState(s); }
r = await tick();
check('with Articles clearly more productive than Books, Articles lead although Books carry the higher configured weight', r.turns?.[0]?.group === 'Articles', r.turns?.map((t: any) => t.group));
{ const codes = (await loadRotationState()).lastDecision?.codes || [];
  check('the decision carries structured reason codes (<PROVIDER>_SELECTED_… / _SKIPPED_…)', codes.length > 0 && codes.every((c: string) => /^[A-Z_]+_(SELECTED|SKIPPED)_[A-Z_]+$/.test(c)), codes); }

await reset([DOAJ, CR, DOAB]);
r = await tick();
check('the drain keeps working after a useful turn: one tick takes several turns', r.turns.length >= 3, r.turns.length);
check('…and every content type got a turn', new Set(r.turns.map((t: any) => t.group)).size === 3, r.turns.map((t: any) => t.group));

process.env.INGESTION_DRAIN_MAX_TURNS = '2'; await reset([DOAJ, CR, DOAB]);
r = await tick(); check('INGESTION_DRAIN_MAX_TURNS bounds the tick', r.turns.length === 2, r.turns.length);
delete process.env.INGESTION_DRAIN_MAX_TURNS;

process.env.INGESTION_PROVIDER_MIN_GAP_SECONDS = '60'; await reset([CR, OA, DOAB]); behaviour.openalex = 'ok';
r = await tick();
{ const per = new Map<string, number>(); for (const a of asked) per.set(a, (per.get(a) || 0) + 1);
  check('the per-provider minimum gap: no provider is asked twice in one tick', [...per.values()].every(n => n === 1), asked); }
process.env.INGESTION_PROVIDER_MIN_GAP_SECONDS = '0';

process.env.INGESTION_TICK_BUDGET_SECONDS = '5'; await reset([DOAJ, CR, DOAB]); turnDelayMs = 3200;
r = await tick();
check('the tick budget: no new turn starts once the time is spent (a turn under way is never cut)', r.turns.length === 2, r.turns.length);
delete process.env.INGESTION_TICK_BUDGET_SECONDS; turnDelayMs = 0;

process.env.INGESTION_ADAPTIVE_SCHEDULER = '0'; await reset([DOAJ, CR, DOAB]);
r = await tick();
check('INGESTION_ADAPTIVE_SCHEDULER=0 is the previous behaviour: the tick ends at the first useful turn', r.turns.length === 1, r.turns.length);
delete process.env.INGESTION_ADAPTIVE_SCHEDULER;

await reset([DOAJ, CR, DOAB]); behaviour.doaj = 'zero'; behaviour.crossref = 'zero'; behaviour.doab = 'zero';
r = await tick();
check('a run of empty turns ends the tick (maxTurnsPerTick consecutive), so the drain cannot spin', r.turns.length <= 3, r.turns.length);

section('3b. Review-only providers do not block productive ones');
await reset([DOAB, OAPEN, mk('crossrefbooks', 'Books', { reviewOnly: true })]); behaviour.crossrefbooks = 'review'; behaviour.doab = 'good'; behaviour.oapen = 'zero';
for (let i = 0; i < 6; i++) await tick({ only: 'books' });
{ const s = await loadRotationState();
  check('the review-only source never raises its published average', (s.providers.crossrefbooks?.addedEma ?? 0) === 0 && (s.providers.doab?.addedEma ?? 0) > 0, s.providers); }
check('the productive source kept getting turns', asked.filter(x => x === 'doab').length >= 3, asked);

// ═══════════════════════════════════════════════════════════════════════════
section('4. Reason codes, and audit rows only when something changes');
await reset([DOAJ, CR, DOAB, OAPEN]); await rest('doab', 60);
const before = (await auditRows('doab')).length;
for (let i = 0; i < 6; i++) await tick();
const rows = (await auditRows('doab')).slice(before);
check('a provider that starts resting is recorded once, however many ticks it rests through', rows.length === 1 && /^DOAB_SKIPPED_(COOLDOWN|UNAVAILABLE)$/.test(rows[0].meta.code), rows.map((x: any) => x.meta));
check('the audit row names the provider and a code and carries no secret', rows[0] && rows[0].meta.provider === 'doab' && !/token|key|secret|authorization/i.test(JSON.stringify(rows[0].meta)));
await db.ingestionSourceHealth.deleteMany({ where: { source: `A${RUN}-doab` } });
for (let i = 0; i < 4; i++) await tick();
const rows2 = (await auditRows('doab')).slice(before);
check('when it comes back, one RECOVERED row follows', rows2.length === 2 && rows2[1].meta.code === 'DOAB_RECOVERED', rows2.map((x: any) => x.meta?.code));
{ const n = (await auditRows()).length; for (let i = 0; i < 4; i++) await tick(); check('and ticks with nothing new to say write nothing', (await auditRows()).length === n); }

await reset([CR, OA]); await rest('crossref', 60);
await tick();
check('a fallback taking over is recorded as such', (await auditRows('openalex')).some((x: any) => x.meta.code === 'OPENALEX_SELECTED_FALLBACK'), (await auditRows('openalex')).map((x: any) => x.meta.code));

// ═══════════════════════════════════════════════════════════════════════════
section('5. Cursors advance on duplicates; providers keep their own places');
let jN = 0; const jPrefix = String(1000 + (parseInt(RUN, 36) % 8000));
const mkJournal = (extra: any = {}) => db.journal.create({ data: { title: `Test journal ${RUN}`, issn: `${jPrefix}-${String(++jN).padStart(3, '0')}X`, status: 'Accepted', rightsBasis: 'DOAJ declaration', domain: 'Computer Science', licenceIsNC: false, ...extra } });
const createdJournals: string[] = [];
{
  const j1 = await mkJournal(); createdJournals.push(j1.id);
  await finishJournalVisit(j1, 0, true, { added: 0, needsReview: 0, next: '100', provider: 'crossref' });
  const a = await db.journal.findUnique({ where: { id: j1.id } });
  check('a page that was ALL duplicates (nothing added) still saves the next cursor', readCursor(a.fetchCursor, 'crossref') === '100', a.fetchCursor);
  await finishJournalVisit(a, 0, true, { added: 5, needsReview: 0, next: '200', provider: 'crossref' });
  const b = await db.journal.findUnique({ where: { id: j1.id } });
  check('a partly-duplicate page (5 added) advances it too', readCursor(b.fetchCursor, 'crossref') === '200', b.fetchCursor);
  const again = await db.journal.findUnique({ where: { id: j1.id } });
  check('after a restart (a fresh read of the row) the cursor is where it was left', readCursor(again.fetchCursor, 'crossref') === '200');
  await finishJournalVisit(again, 0, true, { added: 0, needsReview: 0, next: 'CURSOR-A', provider: 'openalex' });
  const c = await db.journal.findUnique({ where: { id: j1.id } });
  check('another provider finishing (OpenAlex) does not move Crossref\'s place', readCursor(c.fetchCursor, 'crossref') === '200' && readCursor(c.fetchCursor, 'openalex') === 'CURSOR-A', c.fetchCursor);
  await finishJournalVisit(c, 0, true, { added: 0, needsReview: 0, next: '300', provider: 'crossref' });
  const d = await db.journal.findUnique({ where: { id: j1.id } });
  check('…and Crossref moving does not move OpenAlex\'s', readCursor(d.fetchCursor, 'openalex') === 'CURSOR-A' && readCursor(d.fetchCursor, 'crossref') === '300', d.fetchCursor);
}
{
  const sw = await db.departmentSweep.create({ data: { department: `T-${RUN}`, source: `S${RUN}`, term: 'x', position: 3 } });
  await closeSweep(sw, { seen: 100, accepted: 0, rejected: 0 }, 4, true);
  const a = await db.departmentSweep.findUnique({ where: { id: sw.id } });
  check('a sweep page with nothing accepted (a full page of what is held) advances the sweep position', a.position === 4 && a.exhaustedAt === null, { p: a.position });
  await db.departmentSweep.delete({ where: { id: sw.id } });
}

// ═══════════════════════════════════════════════════════════════════════════
section('6. Crossref incremental sync (fake Crossref)');
const urls: string[] = [];
let queue: any[][] = [];
SH.__useFetchForTests((async (url: string) => {
  const u = new URL(url);
  if (u.hostname !== 'api.crossref.org') return new Response('not in this test', { status: 404 });
  urls.push(url);
  const items = queue.shift() ?? [];
  return new Response(JSON.stringify({ status: 'ok', message: { items } }), { status: 200 });
}) as any);
let doiN = 0;
const item = (issn: string, o: any = {}) => ({ DOI: `10.9999/t${RUN}.${++doiN}`, title: [`Article ${doiN} ${RUN}`], author: [{ given: 'A', family: 'B' }], issued: { 'date-parts': [[2024]] }, ISSN: [issn], volume: '3', issue: '2', publisher: 'P', subject: ['S'], type: 'journal-article', ...o });
const cstate: any = { articleMinYear: 2020, batchSize: 10 };
const today = new Date().toISOString().slice(0, 10), yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const jx = await mkJournal(); createdJournals.push(jx.id);
queue = [[item(jx.issn), item(jx.issn), item(jx.issn)]];
let v = await visitJournalCrossref(jx, cstate, 0, true, false, 10);
let jr = await db.journal.findUnique({ where: { id: jx.id } });
check('first walk (no baseline): no from-index-date in the request', !/from-index-date/.test(decodeURIComponent(urls[0])), urls[0]);
check('…3 articles were added', v.added === 3, v);
check('…and the walk ended, so the baseline is yesterday|year and no offset is kept', readCursor(jr.fetchCursor, 'crossrefSince') === `${yday}|2020` && readCursor(jr.fetchCursor, 'crossref') === null && readCursor(jr.fetchCursor, 'crossrefWalk') === null, jr.fetchCursor);

queue = [[]];
v = await visitJournalCrossref(jr, cstate, 0, true, false, 10);
check('the next visit asks only for what Crossref indexed since the baseline', new RegExp(`from-index-date:${yday}`).test(decodeURIComponent(urls[1])), decodeURIComponent(urls[1]));
jr = await db.journal.findUnique({ where: { id: jx.id } });
check('…nothing new: the journal rests again, the baseline stays valid', v.checked === 0 && readCursor(jr.fetchCursor, 'crossrefSince') === `${yday}|2020`, jr.fetchCursor);

queue = [Array.from({ length: 10 }, () => item(jx.issn))];
v = await visitJournalCrossref(jr, cstate, 0, true, false, 10);
jr = await db.journal.findUnique({ where: { id: jx.id } });
check('a full page of changes: the walk goes on from the next offset, keeping the baseline and remembering the day the walk began', readCursor(jr.fetchCursor, 'crossref') === '10' && readCursor(jr.fetchCursor, 'crossrefWalk') === today && readCursor(jr.fetchCursor, 'crossrefSince') === `${yday}|2020`, jr.fetchCursor);
queue = [[item(jx.issn)]];
v = await visitJournalCrossref(jr, cstate, 0, true, false, 10);
check('…the page that continues the walk uses the SAME baseline and offset', /from-index-date:/.test(decodeURIComponent(urls[3])) && /offset=10/.test(urls[3]) && new RegExp(`from-index-date:${yday}`).test(decodeURIComponent(urls[3])), urls[3]);
jr = await db.journal.findUnique({ where: { id: jx.id } });
check('…and when that walk ends the baseline moves to the day it BEGAN (minus one), not the day it ended', readCursor(jr.fetchCursor, 'crossrefSince') === `${yday}|2020` && readCursor(jr.fetchCursor, 'crossrefWalk') === null, jr.fetchCursor);

// a baseline from a different year policy is not trusted
await db.journal.update({ where: { id: jx.id }, data: { fetchCursor: writeCursor(null, 'crossrefSince', `${yday}|2015`) } });
jr = await db.journal.findUnique({ where: { id: jx.id } }); queue = [[]];
await visitJournalCrossref(jr, cstate, 0, true, false, 10);
check('a baseline recorded under a different article year is ignored (the whole window is read again)', !/from-index-date/.test(decodeURIComponent(urls[urls.length - 1])), urls[urls.length - 1]);

// a walk begun before this existed has no recorded day: it earns no baseline
await db.journal.update({ where: { id: jx.id }, data: { fetchCursor: writeCursor(null, 'crossref', '10') } });
jr = await db.journal.findUnique({ where: { id: jx.id } }); queue = [[item(jx.issn)]];
await visitJournalCrossref(jr, cstate, 0, true, false, 10);
jr = await db.journal.findUnique({ where: { id: jx.id } });
check('a walk begun before incremental sync existed (no recorded start) finishes without a baseline, so nothing it may have missed is hidden', readCursor(jr.fetchCursor, 'crossrefSince') === null, jr.fetchCursor);

// a journal that ends "full" forgets the baseline
const jf = await mkJournal(); createdJournals.push(jf.id);
await db.journal.update({ where: { id: jf.id }, data: { fetchCursor: writeCursor(null, 'crossrefSince', `${yday}|2020`) } });
const jfr = await db.journal.findUnique({ where: { id: jf.id } });
queue = [[item(jf.issn), item(jf.issn), item(jf.issn)]];
v = await visitJournalCrossref(jfr, cstate, 3, true, false, 10);
const jfa = await db.journal.findUnique({ where: { id: jf.id } });
check('a journal that reaches its article limit forgets the baseline (anything left for later must not be hidden)', jfa.lastIngestionStatus === 'full' && readCursor(jfa.fetchCursor, 'crossrefSince') === null, { s: jfa.lastIngestionStatus, c: jfa.fetchCursor });

process.env.INGESTION_INCREMENTAL_SYNC = '0';
const jo = await mkJournal(); createdJournals.push(jo.id);
await db.journal.update({ where: { id: jo.id }, data: { fetchCursor: writeCursor(null, 'crossrefSince', `${yday}|2020`) } });
queue = [[]]; await visitJournalCrossref(await db.journal.findUnique({ where: { id: jo.id } }) as any, cstate, 0, true, false, 10);
check('INGESTION_INCREMENTAL_SYNC=0 asks for the whole window as before', !/from-index-date/.test(decodeURIComponent(urls[urls.length - 1])));
delete process.env.INGESTION_INCREMENTAL_SYNC;

// ═══════════════════════════════════════════════════════════════════════════
section('7. Duplicates: unchanged / enriched / conflicting');
check('licence families ignore version and spelling', licenceFamily('CC BY 4.0') === licenceFamily('https://creativecommons.org/licenses/by/3.0/') && licenceFamily('cc-by') === 'ccby' && licenceFamily('CC BY-NC 4.0') !== licenceFamily('CC BY 4.0'));
const mkArticle = (o: any) => db.article.create({ data: { title: `Held ${RUN} ${Math.random()}`, status: 'Published', source: 'Crossref', ownershipSource: 'Ingested', accessStatus: 'LinkOnly', accessType: 'OpenAccess', ...o } });
const created: string[] = [];
{
  const a1 = await mkArticle({ doi: `10.9999/e${RUN}.1`, volume: null, issue: '4', subject: null, authors: 'A. Author', licence: 'CC BY', pdfUrl: 'https://example.org/a.pdf' }); created.push(a1.id);
  const d1 = await reconcileDuplicates([{ heldId: a1.id, incoming: { volume: '12', issue: '9', subject: 'Physics', authors: 'Someone Else', licence: 'CC BY 4.0', doi: `10.9999/e${RUN}.1` } }]);
  const a1b = await db.article.findUnique({ where: { id: a1.id } });
  check('a duplicate that fills EMPTY fields is counted as enriched', d1.enriched === 1 && d1.conflicting === 0 && d1.unchanged === 0, d1);
  check('…only the empty fields were written (volume, subject); issue and authors, which had values, were not replaced', a1b.volume === '12' && a1b.subject === 'Physics' && a1b.issue === '4' && a1b.authors === 'A. Author', a1b);
  check('…and licence, file link, access and status are exactly as they were', a1b.licence === 'CC BY' && a1b.pdfUrl === 'https://example.org/a.pdf' && a1b.accessStatus === 'LinkOnly' && a1b.status === 'Published');

  const a2 = await mkArticle({ doi: `10.9999/e${RUN}.2`, volume: null, licence: 'CC BY' }); created.push(a2.id);
  const d2 = await reconcileDuplicates([{ heldId: a2.id, incoming: { volume: '5', licence: 'CC BY-NC' } }]);
  const a2b = await db.article.findUnique({ where: { id: a2.id } });
  check('a duplicate whose licence disagrees is conflicting', d2.conflicting === 1 && d2.enriched === 0, d2);
  check('…the held record is not touched at all (not even its empty volume), and the known licence is not overwritten', a2b.volume === null && a2b.licence === 'CC BY', a2b);

  const a3 = await mkArticle({ doi: `10.9999/e${RUN}.3` }); created.push(a3.id);
  const d3 = await reconcileDuplicates([{ heldId: a3.id, incoming: { doi: `10.9999/OTHER${RUN}` } }]);
  check('a different DOI on the same held record is conflicting', d3.conflicting === 1, d3);

  const a4 = await mkArticle({ doi: `10.9999/e${RUN}.4`, volume: '1', issue: '1', subject: 'S', authors: 'X', publisherName: 'P', journalName: 'J', journalIssn: '1234-5678' }); created.push(a4.id);
  const d4 = await reconcileDuplicates([{ heldId: a4.id, incoming: { volume: '2', issue: '2', subject: 'T', authors: 'Y' } }]);
  check('weaker or different-but-not-empty data changes nothing: unchanged', d4.unchanged === 1 && d4.enriched === 0 && d4.conflicting === 0, d4);

  const a5 = await mkArticle({ doi: `10.9999/e${RUN}.5`, volume: null }); created.push(a5.id);
  const d5 = await reconcileDuplicates([{ heldId: a5.id, incoming: { volume: '7' } }, { heldId: a5.id, incoming: { volume: '8' } }]);
  check('the same held record met twice in a batch is one duplicate of it (the first fills, the repeat is unchanged)', d5.enriched === 1 && d5.unchanged === 1, d5);

  process.env.INGESTION_MULTI_SOURCE_ENRICHMENT = '0';
  const a6 = await mkArticle({ doi: `10.9999/e${RUN}.6`, volume: null }); created.push(a6.id);
  const d6 = await reconcileDuplicates([{ heldId: a6.id, incoming: { volume: '7' } }]);
  check('INGESTION_MULTI_SOURCE_ENRICHMENT=0 writes nothing', d6.enriched === 0 && (await db.article.findUnique({ where: { id: a6.id } })).volume === null, d6);
  delete process.env.INGESTION_MULTI_SOURCE_ENRICHMENT;

  // the whole pipeline: a duplicate from another source arriving through the Crossref visit
  const jd = await mkJournal(); createdJournals.push(jd.id);
  const doi = `10.9999/p${RUN}.1`;
  const held = await mkArticle({ doi, fingerprint: `doi:${doi}`, volume: null, journalId: jd.id }); created.push(held.id);
  queue = [[item(jd.issn, { DOI: doi, volume: '33' })]];
  const vv = await visitJournalCrossref(jd, cstate, 0, true, false, 10);
  const hb = await db.article.findUnique({ where: { id: held.id } });
  check('through a real Crossref visit: the record is a duplicate (not added), it is enriched, and the visit reports it', vv.added === 0 && vv.skippedHeld === 1 && vv.enriched === 1 && hb.volume === '33', { vv, vol: hb.volume });
}

// ═══════════════════════════════════════════════════════════════════════════
section('8. Metrics: yield, failures, and events versus holdings');
{
  const SRC = `YieldTest ${RUN}`;
  await createRunWithStats({ phase: 'Articles', source: SRC, checked: 100, added: 10, needsReview: 5, skippedHeld: 80, enriched: 8, duplicateConflicting: 2 }, null);
  await createRunWithStats({ phase: 'Articles', source: SRC, checked: 0, added: 4, skippedHeld: 0 }, null);                  // an older-style row: cannot say how much it looked at
  await createRunWithStats({ phase: 'Articles', source: SRC, error: 'Provider request failed — timeout', note: 'x' }, null);
  await createRunWithStats({ phase: 'Articles', source: SRC, checked: 10, added: 0, skippedFailed: 3, error: 'write failed' }, null);
  await createRunWithStats({ phase: 'Articles', source: SRC, checked: 50, added: 50, note: 'Backlog · x' }, null);            // maintenance: not discovery
  const y = await providerYield(24);
  const p = y.providers.find((x: any) => x.source === SRC)!;
  check('unique yield = (added + review) ÷ checked over the runs that recorded checked', p.uniqueYieldPct === Math.round(((15) / 110) * 1000) / 10, p);
  check('enrichment yield = enriched ÷ checked', p.enrichmentYieldPct === Math.round((8 / 110) * 1000) / 10, p);
  check('duplicates split: held 80 = unchanged 70 + enriched 8 + conflicting 2', p.held === 80 && p.duplicateEnriched === 8 && p.duplicateConflicting === 2 && p.duplicateUnchanged === 70, p);
  check('a provider request failure is NOT a failed database write (kept in separate columns)', p.providerFailures === 1 && p.failedWrites === 3, p);
  check('maintenance (Backlog) rows are not counted as discovery', p.newPublished === 14, p);
  const before = await db.article.count();
  const d = await last24Hours();
  check('ingestion events (last 24 h) are a different number from what the catalogue holds', d.added >= 14 && (await db.article.count()) === before && d.checked != null, { added: d.added });
}

// ═══════════════════════════════════════════════════════════════════════════
section('9. Review queue');
{
  const SRC = `RQ${RUN}`;
  const b = await db.book.create({ data: { title: `RQ book ${RUN}`, status: 'Draft', ownershipSource: 'Ingested', source: SRC } });
  const a = await db.article.create({ data: { title: `RQ article ${RUN}`, status: 'Draft', ownershipSource: 'Ingested', source: SRC } });
  const pub = await db.article.create({ data: { title: `RQ publisher ${RUN}`, status: 'Draft', ownershipSource: 'PublisherSubmitted', source: SRC } });
  const q = await reviewQueue();
  const mine = q.byProvider.filter((x: any) => x.source === SRC);
  check('ingested Drafts are counted by content type and provider; a publisher\'s own submission is not', mine.length === 2 && mine.every((x: any) => x.awaiting === 1), mine);
  check('new today and oldest waiting are reported', q.newToday >= 2 && q.oldestAt != null && q.oldestDays != null);
  check('journals are counted but marked as having no review screen yet', q.byContentType.find((c: any) => c.type === 'Journals')?.reviewable === false);
  await db.book.delete({ where: { id: b.id } }); await db.article.deleteMany({ where: { id: { in: [a.id, pub.id] } } });
}

// ═══════════════════════════════════════════════════════════════════════════
section('10. Synthetic benchmark: the previous scheduler against the adaptive one');
// Books A is 90 % duplicates, Articles B is 40 % new, Journals C is unavailable, Journals D is rate limited. Same stand-ins, same number of timer ticks.
const BENCH_TICKS = 40;
const bench = async (label: string) => {
  const A = mk('doab', 'Books'), Bp = mk('crossref', 'Articles'), C = mk('doaj', 'Journals'), D = mk('crossrefjournals', 'Journals', { tier: 'fallback', fallbackFor: ['doaj'] });
  await reset([A, Bp, C, D]); behaviour.doab = 'dupheavy'; behaviour.crossref = 'good';
  await rest('doaj', 600); await SH.recordRateLimited(`A${RUN}-crossrefjournals`, 600_000);
  let checked = 0, added = 0, dup = 0, idle = 0, turns = 0, forB = 0;
  const t0 = Date.now();
  for (let i = 0; i < BENCH_TICKS; i++) {
    const x = await tick();
    if (!x.ran) { idle++; continue; }
    for (const t of x.turns) { turns++; checked += t.checked; added += t.added; dup += t.held; if (t.provider === 'crossref') forB++; }
  }
  const cp = (await loadRotationState()).providers;
  console.log(`  ${label.padEnd(10)} ticks ${BENCH_TICKS} · turns ${turns} · checked ${checked} · new ${added} · duplicates ${dup} · idle ticks ${idle} · turns to the 40 %-new source ${forB} (${Math.round(100 * forB / Math.max(1, turns))}%) · ${Date.now() - t0} ms`);
  return { checked, added, dup, idle, turns, forB, askedUnavailable: asked.some(x => x === 'doaj' || x === 'crossrefjournals'), cp };
};
process.env.INGESTION_ADAPTIVE_SCHEDULER = '0'; Object.assign(process.env, { INGESTION_MAX_TURNS_PER_TICK: '1' });
const legacy = await bench('previous');
delete process.env.INGESTION_ADAPTIVE_SCHEDULER; delete process.env.INGESTION_MAX_TURNS_PER_TICK;
const adaptive = await bench('adaptive');
check('neither scheduler ever asked the unavailable or rate-limited providers', !legacy.askedUnavailable && !adaptive.askedUnavailable);
check('the adaptive scheduler gives the 40 %-new source far more of the turns', adaptive.forB / adaptive.turns > legacy.forB / legacy.turns + 0.25, { legacy: legacy.forB / legacy.turns, adaptive: adaptive.forB / adaptive.turns });
console.log(`  new records per turn: previous ${(legacy.added / legacy.turns).toFixed(2)} · adaptive ${(adaptive.added / adaptive.turns).toFixed(2)} (the drain's extra turns are instantaneous stand-ins here; against real sources a tick is bounded by INGESTION_TICK_BUDGET_SECONDS, so compare the per-turn figure)`);
check('each turn is worth more: new records per turn at least doubles, because the productive source gets the turns', adaptive.added / adaptive.turns >= 2 * (legacy.added / legacy.turns), { legacy: legacy.added / legacy.turns, adaptive: adaptive.added / adaptive.turns });
check('and finds several times more new records in the same number of ticks', adaptive.added >= legacy.added * 4, { legacy: legacy.added, adaptive: adaptive.added });
check('with no tick spent idle in either case (the dead types cost nothing)', legacy.idle === 0 && adaptive.idle === 0, { l: legacy.idle, a: adaptive.idle });
check('checkpoints are untouched by the comparison: no provider\'s stored place was invented', Object.values(adaptive.cp).every((p: any) => p.position === undefined || p.position === null));

// ── clean up what this suite created ──────────────────────────────────────
SH.__useFetchForTests(null);
await db.article.deleteMany({ where: { OR: [{ id: { in: created } }, { journalId: { in: createdJournals } }, { title: { contains: RUN } }] } });
await db.journal.deleteMany({ where: { id: { in: createdJournals } } });
await db.ingestionRun.deleteMany({ where: { OR: [{ source: { contains: RUN } }, { at: { gte: T_START }, source: { in: ['DOAB', 'CROSSREF', 'DOAJ', 'OAPEN', 'OTL', 'OPENALEX', 'EUROPEPMC', 'CROSSREFBOOKS', 'CROSSREFJOURNALS'] } }] } });
await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `A${RUN}-` } } });
await db.ingestionAudit.deleteMany({ where: { action: 'SCHEDULER_ROTATION', at: { gte: T_START } } });
await __resetRotationState();

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
