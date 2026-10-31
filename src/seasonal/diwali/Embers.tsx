/**
 * Embers drifting up off the lamps.
 *
 * Fourteen of them, only at peak. Each animates transform and opacity and
 * nothing else, so the whole field stays on the compositor and never asks the
 * page for a layout or a paint: no canvas, no requestAnimationFrame, no timer.
 *
 * The numbers are derived from the index rather than drawn at random, so the
 * field looks scattered but renders identically every time — which is what
 * makes a screenshot of it worth comparing against the last one.
 *
 * Below 640px the stylesheet keeps the first six; the rest never animate.
 */

const EMBERS = 14;

export function Embers({ className = '' }: { className?: string }) {
  return (
    <div className={`dw-embers ${className}`} aria-hidden="true">
      {Array.from({ length: EMBERS }, (_, i) => (
        <span key={i} className="dw-ember" style={{
          // Spread across the width, with the odd ones nudged off the grid.
          left: `${(i * 97) % 100}%`,
          // The small ones rise faster, the way they would.
          width: `${3 + (i % 3)}px`,
          height: `${3 + (i % 3)}px`,
          animationDuration: `${9 + ((i * 3) % 8)}s`,
          animationDelay: `${-((i * 13) % 17) * 0.8}s`,
          opacity: 0,
        }} />
      ))}
    </div>
  );
}
