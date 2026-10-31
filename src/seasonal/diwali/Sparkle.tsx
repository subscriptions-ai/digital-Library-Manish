import { useEffect, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { diwaliDay } from './isDiwaliActive';

/**
 * Diwali itself gets one golden sparkle: a soft bloom of light off the centre
 * lamp and a fan of sparks thrown up from it, about three seconds, once.
 *
 * Once means once per browser. It is remembered the moment it is shown, not
 * when it ends, so a reload halfway through does not start it again; storage
 * that is blocked or full only means it might be seen twice, which is the
 * harmless failure. ?seasonal=diwali-day shows it on every page view and
 * remembers nothing, because it exists for screenshots.
 *
 * It is one CSS animation from start to end — no timer. The wrapper's own
 * three-second fade is the clock: when that animation ends, the sparkle is
 * taken out of the page. Paused (tab in the background, hero scrolled away),
 * it simply waits, and the reader still gets the whole three seconds.
 *
 * The sparks are drawn in the hero's decoration layer, behind the words, so
 * they pass under the headline and the search box rather than over them. The
 * close button is the one part a reader can touch, so it is rendered outside
 * that layer, in the hero's top-right corner where there are no words.
 * Reduced motion hides all of it: a burst is nothing but movement.
 */

const KEY = 'seasonal-diwali-2026-sparkle-seen';

/** [angle from straight up in degrees, distance in px, delay in s] */
const SPARKS: [number, number, number][] = Array.from({ length: 26 }, (_, i) => {
  const inner = i % 3 === 2;
  const angle = -78 + ((i * 61) % 157);
  return [angle, inner ? 90 + ((i * 17) % 40) : 150 + ((i * 29) % 90), inner ? 0.18 : ((i * 7) % 5) * 0.03];
});

function alreadySeen(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** Whether to show the sparkle on this page view, and a way to end it early. */
export function useDiwaliDaySparkle(enabled: boolean) {
  const day = enabled ? diwaliDay() : null;
  // Read at render, like the greeting band's flag: deciding in an effect would
  // mean one frame without the sparkle and then a start a frame late.
  const [on, setOn] = useState(() => day === 'forced' || (day === 'today' && !alreadySeen()));

  useEffect(() => {
    if (!on || day !== 'today') return;
    try { localStorage.setItem(KEY, '1'); } catch { /* it may show again next time; nothing breaks */ }
  }, [on, day]);

  return { on: on && Boolean(day), stop: () => setOn(false) };
}

export function DiwaliDaySparkle({ onDone }: { onDone: () => void }) {
  return (
    <div className="dw-sparkle"
      onAnimationEnd={e => { if (e.target === e.currentTarget) onDone(); }}>
      <span className="dw-sparkle-bloom" />
      {SPARKS.map(([angle, distance, delay], i) => (
        <span key={i} className="dw-spark" style={{
          '--dw-a': `${angle}deg`,
          '--dw-r': `${distance}px`,
          animationDelay: `${delay}s`,
        } as CSSProperties} />
      ))}
    </div>
  );
}

export function DiwaliDaySparkleClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="dw-sparkle-close" onClick={onClose} aria-label="Stop the Diwali sparkle">
      <X size={14} aria-hidden="true" />
    </button>
  );
}
