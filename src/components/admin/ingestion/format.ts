/** A number that reads as a number, and a dash where nothing is known. Never a made-up zero. */
export const N = (n: any) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString());

/** When something happened, in the terms an operator thinks in. */
export function ago(iso?: string | null) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const clock = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);

/** "in ~2 min", "in ~3 h". */
export function inFuture(iso?: string | null) {
  if (!iso) return null;
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (m <= 0) return 'due now';
  if (m < 60) return `in ~${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `in ~${h} h` : `in ~${Math.round(h / 24)} d`;
}

export function scopeLabel(departments: string[] | undefined | null): { short: string; long: string; all: boolean } {
  const d = Array.isArray(departments) ? departments : [];
  if (!d.length) return { short: 'All departments', long: 'Every department is worked on.', all: true };
  if (d.length === 1) return { short: `${d[0]} only`, long: `Only ${d[0]} is worked on.`, all: false };
  return { short: `${d.length} departments`, long: `Only these ${d.length} departments are worked on: ${d.join(', ')}.`, all: false };
}

// ── Exact times, in the application's timezone ─────────────────────────────
// The server counts days in India time, so the screen shows India time too: the date on a row is the date the summary counted it under.
const IST = 'Asia/Kolkata';

/** "09 Sep 2026 · 3:42 PM" (India time). */
export function exactTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
  return `${date} · ${time}`;
}

/** Today's India date as YYYY-MM-DD. */
export const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** "2026-10-05" → "05 Oct 2026". */
export function dayLabel(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
