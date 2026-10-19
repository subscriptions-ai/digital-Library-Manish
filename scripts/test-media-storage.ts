/**
 * Media storage in PRODUCTION mode: the persistent-local driver (the interim Coolify volume), the fail-safe that refuses production uploads
 * with no declared storage, the write health check, unique names, verified writes before any record changes, and survival across a restart and
 * a "redeploy" (a new server process on the same volume directory). Real Express server, throwaway database `stm_ingestion_test`, every
 * outbound request blocked, a temporary directory standing in for the volume.
 *
 *   npx tsx scripts/test-media-storage.ts
 */
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const MS = await import('../src/server/storage/mediaStorage.js');
const { mayAutoGenerateCover, resolveCover } = await import('../src/lib/blogCover.js');

const PORT = 3106, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const UUID = /^\/uploads\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;

// ── unit: the driver decision ─────────────────────────────────────────────
section('Which storage, decided in one place');
const withEnv = (e: Record<string, string | undefined>, f: () => any) => {
  const keep: Record<string, string | undefined> = {};
  for (const k of Object.keys(e)) { keep[k] = process.env[k]; if (e[k] === undefined) delete process.env[k]; else process.env[k] = e[k]; }
  try { return f(); } finally { for (const k of Object.keys(keep)) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; } }
};
const noS3 = { AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' };
check('production, no driver, no S3 → NOT configured (never a silent ephemeral folder)', withEnv({ ...noS3, NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: undefined }, () => MS.mediaDriver().driver) === 'unconfigured');
check('…and the reason names the fix (MEDIA_STORAGE_DRIVER=local-persistent), not "set AWS_S3_BUCKET" alone', withEnv({ ...noS3, NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: undefined }, () => /MEDIA_STORAGE_DRIVER=local-persistent/.test(MS.mediaDriver().problem || '')));
check('production + MEDIA_STORAGE_DRIVER=local-persistent → Persistent volume, with no S3 needed', withEnv({ ...noS3, NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent' }, () => MS.mediaDriver().driver === 'local-persistent' && MS.DRIVER_LABEL['local-persistent'] === 'Persistent volume'));
check('an explicit local-persistent driver wins even when S3 variables are present', withEnv({ AWS_S3_BUCKET: 'b', AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's', NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent' }, () => MS.mediaDriver().driver) === 'local-persistent');
check('no driver + S3 fully configured → AWS S3 (unchanged)', withEnv({ AWS_S3_BUCKET: 'b', AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's', MEDIA_STORAGE_DRIVER: undefined }, () => MS.mediaDriver().driver) === 's3');
check('MEDIA_STORAGE_DRIVER=s3 without the bucket → not configured, never a local fallback', withEnv({ ...noS3, MEDIA_STORAGE_DRIVER: 's3' }, () => MS.mediaDriver().driver) === 'unconfigured');
check('development with nothing set → a local folder, labelled as development', withEnv({ ...noS3, NODE_ENV: 'development', MEDIA_STORAGE_DRIVER: undefined }, () => MS.mediaDriver().driver) === 'local-dev');
check('MEDIA_STORAGE_ROOT wins over the older UPLOAD_DIR', withEnv({ MEDIA_STORAGE_ROOT: '/app/uploads', UPLOAD_DIR: '/elsewhere' }, () => MS.mediaStorageRoot()) === '/app/uploads');
check('UPLOAD_DIR (the Dockerfile default) still works', withEnv({ MEDIA_STORAGE_ROOT: undefined, UPLOAD_DIR: '/app/uploads' }, () => MS.mediaStorageRoot() === '/app/uploads' && MS.mediaDir() === '/app/uploads/media'));
check('/uploads/media/<name> maps under the root, and a path that climbs out of it maps to nothing', withEnv({ MEDIA_STORAGE_ROOT: '/app/uploads' }, () =>
  MS.localPathForUrl('/uploads/media/a.png') === '/app/uploads/media/a.png' && MS.localPathForUrl('/uploads/../../etc/passwd') === null && MS.localPathForUrl('/uploads/%2e%2e/%2e%2e/etc/passwd') === null && MS.localPathForUrl('https://evil.example/x.png') === null));

// ── servers ───────────────────────────────────────────────────────────────
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-media-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-media-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const editorTok = await mkUser('ContentManager');
const png = (w: number, h: number, tag: number) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = 6; b[28] = tag;
  return b;
};
const dataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
const PNG_A = png(1600, 900, 1), PNG_B = png(1600, 900, 2), PNG_C = png(1600, 900, 3);

type Srv = { child: any; log: string };
const start = async (extra: Record<string, string>): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    // Blank, not absent: the server loads .env, and a variable already set (even to nothing) is not overridden by it.
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', UPLOAD_DIR: '', MEDIA_STORAGE_ROOT: '', MEDIA_STORAGE_DRIVER: '', ...noS3,
      API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3198', API_TEST_BLOCK_DELAY_MS: '50', DISABLE_HMR: 'true', ...extra },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(600); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const call = async (path: string, o: { method?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { Authorization: `Bearer ${editorTok}`, ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const upload = (buf: Buffer, name: string) => call('/api/studio/cover', { method: 'POST', body: { dataUrl: dataUrl(buf), filename: name, altText: 'Test cover' } });
const get = async (url: string) => { const r = await fetch(BASE + url); return { status: r.status, body: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') }; };
const assets = () => db.mediaAsset.count();

const VOL = mkdtempSync(join(tmpdir(), 'stm-volume-'));          // stands in for the Coolify volume at /app/uploads
const PERSIST = { MEDIA_STORAGE_DRIVER: 'local-persistent', MEDIA_STORAGE_ROOT: VOL };
let srv: Srv | null = null;
try {
  await db.appSetting.deleteMany({ where: { key: 'uploads.storage.v1' } });

  section('Production with NO declared storage: uploads are refused, nothing written anywhere');
  const EPHEMERAL = mkdtempSync(join(tmpdir(), 'stm-ephemeral-'));
  srv = await start({ UPLOAD_DIR: EPHEMERAL });
  const n0 = await assets();
  const refused = await upload(PNG_A, 'a.png');
  check('the upload is refused (503) with a message an admin can act on', refused.status === 503 && /MEDIA_STORAGE_DRIVER=local-persistent/.test(refused.data?.error || ''), refused);
  check('no file was written', !existsSync(join(EPHEMERAL, 'media')) || readdirSync(join(EPHEMERAL, 'media')).length === 0);
  check('…no media record either', (await assets()) === n0);
  const h0 = await call('/api/admin/media/health');
  check('the Studio health says "Not configured", and is not healthy', h0.data?.mediaStorage?.driver === 'unconfigured' && h0.data.mediaStorage.healthy === false && h0.data.mediaStorage.label === 'Not configured', h0.data?.mediaStorage);
  check('the server log says uploads will be refused', /Uploads will be REFUSED/.test(srv.log));
  await stop(srv); srv = null; rmSync(EPHEMERAL, { recursive: true, force: true });

  section('TEST 1 — persistent-local: upload a new Blog cover');
  // The section above ran on another, undeclared directory — exactly like production before the volume: this start is the move onto it.
  srv = await start(PERSIST);
  const mv = (await call('/api/admin/media/health')).data;
  check('the first start on the declared volume is recorded as the MOVE onto it, not as a lost directory', mv?.storage?.resets === 0 && /First start on the declared persistent volume/.test(srv.log), mv?.storage);
  const h1 = await call('/api/admin/media/health');
  check('Studio: "Media storage: Persistent volume", Healthy, no S3 asked for', h1.data?.mediaStorage?.label === 'Persistent volume' && h1.data.mediaStorage.healthy === true && h1.data.mediaStorage.writable === true && !/AWS_S3_BUCKET/.test(JSON.stringify(h1.data)), h1.data?.mediaStorage);
  check('the media directory was created under the volume', existsSync(join(VOL, 'media')) && (statSync(join(VOL, 'media')).mode & 0o777) !== 0o777);
  const a = await upload(PNG_A, 'cover.png');
  const aFile = a.data?.url ? join(VOL, 'media', a.data.url.split('/').pop()) : '';
  check('stored under a unique <uuid>.png name (not "cover.png")', a.status === 200 && UUID.test(a.data.url), a.data?.url);
  check('the physical file is in the persistent directory, byte for byte', !!aFile && existsSync(aFile) && readFileSync(aFile).equals(PNG_A));
  const post = (await call('/api/studio/posts', { method: 'POST', body: { title: `Media test ${RUN}`, body: '<p>words for the media storage test</p>', coverUrl: a.data.url, coverAlt: 'A' } })).data;
  let g = await get(a.data.url);
  check('the public address answers HTTP 200 with the image', g.status === 200 && g.body.equals(PNG_A) && /image\/png/.test(g.type || ''), g.status);

  section('TEST 2 — refresh');
  g = await get(a.data.url);
  check('still 200', g.status === 200);
  check('the post still points at it', (await call(`/api/studio/posts/${post.id}`)).data?.coverUrl === a.data.url);

  section('TEST 3 — restart the application');
  await stop(srv); srv = await start(PERSIST);
  g = await get(a.data.url);
  check('after a restart the image is still served (200)', g.status === 200 && g.body.equals(PNG_A));
  check('…and the post is unchanged', (await call(`/api/studio/posts/${post.id}`)).data?.coverUrl === a.data.url);

  section('TEST 4 / 5 — a redeploy: a new server process on the same volume');
  await stop(srv); srv = await start({ ...PERSIST, API_TEST_RUN: RUN + 'b' });
  g = await get(a.data.url);
  check('after a "redeploy" the image still returns 200', g.status === 200 && g.body.equals(PNG_A));
  const h4 = await call('/api/admin/media/health');
  check('the storage check sees the SAME directory (no reset recorded)', (h4.data?.storage?.resets ?? -1) === 0 && h4.data.persistent === true, h4.data?.storage);
  check('no cover is reported missing', (h4.data?.blogCoversMissing || []).every((p: any) => p.id !== post.id));

  section('TEST 6 — replace the cover');
  const b = await upload(PNG_B, 'cover.png');
  check('a NEW unique file is created (the old address is never reused)', b.status === 200 && UUID.test(b.data.url) && b.data.url !== a.data.url, [a.data?.url, b.data?.url]);
  const upd = await call(`/api/studio/posts/${post.id}`, { method: 'PUT', body: { title: `Media test ${RUN}`, body: '<p>words for the media storage test</p>', coverUrl: b.data.url, coverAlt: 'B' } });
  check('the post now points at the new file', upd.status === 200 && upd.data.coverUrl === b.data.url);
  check('the new address returns 200', (await get(b.data.url)).status === 200);
  check('the old file is kept (nothing deleted automatically)', existsSync(aFile));

  section('TEST 7 — no automatic process may replace a manual cover');
  const cur = (await call(`/api/studio/posts/${post.id}`)).data;
  check('a post with a manual cover may not be auto-covered (restart, redeploy, startup, seed, background job)', mayAutoGenerateCover(cur, { requestedByEditor: false }) === false && mayAutoGenerateCover(cur, { requestedByEditor: true }) === false);
  check('precedence: the manual cover wins over everything', resolveCover({ slug: cur.slug, coverUrl: cur.coverUrl } as any).src === b.data.url || JSON.stringify(resolveCover({ slug: cur.slug, coverUrl: cur.coverUrl } as any)).includes(b.data.url));
  await stop(srv); srv = await start(PERSIST);
  check('after another restart the manual cover is still the post\'s cover', (await call(`/api/studio/posts/${post.id}`)).data?.coverUrl === b.data.url);

  section('TEST 8 — a legacy cover whose file is gone');
  const ghost = '/uploads/media/1700000000000-gone00-cover.png';
  const legacy = await db.blogPost.create({ data: { title: `Legacy ${RUN}`, slug: `media-legacy-${RUN}`, body: '<p>x</p>', status: 'Draft', coverUrl: ghost, authorId: null as any } as any }).catch(() => null);
  if (legacy) {
    const lp = (await call(`/api/studio/posts/${legacy.id}`)).data;
    check('the Studio marks it unavailable, the post and its saved address are kept', lp?.coverMissing === true && lp.coverUrl === ghost);
    check('the missing file is a true 404 (not a page, not a fabricated image)', (await get(ghost)).status === 404);
    check('nothing was generated in its place', !existsSync(join(VOL, 'media', ghost.split('/').pop()!)));
  } else check('legacy fixture created', false);

  section('TEST 9 — the volume is not writable');
  await stop(srv); srv = null;
  chmodSync(join(VOL, 'media'), 0o555); chmodSync(VOL, 0o555);
  srv = await start(PERSIST);
  const before = { assets: await assets(), cover: (await call(`/api/studio/posts/${post.id}`)).data?.coverUrl, files: readdirSync(join(VOL, 'media')).length };
  const ro = await upload(PNG_C, 'cover.png');
  check('the upload is refused with a useful Admin error', ro.status === 503 && /not writable/.test(ro.data?.error || '') && ro.data.code === 'MEDIA_STORAGE', ro);
  check('the database is unchanged (no media record, post cover the same)', (await assets()) === before.assets && (await call(`/api/studio/posts/${post.id}`)).data?.coverUrl === before.cover);
  check('no file was written', readdirSync(join(VOL, 'media')).length === before.files);
  const h9 = await call('/api/admin/media/health');
  check('the Studio says the Persistent volume is NOT healthy, and why', h9.data?.mediaStorage?.healthy === false && /not writable/.test(h9.data.mediaStorage.problem || ''), h9.data?.mediaStorage);
  const lib = await call('/api/admin/media', { method: 'POST', body: { dataUrl: dataUrl(PNG_C), filename: 'x.png' } });
  check('the Media Library upload is refused the same way', lib.status === 503 && /not writable/.test(lib.data?.error || ''));
  check('existing images are still served while uploads are paused', (await get(b.data.url)).status === 200);
  section('A declared volume that comes back EMPTY (lost) is still flagged');
  await stop(srv); srv = null;
  const LOST = mkdtempSync(join(tmpdir(), 'stm-volume-lost-'));
  srv = await start({ MEDIA_STORAGE_DRIVER: 'local-persistent', MEDIA_STORAGE_ROOT: LOST });
  const hl = (await call('/api/admin/media/health')).data;
  check('a new, empty directory under the persistent driver counts as a reset (the warning stays honest)', hl?.storage?.resets === 1 && hl.persistent === false, hl?.storage);
  await stop(srv); srv = null; rmSync(LOST, { recursive: true, force: true });
  if (legacy) await db.blogPost.delete({ where: { id: legacy.id } }).catch(() => {});
  await db.blogPost.delete({ where: { id: post.id } }).catch(() => {});
} finally {
  await stop(srv);
  try { chmodSync(VOL, 0o755); chmodSync(join(VOL, 'media'), 0o755); } catch {}
  rmSync(VOL, { recursive: true, force: true });
  // The media records this run created point into the temporary volume just removed: remove them too, or the next suite sees "missing files".
  await db.mediaAsset.deleteMany({ where: { uploadedBy: { endsWith: `-media-${RUN}@api-test.invalid` } } });
  await db.userSession.deleteMany({ where: { sessionId: { startsWith: `sid-media-${RUN}` } } });
  await db.user.deleteMany({ where: { email: { endsWith: `-media-${RUN}@api-test.invalid` } } });
}
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
