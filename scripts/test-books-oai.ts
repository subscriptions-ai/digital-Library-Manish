/**
 * OAI book-harvest tests. Throwaway database `stm_ingestion_test` only; the upstream is a fake that
 * answers in the shape DOAB does (xoai, resumptionToken paging), so a result is about our code.
 *
 *   npx tsx scripts/test-books-oai.ts
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const dbName = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const { harvestOai, runScheduledHarvest, DOAB_OAI, OAPEN_OAI, OTL_FEED, NCBI_FEED } = await import('../src/lib/ingestion/books/oaiHarvest.js');
const { normaliseIsbn, normaliseDoi, titleKey } = await import('../src/lib/ingestion/books/identifiers.js');
const { parseToc, parseNcbiList, extractToc, readRights, shortlistTitle, buildQueue, interleave, departmentOrder, ncbiLimits } = await import('../src/lib/ingestion/books/ncbi.js');
const { gzipSync } = await import('node:zlib');
const { randomBytes } = await import('node:crypto');
const { canonicalLicence } = await import('../src/lib/ingestion/books/licence.js');
const { classifyDepartment } = await import('../src/lib/ingestion/books/classifier.js');
const { __useFetchForTests, __useSleepForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const { contentTypeCounts } = await import('../src/lib/publicCounts.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {});
const nosleep = async () => {};

// ── identifiers ───────────────────────────────────────────────────────────
section('Identifiers');
check('ISBN-13 with hyphens', normaliseIsbn('978-3-16-148410-0')?.isbn13 === '9783161484100');
check('ISBN-10 → same book as its ISBN-13', normaliseIsbn('3-16-148410-X')?.isbn13 === '9783161484100');
check('ISBN-13 → its ISBN-10', normaliseIsbn('9780306406157')?.isbn10 === '0306406152');
check('bad check digit is not an ISBN', normaliseIsbn('9783161484101') === null);
check('"ISBN 0-306-40615-2" prefix tolerated', normaliseIsbn('ISBN 0-306-40615-2')?.isbn13 === '9780306406157');
check('DOI: resolver prefix and case removed', normaliseDoi('https://doi.org/10.1000/ABC') === '10.1000/abc');
check('title key ignores case, accents, article', titleKey('The Économie  of Things') === titleKey('economie of things'));

section('Classifier');
const c1 = classifyDepartment({ classifications: ['THEMA EDITEUR::M MEDICINE AND NURSING::MJ CLINICAL AND INTERNAL MEDICINE::MJG ENDOCRINOLOGY'], subjects: ['diabetes'], title: 'Gestational Diabetes' });
check('clear medical book → Medical Sciences, strong', c1.band === 'strong' && c1.department === 'Medical Sciences', JSON.stringify([c1.band, c1.department, c1.score]));
const c2 = classifyDepartment({ subjects: ['dental implants'], title: 'Dental Implants' });
check('words only (keyword + title, no code) → Dental suggested but NOT auto-published', c2.band === 'review' && c2.department === null && c2.suggested === 'Dental' && c2.score >= 6, JSON.stringify([c2.band, c2.suggested, c2.score]));
const c2b = classifyDepartment({ classifications: ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'], subjects: ['dentistry', 'oral health'], title: 'Dentistry Essentials' });
check('code + title/subject wording agree → Dental strong', c2b.band === 'strong' && c2b.department === 'Dental', JSON.stringify([c2b.band, c2b.department, c2b.families]));
const c2c = classifyDepartment({ classifications: ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'], title: 'A book' });
check('a code with no supporting wording → review', c2c.band !== 'strong');
const c2d = classifyDepartment({ classifications: ['THEMA EDITEUR::K ECONOMICS, FINANCE, BUSINESS AND MANAGEMENT::KC ECONOMICS'], title: 'Coastal Geology of the Mediterranean', subjects: ['sea-level', 'tide gauges', 'geology'] });
check('a code that the wording does not support → not auto-published', c2d.band !== 'strong');
const c3 = classifyDepartment({ classifications: ['THEMA EDITEUR::C LANGUAGE AND LINGUISTICS::CF LINGUISTICS'], subjects: ['Syntaxe'], title: 'Description du mbo' });
check('weak evidence is not assigned', c3.department === null && c3.band !== 'strong', JSON.stringify([c3.band, c3.suggested, c3.score]));
const c4 = classifyDepartment({ title: 'Soro Soke', subjects: ['Current affairs', 'Africa'] });
check('no evidence → none, no department', c4.band === 'none' && c4.department === null);
const c6 = classifyDepartment({ title: 'Salud pública y odontología sostenible', subjects: ['huella de carbono', 'odontología'] });
check('Spanish dental title → Dental is the suggestion; words only so it goes to review', c6.suggested === 'Dental' && c6.band === 'review', JSON.stringify([c6.band, c6.department, c6.suggested, c6.score]));
const c5 = classifyDepartment({ subjects: ['health'], title: 'A study' });
check('a vague word is not enough', c5.department === null);

// ── fake DOAB ─────────────────────────────────────────────────────────────
type Spec = { handle: string; title: string; doi?: string; isbn?: string; codes?: string[]; kw?: string[]; rights?: string; deleted?: boolean; author?: string; year?: string; download?: string; abstract?: string; cover?: string; original?: string };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (v: string) => `<field name="value">${esc(v)}</field>`;
const rec = (s: Spec) => s.deleted
  ? `<record><header status="deleted"><identifier>oai:directory.doabooks.org:${s.handle}</identifier><datestamp>2026-10-01T00:00:00Z</datestamp></header></record>`
  : `<record><header><identifier>oai:directory.doabooks.org:${s.handle}</identifier><datestamp>2026-10-01T00:00:00Z</datestamp></header><metadata><metadata xmlns="http://www.lyncode.com/xoai">
<element name="dc"><element name="title"><element name="en_US">${f(s.title)}</element></element>
${s.author ? `<element name="contributor"><element name="author"><element name="none">${f(s.author)}</element></element></element>` : ''}
<element name="date"><element name="issued"><element name="none">${f(s.year || '2024-01-01')}</element></element></element>
<element name="language"><element name="en_US">${f('eng')}</element></element>
${s.abstract ? `<element name="description"><element name="abstract"><element name="en_US">${f(s.abstract)}</element></element></element>` : ''}
<element name="subject">${s.codes ? `<element name="classification"><element name="en_US">${s.codes.map(f).join('')}</element></element>` : ''}${s.kw ? `<element name="other"><element name="en_US">${f(s.kw.join('; '))}</element></element>` : ''}</element>
</element>
<element name="oapen">${s.doi ? `<element name="identifier"><element name="doi"><element name="en_US">${f(s.doi)}</element></element></element>` : ''}
${s.isbn ? `<element name="relation"><element name="isbn"><element name="en_US">${f(s.isbn)}</element></element></element>` : ''}</element>
<element name="bundles"><element name="bundle"><field name="name">THUMBNAIL</field><element name="bitstreams"><element name="bitstream">
<field name="format">image/jpeg</field><field name="url">${s.cover ?? 'https://x/cover.jpg'}</field>
${s.download ? `<field name="oapenidentifierdownloadUrl">${s.download}</field>` : ''}
${s.rights ? `<field name="rights">${s.rights}</field>` : ''}</element></element></element></element>
${s.original ? `<element name="bundles"><element name="bundle"><field name="name">ORIGINAL</field><element name="bitstreams"><element name="bitstream"><field name="format">application/pdf</field><field name="url">${s.original}</field>${s.rights ? `<field name="rights">${s.rights}</field>` : ''}</element></element></element></element>` : ''}
<element name="linkedItemsMetadata"><element name="publisher.name">${f('Test Press')}</element></element>
</metadata></metadata></record>`;

let catalogue: Spec[] = [];
let oapen: Spec[] = [];
let otl: any[] = [];
let ncbiCsv = '';
let ncbiArchives: Record<string, Buffer> = {};
let ncbiRequests: string[] = [];
const OTL_PAGE = 2;
let requests: string[] = [];
let mode: 'ok' | '429' | 'timeout' | 'expiredToken' = 'ok';
let oapenMode: 'ok' | '429' = 'ok';
const PAGE = 5;
let connectTimeouts: Record<string, number | undefined> = {};
const fake = async (url: string, init?: any, connectMs?: number): Promise<Response> => {
  requests.push(url);
  connectTimeouts[new URL(url).hostname] = connectMs;
  if (url.startsWith('https://files.oapen.test/')) {
    if (url.endsWith('/ok.pdf')) return new Response('%PDF-1.7 fake', { status: 206, headers: { 'content-type': 'application/pdf' } });
    return new Response('<html>bot check</html>', { status: 403, headers: { 'content-type': 'text/html' } });
  }
  if (url.startsWith('https://ftp.ncbi.nlm.nih.gov/pub/litarch/')) {
    ncbiRequests.push(url);
    if (url.endsWith('file_list.csv')) return new Response(Buffer.from(ncbiCsv, 'latin1'), { status: 200, headers: { 'content-type': 'text/csv' } });
    const a = ncbiArchives[url.replace('https://ftp.ncbi.nlm.nih.gov/pub/litarch/', '')];
    if (!a) return new Response('gone', { status: 404 });
    return new Response(a, { status: 200, headers: { 'content-length': String(a.length) } });
  }
  if (url.startsWith('https://open.umn.edu/')) {
    const page = Number(new URL(url).searchParams.get('page') || 1);
    const totalPages = Math.max(1, Math.ceil(otl.length / OTL_PAGE));
    return new Response(JSON.stringify({ data: otl.slice((page - 1) * OTL_PAGE, page * OTL_PAGE), links: { total_pages: totalPages, total_count: otl.length } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const isOapen = url.startsWith('https://library.oapen.org/');
  const mode_ = isOapen ? oapenMode : mode;
  const cat = isOapen ? oapen : catalogue;
  if (mode_ === '429') return new Response('slow down', { status: 429, headers: { 'retry-after': '1' } });
  if (!isOapen && mode === 'timeout') { const e: any = new Error('timed out'); e.name = 'TimeoutError'; throw e; }
  const u = new URL(url);
  const tok = u.searchParams.get('resumptionToken');
  if (tok && !isOapen && mode === 'expiredToken') return new Response('<OAI-PMH><error code="badResumptionToken">gone</error></OAI-PMH>', { status: 200 });
  const start = tok ? Number(tok.split('/').pop()) : 0;
  const slice = cat.slice(start, start + PAGE);
  if (!cat.length) return new Response('<OAI-PMH><error code="noRecordsMatch">none</error></OAI-PMH>', { status: 200 });
  const more = start + PAGE < cat.length;
  return new Response(`<OAI-PMH><ListRecords>${slice.map(rec).join('')}${more ? `<resumptionToken completeListSize="${cat.length}" cursor="${start}">xoai///set/${start + PAGE}</resumptionToken>` : '<resumptionToken completeListSize="' + cat.length + '"/>'}</ListRecords></OAI-PMH>`, { status: 200 });
};
__useFetchForTests(fake as any);

const reset = async () => {
  await db.book.deleteMany({}); await db.bookHarvestCheckpoint.deleteMany({});
  await db.ingestionSourceHealth.deleteMany({ where: { source: 'DOAB' } });
  requests = []; mode = 'ok'; oapenMode = 'ok'; oapen = []; otl = []; ncbiCsv = ''; ncbiArchives = {}; ncbiRequests = [];
  await db.ingestionAudit.deleteMany({ where: { action: 'NCBI_ARCHIVE_DOWNLOADED' } });
  await db.ingestionSourceHealth.deleteMany({});
};
const run = (o: any = {}) => harvestOai(DOAB_OAI, { pageDelayMs: 0, sleep: nosleep, ...o });
const runN = (o: any = {}) => harvestOai(NCBI_FEED, { pageDelayMs: 0, sleep: nosleep, ...o });
const runT = (o: any = {}) => harvestOai(OTL_FEED, { pageDelayMs: 0, sleep: nosleep, ...o });
const runO = (o: any = {}) => harvestOai(OAPEN_OAI, { pageDelayMs: 0, sleep: nosleep, ...o });

const MED = ['THEMA EDITEUR::M MEDICINE AND NURSING::MJ CLINICAL AND INTERNAL MEDICINE'];
const LAW = ['BIC BOOK INDUSTRY COMMUNICATION::L LAW::LA JURISPRUDENCE & GENERAL ISSUES'];

// ── L: dry run writes nothing ─────────────────────────────────────────────
section('L. Dry run writes nothing');
await reset();
catalogue = Array.from({ length: 7 }, (_, i) => ({ handle: `20.500.12854/${100 + i}`, title: `Clinical Medicine ${i}`, doi: `10.1/med${i}`, isbn: '9783161484100'.replace(/0$/, '') + '0', codes: MED, kw: ['medicine'], rights: 'CC-BY' }));
catalogue.forEach((c, i) => { c.isbn = ['9780306406157', '9783161484100', '9780198526636', '9780262033848', '9780131103627', '9780201633610', '9780596520687'][i]; });
{
  const before = await db.book.count();
  const r = await run({ dryRun: true, maxPages: 5 });
  check('no Book rows written', (await db.book.count()) === before);
  check('no checkpoint row written', (await db.bookHarvestCheckpoint.count()) === 0);
  check('it still judged everything', r.fetched === 7 && r.department.strong === 7 && r.access.OpenExternal === 7, JSON.stringify([r.fetched, r.department, r.access]));
}

// ── real run, pagination, checkpoint ──────────────────────────────────────
section('Harvest, checkpoint, restart');
await reset();
{
  const t0 = Date.now();
  const r1 = await run({ maxPages: 1 });
  let cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } });
  check('page 1: 5 added', r1.added === 5 && (await db.book.count()) === 5, `added ${r1.added}`);
  check('token saved after the page', cp?.cursor === 'xoai///set/5', String(cp?.cursor));
  check('harvestStartedAt stamped at the start', !!cp?.harvestStartedAt && cp.harvestStartedAt.getTime() >= t0 - 1000);
  check('lastSuccessfulSyncAt not moved yet', cp?.lastSuccessfulSyncAt === null);
  const started = cp!.harvestStartedAt!.getTime();

  requests = [];
  const r2 = await run({ maxPages: 5 });          // "restart": a fresh call resumes from the stored token
  cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } });
  check('resumed from the saved token, not the start', requests.length > 0 && /resumptionToken=xoai%2F%2F%2Fset%2F5/.test(requests[0]), requests[0]);
  check('the first page was not fetched again', r2.fetched === 2 && r2.added === 2 && (await db.book.count()) === 7);
  check('finished: cursor cleared', cp?.cursor === null);
  check('finished: lastSuccessfulSyncAt = the harvest START, not its end', cp?.lastSuccessfulSyncAt?.getTime() === started);
  check('finished: harvestStartedAt cleared', cp?.harvestStartedAt === null);

  requests = [];
  await run({ maxPages: 5 });
  check('next sync is incremental (from = last sync)', /[?&]from=\d{4}-\d\d-\d\dT/.test(requests[0]) && !/resumptionToken/.test(requests[0]), requests[0]);
  check('re-running adds nothing (no duplicate DOI / ISBN)', (await db.book.count()) === 7);
  const dupDoi = await db.$queryRawUnsafe(`select doi from "Book" group by doi having count(*)>1`);
  const dupIsbn = await db.$queryRawUnsafe(`select isbn from "Book" group by isbn having count(*)>1`);
  check('no duplicate DOI, no duplicate ISBN', dupDoi.length === 0 && dupIsbn.length === 0);
  check('run_scheduled: recently synced → nothing due', (await runScheduledHarvest(DOAB_OAI, { pageDelayMs: 0, sleep: nosleep })) === null);
}

// ── A, B-type enrichment, C editions ──────────────────────────────────────
section('A/C. Existing books: no duplicate, fill-empty only, editions kept apart');
await reset();
await db.book.create({ data: { title: 'Existing Book', doi: '10.9/EXISTING', authors: 'Keep, Me', description: 'My own description', source: 'DOAB', sourceRecordId: '20.500.12854/900', fingerprint: 'doab:doi:10.9/existing', status: 'Published', domain: 'Law' } });
await db.book.create({ data: { title: 'Atlas of Everything', isbn: '978-0-306-40615-7', year: 2020, status: 'Published', fingerprint: 'x:1', domain: 'Arts' } });
catalogue = [
  { handle: '20.500.12854/901', title: 'Existing Book', doi: 'https://doi.org/10.9/existing', codes: LAW, abstract: 'Provider description that must not replace mine', author: 'Other, Person', rights: 'CC-BY', cover: 'https://x/c.jpg' },
  { handle: '20.500.12854/902', title: 'Atlas of Everything', isbn: '0306406152', codes: LAW, year: '2020-01-01' },                  // same book as ISBN-13 held, written as ISBN-10
  { handle: '20.500.12854/903', title: 'Atlas of Everything', isbn: '9780198526636', codes: LAW, kw: ['law'], year: '2020-01-01', rights: 'CC-BY' },  // 2nd edition, different ISBN
];
{
  const r = await run({ maxPages: 3 });
  const existing = await db.book.findFirst({ where: { doi: '10.9/EXISTING' } });
  check('A. DOI match (resolver URL, other case) → no duplicate', (await db.book.count({ where: { title: 'Existing Book' } })) === 1);
  check('A. populated fields untouched', existing.description === 'My own description' && existing.authors === 'Keep, Me' && existing.domain === 'Law');
  check('A. empty fields filled (cover, publisher)', existing.coverUrl === 'https://x/c.jpg' && existing.publisherName === 'Test Press', `${existing.coverUrl} ${existing.publisherName}`);
  check('A. enrichment counted', r.enriched >= 1 && r.duplicates.doi === 1, JSON.stringify(r.duplicates));
  check('ISBN-10 of a held ISBN-13 → same book', r.duplicates.isbn === 1 && (await db.book.count({ where: { title: 'Atlas of Everything' } })) === 2, JSON.stringify(r.duplicates));
  check('C. different ISBN, same title → kept as its own edition', (await db.book.count({ where: { isbn: '9780198526636' } })) === 1);
  const atlas = await db.book.findFirst({ where: { title: 'Atlas of Everything', isbn: '978-0-306-40615-7' } });
  check('held ISBN row not rewritten with a nulled/overwritten value', atlas.isbn === '978-0-306-40615-7' && atlas.year === 2020);
}

// ── F/G/H and rights ─────────────────────────────────────────────────────
section('F/G/H. Licence, access, weak department');
await reset();
catalogue = [
  { handle: '20.500.12854/1', title: 'Law of Contracts', codes: LAW, kw: ['contract law'], rights: 'CC-BY', download: 'https://pub.example/law.pdf' },          // open + address
  { handle: '20.500.12854/2', title: 'Law of Torts', codes: LAW, kw: ['tort law'] },                                                           // licence missing
  { handle: '20.500.12854/3', title: 'Law of Trusts', codes: LAW, kw: ['trust law'], rights: 'CC-BY-NC-ND', download: 'https://pub.example/t.pdf' },
  { handle: '20.500.12854/4', title: 'Notes on Various Matters', kw: ['notes'] },                                                              // nothing to classify on
  { handle: '20.500.12854/5', title: 'Gone', deleted: true },
  { handle: '20.500.12854/6', title: 'Other open license book', codes: LAW, kw: ['law'], rights: 'Other open license', download: 'https://pub.example/o.pdf' },
];
{
  const r = await run({ maxPages: 3 });
  const g = (t: string) => db.book.findFirst({ where: { title: t } });
  const open = await g('Law of Contracts'), none = await g('Law of Torts'), nc = await g('Law of Trusts'), other = await g('Other open license book');
  check('G. open licence + address → "Open at source", never full text', open.accessStatus === 'LinkOnly' && open.rightsStatus === 'MetadataOnly' && open.pdfUrl === null, JSON.stringify([open.accessStatus, open.rightsStatus]));
  check('G. its address is kept, with the title-level licence basis', open.originalUrl === 'https://pub.example/law.pdf' && /title licence/.test(open.rightsBasis));
  check('F. no licence → metadata only, not full text', none.accessStatus === 'MetadataOnly' && none.licence === null && none.rightsStatus === 'MetadataOnly');
  check('NC licence → linked, flagged non-commercial, not hosted', nc.accessStatus === 'LinkOnly' && nc.licenceIsNC === true && nc.licence === 'CC BY-NC-ND');
  check('"Other open license" names no licence → metadata only', other.licence === null && other.accessStatus === 'MetadataOnly');
  check('H. unclassifiable book is not catalogued', (await g('Notes on Various Matters')) === null && r.department.none + r.department.review >= 1);
  check('deleted record is skipped, nothing deleted locally', r.deleted === 1 && (await g('Gone')) === null);
  check('every catalogued book has a department that exists and provenance', (await db.book.findMany()).every((b: any) => b.domain === 'Law' && b.source === 'DOAB' && b.sourceRecordId && b.metadata?.harvest?.via));
  check('nothing is FullText', r.access.FullText === 0);
}

// ── I/J: failures ─────────────────────────────────────────────────────────
section('I/J. Provider failure');
await reset();
catalogue = [{ handle: '20.500.12854/1', title: 'Law of Contracts', codes: LAW, kw: ['contract law'], rights: 'CC-BY' }];
{
  mode = '429';
  const r = await run({ maxPages: 3 });
  const cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } });
  check('I. 429 → no throw, no rows, source error reported', !!r.sourceError && r.added === 0 && (await db.book.count()) === 0, String(r.sourceError));
  check('I. retried a bounded number of times (<= 3)', requests.length <= 3, `${requests.length} requests`);
  check('I. checkpoint left resumable (no sync recorded)', cp?.lastSuccessfulSyncAt === null && cp?.cursor === null);
  for (let i = 0; i < 6; i++) await run({ maxPages: 1 });
  const h = await db.ingestionSourceHealth.findUnique({ where: { source: 'DOAB' } });
  check('I. repeated failure opens the shared circuit breaker (IngestionSourceHealth)', !!h?.pausedUntil, JSON.stringify([h?.consecutiveFailures, h?.pausedUntil]));
  requests = [];
  const paused = await run({ maxPages: 1 });
  check('I. while paused, no request is made', requests.length === 0 && !!paused.sourceError);

  await db.ingestionSourceHealth.deleteMany({}); mode = 'timeout'; requests = [];
  const t = await run({ maxPages: 3 });
  check('J. timeout → one attempt, not three, and the harvest stops cleanly', requests.length === 1 && !!t.sourceError, `${requests.length} requests`);

  await db.ingestionSourceHealth.deleteMany({}); mode = 'ok';
  const ok = await run({ maxPages: 3 });
  check('recovers on its own once the source answers', ok.added === 1);
}

section('Expired token');
await reset();
catalogue = Array.from({ length: 8 }, (_, i) => ({ handle: `20.500.12854/${i}`, title: `Law book ${i}`, codes: LAW, kw: ['law'], rights: 'CC-BY' }));
{
  await run({ maxPages: 1 });
  mode = 'expiredToken';
  const r = await run({ maxPages: 3 });
  const cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } });
  check('badResumptionToken → cursor dropped, nothing lost', cp?.cursor === null && /expired/.test(r.sourceError || ''));
  mode = 'ok';
  await run({ maxPages: 5 });
  check('next run re-harvests; dedupe absorbs the overlap', (await db.book.count()) === 8);
}

// ── M: public count ───────────────────────────────────────────────────────
section('M. Public Books count follows the catalogue');
await reset();
catalogue = [
  { handle: '20.500.12854/1', title: 'Law of Contracts', codes: LAW, kw: ['contract law'], rights: 'CC-BY' },
  { handle: '20.500.12854/2', title: 'Notes on Various Matters', kw: ['notes'] },
];
{
  const before = (await contentTypeCounts(db)).Books || 0;
  await run({ dryRun: true, maxPages: 2 });
  const afterDry = (await contentTypeCounts(db)).Books || 0;
  await run({ maxPages: 2 });
  const afterReal = (await contentTypeCounts(db)).Books || 0;
  await run({ maxPages: 2 });
  const afterAgain = (await contentTypeCounts(db)).Books || 0;
  check('dry run: count unchanged', afterDry === before);
  check('one genuinely new classified book → +1', afterReal === before + 1, `${before} → ${afterReal}`);
  check('duplicate / unclassified: no change', afterAgain === afterReal);
}


section('Licence spellings');
check('CC BY 4.0 variants', canonicalLicence('CC BY-4') === 'CC BY' && canonicalLicence('CC-BY') === 'CC BY');
check('order of NC/ND is normalised', canonicalLicence('CC BY-ND-NC') === 'CC BY-NC-ND');
check('all rights reserved is not an open licence', canonicalLicence('All rights reserved') === null && canonicalLicence('CC ARR') === null);
check('"Other open license" names nothing', canonicalLicence('Other open license') === null);
check('CC0', canonicalLicence('CC CC0') === 'CC0');

section('Review-band books: kept, but never public');
await reset();
{
  // MJ alone is one mid-weight code (6) -> strong. Two codes pulling different ways -> review.
  catalogue = [
    { handle: '20.500.12854/10', title: 'Hospital Law', codes: [...MED, ...LAW], kw: ['hospital'], rights: 'CC-BY', download: 'https://pub.example/h.pdf' },
    { handle: '20.500.12854/11', title: 'Clinical Medicine', codes: MED, kw: ['medicine'], rights: 'CC-BY' },
    { handle: '20.500.12854/12', title: 'Notes on Various Matters', kw: ['notes'] },
  ];
  const before = (await contentTypeCounts(db)).Books || 0;
  const r = await run({ maxPages: 2 });
  const rows = await db.book.findMany({ orderBy: { title: 'asc' } });
  const draft = rows.find((b: any) => b.title === 'Hospital Law');
  check('strong book published; ambiguous one kept as Draft; unclassifiable one only logged', rows.length === 2 && r.added === 1 && r.queuedForReview === 1 && draft?.status === 'Draft', JSON.stringify([rows.map((b: any) => b.status), r.added, r.queuedForReview]));
  check('draft has NO department and is marked Ingested', draft.domain === null && draft.ownershipSource === 'Ingested');
  check('draft keeps the suggestion and runner-up for the reviewer', !!draft.metadata?.harvest?.department?.suggested && draft.metadata.harvest.department.band === 'review', JSON.stringify(draft.metadata?.harvest?.department));
  check('public Books count counts only the published one', (await contentTypeCounts(db)).Books === before + 1);
  check('every public query shape excludes it (status = Published)', (await db.book.count({ where: { status: 'Published' } })) === 1);
  const again = await run({ maxPages: 2 });
  check('a draft is held for dedupe: not created twice', (await db.book.count()) === 2 && again.duplicates.doi + again.duplicates.fingerprint + again.duplicates.sourceRecordId >= 2, JSON.stringify(again.duplicates));
}

// ── OAPEN ─────────────────────────────────────────────────────────────────
section('OAPEN: waits for DOAB, then enriches');
await reset();
catalogue = [{ handle: '20.500.12854/1', title: 'Law of Contracts', doi: '10.5/contracts', isbn: '9780198526636', codes: LAW, kw: ['contract law'], rights: 'CC-BY-NC-ND', author: 'Original, Author', year: '2020-01-01' }];
oapen = [];
{
  check('before DOAB has finished a harvest, OAPEN is not due', (await runScheduledHarvest(OAPEN_OAI, { pageDelayMs: 0, sleep: nosleep })) === null);
  await run({ maxPages: 3 });
  const held = await db.book.findFirst({ where: { doi: '10.5/contracts' } });
  check('DOAB row exists with DOAB provenance', held.source === 'DOAB' && held.licence === 'CC BY-NC-ND' && held.domain === 'Law');

  oapen = [
    // same DOI as DOAB's book; different title spelling, other authors, other licence, a file. Must enrich, never overwrite.
    { handle: '20.500.12657/1', title: 'Law of Contracts (OAPEN edition title)', doi: 'https://doi.org/10.5/CONTRACTS', author: 'Someone, Else', codes: MED, kw: ['medicine'], rights: 'CC-BY', original: 'https://files.oapen.test/1/ok.pdf', abstract: 'OAPEN abstract fills a gap', year: '2021-01-01' },
    // matched on ISBN only (written as ISBN-10 of the ISBN-13 DOAB holds)
    { handle: '20.500.12657/2', title: 'Law of Contracts', isbn: '0198526636', codes: LAW, kw: ['law'], rights: 'CC-BY', pages: undefined } as any,
    // a different edition (new ISBN, no DOI): separate book
    { handle: '20.500.12657/3', title: 'Law of Contracts', isbn: '9780262033848', codes: LAW, kw: ['contract law'], rights: 'CC-BY', original: 'https://files.oapen.test/3/wall.pdf', year: '2024-01-01' },
    // genuinely new, open licence, file opens -> Full Text
    { handle: '20.500.12657/4', title: 'Tort Law Today', doi: '10.5/tort', codes: LAW, kw: ['tort law'], rights: 'CC-BY', original: 'https://files.oapen.test/4/ok.pdf' },
    // new, NC licence, file opens -> never Full Text
    { handle: '20.500.12657/5', title: 'Trust Law Today', doi: '10.5/trust', codes: LAW, kw: ['trust law'], rights: 'CC-BY-NC-ND', original: 'https://files.oapen.test/5/ok.pdf' },
    // new, no licence, file opens -> metadata only
    { handle: '20.500.12657/6', title: 'Property Law Today', doi: '10.5/prop', codes: LAW, kw: ['property law'], original: 'https://files.oapen.test/6/ok.pdf' },
    // new, "all rights reserved", file opens -> metadata only
    { handle: '20.500.12657/7', title: 'Equity Law Today', doi: '10.5/eq', codes: LAW, kw: ['equity law'], rights: 'All rights reserved', original: 'https://files.oapen.test/7/ok.pdf' },
    // new, open licence, file behind a wall -> open external, not full text
    { handle: '20.500.12657/8', title: 'Company Law Today', doi: '10.5/co', codes: LAW, kw: ['company law'], rights: 'CC-BY', original: 'https://files.oapen.test/8/wall.pdf' },
    // no classification evidence
    { handle: '20.500.12657/9', title: 'Notes on Various Matters Two', kw: ['notes'], rights: 'CC-BY' },
  ];
  const dry = await runO({ dryRun: true, maxPages: 5, ignoreCheckpoint: true });
  check('OAPEN dry run writes nothing (books, checkpoint)', (await db.book.count()) === 1 && (await db.bookHarvestCheckpoint.count({ where: { provider: 'OAPEN' } })) === 0);
  check('dry run reports matches, new, full-text eligible', dry.duplicates.doi === 1 && dry.duplicates.isbn === 1 && dry.fullTextEligible >= 1 && dry.newCandidates === 7, JSON.stringify([dry.duplicates, dry.newCandidates, dry.fullTextEligible]));

  const r = await runScheduledHarvest(OAPEN_OAI, { pageDelayMs: 0, sleep: nosleep, maxPages: 5 });
  const doabRow = await db.book.findUnique({ where: { id: held.id } });
  check('OAPEN ran once DOAB had finished', !!r && r.completed);
  check('enriched the DOAB row by DOI (resolver URL, other case) — no duplicate', (await db.book.count({ where: { doi: { equals: '10.5/contracts', mode: 'insensitive' } } })) === 1 && r!.duplicates.doi === 1);
  check('populated fields NOT overwritten (title, authors, year, domain, licence, rights, source)',
    doabRow.title === 'Law of Contracts' && doabRow.authors === 'Original, Author' && doabRow.year === 2020 && doabRow.domain === 'Law'
    && doabRow.licence === 'CC BY-NC-ND' && doabRow.rightsStatus === held.rightsStatus && doabRow.accessStatus === held.accessStatus && doabRow.source === 'DOAB',
    JSON.stringify([doabRow.title, doabRow.authors, doabRow.year, doabRow.domain, doabRow.licence, doabRow.source]));
  check('licence conflict (DOAB NC-ND vs OAPEN BY) recorded for a person, neither changed', doabRow.metadata?.licenceConflicts?.OAPEN?.held === 'CC BY-NC-ND' && doabRow.metadata.licenceConflicts.OAPEN.theirs === 'CC BY' && r!.licenceConflicts === 1);
  check('empty field filled from OAPEN (description)', doabRow.description === 'OAPEN abstract fills a gap');
  check('provenance: sources.OAPEN recorded; metadata source stays DOAB; access source OAPEN', doabRow.metadata?.sources?.OAPEN?.handle === '20.500.12657/1' && doabRow.metadata?.access?.source === 'OAPEN' && doabRow.metadata?.access?.metadataSource === 'DOAB', JSON.stringify(doabRow.metadata?.access));
  check("another provider's handle is not written into sourceRecordId", doabRow.sourceRecordId === '20.500.12854/1');
  check('ISBN-10 match found the same book (no new row for 20.500.12657/2)', r!.duplicates.isbn === 1 && (await db.book.count({ where: { sourceRecordId: '20.500.12657/2' } })) === 0);
  const ed = await db.book.findFirst({ where: { isbn: '9780262033848' } });
  check('different edition (other ISBN, same title) kept separate and created by OAPEN', ed?.source === 'OAPEN' && ed.title === 'Law of Contracts');

  const g = (t: string) => db.book.findFirst({ where: { title: t } });
  const tort = await g('Tort Law Today'), trust = await g('Trust Law Today'), prop = await g('Property Law Today'), eq = await g('Equity Law Today'), co = await g('Company Law Today');
  check('open licence + file that really opens → HELD as Open External (full text is off): no pdfUrl, not viewable', tort.accessStatus === 'LinkOnly' && tort.rightsStatus === 'MetadataOnly' && tort.pdfUrl === null && tort.licenceIsNC === false, JSON.stringify([tort.accessStatus, tort.rightsStatus, tort.pdfUrl]));
  check('…but the verified file and its verdict are kept on record', tort.metadata?.harvest?.file?.url === 'https://files.oapen.test/4/ok.pdf' && tort.metadata.harvest.file.verdict?.ok === true && tort.metadata.harvest.file.heldBack === true && tort.licence === 'CC BY');
  check('non-commercial licence + working file → NOT full text', trust.accessStatus === 'LinkOnly' && trust.pdfUrl === null && trust.licenceIsNC === true);
  check('no licence + working file → metadata only, never full text', prop.accessStatus === 'MetadataOnly' && prop.pdfUrl === null && prop.licence === null);
  check('"all rights reserved" + working file → metadata only', eq.accessStatus === 'MetadataOnly' && eq.pdfUrl === null && eq.licence === null);
  check('open licence but file behind a wall → open external, no pdfUrl', co.accessStatus === 'LinkOnly' && co.pdfUrl === null && /OAPEN title licence/.test(co.rightsBasis));
  check('provenance on new OAPEN book', tort.source === 'OAPEN' && tort.sourceRecordId === '20.500.12657/4' && tort.fingerprint.startsWith('oapen:'));
  check('unclassifiable OAPEN record not catalogued', (await g('Notes on Various Matters Two')) === null);
  const dupDoi = await db.$queryRawUnsafe(`select lower(doi) d from "Book" where doi is not null group by 1 having count(*)>1`);
  const dupIsbn = await db.$queryRawUnsafe(`select isbn from "Book" where isbn is not null group by 1 having count(*)>1`);
  check('no duplicate DOI, no duplicate ISBN anywhere', dupDoi.length === 0 && dupIsbn.length === 0);
  check('the DOAB checkpoint was not touched by OAPEN', (await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } })).lastSuccessfulSyncAt !== null);
  check('OAPEN has its own checkpoint row', !!(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'OAPEN' } }))?.lastSuccessfulSyncAt);
  const h = await db.ingestionSourceHealth.findUnique({ where: { source: 'OAPEN' } });
  check('a download wall does not trip the OAPEN feed breaker', !h?.pausedUntil && (h?.consecutiveFailures ?? 0) === 0, JSON.stringify(h));
  const again = await runO({ maxPages: 5, ignoreCheckpoint: false });
  check('second sighting changes nothing', (await db.book.count()) === 7 && again.enriched === 0, `${await db.book.count()} rows, enriched ${again.enriched}`);
}

// ── Open Textbook Library ─────────────────────────────────────────────────
section('Open Textbook Library: same pipeline, its own JSON');
const tb = (id: number, title: string, o: any = {}) => ({
  id, title, edition_statement: o.edition ?? null, volume: null, copyright_year: o.year ?? 2020, isbn10: null, isbn13: o.isbn ?? null,
  license: o.license ?? 'Attribution', language: 'eng', description: o.description ?? null, updated_at: o.updated ?? '2026-05-01T00:00:00.000-05:00',
  contributors: o.authors ?? [{ contribution: 'Author', primary: true, corporate: false, first_name: 'Ada', middle_name: null, last_name: 'Lovelace' }],
  subjects: o.subjects ?? [], publishers: [{ name: o.publisher ?? 'Open Press' }],
  formats: o.formats ?? [{ type: 'Online', url: `https://books.example/${id}`, price: { cents: 0 } }], url: `https://open.umn.edu/opentextbooks/textbooks/${id}`,
});
const CS = [{ name: 'Computer Science', call_number: 'QA75.5-76.95' }, { name: 'Programming', call_number: 'QA76.6' }];
await reset();
{
  catalogue = [{ handle: '20.500.12854/50', title: 'Algorithms Unlocked', isbn: '9780262033848', codes: LAW, kw: ['law'], rights: 'CC-BY', author: 'Held, Already' }];
  otl = [
    tb(1, 'Introduction to Programming in Python', { isbn: '9780131103627', subjects: CS, license: 'Attribution', edition: 'Second Edition' }),
    tb(2, 'Introduction to Programming in Python', { isbn: '9780201633610', subjects: CS, license: 'Attribution-NonCommercial-ShareAlike', year: 2023 }),   // later edition: different ISBN
    tb(3, 'Algorithms Unlocked', { isbn: '0262033844', subjects: CS, license: 'Attribution' }),                                                           // same book DOAB holds (ISBN-10 spelling)
    tb(4, 'A First Course in Linear Algebra', { isbn: '9780984417551', subjects: [{ name: 'Mathematics', call_number: 'QA1' }, { name: 'Algebra', call_number: 'QA150-272.5' }], license: 'Free Documentation License (GNU)' }),
    tb(5, 'Principles of Microeconomics', { subjects: [{ name: 'Economics', call_number: 'HB171' }], license: 'Something Custom' }),
    tb(6, 'Student Success Strategies', { subjects: [{ name: 'Student Success', call_number: 'LB1062.6' }] }),                                              // one weak family
    tb(7, 'Notes', { subjects: [] }),                                                                                                                         // nothing to classify on
    tb(8, 'Organic Chemistry Basics', { isbn: '9780198526636', subjects: [{ name: 'Chemistry', call_number: 'QD251' }], license: 'Attribution', formats: [{ type: 'PDF', url: 'https://files.oapen.test/8/ok.pdf', price: { cents: 0 } }, { type: 'Online', url: 'https://books.example/8', price: { cents: 0 } }] }),
    tb(9, 'Thermodynamics Handbook', { isbn: '9780596520687', subjects: [{ name: 'Thermodynamics', call_number: 'TJ265' }], license: 'Attribution', formats: [{ type: 'PDF', url: 'https://files.oapen.test/9/wall.pdf', price: { cents: 0 } }] }),
    tb(10, 'Paid Edition', { subjects: CS, formats: [{ type: 'Print', url: 'https://shop.example/10', price: { cents: 4999 } }] }),
  ];
  check('not due before DOAB has finished a harvest', (await runScheduledHarvest(OTL_FEED, { pageDelayMs: 0, sleep: nosleep })) === null);
  await run({ maxPages: 3 });

  const dry = await runT({ dryRun: true, maxPages: 10, ignoreCheckpoint: true });
  check('dry run writes nothing', (await db.book.count()) === 1 && (await db.bookHarvestCheckpoint.count({ where: { provider: 'OpenTextbookLibrary' } })) === 0);
  check('dry run reports ISBN match, new, strong/review/none, access, full-text candidates', dry.duplicates.isbn === 1 && dry.newCandidates === 9 && dry.department.strong >= 3 && dry.department.review >= 1 && dry.department.none >= 1 && dry.fullTextEligible === 1 && dry.access.FullText === 0, JSON.stringify([dry.duplicates, dry.newCandidates, dry.department, dry.fullTextEligible]));

  const r1 = await runT({ maxPages: 2 });                       // 4 of 10 books
  const cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'OpenTextbookLibrary' } });
  check('page cursor saved after each page', cp?.cursor === '3' && r1.pages === 2, String(cp?.cursor));
  const r2 = await runT({ maxPages: 10 });
  const cp2 = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'OpenTextbookLibrary' } });
  check('resumed from page 3 and finished; cursor cleared, sync stamped', r2.completed && cp2?.cursor === null && !!cp2?.lastSuccessfulSyncAt);

  const g = (t: string, extra: any = {}) => db.book.findFirst({ where: { title: t, ...extra } });
  const py1 = await g('Introduction to Programming in Python', { isbn: '9780131103627' }), py2 = await g('Introduction to Programming in Python', { isbn: '9780201633610' });
  check('CS textbook → Computer / IT, published, title licence kept, link-out only', py1?.domain === 'Computer / IT' && py1.status === 'Published' && py1.licence === 'CC BY' && py1.accessStatus === 'LinkOnly' && py1.pdfUrl === null, JSON.stringify([py1?.domain, py1?.status, py1?.licence, py1?.accessStatus]));
  check('provenance + edition + canonical URL', py1.source === 'OpenTextbookLibrary' && py1.sourceRecordId === '1' && py1.edition === 'Second Edition' && py1.originalUrl === 'https://books.example/1' && py1.fingerprint === 'opentextbooklibrary:id:1' && /textbooks\/1$/.test(py1.metadata.harvest.landingUrl));
  check('another edition (other ISBN, same title) kept distinct; NC-SA flagged non-commercial', !!py2 && py2.id !== py1.id && py2.licence === 'CC BY-NC-SA' && py2.licenceIsNC === true && py2.accessStatus === 'LinkOnly');
  const held = await db.book.findFirst({ where: { source: 'DOAB', title: 'Algorithms Unlocked' } });
  check('ISBN-10 match with a DOAB book → enriched (provenance), not duplicated', (await db.book.count({ where: { title: 'Algorithms Unlocked' } })) === 1 && held.metadata?.sources?.OpenTextbookLibrary?.handle === '3' && held.authors === 'Held, Already' && held.sourceRecordId === '20.500.12854/50');
  const la = await g('A First Course in Linear Algebra'), eco = await g('Principles of Microeconomics'), chem = await g('Organic Chemistry Basics'), thermo = await g('Thermodynamics Handbook');
  check('math textbook → Science; GNU FDL kept by name, never hosted', la?.domain === 'Science' && la.licence === 'GNU FDL' && la.accessStatus === 'LinkOnly' && la.pdfUrl === null, JSON.stringify([la?.domain, la?.licence, la?.accessStatus]));
  check('unrecognised licence → none declared → metadata only', !!eco && eco.licence === null && eco.accessStatus === 'MetadataOnly' && eco.domain === 'Commerce');
  check('open licence + PDF that really opens → held as Open External, file kept in metadata; with a wall → plain link', chem?.accessStatus === 'LinkOnly' && chem.pdfUrl === null && chem.metadata?.harvest?.file?.heldBack === true && chem.metadata.harvest.file.url === 'https://files.oapen.test/8/ok.pdf' && (!!thermo && thermo.accessStatus === 'LinkOnly' && thermo.pdfUrl === null), JSON.stringify([chem?.accessStatus, thermo?.accessStatus]));
  const weak = await g('Student Success Strategies'), none = await g('Notes');
  check('one family of evidence → Draft, no department, never public', !!weak && weak.status === 'Draft' && weak.domain === null && weak.ownershipSource === 'Ingested');
  check('no evidence → not catalogued', none === null);
  check('a book with no free format is linked to its landing page, never a shop', (await g('Paid Edition'))?.originalUrl === 'https://open.umn.edu/opentextbooks/textbooks/10');
  const dupIsbn = await db.$queryRawUnsafe(`select isbn from "Book" where isbn is not null group by 1 having count(*)>1`);
  check('no duplicate ISBN', dupIsbn.length === 0);

  const before = await db.book.count();
  const again = await runT({ maxPages: 10, ignoreCheckpoint: false });
  check('second pass changes nothing', (await db.book.count()) === before && again.enriched === 0, `enriched ${again.enriched}`);
}


section('OAPEN licence gap: fill an EMPTY licence only, change nothing else');
await reset();
{
  catalogue = [
    { handle: '20.500.12854/21', title: 'Law of Gaps', doi: '10.7/gap', codes: LAW, kw: ['law'] },                                   // DOAB: no licence declared
    { handle: '20.500.12854/22', title: 'Law of Agreement', doi: '10.7/same', codes: LAW, kw: ['law'], rights: 'CC-BY' },
    { handle: '20.500.12854/23', title: 'Law of Conflict', doi: '10.7/conf', codes: LAW, kw: ['law'], rights: 'CC-BY-NC-ND' },
    { handle: '20.500.12854/24', title: 'Law of Nothing Declared', doi: '10.7/none', codes: LAW, kw: ['law'] },                    // OAPEN has no licence either
    { handle: '20.500.12854/25', title: 'Law of Weak Evidence', doi: '10.7/weak', codes: LAW, kw: ['law'] },                       // OAPEN says only "all rights reserved"
  ];
  await run({ maxPages: 3 });
  const snap = async (doi: string) => db.book.findFirst({ where: { doi } });
  const gapBefore = await snap('10.7/gap');
  check('setup: the DOAB book has no licence and is a metadata-only link', gapBefore.licence === null && gapBefore.accessStatus === 'MetadataOnly' && gapBefore.rightsStatus === 'MetadataOnly');
  oapen = [
    { handle: '20.500.12657/21', title: 'Law of Gaps', doi: '10.7/gap', codes: LAW, kw: ['law'], rights: 'CC-BY-SA', original: 'https://files.oapen.test/21/ok.pdf' },
    { handle: '20.500.12657/22', title: 'Law of Agreement', doi: '10.7/same', codes: LAW, kw: ['law'], rights: 'CC-BY' },
    { handle: '20.500.12657/23', title: 'Law of Conflict', doi: '10.7/conf', codes: LAW, kw: ['law'], rights: 'CC-BY' },
    { handle: '20.500.12657/24', title: 'Law of Nothing Declared', doi: '10.7/none', codes: LAW, kw: ['law'] },
    { handle: '20.500.12657/25', title: 'Law of Weak Evidence', doi: '10.7/weak', codes: LAW, kw: ['law'], rights: 'All rights reserved' },
  ];
  const dry = await runO({ dryRun: true, maxPages: 3, ignoreCheckpoint: true });
  check('dry run reports the fill and the conflict, and writes nothing', dry.licenceFilled === 1 && dry.licenceConflicts === 1 && (await snap('10.7/gap')).licence === null);
  const r = await runScheduledHarvest(OAPEN_OAI, { pageDelayMs: 0, sleep: nosleep, maxPages: 3 });
  const gap = await snap('10.7/gap'), same = await snap('10.7/same'), conf = await snap('10.7/conf'), nol = await snap('10.7/none'), weak = await snap('10.7/weak');
  check('empty licence filled from OAPEN title metadata', gap.licence === 'CC BY-SA' && r!.licenceFilled === 1);
  check('evidence kept: metadata.licenceFill.OAPEN (title basis, handle)', gap.metadata?.licenceFill?.OAPEN?.licence === 'CC BY-SA' && gap.metadata.licenceFill.OAPEN.basis === 'title' && gap.metadata.licenceFill.OAPEN.handle === '20.500.12657/21' && gap.metadata?.sources?.OAPEN?.licenceBasis === 'title');
  const same_ = ['accessStatus', 'rightsStatus', 'rightsBasis', 'domain', 'source', 'status', 'pdfUrl', 'originalUrl', 'title'];
  check('accessStatus, rightsStatus, rightsBasis, department, source, status, pdfUrl, title: all UNCHANGED', same_.every(k => String(gap[k]) === String(gapBefore[k])), JSON.stringify(same_.filter(k => String(gap[k]) !== String(gapBefore[k]))));
  check('licenceIsNC is derived from the licence, so it moves with it: CC BY-SA → false (no contradictory flags)', gapBefore.licenceIsNC === true && gap.licenceIsNC === false);
  check('…and a conflict leaves licenceIsNC untouched', conf.licenceIsNC === true);
  check('the verified OAPEN file did not change access (still not viewable, no pdfUrl)', gap.accessStatus === 'MetadataOnly' && gap.pdfUrl === null);
  check('same licence both sides: nothing written for licence', same.licence === 'CC BY' && !same.metadata?.licenceFill && !same.metadata?.licenceConflicts);
  check('conflict: neither licence overwritten, disagreement recorded', conf.licence === 'CC BY-NC-ND' && conf.metadata?.licenceConflicts?.OAPEN?.theirs === 'CC BY' && r!.licenceConflicts === 1);
  check('OAPEN declares nothing → nothing filled', nol.licence === null && !nol.metadata?.licenceFill);
  check('"all rights reserved" is not a licence → nothing filled', weak.licence === null && !weak.metadata?.licenceFill);
  await runO({ maxPages: 3 });
  check('a second sighting does not refill or re-record', (await snap('10.7/gap')).metadata.licenceFill.OAPEN.filledAt === gap.metadata.licenceFill.OAPEN.filledAt);
}

section('Full text is held until the Book reader supports it');
{
  const { judgeBookAccess } = await import('../src/lib/ingestion/books/normalise.js');
  const b = { licence: 'CC BY', externalUrl: 'https://x', landingUrl: 'https://y' };
  const off = judgeBookAccess(b, { verifiedFileUrl: 'https://f.pdf' });
  check('default: verified CC BY file → Open External, link-only', off.access === 'OpenExternal' && off.accessStatus === 'LinkOnly' && off.rightsStatus === 'MetadataOnly');
  check('NC with a verified file → link-only either way', judgeBookAccess({ ...b, licence: 'CC BY-NC' }, { verifiedFileUrl: 'https://f.pdf' }).accessStatus === 'LinkOnly');
  process.env.BOOK_FULLTEXT = '1';
  const on = judgeBookAccess(b, { verifiedFileUrl: 'https://f.pdf' });
  const ncOn = judgeBookAccess({ ...b, licence: 'CC BY-NC-SA' }, { verifiedFileUrl: 'https://f.pdf' });
  const unkOn = judgeBookAccess({ ...b, licence: null }, { verifiedFileUrl: 'https://f.pdf' });
  delete process.env.BOOK_FULLTEXT;
  check('with the switch on (future): CC BY promotes; NC and unknown still do not', on.access === 'FullText' && ncOn.access !== 'FullText' && unkOn.access === 'MetadataOnly');
}

// ── NCBI Bookshelf ────────────────────────────────────────────────────────
section('NCBI: the TOC reader (explicit evidence only)');
const permCC = '<permissions><copyright-statement>Copyright 2018 Agency</copyright-statement><license xmlns:xlink="http://www.w3.org/1999/xlink" license-type="open-access" xlink:href="http://creativecommons.org/licenses/by-nc-nd/4.0/"><license-p>Except where otherwise noted, this work is distributed under the terms of a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International licence.</license-p></license></permissions>';
{
  check('CC licence from an xlink:href', readRights(permCC).licence === 'CC BY-NC-ND' && readRights(permCC).rights === 'cc');
  check('CC licence from ali:license_ref', readRights('<permissions><license><ali:license_ref xmlns:ali="x">https://creativecommons.org/licenses/by/4.0/</ali:license_ref></license></permissions>').licence === 'CC BY');
  check('CC licence from licence prose only', readRights('<permissions><license license-type="creative-commons"><license-p>All content is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International license (CC BY-NC-ND).</license-p></license></permissions>').licence === 'CC BY-NC-ND');
  const uk = readRights('<permissions><copyright-statement>Copyright Queen\'s Printer 2019</copyright-statement><license><ali:license_ref xmlns:ali="x">http://www.nationalarchives.gov.uk/doc/non-commercial-government-licence/version/2/</ali:license_ref></license></permissions>');
  check('a licence we do not recognise → Unknown, none invented', uk.licence === null && uk.rights === 'unrecognised');
  check('a copyright notice with no licence → Unknown', readRights('<permissions><copyright-statement>Copyright 2020 Springer, under exclusive license; Chapter 11 is licensed otherwise</copyright-statement></permissions>').licence === null);
  check('NO statement at all → Unknown (public domain is NOT inferred)', readRights('').licence === null && readRights('').rights === 'none');
  check('two different licences → ambiguous → Unknown', readRights('<permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/"></license><license xlink:href="https://creativecommons.org/licenses/by-nc/4.0/"></license></permissions>').rights === 'ambiguous');
  check('explicit public-domain wording → Public Domain', readRights('<permissions><license-p>This work is in the public domain.</license-p></permissions>').licence === 'Public Domain');
  check('"public domain" next to a copyright claim → not Public Domain', readRights('<permissions><copyright-statement>© 2010 Publisher. All rights reserved. Portions public domain.</copyright-statement></permissions>').licence === null);
  const toc = parseToc(`<book-part-wrapper><book-meta><book-title-group><book-title>Diabetes Care Guidelines</book-title></book-title-group><contrib-group><contrib contrib-type="author"><name><surname>Lovelace</surname><given-names>Ada</given-names></name></contrib><contrib contrib-type="editor"><collab>Expert Panel</collab></contrib></contrib-group><isbn>978-0-306-40615-7</isbn><publisher><publisher-name>Health Agency</publisher-name></publisher><abstract><p>Guidance for <italic>diabetes</italic> care.</p></abstract><custom-meta-group><custom-meta><meta-name>books-subject</meta-name><meta-value>Health Care</meta-value></custom-meta></custom-meta-group>${permCC}</book-meta></book-part-wrapper>`);
  check('TOC fields: authors, editors, ISBN, publisher, subject, abstract, licence', toc.authors[0] === 'Ada Lovelace' && toc.editors[0] === 'Expert Panel' && toc.isbns[0] === '9780306406157' && toc.publisher === 'Health Agency' && toc.subjects[0] === 'Health Care' && /diabetes care/.test(toc.abstract || '') && toc.licence === 'CC BY-NC-ND', JSON.stringify(toc).slice(0, 200));
  const list = parseNcbiList('File,Title,Publisher,Publication Year,Accession ID,Last Updated (YYYY-MM-DD HH:MM:SS)\nab/cd/x_NBK1.tar.gz,GeneReviews&#174; \xAE &amp; more,"A, B",1993,NBK1,2026-01-01 00:00:00\nbad,,x,1,NOTID,\n');
  check('list: entities decoded, bad rows dropped', list.length === 1 && list[0].title.startsWith('GeneReviews® ®') && list[0].publisher === 'A, B' && list[0].accession === 'NBK1');
}

const tarEntry = (name: string, data: Buffer) => {
  const h = Buffer.alloc(512); h.write(name, 0); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257);
  let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
};
const makeArchive = (dir: string, toc: string | null, junkBytes = 0) => gzipSync(Buffer.concat([
  tarEntry(`${dir}/big.mov`, randomBytes(junkBytes)), ...(toc ? [tarEntry(`${dir}/TOC.nxml`, Buffer.from(toc))] : []), tarEntry(`${dir}/license.txt`, Buffer.from('generic terms')), Buffer.alloc(1024)]));
const tocXml = (o: { title: string; isbn?: string; subjects?: string[]; abstract?: string; perms?: string; author?: string }) =>
  `<?xml version="1.0"?><book-part-wrapper><book-meta><book-title-group><book-title>${o.title}</book-title></book-title-group>${o.author ? `<contrib-group><contrib contrib-type="author"><name><surname>${o.author}</surname><given-names>A.</given-names></name></contrib></contrib-group>` : ''}${o.isbn ? `<isbn>${o.isbn}</isbn>` : ''}<publisher><publisher-name>Health Agency</publisher-name></publisher>${o.abstract ? `<abstract><p>${o.abstract}</p></abstract>` : ''}<custom-meta-group>${(o.subjects || []).map(x => `<custom-meta><meta-name>books-subject</meta-name><meta-value>${x}</meta-value></custom-meta>`).join('')}</custom-meta-group>${o.perms ?? ''}</book-meta></book-part-wrapper>`;
check('extractToc finds TOC.nxml behind a large media file', extractToc(makeArchive('x_NBK9', tocXml({ title: 'T' }), 200_000))?.includes('<book-title>T</book-title>') === true);

section('NCBI: stage 1 only shortlists; stage 2 reads the archive under limits');
await reset();
{
  const csvRow = (n: number, slug: string, title: string, year = 2015) => `ab/${String(n).padStart(2, '0')}/${slug}_NBK${n}.tar.gz,${title},Health Agency,${year},NBK${n},2026-01-01 00:00:00`;
  ncbiCsv = ['File,Title,Publisher,Publication Year,Accession ID,Last Updated (YYYY-MM-DD HH:MM:SS)',
    csvRow(1, 'a', 'Diabetes Care Guidelines'), csvRow(2, 'b', 'Dental Implant Handbook'), csvRow(3, 'c', 'The NCBI Style Guide'), csvRow(4, 'd', 'Nursing Assessment Manual'),
    csvRow(5, 'e', 'Pharmacology of Antiviral Drugs'), csvRow(6, 'f', 'Cancer Genetics Review'), csvRow(7, 'g', 'Huge Oncology Atlas'), csvRow(8, 'h', 'Broken Cardiology Archive'),
    csvRow(9, 'i', 'Cardiology Report'), csvRow(10, 'j', 'Asthma Management Guide')].join('\n');
  const perms = (u: string) => `<permissions><license xlink:href="${u}"></license></permissions>`;
  const A = (n: number, slug: string, t: any, junk = 0) => { ncbiArchives[`ab/${String(n).padStart(2, '0')}/${slug}_NBK${n}.tar.gz`] = makeArchive(`${slug}_NBK${n}`, tocXml(t), junk); };
  A(1, 'a', { title: 'Diabetes Care Guidelines', isbn: '9780198526636', subjects: ['Health Care'], abstract: 'Diabetes care for adults.', author: 'Lovelace', perms: perms('https://creativecommons.org/licenses/by-nc-nd/4.0/') });
  A(2, 'b', { title: 'Dental Implant Handbook', subjects: ['Dentistry'], abstract: 'Dental implants and oral health.', perms: '<permissions><license-p>This work is in the public domain.</license-p></permissions>' });
  A(4, 'd', { title: 'Nursing Assessment Manual', subjects: ['Nursing'], abstract: 'Nursing assessment.' });                                // no statement at all
  A(5, 'e', { title: 'Pharmacology of Antiviral Drugs', subjects: ['Pharmacology'], perms: '<permissions><copyright-statement>Copyright 2020 Someone. Chapter 3 is licensed differently.</copyright-statement></permissions>' });
  A(6, 'f', { title: 'Cancer Genetics Review', subjects: ['Genetics', 'Oncology'], perms: perms('https://creativecommons.org/licenses/by/4.0/') });
  A(7, 'g', { title: 'Huge Oncology Atlas', subjects: ['Oncology'] }, 3_000_000);                                                                   // over the per-file limit set below
  ncbiArchives['ab/08/h_NBK8.tar.gz'] = Buffer.from('this is not a gzip file');                                                                          // damaged
  A(9, 'i', { title: 'Cardiology Report', subjects: ['Cardiology'] });
  A(10, 'j', { title: 'Asthma Management Guide', subjects: ['Respiratory'] });
  catalogue = [{ handle: '20.500.12854/90', title: 'Cardiology Report', codes: MED, kw: ['medicine'], rights: 'CC-BY', year: '2015-01-01' }];   // DOAB already holds NBK9 by title + year
  await run({ maxPages: 3 });
  const tf = (k: string, v: string) => { process.env[k] = v; };
  tf('NCBI_BOOKS_MAX_ARCHIVE_BYTES', '2000000');

  const before = await db.book.count();
  const dry = await runN({ dryRun: true, maxPages: 30, maxArchives: 3, pageDelayMs: 0 });
  check('dry run writes nothing (no Book, no checkpoint, no publication)', (await db.book.count()) === before && (await db.bookHarvestCheckpoint.count({ where: { provider: 'NCBIBookshelf' } })) === 0);
  check('stage 1 shortlisted only health titles; the style guide was left out', dry.ncbi!.rows === 10 && dry.ncbi!.candidates === 9 && dry.outsideScope >= 1, JSON.stringify(dry.ncbi));
  check('title+year already held (NBK9) is recognised without downloading it', dry.ncbi!.existing === 1 && !ncbiRequests.some(u => u.includes('NBK9')));
  check('the dry-run sample stops at the cap of archives', dry.ncbi!.archives === 3, String(dry.ncbi!.archives));
  check('every NCBI suggestion is review at best: nothing auto-published (no code)', dry.department.strong === 0 && dry.added === 0);

  ncbiRequests = [];
  const r = await runN({ maxPages: 30 });
  const cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'NCBIBookshelf' } });
  check('real run completes through the list', r.completed && cp?.cursor === null && !!cp?.lastSuccessfulSyncAt && r.ncbi!.rows === 10, JSON.stringify(r.ncbi));
  const g = async (t: string) => db.book.findFirst({ where: { title: t, source: 'NCBIBookshelf' } });
  const dia = await g('Diabetes Care Guidelines'), den = await g('Dental Implant Handbook'), nur = await g('Nursing Assessment Manual'), pha = await g('Pharmacology of Antiviral Drugs'), can = await g('Cancer Genetics Review');
  check('nothing from NCBI is published: all Draft, no department, Ingested', [dia, den, nur, pha, can].every(b => b && b.status === 'Draft' && b.domain === null && b.ownershipSource === 'Ingested'), JSON.stringify([dia, den, nur, pha, can].map(b => b?.status)));
  check('Diabetes: authors, ISBN, accession, canonical link, CC BY-NC-ND kept, link-only', dia.authors === 'A. Lovelace' && dia.isbn === '9780198526636' && dia.sourceRecordId === 'NBK1' && dia.originalUrl === 'https://www.ncbi.nlm.nih.gov/books/NBK1/' && dia.licence === 'CC BY-NC-ND' && dia.accessStatus === 'LinkOnly' && dia.licenceIsNC === true && dia.fingerprint === 'ncbibookshelf:id:NBK1');
  check('explicit public domain recorded as Public Domain (link-only; never full text)', den.licence === 'Public Domain' && den.accessStatus === 'LinkOnly' && den.pdfUrl === null && den.metadata.harvest.provider.ncbi.rights === 'public-domain');
  check('no statement → rights Unknown, Metadata Only (NOT public domain)', nur.licence === null && nur.accessStatus === 'MetadataOnly' && nur.rightsStatus === 'MetadataOnly' && nur.metadata.harvest.provider.ncbi.rights === 'none');
  check('ambiguous wording → Unknown, Metadata Only', pha.licence === null && pha.accessStatus === 'MetadataOnly');
  check('a recognised CC BY is kept, but still link-only while full text is off', can.licence === 'CC BY' && can.accessStatus === 'LinkOnly' && can.pdfUrl === null);
  const broken = await g('Broken Cardiology Archive');
  check('damaged archive → catalogued from the list with rights Unknown / Metadata Only, parse failure recorded', r.ncbi!.parseFailures === 1 && (!broken || (broken.licence === null && broken.accessStatus === 'MetadataOnly' && broken.metadata.harvest.provider.ncbi.tocRead === false)));
  check('oversize archive skipped with a reason, not catalogued, not a failure', r.ncbi!.oversize === 1 && (await g('Huge Oncology Atlas')) === null && !r.sourceError);
  const h = await db.ingestionSourceHealth.findUnique({ where: { source: 'NCBI' } });
  check('neither a skip nor a damaged archive trips the provider breaker', !h?.pausedUntil && (h?.consecutiveFailures ?? 0) === 0, JSON.stringify(h));
  const pub = (await contentTypeCounts(db)).Books || 0;
  check('public Books count excludes every NCBI Draft', (await db.book.count({ where: { status: 'Published', source: 'NCBIBookshelf' } })) === 0 && pub === (await db.book.count({ where: { status: 'Published' } })));

  // limits
  await db.book.deleteMany({ where: { source: 'NCBIBookshelf' } }); await db.bookHarvestCheckpoint.deleteMany({ where: { provider: 'NCBIBookshelf' } });
  await db.ingestionAudit.deleteMany({ where: { action: 'NCBI_ARCHIVE_DOWNLOADED' } });
  tf('NCBI_BOOKS_MAX_ARCHIVES_PER_DAY', '2');
  const lim = await runN({ maxPages: 30 });
  const cp2 = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'NCBIBookshelf' } });
  check('daily archive limit: stops, position saved, reason reported, not a failure', lim.deferred?.includes('daily limit of 2') === true && !lim.sourceError && !lim.completed && cp2?.cursor !== null && lim.ncbi!.archives === 2, JSON.stringify([lim.deferred, cp2?.cursor, lim.ncbi?.archives]));
  const again = await runN({ maxPages: 30 });
  check('same day again: nothing more is downloaded', again.ncbi!.archives === 0 && !!again.deferred);
  let days = 0, total = lim.ncbi!.archives, resumedOk = true, last: any = lim;
  while (!last.completed && days < 8) {
    await db.ingestionAudit.deleteMany({ where: { action: 'NCBI_ARCHIVE_DOWNLOADED' } });     // "tomorrow"
    const before = (await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'NCBIBookshelf' } }))?.cursor;
    last = await runN({ maxPages: 30 }); days++; total += last.ncbi!.archives;
    resumedOk &&= last.resumedFrom === before;
  }
  check('each following day resumes from the saved position; the list is finished without re-downloading anything', last.completed && resumedOk && total === 7 /* 9 health titles − 1 already held − 1 over the size limit */, JSON.stringify([days, total, lim.ncbi]));
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;
  tf('NCBI_BOOKS_MAX_BYTES_PER_DAY', '1');
  await db.bookHarvestCheckpoint.deleteMany({ where: { provider: 'NCBIBookshelf' } }); await db.ingestionAudit.deleteMany({ where: { action: 'NCBI_ARCHIVE_DOWNLOADED' } });
  const byt = await runN({ maxPages: 30 });
  check('daily byte limit defers too', !!byt.deferred && /byte limit/.test(byt.deferred), String(byt.deferred));
  delete process.env.NCBI_BOOKS_MAX_BYTES_PER_DAY; delete process.env.NCBI_BOOKS_MAX_ARCHIVE_BYTES;

  // ISBN dedupe against a held book, found only after the archive is read
  await db.book.deleteMany({ where: { source: 'NCBIBookshelf' } }); await db.bookHarvestCheckpoint.deleteMany({ where: { provider: 'NCBIBookshelf' } });
  await db.book.create({ data: { title: 'Diabetes Handbook (other title)', isbn: '9780198526636', source: 'DOAB', status: 'Published', domain: 'Medical Sciences', fingerprint: 'doab:t:x', licence: 'CC BY' } });
  await runN({ maxPages: 30 });
  const sameIsbn = await db.book.findMany({ where: { isbn: '9780198526636' } });
  check('an NCBI book with a held ISBN is enriched, never duplicated', sameIsbn.length === 1 && sameIsbn[0].source === 'DOAB' && sameIsbn[0].metadata?.sources?.NCBIBookshelf?.handle === 'NBK1' && sameIsbn[0].licence === 'CC BY');
  const dupIsbn = await db.$queryRawUnsafe(`select isbn from "Book" where isbn is not null group by 1 having count(*)>1`);
  check('no duplicate ISBN', dupIsbn.length === 0);
  check('not due until DOAB has finished a harvest', (await (async () => { await db.bookHarvestCheckpoint.deleteMany({}); return runScheduledHarvest(NCBI_FEED, { pageDelayMs: 0, sleep: nosleep }); })()) === null);
}

