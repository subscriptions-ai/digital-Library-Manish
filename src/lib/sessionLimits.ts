/**
 * How many sign-ins one account may hold at the same time.
 *
 * The rule has always been one. A Super Admin may allow a particular account more, from its Edit User
 * screen; `User.maxConcurrentSessions` holds that, and null means "the system default", which is one.
 * Nothing here knows about subscriptions, departments or allowances: those belong to the account, not to
 * a session, and a second sign-in neither adds to them nor shares them out.
 *
 * "Session" is a sign-in that is valid now: not revoked, not expired. Tabs in one browser share one
 * token and so are one session; a private window that signs in separately is another. A browser cannot
 * tell a device from a window without fingerprinting it, and this does not try.
 */

export const DEFAULT_SESSION_LIMIT = 1;
export const MIN_SESSION_LIMIT = 1;
export const MAX_SESSION_LIMIT = 10;

/** What an account's stored value means. Anything unusable (null, 0, 2.5, 99) means the default, never "more". */
export function effectiveSessionLimit(stored: unknown): number {
  return typeof stored === 'number' && Number.isInteger(stored) && stored >= MIN_SESSION_LIMIT && stored <= MAX_SESSION_LIMIT
    ? stored : DEFAULT_SESSION_LIMIT;
}

/**
 * A limit as a Super Admin's request carries it. `null` is "use the system default". Only a whole number
 * from 1 to 10 is a limit: strings, decimals, NaN, zero, negatives and large numbers are refused.
 */
export function parseSessionLimit(input: unknown): { value: number | null } | { error: string } {
  if (input === null) return { value: null };
  if (typeof input === 'number' && Number.isInteger(input) && input >= MIN_SESSION_LIMIT && input <= MAX_SESSION_LIMIT) return { value: input };
  return { error: `The simultaneous login limit must be a whole number from ${MIN_SESSION_LIMIT} to ${MAX_SESSION_LIMIT}, or the system default.` };
}

export type SignInDecision =
  | 'create'            // room: open a session, leave the others alone
  | 'replace-all'       // open a session after ending every other one (one-login accounts, or a credential change)
  | 'refuse-existing'   // one-login account that is already signed in: the member may choose to end the other
  | 'refuse-limit';     // multi-login account at its limit: nobody is signed out for them

/**
 * Decides one sign-in. `live` is the count of valid sessions. A one-login account behaves exactly as it always
 * has, including the member's own choice to end the other session. An account allowed more is never made to
 * sign anyone out to make room: at its limit the new sign-in is refused. `revokeAll` is for a credential change
 * (email), which ends every old token because they carry the old details.
 */
export function decideSignIn(o: { limit: number; live: number; replaceExisting?: boolean; revokeAll?: boolean }): SignInDecision {
  if (o.revokeAll) return 'replace-all';
  if (o.limit <= 1) return o.live > 0 && !o.replaceExisting ? 'refuse-existing' : 'replace-all';
  return o.live >= o.limit ? 'refuse-limit' : 'create';
}

export const LIMIT_REACHED = {
  code: 'CONCURRENT_LOGIN_LIMIT_REACHED',
  error: 'This account is already signed in on the maximum number of allowed devices. Please sign out from another device or contact the administrator.',
} as const;
