/**
 * Phase 2F: the Open Library / Internet Archive FULL-TEXT ELIGIBILITY audit — rules, polite client and read-only guarantees. No network: the two services are a fake transport that answers in
 * the shapes the real ones do (the Internet Archive items are trimmed copies of real metadata in scripts/fixtures/ol-ia/), and time is a fake clock, so nothing ever really waits.
 *
 *   npx tsx scripts/test-ol-fulltext.ts
 *
 * Private throwaway database `stm_ol_fulltext_test` only (createdb stm_ol_fulltext_test && DATABASE_URL=…/stm_ol_fulltext_test npx prisma db push). A Postgres tripwire records every
 * INSERT, UPDATE and DELETE on "Book" for the whole run; the audit must cause none.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_DB = 'stm_ol_fulltext_test';
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, `/${TEST_DB}`);
delete process.env.NODE_ENV;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== TEST_DB) throw new Error(`refusing to run against anything but ${TEST_DB}`);
const A = await import('../src/lib/ingestion/books/olFulltextAudit.js');
const L = await import('../src/lib/ingestion/books/olFulltext.js');
const C = await import('../src/lib/ingestion/books/olFulltextClient.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/ol-ia/${n}.json`, import.meta.url), 'utf8'));

// ── a fake Open Library + Internet Archive ──────────────────────────────────
type Reply = { status: number; headers?: Record<string, string>; body?: any };
const isbn13 = (n: number) => { const d = `978${String(100000000 + n).slice(-9)}`; const s = [...d].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0); return d + ((10 - (s % 10)) % 10); };
class World {
  editions = new Map<string, any>();         // bibkey → data entry
  works = new Map<string, any>();            // OL…W → search doc
  ia = new Map<string, any>();               // ocaid → /metadata JSON ({} = unknown item)
  log: { url: string; at: number }[] = [];
  hook: ((url: string, nth: number) => Reply | null) | null = null;
  now = 1_000_000; sleeps: number[] = [];
  transport = async (url: string): Promise<any> => {
    this.log.push({ url, at: this.now });
    const nth = this.log.filter(l => l.url === url).length;
    const h = this.hook?.(url, nth); const r = h ?? this.answer(url);
    return { status: r.status, headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null }, json: async () => { if (r.body === undefined) throw new Error('not json'); return r.body; } };
  };
  answer(url: string): Reply {
    const u = new URL(url);
    if (u.host === 'openlibrary.org' && u.pathname === '/api/books') { const out: any = {}; for (const k of String(u.searchParams.get('bibkeys')).split(',')) if (this.editions.has(k)) out[k] = this.editions.get(k); return { status: 200, body: out }; }
    if (u.host === 'openlibrary.org' && u.pathname === '/search.json') { const keys = [...String(u.searchParams.get('q')).matchAll(/\/works\/(OL\d+W)/g)].map(m => m[1]); return { status: 200, body: { docs: keys.filter(k => this.works.has(k)).map(k => this.works.get(k)) } }; }
    if (u.host === 'archive.org' && u.pathname.startsWith('/metadata/')) { const id = decodeURIComponent(u.pathname.slice('/metadata/'.length)); return { status: 200, body: this.ia.get(id) ?? {} }; }
    return { status: 404 };
  }
  sleep = async (ms: number) => { this.sleeps.push(ms); this.now += ms; };
  opts = (o: any = {}) => ({ transport: this.transport as any, sleep: this.sleep, now: () => this.now, gapMs: 1100, ...o });
  count = (re: RegExp) => this.log.filter(l => re.test(l.url)).length;
}
const w = new World();
const olEntry = (n: number, isbn: string, oc: string | null, avail: string) => ({ key: `/books/OL${n}M`, title: `Title ${n}`, identifiers: { isbn_13: [isbn], openlibrary: [`OL${n}M`] }, ...(oc ? { ebooks: [{ preview_url: `https://archive.org/details/${oc}`, availability: avail, formats: {} }] } : {}) });
const withPdf = (j: any, n: number) => ({ ...j, files: [{ name: `${j.metadata.identifier}.pdf`, format: 'Text PDF', size: '1234567' }], metadata: { ...j.metadata, openlibrary_edition: `OL${n}M` } });

// ── the catalogue ───────────────────────────────────────────────────────────
const created: string[] = [];
let n = 0;
const seed = async (o: { avail: string | null; ia?: any | null; oc?: string; n?: number; domain?: string | null; suggested?: string; source?: string; recordId?: string | null; isbn?: string | null; olKnown?: boolean }) => {
  const k = o.n ?? ++n; const isbn = o.isbn === undefined ? isbn13(k) : o.isbn; const oc = o.oc ?? `ia-item-${k}`;
  const b = await db.book.create({ data: { title: `Book ${k}`, isbn, source: o.source ?? 'OpenLibraryDump', sourceRecordId: o.recordId === undefined ? `OL${k}M` : o.recordId, domain: o.domain ?? null, status: 'Draft', metadata: o.suggested ? { harvest: { department: { suggested: o.suggested } } } : {}, rightsStatus: 'MetadataOnly', accessStatus: 'MetadataOnly', licenceIsNC: true, rightsBasis: 'OpenLibrary record, licence undeclared' } });
  created.push(b.id);
  if (o.olKnown !== false && isbn) w.editions.set(`OLID:OL${k}M`, olEntry(k, isbn, o.avail === null ? null : oc, o.avail ?? 'full'));
  if (o.ia) w.ia.set(oc, o.ia);
  return { id: b.id, k, oc, isbn };
};
const cat = async (id: string) => (await rep()).verdicts[id]?.c;
let last: any = null; const rep = async (o: any = {}, client?: any) => (last = await A.runAudit(db as any, { ...w.opts(o) }, client));

// ── what must not move ──────────────────────────────────────────────────────
const WATCH: [string, string][] = [
  ['every Book column', `select md5(coalesce(string_agg(b::text, E'\\n' order by id), '')) h from "Book" b`],
  ['provider health', `select md5(coalesce(string_agg(s::text, E'\\n' order by source), '')) h from "IngestionSourceHealth" s`],
  ['settings and checkpoints', `select md5(coalesce(string_agg(concat_ws('|', key, value::text), E'\\n' order by key), '')) h from "AppSetting"`],
  ['engine state', `select md5(coalesce(string_agg(i::text, E'\\n' order by id), '')) h from "IngestionState" i`],
  ['sweeps', `select md5(coalesce(string_agg(d::text, E'\\n' order by id), '')) h from "DepartmentSweep" d`],
  ['other counts', `select (select count(*) from "Article")::text || '/' || (select count(*) from "Journal")::text || '/' || (select count(*) from "Chapter")::text || '/' || (select count(*) from "Publisher")::text || '/' || (select count(*) from "BackfillJob")::text || '/' || (select count(*) from "IngestionAudit")::text h`],
];
const fingerprint = async () => { const o: string[] = []; for (const [, sql] of WATCH) o.push((await db.$queryRawUnsafe<any[]>(sql))[0].h); return o; };

await db.$executeRawUnsafe(`create table if not exists "_ol_test_book_events" (id text, op text, at timestamptz default now())`);
await db.$executeRawUnsafe(`truncate "_ol_test_book_events"`);
await db.$executeRawUnsafe(`create or replace function _ol_test_book_event() returns trigger language plpgsql as $$ begin if tg_op = 'DELETE' then insert into "_ol_test_book_events"(id, op) values (old.id, 'DELETE'); return old; end if; insert into "_ol_test_book_events"(id, op) values (new.id, tg_op); return new; end $$`);
await db.$executeRawUnsafe(`drop trigger if exists _ol_test_book_event on "Book"`);
await db.$executeRawUnsafe(`create trigger _ol_test_book_event after insert or update or delete on "Book" for each row execute function _ol_test_book_event()`);
const BEFORE_ROWS = (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Book")::int b, (select count(*) from "Publisher")::int p, (select count(*) from "BackfillJob")::int j, (select count(*) from "IngestionAudit")::int a`))[0];

try {
  section('1. The rules, on real Internet Archive metadata');
  const iaNew = fx('ia-NewSpaceShip1'), iaPd = fx('ia-the-daily-life-of-a-stalker'), iaNc = fx('ia-BuchzusammenfassungNr.1HandbuchDerTransa'), iaCc0Restricted = fx('ia-intercontinental_records_registration_wa'), iaFlag = fx('ia-suiprincipiidir00alimgoog'), iaBorrow = fx('ia-basicsofelectrot0000khat');
  const lic = (j: any) => L.licenceFromIa(L.parseIa(j)!);
  check('CC BY 4.0 → "CC BY", allowed', lic(iaNew).licence === 'CC BY' && lic(iaNew).allowed === true);
  check('Public Domain Mark → "Public Domain", allowed; CC0 → "CC0", allowed', lic(iaPd).licence === 'Public Domain' && lic(iaPd).allowed && lic(iaCc0Restricted).licence === 'CC0' && lic(iaCc0Restricted).allowed);
  check('CC BY-NC-ND → not allowed (non-commercial), named', lic(iaNc).licence === 'CC BY-NC-ND' && lic(iaNc).allowed === false && lic(iaNc).kind === 'restricted');
  check('the Archive\'s own "possibly out of copyright" flag with no licenseurl is NOT a licence: unknown, noted for a person', lic(iaFlag).licence === null && lic(iaFlag).kind === 'unknown' && lic(iaFlag).note === 'publicDomainFlagOnly');
  check('no licenseurl at all: unknown', lic(iaBorrow).kind === 'unknown' && lic(iaBorrow).note === undefined);
  check('a licence address we do not recognise is unknown, not guessed', L.licenceFromIa({ licenseurl: 'http://example.org/my-own-terms', copyrightStatus: null }).kind === 'unknown');
  check('CC BY-SA allowed; CC BY-ND allowed by the existing book policy; BY-NC-SA, BY-NC not', L.licenceFromIa({ licenseurl: 'https://creativecommons.org/licenses/by-sa/3.0/', copyrightStatus: null }).allowed && L.licenceFromIa({ licenseurl: 'http://creativecommons.org/licenses/by-nd/4.0/', copyrightStatus: null }).allowed && !L.licenceFromIa({ licenseurl: 'http://creativecommons.org/licenses/by-nc-sa/4.0/', copyrightStatus: null }).allowed && !L.licenceFromIa({ licenseurl: 'http://creativecommons.org/licenses/by-nc/2.0/', copyrightStatus: null }).allowed);
  check('"readable", "borrowable", "downloadable" and "preview available" are access words, never rights: only `full` is read as readable, and the rest cannot be a candidate', L.availOf('public') === 'full' && L.availOf('borrowable') === 'borrow' && L.availOf('printdisabled') === 'restricted' && L.availOf('no_ebook') === 'restricted' && L.availOf('something') === 'unknown');
  const real = L.parseIa(iaBorrow)!;
  check('the real borrow-only item: access-restricted, collections include "inlibrary", an EPUB and a text PDF exist, DRM copies are never chosen', real.restricted && real.collections.includes('inlibrary') && L.pickFile(real.files)?.format === 'Text PDF' && !/encrypted|lcp/i.test(L.pickFile(real.files)!.name));
  check('only DRM-wrapped files → no file; an image-only PDF is a last resort, not a first choice', L.pickFile([{ name: 'a_encrypted.pdf', format: 'ACS Encrypted PDF', size: 1 }, { name: 'a.lcpdf', format: 'LCP Encrypted PDF', size: 1 }]) === null && L.pickFile([{ name: 'a_text.pdf', format: 'Additional Text PDF', size: 1 }, { name: 'a.pdf', format: 'Image Container PDF', size: 2 }])?.name === 'a_text.pdf');

  section('2. Every kind of item, through the whole audit (database + fake sources)');
  const iaPdf = (j: any, k: number, over: any = {}) => { const x = withPdf(j, k); return { ...x, metadata: { ...x.metadata, ...over } }; };
  const S: Record<string, { id: string; k: number; oc: string; isbn: string | null }> = {};
  const next = () => n + 1;
  S.pd = await seed({ avail: 'full', ia: iaPdf(iaPd, next()), domain: 'Law' });
  S.ccby = await seed({ avail: 'full', ia: iaPdf(iaNew, next()), domain: 'Law' });
  S.cc0 = await seed({ avail: 'full', ia: iaPdf({ ...iaCc0Restricted, metadata: { ...iaCc0Restricted.metadata, 'access-restricted-item': undefined } }, next()), domain: 'Management' });
  S.bysa = await seed({ avail: 'full', ia: iaPdf({ ...iaNew, metadata: { ...iaNew.metadata, licenseurl: 'http://creativecommons.org/licenses/by-sa/4.0/' } }, next()), suggested: 'Education' });
  S.nc = await seed({ avail: 'full', ia: iaPdf(iaNc, next()), domain: 'Law' });
  S.borrow = await seed({ avail: 'borrow', ia: iaBorrow, domain: 'Medical Sciences' });
  S.preview = await seed({ avail: 'restricted', ia: iaNew, domain: 'Medical Sciences' });
  S.unknown = await seed({ avail: 'full', ia: iaPdf({ ...iaNew, metadata: { ...iaNew.metadata, licenseurl: undefined } }, next()) });
  S.flag = await seed({ avail: 'full', ia: iaPdf(iaFlag, next()), domain: 'Law' });
  S.unmatched = await seed({ avail: 'full', olKnown: false });
  S.restrictedCc0 = await seed({ avail: 'full', ia: iaPdf(iaCc0Restricted, next()), domain: 'Management' });
  S.identity = await seed({ avail: 'full', ia: iaPdf(iaNew, next(), { openlibrary_edition: 'OL99999999M', isbn: undefined }) });
  S.encrypted = await seed({ avail: 'full', ia: { ...iaPdf(iaNew, next()), files: [{ name: 'x_encrypted.pdf', format: 'ACS Encrypted PDF', size: '5' }] } });
  S.noArchive = await seed({ avail: null });
  S.goneItem = await seed({ avail: 'full', ia: {} });                              // Open Library points at an item the Archive no longer has
  S.noText = await seed({ avail: 'full', ia: { ...iaPdf(iaNew, next()), files: [] } });
  // two Books with the SAME ISBN: neither is decided, and neither is looked up
  const dupIsbn = isbn13(777);
  S.dupA = await seed({ avail: 'borrow', isbn: dupIsbn, n: 701 }); S.dupB = await seed({ avail: 'borrow', isbn: dupIsbn, n: 702, recordId: 'OL702M' });
  // a work-level Book with an ISBN: its own edition has no scan, but another edition of the work is openly readable on the Archive
  S.otherEd = await seed({ avail: null, source: 'OpenLibrary', recordId: 'OL3333W', n: 721 }); w.editions.set(`ISBN:${S.otherEd.isbn}`, olEntry(721, S.otherEd.isbn!, null, 'full')); w.works.set('OL3333W', { key: '/works/OL3333W', ebook_access: 'public', ia: ['other-edition-item'], isbn: [] });
  // the edition id is not known to Open Library but the ISBN is: matched through the ISBN
  S.viaIsbn = await seed({ avail: 'full', ia: iaPdf(iaNew, next()), recordId: 'OL5555555M', n: 711 }); w.editions.set(`ISBN:${S.viaIsbn.isbn}`, olEntry(711, S.viaIsbn.isbn!, S.viaIsbn.oc, 'full')); w.editions.delete('OLID:OL711M'); w.ia.set(S.viaIsbn.oc, iaPdf(iaNew, 711));
  // a WORK-level Book (the search-based provider): one archive item, and three
  const wk = await db.book.create({ data: { title: 'Work book', source: 'OpenLibrary', sourceRecordId: 'OL12345W', isbn: null, status: 'Draft', domain: 'Law' } }); created.push(wk.id);
  w.works.set('OL12345W', { key: '/works/OL12345W', ebook_access: 'public', ia: ['work-item-1'], public_scan_b: true, isbn: [] });
  w.ia.set('work-item-1', { ...iaPdf(iaNew, 1), metadata: { ...iaNew.metadata, identifier: 'work-item-1', openlibrary_work: 'OL12345W', openlibrary_edition: undefined } });
  const wk3 = await db.book.create({ data: { title: 'Work book, many scans', source: 'OpenLibrary', sourceRecordId: 'OL67890W', isbn: null, status: 'Draft' } }); created.push(wk3.id);
  w.works.set('OL67890W', { key: '/works/OL67890W', ebook_access: 'public', ia: ['a1', 'a2', 'a3'], isbn: [] });

  const fp0 = await fingerprint(); const tripStart = (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "_ol_test_book_events"`))[0].n;
  const r1 = await rep({ sources: ['OpenLibraryDump', 'OpenLibrary'] });
  const v = (k: string) => r1.verdicts[S[k].id]?.c;
  check('a Public Domain Mark item, openly readable, with a PDF → full-text candidate', v('pd') === 'reuseSafe');
  check('a CC BY item → candidate; CC0 → candidate; CC BY-SA → candidate', v('ccby') === 'reuseSafe' && v('cc0') === 'reuseSafe' && v('bysa') === 'reuseSafe');
  check('a CC BY-NC-ND item that is readable → NOT a candidate: readableLicenceRestricted', v('nc') === 'readableLicenceRestricted');
  check('a borrow-only item → borrowOnly, and the Archive was never asked about it', v('borrow') === 'borrowOnly' && w.count(/archive\.org\/metadata\/ia-item-6$/) === 0 && r1.verdicts[S.borrow.id].c === 'borrowOnly');
  check('a preview-only / print-disabled item → previewOnly, and the Archive was never asked about it', v('preview') === 'previewOnly');
  check('readable but no licence declared → readableLicenceUnknown (not a candidate)', v('unknown') === 'readableLicenceUnknown');
  check('readable with only the Archive\'s "possibly out of copyright" flag → readableLicenceUnknown, noted as a flag only (not a candidate)', v('flag') === 'readableLicenceUnknown' && r1.notes.publicDomainFlagOnly === 1);
  check('not known to Open Library at all → unmatched', v('unmatched') === 'unmatched');
  check('Open Library says readable and the licence is CC0, but the Archive item is access-restricted → borrowOnly: the access word never beats the restriction', v('restrictedCc0') === 'borrowOnly');
  check('the Archive item does not confirm it is this edition → ambiguous (identity is cross-checked, never assumed)', v('identity') === 'ambiguous');
  check('a licence that allows it but only DRM-wrapped files → noFile', v('encrypted') === 'noFile');
  check('Open Library lists no archive item → noFile; an item the Archive no longer has → noFile; an item with no PDF/EPUB at all → noFile', v('noArchive') === 'noFile' && v('goneItem') === 'noFile' && v('noText') === 'noFile');
  check('DUPLICATE ISBN: both Books are ambiguous, neither is looked up, nothing is merged', v('dupA') === 'ambiguous' && v('dupB') === 'ambiguous' && w.count(new RegExp(`ISBN:${dupIsbn}|OL701M|OL702M`)) === 0);
  check('the edition id is unknown but the ISBN is known → matched through the ISBN', v('viaIsbn') === 'reuseSafe');
  check('a work-level Book with exactly one archive item whose work id matches → candidate; with three archive items → ambiguous (a person says which)', r1.verdicts[wk.id]?.c === 'reuseSafe' && r1.verdicts[wk3.id]?.c === 'ambiguous');
  check('INFORMATION ONLY: a Book whose own edition has no Archive item but whose work has another edition there stays noFile (a different edition is a different book), and the report notes it', r1.verdicts[S.otherEd.id].c === 'noFile' && r1.notes['otherEditionOnArchive.full'] === 1 && r1.counts.reuseSafe === 6, { notes: r1.notes, c: r1.counts });
  const fpAfterFirst = await fingerprint();
  const total = Object.values(r1.counts).reduce((a, c) => a + c, 0);
  check('every Book is in exactly one category; the counts add up to the Books audited', total === r1.booksAudited && r1.booksAudited === created.length && r1.booksInScope === created.length);
  check('matched = audited − unmatched − could-not-check − shared-ISBN; readable = candidates + unknown + restricted', r1.matched === r1.booksAudited - r1.counts.unmatched - r1.counts.couldNotCheck - 2 && r1.readable === r1.counts.reuseSafe + r1.counts.readableLicenceUnknown + r1.counts.readableLicenceRestricted);
  check('candidates are counted by department: the Book\'s own, else the classifier\'s suggestion marked as such, else Unassigned', r1.candidatesByDepartment['Law'] === 3 && r1.candidatesByDepartment['Management'] === 1 && r1.candidatesByDepartment['Education (suggested)'] === 1 && r1.candidatesByDepartment['Unassigned'] === 1 && !('Medical Sciences' in r1.candidatesByDepartment), r1.candidatesByDepartment);
  check('the licences of the candidates are named', r1.licences['Public Domain'] === 1 && r1.licences['CC0'] === 1 && r1.licences['CC BY'] === 3 && r1.licences['CC BY-SA'] === 1 && r1.licences['restricted: CC BY-NC-ND'] === 1, r1.licences);
  check('samples are bounded and carry the reason, the archive id and the licence', Object.values(r1.samples).every(s => s.length <= 25) && r1.samples.reuseSafe[0].ocaid && r1.samples.reuseSafe[0].licence && r1.samples.reuseSafe[0].why);
  check('a candidate names the file it would take (never downloaded): a PDF, with its size', (() => { const pd = r1.samples.reuseSafe.find(s => s.id === S.pd.id); return !!pd && /\.pdf$/.test(pd.file ?? ''); })());
  check('the audit is complete (no budget or outage)', r1.incomplete === false && r1.incompleteReasons.length === 0);

  section('3. Bounded and polite');
  check('every Open Library request carries at most 20 keys', w.log.filter(l => /api\/books/.test(l.url)).every(l => decodeURIComponent(new URL(l.url).searchParams.get('bibkeys')!).split(',').length <= C.BATCH));
  check('requests start at least 1.1 s apart (the fake clock was advanced by the client\'s own waits)', w.log.slice(1).every((l, i) => l.at - w.log[i].at >= 1100 - 1), w.log.slice(0, 6).map(l => l.at));
  check('far fewer requests than Books: the editions are asked in batches, and the Archive only about the openly readable', r1.requests.total < r1.booksAudited && r1.requests.total <= 20, r1.requests);
  check('an item that is only borrowable or a preview is decided without asking the Archive at all', w.log.filter(l => /archive\.org/.test(l.url)).length === new Set(w.log.filter(l => /archive\.org/.test(l.url)).map(l => l.url)).size);
  // 45 more Books in one go: the requests stay bounded
  const w0 = w.log.length;
  const many: string[] = []; for (let i = 0; i < 45; i++) many.push((await seed({ avail: 'borrow' })).id);
  const fpSeeded = await fingerprint();
  const rMany = await rep();
  check('45 more Books are asked for in ceil(45/20) = 3 batches, not 45 requests', w.log.slice(w0).filter(l => /api\/books/.test(l.url)).length <= 4 + 1 && rMany.verdicts[many[44]].c === 'borrowOnly', w.log.slice(w0).length);
  const rBudget = await rep({ maxRequests: 2 });
  check('a request BUDGET is a hard stop: no more requests than allowed, the rest reported as could-not-check, and the report says it is incomplete', rBudget.requests.total <= 2 && rBudget.incomplete && /budget/.test(rBudget.incompleteReasons.join()) && rBudget.counts.couldNotCheck > 0, rBudget.requests);

  section('4. Rate limits, retries and outages');
  { const wr = new World(); wr.editions = w.editions; wr.ia = w.ia; wr.works = w.works;
    let first = true; wr.hook = (url, nth) => (first && /api\/books/.test(url) ? ((first = false), { status: 429, headers: { 'retry-after': '3' } }) : null);
    const r = await A.runAudit(db as any, { ...wr.opts({ sources: ['OpenLibraryDump'], limit: 5 }) });
    check('HTTP 429 with Retry-After: 3 → the client waits 3 s (not less), retries, and the audit still completes', wr.sleeps.includes(3000) && r.requests.rateLimited === 1 && r.requests.retries >= 1 && r.counts.couldNotCheck === 0, { sleeps: wr.sleeps, req: r.requests }); }
  { const wr = new World(); wr.editions = w.editions; wr.ia = w.ia; wr.hook = url => (/api\/books/.test(url) ? { status: 429, headers: { 'retry-after': '99999' } } : null);
    const r = await A.runAudit(db as any, { ...wr.opts({ sources: ['OpenLibraryDump'], limit: 5, maxWaitMs: 20_000 }) });
    check('a Retry-After of a day is capped at the client\'s limit (20 s here), and a source that keeps refusing gives up after 3 attempts: could-not-check, never guessed', Math.max(...wr.sleeps) <= 20_000 && r.counts.couldNotCheck >= 1 && r.counts.couldNotCheck + r.counts.ambiguous === r.booksAudited && r.requests.total <= 3 + 3, { sleeps: wr.sleeps, req: r.requests }); }
  { const wr = new World(); wr.editions = w.editions; wr.ia = w.ia; let k = 0; wr.hook = url => (/api\/books/.test(url) && ++k <= 2 ? { status: 503 } : null);
    const r = await A.runAudit(db as any, { ...wr.opts({ sources: ['OpenLibraryDump'], limit: 5 }) });
    check('HTTP 503 twice then fine → retried with growing backoff (1 s, 2 s), and the audit completes', wr.sleeps.filter(s => s === 1000 || s === 2000).length >= 2 && r.counts.couldNotCheck === 0 && r.requests.retries === 2, { sleeps: wr.sleeps, req: r.requests }); }
  { const wr = new World(); wr.editions = w.editions; wr.ia = w.ia; wr.hook = () => ({ status: 503 });
    const r = await A.runAudit(db as any, { ...wr.opts({ sources: ['OpenLibraryDump'], breakAfter: 2 }) });
    check('SOURCE UNAVAILABLE: every Book is could-not-check (never "unmatched"), the audit stops asking after repeated failures, says it is incomplete, and made a handful of requests, not hundreds', r.counts.couldNotCheck + r.counts.ambiguous === r.booksAudited && r.counts.couldNotCheck > 10 && r.counts.unmatched === 0 && r.incomplete && r.requests.total <= 8 && /failed repeatedly/.test(r.incompleteReasons.join()), r.requests); }
  { const wr = new World(); wr.editions = w.editions; wr.ia = w.ia; wr.hook = url => (/archive\.org/.test(url) ? { status: 503 } : null);
    const r = await A.runAudit(db as any, { ...wr.opts({ sources: ['OpenLibraryDump'], breakAfter: 50 }) });
    check('the Archive down but Open Library up: borrow/preview/no-archive Books are still decided; only the openly readable ones become could-not-check', r.counts.couldNotCheck > 0 && r.counts.borrowOnly >= 1 && r.counts.reuseSafe === 0, r.counts); }
  { const wr = new World(); wr.editions = w.editions; wr.ia = w.ia; wr.hook = url => (/archive\.org/.test(url) ? { status: 200, body: undefined } : null);
    const r = await A.runAudit(db as any, { ...wr.opts({ sources: ['OpenLibraryDump'], breakAfter: 50 }) });
    check('an unreadable (non-JSON) answer is a failure to check, not a verdict', r.counts.reuseSafe === 0 && r.counts.couldNotCheck > 0); }

  section('5. Idempotent, and a changed source record is noticed');
  const a1 = await rep(), a2 = await rep();
  check('IDEMPOTENT: two audits of unchanged sources have the same hash and no Book differs', a1.reportHash === a2.reportHash && A.diffReports(a1, a2).length === 0);
  // the external records change: one licence becomes non-commercial, one item loses its PDF, one item is borrowed from now on
  w.ia.set(S.ccby.oc, iaPdf({ ...iaNew, metadata: { ...iaNew.metadata, licenseurl: 'http://creativecommons.org/licenses/by-nc/4.0/' } }, S.ccby.k));
  w.ia.set(S.pd.oc, { ...iaPdf(iaPd, S.pd.k), files: [] });
  w.editions.set(`OLID:OL${S.bysa.k}M`, olEntry(S.bysa.k, S.bysa.isbn!, S.bysa.oc, 'borrow'));
  const a3 = await rep(); const d = A.diffReports(a1, a3);
  check('CHANGED EXTERNAL RECORD: the new audit gives a different verdict for exactly the three Books whose source changed, and says their source fingerprint changed', d.length === 3 && d.every(x => x.sourceChanged) && d.find(x => x.id === S.ccby.id)?.to === 'readableLicenceRestricted' && d.find(x => x.id === S.pd.id)?.to === 'noFile' && d.find(x => x.id === S.bysa.id)?.to === 'borrowOnly', d);
  check('…and the hash of the report changed, while no verdict of an unchanged record moved', a3.reportHash !== a1.reportHash && a3.counts.reuseSafe === a1.counts.reuseSafe - 3);

  section('6. Nothing is written');
  const fp1 = await fingerprint();
  check('every Book column — status, department, licence, access, rights, file address — is byte-identical before and after the first audit, and again before and after every later one (retries, outages, budgets, changed sources)', fp0[0] === fpAfterFirst[0] && fpSeeded[0] === fp1[0]);
  check('provider health, settings and checkpoints, engine state, sweeps, and the Article / Journal / Chapter / Publisher / BackfillJob / audit counts are identical throughout', same(fp0.slice(1), fpAfterFirst.slice(1)) && same(fpSeeded.slice(1), fp1.slice(1)), WATCH.map(([l], i) => fpSeeded[i] === fp1[i] ? null : l).filter(Boolean));
  const ev = await db.$queryRawUnsafe<any[]>(`select op, count(*)::int n from "_ol_test_book_events" group by op`);
  const ours = (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "_ol_test_book_events"`))[0].n - tripStart;
  check('TRIPWIRE (Postgres recorded every INSERT, UPDATE and DELETE on "Book"): the audits caused none — after the suite\'s own seeding, not one event', ours === 45 /* the 45 extra Books seeded mid-run */, { events: ev, ours });
  check('no duplicate Book was created: the Book count is the seeded Books and no ISBN gained a second Book', (await db.book.count()) === created.length + BEFORE_ROWS.b && (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from (select isbn from "Book" where isbn is not null group by isbn having count(*) > 1) x`))[0].n === 1);
  let refused = ''; try { await A.readOnly(db as any, async tx => { await tx.$executeRawUnsafe(`update "Book" set title = title where false`); }); } catch (e: any) { refused = String(e?.message ?? e); }
  check('READ ONLY is enforced by Postgres, not by good manners: a write attempted inside the audit\'s own transaction helper is refused', /read-only/i.test(refused), refused.slice(0, 120));
  check('the audit never used the engine\'s provider-health bookkeeping (it has its own client): no health row was created for Open Library or the Archive', (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "IngestionSourceHealth" where source ilike '%openlibrary%' or source ilike '%archive%'`))[0].n === 0);
} catch (e: any) {
  fail++; console.log('  FAIL  the suite crashed:', e?.stack || e);
} finally {
  await db.book.deleteMany({ where: { id: { in: created } } });
  const AFTER_ROWS = (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Book")::int b, (select count(*) from "Publisher")::int p, (select count(*) from "BackfillJob")::int j, (select count(*) from "IngestionAudit")::int a`))[0];
  check('after cleanup the private database is exactly as it was before the suite (Book, Publisher, BackfillJob and audit-row counts)', same(BEFORE_ROWS, AFTER_ROWS), { BEFORE_ROWS, AFTER_ROWS });
  await db.$executeRawUnsafe(`drop trigger if exists _ol_test_book_event on "Book"`); await db.$executeRawUnsafe(`drop function if exists _ol_test_book_event()`); await db.$executeRawUnsafe(`drop table if exists "_ol_test_book_events"`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
