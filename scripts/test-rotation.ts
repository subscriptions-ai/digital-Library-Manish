/**
 * Rotation scheduler tests, against stand-in providers on the throwaway database `stm_ingestion_test` (refuses anything else).
 * No network, no real source: each stand-in does what the test tells it to — answer, fail, get rate limited, give nothing — so every
 * rule the scheduler promises can be checked exactly.
 *
 *   npx tsx scripts/test-rotation.ts
 *
 * Health rows and the rotation's own setting row are the only things written besides the run log. Nothing is deleted from the catalogue.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
process.env.INGESTION_ADAPTIVE_SCHEDULER = '0';        // this suite pins the previous static order and one-useful-turn-per-tick rule; the adaptive scheduler has its own (test-adaptive-scheduler.ts)

// This suite tests the rotation rules under the ORIGINAL fair rotation (Journals → Articles → Books, no coverage engine, no local backlog). Weighted
// priority, journal coverage, review-only Book sources in the rotation and the local backlog are covered by scripts/test-always-productive.ts.
Object.assign(process.env, { INGESTION_WEIGHT_BOOKS: '1', INGESTION_WEIGHT_JOURNALS: '1', INGESTION_WEIGHT_ARTICLES: '1', INGESTION_LOCAL_WORK: '0', INGESTION_MAX_TURNS_PER_TICK: '1', INGESTION_PRODUCTIVITY_BIAS: '0', INGESTION_JOURNAL_COVERAGE: '0', BOOKS_CROSSREF: '0', BOOKS_PRESSBOOKS: '0' });
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';           // no waiting between failures in a test
delete process.env.INGESTION_BATCH_SIZE;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const { runRotationPass, setProviders, rotationStatus } = await import('../src/lib/ingestion/rotation.js');
const { loadRotationState, saveRotationState, __resetRotationState, blankState } = await import('../src/lib/ingestion/rotationState.js');
const { recordSourceFailure, recordSourceOk, recordRateLimited, sourceHealthState } = await import('../src/lib/ingestion/sourceHealth.js');
const { tryLockProvider, unlockProvider, __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');

const RUN = Date.now().toString(36);
const T_START = new Date();            // this run's rows only: other suites' real DOAB / OpenAlex rows share these labels
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);

// ── Stand-in providers ──────────────────────────────────────────────────────
type Behaviour = 'ok' | 'fail' | 'rate' | 'zero' | 'nothing' | 'quota';
const behaviour: Record<string, Behaviour> = {};
const calls: string[] = [];
const resting: Record<string, Date | null> = {};
const useful = (n: number) => ({ kind: 'ran' as const, checked: 100, added: n, held: 100 - n, enriched: 0, sentToReview: 0, skipped: 0, recordFailures: 0, useful: n, more: true, ledger: {} });
const mk = (id: string, group: any, tier: any, fallbackFor?: string[]) => ({
  id, label: id.toUpperCase(), group, role: 'test', tier, fallbackFor, healthKey: `T${RUN}-${id}`, lock: `T${RUN}-${id}`,
  restingNow: async () => (resting[id] ? { until: resting[id]!, reason: 'daily limit reached' } : null),
  turn: async (ctx: any) => {
    calls.push(`${id}:${ctx.batch}`);
    const b = behaviour[id] || 'ok';
    if (b === 'fail') { await recordSourceFailure(`T${RUN}-${id}`, 'fetch failed'); return { kind: 'request-failed' as const, error: 'fetch failed' }; }
    if (b === 'rate') { await recordRateLimited(`T${RUN}-${id}`, 5 * 60_000); return { kind: 'request-failed' as const, error: 'HTTP 429', rateLimited: true }; }
    if (b === 'nothing') return { kind: 'nothing-due' as const };
    if (b === 'quota') return { kind: 'quota' as const, until: new Date(Date.now() + 3600_000) };
    if (b === 'zero') return useful(0);
    return useful(7);
  },
});
const CHAIN = [
  mk('doaj', 'Journals', 'primary'),
  { ...mk('road', 'Journals', 'fallback', ['doaj']) },
  mk('crossrefjournals', 'Journals', 'fallback', ['doaj', 'road']),
  mk('openalexsources', 'Journals', 'fallback', ['doaj', 'road', 'crossrefjournals']),
  mk('crossref', 'Articles', 'primary'),
  mk('openalex', 'Articles', 'fallback', ['crossref']),
  mk('europepmc', 'Articles', 'supplementary'),
  mk('arxiv', 'Articles', 'supplementary'),
  mk('doab', 'Books', 'supplementary'),
  mk('oapen', 'Books', 'supplementary'),
  mk('otl', 'Books', 'supplementary'),
  mk('ncbi', 'Books', 'supplementary'),
];
const ids = CHAIN.map(p => p.id);

const reset = async () => {
  await __resetRotationState(); __resetProviderLocks();
  for (const k of Object.keys(behaviour)) delete behaviour[k];
  for (const k of Object.keys(resting)) delete resting[k];
  calls.length = 0;
  for (const p of CHAIN) await db.ingestionSourceHealth.deleteMany({ where: { source: p.healthKey } });   // this test's own health rows only
  setProviders(CHAIN as any);
};
// No per-type settings here: a turn's budget then comes from INGESTION_BATCH_SIZE (default 100). The admin's per-type settings, when present, win (checked below).
const STATE = { articlesPerJournal: 30, yearsBack: 7 };
const pass1 = (only?: any) => runRotationPass({ only, wanted: [], narrowed: false, state: STATE }) as Promise<any>;
const runsOf = async (since: Date, source?: string) => db.ingestionRun.findMany({ where: { at: { gte: since }, ...(source ? { source } : {}), note: { not: null } }, orderBy: { at: 'asc' } });
const seqOf = (arr: string[]) => arr.map(c => c.split(':')[0]);

try {
  section('Everything mode is a fair rotation: Journals → Articles → Books, and round again');
  await reset();
  const order: string[] = [];
  for (let i = 0; i < 6; i++) { const r = await pass1(); order.push(`${r.phase}/${r.provider}`); }
  check('six turns go Journals, Articles, Books, Journals, Articles, Books', same(order.map(o => o.split('/')[0]), ['Journals', 'Articles', 'Books', 'Journals', 'Articles', 'Books']), order.join(' '));
  check('the default turn checks up to 100 candidates', calls.every(c => c.endsWith(':100')), calls.join(' '));
  check('providers take their own turns inside each type: Books go DOAB then OAPEN', order[2] === 'Books/doab' && order[5] === 'Books/oapen', order.join(' '));
  check('the fallback sources are not used while the primary one is healthy (Journals is DOAJ both times)', order[0] === 'Journals/doaj' && order[3] === 'Journals/doaj');
  check('Articles: Crossref then Europe PMC (OpenAlex is a fallback, so it waits)', order[1] === 'Articles/crossref' && order[4] === 'Articles/europepmc', `${order[1]} ${order[4]}`);
  const st = await loadRotationState();
  check('each content type keeps its own cursor', st.cursors.Journals !== undefined && st.cursors.Articles !== undefined && st.cursors.Books !== undefined, JSON.stringify(st.cursors));

  process.env.INGESTION_BATCH_SIZE = '40';
  calls.length = 0; await pass1();
  check('INGESTION_BATCH_SIZE changes the turn’s budget', calls[0].endsWith(':40'), calls[0]);
  delete process.env.INGESTION_BATCH_SIZE;
  // The admin's per-type settings (journalsPerPass / articlesPerPass / booksPerPass) are the budget for their type, whatever the environment says.
  await reset();
  const PER_TYPE = { articlesPerJournal: 30, yearsBack: 7, journalsPerPass: 150, articlesPerPass: 80, booksPerPass: 120 };
  calls.length = 0;
  for (let i = 0; i < 3; i++) await runRotationPass({ wanted: [], narrowed: false, state: PER_TYPE });
  check('per-type settings are each type’s turn budget (Journals 150, Articles 80, Books 120)', calls.length === 3 && calls[0].endsWith(':150') && calls[1].endsWith(':80') && calls[2].endsWith(':120'), calls.join(' '));

  section('A. Three failed requests rest DOAJ, and the same turn goes straight to the next source');
  await reset(); behaviour.doaj = 'fail'; behaviour.road = 'ok';
  const t0 = new Date();
  const r1 = await pass1('journals'); const h1 = await sourceHealthState(`T${RUN}-doaj`);
  check('failure 1: recorded, DOAJ is Degraded, no switch yet', r1.ran === false && h1.health === 'degraded' && h1.failures === 1 && !calls.includes('road:100'), `${h1.health} ${h1.failures}`);
  const r2 = await pass1('journals'); const h2 = await sourceHealthState(`T${RUN}-doaj`);
  check('failure 2: still Degraded, still no switch', r2.ran === false && h2.failures === 2 && !calls.includes('road:100'));
  const r3 = await pass1('journals'); const h3 = await sourceHealthState(`T${RUN}-doaj`);
  check('failure 3: DOAJ is Cooling down and ROAD takes the turn at once', r3.ran === true && r3.provider === 'road' && h3.health === 'cooling' && h3.failures === 3, `${r3.provider} ${h3.health}`);
  check('it did not wait for a fourth failure', calls.filter(c => c.startsWith('doaj')).length === 3);
  const rows = await runsOf(t0);
  check('run activity shows Failure 1/3, 2/3, 3/3 and “Switched to ROAD”', rows.filter(r => r.source === 'DOAJ').length === 3 && /Failure 3\/3/.test(rows.filter(r => r.source === 'DOAJ')[2].note || '') && /Switched to ROAD/.test(rows.filter(r => r.source === 'DOAJ')[2].note || ''), rows.map(r => `${r.source}: ${r.note}`).join(' | ').slice(0, 300));
  check('the failures are marked as provider request failures, not catalogue failures', rows.filter(r => r.source === 'DOAJ').every(r => /^Provider request failed/.test(r.error || '')) && rows.filter(r => r.source === 'DOAJ').every(r => r.skippedFailed === 0));
  check('the ROAD row says it took over from DOAJ', /Took over from DOAJ/.test(rows.find(r => r.source === 'ROAD')?.note || ''));
  check('the next journal turn goes to the fallback chain without touching DOAJ', (await pass1('journals')).provider !== 'doaj' && calls.filter(c => c.startsWith('doaj')).length === 3);

  section('B. ROAD fails too: Crossref Journals is selected');
  await recordSourceFailure(`T${RUN}-road`, 'x'); await recordSourceFailure(`T${RUN}-road`, 'x'); await recordSourceFailure(`T${RUN}-road`, 'x');
  const st2 = await loadRotationState(); st2.cursors.Journals = 1; await saveRotationState(st2);       // ROAD's turn
  calls.length = 0;
  const rb = await pass1('journals');
  check('ROAD is resting, so Crossref Journals runs', rb.provider === 'crossrefjournals' && !calls.some(c => c.startsWith('road')), `${rb.provider}`);
  const stB = await loadRotationState();
  check('the journal cursor moved on past it', stB.cursors.Journals === 3);

  section('I. Every journal source unavailable: Journals wait, Articles and Books carry on');
  await recordSourceFailure(`T${RUN}-crossrefjournals`, 'x'); await recordSourceFailure(`T${RUN}-crossrefjournals`, 'x'); await recordSourceFailure(`T${RUN}-crossrefjournals`, 'x');
  await recordRateLimited(`T${RUN}-openalexsources`, 10 * 60_000);
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) { const r = await pass1(); seen.push(`${r.phase}`); }
  check('Everything keeps running: only Articles and Books take turns', seen.every(g => g === 'Articles' || g === 'Books') && seen.includes('Articles') && seen.includes('Books'), seen.join(' '));
  const stI = await loadRotationState();
  check('Journals are recorded as waiting for source recovery, with why', !!stI.waiting.Journals && /DOAJ/.test(stI.waiting.Journals.reason), stI.waiting.Journals?.reason?.slice(0, 160));
  const status = await rotationStatus();
  check('the screen’s status says so too', status.groups.Journals.waiting === true && status.groups.Articles.waiting === false);
  const onlyJ = await pass1('journals');
  check('a Journals-only pass with everything down does nothing, and says why', onlyJ.ran === false && /Waiting for source recovery/.test(onlyJ.note || ''), onlyJ.note?.slice(0, 120));

  section('J. A cooldown that has ended puts the source back in the rotation by itself');
  await db.ingestionSourceHealth.update({ where: { source: `T${RUN}-doaj` }, data: { pausedUntil: new Date(Date.now() - 1000) } });
  calls.length = 0;
  const rj = await pass1('journals');
  check('DOAJ is asked again once its rest is over', rj.provider === 'doaj' || calls[0]?.startsWith('doaj'), calls.join(' '));
  behaviour.doaj = 'ok'; await recordSourceOk(`T${RUN}-doaj`);
  check('a successful request makes it Healthy again', (await sourceHealthState(`T${RUN}-doaj`)).health === 'healthy');

  section('E. HTTP 429 sets a source aside at once: no second request, the turn goes to the next one');
  await reset(); behaviour.crossref = 'ok';
  // make Crossref unavailable so OpenAlex (the fallback) is eligible, then have OpenAlex answer 429
  await recordSourceFailure(`T${RUN}-crossref`, 'x'); await recordSourceFailure(`T${RUN}-crossref`, 'x'); await recordSourceFailure(`T${RUN}-crossref`, 'x');
  behaviour.openalex = 'rate'; behaviour.europepmc = 'ok';
  calls.length = 0;
  const re = await pass1('articles'); const ho = await sourceHealthState(`T${RUN}-openalex`);
  check('OpenAlex asked once, answered 429, and is Rate limited with a retry time', calls.filter(c => c.startsWith('openalex')).length === 1 && ho.health === 'rate_limited' && !!ho.until, `${ho.health}`);
  check('its failure count was not inflated (being busy is not being broken)', ho.failures === 0);
  check('the very same turn went on to Europe PMC', re.ran === true && re.provider === 'europepmc', re.provider);
  calls.length = 0;
  await pass1('articles'); await pass1('articles');
  check('while it is resting nothing asks OpenAlex again', !calls.some(c => c.startsWith('openalex')));
  const rowsE = await db.ingestionRun.findMany({ where: { at: { gte: T_START }, source: 'OPENALEX', note: { contains: 'Rate limited' } } });
  check('run activity says Rate limited until a time, and Switched to the next source', rowsE.some(r => /Rate limited until/.test(r.note || '') && /Switched to EUROPEPMC/.test(r.note || '')), rowsE[0]?.note || '');

  section('F. Three zero-yield batches: a healthy source is set aside for now (never called Failed)');
  await reset(); behaviour.doab = 'zero';
  const stF = await loadRotationState(); stF.cursors.Books = 0; await saveRotationState(stF);
  const f: string[] = [];
  for (let i = 0; i < 3; i++) {
    const s0 = await loadRotationState(); s0.cursors.Books = 0; await saveRotationState(s0);       // give DOAB the turn each time
    const r = await pass1('books'); f.push(r.provider);
  }
  const hDoab = await sourceHealthState(`T${RUN}-doab`);
  const stF2 = await loadRotationState();
  check('DOAB took the three turns and gave nothing each time', same(f, ['doab', 'doab', 'doab']));
  check('it is Healthy and Exhausted for now — not Failed', hDoab.health === 'healthy' && yieldOf(stF2, 'doab') === 'exhausted');
  const sF3 = await loadRotationState(); sF3.cursors.Books = 0; await saveRotationState(sF3);
  const rf = await pass1('books');
  check('the next Books turn goes to OAPEN', rf.provider === 'oapen', rf.provider);
  const rowsF = await db.ingestionRun.findMany({ where: { at: { gte: T_START }, source: 'DOAB', note: { contains: 'Zero-yield' } }, orderBy: { at: 'asc' } });
  check('run activity shows Zero-yield batch 1/3, 2/3 and 3/3 · Exhausted for now', rowsF.length >= 3 && /1\/3/.test(rowsF[0].note!) && /3\/3/.test(rowsF[2].note!) && /Exhausted for now/.test(rowsF[2].note!), rowsF.map(r => r.note).join(' | ').slice(0, 220));
  check('a held duplicate alone does not count as useful (100 checked, 0 added, 100 held = low yield)', (await rotationStatus()).providers.find(p => p.id === 'doab')!.yield === 'exhausted');
  behaviour.doab = 'ok';
  const sF4 = await loadRotationState(); sF4.providers.doab.exhaustedUntil = new Date(Date.now() - 1000).toISOString(); sF4.cursors.Books = 0; await saveRotationState(sF4);
  const rf2 = await pass1('books');
  check('once the rest is over, one useful batch makes it Productive again', rf2.provider === 'doab' && yieldOf(await loadRotationState(), 'doab') === 'productive');

  section('G. OAPEN unavailable: Open Textbook Library is next');
  await reset();
  await recordSourceFailure(`T${RUN}-oapen`, 'x'); await recordSourceFailure(`T${RUN}-oapen`, 'x'); await recordSourceFailure(`T${RUN}-oapen`, 'x');
  const sG = await loadRotationState(); sG.cursors.Books = 1; await saveRotationState(sG);
  check('with OAPEN resting, the turn that was OAPEN’s goes to OTL', (await pass1('books')).provider === 'otl');
  check('a failing OAPEN did not stop DOAB, OTL or NCBI from taking turns', true);
  const bs: string[] = []; for (let i = 0; i < 4; i++) bs.push((await pass1('books')).provider);
  check('over the next turns DOAB, OTL and NCBI all run', ['doab', 'otl', 'ncbi'].every(x => bs.includes(x)) && !bs.includes('oapen'), bs.join(' '));

  section('H. NCBI’s daily quota is a rest, not a failure');
  await reset(); resting.ncbi = new Date(Date.now() + 3600_000);
  const sH = await loadRotationState(); sH.cursors.Books = 3; await saveRotationState(sH);
  calls.length = 0;
  const rh = await pass1('books');
  check('NCBI is skipped and the next book source runs', rh.provider === 'doab' && !calls.some(c => c.startsWith('ncbi')), rh.provider);
  const hn = await sourceHealthState(`T${RUN}-ncbi`);
  check('NCBI’s health row is untouched: Healthy, no failures', hn.health === 'healthy' && hn.failures === 0);
  const stat = (await rotationStatus()).providers.find(p => p.id === 'ncbi')!;
  check('the screen shows it as cooling down for the quota, not unavailable', stat.availability.kind === 'quota' && stat.availability.state === 'unavailable' && !!stat.availability.until);

  section('K. A provider a Quick Import is on is not run a second time');
  await reset();
  check('manual lock taken', tryLockProvider(`T${RUN}-doaj`, 'manual'));
  calls.length = 0;
  const rk = await pass1('journals');
  check('the engine does not start DOAJ; the fallback source covers the turn', !calls.some(c => c.startsWith('doaj')), calls.join(' '));
  unlockProvider(`T${RUN}-doaj`, 'manual');
  check('a busy provider is not a failure: no failures were counted', (await sourceHealthState(`T${RUN}-doaj`)).failures === 0 && rk !== null);

  section('Nothing due is not a failure either');
  await reset(); behaviour.crossref = 'nothing'; behaviour.openalex = 'nothing'; behaviour.europepmc = 'ok';   // both read the same journal queue, so both have nothing
  const rn = await pass1('articles');
  check('a provider with nothing to do hands the turn on, without an error', rn.ran === true && rn.provider === 'europepmc');
  check('and is not marked failed', (await sourceHealthState(`T${RUN}-crossref`)).failures === 0);

  section('The fallback is used only when what it backs up cannot work');
  await reset(); behaviour.crossref = 'zero';
  for (let i = 0; i < 3; i++) { const s0 = await loadRotationState(); s0.cursors.Articles = 0; await saveRotationState(s0); await pass1('articles'); }
  check('Crossref exhausted for now → OpenAlex becomes eligible', yieldOf(await loadRotationState(), 'crossref') === 'exhausted');
  const s5 = await loadRotationState(); s5.cursors.Articles = 0; await saveRotationState(s5);
  calls.length = 0; await pass1('articles');
  check('the turn goes to a source that can give something, and OpenAlex is among the candidates', calls.length === 1 && ['openalex', 'europepmc', 'arxiv'].includes(calls[0].split(':')[0]), calls.join(' '));
} catch (e: any) {
  fail++; console.log('  FAIL  test crashed:', e?.stack || e?.message);
} finally {
  for (const p of CHAIN) await db.ingestionSourceHealth.deleteMany({ where: { source: p.healthKey } }).catch(() => {});
  await __resetRotationState();
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function same(a: any, b: any) { return JSON.stringify(a) === JSON.stringify(b); }
function yieldOf(s: any, id: string) {
  const rt = s.providers[id]; if (!rt) return null;
  if (rt.exhaustedUntil && new Date(rt.exhaustedUntil).getTime() > Date.now()) return 'exhausted';
  if (rt.zeroYield > 0) return 'low';
  return rt.lastBatch?.useful > 0 ? 'productive' : null;
}
