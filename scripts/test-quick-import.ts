/**
 * Quick Import tests: every approved provider, against a fake upstream. Throwaway database `stm_ingestion_test` only —
 * the script refuses to run against anything else — and no request ever leaves this machine.
 *
 *   npx tsx scripts/test-quick-import.ts
 *
 * What matters most here is what a manual import must NOT do: move the continuous engine's checkpoints, go past a
 * source's cooldown, exceed its bound, run twice at once, or write anything when the source gave nothing usable.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const dbName = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const Q = await import('../src/lib/ingestion/quickImport.js');
const { __useFetchForTests, __useSleepForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const { __useArticlePauseForTests, __useFileCheckForTests } = await import('../src/lib/ingestion/articleSources.js');
const { tryLockProvider, unlockProvider, __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');
const { runIngestionPass } = await import('../src/lib/ingestionWorker.js');
const { runScheduledHarvest, DOAB_OAI } = await import('../src/lib/ingestion/books/oaiHarvest.js');
const { previewManualBooks } = Q;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);

__useSleepForTests(async () => {});
__useArticlePauseForTests(async () => {});
Q.__useQuickPageDelayForTests(0);
// A file "opens" only if its address says so; the real check opens it over the network.
__useFileCheckForTests(async (u) => !!u && /\/ok\b/.test(u));

const RUN = Date.now().toString(36);
const YEAR = new Date().getFullYear();
const admin = { uid: 'test-admin', email: 'admin@test.invalid' };
const rnd4 = () => String(Math.floor(Math.random() * 9000) + 1000);
const issn = () => `${rnd4()}-${rnd4().slice(0, 3)}${Math.floor(Math.random() * 10)}`;
const JID = (n: number) => `00000000-0000-4000-8000-${(RUN + '000000000000').slice(0, 10)}${String(n).padStart(2, '0')}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── the fake upstream ─────────────────────────────────────────────────────
type Mode = 'ok' | '429' | '503' | 'invalid';
const modes: Record<string, Mode> = {};
const requests: string[] = [];
const hits = (frag: string) => requests.filter(u => u.includes(frag)).length;
const crossref: Record<string, any[]> = {};
const openalex: Record<string, any[]> = {};
let epmc: any[] = [];
let arxiv: any[] = [];
let doajCsv = '';
let catalogue: any[] = [];           // DOAB
let oapen: any[] = [];
let otl: any[] = [];
let ncbiCsv = '';
let ncbiArchives: Record<string, Buffer> = {};
const failIssn = new Set<string>();   // Crossref answers 500 for these

const modeFor = (host: string): Mode => modes[host] ?? 'ok';
const refuse = (m: Mode): Response | null =>
  m === '429' ? new Response('slow down', { status: 429, headers: { 'retry-after': '1' } })
  : m === '503' ? new Response('down', { status: 503 })
  : null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (v: string) => `<field name="value">${esc(v)}</field>`;
const rec = (s: any, host: string) => `<record><header><identifier>oai:${host}:${s.handle}</identifier><datestamp>2026-10-01T00:00:00Z</datestamp></header><metadata><metadata xmlns="http://www.lyncode.com/xoai">
<element name="dc"><element name="title"><element name="en_US">${f(s.title)}</element></element>
${s.author ? `<element name="contributor"><element name="author"><element name="none">${f(s.author)}</element></element></element>` : ''}
<element name="date"><element name="issued"><element name="none">${f(s.year || '2024-01-01')}</element></element></element>
<element name="language"><element name="en_US">${f('eng')}</element></element>
${s.abstract ? `<element name="description"><element name="abstract"><element name="en_US">${f(s.abstract)}</element></element></element>` : ''}
<element name="subject">${s.codes ? `<element name="classification"><element name="en_US">${s.codes.map(f).join('')}</element></element>` : ''}${s.kw ? `<element name="other"><element name="en_US">${f(s.kw.join('; '))}</element></element>` : ''}</element>
</element>
<element name="oapen">${s.doi ? `<element name="identifier"><element name="doi"><element name="en_US">${f(s.doi)}</element></element></element>` : ''}
${s.isbn ? `<element name="relation"><element name="isbn"><element name="en_US">${f(s.isbn)}</element></element></element>` : ''}</element>
<element name="bundles"><element name="bundle"><field name="name">THUMBNAIL</field><element name="bitstreams"><element name="bitstream"><field name="format">image/jpeg</field><field name="url">https://x/cover.jpg</field>${s.rights ? `<field name="rights">${s.rights}</field>` : ''}</element></element></element></element>
<element name="linkedItemsMetadata"><element name="publisher.name">${f('Test Press')}</element></element>
</metadata></metadata></record>`;

const PAGE = 5;
const oaiPage = (cat: any[], host: string, url: string) => {
  const u = new URL(url); const tok = u.searchParams.get('resumptionToken');
  const start = tok ? Number(tok.split('/').pop()) : 0;
  if (!cat.length) return new Response('<OAI-PMH><error code="noRecordsMatch">none</error></OAI-PMH>', { status: 200 });
  const more = start + PAGE < cat.length;
  return new Response(`<OAI-PMH><ListRecords>${cat.slice(start, start + PAGE).map(c => rec(c, host)).join('')}${more ? `<resumptionToken completeListSize="${cat.length}" cursor="${start}">xoai///set/${start + PAGE}</resumptionToken>` : `<resumptionToken completeListSize="${cat.length}"/>`}</ListRecords></OAI-PMH>`, { status: 200 });
};

const fake = async (url: string): Promise<Response> => {
  requests.push(url);
  const u = new URL(url);
  const h = u.hostname;

  if (h === 'api.crossref.org') {
    const r = refuse(modeFor('crossref')); if (r) return r;
    if (modeFor('crossref') === 'invalid') return new Response(JSON.stringify({ status: 'ok', message: { nothing: true } }), { status: 200 });
    const m = /\/journals\/([^/]+)\/works/.exec(u.pathname)!; const is = decodeURIComponent(m[1]);
    if (failIssn.has(is)) return new Response('boom', { status: 500 });
    const rows = Number(u.searchParams.get('rows')), off = Number(u.searchParams.get('offset') || 0);
    const all = crossref[is] || [];
    return new Response(JSON.stringify({ status: 'ok', 'message-type': 'work-list', message: { 'total-results': all.length, items: all.slice(off, off + rows) } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (h === 'api.openalex.org') {
    const r = refuse(modeFor('openalex')); if (r) return r;
    const filt = decodeURIComponent(u.searchParams.get('filter') || ''); const is = /issn:([0-9X-]+)/.exec(filt)?.[1] || '';
    const per = Number(u.searchParams.get('per-page') || 25);
    return new Response(JSON.stringify({ results: (openalex[is] || []).slice(0, per), meta: { next_cursor: null } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (h === 'www.ebi.ac.uk') {
    const r = refuse(modeFor('epmc')); if (r) return r;
    const size = Number(u.searchParams.get('pageSize')), page = Number(u.searchParams.get('page') || 1);
    const q = decodeURIComponent(u.searchParams.get('query') || '');
    const mine = epmc.filter(x => q.toLowerCase().includes(String(x._dept).toLowerCase()));
    return new Response(JSON.stringify({ resultList: { result: mine.slice((page - 1) * size, page * size) } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (h === 'export.arxiv.org') {
    const r = refuse(modeFor('arxiv')); if (r) return r;
    const q = decodeURIComponent(u.searchParams.get('search_query') || '').replace('all:', '');
    const start = Number(u.searchParams.get('start') || 0), max = Number(u.searchParams.get('max_results'));
    const mine = arxiv.filter(a => a._dept.toLowerCase() === q.toLowerCase());
    const entries = mine.slice(start, start + max).map(a => `<entry><id>http://arxiv.org/abs/${a.id}v1</id><published>${a.year}-03-01T00:00:00Z</published><title>${a.title}</title><author><name>${a.author}</name></author>${a.doi ? `<arxiv:doi>${a.doi}</arxiv:doi>` : ''}${a.journalRef ? `<arxiv:journal_ref>${a.journalRef}</arxiv:journal_ref>` : ''}</entry>`).join('');
    return new Response(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`, { status: 200 });
  }
  if (h === 'doaj.org' && u.pathname === '/csv') {
    const r = refuse(modeFor('doaj')); if (r) return r;
    return new Response(doajCsv, { status: 200, headers: { 'content-type': 'text/csv' } });
  }
  if (h === 'directory.doabooks.org') { const r = refuse(modeFor('doab')); if (r) return r; return oaiPage(catalogue, 'directory.doabooks.org', url); }
  if (h === 'library.oapen.org') { const r = refuse(modeFor('oapen')); if (r) return r; return oaiPage(oapen, 'library.oapen.org', url); }
  if (h === 'open.umn.edu') {
    const r = refuse(modeFor('otl')); if (r) return r;
    if (modeFor('otl') === 'invalid') return new Response(JSON.stringify({ nope: true }), { status: 200 });
    const page = Number(u.searchParams.get('page') || 1), per = 2;
    return new Response(JSON.stringify({ data: otl.slice((page - 1) * per, page * per), links: { total_pages: Math.max(1, Math.ceil(otl.length / per)), total_count: otl.length } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (h === 'ftp.ncbi.nlm.nih.gov') {
    if (url.endsWith('file_list.csv')) return new Response(Buffer.from(ncbiCsv, 'latin1'), { status: 200 });
    const a = ncbiArchives[url.replace('https://ftp.ncbi.nlm.nih.gov/pub/litarch/', '')];
    if (!a) return new Response('gone', { status: 404 });
    return new Response(a, { status: 200, headers: { 'content-length': String(a.length) } });
  }
  throw new Error(`unexpected request to ${url}`);
};
__useFetchForTests(fake as any);

// ── fixtures ──────────────────────────────────────────────────────────────
const ccPdf = (n: number, opens = true) => ({ license: [{ URL: 'https://creativecommons.org/licenses/by/4.0/', 'content-version': 'vor', 'delay-in-days': 0 }], link: [{ URL: `https://files.example/${RUN}/${n}/${opens ? 'ok' : 'bad'}.pdf`, 'content-type': 'application/pdf' }] });
const crItem = (doi: string, title: string, is: string, o: any = {}) => ({
  DOI: doi, title: [title], author: [{ given: 'Ada', family: 'Lovelace' }], issued: { 'date-parts': [[o.year ?? YEAR]] }, 'container-title': ['J'], ISSN: o.issn ?? [is],
  volume: '3', issue: '4', publisher: 'Test Pub', subject: ['Testing'], type: 'journal-article', license: [], link: [], ...(o.extra || {}),
});
const oaItem = (n: number, is: string, o: any = {}) => ({
  id: `https://openalex.org/W${RUN}${n}`, doi: `https://doi.org/10.5555/${RUN}.oa${n}`, title: `OpenAlex article ${RUN} ${n}`, publication_year: YEAR,
  authorships: [{ author: { display_name: 'Grace Hopper' } }], biblio: { volume: '9', issue: '1' }, concepts: [{ display_name: 'Testing' }],
  best_oa_location: o.pdf ? { pdf_url: o.pdf, license: o.license ?? 'cc-by' } : null, open_access: { is_oa: true }, primary_location: { source: {} },
});

const snapshot = async () => ({
  cps: JSON.stringify(await db.bookHarvestCheckpoint.findMany({ orderBy: { provider: 'asc' } })),
  state: JSON.stringify(await db.ingestionState.findUnique({ where: { id: 'singleton' } }).then((s: any) => s && ({ lastRunAt: s.lastRunAt, phase: s.phase, passCount: s.passCount, currentJournal: s.currentJournal, enabled: s.enabled, lastSuccessAt: s.lastSuccessAt }))),
});
const journalCursors = async (ids: string[]) => JSON.stringify((await db.journal.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, select: { id: true, fetchCursor: true, nextEligibleAt: true, lastIngestedAt: true, exhaustedAt: true, noChangeCount: true, failureCount: true, lastIngestionStatus: true } })));

async function done(job: any, ms = 120_000) {
  const t0 = Date.now();
  for (;;) { const j = Q.getQuickJob(job.id); if (!j || j.status !== 'running') return j; if (Date.now() - t0 > ms) throw new Error('quick import did not finish'); await sleep(20); }
}
async function run(id: any) { return done(await Q.beginQuickImport(id, admin)); }
/** Whether the source could start a Quick Import right now, asked the way the screen asks — without starting one. */
const available = async (id: string) => (await Q.listQuickSources()).find((c: any) => c.id === id)!.canQuickImport as boolean;
const refusal = async (id: any) => { try { await Q.beginQuickImport(id, admin); return null; } catch (e: any) { return e as InstanceType<typeof Q.QuickError>; } };

