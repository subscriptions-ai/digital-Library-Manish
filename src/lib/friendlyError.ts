/**
 * Turns whatever came back from a failed request into a sentence a reader can
 * act on. Server messages written for people (the ones our API composes, like
 * "This account is already signed in on another device or browser.") pass
 * through; anything that looks like a stack, a database error, a status line or
 * "undefined" is replaced with the fallback.
 */
const TECHNICAL = /prisma|invalid `|stack|exception|ECONN|ETIMEDOUT|ENOTFOUND|socket hang up|unexpected token|json|syntaxerror|typeerror|referenceerror|cannot read prop|undefined|null|\bat [\w.]+ \(|internal server error|status code \d{3}|^\s*\d{3}\b|<html|failed to fetch|networkerror|load failed/i;

const BY_STATUS: Record<number, string> = {
  400: 'Some of the details are not valid. Please check them and try again.',
  401: 'Your session has ended. Please sign in again.',
  403: 'You do not have permission to do this.',
  404: 'We could not find what you were looking for.',
  409: 'This conflicts with something that already exists.',
  413: 'That file is too large.',
  429: 'Too many attempts. Please wait a moment and try again.',
};

export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  const e = err as any;
  const status: number | undefined = e?.status ?? e?.response?.status;
  const raw: unknown =
    typeof err === 'string' ? err
      : e?.response?.data?.message ?? e?.response?.data?.error ?? e?.data?.message ?? e?.data?.error
        ?? e?.message ?? e?.error;
  const msg = typeof raw === 'string' ? raw.trim() : '';
  if (msg && msg.length <= 200 && !TECHNICAL.test(msg)) return msg;
  if (status && BY_STATUS[status]) return BY_STATUS[status];
  if (status && status >= 500) return 'The server ran into a problem. Please try again in a moment.';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'We could not reach the server. Check your connection and try again.';
  return fallback;
}