section('NCBI: priority shortlist (stage 1)');
{
  const row = (n: number, title: string) => ({ file: `x/${n}.tar.gz`, title, publisher: 'P', year: 2015, accession: `NBK${n}`, updated: null });
  const generic = ['Non-pharmacological Interventions for Pain', 'Nursing Home Residents Study', 'Review of a Drug (Novartis Pharmaceuticals Canada Inc.)', 'Health Policy Report', 'Clinical Disease Patient Medicine', 'Annual Report on Medicine and Health', 'Patient Information Booklet', 'The NCBI Style Guide'];
  check('generic health words alone never shortlist a title', generic.every((t, i) => shortlistTitle(row(i, t)) === null), JSON.stringify(generic.map((t, i) => shortlistTitle(row(i, t))?.reason)));
  const dent = shortlistTitle(row(1, 'Periodontal Disease and Oral Health'));
  check('department-specific wording shortlists, with department, tier, score and evidence', dent?.department === 'Dental' && dent.tier === 1 && dent.score >= 3 && dent.evidence.length >= 1 && /periodontal|oral health/.test(dent.reason), JSON.stringify(dent));
  check('midwifery → Nursing (tier 1), pharmacokinetics → Pharmacy (tier 1), physical therapy → Physiotherapy (tier 1)',
    shortlistTitle(row(2, 'Midwifery Practice'))?.department === 'Nursing' && shortlistTitle(row(3, 'Clinical Pharmacokinetics Handbook'))?.department === 'Pharmacy' && shortlistTitle(row(4, 'Physical Therapy for Stroke Recovery'))?.department === 'Physiotherapy');
  check('bioprocess → Bio Technology (tier 2), cardiology → Medical Sciences (tier 2), microbiology → Life Sciences (tier 3)',
    shortlistTitle(row(5, 'Bioprocess Engineering'))?.tier === 2 && shortlistTitle(row(6, 'Cardiology Update'))?.department === 'Medical Sciences' && shortlistTitle(row(7, 'Microbiology of the Soil'))?.tier === 3);
  check('relevance decides the department: the more specific wording wins over the lower tier', shortlistTitle(row(8, 'Oncology, Cardiology and Neurology Practice'))?.department === 'Medical Sciences');
  const rows = [row(10, 'Cardiology Update'), row(11, 'Microbiology of the Soil'), row(12, 'Dental Anatomy'), row(13, 'Nursing Care'), row(14, 'Health Report'), row(15, 'Pharmacy Practice'), row(16, 'Dental Implants and Periodontology')];
  const q = buildQueue(rows, departmentOrder({ Dental: 500, Nursing: 5 }));
  check('queue: generic title left out; tier 1 before tier 2 before tier 3', q.length === 6 && q.map(x => x.tier).join('') === [...q.map(x => x.tier)].sort().join('') && q[0].tier === 1 && q[q.length - 1].tier === 3, q.map(x => `${x.department}:${x.row.accession}`).join(' '));
  check('within a tier the strongest title evidence goes first', q[0].row.accession === 'NBK16', q[0].row.accession);
  check('the thinner-covered department leads on a tie', departmentOrder({ Dental: 500, Nursing: 5 }).indexOf('Nursing') < departmentOrder({ Dental: 500, Nursing: 5 }).indexOf('Dental'));
  const il = interleave(buildQueue([...rows, row(17, 'Dental Hygiene'), row(18, 'Dental Materials')], departmentOrder()), departmentOrder());
  check('a bounded sample takes a turn from each department (tier 1 first)', il.slice(0, 4).map(x => x.department).join() === 'Dental,Nursing,Pharmacy,Medical Sciences' || il[0].department === 'Dental' && new Set(il.slice(0, 5).map(x => x.department)).size >= 4, il.map(x => x.department).join());
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY; delete process.env.NCBI_BOOKS_MAX_BYTES_PER_DAY; delete process.env.NCBI_BOOKS_MAX_ARCHIVE_BYTES; delete process.env.NCBI_BOOKS_DOWNLOAD_CONCURRENCY;
  const lim = ncbiLimits();
  check('initial rollout limits: 50 archives/day, 500 MB/day, 50 MB/archive, 1 at a time', lim.maxArchivesPerDay === 50 && lim.maxBytesPerDay === 524288000 && lim.maxArchiveBytes === 52428800 && lim.concurrency === 1, JSON.stringify(lim));
  process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY = '7';
  check('limits stay configurable', ncbiLimits().maxArchivesPerDay === 7);
  delete process.env.NCBI_BOOKS_MAX_ARCHIVES_PER_DAY;
}

