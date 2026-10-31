import { useEffect, useState } from 'react';

/**
 * False on the first render, true once the page has loaded and gone idle.
 *
 * For the decoration that is either off screen at first or nothing but
 * movement — the garlands' drawings, the embers, the lanterns. Built with the
 * rest of the page, they made the home page's first frame measurably slower
 * (its first paint and its largest one, the hero photograph, both arrived
 * later); built after the load event, they cost nothing that a reader waits
 * for. Whatever is deferred must already have its space in the layout, so that
 * arriving late moves nothing.
 *
 * Without requestIdleCallback (Safari) it settles for a short timeout after
 * load. Either way it is one call, once — no loop.
 */
export function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let idle = 0;
    let timer = 0;
    const settle = () => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(() => setSettled(true), { timeout: 2000 });
      else timer = window.setTimeout(() => setSettled(true), 300);
    };
    if (document.readyState === 'complete') settle();
    else window.addEventListener('load', settle, { once: true });
    return () => {
      window.removeEventListener('load', settle);
      if (idle) window.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, []);
  return settled;
}
