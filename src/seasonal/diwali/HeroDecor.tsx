import { diwaliLevel, isQuietPath } from './isDiwaliActive';
import { BigDiya, Diya, Rangoli } from './art';
import { Torana } from './Torana';
import { Embers } from './Embers';

/**
 * What the hero wears during the festival.
 *
 * From the top down: a string of lights across the upper edge, a rangoli in
 * each lower corner, a warm glow rising off the floor with a vignette around
 * it, a large lamp in each corner, three small ones along the centre, and —
 * at peak only — embers drifting up through it.
 *
 * The whole thing sits inside the hero's own stacking context at z-index 0 and
 * before the content block in the markup, so the headline, the search box and
 * both calls to action paint over it. It takes no pointer events and is not in
 * the accessibility tree: nothing that was clickable or readable before has
 * changed, and the contrast behind the headline is measured rather than
 * assumed — the glow is kept to the lower half, where there are no words.
 *
 * It checks the window and the path itself rather than trusting the caller: the
 * hero is on the home page, which is never a quiet path, but a component that
 * decorates only when it should is one that cannot be mounted in the wrong
 * place.
 */
export function DiwaliHeroDecor({ pathname = '/' }: { pathname?: string }) {
  const level = diwaliLevel();
  if (!level || isQuietPath(pathname)) return null;
  return (
    <div className={`dw-hero-decor dw-level-${level}`} aria-hidden="true">
      {/* The light the scene is lit by, and the darkening at the edges that
          keeps it from washing the corners out. */}
      <div className="dw-hero-glow" />
      <div className="dw-hero-vignette" />

      <Rangoli className="dw-rangoli dw-rangoli-bl" />
      <Rangoli className="dw-rangoli dw-rangoli-br" />

      <Torana />

      {/* One row along the floor: a large lamp at each end of it with the three
          small ones between. The hero's own corners are taken — the slide
          counter sits in one and the carousel buttons and the floating
          WhatsApp and assistant buttons in the other — so the lamps flank the
          centre, which is the one part of that edge with nothing in it. */}
      <div className="dw-diyas">
        <BigDiya className="dw-bigdiya" />
        <Diya className="dw-diya" />
        <Diya className="dw-diya" />
        <Diya className="dw-diya" />
        <BigDiya className="dw-bigdiya" />
      </div>

      {level === 'peak' && <Embers />}
    </div>
  );
}
