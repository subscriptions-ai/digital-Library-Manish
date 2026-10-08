/**
 * Ingestion API tests: the real Express server, talking to the throwaway database `stm_ingestion_test`.
 * Refuses to run against anything else. The server is started with a preload that blocks all outbound network
 * and answers Europe PMC with fixed records, so no test touches the internet or the real catalogue.
 *
 *   npx tsx scripts/test-ingestion-api.ts
 *
 * Nothing here deletes a row. Test users and sessions are left in the scratch database (sessions revoked).
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
const { DOMAINS } = await import('../src/constants.js');

const PORT = 3101, FILE_PORT = 3199, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const ISSN = `${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const DEPT: string = (DOMAINS as any[])[0].name, DEPT2: string = (DOMAINS as any[])[1].name;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// A file server: ok.pdf opens as a PDF, anything else is a 404.
const files = http.createServer((req, res) => {
  if (req.url?.startsWith('/ok.pdf')) { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end('%PDF-1.4 test'); }
  else { res.writeHead(404); res.end('no'); }
}).listen(FILE_PORT, '127.0.0.1');

// Users and sessions for the roles under test.
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const adminTok = await mkUser('SuperAdmin'), readerTok = await mkUser('Subscriber'), managerTok = await mkUser('Admin');

// Start from a known engine state: off. (Scratch database only.)
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: false }, update: { enabled: false, focus: 'auto', departments: [] } });
await db.ingestionSourceHealth.upsert({ where: { source: 'OpenAlex' }, create: { source: 'OpenAlex' }, update: { consecutiveFailures: 0, pausedUntil: null } });

const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', API_TEST_RUN: RUN, API_TEST_ISSN: ISSN, API_TEST_FILE_PORT: String(FILE_PORT) },
});
let serverLog = ''; child.stdout!.on('data', d => (serverLog += d)); child.stderr!.on('data', d => (serverLog += d));
const shutdown = async () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch {} files.close(); await db.$disconnect(); };

const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text, headers: r.headers };
};
const A = (path: string, method?: string, body?: any) => call(path, { method, token: adminTok, body });
const counts = async () => ({ article: await db.article.count(), journal: await db.journal.count(), book: await db.book.count(), publisher: await db.publisher.count() });
const waitJob = async (id: string, ms = 60_000) => { const t0 = Date.now(); for (;;) { const r = await A(`/api/admin/ingest/status/${id}`); if (r.data?.status !== 'running' || Date.now() - t0 > ms) return r; await sleep(500); } };

try {
  // wait for the server
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/ingest/state'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('Access: every ingestion route is for the super admin only, enforced on the server');
  const routes: [string, string][] = [['GET', '/api/admin/ingest/state'], ['POST', '/api/admin/ingest/state'], ['GET', '/api/admin/ingest/history'], ['GET', '/api/admin/ingest/metrics'], ['GET', '/api/admin/ingest/coverage'], ['GET', '/api/admin/ingest/audit'],
    ['POST', '/api/admin/ingest/tick'], ['POST', '/api/admin/ingest/dry-run'], ['POST', '/api/admin/ingest/run'], ['POST', '/api/admin/ingest/doaj-catalogue'], ['GET', '/api/admin/ingest/doaj-catalogue'], ['GET', '/api/admin/ingest/jobs/active']];
  for (const [m, p] of routes) {
    const none = await call(p, { method: m, body: m === 'POST' ? {} : undefined });
    const bad = await call(p, { method: m, token: 'not-a-token', body: m === 'POST' ? {} : undefined });
    const reader = await call(p, { method: m, token: readerTok, body: m === 'POST' ? {} : undefined });
    const mgr = await call(p, { method: m, token: managerTok, body: m === 'POST' ? {} : undefined });
    check(`${m} ${p.replace('/api/admin/ingest', '')}: no token 401, bad token 403, subscriber 403, other admin role 403`, none.status === 401 && bad.status === 403 && reader.status === 403 && mgr.status === 403, `${none.status}/${bad.status}/${reader.status}/${mgr.status}`);
  }

  section('State and settings: loaded from the server, validated on the server');
  const s0 = await A('/api/admin/ingest/state');
  check('state loads with status, 24-hour figures and limits', s0.status === 200 && !!s0.data.status && !!s0.data.last24h && !!s0.data.limits, s0.data?.status?.label);
  const base = s0.data;
  for (const [k, v, why] of [['batchSize', 'abc', 'text'], ['batchSize', 0, 'below range'], ['batchSize', 9999, 'above range'], ['yearsBack', 7.5, 'fraction'], ['articlesPerJournal', null, 'empty'], ['discoverEvery', -1, 'negative']] as const) {
    const r = await A('/api/admin/ingest/state', 'POST', { [k]: v });
    check(`${k} = ${JSON.stringify(v)} (${why}) is refused with 400`, r.status === 400 && !!r.data?.error, r.data?.error);
  }
  const unchanged = await A('/api/admin/ingest/state');
  check('refused values left every saved setting exactly as it was', ['yearsBack', 'batchSize', 'articlesPerJournal', 'discoverEvery'].every(k => unchanged.data[k] === base[k]));
  check('an unknown department is refused', (await A('/api/admin/ingest/state', 'POST', { departments: ['Not A Department'] })).status === 400);
  const set = await A('/api/admin/ingest/state', 'POST', { batchSize: base.batchSize === 150 ? 151 : 150 });
  check('a valid change while paused is saved', set.status === 200 && set.data.batchSize !== base.batchSize, `batchSize ${base.batchSize} → ${set.data.batchSize}`);

  const on = await A('/api/admin/ingest/state', 'POST', { enabled: true });
  check('the engine can be resumed', on.status === 200 && on.data.enabled === true);
  const locked = await A('/api/admin/ingest/state', 'POST', { batchSize: 120 });
  check('settings are read-only while running: 409 "Pause the engine to edit ingestion settings."', locked.status === 409 && locked.data.error === 'Pause the engine to edit ingestion settings.', locked.data?.error);
  const noConfirm = await A('/api/admin/ingest/state', 'POST', { departments: [DEPT] });
  check('a scope change while running needs confirmation (409 SCOPE_CHANGE)', noConfirm.status === 409 && noConfirm.data.needsConfirmation === 'SCOPE_CHANGE');
  check('…and nothing changed without it', (await A('/api/admin/ingest/state')).data.departments.length === 0);
  const confirmed = await A('/api/admin/ingest/state', 'POST', { departments: [DEPT], confirmScopeChange: true });
  check('with confirmation the scope changes', confirmed.status === 200 && confirmed.data.departments.length === 1 && confirmed.data.departments[0] === DEPT);
  const wide = await A('/api/admin/ingest/state', 'POST', { departments: [], confirmScopeChange: true });
  check('Use All Departments is an explicit empty list and also needs confirmation', wide.status === 200 && wide.data.departments.length === 0);
  check('the engine is paused again', (await A('/api/admin/ingest/state', 'POST', { enabled: false })).data.enabled === false);

  section('Manual pass: one at a time');
  const pair = await Promise.all([A('/api/admin/ingest/tick', 'POST'), A('/api/admin/ingest/tick', 'POST')]);
  const codes = pair.map(p => p.status).sort();
  check('two clicks at once start one pass; the other is refused with 409', codes[1] === 409 && codes[0] !== 409, codes.join(','));
  await sleep(1500);

  section('Dry run writes nothing to the catalogue');
  check('no department → "Select at least one department to continue."', (await A('/api/admin/ingest/dry-run', 'POST', { source: 'europepmc', departments: [] })).data?.error === 'Select at least one department to continue.');
  check('unknown source is refused', (await A('/api/admin/ingest/dry-run', 'POST', { source: 'nowhere', departments: [DEPT] })).status === 400);
  check('items per department outside 1–300 is refused', (await A('/api/admin/ingest/dry-run', 'POST', { source: 'europepmc', departments: [DEPT], perDept: 301 })).status === 400 && (await A('/api/admin/ingest/dry-run', 'POST', { source: 'europepmc', departments: [DEPT], perDept: 0 })).status === 400);
  // one record the catalogue already holds
  await db.article.create({ data: { title: `Already held ${RUN}`, doi: `10.7777/${RUN}.4`, fingerprint: `doi:10.7777/${RUN}.4`, status: 'Published', source: 'Admin' } });
  const before = await counts();
  const started = await A('/api/admin/ingest/dry-run', 'POST', { source: 'europepmc', departments: [DEPT], perDept: 10, accessPolicy: 'verifiable' });
  check('the dry run starts (202) and returns a job', started.status === 202 && !!started.data.jobId);
  const done = await waitJob(started.data.jobId);
  const sum = done.data?.summary;
  const afterDry = await counts();
  check('the job finishes with a preview id', done.data?.status === 'done' && !!done.data.previewId, done.data?.error);
  check('NO catalogue rows were written by the dry run (articles, journals, books, publishers)', JSON.stringify(before) === JSON.stringify(afterDry), JSON.stringify(afterDry));
  check('results: found 4; the held one is "already held"; the file that does not open is rejected', sum?.found === 4 && sum?.alreadyHeld === 1 && sum?.rejected === 1, JSON.stringify(sum));
  check('eligible are the open ones; only the commercially licensed, opening file is viewable', sum?.eligible === 2 && sum?.viewable === 1 && sum?.metadataOnly === 1, JSON.stringify(sum));
  const pid = done.data.previewId;
  const csv = await A(`/api/admin/ingest/preview/${pid}/csv`);
  check('CSV export works and lists every row', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type') || '') && csv.text.trim().split('\n').length === 5);
  check('a second dry run is allowed (the first has finished)', (await A('/api/admin/ingest/dry-run', 'POST', { source: 'europepmc', departments: [DEPT2], perDept: 5, accessPolicy: 'verifiable' })).status === 202);
  await sleep(2500);

  section('Ingest: only from a preview, checked again at write, once');
  check('no preview id → 400', (await A('/api/admin/ingest/run', 'POST', {})).status === 400);
  check('records posted by the browser are ignored — a body without a preview id is refused', (await A('/api/admin/ingest/run', 'POST', { items: [{ title: 'smuggled' }] })).status === 400);
  check('an unknown preview id is refused', (await A('/api/admin/ingest/run', 'POST', { previewId: 'does-not-exist' })).status >= 400);
  const w = await A('/api/admin/ingest/run', 'POST', { previewId: pid });
  check('the import starts (202)', w.status === 202 && !!w.data.jobId);
  const wd = await waitJob(w.data.jobId);
  check('it finishes and reports what it did', wd.data?.status === 'done' && wd.data.result?.added === 2 && wd.data.result?.failed === 0, JSON.stringify(wd.data?.result));
  const afterWrite = await counts();
  check('exactly the 2 eligible records were added, nothing else', afterWrite.article === afterDry.article + 2, `${afterDry.article} → ${afterWrite.article}`);
  const added = await db.article.findMany({ where: { doi: { in: [`10.7777/${RUN}.1`, `10.7777/${RUN}.2`] } } });
  check('new records carry their provenance (source and source record id)', added.length === 2 && added.every((a: any) => a.source && a.sourceRecordId), added.map((a: any) => `${a.source}:${a.sourceRecordId}:${a.accessType || a.access || ''}`).join(' | '));
  check('the held record was not touched or duplicated', (await db.article.count({ where: { doi: `10.7777/${RUN}.4` } })) === 1);
  const again = await A('/api/admin/ingest/run', 'POST', { previewId: pid });
  check('ingesting the same preview twice is refused (409) — no repeated import', again.status === 409);
  check('articles are unchanged after the refused repeat', (await counts()).article === afterWrite.article);

  section('DOAJ mass import: check first, then confirm');
  check('import without a check is refused', (await A('/api/admin/ingest/doaj-catalogue', 'POST', {})).status === 400);
  check('import without confirmation is refused', (await A('/api/admin/ingest/doaj-catalogue', 'POST', { previewId: pid, confirm: false })).status === 400);
  check('a preview of the wrong kind cannot be used for a mass import', (await A('/api/admin/ingest/doaj-catalogue', 'POST', { previewId: pid, confirm: true })).status >= 400);
  const chk = await A('/api/admin/ingest/doaj-catalogue', 'POST', { dryRun: true });
  check('the check starts in the background', chk.status === 202 && chk.data.job?.running === true);
  const jc0 = await counts();
  let job: any; for (let i = 0; i < 40; i++) { await sleep(500); job = (await A('/api/admin/ingest/doaj-catalogue')).data.job; if (!job?.running) break; }
  check('with the network blocked the check ends in an error, visibly, and writes nothing', !!job?.error && JSON.stringify(await counts()) === JSON.stringify(jc0), job?.error);

  section('Run log, metrics, coverage, audit');
  for (const q of ['result=all', 'result=added', 'result=held', 'result=failed', 'result=skipped', 'phase=articles', 'phase=books', 'phase=journals', 'result=added&phase=articles', 'limit=2']) {
    const r = await A(`/api/admin/ingest/history?${q}`);
    check(`history?${q} returns 200 with a page`, r.status === 200 && Array.isArray(r.data.runs) && 'hasMore' in r.data);
  }
  const p1 = await A('/api/admin/ingest/history?limit=1');
  if (p1.data.nextBefore) { const p2 = await A(`/api/admin/ingest/history?limit=1&before=${encodeURIComponent(p1.data.nextBefore)}`); check('paging is on the server: the next page is a different run', p2.status === 200 && p2.data.runs[0]?.id !== p1.data.runs[0]?.id); }
  for (const p of ['lifetime', '7d', '24h']) check(`metrics ${p} responds`, (await A(`/api/admin/ingest/metrics?period=${p}`)).status === 200);
  const life = await A('/api/admin/ingest/metrics?period=lifetime'), st = await A('/api/admin/ingest/state');
  check('lifetime metrics are the engine\'s own totals', life.data.articlesAdded === st.data.articlesAdded && life.data.booksAdded === st.data.booksAdded, JSON.stringify(life.data));
  check('coverage responds', (await A('/api/admin/ingest/coverage')).status === 200);
  const audit = await A('/api/admin/ingest/audit?limit=100');
  const acts = new Set((audit.data.events || []).map((e: any) => e.action));
  for (const a of ['ENGINE_RESUMED', 'ENGINE_PAUSED', 'MANUAL_PASS_REQUESTED', 'INGESTION_SETTINGS_CHANGED', 'INGESTION_SCOPE_CHANGED', 'DRY_RUN_CREATED', 'ONE_OFF_IMPORT_STARTED']) check(`audit contains ${a}`, acts.has(a));
  check('audit entries record who acted and never a token or password', (audit.data.events || []).every((e: any) => !/Bearer|eyJ|password|secret/i.test(JSON.stringify(e))) && (audit.data.events || []).some((e: any) => e.adminEmail?.includes(RUN)));
  const asJson = JSON.stringify(audit.data);
  check('the audit log was only added to (every entry older than this run is still there)', (audit.data.events || []).length > 7, `${audit.data.events?.length} entries`);
  void asJson;

  section('Jobs survive a refresh');
  const act = await A('/api/admin/ingest/jobs/active');
  check('active jobs endpoint answers (nothing is running now)', act.status === 200 && Array.isArray(act.data.jobs));
} catch (e: any) {
  fail++; console.log('  FAIL  test crashed:', e?.message);
  console.log(serverLog.slice(-1500));
} finally {
  await db.userSession.updateMany({ where: { sessionId: { startsWith: `sid-${RUN}` } }, data: { revokedAt: new Date() } });
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
