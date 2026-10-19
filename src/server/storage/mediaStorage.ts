import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { s3Configured, isProduction, getPublicMediaUrl, uploadObject, objectExists, deleteObject, keyFromUrl, isS3Url, coverKey, mediaKey } from './s3Storage.js';

/**
 * Where uploaded media lives, decided in ONE place, so the Blog editor, the Media Library and the Studio never ask "is S3 set up?" themselves.
 *
 *   MEDIA_STORAGE_DRIVER=local-persistent   files on disk under MEDIA_STORAGE_ROOT, which MUST be a persistent volume (Coolify: /app/uploads).
 *   MEDIA_STORAGE_DRIVER=s3                 objects in AWS_S3_BUCKET (the final architecture; already wired, not required now).
 *   (unset)                                 S3 when it is fully configured; otherwise, in development only, plain local files.
 *
 * Production never writes to a directory nobody declared persistent: with no driver and no S3 it REFUSES uploads (and says how to fix it), and a
 * declared persistent directory that cannot be written refuses too. Nothing ever falls back somewhere else silently.
 *
 * Public addresses do not change: a local file is served at /uploads/<path under the root>, e.g. /uploads/media/<name>.
 */

export type Driver = 's3' | 'local-persistent' | 'local-dev' | 'unconfigured';
const APP_DIR = process.cwd();

/** The directory every local upload lives under. MEDIA_STORAGE_ROOT, else the older UPLOAD_DIR (set in the Dockerfile), else ./uploads. */
export const mediaStorageRoot = () => path.resolve(process.env.MEDIA_STORAGE_ROOT || process.env.UPLOAD_DIR || path.join(APP_DIR, 'uploads'));
export const mediaDir = () => path.join(mediaStorageRoot(), 'media');

export function mediaDriver(): { driver: Driver; problem: string | null } {
  const set = (process.env.MEDIA_STORAGE_DRIVER || '').trim().toLowerCase();
  if (set === 's3') return s3Configured() ? { driver: 's3', problem: null } : { driver: 'unconfigured', problem: 'MEDIA_STORAGE_DRIVER is s3, but AWS_S3_BUCKET and its credentials are not all set.' };
  if (set === 'local-persistent') return { driver: 'local-persistent', problem: null };
  if (set) return { driver: 'unconfigured', problem: `MEDIA_STORAGE_DRIVER "${set}" is not one of: local-persistent, s3.` };
  if (s3Configured()) return { driver: 's3', problem: null };
  if (!isProduction()) return { driver: 'local-dev', problem: null };
  return { driver: 'unconfigured', problem: 'Media storage is not configured. Set MEDIA_STORAGE_DRIVER=local-persistent with a persistent volume mounted at MEDIA_STORAGE_ROOT (/app/uploads), or configure S3.' };
}

export const DRIVER_LABEL: Record<Driver, string> = {
  s3: 'AWS S3', 'local-persistent': 'Persistent volume', 'local-dev': 'Local folder (development)', unconfigured: 'Not configured',
};

export type StorageStatus = {
  driver: Driver; label: string; healthy: boolean; problem: string | null;
  root: string | null; mediaDir: string | null; rootExists: boolean | null; writable: boolean | null; mediaDirExists: boolean | null;
  /** True when the root is a different filesystem from its parent directory — what a mounted volume looks like. Null when it cannot be told. */
  separateMount: boolean | null;
};

/** Can this process write here? Asked of the filesystem (access W_OK), so no test file is left behind. A read-only mount answers EROFS. */
const writableDir = (dir: string) => { try { fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; } };

/** Create the root and media directories if they are missing: 0755, owned by whoever runs the app. Never chmod 777. */
export function ensureMediaDirs(): void {
  const root = mediaStorageRoot();
  fs.mkdirSync(root, { recursive: true, mode: 0o755 });
  fs.mkdirSync(path.join(root, 'media'), { recursive: true, mode: 0o755 });
}

