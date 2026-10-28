/**
 * What the public site counts as a journal (status Accepted or MetadataOnly, with or without a published article), and that the admin and public
 * figures are two different, explicit things.
 *
 *   npx tsx scripts/test-public-journals.ts
 *
 * A real server on the throwaway database `stm_ingestion_test`. Each check compares figures before and after rows this run creates, so it does not
 * depend on what the database already holds. Every outbound request is blocked.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const PORT = 3112, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const DEPT = 'Law';
const created = { journals: [] as string[], articles: [] as string[], users: [] as string[] };

const mkJournal = async (tag: string, status: string) => {
  const j = await db.journal.create({ data: { title: `PJ ${RUN} ${tag}`, issn: `pj-${RUN}-${tag}`, status, domain: DEPT, publisherName: `PJ Publisher ${RUN}` } as any });
  created.journals.push(j.id); return j;
};
const mkArticle = async (journalId: string, status: string, n = 1) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) { const a = await db.article.create({ data: { title: `PJ article ${RUN} ${journalId.slice(0, 4)} ${i}`, journalId, domain: DEPT, status } as any }); created.articles.push(a.id); ids.push(a.id); }
  return ids;
};

type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199', API_TEST_BLOCK_DELAY_MS: '50', DISABLE_HMR: 'true',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(600); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const get = async (path: string, token?: string) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
};

let srv: Srv | null = null;
try {
  const admin = await db.user.create({ data: { email: `pj-admin-${RUN}@pj-test.invalid`, password: 'x', role: 'SuperAdmin', displayName: 'pj admin' } as any });
  created.users.push(admin.id);
  const sid = `sid-pj-${RUN}`;
  await db.userSession.create({ data: { userId: admin.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  const adminTok = jwt.sign({ uid: admin.id, sid, role: 'SuperAdmin', email: admin.email }, SECRET, { expiresIn: '1h' });
  const sub = await db.user.create({ data: { email: `pj-sub-${RUN}@pj-test.invalid`, password: 'x', role: 'Subscriber', displayName: 'pj subscriber' } as any });
  created.users.push(sub.id);
  const sid2 = `sid-pj2-${RUN}`;
  await db.userSession.create({ data: { userId: sub.id, sessionId: sid2, expiresAt: new Date(Date.now() + 3600_000) } });
  const subTok = jwt.sign({ uid: sub.id, sid: sid2, role: 'Subscriber', email: sub.email }, SECRET, { expiresIn: '1h' });
  srv = await start();

  const headline = async () => (await get('/api/public/content-type-counts')).data?.Journals as number;
  const deptCount = async () => ((await get(`/api/domain-data?domain=${encodeURIComponent(DEPT)}`)).data?.content_summary || []).find((c: any) => c.type === 'Journals')?.count ?? 0;
  // The list is paged (src/lib/journalPaging.ts): walk every page, so these checks still see the whole department.
  const deptList = async () => {
    const all: any[] = [];
    for (let page = 1; page < 200; page++) {
      const d = (await get(`/api/library/department/${DEPT.toLowerCase()}?limit=200&page=${page}`)).data;
      all.push(...(d?.journals || [])); if (!d?.hasMore) break;
    }
    return all;
  };
  const filterList = async () => ((await get(`/api/library/journals?domain=${encodeURIComponent(DEPT)}`)).data || []) as any[];
  const adminFigures = async (q = '') => (await get(`/api/admin/journals?limit=200&q=${encodeURIComponent(q)}`, adminTok)).data;

  const h0 = await headline(), d0 = await deptCount(), a0 = await adminFigures();

  section('Seeding: nine journals that differ only in what decides whether the public sees them');
  const j1 = await mkJournal('accepted-two-articles', 'Accepted'); await mkArticle(j1.id, 'Published', 2);
  const j2 = await mkJournal('metadata-only', 'MetadataOnly'); const [a2] = await mkArticle(j2.id, 'Published');
  const j3 = await mkJournal('pending-review', 'NeedsReview'); await mkArticle(j3.id, 'Published');
  const j4 = await mkJournal('rejected', 'Rejected'); await mkArticle(j4.id, 'Published');
  const j5 = await mkJournal('accepted-no-articles', 'Accepted');
  const j6 = await mkJournal('accepted-draft-only', 'Accepted'); const [draftArticle] = await mkArticle(j6.id, 'Draft');
  const j7 = await mkJournal('unknown-status', 'SomethingNew'); await mkArticle(j7.id, 'Published');
  const j8 = await mkJournal('metadata-only-no-articles', 'MetadataOnly');
  const j9 = await mkJournal('draft', 'Draft');
  void draftArticle;
  // a long abstract, to prove the full text never travels on the public routes
  await db.article.update({ where: { id: a2 }, data: { abstract: 'FULLTEXT-MARKER ' + 'lorem ipsum '.repeat(120) } });

  section('The public figure');
  {
    const h1 = await headline();
    check('Public total rose by exactly 5: Accepted + articles, MetadataOnly + articles, Accepted + none, Accepted + only a draft, MetadataOnly + none', h1 - h0 === 5, [h0, h1]);
    const list = new Set((await deptList()).map((j: any) => j.id));
    check('Accepted with articles is listed', list.has(j1.id));
    check('MetadataOnly with an article is listed', list.has(j2.id));
    check('Accepted with ZERO articles is listed', list.has(j5.id));
    check('MetadataOnly with ZERO articles is listed', list.has(j8.id));
    check('Accepted with only a Draft article is listed (a draft is not a published article)', list.has(j6.id));
    check('NeedsReview is hidden, even with a published article', !list.has(j3.id));
    check('Rejected is hidden', !list.has(j4.id));
    check('Draft is hidden', !list.has(j9.id));
    check('a status nobody defined is hidden', !list.has(j7.id));
    const row = (await deptList()).find((j: any) => j.id === j5.id);
    check('a zero-article journal reports articleCount 0 (the page then says "No published articles available yet")', row?.articleCount === 0, row);
    const d1 = await deptCount();
    check('the department figure rose by the same 5, by the same rule', d1 - d0 === 5, [d0, d1]);
    const filter = new Set((await filterList()).map((j: any) => j.id));
    check('the ARTICLE-SEARCH filter is unchanged: it lists only journals that hold a published article (picking an empty one returns nothing)', filter.has(j1.id) && filter.has(j2.id) && !filter.has(j5.id) && !filter.has(j8.id) && !filter.has(j3.id));
    const pubPage = (await get(`/api/library/publisher/pj-publisher-${RUN}`)).data;
    check('the publisher page lists the same five public journals', (pubPage?.journals || []).length === 5 && !(pubPage.journals).some((j: any) => [j3.id, j4.id, j7.id, j9.id].includes(j.id)), pubPage?.journals?.length);
    check('and orders those that hold articles before those that hold none', (pubPage?.journals || []).slice(0, 2).every((j: any) => j.articleCount > 0) && (pubPage?.journals || []).slice(2).every((j: any) => j.articleCount === 0));
  }

  section('Journal detail');
  {
    const d5 = await get(`/api/library/journal/${j5.id}`);
    check('a zero-article journal opens (200), with no articles, volumes or recent items', d5.status === 200 && d5.data?.articleCount === 0 && d5.data?.volumes?.length === 0 && d5.data?.recent?.length === 0, d5.status);
    const d8 = await get(`/api/library/journal/${j8.id}`);
    check('a MetadataOnly journal with zero articles opens', d8.status === 200 && d8.data?.articleCount === 0);
    const d6 = await get(`/api/library/journal/${j6.id}`);
    check('a journal with only a draft article opens, and the draft is not counted or shown', d6.status === 200 && d6.data?.articleCount === 0 && d6.data?.recent?.length === 0);
    const d1 = await get(`/api/library/journal/${j1.id}`);
    check('an Accepted journal with articles still opens with its real count', d1.status === 200 && d1.data?.articleCount === 2);
    check('NeedsReview is not found', (await get(`/api/library/journal/${j3.id}`)).status === 404);
    check('Rejected is not found', (await get(`/api/library/journal/${j4.id}`)).status === 404);
    check('Draft is not found', (await get(`/api/library/journal/${j9.id}`)).status === 404);
    check('a status nobody defined is not found', (await get(`/api/library/journal/${j7.id}`)).status === 404);
    check('the volume route follows the same rule', (await get(`/api/library/journal/${j3.id}/volume/1`)).status === 404 && (await get(`/api/library/journal/${j5.id}/volume/1`)).status === 200);
  }

  section('Full text and access rules are unchanged');
  {
    const art = await get(`/api/library/article/${a2}`);
    check('an article of a public journal still carries only a capped preview, never the full abstract', art.status === 200 && !('abstract' in (art.data || {})) && !/FULLTEXT-MARKER[\s\S]{450}/.test(art.text) && (art.data?.abstractPreview || '').length <= 400, art.text.length);
    check('the document routes still need a login', (await get(`/api/content/${a2}/proxy-pdf`)).status === 401 && (await get(`/api/content/${a2}/view`)).status === 401);
    const sd = await get(`/api/library/journal/${j5.id}`, subTok);
    check('a signed-in member whose plan covers no department still gets 403 on a zero-article journal', sd.status === 403, sd.status);
    check('...and 403 on an article in that department', (await get(`/api/library/article/${a2}`, subTok)).status === 403);
  }

  section('The admin figure is a different, explicit thing');
  {
    const a1 = await adminFigures();
    check('admin "records in database" rose by all nine rows', a1.catalogue - a0.catalogue === 9, [a0.catalogue, a1.catalogue]);
    check('admin also reports the public figure, and it equals the public site\'s', a1.publicTitles === (await headline()), [a1.publicTitles, await headline()]);
    check('the two are not the same number', a1.catalogue !== a1.publicTitles);
    check('the admin public figure rose by the 5 public journals, the records figure by all 9', a1.publicTitles - a0.publicTitles === 5 && a1.catalogue - a0.catalogue === 9);
    const mine = await adminFigures(`PJ ${RUN}`);
    check('"with published articles" is read from the articles (the counter is 0 on every one of these)', mine.total === 9 && mine.withArticles === 5 && mine.journals.every((j: any) => j.articleCount === 0), [mine.total, mine.withArticles]);
    const without = (await get(`/api/admin/journals?limit=200&q=${encodeURIComponent('PJ ' + RUN)}&articles=without`, adminTok)).data;
    const withIt = (await get(`/api/admin/journals?limit=200&q=${encodeURIComponent('PJ ' + RUN)}&articles=with`, adminTok)).data;
    check('"has articles" and "no articles yet" split the nine 5 / 4', withIt.total === 5 && without.total === 4, [withIt.total, without.total]);
    check('the Articles column shows the real number of published articles', mine.journals.find((j: any) => j.id === j1.id)?.publishedArticles === 2 && mine.journals.find((j: any) => j.id === j6.id)?.publishedArticles === 0);
    check('no internal review or rejected count is in the PUBLIC response', !JSON.stringify((await get('/api/public/content-type-counts')).data).match(/review|reject/i));
  }

  section('Only the status moves the public figure, never the articles');
  {
    const before = await headline(), deptBefore = await deptCount();
    await db.article.updateMany({ where: { journalId: j1.id }, data: { status: 'Draft' } });
    check('unpublishing every article of a journal does NOT remove it: the count is unchanged', (await headline()) === before && (await deptCount()) === deptBefore);
    const row = (await deptList()).find((j: any) => j.id === j1.id);
    check('it stays on the department page, now holding none', row?.articleCount === 0);
    await db.article.updateMany({ where: { journalId: j1.id }, data: { status: 'Published' } });
    check('publishing them again changes nothing in the count', (await headline()) === before);
    await db.journal.update({ where: { id: j3.id }, data: { status: 'Accepted' } });
    check('approving the pending-review journal raises the public count by 1', (await headline()) === before + 1 && (await deptCount()) === deptBefore + 1);
    check('and it joins the department page', (await deptList()).some((j: any) => j.id === j3.id));
    await db.journal.update({ where: { id: j2.id }, data: { status: 'Rejected' } });
    check('rejecting a public journal lowers it by 1', (await headline()) === before);
    await db.journal.update({ where: { id: j5.id }, data: { status: 'NeedsReview' } });
    check('sending a zero-article journal back to review hides it', (await headline()) === before - 1 && (await get(`/api/library/journal/${j5.id}`)).status === 404);
  }

  section('The public count matches the query');
  {
    const q = Number((await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "Journal" where status in ('Accepted','MetadataOnly')`))[0].n);
    check('headline = count of Accepted + MetadataOnly rows, whatever else the database holds', (await headline()) === q, [await headline(), q]);
    check('and the admin public-titles figure agrees', (await adminFigures()).publicTitles === q);
  }
} finally {
  await stop(srv);
  await db.userSession.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.article.deleteMany({ where: { id: { in: created.articles } } }).catch(() => {});
  await db.journal.deleteMany({ where: { id: { in: created.journals } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
