/**
 * Books counting and the admin Books overview.
 *
 * Library level (publicBooks.ts, adminBooks.ts) and API level (the real Express server, every outbound request blocked), against the
 * throwaway database `stm_ingestion_test` (refuses anything else). Every row this suite creates is tagged and removed afterwards; the
 * assertions compare against counts taken BEFORE it seeds, so rows already in that database do not matter.
 *
 *   npx tsx scripts/test-books-overview.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const { publicBookCounts, publicBookWhere, publicLegacyBookWhere } = await import('../src/lib/publicBooks.js');
const { booksOverview, bookWhere, NO_DEPARTMENT } = await import('../src/lib/adminBooks.js');
const { createDepartmentSpellings } = await import('../src/server/departmentSpellings.js');
const { CANONICAL_NAMES } = await import('../src/lib/departmentRegistry.js');

const PORT = 3104, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const TAG = `bkov-${RUN}`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const spellings = createDepartmentSpellings(db as any, 0);

const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-bk-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-bk-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};

let child: ReturnType<typeof spawn> | null = null;
let serverLog = '';
const shutdown = async () => { try { if (child) process.kill(-child.pid!, 'SIGTERM'); } catch {} };
const cleanup = async () => {
  await db.book.deleteMany({ where: { title: { startsWith: TAG } } });
  await db.content.deleteMany({ where: { title: { startsWith: TAG } } });
  await db.userSession.deleteMany({ where: { sessionId: { startsWith: `sid-bk-${RUN}` } } });
  await db.user.deleteMany({ where: { email: { endsWith: `-bk-${RUN}@api-test.invalid` } } });
};

try {
  // ── Seed ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const before = await publicBookCounts(db);
  const bookBefore = await db.book.count(), legacyBefore = await db.content.count({ where: { contentType: 'Books' } });
  const b = (i: string, o: any) => ({ title: `${TAG} ${i}`, ...o });
  await db.book.createMany({ data: [
    b('pub-nursing-link', { status: 'Published', domain: 'Nursing', accessStatus: 'LinkOnly' }),
    b('pub-nursing-readable', { status: 'Published', domain: 'nursing', accessStatus: 'ViewableHere', pdfUrl: 'https://example.invalid/a.pdf' }),
    b('pub-medical-alias', { status: 'Published', domain: 'Medical', accessStatus: 'MetadataOnly' }),
    b('draft-nursing', { status: 'Draft', domain: 'Nursing' }),
    b('draft-none', { status: 'Draft', domain: null }),
    b('draft-blank', { status: 'Draft', domain: '' }),
    b('draft-unrecognised', { status: 'Draft', domain: 'Engineering' }),
    b('rejected-law', { status: 'Rejected', domain: 'Law' }),
    // Viewable but not Published: must not be counted as readable.
    b('draft-viewable', { status: 'Draft', domain: 'Law', accessStatus: 'ViewableHere', pdfUrl: 'https://example.invalid/b.pdf' }),
  ] });
  const c = (i: string, o: any) => ({ title: `${TAG} ${i}`, authors: 'A', contentType: 'Books', ...o });
  await db.content.createMany({ data: [
    c('leg-pub-law-valid', { status: 'Published', domain: 'Law', fileUrl: 'https://example.invalid/c.pdf', validationStatus: 'VALID_VIEWABLE' }),
    c('leg-pub-law-unvalidated', { status: 'Published', domain: 'Law', fileUrl: 'https://example.invalid/d.pdf', validationStatus: 'Not Validated' }),
    c('leg-draft-law-flagged', { status: 'Draft', domain: 'Law', fileUrl: 'https://example.invalid/e.pdf', validationStatus: 'FLAGGED_CONTENT' }),
    c('leg-draft-valid', { status: 'Draft', domain: 'Law', fileUrl: 'https://example.invalid/f.pdf', validationStatus: 'VALID_VIEWABLE' }),
    c('leg-pub-none', { status: 'Published', domain: null, validationStatus: 'Not Validated' }),
    c('leg-pub-physio-typo', { status: 'Published', domain: 'Physiotheraphy', validationStatus: 'Not Validated' }),
    // Not a book: never in a Books figure.
    { title: `${TAG} leg-thesis`, authors: 'A', contentType: 'Theses', status: 'Published', domain: 'Law' },
  ] });
  spellings.refresh();

  section('Public book figures: one definition, listed vs readable');
  const after = await publicBookCounts(db);
  check('structured listed rises by the 3 Published books', after.structured - before.structured === 3, `${before.structured} → ${after.structured}`);
  check('legacy listed rises by the 4 non-Draft books (a thesis and Drafts are not books listed)', after.legacy - before.legacy === 4, `${before.legacy} → ${after.legacy}`);
  check('listed = structured + legacy', after.listed === after.structured + after.legacy);
  check('readable counts only listed rows with a served file: +1 structured (ViewableHere + pdf, Published), +1 legacy (VALID_VIEWABLE, non-Draft)',
    after.readable.structured - before.readable.structured === 1 && after.readable.legacy - before.readable.legacy === 1,
    `${after.readable.structured - before.readable.structured}/${after.readable.legacy - before.readable.legacy}`);
  check('a Draft that is viewable is not readable; recordOnly = listed − readable', after.recordOnly === after.listed - after.readable.total);
  const sql = (await db.$queryRawUnsafe(`select (select count(*)::int from "Book" where status='Published') + (select count(*)::int from "Content" where "contentType"='Books' and status<>'Draft') n`))[0].n;
  check('independent SQL agrees with the figure', sql === after.listed, `${sql} vs ${after.listed}`);
  const zero = await publicBookCounts(db, { domains: [] });
  check('an empty department list is no department: zero, not the whole catalogue', zero.listed === 0 && zero.readable.total === 0);
  const law = await publicBookCounts(db, { domains: await spellings.expand(['Law']) });
  check('a department scope counts both collections', law.legacy >= 2);

  section('Admin overview: departments, Unassigned, reconciliation (New collection)');
  const o = await booksOverview(db, spellings, 'new', {});
  check('every one of the 29 departments is present, including zero-count ones', o.departments.length === CANONICAL_NAMES.length && CANONICAL_NAMES.every(n => o.departments.some(d => d.name === n)));
  check('the summary total is every Book row; public is the listed figure', o.summary.total === bookBefore + 9 && o.summary.public === after.structured, `${o.summary.total}/${o.summary.public}`);
  check('draft + rejected + public = total', o.summary.draft + o.summary.rejected + o.summary.public + o.summary.other === o.summary.total);
  check('departments + Unassigned = the total (no overlap, nothing lost)', o.filteredTotal === o.summary.total && o.reconciles);
  check('public counts reconcile the same way', o.filteredPublic === o.summary.public);
  const nursing = o.departments.find(d => d.name === 'Nursing')!, medical = o.departments.find(d => d.name === 'Medical Sciences')!;
  check('"nursing" (lower case) is the Nursing department', nursing.total >= 3, String(nursing.total));
  check('the alias "Medical" lands in Medical Sciences', medical.total >= 1);
  check('Unassigned holds null, blank and unrecognised, and says which', o.unassigned.blank >= 2 && o.unassigned.unrecognised >= 1 && o.unassigned.labels.some(l => l.name === 'Engineering'));
  check('summary.unassigned equals the Unassigned bucket', o.summary.unassigned === o.unassigned.total);

  section('The table filter and the counts are one definition');
  let allMatch = true; const bad: string[] = [];
  for (const d of [...o.departments.map(x => x.name), NO_DEPARTMENT]) {
    const count = d === NO_DEPARTMENT ? o.unassigned : o.departments.find(x => x.name === d)!;
    const total = await db.book.count({ where: await bookWhere('new', { domain: d }, spellings) });
    const pub = await db.book.count({ where: await bookWhere('new', { domain: d, visibility: 'public' }, spellings) });
    if (total !== count.total || pub !== count.public) { allMatch = false; bad.push(`${d}: ${total}/${pub} vs ${count.total}/${count.public}`); }
  }
  check('for all departments and Unassigned: rows in the table = count beside it (all and public)', allMatch, bad.slice(0, 3).join('; '));
  const q = await booksOverview(db, spellings, 'new', { q: TAG, status: 'Draft' });
  check('search + status narrow the department counts (facets follow the other filters)', q.filteredTotal === 5 && q.departments.find(d => d.name === 'Nursing')!.total === 1 && q.unassigned.total === 3, `${q.filteredTotal}`);
  check('a department that was not chosen is not emptied: counts do not take a department', q.departments.every(d => d.total >= 0) && q.departments.find(d => d.name === 'Law')!.total === 1);
  check('search matches the title; the public view of that search has no Drafts', (await booksOverview(db, spellings, 'new', { q: TAG })).filteredPublic === 3);
  check('status and visibility combine without error (Draft + public is empty)', (await db.book.count({ where: await bookWhere('new', { status: 'Draft', visibility: 'public', q: TAG }, spellings) })) === 0);

  section('Archived collection (legacy Content, contentType Books)');
  const a = await booksOverview(db, spellings, 'archived', {});
  check('summary total counts only books, not the thesis', a.summary.total === legacyBefore + 6, `${a.summary.total}`);
  check('archived "Published" is public: public = the listed legacy figure', a.summary.public === after.legacy);
  check('departments + Unassigned reconcile', a.filteredTotal === a.summary.total && a.reconciles);
  check('"Physiotheraphy" (misspelt alias) is Physiotherapy; null is Unassigned', a.departments.find(d => d.name === 'Physiotherapy')!.total >= 1 && a.unassigned.blank >= 1);
  check('the other collection is reported beside it, not mixed in', a.collections.new?.total === bookBefore + 9 && a.collections.archived?.total === a.summary.total);
  const legLaw = await db.content.count({ where: await bookWhere('archived', { domain: 'Law', q: TAG }, spellings) });
  check('the archived filter never returns a non-book (thesis in Law is excluded)', legLaw === 4, String(legLaw));
  check('public predicates match the SQL twins', (await db.book.count({ where: publicBookWhere })) === after.structured && (await db.content.count({ where: publicLegacyBookWhere })) === after.legacy);

  // ── API ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const superTok = await mkUser('SuperAdmin'), mgrTok = await mkUser('SubscriptionManager'), readerTok = await mkUser('Subscriber');
  child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3198', API_TEST_BLOCK_DELAY_MS: '50' },
  });
  child.stdout!.on('data', d => (serverLog += d)); child.stderr!.on('data', d => (serverLog += d));
  const call = async (path: string, token?: string) => {
    const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
    return { status: r.status, data };
  };
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/library/books/overview'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('API: who may read the overview, and that it agrees with the list');
  const ov = '/api/admin/library/books/overview';
  check('no token → 401', (await call(ov)).status === 401);
  check('a reader → 403', (await call(ov, readerTok)).status === 403);
  check('a subscription manager sees the New collection; the Archived side is withheld from them', await (async () => { const r = await call(ov, mgrTok); return r.status === 200 && r.data.collections.archived === null && r.data.dataset === 'new'; })());
  check('a subscription manager may not read the Archived overview (the legacy list is for super admins)', (await call(`${ov}?dataset=archived`, mgrTok)).status === 403);
  const sOv = await call(`${ov}?dataset=archived`, superTok);
  check('a super admin reads Archived', sOv.status === 200 && sOv.data.dataset === 'archived' && sOv.data.summary.total === a.summary.total);
  const apiNew = await call(`${ov}?q=${TAG}`, superTok);
  check('API overview = library overview for the same filter', apiNew.status === 200 && apiNew.data.filteredTotal === 9 && apiNew.data.departments.length === 29, `${apiNew.status} ${apiNew.data?.filteredTotal}`);
  const list = await call(`/api/admin/library/items?contentType=Books&search=${TAG}&domain=${NO_DEPARTMENT}&limit=100`, superTok);
  check('list with the Unassigned bucket returns exactly the Unassigned count', list.status === 200 && list.data.total === apiNew.data.unassigned.total, `${list.data?.total} vs ${apiNew.data?.unassigned.total}`);
  const listPub = await call(`/api/admin/library/items?contentType=Books&search=${TAG}&domain=Nursing&visibility=public&limit=100`, superTok);
  check('list for Nursing, public only = the public count beside Nursing', listPub.status === 200 && listPub.data.total === apiNew.data.departments.find((d: any) => d.name === 'Nursing').public, `${listPub.data?.total}`);
  const arch = await call(`/api/admin/content?contentType=Books&search=${TAG}&domain=${NO_DEPARTMENT}&limit=100`, superTok);
  check('archived list with the Unassigned bucket matches the archived overview', arch.status === 200 && arch.data.total === (await booksOverview(db, spellings, 'archived', { q: TAG })).unassigned.total, `${arch.data?.total}`);
  check('the archived list is still super-admin only', (await call(`/api/admin/content?contentType=Books`, mgrTok)).status === 403);
  const pub = await call('/api/public/content-type-counts');
  check('public counter: Books = listed figure, BooksReadable = the smaller readable figure', pub.status === 200 && pub.data.Books === after.listed && pub.data.BooksReadable === after.readable.total, `${pub.data?.Books}/${pub.data?.BooksReadable}`);
  const lib = await call('/api/library/books?limit=1');
  check('the public Books shelf total is the structured listed figure', lib.status === 200 && lib.data.total === after.structured, `${lib.data?.total} vs ${after.structured}`);
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}\n${serverLog.slice(-1500)}`);
} finally {
  await shutdown();
  await cleanup().catch(e => console.log('cleanup failed', e?.message));
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