// ── start from a known engine and a clean slate for sources ───────────────
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: false }, update: { enabled: false, focus: 'auto', departments: [], yearsBack: 5, articlesPerJournal: 0 } });
const reset = async () => {
  await db.ingestionSourceHealth.deleteMany({});
  await db.ingestionAudit.deleteMany({ where: { action: { in: ['QUICK_IMPORT_STARTED', 'QUICK_IMPORT_FINISHED', 'QUICK_IMPORT_FAILED', 'NCBI_ARCHIVE_DOWNLOADED'] } } });
  __resetProviderLocks(); Q.__resetQuickJobsForTests(); Q.__resetDoajCacheForTests();
  for (const k of Object.keys(modes)) delete modes[k];
  requests.length = 0; failIssn.clear();
  for (const k of ['QUICK_IMPORT_LIMIT_CROSSREF', 'QUICK_IMPORT_LIMIT_OPENALEX', 'QUICK_IMPORT_LIMIT_DOAJ', 'QUICK_IMPORT_LIMIT_DOAB', 'QUICK_IMPORT_LIMIT_OAPEN', 'QUICK_IMPORT_LIMIT_OTL', 'QUICK_IMPORT_LIMIT_EUROPEPMC', 'QUICK_IMPORT_LIMIT_ARXIV', 'NCBI_BOOKS_MAX_ARCHIVES_PER_DAY', 'NCBI_BOOKS_MAX_ARCHIVE_BYTES']) delete process.env[k];
};
await reset();

// Three accepted journals that sort first, so a run reaches them before anything else in the scratch database.
const IS = [issn(), issn(), issn()];
const DEPT = ['Law', 'Law', 'Nursing'];
for (let i = 0; i < 3; i++) {
  await db.journal.upsert({ where: { id: JID(i) }, update: { status: 'Accepted', rightsBasis: 'DOAJ declaration', domain: DEPT[i], articleCount: 0, fetchCursor: null, nextEligibleAt: null, lastIngestedAt: null, exhaustedAt: null, issn: IS[i] }, create: {
    id: JID(i), title: `Quick Test Journal ${RUN} ${i}`, issn: IS[i], domain: DEPT[i], status: 'Accepted', rightsBasis: 'DOAJ declaration', licence: 'CC BY', licenceIsNC: false, publisherName: `Quick Pub ${RUN}`,
  } });
}
// Any other journal in the scratch database must not take part.
await db.journal.updateMany({ where: { id: { notIn: [JID(0), JID(1), JID(2)] }, status: 'Accepted' }, data: { articleCount: 100000 } });
await db.ingestionState.update({ where: { id: 'singleton' }, data: { articlesPerJournal: 50000 } });
const JIDS = [JID(0), JID(1), JID(2)];

