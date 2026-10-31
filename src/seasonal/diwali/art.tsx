import { useId } from 'react';

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
 * A lit lamp. The flame carries .dw-flame, which is what flickers; the whole
 * drawing scales with the width its class gives it, so the same component is
 * the small lamp along the hero's edge and the large one in its corners.
 */
export function Diya({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 38" aria-hidden="true" focusable="false" className={className}>
      <g className="dw-flame">
        <path d="M15 3.5c3.4 3.3 5 6 5 8.6 0 3-2.2 5.1-5 5.1s-5-2.1-5-5.1c0-2.6 1.6-5.3 5-8.6Z" fill={FLAME} />
        <path d="M15 9.2c1.5 1.6 2.2 2.8 2.2 4 0 1.4-1 2.4-2.2 2.4s-2.2-1-2.2-2.4c0-1.2.7-2.4 2.2-4Z" fill={FLAME_CORE} />
      </g>
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
      <g className="dw-flame">
        <path d="M32 2c7.6 7.4 11.2 13.4 11.2 19.1 0 6.6-4.9 11.3-11.2 11.3s-11.2-4.7-11.2-11.3C20.8 15.4 24.4 9.4 32 2Z" fill={FLAME} />
        <path d="M32 14.2c3.4 3.6 5 6.3 5 8.9 0 3-2.2 5.2-5 5.2s-5-2.2-5-5.2c0-2.6 1.6-5.3 5-8.9Z" fill={FLAME_CORE} />
      </g>
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

/** Eight-fold petals, four rings and a ring of dots. */
const PETAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function Rangoli({ className }: { className?: string }) {
  return (
    <svg viewBox="-60 -60 120 120" aria-hidden="true" focusable="false" className={className}>
      <g stroke="currentColor" fill="none" strokeWidth="1.1">
        <circle r="11" />
        <circle r="25" strokeDasharray="3 5" />
        <circle r="46" />
        <circle r="52" strokeDasharray="1.5 6" />
        {PETAL_ANGLES.map(a => (
          <path key={a} transform={`rotate(${a})`}
            d="M0 -13C9.5 -22 9.5 -36 0 -45C-9.5 -36 -9.5 -22 0 -13Z" />
        ))}
        {PETAL_ANGLES.map(a => (
          <circle key={a} cy="-33" r="1.7" fill="currentColor" stroke="none"
            transform={`rotate(${a + 22.5})`} />
        ))}
      </g>
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
 * A marigold garland, drawn once as a pattern and tiled across the width.
 *
 * The tile holds two flowers so the row alternates between the two oranges
 * instead of repeating one, and a thread along the top that the flowers hang
 * from. preserveAspectRatio is left at its default: the tile is in user units,
 * so the flowers keep their shape at any width and only the count changes.
 */
export function MarigoldGarland({ className }: { className?: string }) {
  const id = `dw-marigold-${useId().replace(/:/g, '')}`;
  const flower = (cx: number, fill: string) => (
    <g>
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <circle key={a} cx={cx} cy="17" r="4.1" fill={fill}
          transform={`rotate(${a} ${cx} 17) translate(0 -5)`} />
      ))}
      <circle cx={cx} cy="17" r="4.4" fill={fill} />
      <circle cx={cx} cy="17" r="1.9" fill={CLAY} opacity="0.5" />
      {/* the short stem up to the thread */}
      <path d={`M${cx} 7.5V5`} stroke={LEAF} strokeWidth="1.4" />
    </g>
  );
  return (
    <svg className={className} aria-hidden="true" focusable="false" role="presentation">
      <defs>
        <pattern id={id} width="56" height="30" patternUnits="userSpaceOnUse">
          <path d="M0 5h56" stroke={LEAF} strokeWidth="1.6" fill="none" />
          {flower(14, MARIGOLD)}
          {flower(42, MARIGOLD_DEEP)}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
