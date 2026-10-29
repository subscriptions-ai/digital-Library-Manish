/**
 * Public book figures: one definition of "listed" and "readable", the one legacy status rule (src/lib/publicStatus.ts), and agreement between the
 * public counters, the public lists, the department counts and the admin overview.
 *
 * Library level and API level (the real Express server, every outbound request blocked), against the throwaway database `stm_ingestion_test`
 * (refuses anything else). Every row is tagged and removed afterwards; assertions use counts taken BEFORE seeding.
 *
 *   npx tsx scripts/test-public-books.ts
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
const { publicBookCounts, publicBookWhere, publicLegacyBookWhere, publicBookSql, publicLegacyBookSql } = await import('../src/lib/publicBooks.js');
const { isPubliclyListed, classifyStatus } = await import('../src/lib/publicStatus.js');
const { sectionOverview } = await import('../src/lib/adminContent.js');
const { createDepartmentSpellings } = await import('../src/server/departmentSpellings.js');

const PORT = 3105, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36), TAG = `pbk-${RUN}`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const spellings = createDepartmentSpellings(db as any, 0);
let child: ReturnType<typeof spawn> | null = null; let serverLog = '';
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-pb-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-pb-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};

try {
  const before = await publicBookCounts(db);
  const b = (i: string, o: any) => ({ title: `${TAG} ${i}`, ...o });
  await db.book.createMany({ data: [
    b('pub-link', { status: 'Published', domain: 'Nursing', accessStatus: 'LinkOnly' }),
    b('pub-readable', { status: 'Published', domain: 'Nursing', accessStatus: 'ViewableHere', pdfUrl: 'https://example.invalid/a.pdf' }),
    b('draft', { status: 'Draft', domain: 'Nursing' }),
    b('rejected', { status: 'Rejected', domain: 'Law' }),
    b('draft-viewable', { status: 'Draft', domain: 'Law', accessStatus: 'ViewableHere', pdfUrl: 'https://example.invalid/b.pdf' }),
  ] });
  const c = (i: string, o: any) => ({ title: `${TAG} ${i}`, authors: 'A', contentType: 'Books', ...o });
  await db.content.createMany({ data: [
    c('leg-published', { status: 'Published', domain: 'Law', fileUrl: 'https://example.invalid/c.pdf', validationStatus: 'VALID_VIEWABLE' }),
    c('leg-lowercase', { status: 'published', domain: 'Law', validationStatus: 'Not Validated' }),
    c('leg-open-access', { status: 'Open Access', domain: 'Law', validationStatus: 'Not Validated' }),
    c('leg-draft', { status: 'Draft', domain: 'Law', fileUrl: 'https://example.invalid/e.pdf', validationStatus: 'VALID_VIEWABLE' }),
    c('leg-draft-lowercase', { status: 'draft', domain: 'Law' }),
    c('leg-hidden', { status: 'Hidden', domain: 'Law', fileUrl: 'https://example.invalid/h.pdf', validationStatus: 'VALID_VIEWABLE' }),
    { title: `${TAG} leg-thesis`, authors: 'A', contentType: 'Theses', status: 'Published', domain: 'Law' },
  ] });
  spellings.refresh();

  section('The legacy status rule, said once');
  check('Published, lower-case published and the unrecognised "Open Access" are listed', isPubliclyListed('archived', 'Published') && isPubliclyListed('archived', 'published') && isPubliclyListed('archived', 'Open Access'));
  check('Draft (any case), Hidden and Rejected are not', !isPubliclyListed('archived', 'Draft') && !isPubliclyListed('archived', 'draft') && !isPubliclyListed('archived', 'Hidden') && !isPubliclyListed('archived', 'Rejected'));
  check('the new collection lists only an exact Published; the unrecognised status is reported, not folded into Published', isPubliclyListed('new', 'Published') && !isPubliclyListed('new', 'published') && classifyStatus('archived', 'Open Access') === 'unrecognised');

  section('Library figures: listed vs readable');
  const after = await publicBookCounts(db);
  check('structured listed +2 (the two Published; Draft and Rejected are not)', after.structured - before.structured === 2);
  check('legacy listed +3 (Published, published, Open Access; Draft, draft, Hidden and the thesis are not)', after.legacy - before.legacy === 3, `${after.legacy - before.legacy}`);
  check('readable: +1 structured (Published + ViewableHere + file), +1 legacy (validated file, listed; a Draft or Hidden one with a file is not)',
    after.readable.structured - before.readable.structured === 1 && after.readable.legacy - before.readable.legacy === 1, `${after.readable.structured - before.readable.structured}/${after.readable.legacy - before.readable.legacy}`);
  check('listed = structured + legacy; recordOnly = listed − readable', after.listed === after.structured + after.legacy && after.recordOnly === after.listed - after.readable.total);
  const sql = (await db.$queryRawUnsafe(`select (select count(*)::int from "Book" b where ${publicBookSql('b')}) + (select count(*)::int from "Content" c where ${publicLegacyBookSql('c')}) n`))[0].n;
  check('the SQL twins agree with the Prisma figure', sql === after.listed, `${sql} vs ${after.listed}`);
  check('an empty department list is no department: zero', (await publicBookCounts(db, { domains: [] })).listed === 0);

  section('The admin overview (shared section overview) agrees with the public figure');
  const ovNew = await sectionOverview(db, spellings, 'Books', 'new', {}), ovOld = await sectionOverview(db, spellings, 'Books', 'archived', {});
  check('New: summary.public = the public structured figure', ovNew.summary.public === after.structured, `${ovNew.summary.public} vs ${after.structured}`);
  check('Archived: summary.public = the public legacy figure (same rule, incl. lower-case and Open Access)', ovOld.summary.public === after.legacy, `${ovOld.summary.public} vs ${after.legacy}`);
  check('departments + Unassigned = the total, both collections', ovNew.reconciles && ovOld.reconciles);
  check('the unrecognised-status listing is reported, not hidden', ovOld.summary.unrecognisedListed >= 1);

  // ── API ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const superTok = await mkUser('SuperAdmin');
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
  const t0 = Date.now(); for (;;) { try { if ((await call('/api/health')).status === 200) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('API: the public counters, lists and department counts apply the same rule');
  const ctc = await call('/api/public/content-type-counts');
  check('content-type counts: Books = listed, BooksReadable = readable', ctc.data.Books === after.listed && ctc.data.BooksReadable === after.readable.total, `${ctc.data?.Books}/${ctc.data?.BooksReadable}`);
  const pc = await call('/api/public/counts');
  check('/api/public/counts agrees (books = listed)', pc.data.books === after.listed, `${pc.data?.books}`);
  const list = await call('/api/content/list?contentType=Books&limit=1');
  check('the public legacy list total = the legacy listed figure (the lower-case and Open Access books are on it; Draft, draft and Hidden are not)', list.data.total === after.legacy, `${list.data?.total} vs ${after.legacy}`);
  const shelf = await call('/api/library/books?limit=1');
  check('the public Books shelf total = the structured listed figure', shelf.data.total === after.structured, `${shelf.data?.total} vs ${after.structured}`);
  const dc = await call('/api/public/domain-counts');
  const lawListed = (await publicBookCounts(db, { domains: await spellings.expand(['Law']) }));
  check('department counts include the lower-case and unrecognised legacy rows, not the withheld ones (Law, all content types >= listed books)', (dc.data.Law || 0) >= lawListed.listed, `${dc.data?.Law} vs ${lawListed.listed}`);
  const hidden = await db.content.findFirst({ where: { title: `${TAG} leg-hidden` }, select: { id: true } });
  const lower = await db.content.findFirst({ where: { title: `${TAG} leg-lowercase` }, select: { id: true } });
  const dHidden = await call(`/api/public/content/${hidden!.id}`), dLower = await call(`/api/public/content/${lower!.id}`);
  check('the item gate follows the list: a listed legacy book opens, a Hidden one does not', dLower.status === 200 && dHidden.status === 404, `${dLower.status}/${dHidden.status}`);
  const adminOv = await call('/api/admin/library/overview?contentType=Books&collection=archived', superTok);
  check('the admin overview (HTTP) reports the same public legacy figure', adminOv.status === 200 && adminOv.data.summary.public === after.legacy, `${adminOv.status} ${adminOv.data?.summary?.public}`);
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}\n${serverLog.slice(-1500)}`);
} finally {
  try { if (child) process.kill(-child.pid!, 'SIGTERM'); } catch {}
  await db.book.deleteMany({ where: { title: { startsWith: TAG } } }); await db.content.deleteMany({ where: { title: { startsWith: TAG } } });
  await db.userSession.deleteMany({ where: { sessionId: { startsWith: `sid-pb-${RUN}` } } });
  await db.user.deleteMany({ where: { email: { endsWith: `-pb-${RUN}@api-test.invalid` } } });
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
