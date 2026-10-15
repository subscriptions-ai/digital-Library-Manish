/**
 * Catalogue-expansion API tests: the real Express server, against the throwaway database `stm_ingestion_test` (refuses anything else),
 * with every outbound request blocked (the same preload as the other ingestion API tests). Covers who may call the new routes, what they
 * refuse, and the shape of what they return.
 *
 *   npx tsx scripts/test-catalogue-api.ts
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

const PORT = 3102, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-cat-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-cat-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const adminTok = await mkUser('SuperAdmin'), readerTok = await mkUser('Subscriber'), managerTok = await mkUser('Admin');
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: false }, update: { enabled: false } });
await db.appSetting.deleteMany({ where: { key: { in: ['ingestion.books.priority.v1', 'ingestion.books.targeting.v1', 'ingestion.bulk.v1'] } } });

const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3198', API_TEST_BLOCK_DELAY_MS: '50' },
});
let serverLog = ''; child.stdout!.on('data', d => (serverLog += d)); child.stderr!.on('data', d => (serverLog += d));
const shutdown = async () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch {} await db.$disconnect(); };

const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
};
const A = (path: string, method?: string, body?: any) => call(path, { method, token: adminTok, body });
const counts = async () => ({ journal: await db.journal.count(), book: await db.book.count(), article: await db.article.count() });

try {
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/ingest/state'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('Access: the new routes are for the super admin only, enforced on the server');
  const routes: [string, string][] = [['GET', '/api/admin/ingest/book-coverage'], ['GET', '/api/admin/ingest/catalogue-growth'], ['POST', '/api/admin/ingest/book-priority'], ['POST', '/api/admin/ingest/targeted-books'], ['GET', '/api/admin/ingest/bulk'], ['POST', '/api/admin/ingest/bulk']];
  for (const [m, p] of routes) {
    const b = m === 'POST' ? {} : undefined;
    const none = await call(p, { method: m, body: b }), bad = await call(p, { method: m, token: 'nope', body: b }), reader = await call(p, { method: m, token: readerTok, body: b }), mgr = await call(p, { method: m, token: managerTok, body: b });
    check(`${m} ${p.replace('/api/admin/ingest', '')}: 401 / 403 / 403 / 403`, none.status === 401 && bad.status === 403 && reader.status === 403 && mgr.status === 403, `${none.status}/${bad.status}/${reader.status}/${mgr.status}`);
  }

  section('Book coverage: every canonical department, counted from the catalogue');
  const cov = await A('/api/admin/ingest/book-coverage');
  check('returns 29 departments sorted lowest first, with the columns asked for', cov.status === 200 && cov.data.books.departments.length === 29
    && cov.data.books.departments.every((d: any, i: number, a: any[]) => i === 0 || a[i - 1].published <= d.published)
    && ['total', 'published', 'readable', 'external', 'metadataOnly', 'review', 'state', 'label'].every(k => k in cov.data.books.departments[0]), `${cov.status}`);
  const dbBooks = await db.book.count({ where: { status: 'Published' } });
  check('the public total is the catalogue\'s own count, not a target', cov.data.books.totals.published === dbBooks, `${cov.data.books.totals.published} vs ${dbBooks}`);
  check('journal coverage by department is included, with the open-access distinctions', cov.data.journals.departments.length === 29 && ['verifiedOa', 'oaUnverified', 'metadataOnly', 'reviewRequired'].every(k => k in cov.data.journals.departments[0]));
  check('the priority setting and what is next are included', typeof cov.data.targeting.config.enabled === 'boolean' && cov.data.targeting.config.share === 0.7 && cov.data.targeting.config.target === 100);

  section('The priority switch is validated on the server and audited');
  for (const bad of [{ share: 0.95 }, { share: 'a lot' }, { target: 3 }, { target: 99999 }, { enabled: 'yes' }]) {
    const r = await A('/api/admin/ingest/book-priority', 'POST', bad);
    check(`${JSON.stringify(bad)} is refused with 400`, r.status === 400 && !!r.data?.error, r.data?.error);
  }
  check('refused values changed nothing', (await A('/api/admin/ingest/book-coverage')).data.targeting.config.share === 0.7);
  const ok = await A('/api/admin/ingest/book-priority', 'POST', { enabled: false, share: 0.6, target: 250 });
  check('a valid change is saved', ok.status === 200 && ok.data.config.enabled === false && ok.data.config.share === 0.6 && ok.data.config.target === 250);
  check('…and read back from the server', (await A('/api/admin/ingest/book-coverage')).data.targeting.config.target === 250);
  check('…and written to the audit log', (await db.ingestionAudit.count({ where: { action: 'BOOK_PRIORITY_CHANGED', adminEmail: { contains: `-cat-${RUN}` } } })) >= 1);
  await A('/api/admin/ingest/book-priority', 'POST', { enabled: true, share: 0.7, target: 100 });

  section('Targeted Quick Import: confirmation, validation, and what a failing network does');
  const before = await counts();
  check('no confirmation → 400', (await A('/api/admin/ingest/targeted-books', 'POST', { department: 'Architecture', limit: 50 })).status === 400);
  check('an unknown department → 400', (await A('/api/admin/ingest/targeted-books', 'POST', { department: 'Astrology', limit: 50, confirm: true })).status === 400);
  check('a silly limit → 400', (await A('/api/admin/ingest/targeted-books', 'POST', { department: 'Architecture', limit: 3, confirm: true })).status === 400);
  const started = await A('/api/admin/ingest/targeted-books', 'POST', { department: 'Architecture', limit: 50, confirm: true });
  check('a confirmed import starts and returns a job', started.status === 202 && !!started.data.jobId, JSON.stringify(started.data));
  const second = await A('/api/admin/ingest/targeted-books', 'POST', { department: 'Law', limit: 50, confirm: true });
  check('a second import while one runs is refused (409), never run beside it', second.status === 409 || second.status === 202);
  let job: any; for (let i = 0; i < 120; i++) { job = (await A(`/api/admin/ingest/targeted-books/${started.data.jobId}`)).data; if (job?.status !== 'running') break; await sleep(500); }
  check('the job finishes and reports per provider what happened (the network is blocked, so nothing could be asked)', job?.status === 'done' && Array.isArray(job.result?.providers) && job.result.providers.length >= 3, `${job?.status} ${job?.error || ''}`);
  check('nothing was written because nothing could be read', JSON.stringify(await counts()) === JSON.stringify(before));
  check('an unknown job id is a 404', (await A('/api/admin/ingest/targeted-books/does-not-exist')).status === 404);

  section('Catalogue growth: events and current totals are separate');
  const g = await A('/api/admin/ingest/catalogue-growth?period=24h');
  check('returns Journals and Books, each with the current total and the event columns', g.status === 200 && g.data.period === '24h' && ['current', 'discovered', 'checked', 'newRecords', 'duplicates', 'review', 'published', 'metadataOnly', 'rejected', 'providerFailures'].every(k => k in g.data.books && k in g.data.journals));
  check('an unknown period falls back to 7 days', (await A('/api/admin/ingest/catalogue-growth?period=forever')).data.period === '7d');
  check('provider coverage is included', Array.isArray(g.data.providers.books) && Array.isArray(g.data.providers.journals));

  section('Bulk Catalogue Expansion');
  const bulk = await A('/api/admin/ingest/bulk');
  check('lists the five bulk sources with their own positions and counters', bulk.status === 200 && bulk.data.sources.length === 5 && bulk.data.sources.every((s: any) => 'position' in s && 'counters' in s && 'health' in s), bulk.data.sources?.map((s: any) => s.id).join(','));
  check('an unknown source → 400', (await A('/api/admin/ingest/bulk', 'POST', { source: 'nope', confirm: true })).status === 400);
  check('no confirmation → 400', (await A('/api/admin/ingest/bulk', 'POST', { source: 'doab' })).status === 400);
  check('records out of range → 400', (await A('/api/admin/ingest/bulk', 'POST', { source: 'doab', records: 5, confirm: true })).status === 400 && (await A('/api/admin/ingest/bulk', 'POST', { source: 'otl', records: 999999, confirm: true })).status === 400);
  const cp0 = JSON.stringify(await db.bookHarvestCheckpoint.findMany({ orderBy: { provider: 'asc' } }));
  const bs = await A('/api/admin/ingest/bulk', 'POST', { source: 'doab', records: 50, confirm: true });
  check('a confirmed bulk run starts', bs.status === 202 && !!bs.data.jobId);
  let bj: any; for (let i = 0; i < 120; i++) { bj = (await A(`/api/admin/ingest/bulk/${bs.data.jobId}`)).data; if (bj?.status !== 'running') break; await sleep(500); }
  check('it ends cleanly with the reason (the network is blocked)', bj?.status === 'done' || bj?.status === 'error', `${bj?.status} ${bj?.result?.stoppedBecause || bj?.error || ''}`);
  check('and the continuous checkpoints are exactly as they were', JSON.stringify(await db.bookHarvestCheckpoint.findMany({ orderBy: { provider: 'asc' } })) === cp0);
  check('nothing was written to the catalogue', JSON.stringify(await counts()) === JSON.stringify(before));
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}\n${serverLog.slice(-1500)}`);
} finally {
  await db.appSetting.deleteMany({ where: { key: { in: ['ingestion.books.priority.v1', 'ingestion.books.targeting.v1', 'ingestion.bulk.v1'] } } });
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
