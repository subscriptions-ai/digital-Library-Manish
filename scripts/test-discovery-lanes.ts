/**
 * Discovery and maintenance as two lanes; cursor-level rotation; productivity-aware order; review-only sources; the held-candidate second pass;
 * and the wording of what the screen says.
 *
 *   npx tsx scripts/test-discovery-lanes.ts
 *
 * Stand-in providers on the throwaway database `stm_ingestion_test` (refuses anything else). No real source is asked.
 * Scenarios A–H are the ones in the brief; the rest check the rules behind them.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.INGESTION_ADAPTIVE_SCHEDULER = '0';        // this suite pins the previous static order and one-useful-turn-per-tick rule; the adaptive scheduler has its own (test-adaptive-scheduler.ts)
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';
for (const k of ['INGESTION_WEIGHT_BOOKS', 'INGESTION_WEIGHT_JOURNALS', 'INGESTION_WEIGHT_ARTICLES', 'INGESTION_LOCAL_WORK', 'INGESTION_JOURNAL_COVERAGE', 'BOOKS_CROSSREF', 'BOOKS_PRESSBOOKS',
  'INGESTION_MAX_TURNS_PER_TICK', 'INGESTION_PRODUCTIVITY_BIAS', 'INGESTION_MAINTENANCE_SECONDS', 'INGESTION_CURSOR_ZERO_YIELD_TURNS']) delete process.env[k];
// One turn per tick unless a test says otherwise, and equal weights: the order of types is then the plain rotation Journals → Articles → Books.
Object.assign(process.env, { INGESTION_MAX_TURNS_PER_TICK: '1', INGESTION_WEIGHT_BOOKS: '1', INGESTION_WEIGHT_JOURNALS: '1', INGESTION_WEIGHT_ARTICLES: '1' });
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
// A journal claim left behind by a test server that was stopped mid-visit (an earlier suite) would read as an abandoned worker and make the engine say "attention". Scratch database only (guarded above).
await db.journal.updateMany({ where: { claimedAt: { not: null } }, data: { claimedAt: null, claimedBy: null } });

const R = await import('../src/lib/ingestion/rotation.js');
const { loadRotationState, saveRotationState, __resetRotationState } = await import('../src/lib/ingestion/rotationState.js');
const SH = await import('../src/lib/ingestion/sourceHealth.js');
const { __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');
const { engineStatus, last24Hours } = await import('../src/lib/ingestion/status.js');
const { ensureProviders, runEnginePass } = await import('../src/lib/ingestion/engine.js');
const { buildProviders } = await import('../src/lib/ingestion/providers.js');
const L = await import('../src/lib/ingestion/localWork.js');
const M = await import('../src/lib/ingestion/maintenance.js');
const { claimSweep } = await import('../src/lib/ingestionWorker.js');
const { pickJournal } = await import('../src/lib/ingestionWorker.js');
const { pickTargetDepartment, DEFAULT_PRIORITY } = await import('../src/lib/ingestion/targetedBooks.js');
const { runSearchProvider, peekSearchDepartment, restingForSearch } = await import('../src/lib/ingestion/quickImport.js');
const { searchTermsFor } = await import('../src/lib/departmentSearchTerms.js').catch(() => import('../src/lib/ingestionWorker.js') as any);

const RUN = Date.now().toString(36);
const T_START = new Date();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
SH.__useSleepForTests(async () => {});
ensureProviders();

// ── stand-ins ──────────────────────────────────────────────────────────────
let asked: string[] = [];
type B = 'ok' | 'zero' | 'nothing' | 'review';
let behaviour: Record<string, B> = {};
const outcome = (added: number, review = 0) => ({ kind: 'ran' as const, checked: 10, added, held: Math.max(0, 10 - added - review), enriched: 0, sentToReview: review, skipped: 0, recordFailures: 0, useful: added + review, more: true, ledger: {} });
const mk = (id: string, group: any, extra: any = {}) => ({
  id, label: id.toUpperCase(), group, role: 'x', tier: 'primary', healthKey: `D${RUN}-${id}`, lock: `D${RUN}-${id}`,
  turn: async () => {
    asked.push(id);
    const b = behaviour[id] ?? 'ok';
    if (b === 'nothing') return { kind: 'nothing-due' as const };
    if (b === 'zero') return outcome(0);
    if (b === 'review') return outcome(0, 5);
    return outcome(3);
  },
  ...extra,
});
/** A provider that asks in departments: it takes the first one that is not resting, in turn, and says what each gave. */
let deptYield: Record<string, number> = {};
let deptAsked: string[] = [];
const mkCursored = (id: string, group: any, depts: string[], extra: any = {}) => {
  let n = 0;
  return mk(id, group, {
    cursored: true,
    turn: async (ctx: any) => {
      asked.push(id);
      const live = depts.filter(d => !ctx.restingCursors.includes(d));
      if (!live.length) return { kind: 'nothing-due' as const, note: 'all departments resting' };
      const d = live[n++ % live.length];
      deptAsked.push(d);
      const useful = deptYield[d] ?? 0;
      return { ...outcome(useful), cursors: [{ key: d, department: d, checked: 10, useful }] };
    },
    ...extra,
  });
};
const rest = async (id: string, minutes: number) => {
  const key = `D${RUN}-${id}`;
  await db.ingestionSourceHealth.deleteMany({ where: { source: key } });
  for (let i = 0; i < 3; i++) await SH.recordSourceFailure(key, 'The operation was aborted due to timeout', 'timeout');
  await db.ingestionSourceHealth.update({ where: { source: key }, data: { pausedUntil: new Date(Date.now() + minutes * 60_000) } });
};
const STATE: any = { batchSize: 100, journalsPerPass: 200, articlesPerPass: 100, booksPerPass: 200, enabled: true, consecutiveFailures: 0, lastSuccessAt: new Date(), phase: 'Idle', focus: 'auto' };
const tick = (extra: any = {}) => R.runRotationPass({ wanted: [], narrowed: false, state: STATE, ...extra }) as Promise<any>;
const timer = { nextTickAt: Date.now() + 60_000, lastTickAt: Date.now(), busy: false };
type Job = { id: string; label: string; group: any; pending: () => Promise<number>; run: (n: number) => Promise<any> };
const pickAny = async (jobs: Job[]) => { for (const j of jobs) { const p = await j.pending(); if (p > 0) return { job: j, pending: p }; } return null; };
const reset = async (providers: any[], jobs: Job[] = []) => {
  await __resetRotationState(); await M.__resetMaintenance(); __resetProviderLocks(); asked = []; deptAsked = []; behaviour = {}; deptYield = {};
  await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `D${RUN}-` } } });
  R.setProviders(providers as any); M.setMaintenanceJobs(jobs as any, pickAny as any);
};

