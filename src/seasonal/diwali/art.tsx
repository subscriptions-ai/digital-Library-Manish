import { Fragment, useId } from 'react';
import { useSettled } from './settled';

/**
 * The drawings: lamps, a marigold garland, a rangoli and a corner mandala, as
 * inline SVG.
 *
 * Flat fills, no gradients and — except for the garland, which repeats — no
 * element ids, so the same drawing can appear several times on a page without
 * two of them pointing at one definition. The garland takes its id from
 * useId(), which is unique per instance.
 *
 * The colours are mixed from the two the public pages already use, --amber and
 * --navy, plus --caution for the deeper marigold orange. There is no new brand
 * colour here and no image file to load.
 *
 * Everything is aria-hidden: it is decoration, and a screen reader announcing
 * "diya" in the middle of the headline would be reading furniture.
 */

/** Terracotta and flame, built from the palette rather than introduced. */
const CLAY = 'color-mix(in srgb, var(--amber) 42%, var(--navy))';
const CLAY_LIP = 'color-mix(in srgb, var(--amber) 58%, var(--navy))';
const FLAME = 'var(--amber)';
const FLAME_CORE = 'color-mix(in srgb, var(--amber) 35%, #ffffff)';
const MARIGOLD = 'var(--amber)';
const MARIGOLD_DEEP = 'color-mix(in srgb, var(--amber) 55%, var(--caution))';
const LEAF = 'color-mix(in srgb, var(--amber) 30%, var(--navy))';

/** The flame alone, for the announcement band. */
export function DiyaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 18" aria-hidden="true" focusable="false" className={className}>
      <path d="M7 1.4c2.6 2.6 3.9 4.7 3.9 6.8 0 2.4-1.7 4.1-3.9 4.1S3.1 10.6 3.1 8.2c0-2.1 1.3-4.2 3.9-6.8Z" fill={FLAME} />
      <path d="M7 5.6c1.2 1.3 1.8 2.3 1.8 3.3 0 1.1-.8 1.9-1.8 1.9s-1.8-.8-1.8-1.9c0-1 .6-2 1.8-3.3Z" fill={FLAME_CORE} />
      <path d="M1.6 13.6h10.8c0 2.4-2.4 4-5.4 4s-5.4-1.6-5.4-4Z" fill={CLAY} />
    </svg>
  );
}

/**
 * A lit lamp. The flame carries .dw-flame, which is what flickers, inside
 * .dw-flame-wick, which is what is lit on load — two elements because two
 * transform animations on one element cannot run on the compositor, and these
 * two would otherwise both run on the main thread for as long as the page is
 * open. The whole drawing scales with the width its class gives it, so the same
 * component is the small lamp along the hero's edge and the large one in its
 * corners.
 */
export function Diya({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 38" aria-hidden="true" focusable="false" className={className}>
      <g className="dw-flame-wick"><g className="dw-flame">
        <path d="M15 3.5c3.4 3.3 5 6 5 8.6 0 3-2.2 5.1-5 5.1s-5-2.1-5-5.1c0-2.6 1.6-5.3 5-8.6Z" fill={FLAME} />
        <path d="M15 9.2c1.5 1.6 2.2 2.8 2.2 4 0 1.4-1 2.4-2.2 2.4s-2.2-1-2.2-2.4c0-1.2.7-2.4 2.2-4Z" fill={FLAME_CORE} />
      </g></g>
      {/* The bowl: a lip, then the body that tapers to the base. */}
      <path d="M2.5 22.5h25c0 1.5-5.6 2.7-12.5 2.7S2.5 24 2.5 22.5Z" fill={CLAY_LIP} />
      <path d="M3.2 24.2h23.6c-.6 5.6-5.6 9.3-11.8 9.3S3.8 29.8 3.2 24.2Z" fill={CLAY} />
    </svg>
  );
}

/**
 * The lamp as it is drawn when it is the size of a fist: the same bowl, a
 * taller flame, and a decorated rim that only reads at that scale. The glow
 * around it is a CSS halo, not part of the drawing.
 */
