/**
 * Date windows and arithmetic for the registration analytics — pure, so the boundaries are tested without a database.
 *
 * Every window is a whole number of Asia/Kolkata calendar days. IST is UTC+05:30 all year (no daylight saving), so the offset is a constant
 * and the arithmetic is done on a shifted clock rather than in the server's own timezone: a server in UTC and one in Delhi agree.
 * Timestamps are stored as UTC instants (Prisma `DateTime`), so a window is `[start, end)` in UTC instants with `end` exclusive.
 */

export const IST_OFFSET_MS = 330 * 60_000;
export const DAY_MS = 86_400_000;
/** The longest custom range, so a typo cannot ask for a decade of daily buckets. */
export const MAX_RANGE_DAYS = 366;

export type RangeKey = 'today' | '7d' | '30d' | 'custom';

export interface DateWindow {
  /** Inclusive: 00:00:00.000 IST of the first day. */
  start: Date;
  /** Exclusive: 00:00:00.000 IST of the day after the last. */
  end: Date;
  /** First and last day, "YYYY-MM-DD" in IST. */
  fromDay: string;
  toDay: string;
  days: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The IST calendar day an instant falls on. */
export const istDay = (d: Date): string => {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
};

/** 00:00 IST of "YYYY-MM-DD" as a UTC instant, or null when the text is not a real calendar date. */
export const istDayStart = (day: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const back = new Date(utc);
  // Date.UTC rolls 31 Feb into March; a round trip catches it.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return new Date(utc - IST_OFFSET_MS);
};

const addDays = (day: string, n: number): string => istDay(new Date(istDayStart(day)!.getTime() + n * DAY_MS + 12 * 3_600_000));

/** A window over whole IST days, both ends inclusive. Null when either day is not a date or the order is wrong. */
export function windowOfDays(fromDay: string, toDay: string): DateWindow | null {
  const start = istDayStart(fromDay), last = istDayStart(toDay);
  if (!start || !last || last < start) return null;
  const days = Math.round((last.getTime() - start.getTime()) / DAY_MS) + 1;
  return { start, end: new Date(last.getTime() + DAY_MS), fromDay, toDay, days };
}

export const todayWindow = (now: Date = new Date()): DateWindow => windowOfDays(istDay(now), istDay(now))!;

/** The last `n` days, today included — so "Last 7 days" is today and the six before it. */
export function lastDaysWindow(n: number, now: Date = new Date()): DateWindow {
  const to = istDay(now);
  return windowOfDays(addDays(to, -(n - 1)), to)!;
}

export type ResolvedWindow = { ok: true; key: RangeKey; window: DateWindow } | { ok: false; error: string };

/** What the filter asked for. A custom range must be real dates, in order, not in the future, and no longer than a year. */
export function resolveWindow(key: string | undefined, from?: string, to?: string, now: Date = new Date()): ResolvedWindow {
  switch (key || '30d') {
    case 'today': return { ok: true, key: 'today', window: todayWindow(now) };
    case '7d': return { ok: true, key: '7d', window: lastDaysWindow(7, now) };
    case '30d': return { ok: true, key: '30d', window: lastDaysWindow(30, now) };
    case 'custom': {
      if (!from || !to) return { ok: false, error: 'A custom range needs both a start and an end date.' };
      const w = windowOfDays(from, to);
      if (!w) return { ok: false, error: 'Dates must be real days, written YYYY-MM-DD, with the start on or before the end.' };
      if (w.fromDay > istDay(now) || w.toDay > istDay(now)) return { ok: false, error: 'A custom range cannot reach into the future.' };
      if (w.days > MAX_RANGE_DAYS) return { ok: false, error: `A custom range can cover at most ${MAX_RANGE_DAYS} days.` };
      return { ok: true, key: 'custom', window: w };
    }
    default: return { ok: false, error: 'Unknown range.' };
  }
}

/** The window of the same length immediately before this one — what growth is measured against. */
export function previousWindow(w: DateWindow): DateWindow {
  return windowOfDays(addDays(w.fromDay, -w.days), addDays(w.fromDay, -1))!;
}

/** One row per day of the window, with days that had no registrations as 0 rather than missing. */
export function zeroFill(rows: { day: string; count: number }[], w: DateWindow): { day: string; count: number }[] {
  const by = new Map(rows.map(r => [r.day, r.count]));
  const out: { day: string; count: number }[] = [];
  for (let i = 0; i < w.days; i++) {
    const day = addDays(w.fromDay, i);
    out.push({ day, count: by.get(day) ?? 0 });
  }
  return out;
}

export type Growth =
  | { kind: 'pct'; pct: number; delta: number }
  /** Nothing before it, something now: a percentage would be infinite, so none is given. */
  | { kind: 'new'; delta: number }
  | { kind: 'flat'; delta: 0 };

/** Change against the previous equivalent period. A zero baseline never produces a percentage. */
export function growth(current: number, previous: number): Growth {
  const delta = current - previous;
  if (previous === 0) return current === 0 ? { kind: 'flat', delta: 0 } : { kind: 'new', delta };
  return { kind: 'pct', pct: Math.round((delta / previous) * 1000) / 10, delta };
}

export type Conversion =
  | { available: true; cohort: number; converted: number; ratePct: number | null }
  | { available: false; reason: string };

/** Share of a cohort that became paid by the cutoff. An empty cohort has no rate, not a 0% one. */
export function conversion(cohort: number, converted: number): Conversion {
  return { available: true, cohort, converted, ratePct: cohort > 0 ? Math.round((converted / cohort) * 1000) / 10 : null };
}