section('Connection timeout is NCBI-only');
await reset();
{
  connectTimeouts = {};
  catalogue = [{ handle: '20.500.12854/1', title: 'Law of Contracts', codes: LAW, kw: ['contract law'], rights: 'CC-BY' }];
  await run({ maxPages: 1 });
  ncbiCsv = 'File,Title,Publisher,Publication Year,Accession ID,Last Updated (YYYY-MM-DD HH:MM:SS)\nab/01/a_NBK1.tar.gz,Dental Anatomy,P,2015,NBK1,2026-01-01 00:00:00';
  await runN({ dryRun: true, maxPages: 1 });
  check('NCBI requests ask for a 3 s connect window', connectTimeouts['ftp.ncbi.nlm.nih.gov'] === 3000, JSON.stringify(connectTimeouts));
  check('DOAB requests keep the default (no override)', connectTimeouts['repository.doabooks.org'] === undefined && Object.entries(connectTimeouts).filter(([h]) => h !== 'ftp.ncbi.nlm.nih.gov').every(([, v]) => v === undefined), JSON.stringify(connectTimeouts));
  await db.ingestionAudit.deleteMany({ where: { action: 'NCBI_ARCHIVE_DOWNLOADED' } });
}

section('OAPEN failing does not stop DOAB');
await reset();
catalogue = [{ handle: '20.500.12854/1', title: 'Law of Contracts', doi: '10.5/c', codes: LAW, kw: ['contract law'], rights: 'CC-BY' }];
{
  oapenMode = '429';
  for (let i = 0; i < 6; i++) await runO({ maxPages: 1 });
  const ho = await db.ingestionSourceHealth.findUnique({ where: { source: 'OAPEN' } });
  check('OAPEN breaker open', !!ho?.pausedUntil);
  const r = await run({ maxPages: 3 });
  check('DOAB harvest unaffected', r.added === 1 && !r.sourceError);
  const { runIngestionPass } = await import('../src/lib/ingestionWorker.js');
  await db.bookHarvestCheckpoint.updateMany({ where: { provider: 'DOAB' }, data: { lastSuccessfulSyncAt: new Date(Date.now() - 7 * 3600_000) } });
  catalogue.push({ handle: '20.500.12854/2', title: 'Tort Law', doi: '10.5/t', codes: LAW, kw: ['tort law'], rights: 'CC-BY' });
  const pass: any = await runIngestionPass(['Law'], { force: true, only: 'books' });
  check('engine pass: DOAB goes on while OAPEN is down', pass.source === 'DOAB' && pass.added === 1, JSON.stringify([pass.source, pass.added, pass.error]));
}