export function BigDiya({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 76" aria-hidden="true" focusable="false" className={className}>
      <g className="dw-flame-wick"><g className="dw-flame">
        <path d="M32 2c7.6 7.4 11.2 13.4 11.2 19.1 0 6.6-4.9 11.3-11.2 11.3s-11.2-4.7-11.2-11.3C20.8 15.4 24.4 9.4 32 2Z" fill={FLAME} />
        <path d="M32 14.2c3.4 3.6 5 6.3 5 8.9 0 3-2.2 5.2-5 5.2s-5-2.2-5-5.2c0-2.6 1.6-5.3 5-8.9Z" fill={FLAME_CORE} />
      </g></g>
      {/* Rim, then the bowl, then the foot it stands on. */}
      <path d="M4 44h56c0 3.1-12.5 5.6-28 5.6S4 47.1 4 44Z" fill={CLAY_LIP} />
      <path d="M6 47.4h52c-1.4 12.2-12.2 20.3-26 20.3S7.4 59.6 6 47.4Z" fill={CLAY} />
      <path d="M24 68.4h16c0 2.9-3.6 5-8 5s-8-2.1-8-5Z" fill={CLAY_LIP} />
      {/* Three notches on the rim, the one decoration that survives at this size. */}
      <g fill={FLAME} opacity="0.55">
        <circle cx="18" cy="52.5" r="2" />
        <circle cx="32" cy="54.5" r="2" />
        <circle cx="46" cy="52.5" r="2" />
      </g>
    </svg>
  );
}

/**
 * Eight-fold petals, four rings and a ring of dots.
 *
 * It draws itself in on load, the way a rangoli is laid down: the centre ring,
 * the petals one after another, then the outer ring, and the dotted rings and
 * the dots last. The solid strokes carry pathLength="1" so one dash length
 * covers any of them, which is what lets a single stroke-dashoffset animation
 * draw a circle and a petal alike; the dashed rings already have a dash
 * pattern of their own, so they fade in instead. Nothing here is hidden at
 * rest — the stylesheet hides the strokes only inside the animation — so with
 * motion turned off the figure is simply there, whole.
 */
const PETAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function Rangoli({ className }: { className?: string }) {
  return (
    <svg viewBox="-60 -60 120 120" aria-hidden="true" focusable="false" className={className}>
      <g stroke="currentColor" fill="none" strokeWidth="1.1">
        <circle r="11" pathLength={1} className="dw-draw" style={{ animationDelay: '0.1s' }} />
        <circle r="25" strokeDasharray="3 5" className="dw-dots" />
        <circle r="46" pathLength={1} className="dw-draw" style={{ animationDelay: '1.3s' }} />
        <circle r="52" strokeDasharray="1.5 6" className="dw-dots" />
        {PETAL_ANGLES.map((a, k) => (
          <path key={a} transform={`rotate(${a})`} pathLength={1} className="dw-draw"
            style={{ animationDelay: `${(0.3 + k * 0.12).toFixed(2)}s` }}
            d="M0 -13C9.5 -22 9.5 -36 0 -45C-9.5 -36 -9.5 -22 0 -13Z" />
        ))}
        <g className="dw-dots">
          {PETAL_ANGLES.map(a => (
            <circle key={a} cy="-33" r="1.7" fill="currentColor" stroke="none"
              transform={`rotate(${a + 22.5})`} />
          ))}
        </g>
      </g>
    </svg>
  );
}

/**
 * A paper sky lantern: a rounded crown, a body that narrows to the open mouth,
 * and the flame inside the mouth lighting the paper from below. The flame sits
 * within the outline on purpose — drawn underneath it, at this size, the
 * lantern reads as an exclamation mark.
 */
const LANTERN = 'color-mix(in srgb, var(--amber) 62%, var(--caution))';
const LANTERN_LIT = 'color-mix(in srgb, var(--amber) 45%, #ffffff)';

export function Lantern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 36" aria-hidden="true" focusable="false" className={className}>
      <path d="M3.5 7C3.5 2.8 8 1 14 1s10.5 1.8 10.5 6L21.6 30.2c0 1.5-3.4 2.5-7.6 2.5s-7.6-1-7.6-2.5L3.5 7Z" fill={LANTERN} />
      {/* The paper glowing brightest nearest the flame. */}
      <ellipse cx="14" cy="22" rx="6.6" ry="8.4" fill={LANTERN_LIT} opacity="0.75" />
      <path d="M10 3.2 9 30.6M18 3.2l1 27.4" stroke={CLAY} strokeWidth="0.7" opacity="0.35" />
      <ellipse cx="14" cy="30.4" rx="7.6" ry="2.1" fill={CLAY_LIP} />
      <path d="M14 26.4c1.2 1.2 1.8 2.2 1.8 3.1 0 1-.8 1.8-1.8 1.8s-1.8-.8-1.8-1.8c0-.9.6-1.9 1.8-3.1Z" fill={FLAME_CORE} />
    </svg>
  );
}

/** A quarter mandala for the corner of a card. */
export function CornerMandala({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className}>
      <g stroke="currentColor" fill="none" strokeWidth="1">
        <path d="M48 0a48 48 0 0 1-48 48" strokeDasharray="2 4" />
        <path d="M48 12A36 36 0 0 1 12 48" />
        <path d="M48 26a22 22 0 0 1-22 22" strokeDasharray="2 3" />
        {[18, 38, 58, 72].map(a => (
          <path key={a} transform={`rotate(${a} 48 48)`}
            d="M48 10c-5 4-5 11 0 15 5-4 5-11 0-15Z" />
        ))}
      </g>
    </svg>
  );
}

