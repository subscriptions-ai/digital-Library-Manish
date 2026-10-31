/**
 * Whether the Diwali dressing is on, how bright it is, and where it is allowed.
 *
 * The window is 1–12 November 2026, read in India Standard Time wherever the
 * reader's own clock is set: the festival falls on the same days for everyone
 * looking at this library, so a visitor in another timezone should not see the
 * dressing a day early or keep it a day late.
 *
 * It is not one setting but three, so the fortnight builds and settles rather
 * than switching on and off:
 *
 *   1–5 Nov    lights   the torana and the lamps
 *   6–10 Nov   peak     everything, embers and garlands included
 *   11–12 Nov  fade     back to the torana and the lamps, dimmed
 *
 * Nothing else turns it on except two deliberate overrides, both for showing
 * the theme to somebody rather than for shipping it:
 *   - VITE_SEASONAL_THEME at build time, for a preview deployment;
 *   - ?seasonal=… on any public URL, for one page view, so the theme can be
 *     shown or screenshotted without a rebuild.
 * Both accept `diwali` (peak), `diwali-lights`, `diwali-peak`, `diwali-fade`
 * and `diwali-day` — peak plus the one-off sparkle that belongs to Diwali
 * itself (8 November). `diwali-lite` is kept as an older name for
 * `diwali-lights`. `?seasonal=off` turns it off, which is how the plain page is
 * checked during the window.
 *
 * Outside the window and without an override, every function here says no and
 * nothing seasonal is rendered.
 */

export type DiwaliLevel = 'lights' | 'peak' | 'fade';

/** Inclusive IST calendar days, in order. */
const RAMP: readonly [from: string, to: string, level: DiwaliLevel][] = [
  ['2026-11-01', '2026-11-05', 'lights'],
  ['2026-11-06', '2026-11-10', 'peak'],
  ['2026-11-11', '2026-11-12', 'fade'],
];

/** Diwali itself, the one day the hero gets its sparkle. */
const DIWALI_DAY = '2026-11-08';

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
  return windowLevel(now) !== null;
}

function windowLevel(now: Date): DiwaliLevel | null {
  const day = istDay(now);
  if (!day) return null;
  for (const [from, to, level] of RAMP) if (day >= from && day <= to) return level;
  return null;
}

type Forced = DiwaliLevel | 'day' | 'off';

const NAMED: Record<string, Forced> = {
  diwali: 'peak',
  'diwali-peak': 'peak',
  'diwali-lights': 'lights',
  'diwali-lite': 'lights',
  'diwali-fade': 'fade',
  'diwali-day': 'day',
  off: 'off',
  none: 'off',
};

/** An explicit answer from the URL or the build, or null for "no opinion". */
function override(): Forced | null {
  try {
    const asked = new URLSearchParams(window.location.search).get('seasonal');
    if (asked && NAMED[asked]) return NAMED[asked];
  } catch { /* no window, or a URL we cannot parse: fall through */ }
  try {
    const flag = (import.meta as any).env?.VITE_SEASONAL_THEME;
    if (flag && NAMED[flag]) return NAMED[flag];
  } catch { /* no build-time env: fall through */ }
  return null;
}

/** How bright the dressing is right now, or null when there is none. */
export function diwaliLevel(now: Date = new Date()): DiwaliLevel | null {
  const forced = override();
  if (forced === 'off') return null;
  if (forced === 'day') return 'peak';
  if (forced) return forced;
  return windowLevel(now);
}

export function isDiwaliActive(now: Date = new Date()): boolean {
  return diwaliLevel(now) !== null;
}

/**
 * Whether this is Diwali itself: 'today' on 8 November in IST, 'forced' when
 * ?seasonal=diwali-day asks for it, null otherwise. Any other override — a
 * level, or off — means no: a screenshot asked for at peak should look like
 * peak whatever the date.
 */
export function diwaliDay(now: Date = new Date()): 'today' | 'forced' | null {
  const forced = override();
  if (forced === 'day') return 'forced';
  if (forced) return null;
  return istDay(now) === DIWALI_DAY ? 'today' : null;
}

/**
 * A device that should be spared the decoration that is only movement: the
 * embers, the lanterns and the garlands' sway. It is asked for by the reader
 * (Save-Data) or implied by the hardware (4 GB or less, which Chrome reports
 * in buckets). The level is unchanged — a lite device still gets the lights,
 * the lamps and the glow on the same days as everybody else.
 *
 * Both signals are Chromium-only; a browser that has neither is not lite.
 */
export function isLiteDevice(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return true;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  } catch { /* no navigator: not lite */ }
  return false;
}

/**
 * Where the dressing stays off even while it is on.
 *
 * A reader who has opened a record, a document or a sign-in form is doing one
 * thing, and a festival over it is in the way. These are prefixes of the public
 * routes that are reading or transacting rather than browsing.
 */
const QUIET_PREFIXES = [
  '/article', '/book', '/journal', '/library', '/preview',
  '/login', '/signup', '/unsubscribe',
];

export function isQuietPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return QUIET_PREFIXES.some(p => path === p || path.startsWith(`${p}/`));
}
