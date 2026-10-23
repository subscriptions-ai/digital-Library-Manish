/**
 * Google Identity Services, loaded on demand.
 *
 * Only the sign-in pages need it, so it is not part of the bundle and not fetched until one of them asks. If the script is blocked
 * (an ad blocker, a firewall, no route to Google) the promise rejects and the page says so; nothing else about the page depends on it.
 * The client ID is public by design (it is how Google knows which site is asking); there is no secret in the browser.
 */

export const GOOGLE_CLIENT_ID: string = ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  cancel?: () => void;
};
declare global { interface Window { google?: { accounts?: { id?: GoogleId } } } }

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
