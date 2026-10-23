/**
 * What the public site counts as a journal, and that the admin and public figures are two different, explicit things.
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
  srv = await start();

  const headline = async () => (await get('/api/public/content-type-counts')).data?.Journals as number;
  const deptCount = async () => ((await get(`/api/domain-data?domain=${encodeURIComponent(DEPT)}`)).data?.content_summary || []).find((c: any) => c.type === 'Journals')?.count ?? 0;
  const deptList = async () => ((await get(`/api/library/department/${DEPT.toLowerCase()}`)).data?.journals || []) as any[];
  const filterList = async () => ((await get(`/api/library/journals?domain=${encodeURIComponent(DEPT)}`)).data || []) as any[];
  const adminFigures = async (q = '') => (await get(`/api/admin/journals?limit=200&q=${encodeURIComponent(q)}`, adminTok)).data;

  const h0 = await headline(), d0 = await deptCount(), a0 = await adminFigures();

  section('Seeding: seven journals that differ only in what decides whether the public sees them');
  const j1 = await mkJournal('accepted-two-articles', 'Accepted'); await mkArticle(j1.id, 'Published', 2);
  const j2 = await mkJournal('metadata-only', 'MetadataOnly'); await mkArticle(j2.id, 'Published');
  const j3 = await mkJournal('pending-review', 'NeedsReview'); await mkArticle(j3.id, 'Published');
  const j4 = await mkJournal('rejected', 'Rejected'); await mkArticle(j4.id, 'Published');
  const j5 = await mkJournal('accepted-no-articles', 'Accepted');
  const j6 = await mkJournal('accepted-draft-only', 'Accepted'); const [draftArticle] = await mkArticle(j6.id, 'Draft');
  const j7 = await mkJournal('unknown-status', 'SomethingNew'); await mkArticle(j7.id, 'Published');
  void j5; void draftArticle;

  section('The public figure');
  {
    const h1 = await headline();
    check('Public total rose by exactly 2: the Accepted and the MetadataOnly journal that hold a published article', h1 - h0 === 2, [h0, h1]);
    const ids = new Set((await filterList()).map((j: any) => j.id));
    check('the journal filter lists the Accepted and MetadataOnly journals', ids.has(j1.id) && ids.has(j2.id));
    check('a pending-review journal is not public, even with a published article', !ids.has(j3.id));
    check('a rejected journal is not public', !ids.has(j4.id));
    check('a journal with a status nobody defined is not public', !ids.has(j7.id));
    check('an Accepted journal with no article, or only a draft, is not public', !ids.has(j5.id) && !ids.has(j6.id));
    const list = new Set((await deptList()).map((j: any) => j.id));
    check('the department page lists exactly the same journals', list.has(j1.id) && list.has(j2.id) && !list.has(j3.id) && !list.has(j4.id) && !list.has(j7.id) && !list.has(j5.id) && !list.has(j6.id));
    const d1 = await deptCount();
    check('the department figure rose by the same 2, by the same rule', d1 - d0 === 2, [d0, d1]);
    check('the library filter, the department page and the headline agree on these seven', [j1, j2].every(j => ids.has(j.id) && list.has(j.id)));
  }

  section('The admin figure is a different, explicit thing');
  {
    const a1 = await adminFigures();
    check('admin "records in database" rose by all seven rows', a1.catalogue - a0.catalogue === 7, [a0.catalogue, a1.catalogue]);
    check('admin also reports the public figure, and it equals the public site\'s', a1.publicTitles === (await headline()), [a1.publicTitles, await headline()]);
    check('the two are not the same number', a1.catalogue !== a1.publicTitles);
    const mine = await adminFigures(`PJ ${RUN}`);
    check('"with published articles" is read from the articles (the counter is 0 on every one of these)', mine.total === 7 && mine.withArticles === 5 && mine.journals.every((j: any) => j.articleCount === 0), [mine.total, mine.withArticles]);
    const without = (await get(`/api/admin/journals?limit=200&q=${encodeURIComponent('PJ ' + RUN)}&articles=without`, adminTok)).data;
    const withIt = (await get(`/api/admin/journals?limit=200&q=${encodeURIComponent('PJ ' + RUN)}&articles=with`, adminTok)).data;
    check('"has articles" and "no articles yet" split the seven 5 / 2', withIt.total === 5 && without.total === 2, [withIt.total, without.total]);
    check('the Articles column shows the real number of published articles', mine.journals.find((j: any) => j.id === j1.id)?.publishedArticles === 2 && mine.journals.find((j: any) => j.id === j6.id)?.publishedArticles === 0);
    check('no internal review or rejected count is in the PUBLIC response', !JSON.stringify((await get('/api/public/content-type-counts')).data).match(/review|reject/i));
  }

  section('Unpublishing and approving move the public figure');
  {
    const before = await headline(), deptBefore = await deptCount();
    await db.article.updateMany({ where: { journalId: j1.id }, data: { status: 'Draft' } });
    check('unpublishing the journal\'s articles lowers the public count by 1', (await headline()) === before - 1 && (await deptCount()) === deptBefore - 1);
    check('and it leaves the department page and the filter', !(await deptList()).some((j: any) => j.id === j1.id) && !(await filterList()).some((j: any) => j.id === j1.id));
    await db.article.updateMany({ where: { journalId: j1.id }, data: { status: 'Published' } });
    check('publishing them again restores it', (await headline()) === before);
    await db.journal.update({ where: { id: j3.id }, data: { status: 'Accepted' } });
    check('approving the pending-review journal raises the public count by 1', (await headline()) === before + 1 && (await deptCount()) === deptBefore + 1);
    check('and it joins the department page', (await deptList()).some((j: any) => j.id === j3.id));
    await db.journal.update({ where: { id: j2.id }, data: { status: 'Rejected' } });
    check('rejecting a public journal lowers it by 1', (await headline()) === before);
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
