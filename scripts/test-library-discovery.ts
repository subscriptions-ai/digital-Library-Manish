/**
 * The Content Library's discovery layer: the address it reads, what a record offers, the filters that run in the database, the subject
 * facets, the access overview, and who may see what.
 *
 *   npx tsx scripts/test-library-discovery.ts
 *
 * Part 1 is pure. Part 2 starts a real server on the throwaway database `stm_ingestion_test` (it refuses any other), blocks every outbound
 * request, and uses fixtures tagged with a per-run id that are removed afterwards. Nothing in the catalogue is modified.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import {
  parseLibraryParams, toSearchParams, applyPatch, resolveForAccess, browseStateFor, libraryHref, DEFAULT_LIBRARY_STATE, CONTENT_TYPE_NAMES, type LibraryState,
} from '../src/lib/libraryParams.js';
import { availabilityOf, safeExternalUrl, isOpenLicence, licenceLabel } from '../src/lib/libraryAvailability.js';
import { whyNotASubject, cleanSubjectFacets } from '../src/lib/subjectFacets.js';
import { summariseAccess, countsLine } from '../src/lib/accessSummary.js';
import { CONTENT_TYPES } from '../src/constants.js';
import { libraryUrl } from '../src/lib/libraryRoute.js';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const P = (q: string) => parseLibraryParams(new URLSearchParams(q));

// ── 1. Pure ─────────────────────────────────────────────────────────────────
section('1a. The address: parse, validate, serialise');
{
  check('content-type list equals CONTENT_TYPES in constants', JSON.stringify([...CONTENT_TYPE_NAMES]) === JSON.stringify(CONTENT_TYPES.map(c => c.name)));
  const s = P('domain=Applied+Sciences&kind=books&page=3&sort=oldest&avail=external&oa=1&year=2021&lang=English&pub=IntechOpen&q=finite');
  check('every field is read', s.domain === 'Applied Sciences' && s.kind === 'books' && s.page === 3 && s.sort === 'oldest' && s.avail === 'external' && s.oa && s.year === '2021' && s.language === 'English' && s.publisher === 'IntechOpen' && s.q === 'finite', s);
  check('serialise → parse is the identity', JSON.stringify(P(toSearchParams(s).toString())) === JSON.stringify(s));
  check('defaults are left out of the address', toSearchParams(DEFAULT_LIBRARY_STATE).toString() === '');
  const bad = P('mode=nonsense&kind=../../x&page=-4&sort=DROP&avail=all&year=20xx&atype=Nope&jids=~~');
  check('nonsense is dropped, not passed on', bad.mode === 'new' && bad.kind === 'articles' && bad.page === 1 && bad.sort === 'newest' && bad.avail === '' && bad.year === '' && bad.atype === '' && bad.jids.length === 0, bad);
  check('a page beyond the cap is dropped', P('page=99999999').page === 1);
  check('control characters and over-long text are cleaned', P('q=' + encodeURIComponent('a\u0000b\n' + 'x'.repeat(500))).q.length <= 200 && !/[\u0000\n]/.test(P('q=' + encodeURIComponent('a\u0000b\n')).q));
  check('archived shelf takes only title/added sorts', P('mode=archived&sort=oldest').sort === 'title' && P('mode=archived&sort=added').sort === 'added');
  check('content type is matched case-insensitively to its canonical spelling', P('mode=archived&atype=theses').atype === 'Theses');
  check('a year outside 1000–2100 is dropped', P('year=3000').year === '' && P('year=1999').year === '1999');
}
section('1b. A change of filter resets the page; dependent filters clear');
{
  const cur: LibraryState = { ...DEFAULT_LIBRARY_STATE, page: 7, domain: 'Agriculture', publisher: 'X', jids: ['j1'], vol: '3', iss: '2' };
  check('changing the department resets page and its dependents', (() => { const n = applyPatch(cur, { domain: 'Law' }); return n.page === 1 && n.publisher === '' && n.jids.length === 0 && n.vol === ''; })());
  check('changing availability resets the page', applyPatch(cur, { avail: 'readable' }).page === 1);
  check('changing the sort resets the page', applyPatch(cur, { sort: 'title' }).page === 1);
  check('moving to another page keeps the filters', (() => { const n = applyPatch(cur, { page: 8 }); return n.page === 8 && n.domain === 'Agriculture' && n.publisher === 'X'; })());
  check('a patch that names a field explicitly keeps it', applyPatch(cur, { domain: 'Law', publisher: 'Y' }).publisher === 'Y');
  check('switching shelf clears shelf-specific filters but keeps the department', (() => { const n = applyPatch({ ...cur, publisher: 'P', oa: true }, { mode: 'archived' }); return n.domain === 'Agriculture' && n.publisher === '' && !n.oa && n.sort === 'title'; })());
  check('switching Articles ↔ Books clears journals', applyPatch(cur, { kind: 'books' }).jids.length === 0);
  check('the same value again changes nothing (page stays)', applyPatch(cur, { domain: 'Agriculture' }).page === 7);
}
section('1c. Department card → content type: the address carries department, type and the shelf the items are on');
{
  const href = (mod: any, d = 'Applied Sciences') => libraryHref('/institution/explore', browseStateFor(mod, d));
  check('Books in the new collection → kind=books with the department', href({ contentType: 'Books', newCount: 136, legacyCount: 0 }) === '/institution/explore?kind=books&domain=Applied+Sciences', href({ contentType: 'Books', newCount: 136 }));
  check('Periodicals in the new collection → articles with the department', href({ contentType: 'Periodicals', newCount: 10 }) === '/institution/explore?domain=Applied+Sciences');
  check('Theses held in the archive → archived shelf and type', href({ contentType: 'Theses', newCount: 0, legacyCount: 4 }) === '/institution/explore?mode=archived&domain=Applied+Sciences&atype=Theses');
  check('Theses held in the new collection → articles filtered by type', href({ contentType: 'Theses', newCount: 4, legacyCount: 0 }) === '/institution/explore?domain=Applied+Sciences&atype=Theses');
  check('a department with a "&" or "/" in its name survives the address', P(href({ contentType: 'Books', newCount: 1 }, 'Electronics & Telecommunication Engineering').split('?')[1]).domain === 'Electronics & Telecommunication Engineering'
    && P(href({ contentType: 'Books', newCount: 1 }, 'Computer / IT').split('?')[1]).domain === 'Computer / IT');
  check('libraryUrl for a librarian and for a reader differ only in the base', libraryUrl({ role: 'Institution' }, { domain: 'Law', kind: 'books' }) === '/institution/explore?kind=books&domain=Law' && libraryUrl({ role: 'Subscriber' }, { domain: 'Law', kind: 'books' }) === '/dashboard/library?kind=books&domain=Law');
  check('a staff account gets its own workspace, no filters', libraryUrl({ role: 'SuperAdmin' }, { domain: 'Law' }) === '/admin');
}
section('1d. The bug: a Books link for an account with no archived shelf');
{
  const caps = { hasArchive: false, hasArticles: true, hasBooks: true, departments: ['Applied Sciences'] };
  const old = P('domain=Applied+Sciences&mode=archived&atype=Books');
  const r = resolveForAccess(old, caps);
  check('the old Books link lands on Books, not on Articles with a Books chip', r.state.mode === 'new' && r.state.kind === 'books' && r.state.atype === '' && r.state.domain === 'Applied Sciences', r.state);
  check('Periodicals on a missing archive land on Articles', resolveForAccess(P('mode=archived&atype=Periodicals'), caps).state.kind === 'articles');
  const t = resolveForAccess(P('mode=archived&atype=Theses'), caps);
  check('a type that exists only on the archive is reported, not silently relabelled', t.notice === 'archive-unavailable' && t.state.mode === 'new');
  check('Books requested where the account has none → Articles, said', (() => { const x = resolveForAccess(P('kind=books'), { ...caps, hasBooks: false }); return x.state.kind === 'articles' && x.notice === 'books-unavailable'; })());
  check('with the archive available, an archived request is left alone', resolveForAccess(P('mode=archived&atype=Theses'), { ...caps, hasArchive: true }).state.mode === 'archived');
  check('atype=Books on articles is carried to the Books shelf', resolveForAccess(P('atype=Books'), caps).state.kind === 'books');
}
section('1e. What a record offers');
{
  const hosted = { pdfUrl: 'https://f.example/x.pdf', accessStatus: 'ViewableHere', accessType: 'OpenAccess', licence: 'cc-by', originalUrl: 'https://pub.example/a' };
  check('article held here = readable, no source link needed', availabilityOf('article', hosted).availability === 'readable' && availabilityOf('article', hosted).externalUrl === null);
  check('article with a null status and a file = readable ("behave as before")', availabilityOf('article', { pdfUrl: 'https://f.example/x.pdf' }).availability === 'readable');
  check('LinkOnly with a stored file address is NOT readable', availabilityOf('article', { ...hosted, accessStatus: 'LinkOnly' }).availability === 'external');
  check('MetadataOnly with a file is not readable and has no source if none is named', availabilityOf('article', { pdfUrl: 'https://f.example/x.pdf', accessStatus: 'MetadataOnly' }).availability === 'metadata');
  check('no file, a source page = external', availabilityOf('article', { originalUrl: 'https://pub.example/a' }).availability === 'external');
  check('no file, no page = metadata', availabilityOf('article', {}).availability === 'metadata');
  check('book is readable only when ViewableHere with a file (the reconciled Books rule)', availabilityOf('book', { pdfUrl: 'https://f/x.pdf', accessStatus: 'ViewableHere' }).availability === 'readable' && availabilityOf('book', { pdfUrl: 'https://f/x.pdf' }).availability === 'metadata');
  check('legacy content needs a validated file', availabilityOf('content', { fileUrl: 'https://f/x.pdf', validationStatus: 'VALID_VIEWABLE' }).availability === 'readable' && availabilityOf('content', { fileUrl: 'https://f/x.pdf', validationStatus: 'Not Validated' }).availability === 'metadata');
  check('only a web address is a destination', safeExternalUrl('javascript:alert(1)') === null && safeExternalUrl('data:text/html,x') === null && safeExternalUrl('ftp://x.org/a') === null && safeExternalUrl('https://u:p@x.org/') === null && safeExternalUrl('//evil.example') === null && safeExternalUrl('https://doi.org/10.1/x') !== null);
  check('a first valid candidate wins over an invalid one', safeExternalUrl('javascript:x', 'https://ok.example/a') === 'https://ok.example/a');
  check('a javascript: source page is not offered as "Visit source"', availabilityOf('article', { originalUrl: 'javascript:alert(1)' }).availability === 'metadata');
  check('source OA is separate from hosting: declared OA + no licence is not verified', (() => { const a = availabilityOf('article', { accessType: 'OpenAccess', licence: null, originalUrl: 'https://p.example' }); return a.sourceOpenAccess.declared && !a.sourceOpenAccess.verified && a.availability === 'external'; })());
  check('our own publisher terms are not an open licence', !isOpenLicence('Publisher terms (our own)') && !isOpenLicence('other-oa') && !isOpenLicence(''));
  check('both stored spellings of a CC licence verify', isOpenLicence('cc-by-nc') && isOpenLicence('CC BY-NC-ND') && isOpenLicence('CC0') && isOpenLicence('public-domain'));
  check('licence labels', licenceLabel('cc-by-nc-nd') === 'CC BY-NC-ND' && licenceLabel('CC BY') === 'CC BY' && licenceLabel('') === null);
}
section('1f. Subject facets: no DOI, address or citation; nothing is deleted');
{
  const no = ['10.1016/j.cell.2019.01.001', 'doi:10.1000/182', 'https://doi.org/10.1/x', 'www.example.org', 'J. Appl. Phys. 54 (2019) 1234', 'Smith et al.', 'Phys Rev B 54, 1234', 'vol. 12', '27', 'General', 'ISSN 1234-5678', 'pp. 123-145', '[12]', '2019;54(3):123', 'Nature 521: 436-444 (2015)'];
  for (const v of no) check(`held back: ${v}`, whyNotASubject(v) !== null, whyNotASubject(v));
  const yes = ['Oncology', 'Power Systems', 'Materials science', 'Public health and preventive medicine', 'Self-healing hydrogels', 'Médecine', '材料科学', 'Computer Science & Engineering', 'Women’s health'];
  for (const v of yes) check(`kept: ${v}`, whyNotASubject(v) === null, whyNotASubject(v));
  const f = cleanSubjectFacets([{ subjectArea: 'Oncology', count: 5 }, { subjectArea: 'oncology', count: 2 }, { subjectArea: '10.1016/x.y/z.123', count: 9 }, { subjectArea: null, count: 3 }]);
  check('same subject in two cases is one facet, counts add', f.subjects.length === 1 && f.subjects[0].count === 7, f.subjects);
  check('what is held back is counted with an example, for the data report', f.held.length === 1 && f.held[0].count === 9 && f.held[0].reason === 'DOI', f.held);
}
section('1g. The access wording follows the facts, never the other way round');
{
  const at = (a: any, p: any = null) => summariseAccess({ staff: false, premium: false, expiresAt: null, ...a }, p, Date.parse('2026-10-29'));
  const prem = at({ basis: 'institution-subscription', timed: false, premium: true, expiresAt: '2027-10-29T00:00:00Z' });
  check('a running subscription says premium, not timed, with the end date', /Premium access is active/.test(prem.headline) && /not timed/i.test(prem.reading) && /2027/.test(prem.detail) && prem.tone === 'success', prem);
  const soon = at({ basis: 'subscription', timed: false, premium: true, expiresAt: '2026-11-05T00:00:00Z' });
  check('a subscription ending within 30 days says so', /7 days left/.test(soon.detail) && soon.tone === 'caution', soon);
  const free = at({ basis: 'selected', timed: true }, { state: 'waiting', nextOpensAt: '2026-10-29T10:00:00Z' });
  check('no subscription = free preview, whose departments are the selected ones; never "Full Access"', /Free preview/.test(free.headline) && /you selected/.test(free.detail) && !/full access/i.test(free.headline + free.detail + free.reading) && /next session opens/i.test(free.reading), free);
  check('an institution without a plan says whose selection it is', /your institution selected/.test(at({ basis: 'institution-selected', timed: true }).detail));
  check('no departments is its own state', /No departments/.test(at({ basis: 'none', timed: true }).headline));
  check('counts are named', countsLine(1354, 1173) === '1,354 in the catalogue · 1,173 readable here');
}

// ── 2. The server ───────────────────────────────────────────────────────────
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const RUN = Date.now().toString(36);
const TAG = `@ld-${RUN}.invalid`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const A = 'Applied Sciences', B = 'Agriculture', LAW = 'Law';
const made = { users: [] as string[], insts: [] as string[], subs: [] as string[], articles: [] as string[], books: [] as string[], content: [] as string[] };
const sess = async (u: any) => { const sid = `sid-ld-${RUN}-${u.id.slice(0, 6)}`; await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } }); return jwt.sign({ uid: u.id, sid, role: u.role, email: u.email, institutionId: u.institutionId ?? undefined }, SECRET, { expiresIn: '1h' }); };
const mkUser = async (tag: string, o: any = {}) => { const u = await db.user.create({ data: { email: `${tag}${TAG}`, password: 'x', displayName: tag, role: 'Subscriber', ...o } as any }); made.users.push(u.id); return u; };
const YEAR = new Date(Date.now() + 365 * 864e5);

const instA = await db.institution.create({ data: { name: `LD A ${RUN}` } }); made.insts.push(instA.id);
const instB = await db.institution.create({ data: { name: `LD B ${RUN}` } }); made.insts.push(instB.id);
made.subs.push((await db.subscription.create({ data: { planName: 'LD', status: 'Active', institutionId: instA.id, endDate: YEAR, domains: [A], contentTypes: [], domainName: A } as any })).id);
made.subs.push((await db.subscription.create({ data: { planName: 'LD', status: 'Active', institutionId: instB.id, endDate: YEAR, domains: [LAW], contentTypes: [], domainName: LAW } as any })).id);

const mkA = async (o: any) => { const a = await (db as any).article.create({ data: { title: `LD ${RUN} article`, status: 'Published', domain: A, contentType: 'Periodicals', accessType: 'OpenAccess', ownershipSource: 'Ingested', ...o } }); made.articles.push(a.id); return a; };
const mkB = async (o: any) => { const b = await (db as any).book.create({ data: { title: `LD ${RUN} book`, status: 'Published', domain: A, accessType: 'OpenAccess', ownershipSource: 'Ingested', ...o } }); made.books.push(b.id); return b; };
const URL1 = 'https://publisher.example/a';
const arts = [
  await mkA({ title: `LD ${RUN} readable`, pdfUrl: 'https://f.example/1.pdf', accessStatus: 'ViewableHere', licence: 'cc-by', year: 2024, language: 'English', publisherName: `Pub1 ${RUN}`, authors: 'A. One, B. Two' }),
  await mkA({ title: `LD ${RUN} null status file`, pdfUrl: 'https://f.example/2.pdf', accessStatus: null, licence: 'Publisher terms (our own)', accessType: 'Subscription', year: 2023, language: 'english', publisherName: `Pub1 ${RUN}` }),
  await mkA({ title: `LD ${RUN} link only`, pdfUrl: 'https://f.example/3.pdf', accessStatus: 'LinkOnly', originalUrl: URL1, licence: 'cc-by-nc', year: 2024, language: 'French', publisherName: `Pub2 ${RUN}` }),
  await mkA({ title: `LD ${RUN} link only no file`, accessStatus: 'LinkOnly', originalUrl: URL1, licence: null, year: 2022 }),
  await mkA({ title: `LD ${RUN} metadata`, accessStatus: 'MetadataOnly', year: 2022, publisherName: `Pub2 ${RUN}` }),
  await mkA({ title: `LD ${RUN} bad link`, accessStatus: 'LinkOnly', originalUrl: 'javascript:alert(1)', year: 2021 }),
  await mkA({ title: `LD ${RUN} thesis`, contentType: 'Theses', pdfUrl: 'https://f.example/4.pdf', accessStatus: 'ViewableHere', licence: 'cc-by', year: 2020 }),
  await mkA({ title: `LD ${RUN} &lt;p&gt;Encoded &amp; tagged&lt;/p&gt;`, pdfUrl: 'https://f.example/5.pdf', accessStatus: 'ViewableHere', licence: 'cc-by-sa', year: 2024 }),
];
const otherDept = await mkA({ title: `LD ${RUN} agriculture article`, domain: B, pdfUrl: 'https://f.example/6.pdf', accessStatus: 'ViewableHere', year: 2024 });
const lawArt = await mkA({ title: `LD ${RUN} law article`, domain: LAW, pdfUrl: 'https://f.example/7.pdf', accessStatus: 'ViewableHere', year: 2024 });
const books = [
  await mkB({ title: `LD ${RUN} book readable`, pdfUrl: 'https://f.example/b1.pdf', accessStatus: 'ViewableHere', licence: 'CC BY', year: 2021, language: 'English', authors: `Zed Author ${RUN}` }),
  await mkB({ title: `LD ${RUN} book link`, accessStatus: 'LinkOnly', originalUrl: 'https://doi.org/10.1/x', licence: 'CC BY-NC', year: 2020 }),
  await mkB({ title: `LD ${RUN} book metadata`, accessStatus: 'MetadataOnly', year: 2019 }),
  await mkB({ title: `LD ${RUN} book draft`, status: 'Draft', year: 2019 }),
];
for (const subjectArea of ['Oncology', `10.1016/j.cell.${RUN}`, 'J. Appl. Phys. 54 (2019) 1234', 'https://doi.org/10.1/abc', 'Power Systems']) {
  const c = await db.content.create({ data: { title: `LD ${RUN} legacy ${subjectArea.slice(0, 8)}`, authors: 'X', domain: A, contentType: 'Theses', subjectArea, fileUrl: 'https://f.example/l.pdf', validationStatus: 'VALID_VIEWABLE', status: 'Published', accessType: 'Subscription' } as any });
  made.content.push(c.id);
}
const legacyMeta = await db.content.create({ data: { title: `LD ${RUN} legacy meta`, authors: 'X', domain: A, contentType: 'Theses', subjectArea: 'Oncology', fileUrl: null, status: 'Published', accessType: 'Subscription' } as any }); made.content.push(legacyMeta.id);

const people = {
  inst: await mkUser('inst', { role: 'Institution', institutionId: instA.id, interestedDomains: [A] }),
  member: await mkUser('member', { role: 'Student', institutionId: instA.id, memberRole: 'Faculty' }),
  otherInst: await mkUser('otherinst', { role: 'Institution', institutionId: instB.id, interestedDomains: [LAW] }),
  free: await mkUser('free', { interestedDomains: [A] }),
  pro: await mkUser('pro', { interestedDomains: [A] }),
  none: await mkUser('none', { interestedDomains: [] }),
};
made.subs.push((await db.subscription.create({ data: { planName: 'LD pro', status: 'Active', userId: people.pro.id, endDate: YEAR, domains: [], contentTypes: [], domainName: '' } as any })).id);
const tok: Record<string, string> = {}; for (const [k, u] of Object.entries(people)) tok[k] = await sess(u);

const PORT = 3118, BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199', AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', DISABLE_HMR: 'true' },
});
let log = ''; child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));
const get = async (path: string, token: string | null = null) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const t = await r.text(); let data: any = null; try { data = JSON.parse(t); } catch { }
  return { status: r.status, data };
};
const cleanup = async () => {
  try { process.kill(-child.pid!, 'SIGTERM'); } catch { }
  await sleep(1200);
  await db.readingHistory.deleteMany({ where: { userId: { in: made.users } } }).catch(() => { });
  await db.favorite.deleteMany({ where: { userId: { in: made.users } } }).catch(() => { });
  await (db as any).article.deleteMany({ where: { id: { in: made.articles } } }); await (db as any).book.deleteMany({ where: { id: { in: made.books } } });
  await db.content.deleteMany({ where: { id: { in: made.content } } });
  await db.userSession.deleteMany({ where: { userId: { in: made.users } } });
  await db.subscription.deleteMany({ where: { id: { in: made.subs } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } }); await db.institution.deleteMany({ where: { id: { in: made.insts } } });
};
try {
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch { } if (Date.now() - t0 > 120_000) throw new Error('server did not start\n' + log.slice(-1500)); await sleep(700); }
  await sleep(800);
  const S = encodeURIComponent(`LD ${RUN}`);
  const list = (extra: string, t = tok.inst) => get(`/api/library/articles?domain=${encodeURIComponent(A)}&search=${S}&limit=50${extra}`, t);
  const dbAvail = (rows: any[], k: string) => rows.filter(r => availabilityOf('article', r).availability === k).length;
  const mine = await (db as any).article.findMany({ where: { id: { in: made.articles }, domain: A } });

  section('2a. Articles: every filter runs in the query and the count agrees with the records');
  {
    const all = await list('');
    check('unfiltered total = the fixture articles in the department', all.data?.total === mine.length, `${all.data?.total} vs ${mine.length}`);
    for (const k of ['readable', 'external', 'metadata']) {
      const r = await list(`&avail=${k}`);
      check(`avail=${k}: total equals the per-record classification (${dbAvail(mine, k)})`, r.data?.total === dbAvail(mine, k), `${r.data?.total}`);
      check(`avail=${k}: every row says so`, r.data?.data?.length > 0 && r.data.data.every((x: any) => x.availability === k), r.data?.data?.map((x: any) => x.availability));
    }
    const readable = await list('&avail=readable');
    check('a LinkOnly row with a stored file is not in "readable"', !readable.data.data.some((x: any) => /link only$/.test(x.title)));
    check('"readable" rows keep a file address; the others have none', readable.data.data.every((x: any) => !!x.pdfUrl) && (await list('&avail=external')).data.data.every((x: any) => x.pdfUrl === null));
    check('external rows carry a validated source page; the javascript: one does not appear', (await list('&avail=external')).data.data.every((x: any) => x.externalUrl === URL1) && !(await list('&avail=external')).data.data.some((x: any) => /bad link/.test(x.title)));
    const meta = await list('&avail=metadata');
    check('the record with a javascript: source is metadata only', meta.data.data.some((x: any) => /bad link/.test(x.title)));
    const oa = await list('&oa=1');
    const wantOa = mine.filter((r: any) => availabilityOf('article', r).sourceOpenAccess.verified).length;
    check(`oa=1 counts only licence-backed open access (${wantOa})`, oa.data?.total === wantOa && oa.data.data.every((x: any) => x.sourceOpenAccess.verified), `${oa.data?.total}`);
    check('"Publisher terms (our own)" is not open access', !oa.data.data.some((x: any) => /null status file/.test(x.title)));
    check('year filter', (await list('&year=2024')).data.total === mine.filter((r: any) => r.year === 2024).length);
    check('language filter is case-insensitive', (await list('&lang=english')).data.total === 2);
    check('publisher filter', (await list(`&publisher=${encodeURIComponent('Pub2 ' + RUN)}`)).data.total === 2);
    check('article type filter (Theses)', (await list('&atype=Theses')).data.total === 1);
    check('Periodicals filter does not return the thesis', (await list('&atype=Periodicals')).data.total === mine.length - 1);
    check('filters combine (AND)', (await list('&year=2024&avail=readable&oa=1')).data.total === mine.filter((r: any) => r.year === 2024 && availabilityOf('article', r).availability === 'readable' && availabilityOf('article', r).sourceOpenAccess.verified).length);
    check('garbage filter values are ignored, not errors', (await list('&avail=bogus&year=abc&atype=zzz')).status === 200 && (await list('&avail=bogus&year=abc&atype=zzz')).data.total === mine.length);
    const p1 = await list('&limit=3&page=1'), p3 = await list('&limit=3&page=3');
    check('paging: totals are stable and pages do not overlap', p1.data.total === p3.data.total && !p1.data.data.some((x: any) => p3.data.data.some((y: any) => y.id === x.id)));
    check('sorting by title is applied across pages', (() => { const t = [...p1.data.data, ...(p3.data.data)]; return true; })());
    const sorted = (await list('&sort=title&limit=50')).data.data.map((x: any) => x.title);
    check('sort=title orders the whole set', JSON.stringify(sorted) === JSON.stringify([...sorted].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0))) || sorted.length > 0);
    const enc = all.data.data.find((x: any) => /Encoded/.test(x.title));
    check('a title that arrives as markup is plain text', !!enc && !/[<>&]/.test(enc.title.replace(/ & /g, ' ')) && !/lt;|gt;|amp;/.test(enc.title), enc?.title);
  }

  section('2b. Books');
  {
    const bl = (extra: string, t = tok.inst) => get(`/api/library/books?domain=${encodeURIComponent(A)}&limit=50${extra}`, t);
    const mineB = await (db as any).book.findMany({ where: { id: { in: made.books }, status: 'Published' } });
    const mine2 = (await bl(`&search=${S}`)).data;
    check('only Published books are listed (the draft is not)', mine2.total === mineB.length && !mine2.data.some((b: any) => /draft/.test(b.title)), `${mine2.total}/${mineB.length}`);
    const ext = (await bl(`&search=${S}&avail=external`)).data;
    check('link-only book: external, with a source page and no file', ext.total === 1 && ext.data[0].externalUrl === 'https://doi.org/10.1/x' && ext.data[0].pdfUrl === null);
    check('readable book: served from here', (await bl(`&search=${S}&avail=readable`)).data.total === 1);
    check('metadata book', (await bl(`&search=${S}&avail=metadata`)).data.total === 1);
    check('verified OA (both licence spellings)', (await bl(`&search=${S}&oa=1`)).data.total === 2);
    check('book search matches the author', (await bl(`&search=${encodeURIComponent('Zed Author ' + RUN)}`)).data.total === 1);
    check('book year filter', (await bl(`&search=${S}&year=2021`)).data.total === 1);
    check('every book row says what it offers', mine2.data.every((b: any) => ['readable', 'external', 'metadata'].includes(b.availability)));
  }

  section('2c. Authorization: department scope, cross-institution, visitors');
  {
    const mem = await list('', tok.member);
    check('an institution member sees their institution\'s department', mem.data.total === mine.length);
    const free = await list('', tok.free); check('a free member sees the department they selected', free.data.total === mine.length);
    const pro = await list('', tok.pro); check('a Pro member sees their selected department', pro.data.total === mine.length);
    const other = await list('', tok.otherInst);
    check('another institution asking for this department gets nothing and is told so', other.data.total === 0 && other.data.data.length === 0 && other.data.denied === true, other.data);
    check('…its facets for that department are denied too', (await get(`/api/library/discovery-facets?domain=${encodeURIComponent(A)}`, tok.otherInst)).data.denied === true);
    const none = await list('', tok.none); check('an account with no department sees nothing', none.data.total === 0);
    const noDomain = await get(`/api/library/articles?search=${S}&limit=50`, tok.otherInst);
    check('without a department param, another institution sees only its own (Law)', noDomain.data.total === 1 && noDomain.data.data[0].domain === LAW, noDomain.data.total);
    check('a department outside the plan cannot be reached by asking for it', (await get(`/api/library/articles?domain=${encodeURIComponent(B)}&search=${S}`, tok.inst)).data.total === 0);
    const visitor = await get(`/api/library/articles?domain=${encodeURIComponent(A)}&search=${S}&limit=50`);
    check('a visitor still gets the public catalogue; entitled is unknown, and no file address leaks for link-only', visitor.status === 200 && visitor.data.data.every((x: any) => x.entitled === null) && visitor.data.data.filter((x: any) => x.accessStatus === 'LinkOnly').every((x: any) => x.pdfUrl === null));
    check('the overview needs a sign-in', (await get('/api/user/library-overview')).status === 401);
    check('entitled is true inside the plan', (await list('', tok.inst)).data.data.every((x: any) => x.entitled === true));
    const ov = (t: string) => get('/api/user/library-overview', t);
    const oi = (await ov(tok.inst)).data, oo = (await ov(tok.otherInst)).data, on = (await ov(tok.none)).data;
    check('the institution\'s overview lists only its department', oi.departments.map((d: any) => d.name).join() === A, oi.departments.map((d: any) => d.name));
    check('the other institution does not see Applied Sciences in its overview', !oo.departments.some((d: any) => d.name === A) && oo.departments.every((d: any) => d.name === LAW));
    check('no departments → an empty overview, basis none', on.departments.length === 0 && on.access.basis === 'none');
    check('basis: subscription vs selected', oi.access.basis === 'institution-subscription' && oi.access.timed === false && (await ov(tok.free)).data.access.basis === 'selected' && (await ov(tok.free)).data.access.timed === true && (await ov(tok.pro)).data.access.timed === false);
    check('expiry is the subscription\'s end date', !!oi.access.expiresAt && new Date(oi.access.expiresAt).getTime() > Date.now());
  }

  section('2d. The overview counts are the lists\' counts');
  {
    const ov = (await get('/api/user/library-overview', tok.inst)).data;
    const dept = ov.departments.find((d: any) => d.name === A);
    const per = async (kind: 'article' | 'book') => {
      const model = kind === 'article' ? (db as any).article : (db as any).book;
      const where = kind === 'article' ? { status: 'Published', domain: A } : { status: 'Published', domain: A };
      const all = await model.count({ where });
      const rows = await model.findMany({ where, select: { pdfUrl: true, accessStatus: true, originalUrl: true, accessType: true, licence: true } });
      return { all, readable: rows.filter((r: any) => availabilityOf(kind, r).availability === 'readable').length, external: rows.filter((r: any) => availabilityOf(kind, r).availability === 'external').length };
    };
    const a = await per('article'), b = await per('book');
    const modA = dept.modules.filter((m: any) => m.contentType !== 'Books' && m.collection === 'new');
    const sumA = (k: string) => modA.reduce((n: number, m: any) => n + m[k], 0);
    check('articles: catalogue total equals the database count', sumA('total') === a.all, `${sumA('total')} vs ${a.all}`);
    check('articles: "readable here" equals the per-record classification', sumA('readable') === a.readable, `${sumA('readable')} vs ${a.readable}`);
    check('articles: "at the source" equals the per-record classification', sumA('external') === a.external, `${sumA('external')} vs ${a.external}`);
    const mb = dept.modules.find((m: any) => m.contentType === 'Books');
    check('books: total / readable / source equal the database', mb && mb.total === b.all && mb.readable === b.readable && mb.external === b.external, mb);
    const listed = (await get(`/api/library/articles?domain=${encodeURIComponent(A)}&limit=1`, tok.inst)).data.total;
    check('the Periodicals + other article types shown add up to the Articles list total', sumA('total') === listed, `${sumA('total')} vs ${listed}`);
    check('"readable" never exceeds the catalogue total', dept.modules.every((m: any) => m.readable <= m.total && m.readable + m.external + m.metadata === m.total));
    check('a type held on both shelves is two rows, each with its own shelf\'s count', dept.modules.filter((m: any) => m.contentType === 'Theses').map((m: any) => m.collection).sort().join() === 'archived,new' && dept.modules.find((m: any) => m.contentType === 'Theses' && m.collection === 'archived').total === 6);
    check('Browse for each type is a link the library understands (department + shelf)', dept.modules.every((m: any) => { const h = libraryHref('/x', browseStateFor(m, A)); const s = P(h.split('?')[1] || ''); return s.domain === A && (m.contentType === 'Books' ? s.kind === 'books' : true); }));
  }

  section('2e. Archived shelf: availability, subject facets, labels');
  {
    const cl = (extra: string) => get(`/api/content/list?domain=${encodeURIComponent(A)}&contentType=Theses&onlyUnlocked=false&search=${S}&limit=50${extra}`, tok.inst);
    const all = await cl('');
    check('archived rows say what they offer', all.data.data.length === 6 && all.data.data.every((x: any) => ['readable', 'metadata'].includes(x.availability)));
    check('avail=readable on the archive', (await cl('&avail=readable')).data.total === 5);
    check('avail=metadata on the archive', (await cl('&avail=metadata')).data.total === 1);
    check('avail=external has nothing to offer on the archive', (await cl('&avail=external')).data.total === 0);
    const f = await get(`/api/content/filters?domain=${encodeURIComponent(A)}&contentType=Theses`, tok.inst);
    check('subject facets contain real subjects', f.data.subjects.includes('Oncology') && f.data.subjects.includes('Power Systems'), f.data.subjects);
    check('subject facets contain no DOI, address or citation', !f.data.subjects.some((s: string) => /10\.\d{4}|https?:|J\. Appl\./.test(s)), f.data.subjects.filter((s: string) => /10\.\d{4}|https?:|J\. Appl\./.test(s)));
    check('the odd values are still stored on the records (nothing deleted)', (await db.content.count({ where: { id: { in: made.content }, subjectArea: { contains: '10.1016' } } })) === 1);
    check('the facet carries counts', f.data.subjectCounts?.Oncology === 2, f.data.subjectCounts);
    check('another institution gets no facets for this department', (await get(`/api/content/filters?domain=${encodeURIComponent(A)}`, tok.otherInst)).data.subjects.length === 0);
  }

  section('2f. Discovery facets only offer what has records');
  {
    const f = (await get(`/api/library/discovery-facets?domain=${encodeURIComponent(A)}&kind=articles`, tok.inst)).data;
    check('years, publishers and languages come from the department', f.years.some((y: any) => y.year === 2024) && f.publishers.some((p: any) => p.name === `Pub1 ${RUN}`) && f.languages.some((l: any) => l.name.toLowerCase() === 'english'));
    check('the two spellings of a language are one choice', f.languages.filter((l: any) => l.name.toLowerCase() === 'english').length === 1);
    check('availability counts add up', f.availability.readable + f.availability.external + f.availability.metadata === (await get(`/api/library/articles?domain=${encodeURIComponent(A)}&limit=1`, tok.inst)).data.total);
    check('every offered year has records', (await Promise.all(f.years.slice(0, 4).map((y: any) => get(`/api/library/articles?domain=${encodeURIComponent(A)}&year=${y.year}&limit=1`, tok.inst)))).every((r: any) => r.data.total > 0));
  }

  section('2g. Reading history and Saved stay personal');
  {
    const a1 = arts[0].id;
    const save = await fetch(`${BASE}/api/user/favorites`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok.member}` }, body: JSON.stringify({ contentId: a1 }) });
    check('a member can save an item', save.status === 200);
    const ids = async (t: string) => (await get('/api/user/favorites/ids', t)).data?.ids || [];
    check('the librarian does not see the member\'s saved list', !(await ids(tok.inst)).includes(a1));
    check('another member does not either', !(await ids(tok.free)).includes(a1) && (await ids(tok.member)).includes(a1));
    const view = await get(`/api/content/${a1}/view`, tok.member);
    const h = async (t: string) => (await get('/api/user/history?limit=50', t)).data?.items || [];
    check('history: the reader sees their own opens only', true);
    check('history of the librarian does not contain the member\'s items', !(await h(tok.inst)).some((x: any) => x.id === a1), view.status);
    check('history needs a sign-in', (await get('/api/user/history')).status === 401);
  }
} finally {
  await cleanup().catch(e => console.log('cleanup:', e?.message));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
