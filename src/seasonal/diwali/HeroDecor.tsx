import { isDiwaliActive, isQuietPath } from './isDiwaliActive';
import { Diya, Rangoli } from './art';

/**
 * What the hero wears during the festival: a warm glow under the headline, a
 * rangoli in two corners at about a tenth of full strength, and three lamps
 * along the lower edge.
 *
 * It sits inside the hero's own stacking context at z-index 0, before the
 * content block in the markup, so the headline, the search box and both calls
 * to action paint over it. It takes no pointer events and is not in the
 * accessibility tree, so nothing that was clickable or readable before has
 * changed.
 *
 * It checks the window itself rather than trusting the caller: the hero is on
 * the home page, which is never a quiet path, but a component that decorates
 * only when it should is one that cannot be mounted in the wrong place.
 */
export function DiwaliHeroDecor({ pathname = '/' }: { pathname?: string }) {
  if (!isDiwaliActive() || isQuietPath(pathname)) return null;
  return (
    <div className="dw-hero-decor" aria-hidden="true">
      <div className="dw-hero-glow" />
      <Rangoli className="dw-rangoli dw-rangoli-tr" />
      <Rangoli className="dw-rangoli dw-rangoli-bl" />
      <div className="dw-diyas">
        <Diya className="dw-diya" />
        <Diya className="dw-diya" />
        <Diya className="dw-diya" />
      </div>
    </div>
  );
}
