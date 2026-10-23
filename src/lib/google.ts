/**
 * Google Identity Services: ONE place that knows the client ID, loads the script, and initializes it.
 *
 * The client ID is not baked into the bundle. The server hands it over at runtime (GET /api/public/google-config): it is the very value the
 * server verifies credentials against, so the page and the server cannot disagree, and changing it needs a restart, not a rebuild. (It used
 * to be a VITE_ build variable; a build kept an old, mistyped copy through three deploys.) The ID is public by design: it only says which
 * site is asking. There is no secret in the browser.
 *
 * `google.accounts.id.initialize` runs once per page load, whichever page asks (sign-in, sign-up, React's double effect in development).
 * Pages only register who should hear about a credential.
 */

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  cancel?: () => void;
};
declare global { interface Window { google?: { accounts?: { id?: GoogleId } } } }

export type GoogleConfig = { enabled: boolean; clientId: string };
const OFF: GoogleConfig = { enabled: false, clientId: '' };

let configPromise: Promise<GoogleConfig> | null = null;

/** Asks the server which Google client to use. Once per page load; any failure means Google is simply off and email carries on. */
export function loadGoogleConfig(): Promise<GoogleConfig> {
  configPromise ||= fetch('/api/public/google-config', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : OFF))
    .then(d => (d?.enabled && typeof d.clientId === 'string' && d.clientId.trim() ? { enabled: true, clientId: d.clientId.trim() } : OFF))
    .catch(() => { configPromise = null; return OFF; });
  return configPromise;
}

const SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleId> | null = null;

export function loadGoogleIdentity(timeoutMs = 8000): Promise<GoogleId> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise<GoogleId>((resolve, reject) => {
    const fail = (why: string, s?: HTMLScriptElement) => { loading = null; s?.remove(); reject(new Error(why)); };
    const s = document.createElement('script');
    s.src = SRC; s.async = true; s.defer = true;
    const timer = window.setTimeout(() => fail('timed out', s), timeoutMs);
    s.onload = () => {
      window.clearTimeout(timer);
      const id = window.google?.accounts?.id;
      id ? resolve(id) : fail('unavailable', s);
    };
    s.onerror = () => { window.clearTimeout(timer); fail('blocked', s); };
    document.head.appendChild(s);
  });
  return loading;
}

// Who hears about a credential. Replaced by whichever page is showing the button; GIS itself is initialized only once.
let listener: ((credential: string) => void) | null = null;
let initializedFor: string | null = null;

/**
 * Initializes GIS for `clientId` once and points credentials at `onCredential`. Calling it again (another page, a second effect run) only
 * changes the listener. Returns a function that stops listening, for the page that registered it.
 */
export function initializeGoogleOnce(gsi: GoogleId, clientId: string, onCredential: (credential: string) => void): () => void {
  listener = onCredential;
  if (initializedFor !== clientId) {
    gsi.initialize({
      client_id: clientId,
      callback: (r: { credential?: string }) => { if (r?.credential) listener?.(r.credential); },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
    });
    initializedFor = clientId;
  }
  return () => { if (listener === onCredential) listener = null; };
}
