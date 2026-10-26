/**
 * Historical backfill through the real Express server, with the gate on and the fixture provider enabled (scratch database `stm_ingestion_test` only; network
 * blocked by the shared preload). It proves the HTTP contract and the whole flow end to end, with the server's own worker doing the work:
 * preview → start → pause → resume → cancel, the gate, BigInt as a string, roles.
 *
 *   npx tsx scripts/test-backfill-api.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeSample } from './openalex-sample.js';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const PORT = 3102, BASE = `http://127.0.0.1:${PORT}`, RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail.slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-bf-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-bf-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const adminTok = await mkUser('SuperAdmin'), readerTok = await mkUser('Subscriber');

const start = (gate: string, port: number) => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(port), NODE_ENV: 'development', INGESTION_BACKFILL_ENABLED: gate, OPENALEX_SNAPSHOT_DIR: OA_ROOT, BACKFILL_FIXTURE: '1', BACKFILL_MIN_GAP_SECONDS: '0', BACKFILL_IDLE_POLL_SECONDS: '1', BACKFILL_HEARTBEAT_SECONDS: '1', BACKFILL_HEARTBEAT_STALE_SECONDS: '5', INGESTION_ADAPTIVE_SCHEDULER: '0', API_TEST_RUN: RUN, API_TEST_ISSN: '0000-0000', API_TEST_FILE_PORT: '1' },
  });
  let log = ''; child.stdout!.on('data', d => (log += d)); child.stderr!.on('data', d => (log += d));
  return { child, log: () => log, stop: () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch {} } };
};
const call = async (base: string, path: string, o: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(base + path, { method: o.method || 'GET', headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
};
const waitUp = async (base: string) => { const t0 = Date.now(); for (;;) { try { const r = await call(base, '/api/admin/ingest/backfill', { token: adminTok }); if (r.status) return; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start'); await sleep(500); } };

const jobsToClean: string[] = [];
const OA_ROOT = fs.mkdtempSync(path.join(process.env.OA_TEST_DIR || os.tmpdir(), 'oa-api-'));
const oaJournals: any[] = [];
const on = start('true', PORT);
const off = start('false', PORT + 1);
try {
  await waitUp(BASE); await waitUp(`http://127.0.0.1:${PORT + 1}`);
  const A = (path: string, method?: string, body?: any) => call(BASE, path, { method, token: adminTok, body });
  const poll = async (id: string, want: (j: any) => boolean, ms = 60_000) => { const t0 = Date.now(); for (;;) { const j = (await A(`/api/admin/ingest/backfill/${id}`)).data; if (want(j) || Date.now() - t0 > ms) return j; await sleep(400); } };
  const seed = `api${RUN}`;
  const body = { provider: 'fixture', contentType: 'ARTICLE', adapter: { seed, total: 200 }, maxRecords: 200, accessPreference: 'OAFirst' };

  section('Roles and the screen\'s data');
  for (const [m, p] of [['GET', '/api/admin/ingest/backfill'], ['POST', '/api/admin/ingest/backfill'], ['POST', '/api/admin/ingest/backfill/x/pause']]) {
    check(`${m} ${p}: a reader is refused (403), no token is refused (401)`, (await call(BASE, p, { method: m, token: readerTok, body: m === 'POST' ? {} : undefined })).status === 403 && (await call(BASE, p, { method: m })).status === 401);
  }
  const ov = (await A('/api/admin/ingest/backfill')).data;
  check('the overview says the gate is on, lists the limits and all nine content types, and offers the fixture (outside production) and the OpenAlex provider (a staged folder is configured)', ov.enabled === true && ov.types.length === 9 && ov.adapters.map((a: any) => a.id).sort().join() === 'fixture,openalex' && ov.adapters.find((a: any) => a.id === 'fixture').fixture === true && ov.limits.maxRecordsPerJob === 5000 && ov.limits.chunkSize === 100 && ov.limits.workerConcurrency === 1 && typeof ov.limits.maxBytesPerJob === 'string');

  section('The gate');
  const offBase = `http://127.0.0.1:${PORT + 1}`;
  const g = await call(offBase, '/api/admin/ingest/backfill', { method: 'POST', token: adminTok, body });
  check('with INGESTION_BACKFILL_ENABLED=false nothing can be created: 403 BACKFILL_DISABLED', g.status === 403 && g.data.code === 'BACKFILL_DISABLED');
  check('…but the screen can still read its state (enabled: false)', (await call(offBase, '/api/admin/ingest/backfill', { token: adminTok })).data.enabled === false);

  section('Preview → Start, with the server\'s own worker');
  const bad = await A('/api/admin/ingest/backfill', 'POST', { ...body, dryRun: false });
  check('a real start with no preview is refused: 400 PREVIEW_REQUIRED', bad.status === 400 && bad.data.code === 'PREVIEW_REQUIRED');
  const pv = await A('/api/admin/ingest/backfill', 'POST', body);
  check('a preview is created (201), a DRY RUN by default, Pending', pv.status === 201 && pv.data.dryRun === true && pv.data.status === 'Pending'); jobsToClean.push(pv.data.id);
  const dup = await A('/api/admin/ingest/backfill', 'POST', body);
  check('a second active job for the same provider and type is refused: 409', dup.status === 409 && dup.data.code === 'JOB_ALREADY_ACTIVE');
  const pdone = await poll(pv.data.id, j => j.status === 'Completed');
  check('the worker completed the preview; it counts what WOULD happen and wrote nothing', pdone.status === 'Completed' && pdone.records.fetched === 200 && pdone.records.published > 0 && (await db.article.count({ where: { source: 'BackfillFixture', doi: { startsWith: `10.9999/bf.${seed}.` } } })) === 0, JSON.stringify(pdone.records));
  check('the preview is bounded and bytesProcessed is a string', pdone.preview.samples.length <= 25 && pdone.preview.issues.length <= 25 && typeof pdone.bytesProcessed === 'string' && pdone.inflight === null);
  const stale = await A('/api/admin/ingest/backfill', 'POST', { ...body, dryRun: false, previewJobId: pv.data.id, maxRecords: 199 });
  check('changing the settings invalidates the preview: 400 PREVIEW_MISMATCH', stale.status === 400 && stale.data.code === 'PREVIEW_MISMATCH');
  const rj = await A('/api/admin/ingest/backfill', 'POST', { ...body, dryRun: false, previewJobId: pv.data.id });
  check('Start Backfill from that preview creates a real job (201)', rj.status === 201 && rj.data.dryRun === false && rj.data.previewJobId === pv.data.id); jobsToClean.push(rj.data.id);
  const rdone = await poll(rj.data.id, j => j.status === 'Completed');
  const rows = await db.article.count({ where: { source: 'BackfillFixture', doi: { startsWith: `10.9999/bf.${seed}.` } } });
  check('the worker completed it: totals match the preview\'s, rows exist for exactly published + review', rdone.status === 'Completed' && rdone.records.published === pdone.records.published && rdone.records.review === pdone.records.review && rows === rdone.records.published + rdone.records.review, `${JSON.stringify(rdone.records)} rows=${rows}`);

  section('OpenAlex snapshot provider, through the server and its own worker (100 works)');
  const jp = String(1000 + (parseInt(RUN, 36) % 8000));
  for (let k = 0; k < 4; k++) oaJournals.push(await db.journal.create({ data: { title: `OA api journal ${RUN} ${k}`, issn: `${jp}-0${k}1X`, status: 'Accepted', rightsBasis: 'DOAJ declaration', licenceIsNC: k === 3, domain: 'Computer / IT' } }));
  await sleep(30);
  await makeSample({ dir: path.join(OA_ROOT, 'api100'), total: 100, files: 1, seed: `ao${RUN}`, journals: oaJournals.map(j => ({ issn: j.issn, title: j.title })), foreignIssn: `${jp}-099X` });
  const ov2 = (await A('/api/admin/ingest/backfill')).data;
  const oaA = ov2.adapters.find((a: any) => a.id === 'openalex');
  check('the OpenAlex provider is listed and available once a staged folder is configured; it declares its settings; the six reserved types are flagged', oaA?.available === true && oaA.params.map((p: any) => p.key).join() === 'path,verifyFiles' && oaA.describes === true && ov2.types.filter((t: any) => t.reserved).length === 6 && ov2.types.find((t: any) => t.id === 'ARTICLE').providers.includes('openalex'));
  const ds = await A('/api/admin/ingest/backfill/describe', 'POST', { provider: 'openalex', adapter: { path: 'api100' } });
  check('describe tells the screen the release and size of the staged snapshot', ds.status === 200 && /Release 2026-10-14 · 1 part file · 100 works/.test(ds.data.summary), ds.text);
  check('describe refuses a folder outside the staged folder (400 BAD_SNAPSHOT_PATH)', (await A('/api/admin/ingest/backfill/describe', 'POST', { provider: 'openalex', adapter: { path: '../etc' } })).data?.code === 'BAD_SNAPSHOT_PATH');
  check('a reserved type is refused over HTTP: 400 TYPE_RESERVED', (await A('/api/admin/ingest/backfill', 'POST', { provider: 'openalex', contentType: 'THESIS', adapter: { path: 'api100' } })).data?.code === 'TYPE_RESERVED');
  const oaBody = { provider: 'openalex', contentType: 'ARTICLE', adapter: { path: 'api100', verifyFiles: false }, accessPreference: 'OAFirst', maxRecords: 500 };
  const opv = (await A('/api/admin/ingest/backfill', 'POST', oaBody)).data; jobsToClean.push(opv.id);
  const opd = await poll(opv.id, j => j.status === 'Completed');
  check('the OpenAlex preview ran on the server: 100 lines scanned, 60 relevant works looked at, nothing written', opd.status === 'Completed' && opd.records.fetched === 60 && opd.sourceStats.scanned === 100 && opd.sourceStats.notRelevant === 40 && (await db.article.count({ where: { source: 'OpenAlex', doi: { startsWith: `10.8888/oa.ao${RUN}.` } } })) === 0, JSON.stringify({ r: opd.records, s: opd.sourceStats }));
  const orj = (await A('/api/admin/ingest/backfill', 'POST', { ...oaBody, dryRun: false, previewJobId: opv.id })).data; jobsToClean.push(orj.id);
  const ord = await poll(orj.id, j => j.status === 'Completed');
  const oaRows = await db.article.count({ where: { source: 'OpenAlex', doi: { startsWith: `10.8888/oa.ao${RUN}.` } } });
  check('the real run matches the preview, writes exactly published + review rows, and the cursor is the OpenAlex checkpoint (snapshot identity, file, line)', ord.status === 'Completed' && ord.records.published === opd.records.published && ord.records.review === opd.records.review && oaRows === ord.records.published + ord.records.review && ord.sourceIdentity === opd.sourceIdentity && /"id":"/.test(String(ord.cursor ?? '{"id":"end"}')), JSON.stringify({ r: ord.records, rows: oaRows }));

  section('Pause, resume, cancel over HTTP');
  const seed2 = `ap2${RUN}`; const body2 = { ...body, adapter: { seed: seed2, total: 1000 }, maxRecords: 1000 };
  const p2 = (await A('/api/admin/ingest/backfill', 'POST', body2)).data; jobsToClean.push(p2.id);
  await poll(p2.id, j => j.status === 'Completed');
  const r2 = (await A('/api/admin/ingest/backfill', 'POST', { ...body2, dryRun: false, previewJobId: p2.id })).data; jobsToClean.push(r2.id);
  const paused = await A(`/api/admin/ingest/backfill/${r2.id}/pause`, 'POST');
  check('pause answers 200', paused.status === 200);
  const pj = await poll(r2.id, j => j.status === 'Paused' || j.status === 'Completed');
  check('it ends up Paused at a chunk boundary, with its checkpoint saved, and not finished', pj.status === 'Paused' && pj.chunksCompleted <= 3 && pj.inflight === null && (pj.cursor !== null || pj.chunksCompleted === 0), JSON.stringify({ s: pj.status, c: pj.chunksCompleted, cur: pj.cursor }));
  const at = pj.chunksCompleted, fetched = pj.records.fetched;
  await sleep(2500);
  check('a paused job does no work', (await A(`/api/admin/ingest/backfill/${r2.id}`)).data.records.fetched === fetched);
  check('resume answers 200 and the job goes on from its checkpoint', (await A(`/api/admin/ingest/backfill/${r2.id}/resume`, 'POST')).status === 200);
  await poll(r2.id, j => j.chunksCompleted > at, 30_000);
  const cn = await A(`/api/admin/ingest/backfill/${r2.id}/cancel`, 'POST');
  const cj = await poll(r2.id, j => j.status === 'Cancelled' || j.status === 'Completed');
  const kept = await db.article.count({ where: { source: 'BackfillFixture', doi: { startsWith: `10.9999/bf.${seed2}.` } } });
  check('cancel answers 200; the job ends Cancelled; everything imported so far is still there', cn.status === 200 && cj.status === 'Cancelled' && kept === cj.records.published + cj.records.review && kept > 0, JSON.stringify({ s: cj.status, kept, rec: cj.records }));
  check('a cancelled job cannot be resumed: 409', (await A(`/api/admin/ingest/backfill/${r2.id}/resume`, 'POST')).status === 409);
  check('an unknown action is 404', (await A(`/api/admin/ingest/backfill/${r2.id}/explode`, 'POST')).status === 404 && (await A('/api/admin/ingest/backfill/nope')).status === 404);
  check('the whole list serialises (BigInt safe)', typeof (await A('/api/admin/ingest/backfill')).text === 'string' && (await A('/api/admin/ingest/backfill')).status === 200);
} catch (e: any) {
  fail++; console.log('  FAIL  test crashed:', e?.message); console.log(on.log().slice(-1500));
} finally {
  on.stop(); off.stop();
  await sleep(500);
  await db.article.deleteMany({ where: { OR: [{ source: 'BackfillFixture' }, { source: 'OpenAlex', doi: { startsWith: `10.8888/oa.ao${RUN}.` } }] } });
  await db.publisher.deleteMany({ where: { source: 'OpenAlex', tieUpStatus: 'Discovered', name: 'Sample Press' } });
  await db.journal.deleteMany({ where: { title: { startsWith: `OA api journal ${RUN}` } } });
  fs.rmSync(OA_ROOT, { recursive: true, force: true });
  await db.backfillJob.deleteMany({ where: { OR: [{ id: { in: jobsToClean } }, { createdBy: { contains: `-bf-${RUN}` } }] } });
  await db.userSession.updateMany({ where: { sessionId: { startsWith: `sid-bf-${RUN}` } }, data: { revokedAt: new Date() } });
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