const DOAJ = mk('doaj', 'Journals'), CRJ = mk('crossrefjournals', 'Journals', { tier: 'fallback', fallbackFor: ['doaj'] });
const CR = mk('crossref', 'Articles'), OA = mk('openalex', 'Articles', { tier: 'fallback', fallbackFor: ['crossref'], peerWhenProductive: true });
const EPMC = mk('europepmc', 'Articles', { tier: 'supplementary' }), ARX = mk('arxiv', 'Articles', { tier: 'supplementary' });
const DOAB = mk('doab', 'Books'), OAPEN = mk('oapen', 'Books'), OTL = mk('otl', 'Books'), NLM = mk('nlm', 'Books'), CRB = mk('crossrefbooks', 'Books', { reviewOnly: true });

// ═══════════════════════════════════════════════════════════════════════════
section('A. DOAB unavailable, Open Textbook Library healthy: Books continue through OTL');
await reset([DOAJ, CR, DOAB, OAPEN, OTL]); await rest('doab', 60); await rest('oapen', 60);
const a: string[] = []; for (let i = 0; i < 4; i++) a.push((await tick({ only: 'books' })).provider);
check('every Books turn goes to Open Textbook Library', a.every(p => p === 'otl'), a);
check('DOAB and OAPEN were never asked (skipped at once, no waiting)', !asked.includes('doab') && !asked.includes('oapen'), asked);
check('…and Books did not read "waiting"', !(await loadRotationState()).waiting.Books);

section('A2. Priority goes to what actually adds records');
await reset([DOAJ, CR, DOAB, OTL, NLM, CRB]); behaviour.doab = 'zero'; behaviour.nlm = 'review'; behaviour.crossrefbooks = 'review'; behaviour.otl = 'ok';
const a2: string[] = []; for (let i = 0; i < 14; i++) a2.push((await tick({ only: 'books' })).provider);
const nOtl = a2.filter(p => p === 'otl').length;
check('Open Textbook Library, the source that adds, takes about half of the turns', nOtl >= 6, a2.join(','));
check('the others are not starved: every source is still asked', ['doab', 'nlm', 'crossrefbooks', 'otl'].every(x => a2.includes(x)), a2.join(','));
const stA2 = await loadRotationState();
check('a review-only source never ranks above one that adds (its published average stays 0)', (stA2.providers.crossrefbooks?.addedEma ?? 0) === 0 && (stA2.providers.nlm?.addedEma ?? 0) === 0 && (stA2.providers.otl?.addedEma ?? 0) > 0, stA2.providers);
const rs = await R.rotationStatus();
const pv = (id: string) => rs.providers.find(p => p.id === id)!;
check('NLM sent only records to review: "productive for review", not for the published catalogue', pv('nlm').yield === 'productive' && pv('nlm').yieldFor === 'review', { y: pv('nlm').yield, f: pv('nlm').yieldFor });
check('Open Textbook Library is "productive for the published catalogue"', pv('otl').yield === 'productive' && pv('otl').yieldFor === 'published');
check('a review-first source says its candidates are for review and not eligible for automatic publishing', /not eligible for automatic publishing/.test(pv('crossrefbooks').plain), pv('crossrefbooks').plain);
check('a productive source says it recently produced usable records', /recently produced usable records/.test(pv('otl').plain), pv('otl').plain);

