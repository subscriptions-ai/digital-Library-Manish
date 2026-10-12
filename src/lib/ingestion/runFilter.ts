/**
 * One definition of "which runs", shared by the run list and the department summary, so the rows listed and the figures
 * above them are always about the same runs — and of "which day", so a run is never counted under one date in the
 * summary and another in the list.
 *
 * Days are Asia/Kolkata days, the way the rest of the application counts them (see freeAllowance.ts, dailyUserDigest.ts).
 * India keeps one offset all year, so a fixed shift is exact. A range is resolved HERE, on the server, to a half-open
 * interval of instants [start, end); the browser only ever sends a preset name or two YYYY-MM-DD dates.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The earliest custom date and the longest custom span accepted: wide enough for any real question, narrow enough to be a sane query. */
export const EARLIEST_DAY = '2020-01-01';
export const MAX_SPAN_DAYS = 366;

export const RANGE_KEYS = ['lifetime', 'today', 'yesterday', 'last7', 'last30', 'month', 'custom'] as const;
export type RangeKey = typeof RANGE_KEYS[number];

/** The IST calendar day a moment falls in, as YYYY-MM-DD. */
export const istDayOf = (at: Date | number): string => new Date(Number(at) + IST_OFFSET_MS).toISOString().slice(0, 10);
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
const addDays = (day: string, n: number) => new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
/** 00:00:00.000 IST of that day, as an instant. */
const istMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
const validDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const short = (day: string) => `${day.slice(8)} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const full = (day: string) => `${short(day)} ${day.slice(0, 4)}`;

/** "05 Oct 2026", "01–12 Oct 2026", "28 Sep–05 Oct 2026", "30 Dec 2025–02 Jan 2026". */
export function rangeText(fromDay: string, toDay: string): string {
  if (fromDay === toDay) return full(toDay);
  if (fromDay.slice(0, 7) === toDay.slice(0, 7)) return `${fromDay.slice(8)}–${full(toDay)}`;
  return fromDay.slice(0, 4) === toDay.slice(0, 4) ? `${short(fromDay)}–${full(toDay)}` : `${full(fromDay)}–${full(toDay)}`;
}

/** Every IST day from `fromDay` to `toDay`, inclusive, oldest first. */
export function eachDay(fromDay: string, toDay: string): string[] {
  const out: string[] = [];
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) out.push(d);
  return out;
}

export type ResolvedRange = {
  key: RangeKey | '24h' | '7d';
  /** Heading words: "Today", "Last 7 days", "1 Oct–12 Oct 2026". */
  label: string;
  /** The days covered, when there is a bound. */
  fromDay: string | null; toDay: string | null;
  /** The dates behind a preset, for secondary text. */
  text: string | null;
  /** Inclusive start and exclusive end, as instants. Null means unbounded on that side. */
  start: Date | null; end: Date | null;
};
export type RangeResult = { ok: true; range: ResolvedRange } | { ok: false; error: string };

const PRESET_LABEL: Record<string, string> = { today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', last30: 'Last 30 days', month: 'This month' };

const dayRange = (key: ResolvedRange['key'], label: string, fromDay: string, toDay: string, showText = true): ResolvedRange => (
  { key, label, fromDay, toDay, text: showText ? rangeText(fromDay, toDay) : null, start: istMidnight(fromDay), end: istMidnight(addDays(toDay, 1)) });

/**
 * `range` is a preset (lifetime, today, yesterday, last7, last30, month) or "custom" with `from` and `to`.
 * "Last 7 days" and "Last 30 days" are whole calendar days ending today, so they line up with the By-day view.
 * The older `period` (lifetime | 7d | 24h) still works and is a rolling window.
 * Nothing given means lifetime: what the screen did before there were dates.
 */
export function resolveRange(q: { range?: unknown; from?: unknown; to?: unknown; period?: unknown }, now: Date = new Date()): RangeResult {
  const today = istDayOf(now);
  const raw = typeof q.range === 'string' && q.range ? q.range : undefined;

  if (!raw && q.period !== undefined) {
    if (q.period === 'lifetime') return { ok: true, range: { key: 'lifetime', label: 'Lifetime', fromDay: null, toDay: null, text: null, start: null, end: null } };
    if (q.period === '24h') return { ok: true, range: { key: '24h', label: 'Last 24 hours', fromDay: null, toDay: null, text: null, start: new Date(now.getTime() - DAY_MS), end: null } };
    if (q.period === '7d') return { ok: true, range: { key: '7d', label: 'Last 7 days', fromDay: null, toDay: null, text: null, start: new Date(now.getTime() - 7 * DAY_MS), end: null } };
    return { ok: false, error: 'period must be lifetime, 7d or 24h' };
  }

  switch (raw ?? 'lifetime') {
    case 'lifetime': return { ok: true, range: { key: 'lifetime', label: 'Lifetime', fromDay: null, toDay: null, text: null, start: null, end: null } };
    case 'today': return { ok: true, range: dayRange('today', PRESET_LABEL.today, today, today) };
    case 'yesterday': { const y = addDays(today, -1); return { ok: true, range: dayRange('yesterday', PRESET_LABEL.yesterday, y, y) }; }
    case 'last7': return { ok: true, range: dayRange('last7', PRESET_LABEL.last7, addDays(today, -6), today) };
    case 'last30': return { ok: true, range: dayRange('last30', PRESET_LABEL.last30, addDays(today, -29), today) };
    case 'month': return { ok: true, range: dayRange('month', PRESET_LABEL.month, `${today.slice(0, 8)}01`, today) };
    case 'custom': {
      const { from, to } = q;
      if (!validDay(from) || !validDay(to)) return { ok: false, error: 'Choose both a From date and a To date.' };
      if (from > to) return { ok: false, error: 'The From date must be on or before the To date.' };
      if (from < EARLIEST_DAY) return { ok: false, error: `Dates before ${full(EARLIEST_DAY)} are not available.` };
      if (to > today) return { ok: false, error: 'The To date cannot be in the future.' };
      if (dayNumber(to) - dayNumber(from) + 1 > MAX_SPAN_DAYS) return { ok: false, error: `Choose a range of at most ${MAX_SPAN_DAYS} days.` };
      return { ok: true, range: dayRange('custom', rangeText(from, to), from, to, false) };
    }
    default: return { ok: false, error: `range must be one of ${RANGE_KEYS.join(', ')}` };
  }
}

// ── Which runs ───────────────────────────────────────────────────────────────

export type RunFilter = {
  /** A run's department is its own, or else the department of the journal it visited. */
  department?: string | null;
  phase?: string | null;           // articles | books | journals
  source?: string | null;          // exact, as the run log spells it: "DOAB", "OpenAlex", …
  result?: string | null;          // all | added | held | failed | skipped
  start?: Date | null; end?: Date | null;
  /** Pagination: strictly older than this cursor — "<ISO time>|<id>" (a bare ISO time is accepted too). Time alone would skip rows that share a millisecond. */
  before?: string | null;
};

const PHASES: Record<string, string> = { articles: 'Articles', books: 'Books', journals: 'Journals' };
export const normalisePhase = (v: unknown) => (typeof v === 'string' ? PHASES[v.toLowerCase()] || null : null);

/** The "Failed" test, one place, used by the list's Failed filter and by the summary's Failed runs figure. */
export const FAILED_RUN_SQL = `(r."skippedFailed" > 0 or r.error is not null or r.phase = 'Error')`;

/**
 * SQL conditions over `"IngestionRun" r left join "Journal" j on j.id = r."journalId"`. Values go in `params`, never into the text.
 * An unknown phase or result is ignored (as the list always did); an unknown source simply matches nothing.
 */
export function runConditions(f: RunFilter, params: any[]): string[] {
  const out: string[] = []; const p = (v: any) => { params.push(v); return `$${params.length}`; };
  /**
   * `at` is stored as UTC wall-clock time in a column without a time zone. An instant is therefore sent as an ISO string
   * with its Z and converted explicitly to UTC wall-clock time, so the comparison means the same thing whatever time zone
   * the database session happens to be set to. (A bare Date parameter would be read in the session's zone.)
   */
  const at = (d: Date) => `((${p(d.toISOString())}::text)::timestamptz at time zone 'UTC')`;
  const phase = normalisePhase(f.phase);
  if (phase) out.push(`r.phase = ${p(phase)}`);
  if (f.source) out.push(`r.source = ${p(f.source)}`);
  if (f.department) out.push(`coalesce(r.department, j.domain) = ${p(f.department)}`);
  if (f.start) out.push(`r."at" >= ${at(f.start)}`);          // inclusive: 00:00:00.000 IST of the first day
  if (f.end) out.push(`r."at" < ${at(f.end)}`);               // exclusive: 00:00:00.000 IST of the day after the last
  if (f.before) {
    const [iso, id] = f.before.split('|');
    const t = new Date(iso);
    if (!isNaN(t.getTime())) out.push(id ? `(r."at" < ${at(t)} or (r."at" = ${at(t)} and r.id < ${p(id)}))` : `r."at" < ${at(t)}`);
  }
  switch ((f.result || 'all').toLowerCase()) {
    case 'added':   out.push(`(r.added > 0 or r."journalsAccepted" > 0)`); break;
    case 'held':    out.push(`r."skippedHeld" > 0`); break;
    case 'failed':  out.push(FAILED_RUN_SQL); break;
    // Skipped: the pass wrote nothing and nothing failed — a rule refused records, they await review, or there was nothing to do.
    case 'skipped': out.push(`(r.added = 0 and r."skippedHeld" = 0 and r."skippedFailed" = 0 and r."journalsAccepted" = 0 and r.error is null)`,
                             `(r."skippedRejected" > 0 or r."needsReview" > 0 or r.phase = 'Idle' or r.note is not null)`); break;
  }
  return out;
}

export const RUN_FROM = `"IngestionRun" r left join "Journal" j on j.id = r."journalId"`;
