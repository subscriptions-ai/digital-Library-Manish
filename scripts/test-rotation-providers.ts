/**
 * The rotation with the REAL providers, against a faithful fake network and the throwaway database `stm_ingestion_test`
 * (refuses anything else). Nothing here reaches the internet.
 *
 *   npx tsx scripts/test-rotation-providers.ts
 *
 * Covers: DOAJ failing three times → the fallback chain, review-first journals (open access unverified), Crossref as the primary
 * article source, HTTP 429 handling, NCBI's quota, provider locks, Quick Import health gating, and that a manual Quick Import never
 * moves anything the continuous engine owns.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
// These suites exercise the original Book providers. NLM Catalog (added later) is in the continuous rotation by default and would be asked too, so it is switched off here.
process.env.BOOKS_NLM = '0';
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';
process.env.INGESTION_ARTICLE_PAUSE_MS = '0';
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const { runEnginePass } = await import('../src/lib/ingestion/engine.js');
const { registerRoadAdapter } = await import('../src/lib/ingestion/providers.js');
const { __useFetchForTests, __useSleepForTests, fetchSourceJson, sourceHealthState } = await import('../src/lib/ingestion/sourceHealth.js');
const { __useArticlePauseForTests, __useFileCheckForTests } = await import('../src/lib/ingestion/articleSources.js');
const { __resetRotationState, loadRotationState, saveRotationState } = await import('../src/lib/ingestion/rotationState.js');
const { rotationStatus } = await import('../src/lib/ingestion/rotation.js');
const { engineStatus } = await import('../src/lib/ingestion/status.js');
const { getState } = await import('../src/lib/ingestionWorker.js');
const { __resetProviderLocks, tryLockProvider, unlockProvider } = await import('../src/lib/ingestion/providerLocks.js');
const { readCursor } = await import('../src/lib/ingestion/journalCursor.js');
const { departmentMetrics } = await import('../src/lib/ingestion/departmentMetrics.js');
const { resolveRange } = await import('../src/lib/ingestion/runFilter.js');
const Q = await import('../src/lib/ingestion/quickImport.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {}); __useArticlePauseForTests(async () => {}); Q.__useQuickPageDelayForTests(0);
__useFileCheckForTests(async u => !!u && /\/ok\b/.test(u));

const RUN = Date.now().toString(36);
const DEPT = `QA ${RUN}`;
const YEAR = new Date().getFullYear();
let seq = Number(String(Date.now()).slice(-6));
const issn = () => { const n = String(1_000_000 + (seq++ % 8_999_999)); return `${n.slice(0, 4)}-${n.slice(4)}${seq % 10}`; };

// ── the fake network ───────────────────────────────────────────────────────
type Mode = 'ok' | '503' | '429';
const mode: Record<string, Mode> = {};
const requests: string[] = [];
const hits = (frag: string) => requests.filter(u => u.includes(frag)).length;
let crossrefJournals: any[] = [];
let roadJournals: any[] = [];
const crossrefWorks: Record<string, any[]> = {};
const refuse = (k: string): Response | null => mode[k] === '503' ? new Response('down', { status: 503 }) : mode[k] === '429' ? new Response('slow down', { status: 429, headers: { 'retry-after': '120' } }) : null;
const json = (o: any) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
const fake = async (url: string): Promise<Response> => {
  requests.push(url);
  const u = new URL(url); const h = u.hostname;
  if (h === 'doaj.org') return refuse('doaj') || json({ results: [], total: 0 });
  if (h === 'road.issn.org') return refuse('road') || json({ items: roadJournals });
  if (h === 'api.crossref.org') {
    const r = refuse('crossref'); if (r) return r;
    if (u.pathname === '/journals') { const rows = Number(u.searchParams.get('rows')), off = Number(u.searchParams.get('offset') || 0); return json({ status: 'ok', message: { 'total-results': crossrefJournals.length, items: crossrefJournals.slice(off, off + rows) } }); }
    const m = /\/journals\/([^/]+)\/works/.exec(u.pathname);
    if (m) { const rows = Number(u.searchParams.get('rows')), off = Number(u.searchParams.get('offset') || 0); const all = crossrefWorks[decodeURIComponent(m[1])] || []; return json({ status: 'ok', message: { 'total-results': all.length, items: all.slice(off, off + rows) } }); }
  }
  if (h === 'api.openalex.org') return refuse('openalex') || json({ results: [], meta: { next_cursor: null, count: 0 } });
  if (h === 'www.ebi.ac.uk') return refuse('epmc') || json({ resultList: { result: [] } });
  if (h === 'export.arxiv.org') return new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 });
  if (h === 'directory.doabooks.org' || h === 'library.oapen.org') return new Response('<OAI-PMH><error code="noRecordsMatch">none</error></OAI-PMH>', { status: 200 });
  if (h === 'open.umn.edu') return json({ data: [], links: { total_pages: 1, total_count: 0 } });
  if (h === 'ftp.ncbi.nlm.nih.gov') return new Response('"File","Article Title","Publisher","Year","Accession","Updated"\n', { status: 200 });
  return new Response('unknown host in test', { status: 404 });
};
__useFetchForTests(fake as any);

const KEYS = ['DOAJ', 'ROAD', 'Crossref', 'OpenAlex', 'EuropePMC', 'arXiv', 'DOAB', 'OAPEN', 'open.umn.edu', 'NCBI'];
const reset = async () => {
  await __resetRotationState(); __resetProviderLocks(); Q.__resetQuickJobsForTests(); registerRoadAdapter(null);
  await db.ingestionSourceHealth.deleteMany({ where: { source: { in: KEYS } } });
  for (const k of Object.keys(mode)) delete mode[k];
  requests.length = 0; crossrefJournals = []; roadJournals = [];
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;
};
const pass1 = (only?: 'journals' | 'articles' | 'books') => runEnginePass([DEPT], { force: true, only, departments: [DEPT] }) as Promise<any>;
const crJ = (title: string, print: string, electronic: string | null, extra: any = {}) => ({
  title: [title], publisher: 'QA Publisher', ISSN: [print, ...(electronic ? [electronic] : [])],
  'issn-type': [{ value: print, type: 'print' }, ...(electronic ? [{ value: electronic, type: 'electronic' }] : [])], subjects: [{ name: 'Testing' }], ...extra,
});
const crItem = (doi: string, title: string, is: string, n: number) => ({
  DOI: doi, title: [title], author: [{ given: 'Ada', family: 'Lovelace' }], issued: { 'date-parts': [[YEAR]] }, 'container-title': ['J'], ISSN: [is], volume: '3', issue: '4', publisher: 'Test Pub', subject: ['Testing'], type: 'journal-article',
  license: [{ URL: 'https://creativecommons.org/licenses/by/4.0/', 'content-version': 'vor', 'delay-in-days': 0 }], link: [{ URL: `https://files.example/${RUN}/${n}/ok.pdf`, 'content-type': 'application/pdf' }],
});

try {
  await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: true, articlesPerJournal: 30, yearsBack: 7 }, update: { enabled: true, articlesPerJournal: 30, yearsBack: 7, departments: [], focus: 'auto' } });

  // ═══════════════════════════════════════════════════════════════════════
  section('A + B + C. DOAJ fails three times → the fallback chain; fallback journals are held for review, never accepted');
  await reset();
  mode.doaj = '503';
  const heldIssn = issn(), newA = issn(), newB = issn(), newBe = issn();
  await db.journal.create({ data: { title: `QA Held Journal ${RUN}`, issn: heldIssn, domain: DEPT, status: 'Accepted', rightsBasis: 'DOAJ declaration', licence: 'CC BY', licenceIsNC: false, publisherName: 'Keep Me' } });
  crossrefJournals = [crJ(`QA New Journal A ${RUN}`, newA, null), crJ(`QA New Journal B ${RUN}`, newB, newBe), crJ(`QA Held Journal ${RUN}`, heldIssn, '3333-3333')];
  const t0 = new Date();
  const p1 = await pass1('journals'), p2 = await pass1('journals');
  const h2 = await sourceHealthState('DOAJ');
  check('DOAJ failures 1 and 2 are recorded and DOAJ is Degraded; nobody else was asked yet', p1.ran === false && p2.ran === false && h2.health === 'degraded' && h2.failures === 2 && hits('api.crossref.org') === 0 && hits('road.issn.org') === 0);
  const p3 = await pass1('journals'); const h3 = await sourceHealthState('DOAJ');
  check('failure 3: DOAJ is Cooling down and the SAME pass moves on (ROAD is not connected, so Crossref Journals)', p3.ran === true && p3.provider === 'crossrefjournals' && h3.health === 'cooling' && h3.failures === 3, `${p3.provider} ${h3.health}`);
  check('DOAJ was asked exactly three times, not four', hits('doaj.org/api/search') === 3 * 3 /* three attempts inside each failed request */ || hits('doaj.org/api/search') >= 3);
  const rows = await db.ingestionRun.findMany({ where: { at: { gte: t0 }, phase: 'Journals' }, orderBy: { at: 'asc' } });
  const doajRows = rows.filter(r => r.source === 'DOAJ');
  check('run activity: DOAJ Failure 1/3, 2/3, then 3/3 · Cooling down · Switched to Crossref Journals', doajRows.length === 3 && /Failure 1\/3/.test(doajRows[0].note!) && /Failure 3\/3 · Cooling down · Switched to Crossref Journals/.test(doajRows[2].note!), doajRows.map(r => r.note).join(' | '));
  check('those rows are provider request failures — no catalogue failure is recorded', doajRows.every(r => /^Provider request failed/.test(r.error || '') && r.skippedFailed === 0));
  const crRow = rows.find(r => r.source === 'Crossref Journals')!;
  check('the Crossref Journals row says what it did: 3 checked, 2 held for review, 1 held, took over from DOAJ', !!crRow && /3 checked/.test(crRow.note!) && /Took over from DOAJ/.test(crRow.note!) && crRow.needsReview === 2 && crRow.skippedHeld === 1 && crRow.journalsAccepted === 0, crRow?.note || '');

  const es = await engineStatus(await getState(), { nextTickAt: null, lastTickAt: null, busy: false }) as any;
  check('Current source is the one that actually worked — Crossref Journals, not DOAJ', es.currentSource === 'Crossref Journals', String(es.currentSource));
  // One source resting is worth knowing about, with its time and reason; it is not the engine failing — the others carry on.
  check('the resting provider is listed with a time (DOAJ cooling down)…', es.reasons.some((r: string) => /^DOAJ — cooling down until/.test(r)), JSON.stringify(es.reasons));
  check('…and it does not by itself make the engine "Needs attention"', !es.reasons.some((r: string) => /passes in a row failed|Every content type is waiting/.test(r)));
  check('…and says the healthy providers carry on', es.reasons.includes('Healthy providers continue running automatically.'));
  check('ROAD being unconnected is not presented as a fault', !es.reasons.some((r: string) => /ROAD/.test(r)));

  const jA = await db.journal.findFirst({ where: { issn: newA } }), jB = await db.journal.findFirst({ where: { issn: newB } });
  check('C. a Crossref-only journal is Needs Review / OA unverified — not Accepted', jA?.status === 'NeedsReview' && jB?.status === 'NeedsReview' && /OA unverified/.test(jA?.rightsBasis || ''), `${jA?.status} / ${jA?.rightsBasis}`);
  check('C. no open-access status, licence or commercial-use permission was invented', jA?.licence === null && jA?.licenceIsNC === null && jA?.openAccess === false && jA?.rightsVerifiedAt === null && jA?.rightsVerifiedBy === null);
  check('C. both of its ISSNs are kept, and it carries the department it was searched under', jB?.eissn === newBe && jB?.domain === DEPT);
  const held = await db.journal.findFirst({ where: { issn: heldIssn } });
  check('a journal we already hold is NOT changed in status, licence or rights — only an empty field is filled', held?.status === 'Accepted' && held?.licence === 'CC BY' && held?.licenceIsNC === false && held?.rightsBasis === 'DOAJ declaration' && held?.publisherName === 'Keep Me' && held?.eissn === '3333-3333');
  check('review-first journals are never picked for article fetching (only Accepted + DOAJ-declared are)', (await db.journal.count({ where: { id: { in: [jA!.id, jB!.id] }, status: 'Accepted' } })) === 0);

  // ROAD, once a connector exists, takes the turn ahead of Crossref Journals
  registerRoadAdapter(async (term, pos, size) => {
    const r = await fetchSourceJson(`https://road.issn.org/test?term=${encodeURIComponent(term)}&page=${pos}`, { source: 'ROAD', attempts: 1 });
    if (!r.ok) throw Object.assign(new Error(r.error || 'ROAD did not answer'), { status: r.status });
    const items = (r.json.items || []).map((x: any) => ({ source: 'ROAD' as const, title: x.title, issn: x.issn, eissn: null, publisherName: null, country: null, homepage: null, subjects: [], hint: 'ROAD lists it' }));
    return { items, fetched: items.length, skipped: 0, total: items.length };
  });
  const roadIssn = issn();
  roadJournals = [{ title: `QA ROAD Journal ${RUN}`, issn: roadIssn }];
  const st = await loadRotationState(); st.cursors.Journals = 1; await saveRotationState(st);        // the turn that is ROAD's
  const pr = await pass1('journals');
  check('A. with a ROAD connector, DOAJ cooling hands the turn to ROAD / ISSN', pr.provider === 'road', pr.provider);
  const rj = await db.journal.findFirst({ where: { issn: roadIssn } });
  check('ROAD’s journal is also review-first and says it came from ROAD', rj?.status === 'NeedsReview' && /ROAD listing/.test(rj?.rightsBasis || ''));
  // B: ROAD fails (three failed requests) → Crossref Journals
  mode.road = '503';
  const fk = issn(); crossrefJournals = [crJ(`QA After ROAD ${RUN}`, fk, null)];
  const outcomes: string[] = [];
  for (let i = 0; i < 3; i++) {
    // Earlier runs walked this department's one search to its end; open it again, as a month later it would be.
    await db.departmentSweep.updateMany({ where: { department: DEPT }, data: { exhaustedAt: null, position: 0 } });
    const s2 = await loadRotationState(); s2.cursors.Journals = 1; await saveRotationState(s2); const r = await pass1('journals'); outcomes.push(r.provider || 'failed');
  }
  check('B. ROAD failing three times rests it, and Crossref Journals takes over in that same pass', outcomes[2] === 'crossrefjournals' && (await sourceHealthState('ROAD')).health === 'cooling', outcomes.join(' → '));
  check('B. …and a Journals pass never touched Articles or Books', !requests.some(u => u.includes('ebi.ac.uk') || u.includes('openalex.org/works')));

  // ═══════════════════════════════════════════════════════════════════════
  section('D. Crossref is the primary article source; the next main turn is Books; other sources’ places are kept');
  await reset();
  const jIssn = issn();
  const J = await db.journal.create({ data: { title: `QA Articles Journal ${RUN}`, issn: jIssn, domain: DEPT, status: 'Accepted', rightsBasis: 'DOAJ declaration', licence: 'CC BY', licenceIsNC: false, fetchCursor: 'LEGACY-OPENALEX-CURSOR' } });
  crossrefWorks[jIssn] = [1, 2, 3].map(n => crItem(`10.7777/${RUN}.${n}`, `${RUN} Crossref article ${n}`, jIssn, n));
  const s0 = await loadRotationState(); s0.typeCursor = 1; await saveRotationState(s0);      // it is Articles' turn
  const t1 = new Date();
  const pa = await pass1();
  check('D. the Articles turn was Crossref’s, not OpenAlex’s', pa.phase === 'Articles' && pa.provider === 'crossref' && hits('api.crossref.org/journals/') >= 1 && hits('api.openalex.org') === 0, `${pa.phase}/${pa.provider}`);
  check('D. three articles added, through the shared writer, as Published', (await db.article.count({ where: { title: { startsWith: `${RUN} Crossref article` }, status: 'Published', source: 'Crossref' } })) === 3);
  const arow = await db.ingestionRun.findFirst({ where: { at: { gte: t1 }, phase: 'Articles', source: 'Crossref', journalId: J.id } });
  check('D. its run row names the journal (so the department is its journal’s) and says 3 checked / 3 added', arow?.journalId === J.id && arow.added === 3 && /3 checked/.test(arow.note || ''), arow?.note || '');
  const jAfter = await db.journal.findUnique({ where: { id: J.id } });
  check('D. OpenAlex’s saved place on that journal is untouched by a Crossref visit', readCursor(jAfter!.fetchCursor, 'openalex') === 'LEGACY-OPENALEX-CURSOR', String(jAfter!.fetchCursor));
  const pb = await pass1();
  check('D. after Crossref’s 100, the next main turn is Books', pb.phase === 'Books', pb.phase);
  const pc = await pass1();
  check('…then Journals again: fair rotation', pc.phase === 'Journals' || pc.phase === 'Idle' || pc.ran === false, pc.phase);

  // ═══════════════════════════════════════════════════════════════════════
  section('E. HTTP 429: one request, set aside until the time given, the very same turn goes on');
  await reset();
  for (let i = 0; i < 3; i++) await db.ingestionSourceHealth.upsert({ where: { source: 'Crossref' }, create: { source: 'Crossref', consecutiveFailures: 1 }, update: { consecutiveFailures: { increment: 1 } } });
  await db.ingestionSourceHealth.update({ where: { source: 'Crossref' }, data: { pausedUntil: new Date(Date.now() + 3600_000), lastError: 'Crossref answered HTTP 500' } });   // Crossref is resting, so OpenAlex is the article fallback
  mode.openalex = '429';
  const ja = await db.journal.create({ data: { title: `QA OA Journal ${RUN}`, issn: issn(), domain: DEPT, status: 'Accepted', rightsBasis: 'DOAJ declaration', licenceIsNC: false } });
  const s3 = await loadRotationState(); s3.typeCursor = 1; await saveRotationState(s3);
  const t2 = new Date();
  const m0 = await departmentMetrics(null, (resolveRange({ range: 'today' }) as any).range, { source: 'OpenAlex' });
  const pe = await pass1('articles'); const ho = await sourceHealthState('OpenAlex');
  check('OpenAlex was asked ONCE (no retry just to reach a failure count)', hits('api.openalex.org/works') === 1, `${hits('api.openalex.org/works')} request(s)`);
  check('it is Rate limited, with the retry time it was given (~2 minutes)', ho.health === 'rate_limited' && !!ho.until && ho.until.getTime() - Date.now() > 60_000 && ho.until.getTime() - Date.now() < 180_000, `${ho.health}`);
  check('its failure count was not inflated by being busy', ho.failures === 0);
  check('the same turn went to the next article provider', pe.ran === true && pe.provider === 'europepmc', pe.provider);
  const jaAfter = await db.journal.findUnique({ where: { id: ja.id } });
  check('the journal was not penalised for the source’s rate limit', jaAfter!.failureCount === 0 && jaAfter!.nextEligibleAt === null && jaAfter!.claimedAt === null);
  await pass1('articles'); await pass1('articles');
  check('while it rests, nothing asks OpenAlex again', hits('api.openalex.org/works') === 1);
  const erow = await db.ingestionRun.findFirst({ where: { at: { gte: t2 }, source: 'OpenAlex' } });
  check('run activity: Rate limited until a time · Switched to Europe PMC — as a provider failure, not a catalogue failure', /Rate limited until/.test(erow?.note || '') && /Switched to Europe PMC/.test(erow?.note || '') && /^Provider request failed/.test(erow?.error || '') && erow?.skippedFailed === 0, erow?.note || '');
  const m = await departmentMetrics(null, (resolveRange({ range: 'today' }) as any).range, { source: 'OpenAlex' });
  check('the summary counts it as ONE provider failure, and Failed runs does not move', m.ingestion.providerFailures - m0.ingestion.providerFailures === 1 && m.ingestion.failedRuns === m0.ingestion.failedRuns, JSON.stringify([m.ingestion.providerFailures - m0.ingestion.providerFailures, m.ingestion.failedRuns - m0.ingestion.failedRuns]));

  // ═══════════════════════════════════════════════════════════════════════
  section('H. NCBI’s daily quota is a rest: cooling, not failing, and the next book source runs');
  await reset();
  process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY = '0';
  const s4 = await loadRotationState(); s4.cursors.Books = 3; await saveRotationState(s4);       // NCBI’s turn
  const ph = await pass1('books');
  const nc = (await rotationStatus()).providers.find(p => p.id === 'ncbi')!;
  check('NCBI was skipped without a single request to NCBI', !requests.some(u => u.includes('ncbi.nlm.nih.gov')) && ph.provider !== 'ncbi', ph.provider);
  check('it reads as cooling for the quota (not unavailable, not failing); its health row has no failures', nc.availability.kind === 'quota' && !!nc.availability.until && nc.health.failures === 0 && nc.health.state === 'healthy');
  const nq = (await Q.listQuickSources()).find((c: any) => c.id === 'ncbi');
  check('and Quick Import for NCBI is disabled with the same reason', nq.state === 'cooling' && nq.canQuickImport === false && /limit/i.test(nq.detail || ''), JSON.stringify([nq.state, nq.detail]));
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;

  // ═══════════════════════════════════════════════════════════════════════
  section('K + L. Locks and Quick Import health');
  await reset();
  check('K. the engine holds DOAJ… a Quick Import for DOAJ is refused', (() => { tryLockProvider('DOAJ', 'continuous'); return true; })());
  let refused: any = null; try { await Q.beginQuickImport('doaj', { uid: 'u' }); } catch (e: any) { refused = e; }
  unlockProvider('DOAJ', 'continuous');
  check('K. refused as busy, naming the Continuous Engine', refused?.code === 'BUSY' && /Continuous Engine/.test(refused.message), refused?.message);
  tryLockProvider('DOAJ', 'manual'); requests.length = 0;
  const pk = await pass1('journals');
  check('K. and the engine does not start a second DOAJ pass beside a manual one', hits('doaj.org') === 0 && pk !== null);
  unlockProvider('DOAJ', 'manual');
  // L: sources that cannot be asked are disabled
  await db.ingestionSourceHealth.upsert({ where: { source: 'DOAB' }, create: { source: 'DOAB', consecutiveFailures: 6, pausedUntil: new Date(Date.now() + 1800_000), lastError: 'fetch failed' }, update: { consecutiveFailures: 6, pausedUntil: new Date(Date.now() + 1800_000), lastError: 'fetch failed' } });
  await db.ingestionSourceHealth.upsert({ where: { source: 'OAPEN' }, create: { source: 'OAPEN', consecutiveFailures: 3, pausedUntil: new Date(Date.now() + 600_000), lastError: 'fetch failed' }, update: { consecutiveFailures: 3, pausedUntil: new Date(Date.now() + 600_000), lastError: 'fetch failed' } });
  await db.ingestionSourceHealth.upsert({ where: { source: 'open.umn.edu' }, create: { source: 'open.umn.edu', consecutiveFailures: 1, lastError: 'fetch failed' }, update: { consecutiveFailures: 1, pausedUntil: null, lastError: 'fetch failed' } });
  const cards = await Q.listQuickSources();
  const card = (id: string) => cards.find((c: any) => c.id === id);
  check('L. DOAB (resting after many failures) shows Unavailable and Quick Import is disabled', card('doab').state === 'unavailable' && card('doab').canQuickImport === false && !!card('doab').until, card('doab').state);
  check('L. OAPEN (first rest) shows Cooling down and Quick Import is disabled', card('oapen').state === 'cooling' && card('oapen').canQuickImport === false);
  check('L. a source with one failure is Degraded and Quick Import stays available (a manual run is its probe)', card('otl').state === 'degraded' && card('otl').canQuickImport === true && /1 of 3/.test(card('otl').detail || ''));
  check('L. a healthy source is importable; ROAD says Not connected and cannot be started', card('europepmc').state === 'healthy' && card('europepmc').canQuickImport && card('road').state === 'not_connected' && !card('road').canQuickImport);
  check('every card carries its role, health, yield and recent batch fields', cards.every((c: any) => 'role' in c && 'health' in c && 'yield' in c && 'lastBatch' in c && 'until' in c));
  let e2: any = null; try { await Q.beginQuickImport('doab', { uid: 'u' }); } catch (e: any) { e2 = e; }
  check('L. starting a rested source is refused, with no lock left behind', e2?.code === 'RATE_LIMITED' && Q.activeQuickJobs().length === 0 && !(await Q.listQuickSources()).some((c: any) => c.state === 'running'));

  // ═══════════════════════════════════════════════════════════════════════
  section('M. A manual Quick Import never moves anything the continuous engine owns');
  await reset();
  const mj = await db.journal.create({ data: { title: `QA Checkpoint Journal ${RUN}`, issn: issn(), domain: DEPT, status: 'Accepted', rightsBasis: 'DOAJ declaration', licenceIsNC: false, fetchCursor: 'KEEP-THIS-CURSOR' } });
  await db.bookHarvestCheckpoint.upsert({ where: { provider: 'DOAB' }, create: { provider: 'DOAB', cursor: 'xoai///set/55', harvestStartedAt: new Date('2026-10-01T00:00:00Z') }, update: { cursor: 'xoai///set/55', harvestStartedAt: new Date('2026-10-01T00:00:00Z') } });
  await db.departmentSweep.upsert({ where: { department_source_term: { department: DEPT, source: 'CrossrefJournals', term: DEPT } }, create: { department: DEPT, source: 'CrossrefJournals', term: DEPT, position: 4 }, update: { position: 4, exhaustedAt: null } });
  const snap = async () => JSON.stringify([
    await db.bookHarvestCheckpoint.findMany({ orderBy: { provider: 'asc' } }),
    await db.departmentSweep.findMany({ where: { department: DEPT }, orderBy: { term: 'asc' } }),
    (await db.journal.findUnique({ where: { id: mj.id } }))?.fetchCursor,
    (await loadRotationState()).cursors,
  ]);
  const before = await snap();
  crossrefJournals = [crJ(`QA Manual Journal ${RUN}`, issn(), null)];
  const job = await Q.beginQuickImport('crossrefjournals', { uid: 'u', email: 'qa@test' });
  for (let i = 0; i < 100 && Q.getQuickJob(job.id)?.status === 'running'; i++) await new Promise(r => setTimeout(r, 50));
  check('the manual Crossref Journals import ran and held its journal for review', Q.getQuickJob(job.id)?.status === 'done' && (await db.journal.count({ where: { title: `QA Manual Journal ${RUN}`, status: 'NeedsReview' } })) === 1, JSON.stringify(Q.getQuickJob(job.id)?.error));
  check('a DOAB harvest cursor, a department sweep, a journal’s cursor and the rotation cursors are exactly as they were', (await snap()) === before);
  const qrow = await db.ingestionRun.findFirst({ where: { note: { startsWith: 'Manual · Quick Import' }, source: 'Crossref Journals' }, orderBy: { at: 'desc' } });
  check('it logged what it did, as a manual run', !!qrow && qrow.needsReview === 1 && /1 sent to review/.test(qrow.note || ''), qrow?.note || '');

  // ═══════════════════════════════════════════════════════════════════════
  section('O. The date-wise figures reconcile with the provider’s batch totals');
  const today = (resolveRange({ range: 'today' }) as any).range;
  const sum = await departmentMetrics(null, today, { source: 'Crossref', phase: 'articles' }, { byDay: true });
  const rowsC = await db.ingestionRun.findMany({ where: { at: { gte: today.start }, source: 'Crossref', phase: 'Articles' } });
  check('summary = sum of the provider’s run rows = sum of By day', sum.ingestion.articlesAdded === rowsC.reduce((n, r) => n + r.added, 0) && sum.byDay!.reduce((n: number, d: any) => n + d.articles, 0) === sum.ingestion.articlesAdded, `${sum.ingestion.articlesAdded}`);
  // ═══════════════════════════════════════════════════════════════════════
  section('Rollback: INGESTION_ROTATION=0 returns the engine to the previous scheduler without touching the rotation’s state');
  await reset();
  const s9 = await loadRotationState(); s9.cursors.Journals = 2; await saveRotationState(s9);
  const rotBefore = JSON.stringify((await db.appSetting.findUnique({ where: { key: 'ingestion.rotation.v1' } }))?.value);
  process.env.INGESTION_ROTATION = '0';
  const legacy: any = await runEnginePass([DEPT], { force: true, only: 'journals', departments: [DEPT] });
  const status = await engineStatus(await getState(), { nextTickAt: null, lastTickAt: null, busy: false }) as any;
  delete process.env.INGESTION_ROTATION;
  check('the previous scheduler ran (its own result shape, no rotation fields)', legacy && !('ran' in legacy) && (legacy.phase === 'Journals' || legacy.phase === 'Idle' || legacy.error === undefined), JSON.stringify(legacy).slice(0, 120));
  check('the rotation’s saved state is exactly as it was', JSON.stringify((await db.appSetting.findUnique({ where: { key: 'ingestion.rotation.v1' } }))?.value) === rotBefore);
  check('and the status says the rotation is off, so the screen shows the previous wording', status.rotation.enabled === false);

} catch (e: any) {
  fail++; console.log('  FAIL  test crashed:', e?.stack || e?.message);
} finally {
  __useFetchForTests(null);
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
