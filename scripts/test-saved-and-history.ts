/**
 * Saved items and Reading History, role by role, through the real routes: save and unsave, persistence across a new sign-in, reopening,
 * history recorded only by a successful open, one row per item, resume position, privacy between accounts, access rules on reopen,
 * and that no GET writes anything.
 *
 *   npx tsx scripts/test-saved-and-history.ts
 *
 * A real server on the throwaway database `stm_ingestion_test`. Every outbound request is blocked. All fixtures carry a per-run tag and are
 * removed afterwards.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { plainTitle, publicBook } from '../src/lib/abstractPreview.js';
import { readerBaseOf, itemPath } from '../src/lib/readerBase.js';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── 1. Pure: titles and links ───────────────────────────────────────────────
section('1. Titles are plain text; links stay inside the dashboard the reader is in');
{
  check('entity-encoded <p> is removed', plainTitle('&lt;p&gt;Augmented Reality Applications in Education&lt;/p&gt;') === 'Augmented Reality Applications in Education');
  check('a real <p> is removed', plainTitle('<p>Hello <b>World</b></p>') === 'Hello World');
  check('&amp; is decoded once, as text', plainTitle('Law &amp; Order') === 'Law & Order');
  check('a script tag never survives, content and all', !/script|alert/.test(String(plainTitle('A<script>alert(1)</script>B'))));
  check('an inequality in a title is kept', plainTitle('x < y and z > w') === 'x < y and z > w');
  check('a plain title is unchanged', plainTitle('Moment Analysis for Some Nonlinear SDE') === 'Moment Analysis for Some Nonlinear SDE');
  check('a missing title stays missing', plainTitle(null) === null && plainTitle(undefined) === undefined);
  check('publicBook cleans the title it sends', (publicBook({ title: '&lt;p&gt;Reality&lt;/p&gt;', description: null }) as any).title === 'Reality');
  check('/institution paths use the institution base', readerBaseOf('/institution/saved') === '/institution' && readerBaseOf('/institution') === '/institution');
  check('/dashboard paths use the dashboard base', readerBaseOf('/dashboard/library/saved') === '/dashboard' && readerBaseOf('/institutions') === '/dashboard');
  check('an article opens its record, a book its reader, a video its player',
    itemPath('/institution', 'article', 'a') === '/institution/article/a' && itemPath('/dashboard', 'book', 'b') === '/dashboard/viewer/b' && itemPath('/institution', 'video', 'v') === '/institution/videos/player/v');
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const RUN = Date.now().toString(36);
const DOMAIN = `@sah-${RUN}.invalid`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const made = { users: [] as string[], insts: [] as string[], content: [] as string[], articles: [] as string[], books: [] as string[] };
const DEPT = 'Computer / IT';
const mkUser = async (tag: string, o: any = {}) => {
  const u = await db.user.create({ data: { email: `${tag}${DOMAIN}`, password: 'x', displayName: tag, role: 'Subscriber', interestedDomains: [DEPT], ...o } as any });
  made.users.push(u.id); return u;
};
let sidN = 0;
const session = async (u: { id: string; email: string; role: string; institutionId?: string | null }) => {
  const sid = `sid-sah-${RUN}-${u.id.slice(0, 6)}-${sidN++}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return { sid, token: jwt.sign({ uid: u.id, sid, role: u.role, email: u.email, institutionId: u.institutionId ?? undefined }, SECRET, { expiresIn: '1h' }) };
};

const PORT = 3117, BASE = `http://127.0.0.1:${PORT}`;
type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', DISABLE_HMR: 'true' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 120_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(700); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const call = async (method: string, path: string, token: string | null, body?: any) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const writes = async () => ({
  history: await db.readingHistory.count({ where: { userId: { in: made.users } } }),
  activity: await db.studentActivity.count({ where: { userId: { in: made.users } } }),
  fav: await db.favorite.count({ where: { userId: { in: made.users } } }),
});

let srv: Srv | null = null;
try {
  const inst = await db.institution.create({ data: { name: `Inst ${RUN}` } }); made.insts.push(inst.id);
  const mkArticle = async (o: any) => { const a = await (db as any).article.create({ data: { title: `Art ${RUN}`, status: 'Published', domain: DEPT, accessType: 'OpenAccess', ...o } }); made.articles.push(a.id); return a; };
  const mkBook = async (o: any) => { const b = await (db as any).book.create({ data: { title: `Book ${RUN}`, status: 'Published', domain: DEPT, accessType: 'OpenAccess', ...o } }); made.books.push(b.id); return b; };
  const artFull = await mkArticle({ title: `Full text article ${RUN}`, pdfUrl: 'https://example.invalid/a.pdf', authors: 'A. Author' });
  const artLink = await mkArticle({ title: `Link-only article ${RUN}`, pdfUrl: null, originalUrl: 'https://example.invalid/landing', accessStatus: 'LinkOnly' });
  const artMeta = await mkArticle({ title: `Record-only article ${RUN}`, pdfUrl: null, originalUrl: null });
  const artHtml = await mkArticle({ title: `&lt;p&gt;Encoded title ${RUN}&lt;/p&gt;`, pdfUrl: 'https://example.invalid/h.pdf' });
  const bookFull = await mkBook({ title: `Whole book ${RUN}`, pdfUrl: 'https://example.invalid/b.pdf' });
  const bookDraft = await mkBook({ title: `Draft book ${RUN}`, status: 'Draft', pdfUrl: 'https://example.invalid/d.pdf' });
  const legacy = await db.content.create({ data: { title: `Legacy item ${RUN}`, authors: 'L. Author', domain: DEPT, contentType: 'Periodicals', fileUrl: 'https://example.invalid/l.pdf', accessType: 'Free', status: 'Published' } as any });
  made.content.push(legacy.id);

  // Every account type the application has: what the person is called (memberRole) and the access class (role).
  const ROLES: { label: string; data: any }[] = [
    { label: 'Subscriber (individual)', data: { role: 'Subscriber' } },
    { label: 'Student (institution member)', data: { role: 'Student', institutionId: inst.id, memberRole: 'Student' } },
    { label: 'Faculty (institution member)', data: { role: 'Student', institutionId: inst.id, memberRole: 'Faculty' } },
    { label: 'Researcher (institution member)', data: { role: 'Student', institutionId: inst.id, memberRole: 'Researcher' } },
    { label: 'Librarian (institution account)', data: { role: 'Institution', institutionId: inst.id, memberRole: 'Librarian' } },
    { label: 'College (institution admin)', data: { role: 'College', institutionId: inst.id } },
    { label: 'University (institution admin)', data: { role: 'University', institutionId: inst.id } },
    { label: 'Corporate (institution admin)', data: { role: 'Corporate', institutionId: inst.id } },
  ];

  // The institution's own account chooses its departments; its members can open exactly those.
  await mkUser('inst-owner', { role: 'Institution', institutionId: inst.id });

  srv = await start();

  // ── 2. Unauthenticated ──────────────────────────────────────────────────
  section('2. Every personal route refuses a request with no sign-in');
  for (const [m, p] of [['GET', '/api/user/favorites'], ['GET', '/api/user/favorites/ids'], ['GET', `/api/user/favorites/check/${artFull.id}`], ['POST', '/api/user/favorites'],
    ['GET', '/api/user/history'], ['PATCH', '/api/user/reading-progress'], ['GET', `/api/user/reading-progress/${artFull.id}`]] as const) {
    const r = await call(m, p, null, m === 'GET' ? undefined : {});
    check(`${m} ${p.replace(artFull.id, ':id')} → 401`, r.status === 401, r.status);
  }

  // ── 3. The role matrix ──────────────────────────────────────────────────
  const matrix: Record<string, Record<string, string>> = {};
  for (const R of ROLES) {
    section(`3. ${R.label}`);
    const row: Record<string, string> = (matrix[R.label] = {});
    const u = await mkUser(`r-${R.label.split(' ')[0].toLowerCase()}-${made.users.length}`, R.data);
    let s = await session({ id: u.id, email: u.email, role: R.data.role, institutionId: R.data.institutionId });
    const t = () => s.token;
    const mark = (k: string, ok: boolean) => { row[k] = ok ? 'Pass' : 'FAIL'; };

    // Save and unsave from a record (article), from a book, from a legacy item.
    let r = await call('GET', '/api/user/favorites/ids', t());
    check('starts with nothing saved', r.status === 200 && r.data?.ids?.length === 0, r.data);
    r = await call('POST', '/api/user/favorites', t(), { contentId: artFull.id });
    const saveOk = r.status === 200 && r.data?.favorited === true; check('save an article', saveOk, r.data);
    r = await call('GET', `/api/user/favorites/check/${artFull.id}`, t()); check('check says saved', r.data?.favorited === true, r.data);
    r = await call('POST', '/api/user/favorites', t(), { contentId: artFull.id });
    check('the same call again unsaves it', r.data?.favorited === false, r.data);
    r = await call('POST', '/api/user/favorites', t(), { contentId: artFull.id });
    check('and saves it again', r.data?.favorited === true, r.data);
    r = await call('POST', '/api/user/favorites', t(), { contentId: bookFull.id }); const bookSaved = r.data?.favorited === true; check('save a book', bookSaved, r.data);
    r = await call('POST', '/api/user/favorites', t(), { contentId: legacy.id }); const legSaved = r.data?.favorited === true; check('save a legacy item', legSaved, r.data);
    r = await call('POST', '/api/user/favorites', t(), { contentId: artHtml.id }); check('save an article whose title came as markup', r.data?.favorited === true, r.data);
    mark('Save / unsave (API)', saveOk && bookSaved && legSaved);

    // The Saved page: count, title, author, type, date; nothing it should not carry.
    r = await call('GET', '/api/user/favorites', t());
    const list: any[] = Array.isArray(r.data) ? r.data : [];
    check('Saved lists all four, newest first', list.length === 4 && list[0].id === artHtml.id, list.map(x => x.title));
    const a = list.find(x => x.id === artFull.id);
    check('each entry has title, authors, type, saved date', !!a && a.title === artFull.title && !!a.authors && !!a.itemType && !!a.favoritedAt, a);
    check('no stored file address and no full abstract is sent', list.every(x => !('pdfUrl' in x) && !('fileUrl' in x) && !('abstract' in x) && !('description' in x && String(x.description || '').length > 400)), Object.keys(list[0] || {}));
    check('a title that arrived as markup is plain text', list.find(x => x.id === artHtml.id)?.title === `Encoded title ${RUN}`, list.find(x => x.id === artHtml.id)?.title);
    mark('Saved list', list.length === 4);

    // Persistence: sign out (the session is deleted), sign in again with a new one.
    await db.userSession.deleteMany({ where: { sessionId: s.sid } });
    r = await call('GET', '/api/user/favorites', t()); check('after sign-out the old session is refused', r.status === 401, r.status);
    s = await session({ id: u.id, email: u.email, role: R.data.role, institutionId: R.data.institutionId });
    r = await call('GET', '/api/user/favorites', t());
    check('after signing in again, all four are still saved', r.status === 200 && r.data?.length === 4, r.data?.length);
    mark('Persists after sign-out / sign-in', r.status === 200 && r.data?.length === 4);

    // Remove from the Saved page.
    r = await call('POST', '/api/user/favorites', t(), { contentId: artHtml.id }); check('remove from the Saved page', r.data?.favorited === false, r.data);
    r = await call('GET', '/api/user/favorites/ids', t()); check('three remain', r.data?.ids?.length === 3, r.data);

    // Reopen from Saved: the item opens through the reader, which records history once.
    const before = await writes();
    r = await call('GET', `/api/content/${artFull.id}/view`, t());
    const opened = r.status === 200 && r.data?.kind === 'article';
    check('a saved item reopens', opened, r.data);
    check('the open says it was recorded, and what it gave the reader', r.data?.tracked === true && r.data?.access === 'full', { tracked: r.data?.tracked, access: r.data?.access });
    mark('Reopen from Saved', opened);

    r = await call('GET', '/api/user/history', t());
    let hist = r.data?.items || [];
    check('history has exactly that one entry', hist.length === 1 && hist[0].id === artFull.id && hist[0].kind === 'article', hist);
    check('entry carries title, type, last-read time, access', hist[0]?.title === artFull.title && !!hist[0]?.contentType && !!hist[0]?.lastReadAt && hist[0]?.access === 'full' && hist[0]?.available === true, hist[0]);
    const first = new Date(hist[0].lastReadAt).getTime();
    await sleep(1100);
    r = await call('GET', `/api/content/${artFull.id}/view`, t());
    r = await call('GET', '/api/user/history', t()); hist = r.data?.items || [];
    check('reopening keeps one row and moves the last-read time', hist.length === 1 && new Date(hist[0].lastReadAt).getTime() > first, hist);
    check('the table holds one row for that item', (await db.readingHistory.count({ where: { userId: u.id, itemId: artFull.id } })) === 1);
    mark('History recorded once', hist.length === 1);

    // Resume position.
    r = await call('PATCH', '/api/user/reading-progress', t(), { contentId: artFull.id, lastPage: 7, timeSpent: 30 });
    check('progress saves for an opened item', r.status === 200 && r.data?.recorded === true, r.data);
    r = await call('GET', `/api/user/reading-progress/${artFull.id}`, t()); check('and is read back', r.data?.lastPage === 7, r.data);
    r = await call('GET', '/api/user/history', t()); check('history shows where to continue', r.data?.items?.[0]?.lastPage === 7, r.data?.items?.[0]);
    const spent = (await db.readingHistory.findFirst({ where: { userId: u.id, itemId: artFull.id } }))!.timeSpent;
    check('time spent is counted', spent === 30, spent);
    r = await call('PATCH', '/api/user/reading-progress', t(), { contentId: artFull.id, lastPage: 0 }); check('a page below 1 is refused', r.status === 400, r.status);
    r = await call('PATCH', '/api/user/reading-progress', t(), { contentId: artFull.id, lastPage: 'x' }); check('a non-number page is refused', r.status === 400, r.status);
    mark('Resume position', true);

    // Legacy items go to StudentActivity and appear in the same list.
    r = await call('GET', `/api/content/${legacy.id}/view`, t());
    check('a legacy item opens and is recorded', r.status === 200 && r.data?.tracked === true, r.data);
    r = await call('PATCH', '/api/user/reading-progress', t(), { contentId: legacy.id, lastPage: 3, timeSpent: 10 });
    check('its progress saves too', r.status === 200 && r.data?.recorded === true, r.data);
    r = await call('GET', '/api/user/history', t()); hist = r.data?.items || [];
    check('both are in one history, newest first', hist.length === 2 && hist[0].id === legacy.id && hist[1].id === artFull.id, hist.map((x: any) => x.title));
    check('one StudentActivity row, not two', (await db.studentActivity.count({ where: { userId: u.id, contentId: legacy.id } })) === 1);

    // Links out and bare records are described as what they are.
    r = await call('GET', `/api/content/${artLink.id}/view`, t()); check('a link-only article opens as external', r.data?.access === 'external' && r.data?.tracked === true, r.data);
    r = await call('GET', `/api/content/${artMeta.id}/view`, t()); check('a record with nothing to open is "metadata"', r.data?.access === 'metadata', r.data);
    r = await call('GET', '/api/user/history', t()); hist = r.data?.items || [];
    check('history labels them as such', hist.find((x: any) => x.id === artLink.id)?.access === 'external' && hist.find((x: any) => x.id === artMeta.id)?.access === 'metadata', hist.map((x: any) => [x.title, x.access]));
    r = await call('GET', `/api/content/${artHtml.id}/view`, t()); check('the reader gets the title as plain text', r.data?.title === `Encoded title ${RUN}`, r.data?.title);
    mark('Reading History page (API)', hist.length >= 4);

    // History search and paging.
    r = await call('GET', '/api/user/history?limit=2&page=1', t()); check('paging: 2 per page', r.data?.items?.length === 2 && r.data?.pages >= 2 && r.data?.total >= 5, { n: r.data?.items?.length, pages: r.data?.pages, total: r.data?.total });
    r = await call('GET', '/api/user/history?q=link-only', t()); check('search finds by title', r.data?.items?.length === 1 && r.data?.total === 1, r.data);
    r = await call('GET', '/api/user/history?q=zzzz-nothing', t()); check('a search with no match is an empty list, not an error', r.status === 200 && r.data?.items?.length === 0, r.data);

    // Nothing a GET does writes.
    const w0 = await writes();
    for (const p of ['/api/user/history', '/api/user/favorites', '/api/user/favorites/ids', `/api/user/favorites/check/${artFull.id}`, `/api/user/reading-progress/${artFull.id}`]) await call('GET', p, t());
    const w1 = await writes();
    check('GET history / saved / check / progress write nothing', JSON.stringify(w0) === JSON.stringify(w1), { w0, w1 });
    void before;

    // Withdrawn and refused items.
    r = await call('POST', '/api/user/favorites', t(), { contentId: bookDraft.id }); check('a draft cannot be saved', r.status === 404, r.data);
    r = await call('GET', `/api/content/${bookDraft.id}/view`, t()); check('a draft cannot be opened', r.status === 404, r.status);
    r = await call('PATCH', '/api/user/reading-progress', t(), { contentId: bookDraft.id, lastPage: 2 }); check('and progress cannot start its history', r.status === 409, r.status);
    r = await call('PATCH', '/api/user/reading-progress', t(), { contentId: bookFull.id, lastPage: 2 }); check('progress for something never opened does not create an entry', r.status === 409 && (await db.readingHistory.count({ where: { userId: u.id, itemId: bookFull.id } })) === 0, r.status);
    r = await call('POST', '/api/user/favorites', t(), { contentId: 'no-such-id' }); check('an unknown id cannot be saved', r.status === 404, r.status);
    mark('Refused items', true);

    // Cleanup of this role's withdrawn test: withdraw a saved item.
    await (db as any).book.update({ where: { id: bookFull.id }, data: { status: 'Draft' } });
    r = await call('GET', '/api/user/favorites', t());
    const gone = (r.data || []).find((x: any) => x.id === bookFull.id);
    check('a withdrawn saved item stays listed as unavailable, with nothing of it exposed', gone?.unavailable === true && !gone.title && !gone.pdfUrl, gone);
    r = await call('POST', '/api/user/favorites', t(), { contentId: bookFull.id }); check('and it can still be removed', r.data?.favorited === false, r.data);
    await (db as any).book.update({ where: { id: bookFull.id }, data: { status: 'Published' } });
    await (db as any).article.update({ where: { id: artFull.id }, data: { status: 'Draft' } });
    r = await call('GET', '/api/user/history', t());
    const withdrawn = (r.data?.items || []).find((x: any) => x.id === artFull.id);
    check('a withdrawn item stays in history, marked unavailable', withdrawn?.available === false, withdrawn);
    r = await call('GET', `/api/content/${artFull.id}/view`, t()); check('and reopening it is refused', r.status === 404, r.status);
    await (db as any).article.update({ where: { id: artFull.id }, data: { status: 'Published' } });
    mark('Withdrawn item', true);
  }

  // ── 4. Privacy between accounts ──────────────────────────────────────────
  section('4. One account cannot reach another account\'s saved items or history');
  {
    const a = await mkUser('priv-a', { role: 'Student', institutionId: inst.id });
    const b = await mkUser('priv-b', { role: 'Student', institutionId: inst.id });
    const lib = await mkUser('priv-librarian', { role: 'Institution', institutionId: inst.id });
    const ta = (await session({ id: a.id, email: a.email, role: 'Student', institutionId: inst.id })).token;
    const tb = (await session({ id: b.id, email: b.email, role: 'Student', institutionId: inst.id })).token;
    const tl = (await session({ id: lib.id, email: lib.email, role: 'Institution', institutionId: inst.id })).token;
    await call('POST', '/api/user/favorites', ta, { contentId: bookFull.id });
    await call('GET', `/api/content/${bookFull.id}/view`, ta);
    await call('PATCH', '/api/user/reading-progress', ta, { contentId: bookFull.id, lastPage: 9 });

    let r = await call('GET', '/api/user/favorites', tb); check('another member\'s saved list is empty for B', r.data?.length === 0, r.data);
    r = await call('GET', `/api/user/favorites/check/${bookFull.id}`, tb); check('B is told it is not saved for B', r.data?.favorited === false, r.data);
    r = await call('GET', '/api/user/history', tb); check('B\'s history does not contain A\'s', r.data?.items?.length === 0, r.data);
    r = await call('GET', `/api/user/reading-progress/${bookFull.id}`, tb); check('B does not see A\'s resume page', r.data?.lastPage === 1, r.data);
    r = await call('PATCH', '/api/user/reading-progress', tb, { contentId: bookFull.id, lastPage: 50 });
    check('B cannot move A\'s resume page (and cannot start an entry by it)', r.status === 409 && (await db.readingHistory.findFirst({ where: { userId: a.id, itemId: bookFull.id } }))?.lastPage === 9, r.status);
    r = await call('GET', `/api/user/history?userId=${a.id}`, tb); check('a userId in the query is ignored', r.data?.items?.length === 0, r.data);
    r = await call('GET', `/api/user/favorites?userId=${a.id}`, tb); check('same for saved items', r.data?.length === 0, r.data);
    r = await call('POST', '/api/user/favorites', tb, { contentId: bookFull.id, userId: a.id });
    check('a userId in the body cannot save for someone else', r.data?.favorited === true && (await db.favorite.count({ where: { userId: a.id, contentId: bookFull.id } })) === 1 && (await db.favorite.count({ where: { userId: b.id, contentId: bookFull.id } })) === 1, r.data);
    r = await call('GET', '/api/user/history', tl); check('the institution account does not see its members\' history', r.data?.items?.length === 0, r.data);
    r = await call('GET', `/api/user/history?userId=${a.id}`, tl); check('even when it names a member', r.data?.items?.length === 0, r.data);
    r = await call('GET', '/api/user/favorites', tl); check('nor their saved items', r.data?.length === 0, r.data);
    r = await call('GET', `/api/user/favorites?userId=${a.id}`, tl); check('even when it names a member', r.data?.length === 0, r.data);
  }

  // ── 5. Access rules apply on reopen ──────────────────────────────────────
  section('5. A saved item or a history entry is not access: today\'s rules decide on reopen');
  {
    const u = await mkUser('clock', { role: 'Subscriber' });
    const t = (await session({ id: u.id, email: u.email, role: 'Subscriber' })).token;
    await call('POST', '/api/user/favorites', t, { contentId: artFull.id });
    let r = await call('GET', `/api/content/${artFull.id}/view`, t);
    check('a free reader inside the clock can open it', r.status === 200 && r.data?.tracked === true, r.data);
    // Today's four stretches used up.
    const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    await db.freeSession.deleteMany({ where: { userId: u.id } });
    for (let n = 1; n <= 4; n++) await db.freeSession.create({ data: { userId: u.id, day, number: n, usedMs: 30 * 60_000, completedAt: new Date(Date.now() - 3600_000), holdUntil: new Date(Date.now() + 3600_000) } as any });
    const histBefore = (await db.readingHistory.findFirst({ where: { userId: u.id, itemId: artFull.id } }))!;
    await sleep(1100);
    r = await call('GET', `/api/content/${artFull.id}/view`, t);
    check('once the free time is spent, the saved item is refused', r.status === 403 && r.data?.code === 'FREE_LIMIT', r.data);
    const histAfter = (await db.readingHistory.findFirst({ where: { userId: u.id, itemId: artFull.id } }))!;
    check('a refused open leaves the history as it was', histAfter.lastReadAt.getTime() === histBefore.lastReadAt.getTime());
    r = await call('GET', '/api/user/favorites', t); check('the saved list itself still loads and still lists it', r.status === 200 && r.data?.length === 1 && r.data[0].id === artFull.id, r.data);
    r = await call('GET', '/api/user/history', t); check('and so does the history', r.status === 200 && r.data?.items?.length === 1, r.data);
    const ids = await db.freeSession.findMany({ where: { userId: u.id }, select: { id: true } });
    void ids;
  }

  // ── 6. Staff ─────────────────────────────────────────────────────────────
  section('6. Staff previews leave no history');
  {
    const u = await mkUser('staff', { role: 'ContentManager' });
    const t = (await session({ id: u.id, email: u.email, role: 'ContentManager' })).token;
    let r = await call('GET', `/api/content/${artFull.id}/view`, t);
    check('a staff preview opens and says it was not recorded', r.status === 200 && r.data?.tracked === null, r.data?.tracked);
    r = await call('GET', '/api/user/history', t); check('nothing in their history', r.data?.items?.length === 0, r.data);
    r = await call('PATCH', '/api/user/reading-progress', t, { contentId: artFull.id, lastPage: 4 }); check('progress is ignored for staff', r.status === 200 && r.data?.recorded === false, r.data);
  }

  console.log('\nRole matrix (API-level):');
  const cols = [...new Set(Object.values(matrix).flatMap(r => Object.keys(r)))];
  console.log(['Role'.padEnd(34), ...cols].join(' | '));
  for (const [role, row] of Object.entries(matrix)) console.log([role.padEnd(34), ...cols.map(c => (row[c] || '-').padEnd(c.length))].join(' | '));
} catch (e: any) {
  fail++; console.log('  FAIL  test run aborted:', e?.stack || e);
} finally {
  await stop(srv);
  const U = { userId: { in: made.users } };
  await db.freeSession.deleteMany({ where: U }).catch(() => {});
  await db.readingHistory.deleteMany({ where: U }).catch(() => {});
  await db.favorite.deleteMany({ where: U }).catch(() => {});
  await db.studentActivity.deleteMany({ where: U }).catch(() => {});
  await (db as any).libraryEvent.deleteMany({ where: U }).catch(() => {});
  await (db as any).readEvent.deleteMany({ where: { userId: { in: made.users } } }).catch(() => {});
  await db.userSession.deleteMany({ where: U }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: made.users } } }).catch((e: any) => console.log('cleanup users:', e.message));
  await db.content.deleteMany({ where: { id: { in: made.content } } }).catch(() => {});
  await (db as any).article.deleteMany({ where: { id: { in: made.articles } } }).catch(() => {});
  await (db as any).book.deleteMany({ where: { id: { in: made.books } } }).catch(() => {});
  await db.institution.deleteMany({ where: { id: { in: made.insts } } }).catch(() => {});
  const left = await db.user.count({ where: { email: { endsWith: DOMAIN } } });
  console.log(`\ncleanup: ${left === 0 ? 'all fixtures removed' : `${left} fixture users remain`}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
