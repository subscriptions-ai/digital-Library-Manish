/**
 * The cover-image and publish rules, checked against hand-built file headers.
 * Run: npx tsx scripts/check-blog-cover.ts
 */
import {
  checkCoverImage, cleanAlt, isUsableCoverUrl, publishProblems, bodyHasContent, COVER_MAX_BYTES, failed,
} from '../src/lib/blogCover';

let bad = 0;
const t = (name: string, ok: boolean) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const pad = (a: number[], n = 64) => Uint8Array.from([...a, ...new Array(Math.max(0, n - a.length)).fill(0)]);
const asc = (s: string) => [...s].map(c => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

const png = (w: number, h: number) => pad([0x89, ...asc('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...asc('IHDR'), ...be32(w), ...be32(h)]);
const jpg = (w: number, h: number) => pad([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 0, 0]);
const webpX = (w: number, h: number) => pad([...asc('RIFF'), 0, 0, 0, 0, ...asc('WEBP'), ...asc('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
const webpL = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return pad([...asc('RIFF'), 0, 0, 0, 0, ...asc('WEBP'), ...asc('VP8L'), 5, 0, 0, 0, 0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255]);
};
const webpLossy = (w: number, h: number) => pad([...asc('RIFF'), 0, 0, 0, 0, ...asc('WEBP'), ...asc('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8]);

const ok = (b: Uint8Array, mime?: string) => { const c = checkCoverImage(b, mime); return failed(c) ? null : c; };

t('PNG 1600×900', ok(png(1600, 900), 'image/png')?.info.width === 1600);
t('JPEG 1600×900', ok(jpg(1600, 900), 'image/jpeg')?.info.height === 900);
t('WebP (VP8X) size', ok(webpX(1600, 900), 'image/webp')?.info.width === 1600);
t('WebP (VP8L) size', (() => { const i = ok(webpL(1600, 900))?.info; return i?.width === 1600 && i?.height === 900; })());
t('WebP (VP8) size', (() => { const i = ok(webpLossy(1280, 720))?.info; return i?.width === 1280 && i?.height === 720; })());
t('type comes from bytes, not the claim', ok(png(800, 450), 'application/octet-stream')?.info.mime === 'image/png' && ok(png(800, 450), '')?.info.ext === 'png');
t('a claim of GIF is refused', failed(checkCoverImage(png(800, 450), 'image/gif')));
t('GIF bytes refused', failed(checkCoverImage(pad(asc('GIF89a')), 'image/jpeg')));
t('HTML named like an image refused', failed(checkCoverImage(new TextEncoder().encode('<html><script>alert(1)</script></html>'), 'image/jpeg')));
t('SVG refused', failed(checkCoverImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')));
t('empty refused', failed(checkCoverImage(new Uint8Array(0), 'image/png')));
t('over 5 MB refused', failed(checkCoverImage(new Uint8Array(COVER_MAX_BYTES + 1), 'image/png')));
t('exactly 5 MB is not refused for size', (() => { const b = new Uint8Array(COVER_MAX_BYTES); b.set(png(1600, 900)); return !!ok(b, 'image/png'); })());
t('absurd dimensions refused', failed(checkCoverImage(png(50000, 50000))) && failed(checkCoverImage(png(0, 0))));
t('small image is soft, not refused', ok(jpg(600, 338))?.soft === true);
t('1600×900 is neither soft nor off-ratio', (() => { const c = ok(jpg(1600, 900)); return c?.soft === false && c?.offRatio === false; })());
t('wide image flags off-ratio only', (() => { const c = ok(jpg(2400, 1200)); return c?.offRatio === true && c?.soft === false; })());

t('alt: filename dropped', cleanAlt('IMG_2231.jpg') === '' && cleanAlt('my photo (1).PNG') === '');
t('alt: sentence kept, trimmed, capped', cleanAlt('  A teal   banner ') === 'A teal banner' && cleanAlt('x'.repeat(500)).length === 200);

t('cover url: ours and https ok', isUsableCoverUrl('/uploads/media/a.jpg') && isUsableCoverUrl('https://x.org/a.png'));
t('cover url: junk refused', !isUsableCoverUrl('') && !isUsableCoverUrl('javascript:alert(1)') && !isUsableCoverUrl('/uploads/../etc/passwd') && !isUsableCoverUrl('not a url') && !isUsableCoverUrl(null));

t('body: empty paragraphs are empty', !bodyHasContent('<p></p><p>&nbsp;</p>') && bodyHasContent('<p>hi</p>') && bodyHasContent('<img src="/a.png">'));
t('publish: all three reported', Object.keys(publishProblems({ title: ' ', body: '<p></p>', hasCover: false })).length === 3);
t('publish: cover message is exact', publishProblems({ title: 'a', body: '<p>b</p>', hasCover: false }).cover === 'Add a cover image before publishing.');
t('publish: complete post has no problems', Object.keys(publishProblems({ title: 'a', body: '<p>b</p>', hasCover: true })).length === 0);

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
