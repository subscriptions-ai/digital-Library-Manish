import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';

// ── Configuration ──────────────────────────────────────────────────────────

const bucket = () => process.env.AWS_S3_BUCKET || '';
const region = () => process.env.AWS_REGION || 'ap-south-1';
const prefix = () => process.env.AWS_S3_BLOG_PREFIX || 'blog';
const publicBase = () => process.env.AWS_S3_PUBLIC_BASE_URL || '';

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: region(),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return _client;
}

/** True when the env vars needed for S3 media storage are present. */
export function s3Configured(): boolean {
  return !!(process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

/** True when NODE_ENV is production (or the start script sets it). */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// ── Key generation ─────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

/** Build an S3 object key: `blog/covers/<uuid>.webp` */
export function coverKey(ext: string): string {
  return `${prefix()}/covers/${uuid()}.${ext}`;
}

/** Build an S3 object key: `blog/media/<uuid>.<ext>` */
export function mediaKey(ext: string): string {
  return `${prefix()}/media/${uuid()}.${ext}`;
}

// ── Public URL ─────────────────────────────────────────────────────────────

/** Stable public URL for an S3 object key. Uses CDN base if configured, otherwise direct S3. */
export function getPublicMediaUrl(key: string): string {
  const base = publicBase();
  if (base) return `${base.replace(/\/+$/, '')}/${key}`;
  return `https://${bucket()}.s3.${region()}.amazonaws.com/${key}`;
}

/** True when a URL was produced by this module (points at our S3 bucket or CDN). */
export function isS3Url(url: string): boolean {
  if (!url) return false;
  const base = publicBase();
  if (base && url.startsWith(base.replace(/\/+$/, ''))) return true;
  const b = bucket();
  if (b && url.includes(`${b}.s3.`)) return true;
  if (b && url.includes(`s3.${region()}.amazonaws.com/${b}/`)) return true;
  return false;
}

// ── Operations ─────────────────────────────────────────────────────────────

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Extract the S3 object key from a public URL produced by getPublicMediaUrl(). Returns null for non-S3 URLs. */
export function keyFromUrl(url: string): string | null {
  if (!url) return null;
  const base = publicBase();
  if (base) {
    const stripped = base.replace(/\/+$/, '');
    if (url.startsWith(stripped + '/')) return url.slice(stripped.length + 1);
  }
  const b = bucket();
  const r = region();
  // https://<bucket>.s3.<region>.amazonaws.com/<key>
  const pattern1 = `https://${b}.s3.${r}.amazonaws.com/`;
  if (url.startsWith(pattern1)) return url.slice(pattern1.length);
  // https://s3.<region>.amazonaws.com/<bucket>/<key>
  const pattern2 = `https://s3.${r}.amazonaws.com/${b}/`;
  if (url.startsWith(pattern2)) return url.slice(pattern2.length);
  return null;
}
