import type { CSSProperties } from 'react';
import { Lantern } from './art';

/**
 * Four sky lanterns rising through the hero, slowly — one crossing takes
 * 25 to 35 seconds — at peak only and never on a lite device.
 *
 * They keep to the right-hand side, from 72% of the width outwards. The words
 * end well short of that on every screen the lanterns are shown on (the copy
 * column is 680px wide; at 1024px it stops at 69%), so a lantern never passes
 * behind a letter and the headline's contrast is never theirs to spend. Below
 * 1024px the copy takes most of the width, so the stylesheet leaves them out.
 *
 * Each lantern is a column the full height of the hero, with the drawing hung
 * below its bottom edge, and the column is what moves: translateY(-100%) is
 * then exactly one hero-height, whatever the hero's height is, so the climb
 * needs no measuring. Inside it the lantern sways on a cycle of its own.
 *
 * Negative delays put each one somewhere along its climb at load, so the sky
 * is not empty for the first half-minute and the four are never in step.
 */

const LANTERNS: { left: number; rise: number; delay: number; sway: number; size: number }[] = [
  { left: 72, rise: 31, delay: -7, sway: 6.2, size: 1 },
  { left: 80, rise: 27, delay: -20, sway: 5.4, size: 0.78 },
  { left: 87, rise: 34, delay: -13, sway: 7, size: 1.12 },
  { left: 93, rise: 25, delay: -2, sway: 5.8, size: 0.84 },
];

export function Lanterns() {
  return (
    <div className="dw-lanterns" aria-hidden="true">
      {LANTERNS.map((l, i) => (
        <span key={i} className="dw-lantern"
          style={{ left: `${l.left}%`, animationDuration: `${l.rise}s`, animationDelay: `${l.delay}s` }}>
          <span className="dw-lantern-sway"
            style={{ animationDuration: `${l.sway}s`, '--dw-size': l.size } as CSSProperties}>
            <Lantern className="dw-lantern-art" />
          </span>
        </span>
      ))}
    </div>
  );
}
