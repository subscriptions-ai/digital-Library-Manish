/**
 * The rules for a blog post's cover picture and for publishing, in one place.
 *
 * The editor and the server both import this file, so what the writer is told
 * before an upload is exactly what the server enforces after it. Nothing here
 * touches the filesystem or the browser: it works on bytes.
 */

export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MAX_MB = 5;
export const COVER_RECOMMENDED = { width: 1600, height: 900 } as const;
/** The ratio every cover is shown at, whatever shape it was uploaded in. */
export const COVER_RATIO = 16 / 9;
export const COVER_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const COVER_ACCEPT = COVER_MIMES.join(',');
export const COVER_ALT_MAX = 200;

/** Longest side, and total pixels, we are willing to hand to a reader's browser. */
const MAX_SIDE = 10000;
const MAX_PIXELS = 60_000_000;
/** Below this many pixels across (after the 16:9 crop) a cover looks soft on a card. */
const SOFT_BELOW = 1200;

export const COVER_REQUIRED_MESSAGE = 'Add a cover image before publishing.';
export const LEGACY_COVER_MESSAGE =
  'Cover image required. Add one to keep this post visually consistent across the blog.';
export const COVER_SOFT_MESSAGE =
  `This image may appear blurry. A ${COVER_RECOMMENDED.width} × ${COVER_RECOMMENDED.height} image is recommended.`;

export type CoverInfo = {
  mime: (typeof COVER_MIMES)[number];
  ext: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
};

export type CoverFail = { ok: false; code: 'empty' | 'too-big' | 'type' | 'unreadable' | 'dimensions'; message: string };
export type CoverCheck = { ok: true; info: CoverInfo; soft: boolean; offRatio: boolean } | CoverFail;

const fail = (code: CoverFail['code'], message: string): CoverFail => ({ ok: false, code, message });

/** Callers narrow with this: the project does not run strict null checks, so `!x.ok` alone will not. */
export const failed = (c: CoverCheck): c is CoverFail => c.ok === false;

const mb = (n: number) => (n / 1048576).toFixed(1);

/** The size gate on its own, so a huge file is refused before it is read into memory. */
export function checkCoverSize(size: number): CoverFail | null {
  if (!size) return fail('empty', 'That file is empty.');
  if (size > COVER_MAX_BYTES) {
    return fail('too-big', `That image is ${mb(size)} MB. The maximum is ${COVER_MAX_MB} MB.`);
  }
  return null;
}

const UNSUPPORTED = 'Use a JPG, PNG or WebP image.';

/**
 * Reads the type and size of an image from its own bytes.
 *
 * The filename and the declared type are never believed: a file is a JPEG, PNG
 * or WebP because it starts like one and carries a size, and for no other reason.
 */
export function sniffImage(b: Uint8Array): CoverInfo | null {
  const n = b.length;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ascii = (at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

  // PNG: 8-byte signature, then the IHDR chunk holds the size.
  if (n > 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
      && ascii(12, 4) === 'IHDR') {
    return { mime: 'image/png', ext: 'png', width: v.getUint32(16), height: v.getUint32(20) };
  }

  // JPEG: FF D8 FF, then walk the segments to the frame header.
  if (n > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < n) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }                       // padding
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: 'image/jpeg', ext: 'jpg', height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
      }
      i += 2 + v.getUint16(i + 2);
    }
    return null;
  }

  // WebP: RIFF container, three ways of storing the size.
  if (n > 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { mime: 'image/webp', ext: 'webp', width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    }
    if (kind === 'VP8L' && b[20] === 0x2f) {
      return {
        mime: 'image/webp', ext: 'webp',
        width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      };
    }
    if (kind === 'VP8X') {
      return {
        mime: 'image/webp', ext: 'webp',
        width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
        height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
      };
    }
  }
  return null;
}

/**
 * Everything we can say about a picture before it is stored.
 * `declared` is what the browser or the data URL claimed; it can only veto.
 */