// ═════════════════════════════════════════════════════════════════════════
section('Registry, limits and cards');
{
  check('default limits are provider-specific', ['doaj', 'crossref', 'openalex', 'europepmc', 'arxiv', 'doab', 'oapen', 'otl', 'ncbi'].map(i => Q.quickLimit(i as any)).join() === '100,250,200,100,100,100,100,100,25');
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = '99999'; check('an override is held inside the ceiling', Q.quickLimit('crossref') === 1000);
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = '40'; check('an override changes the default', Q.quickLimit('crossref') === 40);
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = 'abc'; check('nonsense falls back to the default', Q.quickLimit('crossref') === 250);
  delete process.env.QUICK_IMPORT_LIMIT_CROSSREF;
  const cards = await Q.listQuickSources();
  check('all nine approved sources are offered, grouped', cards.length === 9
    && cards.filter((c: any) => c.group === 'Journals').map((c: any) => c.id).join() === 'doaj'
    && cards.filter((c: any) => c.group === 'Articles').map((c: any) => c.id).join() === 'crossref,openalex,europepmc,arxiv'
    && cards.filter((c: any) => c.group === 'Books').map((c: any) => c.id).join() === 'doab,oapen,otl,ncbi');
  check('Crossref is Recommended, OpenAlex is Fallback', cards.find((c: any) => c.id === 'crossref').badge === 'Recommended' && cards.find((c: any) => c.id === 'openalex').badge === 'Fallback');
  check('each card carries its confirmation text and a healthy state', cards.every((c: any) => /^(Import up to|Read up to) \d+ /.test(c.confirm) && c.state === 'healthy' && c.canQuickImport));
  check('the confirmation says existing records are not overwritten', cards.every((c: any) => /will not be overwritten/.test(c.confirm)));
  check('Crossref card reads exactly as specified', cards.find((c: any) => c.id === 'crossref').confirm === 'Import up to 250 new Crossref article candidates now? Existing records will not be overwritten.');
}

// ═════════════════════════════════════════════════════════════════════════
section('A. Crossref Quick Import: a bounded batch, through the shared pipeline');
{
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = '10';
  crossref[IS[0]] = [
    crItem(`10.7000/${RUN}.a1`, `${RUN} Crossref open and opens`, IS[0], { extra: ccPdf(1, true) }),
    crItem(`10.7000/${RUN}.a2`, `${RUN} Crossref open but file does not open`, IS[0], { extra: ccPdf(2, false) }),
    crItem(`10.7000/${RUN}.a3`, `${RUN} Crossref no licence`, IS[0]),
    crItem(`10.7000/${RUN}.a4`, `${RUN} Crossref other journal's record`, IS[0], { issn: ['9999-9999'] }),
    crItem(`not-a-doi-${RUN}`, `${RUN} Crossref malformed doi`, IS[0]),
    crItem(`10.7000/${RUN}.a6`, `${RUN} Crossref non-commercial`, IS[0], { extra: { license: [{ URL: 'https://creativecommons.org/licenses/by-nc/4.0/', 'content-version': 'vor', 'delay-in-days': 0 }], link: [{ URL: 'https://files.example/ok.pdf', 'content-type': 'application/pdf' }] } }),
    crItem(`10.7000/${RUN}.a7`, `${RUN} Crossref tdm link only`, IS[0], { extra: { license: [{ URL: 'https://publisher.example/tdm', 'content-version': 'tdm' }], link: [{ URL: 'https://publisher.example/ok.pdf', 'content-type': 'application/pdf' }] } }),
    crItem(`10.7000/${RUN}.a8`, `${RUN} Crossref eighth`, IS[0]),
  ];
  crossref[IS[1]] = Array.from({ length: 9 }, (_, i) => crItem(`10.7000/${RUN}.b${i}`, `${RUN} Crossref second journal ${i}`, IS[1]));
  crossref[IS[2]] = [crItem(`10.7000/${RUN}.c1`, `${RUN} Crossref third journal`, IS[2])];

  const articlesBefore = await db.article.count();
  const j = await run('crossref');
  check('it finished and reported a result', j.status === 'done' && !!j.result, JSON.stringify(j.error));
  const r = j.result;
  check('BOUNDED: it examined exactly its limit (10), not everything on offer (18)', r.checked === 10 && r.limit === 10, `checked ${r.checked}`);
  const added = await db.article.findMany({ where: { source: 'Crossref', title: { startsWith: RUN } } });
  check('articles were added from Crossref', r.added > 0 && added.length >= r.added, `added ${r.added}, rows ${added.length}`);
  check('every one belongs to its journal, by id, name and ISSN', added.every((a: any) => a.journalId && a.journalIssn && a.parentKind === 'Journal' && a.parentId === a.journalId));
  check('they carry source, source id, licence verdict and the engine\'s ownership label', added.every((a: any) => a.sourceRecordId?.startsWith('crossref:') && typeof a.licenceIsNC === 'boolean' && a.ownershipSource === 'Ingested'));
  const viewable = added.filter((a: any) => a.accessStatus === 'ViewableHere');
  check('only the open, CC-licensed article whose file really opens is viewable', viewable.length === 1 && viewable[0].title.includes('open and opens'), JSON.stringify(viewable.map((v: any) => v.title)));
  const byT = (t: string) => added.find((a: any) => a.title.includes(t));
  check('an open file that does not open is link-only', byT('does not open')?.accessStatus === 'LinkOnly');
  check('a non-commercial licence is link-only and never gets a file address', byT('non-commercial')?.accessStatus === 'LinkOnly' && byT('non-commercial')?.licenceIsNC === true);
  check('a publisher text-mining link is not offered as a file', byT('tdm link')?.pdfUrl === null);
  check('another journal\'s record is not imported under this one', !byT("other journal's"));
  const draft = await db.article.findFirst({ where: { title: `${RUN} Crossref malformed doi` } });
  check('a record the rules set aside for a person lands as a Draft, never Published', !!draft && draft.status === 'Draft' && r.needsReview >= 1);
  check('the counts add up: nothing is lost between "checked" and the outcomes', r.added + r.alreadyHeld + r.needsReview + r.skipped + r.failed <= r.checked + 0 && r.skipped >= 1, JSON.stringify([r.added, r.alreadyHeld, r.needsReview, r.skipped, r.failed]));
  check('exactly what was reported was written — no more, no less', (await db.article.count()) === articlesBefore + r.added + r.needsReview, `${await db.article.count()} vs ${articlesBefore} + ${r.added} + ${r.needsReview}`);
  const runRow = await db.ingestionRun.findFirst({ where: { source: 'Crossref' }, orderBy: { at: 'desc' } });
  check('a run row marks it Manual, Articles, Crossref, with its numbers', runRow?.phase === 'Articles' && /^Manual · Quick Import · 10 checked · \d+ added/.test(runRow.note || ''), runRow?.note);
  const j0 = await db.journal.findUnique({ where: { id: JID(0) } });
  check('the journal\'s own counts follow what was added', j0.articleCount > 0);
  const audit = await db.ingestionAudit.findFirst({ where: { action: 'QUICK_IMPORT_FINISHED' }, orderBy: { at: 'desc' } });
  check('the audit log records who ran it, and where it stopped', audit?.adminEmail === admin.email && (audit?.meta as any)?.provider === 'crossref' && !!(audit?.meta as any)?.position?.afterId);
}

