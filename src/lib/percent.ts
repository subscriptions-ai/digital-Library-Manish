/**
 * value as a share of total, in percent — or null when it cannot be said honestly: either
 * argument is not a finite number, the total is not positive, or the value is negative.
 * Callers show nothing for null; they never print "undefined%" or "NaN%".
 *
 * Whole percent by default; pass `whole: false` to get the exact figure (used before the
 * server balances a set of shares so they add up to 100).
 */
export function safePercentage(value: unknown, total: unknown, whole = true): number | null {
  if (typeof value !== 'number' || typeof total !== 'number') return null;
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0 || value < 0) return null;
  const pct = (value / total) * 100;
  return whole ? Math.round(pct) : pct;
}

/** A percentage already worked out elsewhere, accepted only if it is a real number from 0 to 100. */
export function validPercent(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
}
