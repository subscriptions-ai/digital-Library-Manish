/**
 * The drawings: a diya and a rangoli, as inline SVG.
 *
 * Both are built from plain shapes with flat fills — no gradients, so no
 * element ids, so the same drawing can appear three times on a page without
 * two of them referring to the same definition. The colours come from the
 * public palette's --amber and --navy, mixed; there is no new colour here and
 * no image file to load.
 *
 * Everything is aria-hidden: it is decoration, and a screen reader that
 * announced "diya" in the middle of the headline would be reading furniture.
 */

/** Terracotta, built from the two brand colours rather than introduced. */
const CLAY = 'color-mix(in srgb, var(--amber) 42%, var(--navy))';
const CLAY_LIP = 'color-mix(in srgb, var(--amber) 58%, var(--navy))';
const FLAME = 'var(--amber)';
const FLAME_CORE = 'color-mix(in srgb, var(--amber) 35%, #ffffff)';

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

/** A lit lamp. The flame carries .dw-flame, which is what flickers. */
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

/** Eight-fold petals, three rings and a ring of dots. */
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