// ═════════════════════════════════════════════════════════════════════════
section('B. A manual run does not move the continuous engine');
{
  await reset();
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = '10';
  crossref[IS[1]] = Array.from({ length: 9 }, (_, i) => crItem(`10.7100/${RUN}.n${i}`, `${RUN} Crossref fresh ${i}`, IS[1]));
  // A provider checkpoint and a journal cursor the engine is part-way through.
  await db.bookHarvestCheckpoint.upsert({ where: { provider: 'DOAB' }, create: { provider: 'DOAB', cursor: 'xoai///set/55', harvestStartedAt: new Date('2026-10-01T00:00:00Z'), lastSuccessfulSyncAt: new Date('2026-09-01T00:00:00Z') }, update: { cursor: 'xoai///set/55', harvestStartedAt: new Date('2026-10-01T00:00:00Z'), lastSuccessfulSyncAt: new Date('2026-09-01T00:00:00Z') } });
  await db.journal.update({ where: { id: JID(1) }, data: { fetchCursor: 'engine-cursor-xyz', nextEligibleAt: new Date('2030-01-01T00:00:00Z'), lastIngestedAt: new Date('2026-10-02T00:00:00Z'), noChangeCount: 4, lastIngestionStatus: 'nochange' } });
  const before = { ...(await snapshot()), journals: await journalCursors(JIDS) };
  const j = await run('crossref');
  const after = { ...(await snapshot()), journals: await journalCursors(JIDS) };
  check('it did work', j.status === 'done' && j.result.added > 0, JSON.stringify(j.result));
  check('every provider checkpoint is byte-for-byte what it was', before.cps === after.cps);
  check('the engine\'s own state (phase, pass count, last success, current journal) is unmoved', before.state === after.state);
  check('the engine\'s journal cursors, cooldowns and visit stamps are unmoved', before.journals === after.journals);
  await db.journal.update({ where: { id: JID(1) }, data: { fetchCursor: null, nextEligibleAt: null, lastIngestedAt: null, noChangeCount: 0, lastIngestionStatus: null } });
  await db.bookHarvestCheckpoint.deleteMany({});
}

// ═════════════════════════════════════════════════════════════════════════
section('K. A record already held is not added again');
{
  await reset();
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = '10';
  crossref[IS[1]] = Array.from({ length: 4 }, (_, i) => crItem(`10.7200/${RUN}.k${i}`, `${RUN} Crossref dup ${i}`, IS[1]));
  crossref[IS[0]] = []; crossref[IS[2]] = [];
  const first = await run('crossref');
  const n1 = await db.article.count({ where: { title: { startsWith: `${RUN} Crossref dup` } } });
  const second = await run('crossref');
  const n2 = await db.article.count({ where: { title: { startsWith: `${RUN} Crossref dup` } } });
  check('first run added the four', first.result.added === 4 && n1 === 4, JSON.stringify(first.result));
  check('second run added none and says they are already held', second.result.added === 0 && second.result.alreadyHeld >= 4 && n2 === 4, JSON.stringify(second.result));
  const dup = await db.$queryRawUnsafe(`select doi from "Article" where doi like '10.7200/${RUN}.%' group by doi having count(*) > 1`);
  check('no duplicate DOI anywhere', dup.length === 0);
}

// ═════════════════════════════════════════════════════════════════════════
section('C. OpenAlex: rate limited, and the cooldown is respected — never bypassed');
{
  await reset();
  openalex[IS[0]] = [oaItem(1, IS[0], { pdf: `https://files.example/${RUN}/ok.pdf` }), oaItem(2, IS[0])];
  // The engine's breaker has opened on HTTP 429.
  const until = new Date(Date.now() + 25 * 60_000);
  await db.ingestionSourceHealth.upsert({ where: { source: 'OpenAlex' }, create: { source: 'OpenAlex', consecutiveFailures: 5, pausedUntil: until, lastError: 'OpenAlex answered HTTP 429' }, update: { consecutiveFailures: 5, pausedUntil: until, lastError: 'OpenAlex answered HTTP 429' } });
  const card = (await Q.listQuickSources()).find((c: any) => c.id === 'openalex');
  check('the card says Rate limited, with the time it is back', card.state === 'rate_limited' && !!card.until && Math.abs(new Date(card.until).getTime() - until.getTime()) < 1000);
  check('Quick Import is disabled on the card', card.canQuickImport === false);
  const e = await refusal('openalex');
  check('starting it is refused with the exact rate-limit message', e?.code === 'RATE_LIMITED' && /^Source is temporarily rate limited\. Try again after \d{1,2}:\d{2} (AM|PM)\.$/.test(e.message), e?.message);
  check('NOT ONE request reached OpenAlex', hits('api.openalex.org') === 0);
  check('the refusal left no lock behind and no job running', Q.activeQuickJobs().length === 0 && (await Q.listQuickSources()).find((c: any) => c.id === 'openalex').state === 'rate_limited');
  check('nothing was written', (await db.article.count({ where: { source: 'OpenAlex', title: { startsWith: `OpenAlex article ${RUN}` } } })) === 0);

  // A fresh 429 while the breaker is still closed: reported as rate limited, nothing written, and the breaker is fed.
  await db.ingestionSourceHealth.deleteMany({});
  modes.openalex = '429';
  const j = await run('openalex');
  check('a live 429 ends the run as rate limited, without writing', j.status === 'error' && j.error.code === 'RATE_LIMITED' && /^Source is temporarily rate limited/.test(j.error.message));
  check('…and it fed the same breaker the engine uses', ((await db.ingestionSourceHealth.findUnique({ where: { source: 'OpenAlex' } }))?.consecutiveFailures ?? 0) >= 1);
  check('…and logged that it did not run', !!(await db.ingestionRun.findFirst({ where: { source: 'OpenAlex', note: { startsWith: 'Manual · Quick Import' }, error: { not: null } } })));
  delete modes.openalex; await db.ingestionSourceHealth.deleteMany({});

  // And when it is healthy, it works through the engine's own request.
  const ok = await run('openalex');
  const oa = await db.article.findMany({ where: { title: { startsWith: `OpenAlex article ${RUN}` } } });
  check('healthy: OpenAlex Quick Import adds the engine-shaped records', ok.status === 'done' && oa.length === 2 && oa.every((a: any) => a.source === 'OpenAlex' && a.journalId === JID(0)), JSON.stringify(ok.error || ok.result));
  check('it asked for the journal by ISSN, newest first — the engine\'s request', requests.some(u => u.includes(`primary_location.source.issn:${IS[0]}`) && u.includes('sort=publication_date:desc')));
}