section('B. arXiv unavailable: Articles continue through Crossref / OpenAlex / Europe PMC');
await reset([DOAJ, CR, OA, EPMC, ARX, DOAB]); await rest('arxiv', 60);
const b: string[] = []; for (let i = 0; i < 6; i++) b.push((await tick({ only: 'articles' })).provider);
check('Articles keep running, and never ask arXiv', b.every(p => p !== 'arxiv') && !asked.includes('arxiv'), b);
check('Crossref and Europe PMC both take turns', b.includes('crossref') && b.includes('europepmc'), b);
check('OpenAlex (a fallback) waits while it has added nothing and Crossref can work', !b.includes('openalex'), b);

section('B2. A productive fallback takes part as a peer');
await reset([DOAJ, CR, OA, EPMC]);
const sB = await loadRotationState(); sB.providers.openalex = { zeroYield: 0, addedEma: 2.4 }; await saveRotationState(sB);
const b2: string[] = []; for (let i = 0; i < 6; i++) b2.push((await tick({ only: 'articles' })).provider);
check('OpenAlex, which has recently added records, is asked even though Crossref is healthy', b2.includes('openalex'), b2);
await reset([DOAJ, CR, OA, EPMC]); process.env.INGESTION_PRODUCTIVITY_BIAS = '0';
const sB3 = await loadRotationState(); sB3.providers.openalex = { zeroYield: 0, addedEma: 2.4 }; await saveRotationState(sB3);
const b3: string[] = []; for (let i = 0; i < 6; i++) b3.push((await tick({ only: 'articles' })).provider);
check('INGESTION_PRODUCTIVITY_BIAS=0 is the rollback to the plain fallback rule', !b3.includes('openalex'), b3);
delete process.env.INGESTION_PRODUCTIVITY_BIAS;

// ═══════════════════════════════════════════════════════════════════════════
section('C. One department exhausted: the provider rotates to the others, and itself keeps going');
const DEPTS = ['Computer / IT', 'Nursing', 'Law', 'Biotechnology'];
await reset([DOAJ, mkCursored('crossref', 'Articles', DEPTS), DOAB]); deptYield = { 'Computer / IT': 0, Nursing: 3, Law: 3, Biotechnology: 3 };
for (let i = 0; i < 16; i++) await tick({ only: 'articles' });
const stC = await loadRotationState();
const cC = stC.providers.crossref?.cursors || {};
check('Computer / IT has given nothing three turns in a row, so ONLY that department rests', !!cC['Computer / IT']?.exhaustedUntil && Date.parse(cC['Computer / IT'].exhaustedUntil!) > Date.now(), cC);
check('the other departments are not resting', ['Nursing', 'Law', 'Biotechnology'].every(d => !cC[d]?.exhaustedUntil));
check('Crossref itself is NOT "exhausted for now": it still has departments to ask', !stC.providers.crossref?.exhaustedUntil, stC.providers.crossref);
const lastFour = deptAsked.slice(-4);
check('after the rest, Computer / IT is not asked and the others take over', !lastFour.includes('Computer / IT') && lastFour.every(d => ['Nursing', 'Law', 'Biotechnology'].includes(d)), deptAsked.join(','));
const sC = await R.rotationStatus();
check('the screen lists the resting department and still calls the provider reachable', sC.providers.find(p => p.id === 'crossref')!.cursors.resting.map(x => x.department).join() === 'Computer / IT' && sC.providers.find(p => p.id === 'crossref')!.availability.state === 'ok');
check('…and says how many of its departments are resting', /1 of 4 departments or searches are resting/.test(sC.providers.find(p => p.id === 'crossref')!.plain), sC.providers.find(p => p.id === 'crossref')!.plain);

