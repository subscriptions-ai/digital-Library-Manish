/**
 * Embers drifting up off the lamps.
 *
 * Fourteen of them, only at peak and never on a lite device. Each animates
 * transform and opacity and nothing else, so the whole field stays on the
 * compositor and never asks the page for a layout or a paint: no canvas, no
 * requestAnimationFrame, no timer.
 *
 * Two elements per ember, because two motions cannot share one transform: the
 * outer one rises and fades, the inner one sways from side to side on a shorter
 * cycle of its own, so the path wanders rather than running up a ruled line.
 *
 * The numbers are derived from the index rather than drawn at random, so the
 * field looks scattered but renders identically every time — which is what
 * makes a screenshot of it worth comparing against the last one.
 *
 * Below 640px the stylesheet keeps the first six; the rest never animate.
 */

const EMBERS = 14;

export function Embers() {
  return (
    <div className="dw-embers" aria-hidden="true">
      {Array.from({ length: EMBERS }, (_, i) => (
        <span key={i} className="dw-ember" style={{
          // Spread across the width, with the odd ones nudged off the grid.
          left: `${(i * 97) % 100}%`,
          animationDuration: `${9 + ((i * 3) % 8)}s`,
          animationDelay: `${-((i * 13) % 17) * 0.8}s`,
        }}>
          <i className="dw-ember-dot" style={{
            // The small ones rise faster, the way they would.
            width: `${3 + (i % 3)}px`,
            height: `${3 + (i % 3)}px`,
            animationDuration: `${2.4 + (i % 4) * 0.55}s`,
            animationDelay: `${-(i % 5) * 0.6}s`,
          }} />
        </span>
      ))}
    </div>
  );
}