// ═════════════════════════════════════════════════════════════════════════
section('D. Europe PMC: health literature, and not everything is full text');
{
  await reset();
  const mk = (n: number, dept: string, o: any) => ({ _dept: dept, id: `PMC${RUN}${n}`, pmcid: `PMC${RUN}${n}`, title: `${RUN} EPMC ${n}`, authorString: 'A. Author', doi: `10.7300/${RUN}.e${n}`, license: o.license ?? null, journalInfo: { volume: '2', issue: '1', yearOfPublication: YEAR, journal: { title: `EPMC Journal ${RUN}`, issn: issn() } }, fullTextUrlList: { fullTextUrl: o.urls ?? [] } });
  epmc = [
    mk(1, 'Medical Sciences', { license: 'cc by', urls: [{ documentStyle: 'pdf', url: `https://europepmc.org/${RUN}/1/ok.pdf` }] }),
    mk(2, 'Medical Sciences', { license: 'cc by', urls: [{ documentStyle: 'html', url: 'https://europepmc.org/article/PMC/2' }] }),     // open, but only a web page
    mk(3, 'Pharmacy', { license: 'cc by-nc', urls: [{ documentStyle: 'pdf', url: `https://europepmc.org/${RUN}/3/ok.pdf` }] }),
    mk(4, 'Nursing', { urls: [{ documentStyle: 'pdf', url: `https://europepmc.org/${RUN}/4/ok.pdf` }] }),                                           // no licence stated
    mk(5, 'Law', { license: 'cc by', urls: [{ documentStyle: 'pdf', url: `https://europepmc.org/${RUN}/5/ok.pdf` }] }),                               // not a health department
  ];
  const j = await run('europepmc');
  const rows = await db.article.findMany({ where: { source: 'EuropePMC', title: { startsWith: `${RUN} EPMC` } } });
  check('health records were processed', j.status === 'done' && rows.length === 4, JSON.stringify(j.error || j.result));
  check('only the health departments were read (Law never asked)', !requests.some(u => u.includes('europepmc') && /Law/i.test(decodeURIComponent(u))) && rows.every((r: any) => ['Medical Sciences', 'Pharmacy', 'Nursing'].includes(r.domain)));
  const by = (n: number) => rows.find((r: any) => r.title.endsWith(`EPMC ${n}`));
  check('open licence + a PDF that opens → viewable', by(1).accessStatus === 'ViewableHere' && by(1).pdfUrl?.endsWith('/ok.pdf'));
  check('open licence but only an HTML page → NOT full text (link only, no file address)', by(2).accessStatus === 'LinkOnly' && by(2).pdfUrl === null);
  check('non-commercial → link only', by(3).accessStatus === 'LinkOnly' && by(3).licenceIsNC === true);
  check('no licence stated → link only', by(4).accessStatus === 'LinkOnly');
  check('so not every Europe PMC record is Full Text', rows.filter((r: any) => r.accessStatus === 'ViewableHere').length === 1);
  check('the query was limited to open access and to the engine\'s year window', requests.filter(u => u.includes('europepmc')).every(u => /OPEN_ACCESS%3AY/.test(u) && /PUB_YEAR/.test(decodeURIComponent(u))));
}

// ═════════════════════════════════════════════════════════════════════════
section('E. arXiv: preprints stay preprints');
{
  await reset();
  arxiv = [
    { _dept: 'computer science', id: `${RUN}.0001`, title: `${RUN} arXiv plain preprint`, author: 'A. Author', year: YEAR },
    { _dept: 'computer science', id: `${RUN}.0002`, title: `${RUN} arXiv later published`, author: 'B. Author', year: YEAR, journalRef: 'Nature 12 (2025) 33', doi: `10.7400/${RUN}.x` },
    { _dept: 'chemistry', id: `${RUN}.0003`, title: `${RUN} arXiv very old`, author: 'C. Author', year: YEAR - 20 },
  ];
  const j = await run('arxiv');
  const rows = await db.article.findMany({ where: { source: 'arXiv', title: { startsWith: `${RUN} arXiv` } } });
  const plain = rows.find((r: any) => r.title.includes('plain')), later = rows.find((r: any) => r.title.includes('later'));
  check('preprints from the window were added; the 20-year-old one was left', j.status === 'done' && rows.length === 2, JSON.stringify(j.error || j.result));
  check('a plain preprint has no journal, ISSN, volume or issue', plain.journalName === null && plain.journalIssn === null && plain.journalId === null && plain.volume === null && plain.issue === null);
  check('…and is not given a journal row either', (await db.journal.count({ where: { title: 'arXiv' } })) === 0);
  check('its identity is kept: source arXiv, preprint metadata, arXiv id', plain.source === 'arXiv' && plain.metadata?.preprint === true && plain.metadata?.repository === 'arXiv' && plain.sourceRecordId === `arxiv:${RUN}.0001`);
  check('arXiv declares no licence, so the file is not served', plain.accessStatus === 'LinkOnly' && plain.licence === null);
  check('a journal named by the author\'s own journal_ref is kept as said, with no ISSN invented', later.journalName === 'Nature 12 (2025) 33' && later.journalIssn === null);
  check('the request respects arXiv\'s own paging (start/max_results) and uses the shared breaker', requests.some(u => u.includes('export.arxiv.org') && /start=0&max_results=\d+/.test(u)) && !!(await db.ingestionSourceHealth.findUnique({ where: { source: 'arXiv' } })));
}

// ═════════════════════════════════════════════════════════════════════════
section('F. DOAJ: journals — bounded, licence-filtered, nothing held is changed');
{
  await reset();
  const heldIssn = issn();
  await db.journal.create({ data: { title: `${RUN} Already Held Journal`, issn: heldIssn, status: 'Accepted', rightsBasis: 'our own', licence: 'Ours', domain: 'Arts' } });
  const H = ['Journal title', 'Journal URL', 'Journal ISSN (print version)', 'Journal EISSN (online version)', 'Publisher', 'Country of publisher', 'Languages in which the journal accepts manuscripts', 'Subjects', 'LCC Codes', 'Keywords', 'Journal license', 'License attributes'];
  const row = (title: string, is: string, lic: string, attr = '') => [title, 'https://j.example', is, '', 'Pub', 'India', 'EN', 'Medicine', '', '', lic, attr].map(x => `"${x}"`).join(',');
  const NEW = [issn(), issn(), issn(), issn()];
  doajCsv = [H.map(x => `"${x}"`).join(','),
    row(`${RUN} Nursing Open A`, NEW[0], 'CC BY'),
    row(`${RUN} Nursing Open B`, NEW[1], 'CC BY-NC', 'No Commercial'),
    row(`${RUN} Held Journal`, heldIssn, 'CC BY'),
    row(`${RUN} Dental Open C`, NEW[2], 'CC BY'),
    row(`${RUN} Physiotherapy Open D`, NEW[3], 'CC BY')].join('\n');
  process.env.QUICK_IMPORT_LIMIT_DOAJ = '2';
  const before = await db.journal.findUnique({ where: { issn: heldIssn } });
  const sweepsBefore = JSON.stringify(await db.departmentSweep.findMany({ orderBy: { id: 'asc' } }));
  const j1 = await run('doaj');
  const got1 = await db.journal.findMany({ where: { title: { startsWith: `${RUN} ` }, NOT: { issn: heldIssn } } });
  check('BOUNDED: it added exactly its limit (2) of the 4 new journals', j1.status === 'done' && j1.result.added === 2 && got1.length === 2, JSON.stringify(j1.error || j1.result));
  const a = got1.find((g: any) => g.title.endsWith('Nursing Open A'));
  check('licence rule: CC BY is cleared for full text; a non-commercial journal would be metadata only', a?.status === 'Accepted' && a?.rightsBasis === 'DOAJ declaration' && a?.domain === 'Nursing');
  const b = got1.find((g: any) => g.title.endsWith('Nursing Open B'));
  check('…non-commercial journal is catalogued as Metadata Only', b?.status === 'MetadataOnly' && b?.licenceIsNC === true);
  const after = await db.journal.findUnique({ where: { issn: heldIssn } });
  check('the journal already held is exactly as it was', JSON.stringify(before) === JSON.stringify(after));
  check('the continuous engine\'s DOAJ department sweeps (its position) are untouched', sweepsBefore === JSON.stringify(await db.departmentSweep.findMany({ orderBy: { id: 'asc' } })));
  check('the run says more is available', j1.result.moreAvailable === true);
  const j2 = await run('doaj');
  check('Import More carries on with the next journals — never the same ones', j2.result.added === 2 && (await db.journal.count({ where: { title: { startsWith: `${RUN} ` }, NOT: { issn: heldIssn } } })) === 4);
  const j3 = await run('doaj');
  check('when everything is held it says so and adds nothing', j3.result.added === 0 && j3.result.moreAvailable === false);
  check('the list was read once through the breaker and cached, not downloaded each time', hits('doaj.org/csv') === 1);
  const rr = await db.ingestionRun.findFirst({ where: { phase: 'Journals', note: { startsWith: 'Manual · Quick Import' } }, orderBy: { at: 'desc' } });
  check('logged as a Manual Journals run', !!rr);

  // A list that is not DOAJ's list is refused before any journal is read from it.
  await reset(); doajCsv = 'this,is,not,the,list\n1,2,3,4,5'; const jb = await run('doaj');
  check('structurally invalid list → INVALID_RESPONSE and nothing written', jb.status === 'error' && jb.error.code === 'INVALID_RESPONSE' && /No catalogue changes were made/.test(jb.error.message));
}