export function checkCoverImage(bytes: Uint8Array, declared?: string | null): CoverCheck {
  const size = checkCoverSize(bytes.length);
  if (size) return size;

  const claim = (declared || '').toLowerCase().trim();
  // A claim of some other image type is refused outright. No claim at all, or a
  // generic one, is fine: the bytes decide.
  if (claim && claim !== 'application/octet-stream' && !(COVER_MIMES as readonly string[]).includes(claim)) {
    return fail('type', UNSUPPORTED);
  }

  const info = sniffImage(bytes);
  if (!info) return fail('unreadable', claim.startsWith('image/')
    ? 'That file is not a valid JPG, PNG or WebP image.'
    : UNSUPPORTED);

  if (!info.width || !info.height || info.width > MAX_SIDE || info.height > MAX_SIDE || info.width * info.height > MAX_PIXELS) {
    return fail('dimensions', `That image's dimensions are not supported. Keep it under ${MAX_SIDE.toLocaleString('en-US')} pixels on each side.`);
  }
  return { ok: true, info, soft: isSoft(info.width, info.height), offRatio: isOffRatio(info.width, info.height) };
}

/** True when the picture, once cropped to 16:9, is too small to look sharp on a card. */
export function isSoft(width: number, height: number) {
  return Math.min(width, height * COVER_RATIO) < SOFT_BELOW;
}

/** True when 16:9 will visibly trim the picture. */
export function isOffRatio(width: number, height: number) {
  return !!width && !!height && Math.abs(width / height / COVER_RATIO - 1) > 0.08;
}

/**
 * Alt text a person would actually want read out. A filename is what an
 * upload produces by default and is never a description, so it is dropped.
 */
export function cleanAlt(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, COVER_ALT_MAX);
  if (/^[\w\-. ()]+\.(jpe?g|png|webp|gif|avif|bmp|svg|heic)$/i.test(s)) return '';
  return s;
}

/** A cover address we are willing to store and show: ours, or an https/http one. */
export function isUsableCoverUrl(url: unknown): url is string {
  const s = typeof url === 'string' ? url.trim() : '';
  return (/^\/uploads\/[^\s?#]+$/.test(s) && !s.includes('..')) || /^https?:\/\/[^\s]+$/i.test(s);
}

/** Locally hosted artwork chosen by topic when a post has no usable cover. Shared by the page and by the search/social metadata. */
export function blogCoverFor(seed: string) {
  const topic = seed.toLowerCase();
  if (/find-research|college.*research|research.*college/.test(topic)) return '/assets/blog/college-research.webp';
  if (/academic-journal|peer-review|publishing/.test(topic)) return '/assets/blog/academic-journals.webp';
  if (/transforming|share|sharing/.test(topic)) return '/assets/blog/knowledge-sharing.webp';
  if (/student|importance/.test(topic)) return '/assets/blog/student-library.webp';
  return '/assets/blog/digital-library-features.webp';
}

// ── Publishing ──────────────────────────────────────────────────────────────

export type PublishFields = 'title' | 'body' | 'cover';
export type PublishProblems = Partial<Record<PublishFields, string>>;

export const PUBLISH_MESSAGES: Record<PublishFields, string> = {
  title: 'Add a title before publishing.',
  body: 'Write something in the post before publishing.',
  cover: COVER_REQUIRED_MESSAGE,
};

/** Text or a picture: either is a post. A body of empty paragraphs is not. */
export function bodyHasContent(html: string) {
  if (/<img\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim().length > 0;
}

/**
 * What stops a post going live — or a live post being saved.
 * The same three things, and no others, on the client and on the server.
 */
export function publishProblems(p: { title: string; body: string; hasCover: boolean }): PublishProblems {
  const out: PublishProblems = {};
  if (!p.title.trim()) out.title = PUBLISH_MESSAGES.title;
  if (!bodyHasContent(p.body || '')) out.body = PUBLISH_MESSAGES.body;
  if (!p.hasCover) out.cover = PUBLISH_MESSAGES.cover;
  return out;
}
