import { useEffect, useState, type RefObject } from 'react';

/**
 * Makes an open drawer behave as a dialog: focus moves into it, Tab stays inside, Escape closes it, the page behind does not scroll, and
 * `onClose` is also called if the window grows past `closeAtMin` px (a drawer that only exists on small screens). Focus is handed back by the caller.
 */
export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void, closeAtMin?: number) {
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => el?.querySelector<HTMLElement>('[data-modal-first]')?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const a = document.activeElement as HTMLElement | null;
      if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    const mq = closeAtMin ? window.matchMedia(`(min-width: ${closeAtMin}px)`) : null;
    const onMq = () => { if (mq?.matches) onClose(); };
    mq?.addEventListener?.('change', onMq);
    return () => { document.removeEventListener('keydown', onKey); mq?.removeEventListener?.('change', onMq); document.body.style.overflow = prevOverflow; };
  }, [open, ref, onClose, closeAtMin]);
}

/** Whether the viewport is at least `px` wide, kept current. */
export function useMinWidth(px: number): boolean {
  const q = `(min-width: ${px}px)`;
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : true);
  const [v, set] = useState(get);
  useEffect(() => { const m = window.matchMedia(q); const h = () => set(m.matches); m.addEventListener?.('change', h); h(); return () => m.removeEventListener?.('change', h); }, [q]);
  return v;
}