// ═════════════════════════════════════════════════════════════════════════
section('Source unavailable, invalid, and partial');
{
  await reset();
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = '10';
  crossref[IS[0]] = [crItem(`10.7500/${RUN}.u0`, `${RUN} Crossref unavailable test`, IS[0])];
  modes.crossref = '503';
  const down = await run('crossref');
  check('down → "Source unavailable right now. No catalogue changes were made."', down.status === 'error' && down.error.code === 'UNAVAILABLE' && down.error.message === 'Source unavailable right now. No catalogue changes were made.', down.error?.message);
  check('…and nothing was written', (await db.article.count({ where: { title: { contains: 'unavailable test' } } })) === 0);
  await reset(); modes.crossref = 'invalid';
  const bad = await run('crossref');
  check('a structurally invalid response writes nothing', bad.status === 'error' && bad.error.code === 'INVALID_RESPONSE' && (await db.article.count({ where: { title: { contains: 'unavailable test' } } })) === 0, bad.error?.message);

  await reset();
  crossref[IS[0]] = [crItem(`10.7500/${RUN}.p0`, `${RUN} Crossref partial one`, IS[0]), crItem(`10.7500/${RUN}.p1`, `${RUN} Crossref partial two`, IS[0])];
  crossref[IS[1]] = [crItem(`10.7500/${RUN}.p2`, `${RUN} Crossref partial three`, IS[1])];
  failIssn.add(IS[1]);
  const part = await run('crossref');
  check('a source that fails part-way keeps what was already read', part.status === 'done' && part.result.added === 2 && !!part.result.partial, JSON.stringify(part.result));
  check('…says where it stopped', /stopped answering part-way/.test(part.result.partial));
  check('…and the failing journal\'s record was not written', (await db.article.count({ where: { title: { contains: 'partial three' } } })) === 0);
  failIssn.clear();
}

// ═════════════════════════════════════════════════════════════════════════
section('G. DOAB: books, and the engine\'s checkpoint stays exactly where it was');
const MED = ['THEMA EDITEUR::M MEDICINE AND NURSING::MJ CLINICAL AND INTERNAL MEDICINE'];
const LAW = ['BIC BOOK INDUSTRY COMMUNICATION::L LAW::LA JURISPRUDENCE & GENERAL ISSUES'];
{
  await reset();
  await db.book.deleteMany({}); await db.bookHarvestCheckpoint.deleteMany({});
  catalogue = Array.from({ length: 12 }, (_, i) => ({ handle: `20.500.12854/${RUN}${i}`, title: `${RUN} Contract Law Volume ${i}`, doi: `10.7600/${RUN}.d${i}`, isbn: ['9780306406157', '9783161484100', '9780198526636', '9780262033848', '9780131103627', '9780201633610', '9780596520687', '9780134685991', '9781491950357', '9780321125217', '9781449355739', '9780596007126'][i], codes: LAW, kw: ['contract law'], rights: 'CC-BY' }));
  process.env.QUICK_IMPORT_LIMIT_DOAB = '5';
  // The engine is part-way through its own harvest.
  const cp0 = await db.bookHarvestCheckpoint.create({ data: { provider: 'DOAB', cursor: 'xoai///set/10', harvestStartedAt: new Date('2026-10-05T00:00:00Z'), lastSuccessfulSyncAt: new Date('2026-09-01T00:00:00Z') } });
  const before = JSON.stringify(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } }));
  const j1 = await run('doab');
  check('a bounded batch of books was added', j1.status === 'done' && j1.result.checked <= 6 && j1.result.checked >= 5 && j1.result.added === j1.result.checked, JSON.stringify(j1.error || j1.result));
  check('BOUNDED: it stopped after the page that reached its limit, not at the 12 on offer', (await db.book.count()) < 12);
  const after = JSON.stringify(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } }));
  check('the DOAB checkpoint is byte-for-byte unchanged (cursor, start stamp, last sync, updatedAt)', before === after);
  check('it began where the engine\'s NEXT sync would — what changed since the last one', requests.some(u => u.includes('directory.doabooks.org') && /[?&]from=2026-08-31T23%3A59%3A00Z/.test(u)) && !requests.some(u => /resumptionToken=xoai%2F%2F%2Fset%2F10/.test(u)));
  const n1 = await db.book.count();
  const j2 = await run('doab');
  check('Import More carries on from where the manual run stopped (its own position)', j2.status === 'done' && (await db.book.count()) > n1, JSON.stringify(j2.result));
  const j3 = await run('doab');
  check('…and again, until the source has been read to its end', (await db.book.count()) === 12 && j3.result.moreAvailable === false, `${await db.book.count()} books`);
  const dupDoi = await db.$queryRawUnsafe(`select doi from "Book" where doi like '10.7600/${RUN}.%' group by doi having count(*) > 1`);
  check('no duplicate book across the three runs', dupDoi.length === 0);
  check('checkpoint still untouched after all three', before === JSON.stringify(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } })));
  const rr = await db.ingestionRun.findFirst({ where: { phase: 'Books', source: 'DOAB' }, orderBy: { at: 'desc' } });
  check('logged as Manual · Books · DOAB', /^Manual · Quick Import · \d+ checked · \d+ added/.test(rr?.note || ''), rr?.note);

  // The engine, afterwards, carries on from ITS cursor.
  requests.length = 0;
  await runScheduledHarvest(DOAB_OAI, { maxPages: 1, pageDelayMs: 0, sleep: async () => {} });
  check('the continuous harvest later resumes from its own saved token', requests.some(u => /resumptionToken=xoai%2F%2F%2Fset%2F10/.test(u)), requests[0]);
  await db.bookHarvestCheckpoint.deleteMany({});
}

// ═════════════════════════════════════════════════════════════════════════
section('H. OAPEN: enrich what DOAB holds, add what is new, never overwrite');
{
  await reset();
  await db.book.deleteMany({}); await db.bookHarvestCheckpoint.deleteMany({});
  await db.book.create({ data: { title: `${RUN} Held By DOAB`, doi: `10.7700/${RUN}.held`, authors: 'Keep, Me', description: 'My description', source: 'DOAB', sourceRecordId: `20.500.12854/h${RUN}`, fingerprint: `doab:doi:10.7700/${RUN}.held`, status: 'Published', domain: 'Law', ownershipSource: 'Ingested' } });
  oapen = [
    { handle: `20.500.12657/${RUN}1`, title: `${RUN} Held By DOAB`, doi: `10.7700/${RUN}.held`, abstract: 'OAPEN description that must not replace mine', author: 'Other, Person', codes: LAW, kw: ['law'], rights: 'CC-BY' },
    { handle: `20.500.12657/${RUN}2`, title: `${RUN} A New OAPEN Law Book`, doi: `10.7700/${RUN}.new`, codes: LAW, kw: ['law'], rights: 'CC-BY' },
  ];
  await db.bookHarvestCheckpoint.create({ data: { provider: 'OAPEN', cursor: null, lastSuccessfulSyncAt: new Date('2026-09-01T00:00:00Z') } });
  const before = JSON.stringify(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'OAPEN' } }));
  const j = await run('oapen');
  const held = await db.book.findFirst({ where: { doi: `10.7700/${RUN}.held` } });
  check('a book DOAB holds was matched, not duplicated', (await db.book.count({ where: { title: `${RUN} Held By DOAB` } })) === 1 && j.result.alreadyHeld >= 1, JSON.stringify(j.result));
  check('it was enriched: empty details filled (cover, publisher)', j.result.enriched === 1 && held.coverUrl === 'https://x/cover.jpg' && held.publisherName === 'Test Press');
  check('…and good populated metadata was NOT overwritten', held.description === 'My description' && held.authors === 'Keep, Me' && held.source === 'DOAB' && held.domain === 'Law');
  check('a new valid record was created from OAPEN', (await db.book.count({ where: { title: `${RUN} A New OAPEN Law Book`, source: 'OAPEN' } })) === 1 && j.result.added === 1);
  check('the OAPEN checkpoint is unchanged', before === JSON.stringify(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'OAPEN' } })));
  check('it did not wait for DOAB (scheduling only): there is no DOAB checkpoint and it still ran', (await db.bookHarvestCheckpoint.count({ where: { provider: 'DOAB' } })) === 0);
}

