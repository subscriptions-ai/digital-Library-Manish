import { useState } from 'react';
import { X } from 'lucide-react';
import { DiyaMark } from './art';

/**
 * The festival greeting, once, above the header.
 *
 * Dismissing it is remembered for the rest of the window, per browser. The one
 * thing that matters here is WHEN the stored answer is read: at render, in the
 * state initialiser, never in an effect. A band that arrives one frame after
 * the first paint pushes the header and the whole page down — the layout shift
 * this band is otherwise careful not to cause.
 *
 * Storage can be blocked or full, and the accessor itself can throw, so both
 * the read and the write are guarded. If storage is unavailable the greeting
 * simply comes back on the next page view, which is the harmless failure.
 */

const KEY = 'seasonal-diwali-2026-dismissed';

function alreadyDismissed(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function DiwaliAnnouncementBand() {
  const [dismissed, setDismissed] = useState(alreadyDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* the greeting returns next time; nothing breaks */ }
    setDismissed(true);
  };

  return (
    <div className="dw-band px-3 sm:px-4" role="region" aria-label="Festival greeting">
      <DiyaMark className="dw-band-mark" />
      <p className="dw-band-text m-0">
        <span className="dw-band-lead">Light of Knowledge · </span>
        Happy Diwali · Shubh Deepavali
      </p>
      <button type="button" onClick={dismiss} className="dw-band-close" aria-label="Dismiss the festival greeting">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
