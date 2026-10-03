import { useState } from 'react';

/**
 * A cover for a post that has none, or whose picture no longer loads.
 *
 * It is drawn, not fetched: the same slug always gives the same artwork, so a
 * post keeps its look from one visit to the next, and no two posts share one.
 * Nothing here can 404.
 */

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A small seeded generator, so the drawing is repeatable. */
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pairs of (ground, ink, highlight), kept close to the site's own teal and navy.
const PALETTES = [
  ['#0f3d44', '#1d6b73', '#f2b84b'],
  ['#14213d', '#2f4b8a', '#8fb8ff'],
  ['#1f3a34', '#3f7d6b', '#f4d58d'],
  ['#2b2d42', '#4f5d95', '#e9c46a'],
  ['#102a43', '#1f6f8b', '#99d5c9'],
  ['#3a2e4f', '#6b5b95', '#f5c6a5'],
];

export function GeneratedCover({ seed, className = '' }: { seed: string; className?: string }) {
  const h = hash(seed);
  const r = rng(h);
  const [ground, ink, light] = PALETTES[h % PALETTES.length];
  const kind = (h >>> 8) % 4;
  const W = 600, H = 360;
  const id = `gc${h.toString(36)}`;
  const shapes: React.ReactNode[] = [];

  if (kind === 0) {
    // Rings, as ripples from a point off to one side.
    const cx = 80 + r() * 440, cy = 60 + r() * 240;
    for (let i = 7; i >= 1; i--) {
      shapes.push(<circle key={i} cx={cx} cy={cy} r={i * 46} fill="none" stroke={i % 3 === 0 ? light : ink} strokeOpacity={i % 3 === 0 ? 0.55 : 0.8} strokeWidth={i % 3 === 0 ? 2 : 14} />);
    }
    shapes.push(<circle key="c" cx={cx} cy={cy} r={16} fill={light} />);
  } else if (kind === 1) {
    // Spines on a shelf.
    let x = 24;
    let i = 0;
    while (x < W - 20) {
      const w = 26 + r() * 40, top = 70 + r() * 150;
      shapes.push(<rect key={i} x={x} y={H - 40 - (H - 40 - top)} width={w} height={H - 40 - top} rx={3} fill={i % 4 === 0 ? light : ink} fillOpacity={i % 4 === 0 ? 0.9 : 0.55 + r() * 0.4} />);
      x += w + 6; i++;
    }
    shapes.push(<rect key="shelf" x={0} y={H - 40} width={W} height={6} fill={light} fillOpacity={0.7} />);
  } else if (kind === 2) {
    // Flowing contour lines.
    const phase = r() * Math.PI * 2, amp = 20 + r() * 30;
    for (let i = 0; i < 14; i++) {
      const y0 = 20 + i * 24;
      let d = `M0 ${y0}`;
      for (let x = 0; x <= W; x += 20) d += ` L${x} ${(y0 + Math.sin(x / 70 + phase + i * 0.35) * amp).toFixed(1)}`;
      shapes.push(<path key={i} d={d} fill="none" stroke={i === 7 ? light : ink} strokeOpacity={i === 7 ? 0.95 : 0.7} strokeWidth={i === 7 ? 3 : 2} />);
    }
  } else {
    // A field of nodes, a few of them joined: a citation network.
    const pts = Array.from({ length: 26 }, () => [30 + r() * (W - 60), 30 + r() * (H - 60)]);
    pts.forEach((p, i) => {
      const q = pts[(i * 7 + 3) % pts.length];
      if (i % 2 === 0) shapes.push(<line key={`l${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={ink} strokeOpacity={0.9} strokeWidth={2} />);
    });
    pts.forEach((p, i) => shapes.push(<circle key={`n${i}`} cx={p[0]} cy={p[1]} r={i % 5 === 0 ? 9 : 5} fill={i % 5 === 0 ? light : ink} />));
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ground} />
          <stop offset="1" stopColor={ink} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={ground} />
      <rect width={W} height={H} fill={`url(#${id})`} />
      {shapes}
    </svg>
  );
}

/** Locally hosted artwork selected by article topic when the supplied cover is unavailable. */
export function blogCoverFor(seed: string) {
  const topic = seed.toLowerCase();
  if (/find-research|college.*research|research.*college/.test(topic)) return '/assets/blog/college-research.webp';
  if (/academic-journal|peer-review|publishing/.test(topic)) return '/assets/blog/academic-journals.webp';
  if (/transforming|share|sharing/.test(topic)) return '/assets/blog/knowledge-sharing.webp';
  if (/student|importance/.test(topic)) return '/assets/blog/student-library.webp';
  return '/assets/blog/digital-library-features.webp';
}

type PostImageProps = {
  src?: string | null; seed: string; className?: string; loading?: 'lazy' | 'eager';
};

/** Remount the loader when navigating to another post or changing its image URL. */
export function PostImage(props: PostImageProps) {
  return <PostImageLoader key={JSON.stringify([props.src, props.seed])} {...props} />;
}

function PostImageLoader({ src, seed, className = '', loading = 'lazy' }: PostImageProps) {
  const cover = src?.trim();
  const fallback = blogCoverFor(seed);
  const [failed, setFailed] = useState<string[]>([]);
  const image = cover && !failed.includes(cover) ? cover : fallback;
  // Preserve the inline artwork as a final fallback if even a local asset fails.
  if (failed.includes(image)) return <GeneratedCover seed={seed} className={className} />;
  return <img key={image} src={image} alt="" loading={loading} decoding="async"
    onError={() => setFailed(previous => [...previous, image])}
    className={`object-cover ${className}`} />;
}
