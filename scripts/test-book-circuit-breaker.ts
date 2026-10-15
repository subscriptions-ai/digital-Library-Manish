/**
 * The Book providers' failure, cooldown and yield behaviour, with the REAL providers against a fake network and the throwaway database
 * `stm_ingestion_test` (refuses anything else). Nothing here reaches the internet and nothing in the real catalogue is touched.
 *
 *   npx tsx scripts/test-book-circuit-breaker.ts
 *
 * Covers the approved rules: three failures rest a provider and the turn rotates on; nothing is sent to a resting provider; at the end of the
 * rest ONE request is the test; success clears the consecutive count (and only that — the lifetime count stays); every failure is categorised
 * (DNS, timeout, refused, TLS, 4xx, 429, 5xx, OAI protocol, invalid XML); "exhausted for now" and a daily quota are not failures; and when no
 * Book provider can be asked, Books wait for source recovery while Journals and Articles carry on.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';
process.env.INGESTION_ARTICLE_PAUSE_MS = '0';
delete process.env.INGESTION_ZERO_YIELD_BATCHES_BEFORE_ROTATION;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const { runEnginePass, ensureProviders } = await import('../src/lib/ingestion/engine.js');
const { __useFetchForTests, __useSleepForTests, fetchSourceJson, sourceHealthState, recordSourceFailure, classifyFailure } = await import('../src/lib/ingestion/sourceHealth.js');
const { __resetRotationState, loadRotationState, saveRotationState } = await import('../src/lib/ingestion/rotationState.js');
const { rotationStatus, runRotationPass, setProviders } = await import('../src/lib/ingestion/rotation.js');
const { installProviders } = await import('../src/lib/ingestion/providers.js');
const { engineStatus } = await import('../src/lib/ingestion/status.js');
const { getState } = await import('../src/lib/ingestionWorker.js');
const { __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');
const Q = await import('../src/lib/ingestion/quickImport.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {}); Q.__useQuickPageDelayForTests(0);

const RUN = Date.now().toString(36);

// ── the fake network ───────────────────────────────────────────────────────
type Mode = 'ok' | 'timeout' | 'refused' | 'dns' | 'tls' | '503' | '404' | '429' | 'badxml' | 'oaierr';
const mode: Record<string, Mode> = {};
const requests: string[] = [];
const hits = (frag: string) => requests.filter(u => u.includes(frag)).length;
let otl: any[] = [];
const OAI_EMPTY = '<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><responseDate>2026-10-15T00:00:00Z</responseDate><error code="noRecordsMatch">none</error></OAI-PMH>';
const netError = (code: string, name = 'TypeError') => { const e: any = new TypeError('fetch failed'); e.name = name; e.cause = { code }; return e; };
const failure = (m: Mode): Response | null => {
  switch (m) {
    case 'timeout': { const e: any = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }
    case 'refused': throw netError('ECONNREFUSED');
    case 'dns': throw netError('ENOTFOUND');
    case 'tls': throw netError('CERT_HAS_EXPIRED');
    case '503': return new Response('down', { status: 503 });
    case '404': return new Response('gone', { status: 404 });
    case '429': return new Response('slow down', { status: 429, headers: { 'retry-after': '120' } });
    case 'badxml': return new Response('<html><body>Maintenance — back soon', { status: 200 });
    case 'oaierr': return new Response('<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><error code="badArgument">no</error></OAI-PMH>', { status: 200 });
    default: return null;
  }
};
const fake = async (url: string): Promise<Response> => {
  requests.push(url);
  const u = new URL(url); const h = u.hostname;
  if (h === 'directory.doabooks.org') return failure(mode.doab || 'ok') || new Response(OAI_EMPTY, { status: 200 });
  if (h === 'library.oapen.org') return failure(mode.oapen || 'ok') || new Response(OAI_EMPTY, { status: 200 });
  if (h === 'open.umn.edu') {
    const f = failure(mode.otl || 'ok'); if (f) return f;
    const page = Number(u.searchParams.get('page') || 1), per = 10;
    return new Response(JSON.stringify({ data: otl.slice((page - 1) * per, page * per), links: { total_pages: Math.max(1, Math.ceil(otl.length / per)), total_count: otl.length } }), { status: 200 });
  }
  if (h === 'ftp.ncbi.nlm.nih.gov') return new Response('"File","Article Title","Publisher","Year","Accession","Updated"\n', { status: 200 });
  if (h === 'doaj.org' || h === 'api.crossref.org' || h === 'api.openalex.org' || h === 'www.ebi.ac.uk' || h === 'export.arxiv.org')
    return new Response(JSON.stringify({ results: [], total: 0, status: 'ok', message: { items: [], 'total-results': 0 }, meta: { next_cursor: null, count: 0 }, resultList: { result: [] } }), { status: 200 });
  return new Response('unknown host in test', { status: 404 });
};
__useFetchForTests(fake as any);

const BOOK_KEYS = ['DOAB', 'OAPEN', 'open.umn.edu', 'NCBI'];
const reset = async () => {
  await __resetRotationState(); __resetProviderLocks(); Q.__resetQuickJobsForTests();
  await db.ingestionSourceHealth.deleteMany({ where: { source: { in: [...BOOK_KEYS, 'DOAJ', 'Crossref', 'OpenAlex', 'EuropePMC', 'arXiv'] } } });
  await db.bookHarvestCheckpoint.deleteMany({});                      // the throwaway database only: every provider is due again, as it would be after its interval
  await db.ingestionAudit.deleteMany({ where: { action: 'NCBI_ARCHIVE_DOWNLOADED' } });
  for (const k of Object.keys(mode)) delete mode[k];
  requests.length = 0; otl = [];
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;
  // This suite is about the ordinary rotation's providers, so the low-coverage engine (which also reads DOAB, through the same breaker) is off here.
  await db.appSetting.upsert({ where: { key: 'ingestion.books.priority.v1' }, create: { key: 'ingestion.books.priority.v1', value: { enabled: false, share: 0.7, target: 100 } as any, updatedBy: 'test' }, update: { value: { enabled: false, share: 0.7, target: 100 } as any } });
  ensureProviders(); installProviders();
};
const books = () => runEnginePass([], { force: true, only: 'books' }) as Promise<any>;
const everything = () => runEnginePass([], { force: true }) as Promise<any>;
const health = (k: string) => sourceHealthState(k);
const past = () => new Date(Date.now() - 1000);

try {
  await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: true }, update: { enabled: true, departments: [], focus: 'auto', consecutiveFailures: 0 } });
  await db.journal.updateMany({ where: { claimedAt: { not: null } }, data: { claimedAt: null } });          // test database only: stale claims would colour the engine's health

  // ═══════════════════════════════════════════════════════════════════════
  section('1. The failure count: a run of failed REQUESTS since the last success — and a separate lifetime count');
  await reset();
  mode.doab = 'refused';
  await books(); await books();
  let h = await health('DOAB');
  check('after two failures: 2 consecutive, 2 lifetime, still Degraded (not resting yet)', h.failures === 2 && h.lifetimeFailures === 2 && h.health === 'degraded' && !h.until, `${h.failures}/${h.lifetimeFailures} ${h.health}`);
  check('each failure is recorded once, however many attempts the call made', h.failures === 2);
  const reqAfter2 = hits('doabooks');

  // ═══════════════════════════════════════════════════════════════════════
  section('2. DOAB fails three times → cooling down, the turn rotates to OAPEN, and DOAB is not asked again before retryAt');
  const t3 = await books();
  h = await health('DOAB');
  check('the third failure puts DOAB in Cooling down with a retry time', h.health === 'cooling' && !!h.until && h.failures === 3 && h.lifetimeFailures === 3, `${h.health} until ${h.until?.toISOString()}`);
  check('the same turn handed over to OAPEN (it was asked, DOAB was not asked a 4th time)', t3.provider === 'oapen' && hits('library.oapen.org') > 0 && hits('doabooks') > reqAfter2 && hits('doabooks') - reqAfter2 <= 3, `${t3.provider}; doab requests ${hits('doabooks')}`);
  const frozen = hits('doabooks');
  for (let i = 0; i < 8; i++) await books();
  check('eight more Book turns: NO request is sent to DOAB while it rests', hits('doabooks') === frozen, `${hits('doabooks')} vs ${frozen}`);
  check('…and the consecutive count did not move (nothing was asked)', (await health('DOAB')).failures === 3);
  const blocked = await Q.sourceState('doab');
  check('Quick Import on DOAB is refused while it rests', blocked.state === 'cooling' || blocked.state === 'unavailable', blocked.state);
  const cards = await Q.listQuickSources();
  const doabCard: any = cards.find((c: any) => c.id === 'doab');
  check('the card says Cooling down with the reason and a retry time', doabCard.healthState === 'cooling' && /refused/i.test(doabCard.health.reason) && !!doabCard.health.until && doabCard.canQuickImport === false, `${doabCard.healthState} | ${doabCard.health.reason} | ${doabCard.health.until}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('3. When the rest ends, ONE request is the test — and a failed test extends the rest');
  const rest1 = (await health('DOAB')).until; // still in the future
  await db.ingestionSourceHealth.update({ where: { source: 'DOAB' }, data: { pausedUntil: past() } });
  check('with the rest over, DOAB is due a test request (health reads as Degraded, probe due)', (await health('DOAB')).probeDue === true);
  const beforeProbe = hits('doabooks');
  await books();
  check('exactly ONE request was sent (no retries on a test)', hits('doabooks') - beforeProbe === 1, `${hits('doabooks') - beforeProbe}`);
  h = await health('DOAB');
  check('the failed test counted once (4 in a row, 4 lifetime) and the rest was extended', h.failures === 4 && h.lifetimeFailures === 4 && !!h.until && h.until.getTime() > Date.now() + 25 * 60_000, `${h.failures}/${h.lifetimeFailures} until ${h.until?.toISOString()}`);
  check('the longer rest is a longer one: 30 min after the 4th failure, more after the 5th', rest1 !== null && h.until !== null);
  await db.ingestionSourceHealth.update({ where: { source: 'DOAB' }, data: { pausedUntil: past() } });
  await books();
  const h5 = await health('DOAB');
  check('the 5th failure rests it longer still (≈ 60 min)', h5.failures === 5 && h5.until!.getTime() > Date.now() + 50 * 60_000, `${h5.until?.toISOString()}`);

  // one probe at a time
  await db.ingestionSourceHealth.update({ where: { source: 'DOAB' }, data: { pausedUntil: past() } });
  const b0 = hits('doabooks');
  const both = await Promise.all([fetchSourceJson('https://directory.doabooks.org/oai/request?verb=Identify', { text: true }), fetchSourceJson('https://directory.doabooks.org/oai/request?verb=Identify', { text: true })]);
  check('two callers at the end of the rest: only ONE of them makes the test request', hits('doabooks') - b0 === 1 && both.filter(r => r.paused).length === 1, `${hits('doabooks') - b0} requests, ${both.filter(r => r.paused).length} paused`);

  // ═══════════════════════════════════════════════════════════════════════
  section('4. A test that works clears the consecutive count — and only that');
  mode.doab = 'ok';
  await db.ingestionSourceHealth.update({ where: { source: 'DOAB' }, data: { pausedUntil: past() } });
  await __resetRotationState();
  await books();
  h = await health('DOAB');
  check('DOAB is Healthy again: consecutive failures 0, no rest', h.health === 'healthy' && h.failures === 0 && !h.until, `${h.health} ${h.failures}`);
  check('the lifetime count is history, not state: it was not reset', h.lifetimeFailures >= 6, `${h.lifetimeFailures}`);
  check('the old reason is not shown for a healthy source', h.reason === null);
  const healedCard: any = (await Q.listQuickSources()).find((c: any) => c.id === 'doab');
  check('the card is Healthy, Quick Import is back, and it shows the lifetime figure without calling it consecutive', healedCard.healthState === 'healthy' && healedCard.canQuickImport === true && healedCard.health.failures === 0 && healedCard.health.lifetimeFailures >= 6);

  // ═══════════════════════════════════════════════════════════════════════
  section('5. OAPEN fails three times: the same behaviour');
  await reset();
  mode.oapen = 'timeout';
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) { const r = await books(); seen.push(r.provider || r.phase || 'none'); }
  const ho = await health('OAPEN');
  check('OAPEN is resting after three failed requests (a timeout is one request, never repeated)', ho.health === 'cooling' && ho.failures === 3 && !!ho.until, `${ho.health} ${ho.failures}`);
  check('a timed-out request is made once per failure — never three times over', hits('library.oapen.org') === 3, `${hits('library.oapen.org')}`);
  const oFrozen = hits('library.oapen.org');
  for (let i = 0; i < 6; i++) await books();
  check('no 4th request before retryAt', hits('library.oapen.org') === oFrozen);
  check('another provider took the turns meanwhile (DOAB, then OTL)', seen.some(x => x === 'doab' || x === 'otl'), seen.join(' '));

  // ═══════════════════════════════════════════════════════════════════════
  section('6. Every failure is categorised — a category and a short line, never a response body');
  const kinds: [string, () => Promise<any>, string][] = [];
  const one = async (m: Mode, source: string, extra: any = {}) => {
    await db.ingestionSourceHealth.deleteMany({ where: { source } });
    mode.doab = m;
    const r = await fetchSourceJson('https://directory.doabooks.org/oai/request?verb=ListRecords&key=SECRET123', { source, text: true, attempts: 1, ...extra });
    return { r, row: await db.ingestionSourceHealth.findUnique({ where: { source } }) };
  };
  const expect: [Mode, string, any][] = [['dns', 'dns', {}], ['timeout', 'timeout', {}], ['refused', 'connection_refused', {}], ['tls', 'tls', {}], ['503', 'http_5xx', {}], ['404', 'http_4xx', { countClientErrors: true }]];
  for (const [m, want, extra] of expect) {
    const { row } = await one(m, `QA-${RUN}-${m}`, extra);
    check(`${m} → ${want}`, row?.lastErrorKind === want, `${row?.lastErrorKind}: ${row?.lastError}`);
  }
  const rl = await one('429', `QA-${RUN}-429`);
  check('429 → rate limited at once, respecting Retry-After; not a consecutive failure but in the lifetime count', rl.r.rateLimited === true && !!rl.row?.pausedUntil && rl.row.lastErrorKind === 'http_429' && rl.row.consecutiveFailures === 0 && rl.row.lifetimeFailures === 1, JSON.stringify({ k: rl.row?.lastErrorKind, c: rl.row?.consecutiveFailures, l: rl.row?.lifetimeFailures }));
  const bx = await one('badxml', `QA-${RUN}-xml`, { parse: (b: any) => { throw new (class extends Error { kind = 'invalid_xml'; })('x'); } });
  check('an unrecognised thrown error is not mistaken for a network failure', classifyFailure(new Error('boom')) === 'unknown');
  const sec = await db.ingestionSourceHealth.findUnique({ where: { source: `QA-${RUN}-dns` } });
  check('nothing from the URL query (a key) or a response body is stored', !JSON.stringify(sec).includes('SECRET123'));

  // the real OAI path: invalid XML and OAI protocol errors count against the source
  await reset();
  mode.doab = 'badxml';
  await books(); await books(); await books();
  h = await health('DOAB');
  check('DOAB answering 200 with a maintenance page counts as failures (Invalid XML) and rests after three — not "success, then an exception"', h.lastErrorKind === 'invalid_xml' && h.failures === 3 && h.health === 'cooling', `${h.lastErrorKind} ${h.failures} ${h.health}`);
  await reset();
  mode.doab = 'oaierr';
  await books(); await books(); await books();
  h = await health('DOAB');
  check('an OAI protocol error counts too (OAI protocol error)', h.lastErrorKind === 'oai_protocol' && h.failures === 3, `${h.lastErrorKind} ${h.failures}`);
  await reset();
  mode.doab = '404';
  await books(); await books(); await books();
  h = await health('DOAB');
  check('a provider feed that keeps answering 404 is a failing provider, not an endless free retry (HTTP 4xx)', h.lastErrorKind === 'http_4xx' && h.failures === 3 && h.health === 'cooling', `${h.lastErrorKind} ${h.failures} ${h.health}`);
  await reset();
  mode.doab = '429';
  const r429 = await books();
  h = await health('DOAB');
  check('HTTP 429 on DOAB: rested immediately, no waiting for three failures, the turn rotated', h.health === 'rate_limited' && h.failures === 0 && !!h.until && r429.provider === 'oapen', `${h.health} ${r429.provider}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('7. Open Textbook Library: useful → Productive; nothing new → "Exhausted for now" — a yield state, never a failure');
  await reset();
  mode.doab = 'ok'; mode.oapen = 'ok';
  const tb = (id: number, title: string, o: any = {}) => ({ id, title, edition_statement: null, volume: null, copyright_year: 2020, isbn10: null, isbn13: o.isbn ?? null, license: 'Attribution', language: 'eng', description: null, updated_at: '2026-05-01T00:00:00.000-05:00',
    contributors: [{ contribution: 'Author', primary: true, corporate: false, first_name: 'Ada', middle_name: null, last_name: 'Lovelace' }], subjects: [{ name: 'Computer Science', call_number: 'QA75.5-76.95' }], publishers: [{ name: 'Open Press' }],
    formats: [{ type: 'Online', url: `https://books.example/${id}`, price: { cents: 0 } }], url: `https://open.umn.edu/opentextbooks/textbooks/${id}` });
  await db.book.deleteMany({ where: { title: { startsWith: `${RUN} ` } } });
  otl = [...Array.from({ length: 12 }, (_, i) => tb(9000 + i, `${RUN} Textbook ${i}`, { isbn: `97800000${String(10000 + i).padStart(5, '0')}`.slice(0, 13) })), { id: 9100, title: '' }, { id: 9101, title: '  ' }];
  // OTL's turn, on its own: put it first in the Books cursor
  const st0 = await loadRotationState(); st0.cursors.Books = 2; await saveRotationState(st0);
  const prod = await books();
  const rs1 = await rotationStatus();
  const otlP: any = rs1.providers.find(p => p.id === 'otl');
  check('OTL ran and the batch was useful', prod.provider === 'otl' && prod.added > 0, `${prod.provider} added ${prod.added} checked ${prod.checked}`);
  check('OTL is Healthy and Productive', otlP.health.state === 'healthy' && otlP.yield === 'productive', `${otlP.health.state} ${otlP.yield}`);
  check('the batch figures are kept apart: checked, added, held, review, skipped, provider request failures', otlP.lastBatch.checked === 14 && otlP.lastBatch.added > 0 && otlP.lastBatch.skipped === 2 && otlP.lastBatch.requestFailures === 0 && otlP.lastBatch.recordFailures === 0, JSON.stringify(otlP.lastBatch));
  check('Checked = added + held + review + skipped (nothing double-counted or lost)', otlP.lastBatch.checked === otlP.lastBatch.added + otlP.lastBatch.held + otlP.lastBatch.sentToReview + otlP.lastBatch.skipped, JSON.stringify(otlP.lastBatch));
  const goodBatch = otlP.lastBatch;

  // now it has nothing new: zero useful batches until set aside
  const empties: string[] = [];
  for (let i = 0; i < 8; i++) {
    const st = await loadRotationState(); st.cursors.Books = 2; await saveRotationState(st);
    await db.bookHarvestCheckpoint.deleteMany({});       // test database only: ask again, as a later pass would
    const r = await books(); empties.push(r.provider || r.phase);
    if ((await rotationStatus()).providers.find(p => p.id === 'otl')!.yield === 'exhausted') break;
  }
  const rs2 = await rotationStatus();
  const otlE: any = rs2.providers.find(p => p.id === 'otl');
  check('after the configured number of empty batches OTL is "Exhausted for now"', otlE.yield === 'exhausted' && otlE.availability.state === 'exhausted', `${otlE.yield} ${otlE.availability.state} (${empties.join(' ')})`);
  check('…and its HEALTH is untouched: Healthy, no failures', otlE.health.state === 'healthy' && otlE.health.failures === 0 && otlE.health.lifetimeFailures === 0);
  check('the productive batch is still on record, not overwritten by the empty ones', otlE.lastProductiveBatch?.added === goodBatch.added && otlE.lastProductiveBatch?.checked === goodBatch.checked, JSON.stringify(otlE.lastProductiveBatch));
  const otlCard: any = (await Q.listQuickSources()).find((c: any) => c.id === 'otl');
  check('the card: Health Healthy, Availability Exhausted for now with a time', otlCard.healthState === 'healthy' && otlCard.availability.kind === 'exhausted' && !!otlCard.availability.until, JSON.stringify(otlCard.availability));
  const otlReq = hits('open.umn.edu');
  const st1 = await loadRotationState(); st1.cursors.Books = 2; await saveRotationState(st1);
  await books(); await books();
  check('while it rests as exhausted, OTL is not asked again early', hits('open.umn.edu') === otlReq, `${hits('open.umn.edu')} vs ${otlReq}`);
  const st2 = await loadRotationState(); st2.providers.otl.exhaustedUntil = past().toISOString(); st2.cursors.Books = 2; await saveRotationState(st2);
  await db.bookHarvestCheckpoint.deleteMany({});
  await books();
  check('after the exhausted window it is eligible again, by itself', hits('open.umn.edu') > otlReq, `${hits('open.umn.edu')} vs ${otlReq}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('8. NCBI Bookshelf: a daily quota is not a failure');
  await reset();
  process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY = '2';
  await db.ingestionAudit.createMany({ data: [0, 1].map(i => ({ action: 'NCBI_ARCHIVE_DOWNLOADED', meta: { bytes: 1000, accession: `QA${RUN}${i}` } })) });
  const stN = await loadRotationState(); stN.cursors.Books = 3; await saveRotationState(stN);
  const nBefore = hits('ncbi.nlm.nih.gov');
  for (let i = 0; i < 4; i++) await books();
  const rsN = await rotationStatus();
  const ncbi: any = rsN.providers.find(p => p.id === 'ncbi');
  check('NCBI at its daily limit is skipped: not one request was sent to it', hits('ncbi.nlm.nih.gov') === nBefore, `${hits('ncbi.nlm.nih.gov')}`);
  check('Health: Healthy — Availability: quota, with the reset time', ncbi.health.state === 'healthy' && ncbi.availability.kind === 'quota' && !!ncbi.availability.until, `${ncbi.health.state} ${ncbi.availability.kind} ${ncbi.availability.until}`);
  check('the quota did NOT increment any failure count', (await health('NCBI')).failures === 0 && (await health('NCBI')).lifetimeFailures === 0);
  const nCard: any = (await Q.listQuickSources()).find((c: any) => c.id === 'ncbi');
  check('the card says Healthy + Daily quota reached + retry time + archives left (0 of 2)', nCard.healthState === 'healthy' && nCard.availability.kind === 'quota' && nCard.availability.label === 'Daily quota reached' && nCard.quota.archivesLeft === 0 && !!nCard.availability.until, JSON.stringify({ h: nCard.healthState, a: nCard.availability, q: nCard.quota }));
  check('Quick Import is refused until the quota resets', nCard.canQuickImport === false);
  check('the safety limit itself is unchanged (a limit of 2 stayed 2)', (await import('../src/lib/ingestion/books/ncbi.js')).ncbiLimits().maxArchivesPerDay === 2);
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;

  // ═══════════════════════════════════════════════════════════════════════
  section('9. Every Book provider resting: Books WAIT FOR SOURCE RECOVERY; Journals and Articles carry on; the engine is not failed');
  await reset();
  process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY = '1';
  await db.ingestionAudit.create({ data: { action: 'NCBI_ARCHIVE_DOWNLOADED', meta: { bytes: 1000, accession: `QA${RUN}x` } } });
  for (const k of ['DOAB', 'OAPEN']) { for (let i = 0; i < 3; i++) await recordSourceFailure(k, 'The operation was aborted due to timeout'); }
  const stW = await loadRotationState(); stW.providers.otl = { zeroYield: 2, exhaustedUntil: new Date(Date.now() + 3 * 3600_000).toISOString() }; await saveRotationState(stW);
  requests.length = 0;
  const wBooks = await books();
  check('a Books-only pass does nothing and says it is waiting for source recovery', wBooks.ran === false && /Waiting for source recovery/.test(wBooks.note || ''), (wBooks.note || '').slice(0, 220));
  check('not one request went to any Book source', hits('doabooks') + hits('oapen.org') + hits('open.umn.edu') + hits('ncbi') === 0);
  const rsW = await rotationStatus();
  check('the group state is "waiting", with why and when to retry', rsW.groups.Books.waiting === true && /DOAB/.test(rsW.groups.Books.waitingReason || '') && /OTL|Open Textbook/.test(rsW.groups.Books.waitingReason || '') && /NCBI/.test(rsW.groups.Books.waitingReason || '') && !!rsW.groups.Books.retryAt, (rsW.groups.Books.waitingReason || '').slice(0, 260));
  const turns: string[] = [];
  for (let i = 0; i < 6; i++) { const r = await everything(); turns.push(String(r.phase)); }
  check('Everything mode keeps going: Journals and Articles take their turns, Books is skipped in the same tick', turns.includes('Journals') && turns.includes('Articles') || turns.every(t => t !== 'Books'), turns.join(' '));
  check('and nothing was sent to a Book source meanwhile', hits('doabooks') + hits('oapen.org') + hits('open.umn.edu') + hits('ncbi') === 0);
  check('Journal/Article sources WERE asked', hits('doaj.org') + hits('api.crossref.org') > 0, `${hits('doaj.org')} + ${hits('api.crossref.org')}`);
  const es: any = await engineStatus(await getState(), { nextTickAt: null, lastTickAt: null, busy: false });
  check('the engine is not marked failed: no "passes in a row failed", health is not Needs attention because of Books', es.health !== 'attention' && !es.reasons.some((r: string) => /passes in a row/.test(r)), `${es.health} | ${es.reasons.join(' | ').slice(0, 200)}`);
  check('the screen carries the Books state and each provider\'s retry time', es.rotation.groups.Books.waiting === true && es.rotation.problems.length >= 2, `${es.rotation.problems.map((p: any) => p.text).join(' | ').slice(0, 260)}`);
  check('the engine\'s own failure counter is 0', (await getState()).consecutiveFailures === 0);
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;

  // ═══════════════════════════════════════════════════════════════════════
  section('10. Something breaking on OUR side is not a provider failure');
  {
    const boom = { id: 'boom', label: 'Boom', group: 'Books' as const, role: 'test', tier: 'primary' as const, healthKey: `QA-${RUN}-boom`, lock: `QA-${RUN}-boom`, turn: async () => { throw new Error('relation "Book" does not exist'); } };
    setProviders([boom as any]);
    await __resetRotationState(); __resetProviderLocks();
    await db.ingestionSourceHealth.deleteMany({ where: { source: `QA-${RUN}-boom` } });
    for (let i = 0; i < 5; i++) await runRotationPass({ only: 'books', wanted: [], narrowed: false, state: {} });
    const hb = await sourceHealthState(`QA-${RUN}-boom`);
    check('five internal errors leave the provider\'s failure counts at 0 — it was never the provider', hb.failures === 0 && hb.lifetimeFailures === 0 && hb.health === 'healthy', `${hb.failures}/${hb.lifetimeFailures}`);
    let calls = 0; (boom as any).turn = async () => { calls++; throw new Error('relation "Book" does not exist'); };
    await __resetRotationState();
    for (let i = 0; i < 5; i++) await runRotationPass({ only: 'books', wanted: [], narrowed: false, state: {} });
    check('and it is not retried every tick: a short pause follows an internal error', calls === 1, `${calls} calls in 5 passes`);
    installProviders();
  }
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}`);
} finally {
  await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `QA-${RUN}` } } });
  await db.book.deleteMany({ where: { title: { startsWith: `${RUN} ` } } });
  await db.appSetting.deleteMany({ where: { key: 'ingestion.books.priority.v1' } });
  await __resetRotationState();
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
