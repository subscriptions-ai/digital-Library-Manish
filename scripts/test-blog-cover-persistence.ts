/**
 * Blog cover persistence: a manually chosen cover must survive reload, publish, restart and a container replacement, and must be the image in
 * the page, the search/social metadata and the structured data. Runs the REAL Express server against the throwaway database
 * `stm_ingestion_test` (refuses anything else), with every outbound request blocked, and a temporary UPLOAD_DIR per "container".
 *
 *   npx tsx scripts/test-blog-cover-persistence.ts
 *
 *   container 1 ─ upload, save, publish, SEO ──┐ same directory (a persistent volume)
 *   container 2 ─ a restart                    │   → everything still there
 *   container 3 ─ a redeploy                  ─┘
 *   container 4 ─ a NEW, empty directory (no volume) → the file is gone; nothing else about the post may change
 */
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, readFileSync as rf } from 'node:fs';
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
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const { mayAutoGenerateCover, hasManualCover, resolveCover, COVER_UNAVAILABLE_MESSAGE } = await import('../src/lib/blogCover.js');

const PORT = 3105, BASE = `http://127.0.0.1:${PORT}`, CANON = 'https://journalslibrary.com';
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── users ──
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-cover-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-cover-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const editorTok = await mkUser('ContentManager'), adminTok = await mkUser('SuperAdmin');

// ── a 1600×900 PNG header: the cover check reads type and size from the bytes ──
const png = (w: number, h: number, tag: number) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = 6; b[28] = tag;
  return b;
};
const dataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
const PNG_A = png(1600, 900, 1), PNG_B = png(1600, 900, 2);

// ── servers ──
type Srv = { child: any; log: string; dir: string };
const start = async (dir: string): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', UPLOAD_DIR: dir, API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3197', API_TEST_BLOCK_DELAY_MS: '50', DISABLE_HMR: 'true' },
  });
  const srv: Srv = { child, log: '', dir };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(600); }
  await sleep(800);                                                  // the storage check runs just after start-up
  return srv;
};
const stop = async (s: Srv) => { try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };

const call = async (path: string, o: { method?: string; token?: string; body?: any; ua?: string } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(o.ua ? { 'User-Agent': o.ua } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text, headers: r.headers };
};
const E = (p: string, m?: string, b?: any) => call(p, { method: m, token: editorTok, body: b });
const A = (p: string, m?: string, b?: any) => call(p, { method: m, token: adminTok, body: b });
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const upload = async (buf: Buffer, name: string) => (await E('/api/studio/cover', 'POST', { dataUrl: dataUrl(buf), filename: name, altText: 'A drawing used by the test' })).data;

// raw HTML → the three places a cover is named
const metaContent = (html: string, key: 'name' | 'property', v: string) => [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]).filter(t => new RegExp(`${key}="${v}"`).test(t)).map(t => /content="([^"]*)"/.exec(t)?.[1]);
const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const seoOf = async (slug: string) => {
  const r = await call(`/blog/${slug}`, { ua: BOT });
  const posting = ld(r.text).find((b: any) => b['@type'] === 'BlogPosting');
  return { status: r.status, og: metaContent(r.text, 'property', 'og:image'), tw: metaContent(r.text, 'name', 'twitter:image'), ld: posting?.image, html: r.text };
};
const snapshot = async () => JSON.stringify((await db.blogPost.findMany({ select: { id: true, coverUrl: true, ogImage: true, coverAlt: true }, orderBy: { id: 'asc' } })));

