/**
 * One reading of "what does this account's subscription look like right now", for the card at
 * the foot of every sidebar.
 *
 * The server already answers this differently for each kind of account — an institution's plan,
 * a Solo Learner's plan, and the plain list of subscriptions for everyone else — and every one
 * of them is reduced here to the same five states. The card never inspects those answers; it
 * is told the state, so two screens cannot read the same data two ways.
 *
 * Nothing here prices anything. Rates are the Solo and institution rate files' business, and
 * the card only quotes the Solo rates to a Solo Learner.
 */

export type SubscriptionState = 'FREE' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NO_SUBSCRIPTION';

/** Which product the account belongs to. It decides the wording and where the button goes. */
export type SubscriptionKind = 'solo' | 'institution' | 'member';

/** A subscription this close to its end is "expiring". */
export const EXPIRING_WITHIN_DAYS = 30;

export type SubscriptionSummary = {
  kind: SubscriptionKind;
  state: SubscriptionState;
  /** Whole-library access: there are no departments to count. */
  wholeLibrary: boolean;
  departmentCount: number;
  /** The last day anything running is valid, and the first day any of it ends. */
  validUntil: string | null;
  nextExpiry: string | null;
  /** Departments that end on `nextExpiry`, when it is sooner than `validUntil`. */
  expiringCount: number;
  daysLeft: number | null;
  /** When it last ended, for an expired one. */
  endedOn: string | null;
  /** An institution's users: the number on the plan and its limit (null: no limit). */
  users: { used: number; capacity: number | null } | null;
};

export type RunningDepartment = { name?: string; endDate: string };

const DAY = 86_400_000;
const time = (d: string) => new Date(d).getTime();

/** Whole days from now to a date, counted so that "today" is 0 and "tomorrow" is 1. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const end = new Date(date);
  const a = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / DAY);
}

export const emptySummary = (kind: SubscriptionKind, state: SubscriptionState = 'NO_SUBSCRIPTION'): SubscriptionSummary => ({
  kind, state, wholeLibrary: false, departmentCount: 0, validUntil: null, nextExpiry: null,
  expiringCount: 0, daysLeft: null, endedOn: null, users: null,
});

/**
 * Summarise what is running: departments with their end dates, or whole-library access.
 * `none` is the state when nothing is running — FREE for a person on the free allowance,
 * NO_SUBSCRIPTION for an institution that has bought nothing.
 */
export function summariseRunning(opts: {
  kind: SubscriptionKind;
  departments: RunningDepartment[];
  wholeLibrary?: boolean;
  /** Set when the last subscription ran out, so "expired" is told apart from "never had one". */
  lapsedOn?: string | null;
  none: 'FREE' | 'NO_SUBSCRIPTION';
  users?: SubscriptionSummary['users'];
  now?: Date;
}): SubscriptionSummary {
  const now = opts.now ?? new Date();
  const running = opts.departments.filter(d => d.endDate && time(d.endDate) > now.getTime());
  // Each department once, whichever of several purchases it came from.
  const names = new Set(running.map(d => d.name).filter(Boolean));
  const departmentCount = names.size;

  if (!running.length && !opts.wholeLibrary) {
    const lapsed = opts.lapsedOn && time(opts.lapsedOn) <= now.getTime() ? opts.lapsedOn : null;
    return { ...emptySummary(opts.kind, lapsed ? 'EXPIRED' : opts.none), endedOn: lapsed, users: opts.users ?? null };
  }

  const ends = running.map(d => time(d.endDate));
  const validUntil = ends.length ? new Date(Math.max(...ends)).toISOString() : null;
  const nextExpiry = ends.length ? new Date(Math.min(...ends)).toISOString() : null;
  const daysLeft = nextExpiry ? daysUntil(nextExpiry, now) : null;
  const expiring = daysLeft !== null && daysLeft <= EXPIRING_WITHIN_DAYS;
  const expiringCount = expiring ? running.filter(d => time(d.endDate) === Math.min(...ends)).length : 0;
  return {
    kind: opts.kind,
    state: expiring ? 'EXPIRING' : 'ACTIVE',
    wholeLibrary: !!opts.wholeLibrary,
    departmentCount,
    validUntil,
    nextExpiry,
    expiringCount,
    daysLeft,
    endedOn: null,
    users: opts.users ?? null,
  };
}

/** What a subscription row from /api/user/subscriptions covers. A row with no department is the whole library. */
export function departmentsOfRows(rows: any[], now: Date = new Date()): { departments: RunningDepartment[]; wholeLibrary: boolean; lapsedOn: string | null } {
  const live = rows.filter(r => r.status === 'Active' && r.endDate && time(r.endDate) > now.getTime());
  const departments: RunningDepartment[] = [];
  let wholeLibrary = false;
  for (const r of live) {
    const names: string[] = Array.isArray(r.domains) && r.domains.length ? r.domains : r.domainName ? [r.domainName] : [];
    if (!names.length) wholeLibrary = true;
    names.forEach(name => departments.push({ name, endDate: r.endDate }));
  }
  const ended = rows.filter(r => r.endDate && time(r.endDate) <= now.getTime()).map(r => time(r.endDate));
  return { departments, wholeLibrary, lapsedOn: ended.length ? new Date(Math.max(...ended)).toISOString() : null };
}

/** "05 Oct 2027". */
export function shortDate(d: string): string {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getMonth()]} ${x.getFullYear()}`;
}

/** "in 14 days", "tomorrow", "today". */
export function inDays(days: number): string {
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}
