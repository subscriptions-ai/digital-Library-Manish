import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { diwaliLevel, isQuietPath } from './isDiwaliActive';
import { Diya, MarigoldGarland } from './art';
import { usePauseOffscreen } from './pauseOffscreen';

/**
 * A marigold garland hung between two sections, and the row of lamps that sits
 * above the footer.
 *
 * Both are decoration and both are peak-only: on the quieter days the page
 * keeps the torana and the lamps in the hero and nothing else.
 *
 * Each checks the level AND the path for itself. The footer's lamps live in the
 * public layout, which is also the shell for a record page and the sign-in
 * forms — checking only the date lit them up above the footer of an article,
 * which is exactly where the dressing is supposed to stay out of the way. The
 * provider's quiet-path rule does not reach them, because they are a sibling of
 * it rather than a child.
 *
 * Both sway at peak, and both hold still while they are off screen
 * (pauseOffscreen.ts) — which, for the footer's, is nearly always.
 *
 * They are in the flow rather than floating, which is deliberate: a divider
 * that overlaps its neighbours has to be positioned against them, and a fixed
 * 30px strip that is part of the page from the first paint cannot shift it.
 */

/** True only on the brightest days, and only on a page meant for browsing. */
function usePeakHere(): boolean {
  const { pathname } = useLocation();
  return diwaliLevel() === 'peak' && !isQuietPath(pathname);
}

export function DiwaliGarland({ className = '' }: { className?: string }) {
  const peak = usePeakHere();
  const row = useRef<HTMLDivElement>(null);
  usePauseOffscreen(row, peak);
  if (!peak) return null;
  return (
    <div ref={row} className={`dw-garland-row ${className}`} aria-hidden="true">
      <MarigoldGarland className="dw-garland" />
    </div>
  );
}

/** The garland and, under it, five lamps burning along the footer's edge. */
export function DiwaliFooterLights() {
  const peak = usePeakHere();
  const strip = useRef<HTMLDivElement>(null);
  usePauseOffscreen(strip, peak);
  if (!peak) return null;
  return (
    <div ref={strip} className="dw-footer-lights" aria-hidden="true">
      <MarigoldGarland className="dw-garland" />
      <div className="dw-footer-diyas">
        {Array.from({ length: 5 }, (_, i) => <Diya key={i} className="dw-diya dw-diya-glow" />)}
      </div>
    </div>
  );
}
