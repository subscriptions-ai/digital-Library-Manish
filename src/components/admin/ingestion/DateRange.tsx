import { useState } from 'react';
import { Button } from '../../ui';
import { istToday } from './format';

export type RangeKey = 'lifetime' | 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'custom';
export type DateRangeValue = { key: RangeKey; from: string; to: string };
export const LIFETIME: DateRangeValue = { key: 'lifetime', from: '', to: '' };

const PRESETS: [RangeKey, string][] = [
  ['lifetime', 'Lifetime'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['month', 'This month'], ['custom', 'Custom range'],
];
const EARLIEST = '2020-01-01';
const MAX_SPAN_DAYS = 366;

/** The query string for a range. The server turns it into India-day boundaries; the browser never does that arithmetic. */
export const rangeQuery = (r: DateRangeValue) => `range=${r.key}${r.key === 'custom' ? `&from=${r.from}&to=${r.to}` : ''}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: string) => `${d.slice(8)} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const full = (d: string) => `${short(d)} ${d.slice(0, 4)}`;

/**
 * The words for a range — "Today", "05 Oct 2026", "01–12 Oct 2026" — worked out here from what was asked for, so a heading
 * never depends on the server's answer arriving (and is never a placeholder). The server's own label is the same text.
 */
export function rangeLabel(r: DateRangeValue): string {
  switch (r.key) {
    case 'lifetime': return 'Lifetime';
    case 'today': return 'Today';
    case 'yesterday': return 'Yesterday';
    case 'last7': return 'Last 7 days';
    case 'last30': return 'Last 30 days';
    case 'month': return 'This month';
    default:
      if (r.from === r.to) return full(r.to);
      if (r.from.slice(0, 7) === r.to.slice(0, 7)) return `${r.from.slice(8)}–${full(r.to)}`;
      return r.from.slice(0, 4) === r.to.slice(0, 4) ? `${short(r.from)}–${full(r.to)}` : `${full(r.from)}–${full(r.to)}`;
  }
}

/**
 * Did the server apply the range that was asked for? Every answer echoes the range it used. If the echo is missing or
 * different — an older server still running, a bug — the figures must not be shown, because they would be for some
 * other period under a heading that says this one.
 */
export function honoured(asked: DateRangeValue, echo: any): boolean {
  if (!echo || echo.key !== asked.key) return false;
  return asked.key !== 'custom' || (echo.fromDay === asked.from && echo.toDay === asked.to);
}

export const STALE_SERVER = 'The server did not apply the date filter, so no figures are shown rather than ones for the wrong period. Restart the server so it is running the current code.';

/** Same rules the server enforces, so a mistake is explained before a request is made. The server checks again. */
export function checkCustom(from: string, to: string): string | null {
  if (!from || !to) return 'Choose both a From date and a To date.';
  if (from > to) return 'The From date must be on or before the To date.';
  if (from < EARLIEST) return 'Dates before 01 Jan 2020 are not available.';
  if (to > istToday()) return 'The To date cannot be in the future.';
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1 > MAX_SPAN_DAYS) return `Choose a range of at most ${MAX_SPAN_DAYS} days.`;
  return null;
}

/**
 * Preset dropdown; "Custom range" reveals From, To and Apply. Nothing is applied until Apply, so a half-typed range
 * never reloads the list. Changing the applied range makes the list start again from its first page.
 */
export function DateRange({ value, onChange }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void }) {
  const [choice, setChoice] = useState<RangeKey>(value.key);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [error, setError] = useState<string | null>(null);
  const today = istToday();

  const pick = (k: RangeKey) => {
    setChoice(k); setError(null);
    if (k !== 'custom') onChange({ key: k, from: '', to: '' });
  };
  const apply = () => {
    const e = checkCustom(from, to);
    setError(e);
    if (!e) onChange({ key: 'custom', from, to });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input h-9 w-auto py-0 text-[13px]" aria-label="Filter by date" value={choice} onChange={e => pick(e.target.value as RangeKey)}>
        {PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {choice === 'custom' && (
        <>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">From
            <input type="date" className="input h-9 w-auto py-0 text-[13px]" value={from} min={EARLIEST} max={today} onChange={e => setFrom(e.target.value)} aria-invalid={!!error} />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">To
            <input type="date" className="input h-9 w-auto py-0 text-[13px]" value={to} min={EARLIEST} max={today} onChange={e => setTo(e.target.value)} aria-invalid={!!error} />
          </label>
          <Button variant="outline" size="sm" onClick={apply}>Apply</Button>
          {error && <p role="alert" className="basis-full text-[12px] text-alarm">{error}</p>}
        </>
      )}
    </div>
  );
}
