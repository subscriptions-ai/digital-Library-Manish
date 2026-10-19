/**
 * The Book providers added for catalogue growth — Crossref Books, NLM Catalog, Pressbooks Directory, the Open Library data dump, and Google
 * Books enrichment — against a fake network and the throwaway database `stm_ingestion_test` (refuses anything else).
 *
 *   npx tsx scripts/test-book-providers.ts
 *
 * Nothing here reaches the internet; nothing in the real catalogue is touched. What it pins down: every record read ends in exactly one bucket;
 * Metadata Only is never a Read button; a licence is never invented; the dump is streamed (never held), resumable and tied to its file;
 * a bulk run can be paused and carries on; and a source that rests is not asked.
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.PRESSBOOKS_LICENCE_CHECKS = '20';
delete process.env.BOOKS_CROSSREF; delete process.env.BOOKS_PRESSBOOKS; delete process.env.GOOGLE_BOOKS_API_KEY; delete process.env.OPENLIBRARY_DUMP_FILE;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const { __useFetchForTests, __useSleepForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const { __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');
const H = await import('../src/lib/ingestion/books/oaiHarvest.js');
const Q = await import('../src/lib/ingestion/quickImport.js');
const B = await import('../src/lib/ingestion/bulkCatalogue.js');
const X = await import('../src/lib/ingestion/books/extraKinds.js');
const D = await import('../src/lib/ingestion/books/openLibraryDump.js');
const G = await import('../src/lib/ingestion/books/googleBooks.js');
const { departmentFromNlm, classifyDepartment } = await import('../src/lib/ingestion/books/classifier.js');
const { normaliseCrossrefBook } = await import('../src/lib/ingestion/books/crossrefBooks.js');
const { normaliseNlmRecord } = await import('../src/lib/ingestion/books/nlmCatalog.js');
const { licenceFromMetadata } = await import('../src/lib/ingestion/books/pressbooks.js');
const { providerMatrix } = await import('../src/lib/ingestion/providerMatrix.js');
const { buildProviders } = await import('../src/lib/ingestion/providers.js');
const { isbn13s } = await import('../src/lib/ingestion/books/identifiers.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {}); Q.__useQuickPageDelayForTests(0); B.__useBulkDelayForTests(0);
const RUN = Date.now().toString(36);
const admin = { id: 'test-admin', email: 'qa@example.test' };

// ISBN-13 with a correct check digit, so the books are matchable.
const isbn = (n: number) => { const core = `978${String(100000000 + n).padStart(9, '0')}`; let s = 0; for (let i = 0; i < 12; i++) s += Number(core[i]) * (i % 2 ? 3 : 1); return core + ((10 - (s % 10)) % 10); };

// ── the fake network ───────────────────────────────────────────────────────
const requests: string[] = [];
const hits = (frag: string) => requests.filter(u => u.includes(frag)).length;
let crossrefPages: any[][] = [];
let pressbooksPages: any[][] = [];
const pressLicence: Record<string, { status: number; body?: any }> = {};
let nlmRecords: Record<string, string> = {};
let googleItems: Record<string, any> = {};
let googleStatus = 200;
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

const nlmXml = (id: string, o: { title: string; cls: string; mesh: string[]; publisher?: string; isbn?: string; year?: string; type?: string }) => `<NLMCatalogRecord Owner="NLM" Status="Completed"><NlmUniqueID>${id}</NlmUniqueID>
<TitleMain><Title Sort="0">${o.title}</Title></TitleMain>
<AuthorList CompleteYN="Y"><Author><LastName>Wilkinson</LastName><ForeName>Judith M</ForeName></Author></AuthorList>
<ResourceInfo><TypeOfResource>${o.type ?? 'Book'}</TypeOfResource><Issuance>monographic</Issuance></ResourceInfo>
<PublicationInfo><Country>United States</Country><Imprint ImprintType="Original"><Place>Philadelphia :</Place><Entity>${o.publisher ?? 'F.A. Davis Co.,'}</Entity></Imprint><PublicationFirstYear>${o.year ?? '2007'}</PublicationFirstYear></PublicationInfo>
<Language LangType="Primary">eng</Language><ISBN>${o.isbn ?? isbn(1)} (v. 1)</ISBN><Classification>${o.cls}</Classification>
<MeshHeadingList>${o.mesh.map(m => `<MeshHeading><DescriptorName MajorTopicYN="N">${m}</DescriptorName></MeshHeading>`).join('')}</MeshHeadingList></NLMCatalogRecord>`;

__useFetchForTests((async (url: string) => {
  requests.push(url);
  const u = new URL(url);
  if (u.hostname === 'api.crossref.org') {
    const cursor = u.searchParams.get('cursor') || '*';
    const idx = cursor === '*' ? 0 : Number(cursor.replace('c', ''));
    const items = crossrefPages[idx] ?? [];
    return json({ message: { items, 'next-cursor': `c${idx + 1}`, 'total-results': crossrefPages.flat().length } });
  }
  if (u.hostname === 'eutils.ncbi.nlm.nih.gov') {
    if (u.pathname.endsWith('esearch.fcgi')) {
      const term = u.searchParams.get('term') || '';
      const ids = term.includes('nursing[Subject]') ? Object.keys(nlmRecords) : [];
      return json({ esearchresult: { count: String(ids.length), idlist: ids } });
    }
    if (u.pathname.endsWith('efetch.fcgi')) {
      const ids = (u.searchParams.get('id') || '').split(',');
      return new Response(`<?xml version="1.0"?><NLMCatalogRecordSet>${ids.map(i => nlmRecords[i] || '').join('')}</NLMCatalogRecordSet>`, { status: 200 });
    }
  }
  if (u.hostname === 'pressbooks.directory') {
    const page = Number(u.searchParams.get('page') || 1);
    const pubs = pressbooksPages[page - 1] ?? [];
    return json({ metadata: { numberOfItems: pressbooksPages.flat().length }, links: page < pressbooksPages.length ? [{ rel: 'next', href: `https://pressbooks.directory/opds?page=${page + 1}` }] : [], publications: pubs });
  }
  if (u.pathname.endsWith('/wp-json/pressbooks/v2/metadata')) {
    const r = pressLicence[u.hostname] ?? { status: 404 };
    return r.status === 200 ? json(r.body) : new Response('no', { status: r.status });
  }
  if (u.hostname === 'www.googleapis.com') {
    if (googleStatus !== 200) return new Response('quota', { status: googleStatus });
    const q = u.searchParams.get('q') || ''; const i = q.replace('isbn:', '');
    return json({ items: googleItems[i] ? [googleItems[i]] : [] });
  }
  return new Response('not in this test', { status: 404 });
}) as any);

const SOURCES = ['CrossrefBooks', 'NLMCatalog', 'Pressbooks', 'OpenLibraryDump'];
const cleanDb = async () => {
  await db.book.deleteMany({ where: { OR: [{ source: { in: SOURCES } }, { title: { contains: RUN } }] } });
  await db.bookHarvestCheckpoint.deleteMany({ where: { provider: { in: SOURCES } } });
  await db.ingestionSourceHealth.deleteMany({ where: { source: { in: ['Crossref', 'NLMCatalog', 'Pressbooks', 'OpenLibraryDump', 'GoogleBooks'] } } });
  await db.appSetting.deleteMany({ where: { key: { in: ['ingestion.bulk.v1', 'ingestion.olbulk.v1', 'ingestion.googlebooks.v1'] } } });
  await db.ingestionAudit.deleteMany({ where: { action: { in: ['QUICK_IMPORT_FINISHED', 'BULK_SYNC_STARTED', 'BULK_SYNC_FINISHED', 'BULK_SYNC_FAILED'] } } });
  await db.ingestionRun.deleteMany({ where: { OR: [{ source: { in: ['Crossref Books', 'NLM Catalog', 'Pressbooks Directory', 'Bulk · Open Library'] } }, { source: { startsWith: 'Bulk ·' } }] } });
  __resetProviderLocks(); Q.__resetQuickJobsForTests(); B.__resetBulkForTests(); X.closeDumpReaders(); requests.length = 0;
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const done = async (job: any) => { const t0 = Date.now(); for (;;) { const j = Q.getQuickJob(job.id); if (!j || j.status !== 'running') return j; if (Date.now() - t0 > 60_000) throw new Error('quick import did not finish'); await sleep(20); } };
const balanced = (r: any) => r.added + r.alreadyHeld + r.needsReview + r.skipped + r.failed === r.checked;
const tmp = mkdtempSync(join(tmpdir(), 'stm-ol-'));

try {
  await cleanDb();
  // ═══════════════════════════════════════════════════════════════════════
  section('1. Crossref Books — metadata only, never a licence, chapters not catalogued as books');
  const cr = (over: any = {}) => ({ DOI: `10.9999/${RUN}.${Math.random().toString(36).slice(2, 8)}`, type: 'book', title: [`Principles of Thermal Systems ${RUN}`], publisher: 'Test Press', author: [{ given: 'Ada', family: 'Lovelace' }], issued: { 'date-parts': [[2019]] }, ISBN: [isbn(7)], subject: ['Engineering'], language: 'en', indexed: { 'date-time': '2026-10-01T00:00:00Z' }, license: [{ URL: 'https://creativecommons.org/licenses/by/4.0/' }], ...over });
  const good1 = cr({ title: [`Mechanical Engineering Thermodynamics ${RUN} One`], subject: ['Mechanical engineering'], ISBN: [isbn(7)] }), good2 = cr({ title: [`Mechanical Engineering Thermodynamics ${RUN} Two`], subject: ['Mechanical engineering'], subtitle: ['A Course'], ISBN: [isbn(8)] });
  const chapter = cr({ type: 'book-chapter', title: [`A Chapter ${RUN}`] }), thin = cr({ publisher: undefined, author: undefined, title: [`Orphan ${RUN}`] });
  crossrefPages = [[good1, chapter, good2, thin], [cr({ title: [`Mechanical Engineering Thermodynamics ${RUN} Three`], subject: ['Mechanical engineering'], ISBN: [isbn(9)] })]];
  const n1 = normaliseCrossrefBook('CrossrefBooks', good2)!;
  check('subtitle is joined to the title; the DOI is the id; ISBN is normalised', n1.title === `Mechanical Engineering Thermodynamics ${RUN} Two: A Course` && n1.sourceRecordId === good2.DOI && n1.isbns[0] === isbn(8));
  check('a Creative Commons URL in Crossref\'s licence field is NOT taken as the book\'s licence', n1.licence === null && n1.licenceBasis === 'none' && /creativecommons/.test(String((n1.extra as any).tdmLicenceUrl)));
  check('a chapter is not a book; a record with no contributor and no publisher is unusable', normaliseCrossrefBook('x', chapter) === null && normaliseCrossrefBook('x', thin) === null);
  let rep = await H.harvestFeed(H.CROSSREF_BOOKS_FEED, { manual: true, ignoreCheckpoint: true, startToken: null, from: null, maxPages: 5, pageDelayMs: 0 });
  check('walked both pages by cursor, never asking for the first page twice', rep.pages === 3 && hits('cursor=*') === 1 && rep.fetched === 5, `${rep.pages} pages, ${rep.fetched} fetched, first-page asks ${hits('cursor=*')}`);
  check('every record is accounted for (the chapter and the thin record are skipped, not dropped)', rep.accounting?.ok === true, JSON.stringify(rep.accounting));
  const crBooks = await db.book.findMany({ where: { source: 'CrossrefBooks' } });
  check('nothing from Crossref is Published: every new book waits for review', crBooks.length > 0 && crBooks.every(b => b.status === 'Draft'), `${crBooks.length} books: ${crBooks.map(b => b.status).join(',')}; band counts ${JSON.stringify(rep.department)}`);
  check('every one is Metadata Only with no licence (no Read / Open Access button)', crBooks.every(b => b.accessStatus === 'MetadataOnly' && !b.licence), crBooks.map(b => `${b.accessStatus}/${b.licence}`).join(','));
  const rep2 = await H.harvestFeed(H.CROSSREF_BOOKS_FEED, { manual: true, ignoreCheckpoint: true, startToken: null, from: null, maxPages: 5, pageDelayMs: 0 });
  check('a second walk adds nothing: what was held is held again, and the arithmetic still balances', (await db.book.count({ where: { source: 'CrossrefBooks' } })) === crBooks.length && rep2.added === 0 && rep2.queuedForReview === 0 && rep2.accounting?.ok === true, `held ${crBooks.length}; second walk new ${rep2.queuedForReview}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('2. NLM Catalog — the NLM classification is a controlled code, so a health book can be placed; still Metadata Only');
  check('NLM class → department: WY nursing, WU dental, QV pharmacy, WB 460–545 physiotherapy, W medicine, unmapped → null', departmentFromNlm('WY 100 W686f') === 'Nursing' && departmentFromNlm('WU 300') === 'Dental' && departmentFromNlm('QV 735') === 'Pharmacy' && departmentFromNlm('WB 460') === 'Physiotherapy' && departmentFromNlm('WB 100') === 'Medical Sciences' && departmentFromNlm('WG 120') === 'Medical Sciences' && departmentFromNlm('ZZ 1') === null);
  const rec = nlmXml('9990001', { title: `Fundamentals of Nursing ${RUN}.`, cls: 'WY 100 W686f 2007', mesh: ['Nursing Care', 'Nursing Process'], isbn: isbn(21) });
  const nb = normaliseNlmRecord('NLMCatalog', rec)!;
  check('record parsed: title (trailing full stop dropped), author, publisher, year, ISBN, MeSH, class', nb.title === `Fundamentals of Nursing ${RUN}` && nb.authors === 'Judith M Wilkinson' && nb.publisherName === 'F.A. Davis Co.' && nb.year === 2007 && nb.isbns[0] === isbn(21) && nb.subjects.includes('Nursing Care') && (nb.extra as any).nlmClass[0].startsWith('WY'), JSON.stringify({ t: nb.title, p: nb.publisherName, y: nb.year }));
  check('a serial is not a book', normaliseNlmRecord('x', nlmXml('9990002', { title: 'Journal', cls: 'W 1', mesh: [], type: 'Serial' })) === null);
  const v = classifyDepartment({ nlm: ['WY 100 W686f 2007'], subjects: ['Nursing Care'], title: 'Fundamentals of Nursing' });
  check('code + title + subject agree → strong', v.band === 'strong' && v.department === 'Nursing', `${v.band} ${v.department}`);
  const vw = classifyDepartment({ subjects: ['Nursing Care'], title: 'Fundamentals of Nursing' });
  check('without the code the same words are only "review" (the safety rule is unchanged)', vw.band === 'review');
  nlmRecords = { '9990001': rec, '9990002': nlmXml('9990002', { title: `Pharmacology for Nurses ${RUN}`, cls: 'QV 4 P5233 2010', mesh: ['Pharmacology', 'Nursing'], isbn: isbn(22), publisher: 'Elsevier' }), '9990003': nlmXml('9990003', { title: `Weather Almanac ${RUN}`, cls: 'QC 981', mesh: [], isbn: isbn(23) }) };
  const job = await done(await Q.beginQuickImport('nlm', admin));
  const r = job.result;
  check('Quick Import ran and accounted for every record', job.status === 'done' && balanced(r) && r.checked === 3, JSON.stringify({ s: job.status, c: r?.checked, a: r?.added, h: r?.alreadyHeld, v: r?.needsReview, k: r?.skipped }));
  const nlm = await db.book.findMany({ where: { source: 'NLMCatalog' } });
  const nursing = nlm.find(b => b.title.startsWith('Fundamentals of Nursing'));
  check('the nursing book was published into Nursing, as Metadata Only, with no licence and a catalogue link', nursing?.status === 'Published' && nursing.domain === 'Nursing' && nursing.accessStatus === 'MetadataOnly' && !nursing.licence && /nlmcatalog/.test(nursing.originalUrl || ''), JSON.stringify({ s: nursing?.status, d: nursing?.domain, a: nursing?.accessStatus }));
  check('the pharmacology book (QV) went to Pharmacy only if allowed — otherwise it was skipped, never forced', nlm.every(b => b.status !== 'Published' || ['Nursing', 'Pharmacy'].includes(b.domain || '')) && !nlm.some(b => b.title.startsWith('Weather Almanac') && b.status === 'Published'));
  check('NLM has its own health row: nothing was recorded against NCBI Bookshelf', (await db.ingestionSourceHealth.findUnique({ where: { source: 'NLMCatalog' } }))?.lastOkAt != null && !(await db.ingestionSourceHealth.findUnique({ where: { source: 'NCBI' } }))?.lastOkAt);

  // ═══════════════════════════════════════════════════════════════════════
  section('3. Pressbooks Directory — the licence comes from each book, never from the directory');
  const pb = (n: number, host: string, extra: any = {}) => ({ metadata: { '@type': 'http://schema.org/Book', identifier: `urn:pressbooks.directory:book:${RUN}-${n}`, title: `Open Chemistry ${RUN} ${n}`, author: 'Grace Hopper', language: 'en', publisher: 'Test University', modified: '2026-10-01T00:00:00Z', description: 'A course.', subject: [{ name: 'Chemistry' }, { name: 'Children’s / Teenage general interest: Science' }], ...extra }, links: [{ rel: 'self', href: `https://${host}/chem${n}/`, type: 'text/html' }, { rel: 'http://opds-spec.org/acquisition', href: `https://${host}/chem${n}/open/download?type=pdf`, type: 'application/pdf' }], images: [{ href: `https://${host}/cover${n}.png` }] });
  pressbooksPages = [[pb(1, 'open-a.example.edu'), pb(2, 'closed-b.example.edu'), pb(3, 'down-c.example.edu')], [pb(4, 'open-a.example.edu')]];
  pressLicence['open-a.example.edu'] = { status: 200, body: { license: { url: 'https://creativecommons.org/licenses/by/4.0/', name: 'CC BY 4.0' } } };
  pressLicence['closed-b.example.edu'] = { status: 200, body: { license: { name: 'All Rights Reserved' } } };
  pressLicence['down-c.example.edu'] = { status: 500 };
  check('licence read from the book\'s metadata: "CC BY 4.0" → CC BY; "All Rights Reserved" → none', licenceFromMetadata({ license: { url: 'https://creativecommons.org/licenses/by/4.0/', name: 'CC BY 4.0' } }) === 'CC BY' && licenceFromMetadata({ license: { name: 'All Rights Reserved' } }) === null && licenceFromMetadata({}) === null);
  rep = await H.harvestFeed(H.PRESSBOOKS_FEED, { manual: true, ignoreCheckpoint: true, startToken: null, from: null, maxPages: 5, pageDelayMs: 0 });
  check('both pages walked; all 4 accounted for', rep.pages === 2 && rep.fetched === 4 && rep.accounting?.ok === true, `${rep.pages} pages ${rep.fetched} fetched ${JSON.stringify(rep.accounting)}`);
  const pbBooks = await db.book.findMany({ where: { source: 'Pressbooks' }, orderBy: { title: 'asc' } });
  const byN = (n: number) => pbBooks.find(b => b.title.endsWith(` ${n}`))!;
  check('the open book carries its CC BY licence and is linked (not hosted), with its cover', byN(1).licence === 'CC BY' && byN(1).accessStatus === 'LinkOnly' && !!byN(1).coverUrl, `${byN(1).licence} ${byN(1).accessStatus} ${byN(1).coverUrl}`);
  check('the all-rights-reserved book has NO licence, is Metadata Only, and no cover is kept', !byN(2).licence && byN(2).accessStatus === 'MetadataOnly' && !byN(2).coverUrl);
  check('a book whose site is down is Metadata Only — and that did not count against the directory\'s breaker', !byN(3).licence && byN(3).accessStatus === 'MetadataOnly' && ((await db.ingestionSourceHealth.findUnique({ where: { source: 'Pressbooks' } }))?.consecutiveFailures ?? 0) === 0);
  check('every Pressbooks book waits for review (words alone never place a department)', pbBooks.length === 4 && pbBooks.every(b => b.status === 'Draft'));
  const before = hits('/wp-json/pressbooks');
  await H.harvestFeed(H.PRESSBOOKS_FEED, { manual: true, ignoreCheckpoint: true, startToken: null, from: null, maxPages: 5, pageDelayMs: 0 });
  check('on a second walk the books are already held, so no site is asked for a licence again', hits('/wp-json/pressbooks') === before);

  // ═══════════════════════════════════════════════════════════════════════
  section('4. Open Library data dump — parser and filter');
  const edition = (o: any) => `/type/edition\t/books/OL${o.n}M\t1\t2024-01-01T00:00:00.000000\t${JSON.stringify({ title: `Digital Communication Systems ${RUN} ${o.n}`, publishers: ['Wiley'], isbn_13: [isbn(1000 + o.n)], lc_classifications: ['TK5101 .A1'], subjects: ['Telecommunication', 'Wireless communication systems'], by_statement: 'by Claude Shannon', publish_date: '2015', number_of_pages: 400, languages: [{ key: '/languages/eng' }], ...o.json })}`;
  const P = (line: string) => D.parseEditionLine('OpenLibraryDump', line);
  const ok = P(edition({ n: 1 }));
  check('an academic edition becomes a candidate: ISBN, LCC class, author from the by-statement, Open Library link, no licence', !!ok.candidate && ok.candidate.isbns[0] === isbn(1001) && ok.candidate.lcc[0].startsWith('TK5101') && ok.candidate.authors === 'Claude Shannon' && ok.candidate.licence === null && /openlibrary\.org\/books\/OL1M/.test(ok.candidate.landingUrl!), JSON.stringify(ok.reject));
  check('fiction (LCC PS) is rejected', P(edition({ n: 2, json: { lc_classifications: ['PS3545 .A1'], subjects: ['Fiction'] } })).reject === 'fiction-or-children');
  check('a children\'s book is rejected', P(edition({ n: 3, json: { subjects: ['Juvenile literature'], lc_classifications: [] } })).reject === 'fiction-or-children');
  check('no ISBN → rejected (it could not be matched later)', P(edition({ n: 4, json: { isbn_13: undefined } })).reject === 'no-isbn');
  check('no academic evidence (a travel guide) → not-academic', P(edition({ n: 5, json: { lc_classifications: [], subjects: ['Travel'], publishers: ['Penguin'] } })).reject === 'not-academic');
  check('an academic publisher alone is evidence enough to be a candidate', !!P(edition({ n: 6, json: { lc_classifications: [], subjects: ['Misc'], publishers: ['Cambridge University Press'] } })).candidate);
  check('bad JSON is "unreadable"; a non-edition record is "not-an-edition"; a delete is "deleted"', P('/type/edition\t/books/OL1M\t1\t2024\t{broken').reject === 'unreadable' && P('/type/author\t/authors/OL1A\t1\t2024\t{}').reject === 'not-an-edition' && P('/type/delete\t/books/OL9M\t1\t2024\t{}').reject === 'deleted');

  section('5. Open Library data dump — streaming, resuming, and the file\'s identity');
  const lines: string[] = [];
  for (let i = 1; i <= 700; i++) lines.push(edition({ n: i }));
  lines.splice(10, 0, edition({ n: 9001, json: { lc_classifications: ['PS1 .A'], subjects: ['Fiction'] } }), '/type/author\t/authors/OL1A\t1\t2024\t{}', 'garbage', edition({ n: 9002, json: { isbn_13: undefined } }));
  const gz = join(tmp, 'ol_dump_editions_test.txt.gz'); writeFileSync(gz, gzipSync(lines.join('\n') + '\n'));
  const src = { kind: 'file' as const, location: gz };
  const rd = new D.DumpReader(src);
  const b1 = await rd.batch(0, { maxCandidates: 100 });
  check('first batch: 100 candidates, and every line read is a candidate or a counted rejection', b1.candidates.length === 100 && b1.read === b1.candidates.length + Object.values(b1.rejects).reduce((a, c) => a + c, 0) && b1.rejects['fiction-or-children'] === 1 && b1.rejects['unreadable'] === 1 && b1.rejects['not-an-edition'] === 1 && b1.rejects['no-isbn'] === 1, JSON.stringify({ read: b1.read, rejects: b1.rejects }));
  check('the position is the next line to read', b1.next === b1.read);
  const b2 = await rd.batch(b1.next!, { maxCandidates: 100 });
  check('the open stream carries on (no re-read of the prefix): candidate #101 follows #100', b2.candidates[0].sourceRecordId === 'OL101M' && b1.candidates[99].sourceRecordId === 'OL100M' && rd.isOpen);
  const rd2 = new D.DumpReader(src);
  const b2b = await rd2.batch(b1.next!, { maxCandidates: 100 });
  check('a NEW reader resuming from the saved line (after a restart) reads exactly the same next batch', JSON.stringify(b2b.candidates.map(c => c.sourceRecordId)) === JSON.stringify(b2.candidates.map(c => c.sourceRecordId)));
  const other = join(tmp, 'ol_dump_editions_next_month.txt.gz'); writeFileSync(other, gzipSync(lines.slice(0, 300).join('\n') + '\n'));
  const rd3 = new D.DumpReader({ kind: 'file', location: other });
  const b3 = await rd3.batch(b1.next!, { maxCandidates: 50, identity: b1.identity });
  check('a position from a DIFFERENT file is not trusted: the batch starts at the top and says so', b3.restarted === true && b3.candidates[0].sourceRecordId === 'OL1M');
  const endB = await new D.DumpReader(src).batch(0, { maxCandidates: 5000 });
  check('read to the end: 700 candidates, next is null (finished)', endB.candidates.length === 700 && endB.next === null);
  [rd, rd2, rd3].forEach(x => x.close());
  // Memory: a large file is read a batch at a time, never held.
  const big = join(tmp, 'ol_big.txt.gz'); const filler = '/type/edition\t/books/OL1M\t1\t2024\t{"title":"x"}'; writeFileSync(big, gzipSync(Array.from({ length: 300_000 }, () => filler).join('\n') + '\n'));
  global.gc?.(); const heap0 = process.memoryUsage().heapUsed;
  const bigB = await D.readDumpBatch({ kind: 'file', location: big }, 100_000, { maxLines: 60_000 });
  const grew = (process.memoryUsage().heapUsed - heap0) / 1048576;
  check('300,000 lines: skipped 100,000 without parsing, read 60,000, nothing held (heap grew < 60 MB)', bigB.read === 60_000 && bigB.next === 160_000 && grew < 60, `read ${bigB.read}, heap +${grew.toFixed(1)} MB`);

  section('6. Open Library data dump — the bulk job: separate position, pause, resume, accounting');
  await cleanDb();
  await X.saveDumpSource(db, src, 'test');
  const cpBefore = await db.bookHarvestCheckpoint.findMany({});
  let paused: any = null;
  const first = await B.runBulk('openlibrary-dump', { records: 5_000, onProgress: r => { if (!paused) { paused = { discovered: r.discovered }; B.requestBulkPause('openlibrary-dump'); } } });
  check('pausing is honoured after the batch in hand: the run reports paused, with its position kept', first.paused === true && first.completed === false && !!first.cursor && first.discovered > 0 && first.discovered < 704, `discovered ${first.discovered} cursor ${first.cursor?.slice(0, 40)}`);
  const heldAfterFirst = await db.book.count({ where: { source: 'OpenLibraryDump' } });
  check('what was read before the pause was written (Published, Metadata Only, no licence)', heldAfterFirst > 0 && (await db.book.count({ where: { source: 'OpenLibraryDump', status: 'Published', accessStatus: 'MetadataOnly', licence: null } })) === heldAfterFirst, `${heldAfterFirst} books`);
  const second = await B.runBulk('openlibrary-dump', { records: 5_000 });
  check('starting it again carries on from the saved line and finishes', second.completed === true && second.paused !== true && second.cursor === null, `${second.discovered} read, completed ${second.completed}`);
  const total = await db.book.count({ where: { source: 'OpenLibraryDump' } });
  const classified = await db.book.groupBy({ by: ['domain'], where: { source: 'OpenLibraryDump' }, _count: true });
  check('every strong edition was catalogued exactly once across the two runs (no gaps, no repeats)', total === 700 && new Set((await db.book.findMany({ where: { source: 'OpenLibraryDump' }, select: { isbn: true } })).map(b => b.isbn)).size === 700, `${total} books; ${JSON.stringify(classified.map(c => [c.domain, c._count]))}`);
  check('placed by the LCC code AND the title/subject words: Electronics & Telecommunication Engineering', classified.length === 1 && classified[0].domain === 'Electronics & Telecommunication Engineering');
  const runRows = await db.ingestionRun.findMany({ where: { source: 'Bulk · Open Library' } });
  check('both runs are in the run log and balanced (rejected lines are skipped with a reason, none dropped)', runRows.length === 2 && runRows.every(r => r.accounting === 'OK' && r.checked > 0), JSON.stringify(runRows.map(r => [r.checked, r.added, r.skippedRejected, r.accounting])));
  const cpAfter = await db.bookHarvestCheckpoint.findMany({});
  check('a bulk job never touches a continuous checkpoint', JSON.stringify(cpAfter) === JSON.stringify(cpBefore));
  const third = await B.runBulk('openlibrary-dump', { records: 5_000 });
  check('a dump read to the end starts again from the top next time, and finds everything already held (idempotent)', third.newRecords === 0 && (await db.book.count({ where: { source: 'OpenLibraryDump' } })) === 700, `new ${third.newRecords}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('7. Google Books — enrichment only, bounded, key required, rights untouched');
  // Enrichment reads the oldest held books first, so the dump's books from section 6 (kept their run rows for the matrix) are removed.
  await db.book.deleteMany({ where: { source: { in: SOURCES } } });
  await db.ingestionSourceHealth.deleteMany({ where: { source: 'GoogleBooks' } }); await db.appSetting.deleteMany({ where: { key: 'ingestion.googlebooks.v1' } });
  let gb = await G.enrichFromGoogleBooks(db);
  check('without an API key it does nothing and says so (it does not hammer a shared quota)', gb.ran === false && /API key/i.test(gb.reason || '') && hits('googleapis') === 0);
  process.env.GOOGLE_BOOKS_API_KEY = 'test-key'; process.env.GOOGLE_BOOKS_DAILY_LIMIT = '2';
  const mk = (n: number, extra: any = {}) => db.book.create({ data: { title: `Held Book ${RUN} ${n}`, isbn: isbn(500 + n), status: 'Published', source: 'DOAB', sourceRecordId: `gb-${RUN}-${n}`, fingerprint: `doab:id:gb-${RUN}-${n}`, licence: 'CC BY', accessStatus: 'LinkOnly', rightsStatus: 'Accepted', authors: 'Held Author', ...extra } });
  const b1h = await mk(1), b2h = await mk(2), b3h = await mk(3, { description: 'x', coverUrl: 'https://c/x.png', publisherName: 'P', year: 2000, pages: '10' });
  googleItems[isbn(501)] = { id: 'gbvol1', volumeInfo: { title: 'Held Book', description: '<p>A fine <b>book</b>.</p>', publisher: 'Google Pub', publishedDate: '2012-05-01', pageCount: 321, categories: ['Technology'], authors: ['Someone Else'], imageLinks: { thumbnail: 'http://books.google.com/t.png' }, industryIdentifiers: [{ identifier: isbn(501) }] }, accessInfo: { viewability: 'ALL_PAGES', publicDomain: true } };
  gb = await G.enrichFromGoogleBooks(db, { pauseMs: 0 });
  const e1 = await db.book.findUnique({ where: { id: b1h.id } });
  check('it filled the EMPTY fields (description, publisher, year, pages, cover) and nothing else', gb.ran && e1!.description === 'A fine book.' && e1!.publisherName === 'Google Pub' && e1!.year === 2012 && e1!.pages === '321' && e1!.coverUrl === 'https://books.google.com/t.png', JSON.stringify(gb) + ' | ' + requests.filter(u => u.includes('googleapis')).map(u => decodeURIComponent(u).slice(0, 110)).join(' ;; ') + ' | ' + JSON.stringify({ d: e1!.description, p: e1!.publisherName, y: e1!.year, pg: e1!.pages, c: e1!.coverUrl }));
  check('an existing author was not replaced', e1!.authors === 'Held Author');
  check('rights were not touched, whatever Google\'s own viewer allows', e1!.licence === 'CC BY' && e1!.accessStatus === 'LinkOnly' && e1!.rightsStatus === 'Accepted' && e1!.status === 'Published');
  check('the finding is recorded (volume id, categories) under the book\'s sources', (e1!.metadata as any)?.sources?.googleBooks?.id === 'gbvol1' && (e1!.metadata as any).sources.googleBooks.categories[0] === 'Technology');
  const e2 = await db.book.findUnique({ where: { id: b2h.id } });
  check('a book Google does not know is marked as asked, so it is not asked about again', (e2!.metadata as any)?.sources?.googleBooks?.found === false && gb.notFound === 1);
  check('a book with nothing missing was never asked about', hits(isbn(503)) === 0);
  gb = await G.enrichFromGoogleBooks(db, { pauseMs: 0 });
  check('the daily budget (2) is spent: it stops, and says when it resets', gb.ran === false && /budget/i.test(gb.reason || '') && gb.asked === 0);
  delete process.env.GOOGLE_BOOKS_API_KEY; delete process.env.GOOGLE_BOOKS_DAILY_LIMIT;

  // ═══════════════════════════════════════════════════════════════════════
  section('8. Routing, Quick Import and the provider matrix');
  const bp = new Map(buildProviders().map(p => [p.id, p]));
  check('NLM Catalog is in the continuous rotation', bp.get('nlm')?.configured?.() === true);
  // Since 2026-10-19 the review-only sources rotate by default; the review-backlog limit (BOOKS_REVIEW_BACKLOG_LIMIT) keeps them from flooding the queue.
  check('Crossref Books and Pressbooks are in the continuous rotation by default', bp.get('crossrefbooks')!.rotationOff?.() === null && bp.get('pressbooks')!.rotationOff?.() === null);
  check('…but they are still CONNECTED, so Quick Import and Bulk can use them', bp.get('crossrefbooks')!.configured?.() === true && bp.get('pressbooks')!.configured?.() === true);
  process.env.BOOKS_CROSSREF = '0'; check('BOOKS_CROSSREF=0 takes Crossref Books out of the rotation, and says how', /BOOKS_CROSSREF=0/.test(String(bp.get('crossrefbooks')!.rotationOff?.()))); delete process.env.BOOKS_CROSSREF;
  const cards = await Q.listQuickSources(); const ids = cards.map((c: any) => c.id);
  check('Quick Import offers all three', ['nlm', 'crossrefbooks', 'pressbooks'].every(i => ids.includes(i)));
  check('Quick Import limits are bounded per source (Pressbooks 40 by default, because each book is a licence check)', Q.quickLimit('pressbooks') === 40 && Q.quickLimit('nlm') === 100 && Q.quickLimit('crossrefbooks') === 100);
  const bulk = await B.bulkStatus();
  check('Bulk offers NLM, Crossref Books, Pressbooks and the Open Library dump, each with a position of its own', ['nlm', 'crossrefbooks', 'pressbooks', 'openlibrary-dump'].every(i => bulk.some((s: any) => s.id === i)));
  const m = await providerMatrix('lifetime', db);
  const row = (id: string) => m.rows.find(r => r.id === id)!;
  check('the matrix lists every Book source, with its class, mode and availability', m.rows.length === 10 && ['doab', 'oapen', 'otl', 'ncbi', 'nlm', 'crossrefbooks', 'pressbooks', 'openlibrary', 'openlibrary-dump', 'googlebooks'].every(i => !!row(i)) && row('doab').cls === 'Open / strong rights' && row('nlm').cls === 'Metadata / discovery');
  check('Google Books reads "needs an API key"; Crossref Books is available in the rotation', /API key/.test(row('googlebooks').availability) && !/not in the (continuous )?rotation/.test(row('crossrefbooks').availability), `${row('googlebooks').availability} | ${row('crossrefbooks').availability}`);
  check('the Open Library dump run is attributed to it: checked, added, and skipped reasons all counted', row('openlibrary-dump').checked > 0 && row('openlibrary-dump').added > 0 && row('openlibrary-dump').runs >= 3, JSON.stringify({ c: row('openlibrary-dump').checked, a: row('openlibrary-dump').added, r: row('openlibrary-dump').runs }));
  check('the matrix holds failures as two numbers (consecutive, lifetime) plus failed writes', typeof row('doab').failures.consecutive === 'number' && typeof row('doab').failures.lifetime === 'number' && typeof row('doab').failures.failedWrites === 'number');
  check('no ACCOUNTING_ERROR anywhere in these runs', m.accounting.errors === 0 && m.accounting.runsChecked > 0, JSON.stringify(m.accounting));
  // A resting source is shown as such, with its retry time, and is not asked.
  await db.ingestionSourceHealth.upsert({ where: { source: 'NLMCatalog' }, create: { source: 'NLMCatalog', consecutiveFailures: 3, lifetimeFailures: 5, pausedUntil: new Date(Date.now() + 3600_000), lastError: 'x', lastErrorKind: 'connection_reset' }, update: { consecutiveFailures: 3, lifetimeFailures: 5, pausedUntil: new Date(Date.now() + 3600_000), lastErrorKind: 'connection_reset' } });
  const m2 = await providerMatrix('lifetime', db); const nr = m2.rows.find(r => r.id === 'nlm')!;
  check('a resting provider shows Cooling down, the reason in words, 3 consecutive / 5 lifetime, and its retry time', nr.health === 'cooling' && /Connection reset/.test(nr.availability) && nr.failures.consecutive === 3 && nr.failures.lifetime === 5 && !!nr.nextRetry, `${nr.health} | ${nr.availability}`);
  const reqs = hits('eutils');
  try { await Q.beginQuickImport('nlm', admin); } catch { /* refused while resting */ }
  await sleep(100);
  check('…and NLM is not asked while it rests', hits('eutils') === reqs);
} finally {
  await cleanDb();
  await db.book.deleteMany({ where: { title: { contains: RUN } } });
  rmSync(tmp, { recursive: true, force: true });
  __useFetchForTests(null);
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