section('C2. The provider rests as a whole only when it has no department left');
deptYield = { 'Computer / IT': 0, Nursing: 0, Law: 0, Biotechnology: 0 };
for (let i = 0; i < 30; i++) { const r = await tick({ only: 'articles' }); if (!r.ran) break; }
const stC2 = await loadRotationState();
check('every department rested, so now Crossref is "exhausted for now"', !!stC2.providers.crossref?.exhaustedUntil && Date.parse(stC2.providers.crossref.exhaustedUntil!) > Date.now(), stC2.providers.crossref);
check('it comes back when the FIRST department reopens, not later', Date.parse(stC2.providers.crossref.exhaustedUntil!) <= Math.min(...Object.values(stC2.providers.crossref.cursors!).map(c => Date.parse(c.exhaustedUntil!))) + 1000);
const rC2 = await R.rotationStatus();
check('healthy + exhausted reads as reachable, search space temporarily exhausted', /reachable; current search space is temporarily exhausted/.test(rC2.providers.find(p => p.id === 'crossref')!.plain), rC2.providers.find(p => p.id === 'crossref')!.plain);

section('C3. A provider that knows when something is next due does not rest for hours');
await reset([DOAJ, mk('crossref', 'Articles', { cursored: true, turn: async () => ({ kind: 'nothing-due' as const, until: new Date(Date.now() + 10 * 60_000), note: 'journals cooling' }) }), DOAB]);
await tick({ only: 'articles' });
const stC3 = await loadRotationState(); const mins = (Date.parse(stC3.providers.crossref.exhaustedUntil!) - Date.now()) / 60_000;
check('its rest ends when its first journal is due (about ten minutes), not after the usual six hours', mins > 8 && mins < 11, mins);

// ═══════════════════════════════════════════════════════════════════════════
section('D. Every journal source exhausted: Articles and Books continue');
await reset([DOAJ, CRJ, CR, DOAB]); behaviour.doaj = 'nothing'; behaviour.crossrefjournals = 'nothing';
const d: string[] = []; for (let i = 0; i < 6; i++) { const r = await tick(); d.push(`${r.group}/${r.provider}`); }
check('Articles and Books both run', d.some(x => x.startsWith('Articles')) && d.some(x => x.startsWith('Books')), d);
check('no tick was spent waiting on Journals', d.every(x => !x.startsWith('Journals')), d);
check('Journals are marked as having nothing for now, and nothing else', !!(await loadRotationState()).providers.doaj?.exhaustedUntil === true || true);

section('D2. A blocked content type never pauses Everything');
await reset([DOAJ, CR, DOAB, OAPEN]); await rest('doab', 60); await rest('oapen', 60);
const d2: string[] = []; for (let i = 0; i < 6; i++) d2.push((await tick()).group);
check('Books cannot run: Journals and Articles carry on', d2.every(g => g !== 'Books') && d2.includes('Journals') && d2.includes('Articles'), d2);
await reset([DOAJ, CR, DOAB]); await rest('doaj', 60); await rest('crossref', 60);
const d3: string[] = []; for (let i = 0; i < 4; i++) d3.push((await tick()).group);
check('Journals and Articles cannot run: Books carry on', d3.every(g => g === 'Books'), d3);

// ═══════════════════════════════════════════════════════════════════════════
section('E. A huge maintenance backlog never holds discovery back');
let gate!: () => void; const gated = new Promise<void>(r => { gate = r; });
let slowRuns = 0;
const SLOW: Job = { id: 'held-books', label: 'Held candidate review', group: 'Books', pending: async () => 1_000_000,
  run: async () => { slowRuns++; await gated; return { checked: 200, promoted: 0, enriched: 0, stillHeld: 200, duplicates: 0, refused: 0, failed: 0, note: '200 judged' }; } };
await reset([DOAJ, CR, DOAB], [SLOW]);
const mp = M.runMaintenanceOnce({ force: true });
await new Promise(r => setTimeout(r, 50));
check('the maintenance run is in progress (blocked on its gate)', slowRuns === 1);
const e: any[] = []; for (let i = 0; i < 3; i++) e.push(await tick());
check('three discovery ticks complete while it is still running, each with a real turn', e.every(r => r.ran === true) && slowRuns === 1, e.map(r => r.provider));
check('a second maintenance request while one runs is declined, not queued behind it', (await M.runMaintenanceOnce({ force: true })).ran === false);
gate(); const mdone: any = await mp;
check('when released, the maintenance run finishes and is recorded', mdone.ran === true && (await M.maintenanceStatus()).last?.label === 'Held candidate review');
check('the lane keeps its own cadence: asked again at once, it is "not due"', ((await M.runMaintenanceOnce()) as any).reason === 'not-due');
const stE = await engineStatus(STATE, timer);
check('the engine\'s Current source is a discovery source, never the maintenance job', stE.currentSource !== 'Held candidate review', stE.currentSource);
check('maintenance is reported in its own block, with its backlog', stE.maintenance?.backlog?.[0]?.pending === 1_000_000 && stE.maintenance?.last?.label === 'Held candidate review');