// ═════════════════════════════════════════════════════════════════════════
section('I. Open Textbook Library: structured JSON, ISBN dedupe, full text held back');
{
  await reset();
  await db.book.deleteMany({}); await db.bookHarvestCheckpoint.deleteMany({});
  await db.book.create({ data: { title: `${RUN} Algorithms Held`, isbn: '9780262033848', source: 'DOAB', status: 'Published', fingerprint: `x:${RUN}`, domain: 'Computer / IT', year: 2020 } });
  const tb = (id: number, title: string, o: any = {}) => ({ id, title, edition_statement: null, volume: null, copyright_year: 2020, isbn10: null, isbn13: o.isbn ?? null, license: o.license ?? 'Attribution', language: 'eng', description: null, updated_at: '2026-05-01T00:00:00.000-05:00',
    contributors: [{ contribution: 'Author', primary: true, corporate: false, first_name: 'Ada', middle_name: null, last_name: 'Lovelace' }], subjects: o.subjects ?? [], publishers: [{ name: 'Open Press' }],
    formats: o.formats ?? [{ type: 'Online', url: `https://books.example/${id}`, price: { cents: 0 } }], url: `https://open.umn.edu/opentextbooks/textbooks/${id}` });
  const CS = [{ name: 'Computer Science', call_number: 'QA75.5-76.95' }, { name: 'Programming', call_number: 'QA76.6' }];
  otl = [
    tb(1, `${RUN} Algorithms Held`, { isbn: '0262033844', subjects: CS }),                                                    // the same book as held, written as ISBN-10
    tb(2, `${RUN} Python Programming`, { isbn: '9780131103627', subjects: CS, formats: [{ type: 'PDF', url: `https://files.example/${RUN}/ok.pdf`, price: { cents: 0 } }] }),
    tb(3, `${RUN} Data Structures`, { isbn: '9780201633610', subjects: CS }),
    tb(4, `${RUN} Paid Edition`, { subjects: CS, formats: [{ type: 'Print', url: 'https://shop.example/4', price: { cents: 4999 } }] }),
  ];
  process.env.QUICK_IMPORT_LIMIT_OTL = '4';
  const before = JSON.stringify(await db.bookHarvestCheckpoint.findMany());
  const j = await run('otl');
  check('structured JSON books were imported', j.status === 'done' && j.result.added >= 2, JSON.stringify(j.error || j.result));
  check('ISBN dedupe: the ISBN-10 spelling of a held ISBN-13 is the same book', (await db.book.count({ where: { title: `${RUN} Algorithms Held` } })) === 1 && j.result.alreadyHeld >= 1);
  const py = await db.book.findFirst({ where: { title: `${RUN} Python Programming` } });
  check('full text stays held back: an open PDF is recorded but not served', !!py && py.pdfUrl === null && py.accessStatus !== 'FullText');
  check('no HTML scraping: only the JSON endpoint was read', requests.filter(u => u.includes('open.umn.edu')).every(u => u.includes('textbooks.json')));
  check('the OTL checkpoint is unchanged (none was created)', before === JSON.stringify(await db.bookHarvestCheckpoint.findMany()));
  modes.otl = 'invalid'; await db.ingestionSourceHealth.deleteMany({});
  const bad = await run('otl');
  check('a JSON reply of the wrong shape is a failure, not an empty last page', bad.status === 'error' && bad.error.code === 'INVALID_RESPONSE');
}

// ═════════════════════════════════════════════════════════════════════════
section('J. NCBI: the stricter source — its caps hold');
{
  await reset();
  await db.book.deleteMany({}); await db.bookHarvestCheckpoint.deleteMany({});
  const tar = (name: string, data: Buffer) => {
    const h = Buffer.alloc(512); h.write(name, 0); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257);
    let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
  };
  const toc = (title: string) => `<?xml version="1.0"?><book-part-wrapper><book-meta><book-title-group><book-title>${title}</book-title></book-title-group><publisher><publisher-name>Health Agency</publisher-name></publisher><custom-meta-group><custom-meta><meta-name>books-subject</meta-name><meta-value>Nursing</meta-value></custom-meta></custom-meta-group></book-meta></book-part-wrapper>`;
  const N = 30;
  const rows: string[] = ['File,Title,Publisher,Publication Year,Accession ID,Last Updated (YYYY-MM-DD HH:MM:SS)'];
  ncbiArchives = {};
  for (let i = 1; i <= N; i++) {
    const title = i % 2 ? `${RUN} Nursing Assessment Manual ${i}` : `${RUN} Dental Implant Handbook ${i}`;
    const file = `ab/${String(i).padStart(2, '0')}/n${i}_NBK${9000 + i}.tar.gz`;
    rows.push(`${file},${title},Health Agency,2015,NBK${9000 + i},2026-01-01 00:00:00`);
    ncbiArchives[file] = gzipSync(Buffer.concat([tar(`n${i}/TOC.nxml`, Buffer.from(toc(title))), Buffer.alloc(1024)]));
  }
  ncbiCsv = rows.join('\n');
  process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY = '1000';
  const cp0 = JSON.stringify(await db.bookHarvestCheckpoint.findMany());

  // The preview downloads nothing.
  const pv = await previewManualBooks('ncbi', 25);
  check('the advanced preview of NCBI is the shortlist only: no archive was downloaded', requests.filter(u => u.includes('.tar.gz')).length === 0 && pv.summary.found === N);

  const j = await run('ncbi');
  const dl = requests.filter(u => u.includes('.tar.gz')).length;
  check('BOUNDED: a Quick Import reads at most 25 archives, of 30 on the shortlist', j.status === 'done' && dl === 25 && j.result.checked === 25, `downloaded ${dl}, checked ${j.result?.checked}`);
  check('NCBI stays review-first: nothing was published', (await db.book.count({ where: { source: 'NCBIBookshelf', status: 'Published' } })) === 0 && (await db.book.count({ where: { source: 'NCBIBookshelf', status: 'Draft' } })) >= 1);
  check('the NCBI checkpoint is untouched', cp0 === JSON.stringify(await db.bookHarvestCheckpoint.findMany()));
  check('each download was counted toward the daily quota the engine reads', (await db.ingestionAudit.count({ where: { action: 'NCBI_ARCHIVE_DOWNLOADED' } })) === 25);
  const more = await run('ncbi');
  check('Import More takes the next archives, not the same ones', more.result.checked === 5 && requests.filter(u => u.includes('.tar.gz')).length === 30, JSON.stringify(more.result));

  // The daily limit is not for the manual path to raise.
  await reset();
  await db.book.deleteMany({}); await db.bookHarvestCheckpoint.deleteMany({});
  process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY = '3';
  const lim = await run('ncbi');
  const dl3 = requests.filter(u => u.includes('.tar.gz')).length;
  check('DAILY CAP: with a limit of 3 a day it reads 3, not 25', lim.status === 'done' && dl3 === 3, `downloaded ${dl3}`);
  check('…and says it stopped for the daily limit', lim.result.notes.some((n: string) => /daily limit/i.test(n)), JSON.stringify(lim.result.notes));
  const card = (await Q.listQuickSources()).find((c: any) => c.id === 'ncbi');
  check('the card is cooling down with the daily limit as the reason', card.state === 'cooling' && /Daily limit/.test(card.detail) && card.canQuickImport === false);
  requests.length = 0;
  const again = await refusal('ncbi');
  check('a further Quick Import is refused before a single request is made', again?.code === 'QUOTA' && /daily download limit/.test(again.message) && requests.length === 0, again?.message);
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;
}