/**
 * One marigold: eight petals round a centre, the darker heart in the middle.
 * The eight petals are one path of eight circles rather than eight elements —
 * every node in a garland is a node the page restyles, and a page holds four
 * garlands.
 */
function marigold(cx: number, cy: number, r: number, fill: string, key?: number) {
  const out = r * 1.14, pr = (r * 0.93).toFixed(2), d2 = (r * 1.86).toFixed(2);
  const petals = PETAL_ANGLES.map(a => {
    const t = (a * Math.PI) / 180;
    const x = cx + out * Math.sin(t) - r * 0.93, y = cy - out * Math.cos(t);
    return `M${x.toFixed(2)} ${y.toFixed(2)}a${pr} ${pr} 0 1 0 ${d2} 0a${pr} ${pr} 0 1 0 -${d2} 0`;
  }).join('');
  return (
    <Fragment key={key}>
      <path d={petals} fill={fill} />
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r * 0.43} fill={CLAY} opacity="0.5" />
    </Fragment>
  );
}

/**
 * A marigold garland, hung in swags across the width.
 *
 * Each swag is a thread drooping between two pins with seven flowers strung
 * along it, alternating the two oranges. A larger flower is tied at every pin.
 * The swag is drawn once, as a pattern, and every swag in the row is a single
 * rect filled with it; the knots are a second pattern tiled at the same pitch,
 * so a row of any width costs the same handful of drawings. A pattern rather
 * than <use>: each <use> clones its drawing into a shadow tree of its own,
 * and ninety-odd clones of eighty nodes made every full style recalculation
 * on the page more than twice as slow.
 *
 * The swags are separate elements so they can sway — at peak, a degree and a
 * half either way, each a beat behind its neighbour, pivoting about a point
 * above the row as if each hung from its own nail. The knots stay still and sit
 * over the joins, so the ends of two swags moving apart never show a gap.
 *
 * SWAGS is enough to cover a 2,700px screen. The stylesheet removes the ones a
 * narrower screen has no room for (a phone keeps seven per row) and the row
 * clips the last part-swag, so there is no resize listener and no second
 * render.
 */
const SWAG_W = 112;
const SWAGS = 24;
/** Where the flowers sit along each swag, as a fraction of its width. */
const SWAG_FLOWERS = [1, 2, 3, 4, 5, 6, 7].map(k => k / 8);

export function MarigoldGarland({ className = '' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const swagId = `dw-swag-${uid}`;
  const knotsId = `dw-knots-${uid}`;
  // The row holds its 30px from the first render; the drawing arrives once the
  // page has settled (settled.ts) and fades in.
  const settled = useSettled();
  if (!settled) return <div className={className} aria-hidden="true" role="presentation" />;
  return (
    <div className={`${className} dw-garland-in`} aria-hidden="true" role="presentation">
      <svg className="dw-garland-knots" focusable="false">
        <defs>
          <pattern id={swagId} width={SWAG_W} height="30" patternUnits="userSpaceOnUse">
            <path d={`M0 4Q${SWAG_W / 2} 22 ${SWAG_W} 4`} stroke={LEAF} strokeWidth="1.5" fill="none" />
            {SWAG_FLOWERS.map((t, k) => marigold(
              SWAG_W * t, 7 + 36 * t * (1 - t), 3.5, k % 2 ? MARIGOLD_DEEP : MARIGOLD, k,
            ))}
          </pattern>
          {/* x shifts the tiling by half a pitch, so a knot centred in its
              tile lands exactly on every join between two swags. */}
          <pattern id={knotsId} x={-SWAG_W / 2} width={SWAG_W} height="30" patternUnits="userSpaceOnUse">
            {/* A bud hangs on a short thread under each knot. */}
            <path d={`M${SWAG_W / 2} 17v5`} stroke={LEAF} strokeWidth="1.2" />
            {marigold(SWAG_W / 2, 25, 2.1, MARIGOLD)}
            {marigold(SWAG_W / 2, 9.5, 4.6, MARIGOLD_DEEP)}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${knotsId})`} />
      </svg>
      {Array.from({ length: SWAGS }, (_, i) => (
        <svg key={i} className="dw-swag" viewBox={`0 0 ${SWAG_W} 30`} focusable="false"
          style={{ animationDelay: `${(-i * 0.45).toFixed(2)}s` }}>
          <rect width={SWAG_W} height="30" fill={`url(#${swagId})`} />
        </svg>
      ))}
    </div>
  );
}