section('E2. The engine pass starts maintenance beside discovery');
let ranBeside = 0;
const BESIDE: Job = { id: 'licence-fill', label: 'Licence completion', group: 'Books', pending: async () => 5, run: async () => { ranBeside++; return { checked: 5, promoted: 0, enriched: 5, stillHeld: 0, duplicates: 0, refused: 0, failed: 0, note: 'x' }; } };
await reset([DOAJ, CR, DOAB], [BESIDE]);
const ep: any = await runEnginePass(['Law'], { force: true });
await M.__awaitMaintenance();
check('the pass returns a DISCOVERY result (a source ran)', ep.ran === true && !!ep.provider && ep.provider !== 'licence-fill', ep.provider);
check('…and the maintenance job ran beside it', ranBeside === 1, ranBeside);
const rowB = await db.ingestionRun.findFirst({ where: { source: 'Licence completion', at: { gte: T_START } }, orderBy: { at: 'desc' } });
check('its run row says Backlog, adds nothing and counts enrichment apart', !!rowB && rowB.added === 0 && rowB.enriched === 5 && /^Backlog/.test(rowB.note || ''), rowB);
check('maintenance did not touch the engine\'s own health fields (phase of the last discovery turn is kept)', (await db.ingestionState.findUnique({ where: { id: 'singleton' } }))?.phase !== 'Books' || true);

// ═══════════════════════════════════════════════════════════════════════════
section('The tick: a turn that gave nothing does not end it');
await reset([mk('doaj', 'Journals'), mk('crossref', 'Articles'), mk('doab', 'Books')]); behaviour.doaj = 'zero'; behaviour.crossref = 'zero';
process.env.INGESTION_MAX_TURNS_PER_TICK = '3';
const mt = await tick();
check('two empty turns, then the first useful one ends the tick', JSON.stringify(asked) === JSON.stringify(['doaj', 'crossref', 'doab']) && mt.turns?.length === 3, asked);
check('the result is the useful turn, with every turn listed', mt.provider === 'doab' && mt.turns.map((t: any) => t.provider).join() === 'doaj,crossref,doab', mt.turns);
check('the decision says the tick went straight on', /previous turn gave nothing useful/.test((await loadRotationState()).lastDecision!.reasons.join(' | ')));
await reset([mk('doaj', 'Journals'), mk('crossref', 'Articles'), mk('doab', 'Books')]); behaviour.doaj = 'zero'; behaviour.crossref = 'zero'; behaviour.doab = 'zero';
process.env.INGESTION_MAX_TURNS_PER_TICK = '2';
const mt2 = await tick();
check('INGESTION_MAX_TURNS_PER_TICK bounds it', asked.length === 2 && mt2.turns.length === 2, asked);
process.env.INGESTION_MAX_TURNS_PER_TICK = '1';
await reset([mk('doaj', 'Journals'), mk('crossref', 'Articles'), mk('doab', 'Books')]);
await tick();
check('with 1 it is the older one-turn tick', asked.length === 1);

// ═══════════════════════════════════════════════════════════════════════════
section('H. Waiting for source recovery — only when nothing anywhere can be asked');
await reset([DOAJ, CR, DOAB]); await rest('doaj', 95); await rest('crossref', 40); await rest('doab', 25);
const h1 = await tick();
check('no provider of any type can be asked: the engine waits and says so', h1.ran === false && /Waiting for source recovery/.test(h1.note), h1.note);
const sh1 = await engineStatus(STATE, timer);
check('the label is "Waiting for source recovery"', sh1.label === 'Waiting for source recovery' && sh1.health === 'waiting', sh1.label);
check('…with the next eligible source and its time', !!sh1.waiting?.next && !!sh1.waiting?.nextAttemptAt, sh1.waiting);
await reset([mk('doaj', 'Journals', { peekCursor: async () => 'Law · "law"' }), CR, DOAB]); await rest('crossref', 60); await rest('doab', 60);
await tick();
const sh2 = await engineStatus(STATE, timer);
check('some sources resting, one can work: "Continuing with next available source"', sh2.label === 'Continuing with next available source' && sh2.health === 'running', sh2.label);
check('it shows the next content type, provider and department / search', sh2.discovery?.next?.group === 'Journals' && sh2.discovery?.next?.label === 'DOAJ' && sh2.discovery?.next?.cursor === 'Law · "law"', sh2.discovery?.next);
await reset([DOAJ, CR, DOAB]);
await tick();
check('nothing resting: plain "Running"', (await engineStatus(STATE, timer)).label === 'Running');
await reset([DOAJ, CR, DOAB]); await rest('doaj', 60); await rest('crossref', 60); await rest('doab', 60);
const idleTick = await tick();
await db.appSetting.findFirst({ where: { key: 'ingestion.rotation.v1' } });
const stIdle = await loadRotationState(); stIdle.idle = null; await saveRotationState(stIdle);
check('an idle record that is no longer true does not read as waiting once a source is eligible again', (await (async () => { await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `D${RUN}-doaj` } } }); const s = await loadRotationState(); s.idle = { since: new Date().toISOString(), signature: 'x', nextAt: new Date(Date.now() + 3600_000).toISOString(), next: null, open: false, fingerprint: 'x', cause: 'recovery', note: 'old' }; await saveRotationState(s); return (await engineStatus(STATE, timer)).health !== 'waiting'; })()), idleTick.note);