const D1 = mkdtempSync(join(tmpdir(), 'stm-uploads-1-')), D2 = mkdtempSync(join(tmpdir(), 'stm-uploads-2-'));
let srv: Srv | null = null;
const slugs: string[] = [];
try {
  await db.appSetting.deleteMany({ where: { key: 'uploads.storage.v1' } });
  await db.blogPost.deleteMany({ where: { slug: { startsWith: 'cover-test-' } } });

  // ═══════════════════════════════════════════════════════════════════════
  section('Container 1 — a Content Manager chooses a cover, saves, publishes');
  srv = await start(D1);
  const created = await E('/api/studio/posts', 'POST', { title: `Cover test ${RUN}`, body: '<p>A post written for the cover test, with a few words in it.</p>' });
  const id = created.data.id, slug = created.data.slug; slugs.push(slug);
  check('a draft is created without a cover', created.status === 201 && !created.data.coverUrl);
  const a = await upload(PNG_A, 'cover-a.png');
  check('the cover is stored under a unique name in the uploads directory', /^\/uploads\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.test(a?.url || '') && existsSync(join(D1, 'media', a.url.split('/').pop())), a?.url);
  const saved = await E(`/api/studio/posts/${id}`, 'PUT', { title: `Cover test ${RUN}`, body: '<p>A post written for the cover test, with a few words in it.</p>', coverUrl: a.url, coverAlt: 'Cover A' });
  check('TEST A: saving stores the address on the post', saved.status === 200 && saved.data.coverUrl === a.url && saved.data.ogImage === a.url, saved.data);
  const reload = await E(`/api/studio/posts/${id}`);
  check('TEST A: reloading the post shows cover A', reload.data.coverUrl === a.url && reload.data.coverAlt === 'Cover A' && reload.data.coverMissing === false);
  const served = await fetch(BASE + a.url);
  check('the file is served, with a cache lifetime a changing file could not have', served.status === 200 && /immutable/.test(served.headers.get('cache-control') || '') && Buffer.from(await served.arrayBuffer()).equals(PNG_A), served.headers.get('cache-control'));
  const pub = await E(`/api/studio/posts/${id}/status`, 'POST', { publish: true });
  check('TEST B: publishing keeps cover A', pub.status === 200 && pub.data.status === 'Published' && pub.data.coverUrl === a.url, pub.data);

  section('SEO — the same cover in og:image, twitter:image and the BlogPosting image');
  let seo = await seoOf(slug);
  check('TEST E: og:image, twitter:image and BlogPosting.image are all cover A', seo.og[0] === CANON + a.url && seo.tw[0] === CANON + a.url && JSON.stringify([].concat(seo.ld)) === JSON.stringify([CANON + a.url]), { og: seo.og, tw: seo.tw, ld: seo.ld });
  await db.blogPost.update({ where: { id }, data: { ogImage: '/assets/blog/academic-journals.webp' } });     // an old social image left on the row
  seo = await seoOf(slug);
  check('a stale social image left on the row cannot put an older picture on a shared link', seo.og[0] === CANON + a.url && seo.tw[0] === CANON + a.url && !/\/assets\/blog\//.test(seo.html.split('</head>')[0]), seo.og);
  await db.blogPost.update({ where: { id }, data: { ogImage: a.url } });

  section('The stored cover is only changed by an editor, and only on purpose');
  const edit = await E(`/api/studio/posts/${id}`, 'PUT', { title: `Cover test ${RUN} (edited)`, body: '<p>A post written for the cover test, with a few words in it.</p>' });
  check('a save that carries no cover address leaves cover A and its alt text untouched', edit.status === 200 && edit.data.coverUrl === a.url && edit.data.coverAlt === 'Cover A' && edit.data.ogImage === a.url, edit.data);
  const nulled = await E(`/api/studio/posts/${id}`, 'PUT', { title: `Cover test ${RUN}`, body: '<p>A post written for the cover test, with a few words in it.</p>', coverUrl: null, coverAlt: null });
  check('an explicit empty cover without "remove" (an editor tab that had not loaded) does NOT clear it', nulled.status === 200 && nulled.data.coverUrl === a.url, nulled.data);
  const bad = await E(`/api/studio/posts/${id}`, 'PUT', { title: 'x', body: '<p>x y z</p>', coverUrl: 'javascript:alert(1)' });
  check('an address we would not store is refused and the stored cover is left alone', bad.status === 400 && (await E(`/api/studio/posts/${id}`)).data.coverUrl === a.url);
  const d2 = (await E('/api/studio/posts', 'POST', { title: `Cover test two ${RUN}`, body: '<p>words</p>', coverUrl: (await upload(PNG_B, 'cover-b0.png')).url })).data; slugs.push(d2.slug);
  const removed = await E(`/api/studio/posts/${d2.id}`, 'PUT', { title: d2.title, body: '<p>words</p>', removeCover: true });
  check('"Remove" is the one way to clear a cover, and it clears it, its alt text and the social image', removed.status === 200 && removed.data.coverUrl === null && removed.data.coverAlt === null && removed.data.ogImage === null, removed.data);

  section('Automatic generation can never replace a manual cover (TEST F, G)');
  check('no app code path generates covers; the policy refuses anything automatic when a manual cover exists', mayAutoGenerateCover({ coverUrl: a.url }, { requestedByEditor: false }) === false);
  check('…even when asked for, unless the editor explicitly confirms the replacement', mayAutoGenerateCover({ coverUrl: a.url }, { requestedByEditor: true }) === false && mayAutoGenerateCover({ coverUrl: a.url }, { requestedByEditor: true, confirmedReplace: true }) === true);
  check('…and with no cover it is only ever on the editor\'s request', mayAutoGenerateCover({ coverUrl: null }, { requestedByEditor: false }) === false && mayAutoGenerateCover({ coverUrl: null }, { requestedByEditor: true }) === true);
  check('a cover that exists is the manual one; only a post with none is given the site artwork', hasManualCover({ coverUrl: a.url }) && resolveCover({ coverUrl: a.url, slug }).source === 'manual' && resolveCover({ coverUrl: null, slug }).source === 'fallback');

  section('Deleting from the Media Library cannot remove a picture a post uses');
  const del = await A(`/api/admin/media/${a.id}`, 'DELETE');
  check('the delete is refused (409), says which post, and nothing was removed', del.status === 409 && /Cover test/.test(del.data?.error || '') && existsSync(join(D1, 'media', a.url.split('/').pop())) && !!(await db.mediaAsset.findUnique({ where: { id: a.id } })), del.data);

  section('Storage health, while the directory is the one we started with');
  const health1 = await E('/api/admin/media/health');
  check('every uploaded file is present and the directory has not been replaced', health1.status === 200 && health1.data.filesMissing === 0 && health1.data.storage.resets === 0 && health1.data.uploadDir === D1, health1.data);

  // ═══════════════════════════════════════════════════════════════════════
  section('Container 2 — a restart, and Container 3 — a redeploy, with the same persistent directory');
  const before = await snapshot();
  await stop(srv); srv = await start(D1);
  check('TEST C: after a restart, no blog row was rewritten by start-up', (await snapshot()) === before);
  check('TEST C: the post still has cover A, and the file is still served', (await E(`/api/studio/posts/${id}`)).data.coverUrl === a.url && (await fetch(BASE + a.url)).status === 200);
  seo = await seoOf(slug);
  check('TEST C/E: the raw HTML still names cover A', seo.og[0] === CANON + a.url && seo.tw[0] === CANON + a.url);
  await stop(srv); srv = await start(D1);
  const health3 = await E('/api/admin/media/health');
  check('TEST D: after a redeploy onto the same volume, cover A, its file and the page are all unchanged', (await snapshot()) === before && (await fetch(BASE + a.url)).status === 200 && (await seoOf(slug)).og[0] === CANON + a.url, await snapshot());
  check('…and the storage check agrees: no reset, nothing missing', health3.data.storage.resets === 0 && health3.data.filesMissing === 0, health3.data);

  // ═══════════════════════════════════════════════════════════════════════
  section('Container 4 — a NEW, empty directory (what a deploy without a persistent volume does)');
  await stop(srv); srv = await start(D2);
  const gone = await fetch(BASE + a.url);
  check('TEST I (the fault): the file is not in the new container\'s directory', gone.status === 404);
  const row = await db.blogPost.findUnique({ where: { id } });
  check('TEST H: the post STILL points at cover A — nothing replaced it, in the database or anywhere', row.coverUrl === a.url && row.ogImage === a.url && row.coverAlt === 'Cover A', row);
  seo = await seoOf(slug);
  check('TEST H: the raw HTML still names cover A in og:image, twitter:image and BlogPosting.image — never the site artwork', seo.og[0] === CANON + a.url && seo.tw[0] === CANON + a.url && JSON.stringify([].concat(seo.ld)) === JSON.stringify([CANON + a.url]) && !/\/assets\/blog\/[a-z-]+\.webp/.test(seo.html.split('</head>')[0]), { og: seo.og, ld: seo.ld });
  const miss = await E(`/api/studio/posts/${id}`);
  const list = await E('/api/studio/posts');
  check('TEST H: Studio is told the file is missing (per post and in the list)', miss.data.coverMissing === true && list.data.posts.find((p: any) => p.id === id)?.coverMissing === true);
  const h4 = await E('/api/admin/media/health');
  check('the storage check reports it: files missing, the post named, the directory replaced, not persistent', h4.data.filesMissing >= 1 && h4.data.blogCoversMissing.some((p: any) => p.id === id) && h4.data.storage.resets === 1 && h4.data.persistent === false, h4.data);
  check('the start-up log says so out loud', /uploads directory .* is NEW/i.test(srv.log), srv.log.split('\n').filter(l => /uploads/i.test(l)).join(' | ').slice(0, 200));
  const tweak = await E(`/api/studio/posts/${id}`, 'PUT', { title: `Cover test ${RUN} (typo fixed)`, body: '<p>A post written for the cover test, with a few words in it.</p>', coverUrl: a.url, coverAlt: 'Cover A' });
  check('a live post can still be edited while its file is missing, and keeps its cover address', tweak.status === 200 && tweak.data.coverUrl === a.url, tweak.data);
  const dr = (await E('/api/studio/posts', 'POST', { title: `Cover test three ${RUN}`, body: '<p>words words words</p>', coverUrl: a.url })).data; slugs.push(dr.slug);
  const refuse = await E(`/api/studio/posts/${dr.id}/status`, 'POST', { publish: true });
  check('a draft whose cover file is missing cannot be published, and is told exactly that', refuse.status === 422 && refuse.data.fields?.cover === COVER_UNAVAILABLE_MESSAGE, refuse.data);
  check('the draft\'s stored cover was not touched by the refusal', (await db.blogPost.findUnique({ where: { id: dr.id } })).coverUrl === a.url);

  section('An editor replacing the cover is the only thing that changes it');
  const b = await upload(PNG_B, 'cover-b.png');
  const swapped = await E(`/api/studio/posts/${id}`, 'PUT', { title: `Cover test ${RUN}`, body: '<p>A post written for the cover test, with a few words in it.</p>', coverUrl: b.url, coverAlt: 'Cover B' });
  check('the new cover is saved with its own unique file name (the old name is never reused)', swapped.status === 200 && swapped.data.coverUrl === b.url && b.url !== a.url && swapped.data.ogImage === b.url);
  seo = await seoOf(slug);
  check('the page, og:image, twitter:image and BlogPosting.image all switch to B together', seo.og[0] === CANON + b.url && seo.tw[0] === CANON + b.url && JSON.stringify([].concat(seo.ld)) === JSON.stringify([CANON + b.url]));
  check('the old picture\'s record is kept (nothing was deleted when the cover changed)', !!(await db.mediaAsset.findUnique({ where: { id: a.id } })));
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}\n${srv?.log.slice(-1200) || ''}`);
} finally {
  if (srv) await stop(srv);
  await db.blogPost.deleteMany({ where: { slug: { startsWith: 'cover-test-' } } });
  await db.blogPost.deleteMany({ where: { title: { contains: `${RUN}` } } });
  await db.mediaAsset.deleteMany({ where: { uploadedBy: { contains: `-cover-${RUN}` } } });
  await db.appSetting.deleteMany({ where: { key: 'uploads.storage.v1' } });
  rmSync(D1, { recursive: true, force: true }); rmSync(D2, { recursive: true, force: true });
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
