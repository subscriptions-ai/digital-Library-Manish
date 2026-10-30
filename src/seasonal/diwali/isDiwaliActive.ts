/**
 * Whether the Diwali dressing is on, and where it is allowed.
 *
 * The window is 1–12 November 2026, read in India Standard Time wherever the
 * reader's own clock is set: the festival falls on the same days for everyone
 * looking at this library, so a visitor in another timezone should not see the
 * dressing a day early or keep it a day late.
 *
 * Nothing else turns it on except two deliberate overrides, both for showing
 * the theme to somebody rather than for shipping it:
 *   - VITE_SEASONAL_THEME=diwali at build time, for a preview deployment;
 *   - ?seasonal=diwali on any public URL, for one page view, so the theme can
 *     be shown or screenshotted without a rebuild. ?seasonal=off does the
 *     reverse, which is how the plain page is checked during the window.
 *
 * Outside the window and without an override, every function here says no and
 * nothing seasonal is rendered or loaded.
 */

/** Inclusive, as IST calendar days. */
const WINDOW_START = '2026-11-01';
const WINDOW_END = '2026-11-12';

/**
 * Today in India, as YYYY-MM-DD. en-CA is the locale that formats that way, and
 * the format sorts correctly as a plain string, so the comparison below needs
 * no date arithmetic and no library.
 */
export function istDay(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  } catch {
    // A browser without the timezone data is not a reason to break the page;
    // it is a reason not to decorate it.
    return '';
  }
}

export function isInDiwaliWindow(now: Date = new Date()): boolean {
  const day = istDay(now);
  return day >= WINDOW_START && day <= WINDOW_END;
}

/** 'on' and 'off' are the overrides; anything else is "no opinion". */
function override(): 'on' | 'off' | null {
  try {
    const asked = new URLSearchParams(window.location.search).get('seasonal');
    if (asked === 'diwali') return 'on';
    if (asked === 'off' || asked === 'none') return 'off';
  } catch { /* no window, or a URL we cannot parse: fall through */ }
  try {
    if ((import.meta as any).env?.VITE_SEASONAL_THEME === 'diwali') return 'on';
  } catch { /* no build-time env: fall through */ }
  return null;
}

export function isDiwaliActive(now: Date = new Date()): boolean {
  const forced = override();
  if (forced) return forced === 'on';
  return isInDiwaliWindow(now);
}

/**
 * Where the dressing stays off even while it is on.
 *
 * A reader who has opened a record, a document or a sign-in form is doing one
 * thing, and a festival band over it is in the way. These are prefixes of the
 * public routes that are reading or transacting rather than browsing.
 */
const QUIET_PREFIXES = [
  '/article', '/book', '/journal', '/library', '/preview',
  '/login', '/signup', '/unsubscribe',
];

export function isQuietPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return QUIET_PREFIXES.some(p => path === p || path.startsWith(`${p}/`));
}
