/**
 * Quick Import over HTTP: the real Express server against the throwaway database `stm_ingestion_test`, with all outbound
 * network blocked and three sources faked (see the preload). Refuses to run against anything else.
 *
 *   npx tsx scripts/test-quick-import-api.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const dbName = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const PORT = 3102, FILE_PORT = 3198, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const files = http.createServer((req, res) => { if (req.url?.startsWith('/ok.pdf')) { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end('%PDF-1.4 test'); } else { res.writeHead(404); res.end('no'); } }).listen(FILE_PORT, '127.0.0.1');

const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-${RUN}@qi-test.invalid`, password: 'x', role } });
  const sid = `sid-qi-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const adminTok = await mkUser('SuperAdmin'), readerTok = await mkUser('Subscriber'), managerTok = await mkUser('Admin');
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: false }, update: { enabled: false, focus: 'auto', departments: [] } });
await db.ingestionSourceHealth.deleteMany({});

const child = spawn('npx', ['tsx', '--import', new URL('./test-quick-import-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', QI_RUN: RUN, QI_SLOW_MS: '900', QI_FILE_PORT: String(FILE_PORT), QUICK_IMPORT_LIMIT_EUROPEPMC: '12' },
});
let serverLog = ''; child.stdout!.on('data', d => (serverLog += d)); child.stderr!.on('data', d => (serverLog += d));
const shutdown = async () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch {} files.close(); await db.$disconnect(); };

const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
};
const A = (path: string, method?: string, body?: any) => call(path, { method, token: adminTok, body });
const waitQuick = async (id: string, ms = 90_000) => { const t0 = Date.now(); for (;;) { const r = await A(`/api/admin/ingest/quick/${id}`); if (r.data?.status !== 'running' || Date.now() - t0 > ms) return r; await sleep(300); } };
const waitJob = async (id: string, ms = 90_000) => { const t0 = Date.now(); for (;;) { const r = await A(`/api/admin/ingest/status/${id}`); if (r.data?.status !== 'running' || Date.now() - t0 > ms) return r; await sleep(300); } };

try {
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/ingest/state'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('Access: the new routes are for the super admin only');
  for (const [m, p] of [['GET', '/api/admin/ingest/sources'], ['POST', '/api/admin/ingest/quick'], ['GET', '/api/admin/ingest/quick/x']] as const) {
    const none = await call(p, { method: m, body: m === 'POST' ? {} : undefined });
    const bad = await call(p, { method: m, token: 'not-a-token', body: m === 'POST' ? {} : undefined });
    const reader = await call(p, { method: m, token: readerTok, body: m === 'POST' ? {} : undefined });
    const mgr = await call(p, { method: m, token: managerTok, body: m === 'POST' ? {} : undefined });
    check(`${m} ${p.replace('/api/admin/ingest', '')}: 401 / 403 / 403 / 403`, none.status === 401 && bad.status === 403 && reader.status === 403 && mgr.status === 403, `${none.status}/${bad.status}/${reader.status}/${mgr.status}`);
  }

  section('The source cards');
  const src = await A('/api/admin/ingest/sources');
  const cards: any[] = src.data?.sources || [];
  check('twelve sources, grouped Journals / Articles / Books, in the approved order', src.status === 200 && cards.map(c => c.id).join() === 'doaj,road,crossrefjournals,openalexsources,crossref,openalex,europepmc,arxiv,doab,oapen,otl,ncbi' && cards.map(c => c.group).join() === 'Journals,Journals,Journals,Journals,Articles,Articles,Articles,Articles,Books,Books,Books,Books');
  check('each carries its description, limit, confirmation and health', cards.every(c => c.description && c.limit > 0 && c.confirm && ['healthy', 'degraded', 'running', 'cooling', 'rate_limited', 'unavailable', 'not_connected'].includes(c.state)));
  check('the limit override reaches the card (Europe PMC = 12)', cards.find(c => c.id === 'europepmc').limit === 12);

  section('Starting one: validated, confirmed, bounded');
  check('an unknown source is refused', (await A('/api/admin/ingest/quick', 'POST', { provider: 'nowhere', confirm: true })).status === 400);
  const noConfirm = await A('/api/admin/ingest/quick', 'POST', { provider: 'europepmc' });
  check('without confirmation nothing starts (the server does not take a click for an answer)', noConfirm.status === 400 && /Confirmation is required/.test(noConfirm.data?.error), noConfirm.data?.error);
  check('…and nothing is running', ((await A('/api/admin/ingest/jobs/active')).data.quick || []).length === 0);

  const before = await db.article.count();
  const a = await A('/api/admin/ingest/quick', 'POST', { provider: 'europepmc', confirm: true });
  const b = await A('/api/admin/ingest/quick', 'POST', { provider: 'europepmc', confirm: true });
  check('start → 202 with a job id and its bound', a.status === 202 && !!a.data.jobId && a.data.limit === 12, JSON.stringify(a.data));
  check('a second click while it runs → 409, one run only', b.status === 409 && b.data.code === 'BUSY' && /already running/.test(b.data.error), JSON.stringify(b.data));
  const other = await A('/api/admin/ingest/quick', 'POST', { provider: 'arxiv', confirm: true });
  check('another articles source is refused while it runs', other.status === 409 && /Europe PMC Quick Import is running/.test(other.data?.error || ''), other.data?.error);
  const act = await A('/api/admin/ingest/jobs/active');
  check('a refreshed page can find the running job', (act.data.quick || []).some((j: any) => j.jobId === a.data.jobId));
  const card = (await A('/api/admin/ingest/sources')).data.sources.find((c: any) => c.id === 'europepmc');
  check('its card shows Running and Quick Import disabled', card.state === 'running' || card.runningJobId === a.data.jobId, card.state);

  const fin = await waitQuick(a.data.jobId);
  check('it finishes with a result', fin.data?.status === 'done' && !!fin.data.result, JSON.stringify(fin.data?.error));
  const r = fin.data.result;
  check('BOUNDED: no more than 12 examined (the source offered 24)', r.checked <= 12 && r.checked > 0, `checked ${r.checked}`);
  check('records were added, and the numbers add up', r.added > 0 && (await db.article.count()) === before + r.added + r.needsReview, JSON.stringify(r));
  const hist = await A('/api/admin/ingest/history?result=all&limit=5');
  check('Run activity has it, marked Manual', (hist.data.runs || []).some((x: any) => x.source === 'Europe PMC' && /^Manual · Quick Import · /.test(x.note || '')));
  const st = await A('/api/admin/ingest/state');
  check('the engine is still paused and untouched', st.data.enabled === false);
  const audit = await A('/api/admin/ingest/audit?limit=50');
  check('audit records who started it', (audit.data.events || []).some((e: any) => e.action === 'QUICK_IMPORT_STARTED' && e.adminEmail?.includes(RUN)) && (audit.data.events || []).some((e: any) => e.action === 'QUICK_IMPORT_FINISHED'));

  section('Unavailable and rate limited');
  const down = await A('/api/admin/ingest/quick', 'POST', { provider: 'crossref', confirm: true });
  const dj = down.status === 202 ? await waitQuick(down.data.jobId) : down;
  check('a source that is down says so, and nothing was changed', dj.data?.status === 'error' && dj.data.error?.message === 'Source unavailable right now. No catalogue changes were made.', JSON.stringify(dj.data?.error || dj.data));
  await db.ingestionSourceHealth.upsert({ where: { source: 'OpenAlex' }, create: { source: 'OpenAlex', consecutiveFailures: 5, pausedUntil: new Date(Date.now() + 20 * 60_000), lastError: 'OpenAlex answered HTTP 429' }, update: { consecutiveFailures: 5, pausedUntil: new Date(Date.now() + 20 * 60_000), lastError: 'OpenAlex answered HTTP 429' } });
  const rl = await A('/api/admin/ingest/quick', 'POST', { provider: 'openalex', confirm: true });
  check('a rate-limited source → 429 with the time it is back', rl.status === 429 && rl.data.code === 'RATE_LIMITED' && /^Source is temporarily rate limited\. Try again after /.test(rl.data.error) && !!rl.data.until, JSON.stringify(rl.data));
  const cardRl = (await A('/api/admin/ingest/sources')).data.sources.find((c: any) => c.id === 'openalex');
  check('its card says Rate limited and Quick Import is off', cardRl.state === 'rate_limited' && cardRl.canQuickImport === false && !!cardRl.until);
  const dry = await A('/api/admin/ingest/dry-run', 'POST', { source: 'openalex', departments: ['Law'], perDept: 5 });
  check('the advanced path is not allowed to bypass the cooldown either', dry.status === 429 && dry.data.code === 'RATE_LIMITED', JSON.stringify(dry.data));
  await db.ingestionSourceHealth.deleteMany({});

  section('Advanced import of journals (DOAJ): check, then import exactly what was found');
  check('an unknown source is refused', (await A('/api/admin/ingest/dry-run', 'POST', { source: 'nowhere', departments: [] })).status === 400);
  check('a limit outside the bound is refused', (await A('/api/admin/ingest/dry-run', 'POST', { source: 'doaj-journals', departments: [], perDept: 0 })).status === 400);
  const jb = await db.journal.count();
  const d = await A('/api/admin/ingest/dry-run', 'POST', { source: 'doaj-journals', departments: ['Nursing'], perDept: 5 });
  check('the check starts', d.status === 202, JSON.stringify(d.data));
  const dd = await waitJob(d.data.jobId);
  const sum = dd.data?.summary;
  check('it finds the Nursing journals only and writes nothing', dd.data?.status === 'done' && sum?.journals === true && sum?.eligible === 2 && (await db.journal.count()) === jb, JSON.stringify(sum));
  const w = await A('/api/admin/ingest/run', 'POST', { previewId: dd.data.previewId });
  check('importing is 202 and runs in the background', w.status === 202);
  const wd = await waitJob(w.data.jobId);
  check('exactly the checked journals were added', wd.data?.status === 'done' && wd.data.result.added === 2 && (await db.journal.count()) === jb + 2, JSON.stringify(wd.data?.result));
  const again = await A('/api/admin/ingest/run', 'POST', { previewId: dd.data.previewId });
  check('the same check cannot be imported twice', again.status === 409);
  const hist2 = await A('/api/admin/ingest/history?result=all&phase=journals&limit=5');
  check('logged as a Manual journals run', (hist2.data.runs || []).some((x: any) => /^Manual · /.test(x.note || '')));

  section('The earlier endpoints still work');
  check('state, history and coverage answer', (await A('/api/admin/ingest/state')).status === 200 && (await A('/api/admin/ingest/history')).status === 200 && (await A('/api/admin/ingest/coverage')).status === 200);
} catch (e: any) {
  fail++; console.log('  FAIL  test crashed:', e?.message);
  console.log(serverLog.slice(-1500));
} finally {
  await db.userSession.updateMany({ where: { sessionId: { startsWith: `sid-qi-${RUN}` } }, data: { revokedAt: new Date() } });
  await db.ingestionSourceHealth.deleteMany({});
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
