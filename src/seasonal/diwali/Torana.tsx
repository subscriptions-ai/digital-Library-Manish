/**
 * The string of lights across the top of the hero.
 *
 * The wire is one quadratic curve and the bulbs sit on it, each positioned from
 * the same equation rather than from a hand-written list — so the count is a
 * number, not twenty-six lines of markup. The curve from (0,1) to (100,1) with
 * its control point at (50,19) puts a bulb at y = 1 + 36·t·(1−t), which is the
 * droop you would get from a wire pinned at both ends.
 *
 * The wire's stroke is marked non-scaling so stretching the viewBox across the
 * page keeps it one pixel thick instead of smearing it.
 *
 * Twenty-six bulbs are always drawn and the stylesheet hides every second one
 * below 640px, leaving thirteen correctly spaced. That is one rule in CSS
 * rather than a resize listener, a media query in JavaScript and a second
 * render — and it cannot disagree with itself halfway through a rotation.
 */

const BULBS = 26;

/** Three colours, repeating: amber, the deeper saffron, and a warm white. */
const TONE = ['a', 'b', 'c'] as const;

export function Torana({ className = '' }: { className?: string }) {
  return (
    <div className={`dw-torana ${className}`} aria-hidden="true">
      <svg className="dw-torana-wire" viewBox="0 0 100 20" preserveAspectRatio="none" focusable="false">
        <path d="M0 1Q50 19 100 1" fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULBS }, (_, i) => {
        const t = i / (BULBS - 1);
        return (
          <span key={i}
            className={`dw-bulb dw-bulb-${TONE[i % TONE.length]}`}
            style={{
              left: `${t * 100}%`,
              top: `${(1 + 36 * t * (1 - t)) * 5}%`,
              // Neighbours never blink together, and the pattern does not
              // repeat often enough to read as a pattern.
              animationDelay: `${((i * 7) % 11) * 0.21}s`,
              animationDuration: `${2.2 + ((i * 5) % 7) * 0.24}s`,
            }} />
        );
      })}
    </div>
  );
}
