import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Share, X } from 'lucide-react';

/**
 * Offers to install the site as an app.
 *
 * Chrome, Edge and Android hand us a `beforeinstallprompt` event, kept until a
 * person asks for it; Safari on iPhone and iPad has no such thing, so it gets
 * instructions instead. Either way it waits a few seconds so it never greets
 * someone who has only just arrived, appears at most once per browsing session,
 * and stays away for a week after "Not Now". Dismissal lives in this browser's
 * localStorage and nowhere else.
 */

const DISMISS_KEY = 'stm_pwa_install_dismissed_until';
const INSTALLED_KEY = 'stm_pwa_installed';
const SHOWN_KEY = 'stm_pwa_prompt_shown';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELAY_MS = 8000;
const STAFF_PREFIXES = ['/admin', '/manager', '/sales', '/studio'];

const store = {
  get: (k: string, area: 'local' | 'session' = 'local') => { try { return (area === 'local' ? localStorage : sessionStorage).getItem(k); } catch { return null; } },
  set: (k: string, v: string, area: 'local' | 'session' = 'local') => { try { (area === 'local' ? localStorage : sessionStorage).setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

// The event can fire before React has mounted anything, so it is caught here.
let deferred: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferred = e; });
}

const isStandalone = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)
  || (navigator as any).standalone === true;

/** Safari on iPhone/iPad — the only iOS browser we give instructions for. */
const isIosSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
};

const dismissedNow = () => Number(store.get(DISMISS_KEY) || 0) > Date.now();

/** The cookie notice gets its answer first; two sheets at the bottom of a phone is one too many. */
const cookieAnswered = () => !!store.get('cookie-consent');

export function InstallWebAppPrompt() {
  const { pathname } = useLocation();
  const [mode, setMode] = useState<'native' | 'ios' | null>(null);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const installButton = useRef<HTMLButtonElement>(null);

  // Work out whether there is anything to offer, then wait before offering it.
  const waited = useRef(false);
  useEffect(() => {
    if (isStandalone() || store.get(INSTALLED_KEY) || dismissedNow() || store.get(SHOWN_KEY, 'session')) return;

    const onInstalled = () => { store.set(INSTALLED_KEY, '1'); store.del(DISMISS_KEY); deferred = null; setGone(true); };
    const decide = () => {
      if (deferred) setMode('native');
      else if (isIosSafari()) setMode('ios');
    };
    // The browser's event can land after the wait is over.
    const late = () => { if (waited.current) decide(); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => { timer = setTimeout(() => { waited.current = true; decide(); setReady(true); }, DELAY_MS); };
    if (cookieAnswered()) start();
    else window.addEventListener('cookie-consent-saved', start, { once: true });
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('beforeinstallprompt', late);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('cookie-consent-saved', start);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('beforeinstallprompt', late);
    };
  }, []);

  const staff = STAFF_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
  const visible = ready && !!mode && !gone && !staff;

  // Once it has been put in front of someone, that is this session's turn.
  useEffect(() => { if (visible) store.set(SHOWN_KEY, '1', 'session'); }, [visible]);

  const dismiss = useCallback(() => { store.set(DISMISS_KEY, String(Date.now() + WEEK_MS)); setGone(true); }, []);

  // On a phone the sheet sits where the Feedback and WhatsApp buttons live, so they step up and over it.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !boxRef.current || window.innerWidth >= 640) return;
    root.style.setProperty('--pwa-offset', `${boxRef.current.offsetHeight}px`);
    return () => { root.style.removeProperty('--pwa-offset'); };
  }, [visible, mode]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, dismiss]);

  const install = async () => {
    if (!deferred) return;
    const ev = deferred; deferred = null;
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') { store.set(INSTALLED_KEY, '1'); store.del(DISMISS_KEY); }
      else store.set(DISMISS_KEY, String(Date.now() + WEEK_MS));
    } catch { /* the browser declined to show it */ }
    setGone(true);
  };

  if (!visible) return null;

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-body"
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-rule bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-modal)]
                 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[380px] sm:rounded-xl"
    >
      <button
        type="button" onClick={dismiss} aria-label="Close install prompt"
        className="btn btn-ghost btn-sm btn-icon absolute right-3 top-3"
      >
        <X size={18} aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div>
          <h2 id="pwa-install-title" className="text-base font-semibold text-ink">Install STM Digital Library</h2>
          <p id="pwa-install-body" className="mt-1 text-sm leading-relaxed text-ink-2">
            {mode === 'ios'
              ? 'To add this app to your Home Screen:'
              : 'Add STM Digital Library to your device for quicker access to journals, books, research resources and your library account.'}
          </p>
          {mode === 'ios' && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
              <li>Tap the Share icon <Share size={14} className="inline -mt-0.5" aria-label="Share" /></li>
              <li>Select “Add to Home Screen”</li>
              <li>Tap “Add”</li>
            </ol>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {mode === 'native' ? (
          <button
            ref={installButton} type="button" onClick={install} autoFocus
            className="btn btn-brand flex-1 min-h-11"
          >
            Install App
          </button>
        ) : (
          <button
            type="button" onClick={dismiss} autoFocus
            className="btn btn-brand flex-1 min-h-11"
          >
            Got it
          </button>
        )}
        <button
          type="button" onClick={dismiss}
          className="btn btn-outline min-h-11"
        >
          Not Now
        </button>
      </div>
    </div>
  );
}