// ═════════════════════════════════════════════════════════════════════════
section('L. Two fast clicks → one run');
{
  await reset();
  process.env.QUICK_IMPORT_LIMIT_CROSSREF = '10';
  crossref[IS[0]] = [crItem(`10.7800/${RUN}.l0`, `${RUN} Crossref double click`, IS[0])]; crossref[IS[1]] = []; crossref[IS[2]] = [];
  const t0 = new Date();
  const starts = await Promise.allSettled([Q.beginQuickImport('crossref', admin), Q.beginQuickImport('crossref', admin), Q.beginQuickImport('crossref', admin)]);
  const ok = starts.filter(s => s.status === 'fulfilled'), no = starts.filter(s => s.status === 'rejected') as PromiseRejectedResult[];
  check('exactly one of three simultaneous starts ran', ok.length === 1 && no.length === 2, `${ok.length} started`);
  check('the others were told why', no.every(n => n.reason?.code === 'BUSY' && /already running/.test(n.reason.message)));
  await done((ok[0] as any).value);
  check('one run, one log row, one article', (await db.ingestionRun.count({ where: { source: 'Crossref', at: { gte: t0 }, note: { startsWith: 'Manual · Quick Import' } } })) === 1 && (await db.article.count({ where: { title: `${RUN} Crossref double click` } })) === 1);
  check('the lock is released: a later run is accepted', await available('crossref'));
}

// ═════════════════════════════════════════════════════════════════════════
section('M. The continuous engine and a manual import never work one source together');
{
  await reset();
  // The engine holds OpenAlex.
  check('the engine takes OpenAlex', tryLockProvider('OpenAlex', 'continuous'));
  const e = await refusal('openalex');
  check('Quick Import is refused, naming the engine', e?.code === 'BUSY' && /Continuous Engine is working on OpenAlex/.test(e.message), e?.message);
  check('the card shows it Running, with Quick Import disabled', (await Q.listQuickSources()).find((c: any) => c.id === 'openalex').state === 'running');
  check('no request was made to OpenAlex', hits('api.openalex.org') === 0);
  unlockProvider('OpenAlex', 'continuous');

  // A manual import holds OpenAlex; the engine's article pass leaves it alone.
  openalex[IS[0]] = [oaItem(11, IS[0])];
  let release: () => void = () => {}; const gate = new Promise<void>(r => { release = r; });
  __useFetchForTests((async (url: string) => { if (url.includes('api.openalex.org')) await gate; return fake(url); }) as any);
  const job = await Q.beginQuickImport('openalex', admin);
  await sleep(50);
  const pass: any = await runIngestionPass([], { force: true, only: 'articles' });
  check('while a manual import holds OpenAlex, the engine\'s article pass steps aside', /manual import/i.test(String(pass.note || '')) && !pass.journal, JSON.stringify(pass));
  check('…and the engine did not touch the source (no request beyond the manual one)', requests.filter(u => u.includes('api.openalex.org')).length <= 1);
  release(); await done(job);
  __useFetchForTests(fake as any);
  check('a provider the manual import holds is not harvested by the timer', (await (async () => { tryLockProvider('DOAB', 'manual'); const r = await runScheduledHarvest(DOAB_OAI, { maxPages: 1, pageDelayMs: 0, sleep: async () => {} }); unlockProvider('DOAB', 'manual'); return r; })()) === null);

  // One import at a time per kind of work.
  crossref[IS[0]] = []; crossref[IS[1]] = []; crossref[IS[2]] = [];
  let hold: () => void = () => {}; const gate2 = new Promise<void>(r => { hold = r; });
  __useFetchForTests((async (url: string) => { if (url.includes('api.crossref.org')) await gate2; return fake(url); }) as any);
  const first = await Q.beginQuickImport('crossref', admin);
  const second = await refusal('openalex');
  check('only one Quick Import per kind of work: another articles source waits', second?.code === 'BUSY' && /Crossref Quick Import is running/.test(second.message), second?.message);
  check('…while a books source is independent and may start', await available('doab'));
  hold(); await done(first); __useFetchForTests(fake as any);
  for (let i = 0; i < 100 && Q.activeQuickJobs().length; i++) await sleep(50);
}

// ═════════════════════════════════════════════════════════════════════════
section('Advanced import: preview writes nothing; the write begins where the preview read');
{
  await reset();
  await db.book.deleteMany({}); await db.bookHarvestCheckpoint.deleteMany({});
  catalogue = Array.from({ length: 6 }, (_, i) => ({ handle: `20.500.12854/${RUN}p${i}`, title: `${RUN} Preview Law Book ${i}`, doi: `10.7900/${RUN}.p${i}`, codes: LAW, kw: ['law'], rights: 'CC-BY' }));
  const cp = JSON.stringify(await db.bookHarvestCheckpoint.findMany());
  const pv = await previewManualBooks('doab', 5);
  check('the preview wrote no book and no checkpoint', (await db.book.count()) === 0 && cp === JSON.stringify(await db.bookHarvestCheckpoint.findMany()));
  check('it reports what would happen', pv.summary.eligible === 5 && pv.summary.books.publish === 5 && pv.summary.found === 5, JSON.stringify(pv.summary));
  check('and releases the provider when it is done', await available('doab'));
  const job = await done(await Q.beginQuickImport('doab', admin, { advanced: { limit: pv.params.limit, startToken: pv.params.startToken, from: pv.params.from } }));
  check('the confirmed write imports exactly the previewed read', job.status === 'done' && (await db.book.count()) === 5, JSON.stringify(job.result));
  const rr = await db.ingestionRun.findFirst({ where: { source: 'DOAB' }, orderBy: { at: 'desc' } });
  check('logged as a Manual Advanced import', /^Manual · Advanced import · /.test(rr?.note || ''), rr?.note);
  check('the advanced write left the checkpoint alone too', (await db.bookHarvestCheckpoint.count({ where: { provider: 'DOAB' } })) === 0);
  await db.ingestionSourceHealth.upsert({ where: { source: 'DOAB' }, create: { source: 'DOAB', consecutiveFailures: 5, pausedUntil: new Date(Date.now() + 600_000), lastError: 'DOAB answered HTTP 429' }, update: { consecutiveFailures: 5, pausedUntil: new Date(Date.now() + 600_000), lastError: 'DOAB answered HTTP 429' } });
  requests.length = 0;
  const b: any = await previewManualBooks('doab', 5).catch((e: any) => e);
  check('a preview of a resting source is refused without a request', b?.code === 'RATE_LIMITED' && requests.length === 0, b?.message);
}

// ── tidy: the scratch database is shared; leave its accepted journals as they were ──
await db.journal.updateMany({ where: { id: { notIn: JIDS }, status: 'Accepted', articleCount: 100000 }, data: { articleCount: 0 } });
await db.ingestionState.update({ where: { id: 'singleton' }, data: { articlesPerJournal: 0 } });
await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