section('Engine: Books mode runs the OAI harvest and logs it');
await reset();
catalogue = [
  { handle: '20.500.12854/1', title: 'Law of Contracts', codes: LAW, kw: ['contract law'], rights: 'CC-BY' },
  { handle: '20.500.12854/2', title: 'Notes on Various Matters', kw: ['notes'] },
];
{
  const { runIngestionPass } = await import('../src/lib/ingestionWorker.js');
  await db.ingestionRun.deleteMany({ where: { phase: 'Books' } });
  const r: any = await runIngestionPass(['Law'], { force: true, only: 'books' });
  const log = await db.ingestionRun.findFirst({ where: { phase: 'Books' }, orderBy: { at: 'desc' } });
  check('Books pass used OAI, added the classified book', r.phase === 'Books' && r.added === 1 && (await db.book.count()) === 1, JSON.stringify([r.phase, r.added, r.error]));
  check('run log row: source DOAB, added 1, unclassifiable counted as no department match', log?.source === 'DOAB' && log.added === 1 && log.skippedRejected === 1 && /OAI-PMH/.test(log.note || ''), JSON.stringify(log));
  check('no keyword sweep rows were created or touched', (await db.departmentSweep.count({ where: { source: 'DOAB' } })) === 0);
  const second: any = await runIngestionPass(['Law'], { force: true, only: 'books' });
  check('immediately after: DOAB not due again, OAPEN finds nothing, no duplicate', (await db.book.count()) === 1 && !(second.added > 0), JSON.stringify(second).slice(0, 160));
}

await reset();
__useFetchForTests(null);
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
