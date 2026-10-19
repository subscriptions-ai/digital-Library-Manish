#!/usr/bin/env npx tsx
/**
 * Migrate blog media from local /uploads to S3.
 *
 * Usage:
 *   npx tsx scripts/migrate-media-to-s3.ts --dry-run   # audit only
 *   npx tsx scripts/migrate-media-to-s3.ts --apply      # actually migrate
 *
 * Requires: AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, DATABASE_URL
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import {
  s3Configured, uploadObject, objectExists, getPublicMediaUrl, mediaKey, coverKey,
} from '../src/server/storage/s3Storage.js';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

if (!dryRun && !apply) {
  console.log('Usage: npx tsx scripts/migrate-media-to-s3.ts --dry-run | --apply');
  process.exit(1);
}

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(APP_DIR, 'uploads');
const MEDIA_DIR = path.join(UPLOAD_DIR, 'media');

const COVER_MIMES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  pdf: 'application/pdf',
};

async function main() {
  if (!s3Configured()) {
    console.error('S3 is not configured. Set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'APPLY (will migrate)'}`);
  console.log(`Upload dir: ${UPLOAD_DIR}`);
  console.log(`Media dir:  ${MEDIA_DIR}\n`);

  // ── Collect all MediaAssets with local URLs ──
  const assets: any[] = await prisma.mediaAsset.findMany({ take: 10000 });
  const localAssets = assets.filter(a => a.url?.startsWith('/uploads/'));
  const s3Assets = assets.filter(a => /^https?:\/\//.test(a.url || ''));

  // ── Collect all BlogPosts with local coverUrl ──
  const posts: any[] = await (prisma as any).blogPost.findMany({
    where: { coverUrl: { not: null } },
    select: { id: true, title: true, slug: true, coverUrl: true, ogImage: true, status: true },
  });
  const localCoverPosts = posts.filter(p => p.coverUrl?.startsWith('/uploads/'));
  const s3CoverPosts = posts.filter(p => /^https?:\/\//.test(p.coverUrl || ''));
  const externalCoverPosts = posts.filter(p => p.coverUrl && !p.coverUrl.startsWith('/uploads/') && !/^https?:\/\/.*s3/.test(p.coverUrl));

  // ── Audit local files ──
  const fileExists = (url: string): string | null => {
    const rel = url.slice('/uploads/'.length);
    const full = path.join(UPLOAD_DIR, rel);
    return fs.existsSync(full) ? full : null;
  };

  let working = 0, missing = 0, migrated = 0, failed = 0;
  const missingList: string[] = [];

  for (const a of localAssets) {
    if (fileExists(a.url)) working++;
    else { missing++; missingList.push(`  [MISSING] MediaAsset ${a.id}: ${a.url}`); }
  }

  console.log('=== AUDIT ===');
  console.log(`Total MediaAsset records:    ${assets.length}`);
  console.log(`  Already on S3:             ${s3Assets.length}`);
  console.log(`  Local /uploads:            ${localAssets.length}`);
  console.log(`    Working local files:     ${working}`);
  console.log(`    Missing local files:     ${missing}`);
  console.log(`\nTotal BlogPost covers:       ${posts.length}`);
  console.log(`  Already on S3:             ${s3CoverPosts.length}`);
  console.log(`  Local /uploads:            ${localCoverPosts.length}`);
  console.log(`  External (non-S3):         ${externalCoverPosts.length}`);

  if (missingList.length) {
    console.log('\nMissing files:');
    missingList.forEach(l => console.log(l));
  }

  if (dryRun) {
    console.log('\n--- DRY RUN complete. No changes made. Run with --apply to migrate. ---');
    await prisma.$disconnect();
    return;
  }

  // ── Apply: migrate local assets to S3 ──
  console.log('\n=== MIGRATING ===');

  for (const asset of localAssets) {
    const localPath = fileExists(asset.url);
    if (!localPath) {
      console.log(`[SKIP] ${asset.url} — file missing on disk`);
      continue;
    }

    try {
      const buf = fs.readFileSync(localPath);
      const ext = (asset.ext || path.extname(localPath).slice(1) || 'bin').toLowerCase();
      const mime = asset.mimeType || COVER_MIMES[ext] || 'application/octet-stream';
      const isCover = asset.folder === 'blog-cover';
      const key = isCover ? coverKey(ext) : mediaKey(ext);

      await uploadObject(key, buf, mime);

      const exists = await objectExists(key);
      if (!exists) {
        console.log(`[FAIL] ${asset.url} — S3 PutObject succeeded but HeadObject failed`);
        failed++;
        continue;
      }

      const newUrl = getPublicMediaUrl(key);

      // Update MediaAsset
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { fileName: key, url: newUrl },
      });

      // Update any BlogPost that references this asset's old URL
      const oldUrl = asset.url;
      await (prisma as any).blogPost.updateMany({
        where: { coverUrl: oldUrl },
        data: { coverUrl: newUrl, ogImage: newUrl },
      });
      // Also update body references
      const bodyPosts: any[] = await (prisma as any).blogPost.findMany({
        where: { body: { contains: oldUrl } },
        select: { id: true, body: true },
      });
      for (const bp of bodyPosts) {
        await (prisma as any).blogPost.update({
          where: { id: bp.id },
          data: { body: bp.body.replaceAll(oldUrl, newUrl) },
        });
      }

      migrated++;
      console.log(`[OK] ${oldUrl} → ${newUrl}`);
    } catch (err: any) {
      console.error(`[FAIL] ${asset.url} — ${err?.message}`);
      failed++;
    }
  }

  console.log('\n=== RESULT ===');
  console.log(`Migrated:  ${migrated}`);
  console.log(`Skipped:   ${missing} (missing files)`);
  console.log(`Failed:    ${failed}`);
  console.log(`Already S3: ${s3Assets.length}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
