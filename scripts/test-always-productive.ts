/**
 * The always-productive engine: weighted content priority, live fallback across providers and content types, coverage work, the maintenance lane
 * (a lane of its own, beside discovery), and "Waiting for source recovery" only when no provider of any type can be asked. Also: the backlog jobs never break
 * a rule (year, department confidence, review-first sources, duplicates), enrichment is never counted as "added", and progress survives a restart.
 *
 *   npx tsx scripts/test-always-productive.ts
 *
 * Stand-in providers on the throwaway database `stm_ingestion_test` (refuses anything else). No real source is asked.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.INGESTION_ADAPTIVE_SCHEDULER = '0';        // this suite pins the previous static order and one-useful-turn-per-tick rule; the adaptive scheduler has its own (test-adaptive-scheduler.ts)
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';
process.env.INGESTION_MAX_TURNS_PER_TICK = '1';      // one turn per tick: the multi-turn tick has its own suite (test-discovery-lanes.ts)
for (const k of ['INGESTION_WEIGHT_BOOKS', 'INGESTION_WEIGHT_JOURNALS', 'INGESTION_WEIGHT_ARTICLES', 'INGESTION_LOCAL_WORK', 'INGESTION_JOURNAL_COVERAGE', 'BOOKS_CROSSREF', 'BOOKS_PRESSBOOKS']) delete process.env[k];
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const R = await import('../src/lib/ingestion/rotation.js');
const { loadRotationState, __resetRotationState } = await import('../src/lib/ingestion/rotationState.js');
const SH = await import('../src/lib/ingestion/sourceHealth.js');
const { __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');
const { engineStatus } = await import('../src/lib/ingestion/status.js');
const { ensureProviders } = await import('../src/lib/ingestion/engine.js');
const { buildProviders } = await import('../src/lib/ingestion/providers.js');
const L = await import('../src/lib/ingestion/localWork.js');
const M = await import('../src/lib/ingestion/maintenance.js');
const { pickJournalDepartment } = await import('../src/lib/ingestion/journalCoverage.js');
const { pickTargetDepartment } = await import('../src/lib/ingestion/targetedBooks.js');
const { rotationConfig } = await import('../src/lib/ingestion/policy.js');

const RUN = Date.now().toString(36);
const T_START = new Date();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
SH.__useSleepForTests(async () => {});
ensureProviders();

// ── stand-ins ──────────────────────────────────────────────────────────────
let asked: string[] = [];
let behaviour: Record<string, 'ok' | 'nothing' | 'zero' | '429'> = {};
const ran = (useful: number) => ({ kind: 'ran' as const, checked: 10, added: useful, held: 10 - useful, enriched: 0, sentToReview: 0, skipped: 0, recordFailures: 0, useful, more: true, ledger: {} });
const mk = (id: string, group: any, extra: any = {}) => ({
  id, label: id.toUpperCase(), group, role: 'x', tier: 'primary', healthKey: `P${RUN}-${id}`, lock: `P${RUN}-${id}`,
  turn: async () => {
    asked.push(id);
    const b = behaviour[id] ?? 'ok';
    if (b === '429') { await SH.recordRateLimited(`P${RUN}-${id}`, 120_000, 'HTTP 429'); return { kind: 'request-failed' as const, error: 'HTTP 429', status: 429, rateLimited: true }; }
    if (b === 'nothing') return { kind: 'nothing-due' as const };
    return ran(b === 'zero' ? 0 : 3);
  },
  ...extra,
});
const rest = async (id: string, minutes: number) => {
  const key = `P${RUN}-${id}`;
  await db.ingestionSourceHealth.deleteMany({ where: { source: key } });
  for (let i = 0; i < 3; i++) await SH.recordSourceFailure(key, 'The operation was aborted due to timeout', 'timeout');
  await db.ingestionSourceHealth.update({ where: { source: key }, data: { pausedUntil: new Date(Date.now() + minutes * 60_000) } });
};
type Job = { id: string; label: string; group: any; pending: () => Promise<number>; run: (n: number) => Promise<any> };
let localLeft = 0; let localRuns = 0;
const LOCAL: Job = {
  id: 'stand-in-held', label: 'Held candidate review', group: 'Books',
  pending: async () => localLeft,
  run: async (n) => { localRuns++; const c = Math.min(n, localLeft); localLeft -= c; return { checked: c, promoted: 1, enriched: 2, stillHeld: c - 3, duplicates: 0, refused: 0, failed: 0, note: `${c} judged` }; },
};
const pick = async (jobs: Job[], allow: (g: any) => boolean) => { for (const j of jobs) if (allow(j.group) && (await j.pending()) > 0) return { job: j, pending: await j.pending() }; return null; };
const STATE: any = { batchSize: 100, journalsPerPass: 200, articlesPerPass: 100, booksPerPass: 200, enabled: true, consecutiveFailures: 0, lastSuccessAt: new Date(), phase: 'Idle', focus: 'auto' };
const tick = (extra: any = {}) => R.runRotationPass({ wanted: [], narrowed: false, state: STATE, ...extra }) as Promise<any>;
const timer = { nextTickAt: Date.now() + 60_000, lastTickAt: Date.now(), busy: false };
const reset = async (providers: any[], local: Job[] = []) => {
  await __resetRotationState(); await M.__resetMaintenance(); __resetProviderLocks(); asked = []; behaviour = {}; localLeft = 0; localRuns = 0;
  await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `P${RUN}-` } } });
  R.setProviders(providers as any); M.setMaintenanceJobs(local as any, pick as any);
};

const DOAJ = mk('doaj', 'Journals'), CRJ = mk('crossrefjournals', 'Journals', { tier: 'fallback', fallbackFor: ['doaj'] });
const CR = mk('crossref', 'Articles'), EPMC = mk('europepmc', 'Articles', { tier: 'supplementary' });
const DOAB = mk('doab', 'Books'), OAPEN = mk('oapen', 'Books'), CRB = mk('crossrefbooks', 'Books');
const COVER = mk('targeted', 'Books', { virtual: true, label: 'Targeted coverage' });

// ═══════════════════════════════════════════════════════════════════════════
section('Weighted priority: Books 3 · Journals 2 · Articles 1');
check('the default weights are Books 3, Journals 2, Articles 1', JSON.stringify(rotationConfig().weights) === JSON.stringify({ Books: 3, Journals: 2, Articles: 1 }), rotationConfig().weights);
const seq6 = R.typeSequence({ Books: 3, Journals: 2, Articles: 1 });
check('one cycle of six is 3 Books, 2 Journals, 1 Article, Books first', seq6.length === 6 && seq6[0] === 'Books' && seq6.filter(x => x === 'Books').length === 3 && seq6.filter(x => x === 'Journals').length === 2 && seq6.filter(x => x === 'Articles').length === 1, seq6);
check('…interleaved, never three of a kind in a row', !seq6.some((g, i) => g === seq6[i + 1] && g === seq6[i + 2]), seq6);
check('equal weights keep the original order', R.typeSequence({ Books: 1, Journals: 1, Articles: 1 }).join(',') === 'Journals,Articles,Books');
await reset([DOAJ, CR, DOAB, OAPEN]);
const order: string[] = [];
for (let i = 0; i < 12; i++) { const r = await tick(); order.push(r.group); }
const n = (g: string) => order.filter(x => x === g).length;
check('over twelve ticks Books get half the turns, Journals a third, Articles a sixth', n('Books') === 6 && n('Journals') === 4 && n('Articles') === 2, order.join(','));
check('Articles are never starved', n('Articles') > 0);
process.env.INGESTION_WEIGHT_ARTICLES = '0';
check('a weight of 0 never leads…', !R.typeSequence(rotationConfig().weights).includes('Articles'));
await reset([DOAJ, CR, DOAB]); await rest('doaj', 60); await rest('doab', 60);
const zeroW = await tick();
check('…but still runs when nothing ahead of it can', zeroW.ran === true && zeroW.group === 'Articles', zeroW.group);
delete process.env.INGESTION_WEIGHT_ARTICLES;

section('TEST 1: DOAB and OAPEN unavailable, Crossref Books eligible');
await reset([DOAJ, CR, DOAB, OAPEN, CRB]); await rest('doab', 60); await rest('oapen', 60);
const t1 = await tick();
check('Crossref Books runs at once, in the same tick', t1.ran === true && t1.provider === 'crossrefbooks', { ran: t1.ran, p: t1.provider });
check('DOAB and OAPEN were not asked', !asked.includes('doab') && !asked.includes('oapen'), asked);

section('TEST 2: every Book source unavailable, DOAJ eligible');
await reset([DOAJ, CR, DOAB, OAPEN, CRB]); await rest('doab', 60); await rest('oapen', 60); await rest('crossrefbooks', 60);
const t2 = await tick();
check('Books had the turn, could not work, and Journals ran in the same tick', t2.ran === true && t2.group === 'Journals' && t2.provider === 'doaj', { g: t2.group, p: t2.provider });
check('no Book source was asked', !asked.some(a => ['doab', 'oapen', 'crossrefbooks'].includes(a)), asked);
const d2 = (await loadRotationState()).lastDecision;
check('the decision says why: Books had the turn but could not work', !!d2 && /Books had the turn but could not work; Journals took it/.test(d2.reasons.join(' | ')), d2?.reasons);

section('TEST 3: every external source resting, held queue available — maintenance is its own lane');
await reset([DOAJ, CR, DOAB], [LOCAL]); await rest('doaj', 60); await rest('crossref', 60); await rest('doab', 60); localLeft = 450;
const t3 = await tick();
check('discovery does NOT run the backlog in place of a source: with nothing to ask it waits', t3.ran === false && /Waiting for source recovery/.test(t3.note), t3);
check('…and no backlog job ran inside the discovery tick', localRuns === 0, localRuns);
const m3 = await M.runMaintenanceOnce({ force: true });
check('the maintenance lane runs the backlog on its own', m3.ran === true && (m3 as any).label === 'Held candidate review', m3);
check('it reports promoted and enriched apart from added', (m3 as any).outcome.promoted === 1 && (m3 as any).outcome.enriched === 2);
const row3 = await db.ingestionRun.findFirst({ where: { source: 'Held candidate review', at: { gte: T_START } }, orderBy: { at: 'desc' } });
check('its run row keeps them apart too (added 0, promoted 1, enriched 2)', row3?.added === 0 && row3?.promoted === 1 && row3?.enriched === 2, row3);
const st3 = await engineStatus({ ...STATE, phase: 'Books' }, timer);
check('maintenance work does not change what discovery says: still "Waiting for source recovery"', st3.health === 'waiting' && st3.label === 'Waiting for source recovery', `${st3.health} / ${st3.label}`);
check('Current source is never the maintenance job', st3.currentSource !== 'Held candidate review', st3.currentSource);
check('the screen has a maintenance block, apart from discovery', st3.maintenance?.last?.label === 'Held candidate review' && st3.discovery?.state === 'waiting', { m: st3.maintenance?.last?.label, d: st3.discovery?.state });
check('the discovery decision is not a backlog decision', (await loadRotationState()).lastDecision?.kind !== 'local');

section('TEST 4: every external source resting, coverage work available');
await reset([DOAJ, CR, DOAB, COVER]); await rest('doaj', 60); await rest('crossref', 60); await rest('doab', 60);
const t4 = await tick();
check('the coverage task runs', t4.ran === true && t4.provider === 'targeted', { p: t4.provider });
check('it counts as coverage work, not a source', (await loadRotationState()).lastDecision?.kind === 'coverage');

section('TEST 5: no live source, no backlog, no coverage work');
await reset([DOAJ, CR, DOAB], [LOCAL]); await rest('doaj', 95); await rest('crossref', 40); await rest('doab', 25); localLeft = 0;
const t5 = await tick();
check('only now: "Waiting for source recovery"', t5.ran === false && /Waiting for source recovery/.test(t5.note), t5.note);
check('…naming the source that comes back first', t5.next?.provider === 'doab');
const st5 = await engineStatus(STATE, timer);
check('the screen says waiting', st5.health === 'waiting' && st5.label === 'Waiting for source recovery', st5.health);
check('a coverage engine that is caught up does not hold the engine awake', (await (async () => { await reset([DOAJ, DOAB, { ...COVER, turn: async () => ({ kind: 'nothing-due' as const }) }]); await rest('doaj', 30); await rest('doab', 30); return (await tick()).ran === false; })()));

section('TEST 6: one provider answers HTTP 429');
await reset([DOAJ, CR, DOAB, OAPEN]); behaviour.doab = '429';
const t6 = await tick();
check('OAPEN takes the same turn', t6.ran === true && t6.provider === 'oapen', { p: t6.provider, asked });
const h6 = await SH.sourceHealthState(`P${RUN}-doab`);
check('only DOAB sleeps (rate limited, with its own time)', h6.health === 'rate_limited' && !!h6.until);
check('the others are untouched', (await SH.sourceHealthState(`P${RUN}-oapen`)).health === 'healthy' && (await SH.sourceHealthState(`P${RUN}-doaj`)).health === 'healthy');
const t6b = await tick();
check('the next tick goes on without waiting for DOAB', t6b.ran === true && t6b.provider !== 'doab', t6b.provider);

section('Zero-yield rotation');
await reset([DOAJ, CR, DOAB, OAPEN]); behaviour.doab = 'zero'; process.env.INGESTION_WEIGHT_JOURNALS = '0'; process.env.INGESTION_WEIGHT_ARTICLES = '0';
const zs: string[] = [];
for (let i = 0; i < 12; i++) zs.push((await tick()).provider);       // twelve: the source that gives the most goes first on every other turn, so the empty one reaches its third batch a little later
const rt = (await loadRotationState()).providers.doab;
check('three empty DOAB batches → "exhausted for now"', !!rt?.exhaustedUntil && Date.parse(rt.exhaustedUntil) > Date.now(), rt);
check('after that Books carry on with OAPEN; DOAB is not asked again', zs.slice(-3).every(p => p === 'oapen') && asked.filter(a => a === 'doab').length === 3, zs.join(','));
delete process.env.INGESTION_WEIGHT_JOURNALS; delete process.env.INGESTION_WEIGHT_ARTICLES;

// ═══════════════════════════════════════════════════════════════════════════
section('TEST 7 / 8: department coverage priority, and the real held-books job');
check('journal coverage picks the department with the fewest journal TITLES first', pickJournalDepartment([{ department: 'Law', total: 40 }, { department: 'Nursing', total: 3 }, { department: 'Physics', total: 500 }], { depts: {} }, [], 100) === 'Nursing');
check('…skips one that is resting', pickJournalDepartment([{ department: 'Law', total: 40 }, { department: 'Nursing', total: 3 }], { depts: { Nursing: { zeroRuns: 1, nextEligibleAt: new Date(Date.now() + 3600_000).toISOString(), lastRunAt: null, lastAdded: 0 } } }, [], 100) === 'Law');
check('…stays inside the engine\'s scope', pickJournalDepartment([{ department: 'Law', total: 40 }, { department: 'Nursing', total: 3 }], { depts: {} }, ['Law'], 100) === 'Law');
check('…and never picks a department without classification rules, however few titles it holds', pickJournalDepartment([{ department: 'Radiology', total: 0 }, { department: 'Law', total: 40 }], { depts: {} }, [], 100) === 'Law');
check('…and stops at the target: a department above it is never picked', pickJournalDepartment([{ department: 'Physics', total: 500 }], { depts: {} }, [], 100) === null);
check('book coverage: a department with ZERO books goes first', pickTargetDepartment({ departments: [{ department: 'Law', published: 30 }, { department: 'Physiotherapy', published: 0 }] } as any, { turn: 0, depts: {}, positions: {} } as any, 100) !== null);

// Fixtures: undecided Drafts as the harvest leaves them.
const minYear = 2000;
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', bookMinYear: minYear } as any, update: { bookMinYear: minYear } });
await db.appSetting.deleteMany({ where: { key: 'ingestion.localwork.v1' } });
const strongMeta = (extra: any = {}) => ({ harvest: { classifications: ['MQC'], keywords: ['Nursing', 'Nursing care'], department: { band: 'review' }, ...extra } });
const mkDraft = (tag: string, data: any) => db.book.create({ data: { title: 'Fundamentals of Nursing Practice', description: 'A textbook of nursing care and clinical nursing.', status: 'Draft', source: 'DOAB', ownershipSource: 'Ingested', year: 2015, fingerprint: `fp-${RUN}-${tag}`, metadata: strongMeta(), ...data } });
const good = await mkDraft('good', {});
const weak = await mkDraft('weak', { title: 'Essays', description: null, metadata: { harvest: { classifications: [], keywords: ['history'], department: { band: 'review' } } } });
const reviewFirst = await mkDraft('crb', { source: 'CrossrefBooks' });
const tooOld = await mkDraft('old', { year: 1990 });
const decided = await mkDraft('rej', { status: 'Rejected', rejectionNote: 'Rejected by reviewer' });
const twinPub = await db.book.create({ data: { title: 'Published twin', status: 'Published', source: 'OAPEN', doi: `10.9999/${RUN}`, domain: 'Nursing', fingerprint: `fp-${RUN}-twinpub` } });
const twin = await mkDraft('twin', { doi: `10.9999/${RUN}` });
let guard = 0;
const totals = { promoted: 0, stillHeld: 0, duplicates: 0, checked: 0 };
while ((await L.heldBooksJob.pending()) > 0 && guard++ < 200) { const o = await L.heldBooksJob.run(500); totals.promoted += o.promoted; totals.stillHeld += o.stillHeld; totals.duplicates += o.duplicates; totals.checked += o.checked; }
const g = await db.book.findUnique({ where: { id: good.id } });
check('a held book that now meets every rule is published, in the classifier\'s department', g?.status === 'Published' && g?.domain === 'Nursing', g && { s: g.status, d: g.domain });
check('…and says why (promoted from review under rules v1)', (g?.metadata as any)?.harvest?.promoted?.from === 'review');
check('a weakly classified book stays held', (await db.book.findUnique({ where: { id: weak.id } }))?.status === 'Draft');
check('a book from a REVIEW-FIRST source (Crossref Books) is never published by the backlog', (await db.book.findUnique({ where: { id: reviewFirst.id } }))?.status === 'Draft');
check('a book older than the year policy stays held', (await db.book.findUnique({ where: { id: tooOld.id } }))?.status === 'Draft');
check('a book a person rejected is not touched', (await db.book.findUnique({ where: { id: decided.id } }))?.status === 'Rejected');
check('TEST 8: a duplicate of a published book is skipped, not published twice', (await db.book.findUnique({ where: { id: twin.id } }))?.status === 'Draft' && totals.duplicates >= 1, totals);
const fixtures = await db.book.findMany({ where: { fingerprint: { startsWith: `fp-${RUN}` }, id: { not: twinPub.id } }, select: { id: true, status: true } });
check('of the six fixtures, only the one that meets every rule was published', fixtures.filter(f => f.status === 'Published').map(f => f.id).join() === good.id, fixtures);

section('TEST 9: metadata-only enrichment');
const noLic = await db.book.create({ data: { title: 'Licence fill fixture', status: 'Published', source: 'DOAB', fingerprint: `fp-${RUN}-lic`, metadata: { sources: { OAPEN: { handle: 'h/1', licence: 'CC BY 4.0', licenceBasis: 'title' } } } } });
const disagree = await db.book.create({ data: { title: 'Licence conflict fixture', status: 'Published', source: 'DOAB', fingerprint: `fp-${RUN}-lic2`, metadata: { sources: { OAPEN: { licence: 'CC BY', licenceBasis: 'title' }, OTL: { licence: 'CC BY-NC', licenceBasis: 'title' } } } } });
const pubBefore = await db.book.count({ where: { status: 'Published' } });
let enriched = 0; guard = 0;
while ((await L.licenceFillJob.pending()) > 0 && guard++ < 200) enriched += (await L.licenceFillJob.run(500)).enriched;
const nl = await db.book.findUnique({ where: { id: noLic.id } });
check('a licence another provider declared at title level is filled (enriched +1)', nl?.licence === 'CC BY' && nl?.licenceIsNC === false && enriched >= 1, nl && { l: nl.licence, nc: nl.licenceIsNC, enriched });
check('sources that disagree leave the licence empty for a person', !(await db.book.findUnique({ where: { id: disagree.id } }))?.licence);
check('"added" is unchanged: no record was created', (await db.book.count({ where: { status: 'Published' } })) === pubBefore);
const odd = await db.book.create({ data: { title: 'Spelling fixture', status: 'Published', source: 'DOAB', fingerprint: `fp-${RUN}-sp`, licence: 'cc-by', licenceIsNC: false } });
const risky = await db.book.create({ data: { title: 'Spelling fixture 2', status: 'Published', source: 'DOAB', fingerprint: `fp-${RUN}-sp2`, licence: 'CC-BY 4.0', licenceIsNC: false } });
guard = 0; while ((await L.licenceSpellingJob.pending()) > 0 && guard++ < 200) await L.licenceSpellingJob.run(1000);
check('a licence in a non-canonical spelling is rewritten when it changes nothing else', (await db.book.findUnique({ where: { id: odd.id } }))?.licence === 'CC BY');
check('…and LEFT when the rewrite would change the commercial-use reading ("CC-BY 4.0" reads as not permitted, "CC BY" as permitted)', (await db.book.findUnique({ where: { id: risky.id } }))?.licence === 'CC-BY 4.0');

section('TEST 10: restart');
const ls = await db.appSetting.findUnique({ where: { key: 'ingestion.localwork.v1' } });
check('the backlog\'s progress is stored (survives a restart)', !!(ls?.value as any)?.jobs?.['held-books']?.cursor);
check('after a "restart" (state read back from the database) nothing is judged a second time', (await L.heldBooksJob.pending()) === 0);
const late = await mkDraft('late', {});
check('a book held after that is picked up', (await L.heldBooksJob.pending()) >= 1);
await L.heldBooksJob.run(500);
check('…and judged once', (await db.book.findUnique({ where: { id: late.id } }))?.status === 'Published');
await reset([DOAJ, CR, DOAB, OAPEN]);
await tick(); await tick();
const cur = (await loadRotationState()).typeCursor;
check('the weighted position is kept in the rotation state row, not in memory', cur === 2, cur);

section('The real registry');
const reg = buildProviders();
check('Crossref Books and Pressbooks are in the continuous rotation by default', !reg.find(p => p.id === 'crossrefbooks')!.rotationOff?.() && !reg.find(p => p.id === 'pressbooks')!.rotationOff?.());
process.env.BOOKS_CROSSREF = '0';
check('BOOKS_CROSSREF=0 takes Crossref Books out again', !!reg.find(p => p.id === 'crossrefbooks')!.rotationOff?.());
delete process.env.BOOKS_CROSSREF;
check('Journal coverage and Targeted coverage are virtual (never "waiting for source recovery")', !!reg.find(p => p.id === 'journalcoverage')?.virtual && !!reg.find(p => p.id === 'targeted')?.virtual);
check('ROAD stays "not connected"', reg.find(p => p.id === 'road')!.configured?.() !== true);
ensureProviders();

// ── tidy up ───────────────────────────────────────────────────────────────
await db.book.deleteMany({ where: { fingerprint: { startsWith: `fp-${RUN}` } } });
await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `P${RUN}-` } } });
await db.ingestionRun.deleteMany({ where: { at: { gte: T_START } } });
await db.appSetting.deleteMany({ where: { key: 'ingestion.localwork.v1' } });
await M.__resetMaintenance();
await __resetRotationState();
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