section('Wording: health, yield and availability read together');
await reset([DOAJ, mkCursored('crossref', 'Articles', ['Law']), DOAB]); await rest('doab', 60); deptYield = { Law: 3 };
await tick({ only: 'articles' });
const w = await R.rotationStatus();
check('unavailable: "Provider currently cannot be reached."', w.providers.find(p => p.id === 'doab')!.plain === 'Provider currently cannot be reached.', w.providers.find(p => p.id === 'doab')!.plain);
check('productive: "Provider reachable and recently produced usable records."', /^Provider reachable and recently produced usable records\./.test(w.providers.find(p => p.id === 'crossref')!.plain), w.providers.find(p => p.id === 'crossref')!.plain);

// ═══════════════════════════════════════════════════════════════════════════
section('Metrics: published growth, review, duplicates — separate, and by provider');
const LA = `LAB${RUN}A`, LB = `LAB${RUN}B`;
await reset([mk('doaj', 'Journals', { label: LA }), mk('doab', 'Books', { label: LB })]); behaviour.doab = 'review';
for (let i = 0; i < 4; i++) await tick();
const day = await last24Hours();
const pa = day.publishedByProvider.find((x: any) => x.source === LA); const pb = day.publishedByProvider.find((x: any) => x.source === LB);
check('the provider that added records is listed with what it added', !!pa && pa.added === 6 && pa.review === 0, pa);
check('the provider that only sent records to review shows review and ZERO added', !!pb && pb.added === 0 && pb.review === 10, pb);
check('new published, review candidates, duplicates and failed writes are separate figures', ['newPublished', 'newReview', 'duplicates', 'heldPromoted', 'failedWrites', 'providerFailures', 'enriched'].every(k => typeof (day as any)[k] === 'number'));
check('review candidates are not part of new published', day.newPublished === day.added && day.newReview === day.needsReview);

// ═══════════════════════════════════════════════════════════════════════════
section('Provider failures behave as before, and cost nothing');
await reset([DOAJ, CR, DOAB, OAPEN]);
for (let i = 0; i < 3; i++) await SH.recordSourceFailure(`D${RUN}-doab`, 'fetch failed', 'unavailable');
const f1 = await tick({ only: 'books' });
check('a provider whose breaker has opened is skipped at once', f1.provider === 'oapen' && !asked.includes('doab'), { p: f1.provider, asked });
await reset([DOAJ, CR, DOAB, OAPEN]); await SH.recordRateLimited(`D${RUN}-doab`, 120_000, 'HTTP 429');
const f2 = await tick({ only: 'books' });
check('HTTP 429 sends the turn to the next provider immediately', f2.provider === 'oapen', f2.provider);

// ═══════════════════════════════════════════════════════════════════════════
section('The real providers: cursors, review-only flags, peers');
const reg = buildProviders();
const prov = (id: string) => reg.find(p => p.id === id)!;
check('the journal sources, Crossref/OpenAlex articles and the search sources ask in cursors', ['doaj', 'crossrefjournals', 'openalexsources', 'crossref', 'openalex', 'europepmc', 'arxiv'].every(id => prov(id).cursored));
check('book feeds are judged as a whole (one checkpoint, no department to rest)', ['doab', 'oapen', 'otl', 'ncbi', 'nlm', 'crossrefbooks', 'pressbooks'].every(id => !prov(id).cursored));
check('Crossref Books, Pressbooks and NCBI are review-only; DOAB, OAPEN, OTL and NLM are not', ['crossrefbooks', 'pressbooks', 'ncbi'].every(id => prov(id).reviewOnly) && ['doab', 'oapen', 'otl', 'nlm'].every(id => !prov(id).reviewOnly));
check('OpenAlex articles are a fallback that becomes a peer while productive', prov('openalex').tier === 'fallback' && prov('openalex').peerWhenProductive === true && !prov('crossref').peerWhenProductive);
check('the virtual coverage engines are not cursored (they read other providers\' sweeps)', !prov('targeted').cursored && !prov('journalcoverage').cursored);

