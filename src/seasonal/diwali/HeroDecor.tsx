import { memo, useRef, type CSSProperties } from 'react';
import { diwaliLevel, isLiteDevice, isQuietPath } from './isDiwaliActive';
import { usePauseOffscreen } from './pauseOffscreen';
import { useSettled } from './settled';
import { BigDiya, Diya, Rangoli } from './art';
import { Torana } from './Torana';
import { Embers } from './Embers';
import { Lanterns } from './Lanterns';
import { DiwaliDaySparkle, DiwaliDaySparkleClose, useDiwaliDaySparkle } from './Sparkle';

/**
 * What the hero wears during the festival.
 *
 * From the top down: a string of lights across the upper edge, a rangoli in
 * each lower corner, a warm glow rising off the floor with a vignette around
 * it, and a row of lamps along the floor. At peak, embers drift up through it
 * and sky lanterns rise up its right-hand side; on Diwali itself, a sparkle,
 * once. In the last two days only the lights and the lamps are left, dimmed.
 *
 * On load the lamps are lit one at a time, left to right, a fifth of a second
 * apart: each flame grows up out of its wick and a halo blooms behind it, and
 * then it settles into a flicker of its own. The first wave down the string of
 * lights is what switches them on. Once the page has finished loading, the
 * rangoli draws itself in and, at peak, the embers and lanterns drift in.
 *
 * The whole thing sits inside the hero's own stacking context at z-index 0 and
 * before the content block in the markup, so the headline, the search box and
 * both calls to action paint over it. It takes no pointer events and is not in
 * the accessibility tree: nothing that was clickable or readable before has
 * changed, and the contrast behind the headline is measured rather than
 * assumed — the glow is kept to the lower half, where there are no words.
 *
 * It pauses itself while the hero is scrolled out of view (pauseOffscreen.ts);
 * the tab being in the background is the provider's job (DiwaliSeasonal).
 *
 * It is memoised and takes no props that change, so the carousel turning its
 * slide every three seconds does not re-render a hundred decorative nodes.
 *
 * It checks the window and the path itself rather than trusting the caller: the
 * hero is on the home page, which is never a quiet path, but a component that
 * decorates only when it should is one that cannot be mounted in the wrong
 * place.
 */

/** Left to right, the order they are lit in; each keeps its own flicker after. */
const LAMPS: { big: boolean; flicker: number }[] = [
  { big: true, flicker: 3.1 },
  { big: false, flicker: 2.6 },
  { big: false, flicker: 3.3 },
  { big: false, flicker: 2.1 },
  { big: true, flicker: 2.8 },
];
/** When the first lamp is lit, and the gap to the next. */
const LIGHT_AT = 0.35;
const LIGHT_STAGGER = 0.2;

export const DiwaliHeroDecor = memo(function DiwaliHeroDecor({ pathname = '/' }: { pathname?: string }) {
  const level = isQuietPath(pathname) ? null : diwaliLevel();
  const layer = useRef<HTMLDivElement>(null);
  const sparkle = useDiwaliDaySparkle(Boolean(level));
  // Embers, lanterns and the rangoli join once the page has settled
  // (settled.ts), not in the first frame.
  const settled = useSettled();
  usePauseOffscreen(layer, level);

  if (!level) return null;
  const moving = level === 'peak' && !isLiteDevice() && settled;
  const full = level !== 'fade';

  return (
    <>
      <div ref={layer} className={`dw-hero-decor dw-level-${level}`} aria-hidden="true">
        {full && (
          <>
            {/* The light the scene is lit by, and the darkening at the edges
                that keeps it from washing the corners out. */}
            <div className="dw-hero-glow" />
            <div className="dw-hero-vignette" />
            {/* Drawn in once the page has settled: the draw is the one effect
                here that repaints on the main thread, and started with the
                page it held back the hero photograph's first paint. */}
            {settled && <Rangoli className="dw-rangoli dw-rangoli-bl" />}
            {settled && <Rangoli className="dw-rangoli dw-rangoli-br" />}
          </>
        )}

        <Torana />

        {/* One row along the floor: a large lamp at each end of it with the
            three small ones between. The hero's own corners are taken — the
            slide counter sits in one and the carousel buttons and the floating
            WhatsApp and assistant buttons in the other — so the lamps flank the
            centre, which is the one part of that edge with nothing in it. */}
        <div className="dw-diyas">
          {LAMPS.map((lamp, i) => (
            <span key={i} className="dw-lamp" style={{
              '--dw-lit': `${(LIGHT_AT + i * LIGHT_STAGGER).toFixed(2)}s`,
              '--dw-flicker': `${lamp.flicker}s`,
            } as CSSProperties}>
              <span className="dw-lamp-halo" />
              {lamp.big ? <BigDiya className="dw-bigdiya" /> : <Diya className="dw-diya" />}
            </span>
          ))}
        </div>

        {moving && <Embers />}
        {moving && <Lanterns />}
        {sparkle.on && <DiwaliDaySparkle onDone={sparkle.stop} />}
      </div>
      {sparkle.on && <DiwaliDaySparkleClose onClose={sparkle.stop} />}
    </>
  );
});