/** The health check: driver, and for a local driver whether the directories exist and can be written. Writes nothing. */
export function mediaStorageStatus(): StorageStatus {
  const { driver, problem } = mediaDriver();
  if (driver === 's3' || driver === 'unconfigured') {
    return { driver, label: DRIVER_LABEL[driver], healthy: driver === 's3', problem, root: null, mediaDir: null, rootExists: null, writable: null, mediaDirExists: null, separateMount: null };
  }
  const root = mediaStorageRoot(), md = mediaDir();
  const rootExists = fs.existsSync(root), mediaDirExists = fs.existsSync(md);
  const writable = rootExists && writableDir(root) && (!mediaDirExists || writableDir(md));
  let separateMount: boolean | null = null;
  try { separateMount = fs.statSync(root).dev !== fs.statSync(path.dirname(root)).dev; } catch { /* unknown */ }
  const healthy = rootExists && writable;
  const why = !rootExists ? `The media directory ${root} does not exist.` : !writable ? `The media directory ${root} is not writable by the app.` : null;
  return { driver, label: DRIVER_LABEL[driver], healthy, problem: why, root, mediaDir: md, rootExists, writable, mediaDirExists, separateMount };
}

export class MediaStorageError extends Error { constructor(message: string, public status = 503) { super(message); } }

/** Throws a MediaStorageError (with what to do about it) unless uploads can be stored right now. */
export function assertUploadsPossible(): Driver {
  const { driver, problem } = mediaDriver();
  if (driver === 'unconfigured') throw new MediaStorageError(problem!);
  if (driver === 'local-persistent' || driver === 'local-dev') {
    try { ensureMediaDirs(); } catch (e: any) { throw new MediaStorageError(`The media directory ${mediaStorageRoot()} could not be created (${e?.code || e?.message}). Nothing was saved.`); }
    const st = mediaStorageStatus();
    if (!st.writable) throw new MediaStorageError(`The persistent media volume at ${st.root} is not writable by the app. Nothing was saved; check the volume mount and its permissions.`);
  }
  return driver;
}

/**
 * Store one file and return its permanent public address. Every file gets a NEW name (<uuid>.<ext>), so nothing is ever overwritten and a
 * replaced image has a new address (no stale cached 404 can stick to it). The write is verified (the file is there, at its full size) before
 * the address is returned — callers update their database rows only after this resolves.
 */
export async function uploadMedia(opts: { body: Buffer; ext: string; mime: string; kind: 'cover' | 'media' }): Promise<{ storedName: string; url: string; driver: Driver }> {
  const driver = assertUploadsPossible();
  const ext = opts.ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  if (driver === 's3') {
    const key = opts.kind === 'cover' ? coverKey(ext) : mediaKey(ext);
    await uploadObject(key, opts.body, opts.mime);
    return { storedName: key, url: getPublicMediaUrl(key), driver };
  }
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const target = path.join(mediaDir(), storedName);
  try {
    fs.writeFileSync(target, opts.body, { flag: 'wx', mode: 0o644 });          // wx: never overwrite
    const size = fs.statSync(target).size;
    if (size !== opts.body.length) throw new Error(`wrote ${size} of ${opts.body.length} bytes`);
  } catch (e: any) {
    try { fs.rmSync(target, { force: true }); } catch { /* nothing to undo */ }
    throw new MediaStorageError(`The file could not be saved to ${mediaDir()} (${e?.code || e?.message}). Nothing was changed.`);
  }
  return { storedName, url: getMediaUrl(storedName), driver };
}

/** The public address of a file stored under the media directory. */
export const getMediaUrl = (storedName: string) => `/uploads/media/${storedName}`;

/** The file on disk for a local /uploads/... address, or null for anything else (never a path outside the root). */
export function localPathForUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let p = String(url);
  try { if (/^https?:\/\//i.test(p)) p = new URL(p).pathname; } catch { return null; }
  if (!p.startsWith('/uploads/')) return null;
  const root = mediaStorageRoot();
  const full = path.resolve(root, decodeURIComponent(p.slice('/uploads/'.length)));
  return full.startsWith(root + path.sep) ? full : null;
}

/** Whether the file behind a public address is there: on disk for /uploads/..., in the bucket for an S3 address, null for anything else. */
export async function mediaExists(url: string | null | undefined): Promise<boolean | null> {
  if (!url) return null;
  if (isS3Url(url)) { const k = keyFromUrl(url); return k ? objectExists(k) : null; }
  const local = localPathForUrl(url);
  return local ? fs.existsSync(local) : null;
}

/** Remove the file behind a public address. A missing file is not an error. */
export async function deleteMedia(url: string | null | undefined): Promise<void> {
  if (!url) return;
  if (isS3Url(url)) { const k = keyFromUrl(url); if (k) await deleteObject(k); return; }
  const local = localPathForUrl(url);
  if (local) fs.rmSync(local, { force: true });
}