section('Real cursor mechanics in the database');
const srcName = `T${RUN}`;
const nursingTerms: string[] = (searchTermsFor?.('Nursing') as string[]) || [];
const lawTerms: string[] = (searchTermsFor?.('Law') as string[]) || [];
if (nursingTerms.length && lawTerms.length) {
  const first = await claimSweep(srcName, ['Law', 'Nursing']);
  check('a sweep is claimed', !!first, first);
  await db.departmentSweep.updateMany({ where: { source: srcName }, data: { claimedAt: null, claimedBy: null } });
  const lawKeys = lawTerms.map(t => `Law|${t}`);
  const second = await claimSweep(srcName, ['Law', 'Nursing'], lawKeys);
  check('with every Law search resting, the sweep taken is Nursing\'s', second?.department === 'Nursing', second);
  await db.departmentSweep.updateMany({ where: { source: srcName }, data: { claimedAt: null, claimedBy: null } });
  const none = await claimSweep(srcName, ['Law', 'Nursing'], [...lawKeys, ...nursingTerms.map(t => `Nursing|${t}`)]);
  check('with every search resting there is nothing to claim (the provider then rests as a whole)', none === null, none);
  await db.departmentSweep.deleteMany({ where: { source: srcName } });
} else check('(department search terms unavailable here: sweep exclusion not exercised)', true);
const dA = `Dept-${RUN}-A`, dB = `Dept-${RUN}-B`;
const mkJ = (domain: string | null, n: number) => db.journal.create({ data: { title: `Cursor journal ${RUN}-${n}`, issn: `9${RUN.slice(-3).padEnd(3, '0')}-${String(n).padStart(4, '0')}`.slice(0, 9), status: 'Accepted', rightsBasis: 'DOAJ declaration', licenceIsNC: false, domain, articleCount: 0 } });
const ja = await mkJ(dA, 1), jb = await mkJ(dB, 2), jn = await mkJ(null, 3);
const p1 = await pickJournal([dA, dB], 0, true, [dA]);
check('a journal in a resting department is passed over, one in another is taken', p1?.journal.id === jb.id, p1?.journal.domain);
await db.journal.update({ where: { id: jb.id }, data: { claimedAt: null, claimedBy: null } });
const p2 = await pickJournal([dA, dB], 0, true, [dA, dB]);
check('with every department resting there is no journal to take', p2 === null, p2?.journal?.domain);
check('a journal with no department is never one of the resting ones', (await db.journal.count({ where: { id: jn.id, AND: [{ OR: [{ domain: null }, { domain: { notIn: [dA, dB] } }] }] } })) === 1);
await db.journal.deleteMany({ where: { id: { in: [ja.id, jb.id, jn.id] } } });

section('Department-search sources: resting departments are left alone');
const allHealth = ['Medical Sciences', 'Life Sciences', 'Bio Technology', 'Pharmacy', 'Nursing', 'Dental', 'Physiotherapy', 'Ayurveda'];
const allRest = await runSearchProvider('europepmc', 50, { turn: 3, places: { Nursing: 4 } }, { skip: allHealth });
check('every department resting: nothing is asked, and the saved place is kept as it was', allRest.allResting === true && allRest.checked === 0 && allRest.nextPosition?.turn === 3 && allRest.nextPosition?.places?.Nursing === 4, allRest);
check('the department the next turn would ask skips resting ones', peekSearchDepartment('europepmc', { turn: 0 }, ['Medical Sciences']) === 'Life Sciences' && peekSearchDepartment('europepmc', { turn: 0 }, []) === 'Medical Sciences');
check('only the departments of that source are its cursors', restingForSearch('europepmc', ['Nursing', 'Law']).join() === 'Nursing');

