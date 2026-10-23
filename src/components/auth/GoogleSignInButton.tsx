import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from '../../lib/google';

/**
 * Google's own "Continue with Google" button, rendered by Google Identity Services.
 *
 * It hands back a credential and nothing more; the page sends that to the server, which verifies it. No scope beyond sign-in is asked
 * for. With no client ID configured the button is simply absent, and if Google's script cannot be loaded the page says so and carries
 * on: email stays available either way.
 */
export function GoogleSignInButton({ onCredential, disabled, text = 'continue_with' }: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
  text?: 'continue_with' | 'signin_with' | 'signup_with';
}) {
  const box = useRef<HTMLDivElement>(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let live = true;
    let observer: ResizeObserver | undefined;
    loadGoogleIdentity()
      .then(id => {
        if (!live || !box.current) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r: { credential?: string }) => { if (r?.credential) handler.current(r.credential); },
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: 'popup',
        });
        // Google draws the button at a fixed pixel width (200–400), so it is drawn again whenever the space changes.
        let drawnAt = 0;
        const draw = () => {
          const el = box.current; if (!el) return;
          const width = Math.max(200, Math.min(400, Math.floor(el.clientWidth)));
          if (width === drawnAt) return;
          drawnAt = width;
          el.replaceChildren();
          id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text, shape: 'rectangular', logo_alignment: 'left', width, locale: 'en' });
        };
        draw();
        setState('ready');
        if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(draw); observer.observe(box.current); }
      })
      .catch(() => { if (live) setState('failed'); });
    return () => { live = false; observer?.disconnect(); };
  }, [text]);

  if (!GOOGLE_CLIENT_ID) return null;
  if (state === 'failed') {
    return <p role="status" className="rounded-lg border border-rule bg-surface-2 px-3 py-2.5 text-center text-sm text-muted">
      Google sign-in is temporarily unavailable. You can continue with email.
    </p>;
  }
  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : undefined} aria-busy={state === 'loading'}>
      {/* Held at the button's height while Google's script loads, so nothing jumps. */}
      <div ref={box} className="flex min-h-[44px] w-full justify-center" />
    </div>
  );
}
