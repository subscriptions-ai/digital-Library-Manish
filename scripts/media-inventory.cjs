#!/usr/bin/env node
/**
 * READ-ONLY inventory of uploaded media: what is on disk, what the database points at, what is missing, what nothing uses.
 * Plain node, so it runs inside the production container (scripts/ is copied into the image):
 *
 *   node scripts/media-inventory.cjs            # summary + lists
 *   node scripts/media-inventory.cjs --json     # the same as JSON (to keep with a backup)
 *
 * Run it BEFORE a persistent volume is mounted at /app/uploads: mounting a volume over that directory HIDES whatever the current container wrote
 * there, so anything listed under "Existing files" must be copied out first (see the "Back up" line it prints). It writes nothing and deletes nothing.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(process.env.MEDIA_STORAGE_ROOT || process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
const asJson = process.argv.includes('--json');
const p = new PrismaClient();

function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.isFile()) { const st = fs.statSync(full); out.push({ url: '/uploads/' + path.relative(base, full).split(path.sep).join('/'), bytes: st.size, modified: st.mtime.toISOString() }); }
  }
  return out;
}

/** Every /uploads/... address in a piece of text (a post body may hold several). */
const uploadsIn = (text) => [...String(text || '').matchAll(/\/uploads\/[A-Za-z0-9._\-\/%]+/g)].map(m => decodeURIComponent(m[0]));
const localOf = (u) => { if (!u) return null; let s = String(u); try { if (/^https?:\/\//i.test(s)) s = new URL(s).pathname; } catch { return null; } return s.startsWith('/uploads/') ? decodeURIComponent(s) : null; };

(async () => {
  const files = walk(ROOT).filter(f => !f.url.endsWith('/.storage-id'));
  const onDisk = new Set(files.map(f => f.url));

  const posts = await p.blogPost.findMany({ select: { id: true, slug: true, title: true, status: true, coverUrl: true, ogImage: true, body: true } });
  const assets = await p.mediaAsset.findMany({ select: { id: true, url: true, fileName: true, folder: true } });

  const refs = new Map();             // url -> [{ kind, id, label }]
  const add = (url, ref) => { const u = localOf(url); if (!u) return; if (!refs.has(u)) refs.set(u, []); refs.get(u).push(ref); };
  for (const b of posts) {
    add(b.coverUrl, { kind: 'blog cover', id: b.id, label: `${b.slug} (${b.status})` });
    if (b.ogImage && b.ogImage !== b.coverUrl) add(b.ogImage, { kind: 'blog social image', id: b.id, label: b.slug });
    for (const u of uploadsIn(b.body)) add(u, { kind: 'blog body image', id: b.id, label: b.slug });
  }
  for (const a of assets) add(a.url, { kind: 'media library', id: a.id, label: a.folder || '' });

  const blogRefs = [...refs.entries()].filter(([, r]) => r.some(x => x.kind.startsWith('blog')));
  const missing = [...refs.entries()].filter(([u]) => !onDisk.has(u));
  const unreferenced = files.filter(f => !refs.has(f.url) && !f.url.startsWith('/uploads/covers/'));   // covers/ is the book-cover CACHE, refetchable
  const report = {
    root: ROOT, at: new Date().toISOString(),
    existingFiles: files.length, existingBytes: files.reduce((a, f) => a + f.bytes, 0),
    bookCoverCache: files.filter(f => f.url.startsWith('/uploads/covers/')).length,
    referencedByBlogPosts: blogRefs.map(([u, r]) => ({ url: u, onDisk: onDisk.has(u), usedBy: r.filter(x => x.kind.startsWith('blog')).map(x => `${x.kind}: ${x.label}`) })),
    missingReferencedFiles: missing.map(([u, r]) => ({ url: u, usedBy: r.map(x => `${x.kind}: ${x.label}`) })),
    unreferencedFiles: unreferenced.map(f => f.url),
    files,
  };
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }
  console.log(`Media root: ${ROOT}  (read-only report, ${report.at})`);
  console.log(`Existing files: ${report.existingFiles} (${(report.existingBytes / 1048576).toFixed(1)} MB), of which ${report.bookCoverCache} are the book-cover cache (refetchable)`);
  console.log(`Referenced by Blog posts: ${blogRefs.length} address(es); ${blogRefs.filter(([u]) => onDisk.has(u)).length} on disk, ${blogRefs.filter(([u]) => !onDisk.has(u)).length} missing`);
  for (const r of report.referencedByBlogPosts) console.log(`  ${r.onDisk ? 'OK     ' : 'MISSING'} ${r.url}  ← ${r.usedBy.join('; ')}`);
  console.log(`Missing referenced files (any use): ${missing.length}`);
  for (const m of report.missingReferencedFiles) console.log(`  MISSING ${m.url}  ← ${m.usedBy.join('; ')}`);
  console.log(`Unreferenced files: ${unreferenced.length}${unreferenced.length ? ' (kept; nothing is deleted)' : ''}`);
  for (const u of report.unreferencedFiles.slice(0, 50)) console.log(`  ${u}`);
  if (files.length) console.log(`\nBack up BEFORE mounting a volume at ${ROOT} (from the Coolify host):\n  docker cp <container>:${ROOT} ./uploads-backup-$(date +%F)`);
})().catch(e => { console.error(e && e.message ? e.message : e); process.exitCode = 1; }).finally(() => p.$disconnect());