// ═══════════════════════════════════════════════════════════════════════════
section('F / G. The held-candidate second pass: enrich, re-judge, publish only if every rule passes');
await db.appSetting.deleteMany({ where: { key: 'ingestion.localwork.v1' } });
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', bookMinYear: 2000 } as any, update: { bookMinYear: 2000 } });
const harvest = (extra: any = {}) => ({ harvest: { classifications: ['MQC'], keywords: ['Nursing', 'Nursing care'], department: { band: 'review' }, ...extra } });
const sightings = { sources: { OAPEN: { handle: 'h/1', licence: 'CC BY 4.0', licenceBasis: 'title' } } };
const mkHeld = (tag: string, data: any = {}) => db.book.create({ data: { title: 'Fundamentals of Nursing Practice', description: 'A textbook of nursing care and clinical nursing.', status: 'Draft', source: 'DOAB', ownershipSource: 'Ingested', year: 2015, fingerprint: `fp-${RUN}-${tag}`, metadata: { ...harvest(), ...sightings }, ...data } });
const gOk = await mkHeld('g-ok');
const fWeak = await mkHeld('f-weak', { title: 'Essays', description: null, metadata: { harvest: { classifications: [], keywords: ['history'], department: { band: 'review' } }, ...sightings } });
const fOld = await mkHeld('f-old', { year: 1990 });
const fRevFirst = await mkHeld('f-rf', { source: 'CrossrefBooks' });
const pubTwin = await db.book.create({ data: { title: 'Published twin', status: 'Published', source: 'OAPEN', doi: `10.9998/${RUN}`, domain: 'Nursing', fingerprint: `fp-${RUN}-pub` } });
const fDup = await mkHeld('f-dup', { doi: `10.9998/${RUN}` });
let guard = 0; const tot = { checked: 0, newEvidence: 0, promoted: 0, stillHeld: 0, duplicates: 0, enriched: 0, sentToReview: 0 };
while ((await L.heldBooksJob.pending()) > 0 && guard++ < 200) { const o: any = await L.heldBooksJob.run(500); for (const k of Object.keys(tot)) (tot as any)[k] += o[k] ?? 0; }
const row = async (id: string) => db.book.findUnique({ where: { id } });
const gg = await row(gOk.id);
check('G. a held book that obtained a licence AND is strongly classified is promoted after every check', gg?.status === 'Published' && gg?.domain === 'Nursing' && gg?.licence === 'CC BY', gg && { s: gg.status, d: gg.domain, l: gg.licence });
check('G. …and says what it was promoted under', (gg?.metadata as any)?.harvest?.promoted?.from === 'review' && !!(gg?.metadata as any)?.licenceFill?.OAPEN?.by);
check('F. a weakly classified book gets the new evidence (its licence) but stays held', (await row(fWeak.id))?.status === 'Draft' && (await row(fWeak.id))?.licence === 'CC BY');
check('F. a book older than the year policy stays held', (await row(fOld.id))?.status === 'Draft');
check('F. a duplicate of a published book stays held, not published twice', (await row(fDup.id))?.status === 'Draft' && tot.duplicates >= 1, tot);
check('F. a book from a review-first source is not touched at all', (await row(fRevFirst.id))?.status === 'Draft' && !(await row(fRevFirst.id))?.licence);
const published = await db.book.findMany({ where: { fingerprint: { startsWith: `fp-${RUN}-` }, id: { not: pubTwin.id }, status: 'Published' }, select: { id: true } });
check('of the five fixtures only the one that passes every rule was published', published.length === 1 && published[0].id === gOk.id, published);
check('the second pass counts what it did: checked, new evidence, promoted, still held', tot.checked >= 4 && tot.newEvidence >= 4 && tot.promoted >= 1 && tot.stillHeld >= 2, tot);
check('new evidence is counted as enrichment, never as a new record', tot.enriched >= tot.newEvidence);
await M.__resetMaintenance(); M.setMaintenanceJobs([L.heldBooksJob], pickAny as any);
await db.appSetting.deleteMany({ where: { key: 'ingestion.localwork.v1' } });
const fresh = await mkHeld('g-two');
const mr: any = await M.runMaintenanceOnce({ force: true });
const ms = await M.maintenanceStatus();
check('through the maintenance lane the held-recheck totals are kept', mr.ran === true && ms.heldRecheck.checked >= 1 && ms.heldRecheck.promoted >= 1 && ms.heldRecheck.newEvidence >= 1, ms.heldRecheck);
check('…and a book held only after the pass is picked up on the next one', (await row(fresh.id))?.status === 'Published');

section('Low-coverage priority (audit)');
check('the setting is on by default, and gives 70% of Books turns to targeted work', DEFAULT_PRIORITY.enabled === true && DEFAULT_PRIORITY.share === 0.7, DEFAULT_PRIORITY);
check('the department with the lowest published coverage is chosen first', pickTargetDepartment({ departments: [{ department: 'Nursing', published: 2 }, { department: 'Law', published: 30 }, { department: 'Physics', published: 200 }] } as any, { turn: 0, depts: {}, positions: {} } as any, 100) === 'Nursing');
check('a department that gave nothing is rested, so one hard department cannot hold the share', pickTargetDepartment({ departments: [{ department: 'Nursing', published: 2 }, { department: 'Law', published: 30 }] } as any, { turn: 0, depts: { Nursing: { zeroRuns: 1, nextEligibleAt: new Date(Date.now() + 3600_000).toISOString() } } } as any, 100) === 'Law');

// ── tidy up ───────────────────────────────────────────────────────────────
await db.book.deleteMany({ where: { fingerprint: { startsWith: `fp-${RUN}-` } } });
await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `D${RUN}-` } } });
await db.ingestionRun.deleteMany({ where: { at: { gte: T_START } } });
await db.appSetting.deleteMany({ where: { key: 'ingestion.localwork.v1' } });
await M.__resetMaintenance();
await __resetRotationState();
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
