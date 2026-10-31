import { useEffect, type RefObject } from 'react';

/**
 * Holds a seasonal piece still while it is scrolled out of view.
 *
 * The element is marked data-dw-offscreen and the stylesheet pauses every
 * animation in it. That is worth more than it looks: as long as anything on the
 * page needs a main-thread frame, Chrome services every running animation on
 * every frame, composited or not — measured, the garlands and the shelf below
 * the fold were most of the festival's main-thread time while the reader was
 * looking at the hero. A paused animation costs nothing per frame.
 *
 * One observer serves every piece on the page. Without IntersectionObserver
 * nothing is marked, and everything simply keeps running.
 */

let shared: IntersectionObserver | null = null;

function observer(): IntersectionObserver {
  shared ??= new IntersectionObserver(entries => {
    for (const e of entries) e.target.toggleAttribute('data-dw-offscreen', !e.isIntersecting);
  });
  return shared;
}

/** `when` re-runs the observation when the piece itself is swapped. */
export function usePauseOffscreen(ref: RefObject<Element | null>, when?: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = observer();
    io.observe(el);
    return () => {
      io.unobserve(el);
      el.removeAttribute('data-dw-offscreen');
    };
  }, [ref, when]);
}
