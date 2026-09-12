import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Lock, Sparkles } from 'lucide-react';

/**
 * The free member's clock, on screen.
 *
 * A limit nobody can see is indistinguishable from a broken website, and this
 * one has a rule that will feel like theft unless it is said out loud: the clock
 * runs until you sign out, so closing the tab does not stop it. Every state
 * here therefore says what is happening, when it changes, and what to do about
 * it — including the one thing that stops the clock.
 */

export type Allowance = {
  plan: 'Free' | 'Unlimited';
  timed: boolean;
  state?: 'running' | 'paused' | 'available' | 'waiting' | 'spent';
  allowed?: boolean;
  number?: number;
  endsAt?: string | null;
  nextOpensAt?: string | null;
  remainingMs?: number;
  usedTodayMs?: number;
  sessionsToday?: number;
  sessionsLeft?: number;
  sessionsPerDay?: number;
};

/**
 * Asking the time must never spend any of it, which is why the server treats
 * this as a question and not as use. The countdown runs locally between asks so
 * the seconds move without a request a second.
 */
export function useAllowance(pollMs = 30_000) {
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/me/allowance', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (r.ok) setAllowance(await r.json());
    } catch { /* a missed beat is not worth reporting */ }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, pollMs);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh, pollMs]);

  const endsAt = allowance?.endsAt ? Date.parse(allowance.endsAt) : null;
  const opensAt = allowance?.nextOpensAt ? Date.parse(allowance.nextOpensAt) : null;

  return {
    allowance,
    refresh,
    /** Milliseconds left in the running session, counted down locally. */
    msLeft: endsAt ? Math.max(0, endsAt - now) : null,
    /** Milliseconds until the next session, counted down locally. */
    msUntil: opensAt ? Math.max(0, opensAt - now) : null,
  };
}

const two = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** 23:07 while it matters to the second; 1h 40m when it does not. */
export function countdown(ms: number): string {
  if (ms < 60 * 60_000) return `${two(ms / 60_000)}:${two((ms % 60_000) / 1000)}`;
  const h = Math.floor(ms / 3_600_000);
  return `${h}h ${two((ms % 3_600_000) / 60_000)}m`;
}

export const clockTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

/** The chip in the header. Renders nothing for anyone the clock does not apply to. */
export function ReadingClock({ className = '' }: { className?: string }) {
  const { allowance, msLeft, msUntil } = useAllowance();
  if (!allowance?.timed) return null;

  const s = allowance.state;
  const tone =
    s === 'running' ? 'border-accent bg-accent-soft text-accent'
    : s === 'waiting' || s === 'spent' ? 'border-caution bg-caution-soft text-caution'
    : 'border-rule bg-surface-2 text-muted';

  const label =
    s === 'running' ? `${countdown(msLeft ?? 0)} left`
    : s === 'paused' ? `${Math.round((allowance.remainingMs ?? 0) / 60_000)} min kept for you`
    : s === 'available' ? 'Ready when you are'
    : s === 'waiting' ? `Back at ${clockTime(allowance.nextOpensAt)}`
    : 'Today’s two hours are used';

  const title =
    s === 'running' ? 'The clock stops when you sign out — closing the tab does not stop it.'
    : s === 'paused' ? 'Signed out mid-session. The rest is waiting for you.'
    : s === 'waiting' ? `Your next session opens in ${countdown(msUntil ?? 0)}.`
    : s === 'spent' ? 'Four sessions used. More after midnight.'
    : 'Thirty minutes, four times a day.';

  return (
    <Link
      to="/dashboard/pro"
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors hover:opacity-80 ${tone} ${className}`}
    >
      {s === 'waiting' || s === 'spent' ? <Lock size={12} /> : <Clock size={12} />}
      <span className="hidden sm:inline">Free ·</span> {label}
    </Link>
  );
}

/**
 * What a member sees instead of the thing they wanted to read.
 *
 * It is the one screen that has to sell Pro, because it is the only moment the
 * member is certain they want more — so the application is one click away and
 * stays reachable while they are locked out.
 */
export function ReadingLimitNotice({
  allowance, msUntil, compact = false,
}: { allowance: Allowance; msUntil?: number | null; compact?: boolean }) {
  const spent = allowance.state === 'spent';
  return (
    <div className={`mx-auto w-full max-w-lg rounded-2xl border border-rule bg-surface p-6 text-center ${compact ? '' : 'my-10'}`}>
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-caution-soft text-caution">
        <Lock size={20} />
      </div>
      <h2 className="font-serif text-xl text-ink">
        {spent ? 'That is today’s two hours' : 'Your reading session has ended'}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {spent
          ? 'A free membership includes four half-hour sessions a day. The next one opens after midnight.'
          : <>Free membership comes in half-hour sessions with a two-hour gap between them.
              {allowance.nextOpensAt && <> The next one opens at <b className="text-ink">{clockTime(allowance.nextOpensAt)}</b>
              {typeof msUntil === 'number' && msUntil > 0 && <> — in {countdown(msUntil)}</>}.</>}</>}
      </p>
      {!spent && typeof allowance.sessionsLeft === 'number' && (
        <p className="mt-1 text-xs text-faint">
          {allowance.sessionsLeft} of {allowance.sessionsPerDay ?? 4} sessions left today
        </p>
      )}

      <Link
        to="/dashboard/pro"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        <Sparkles size={15} /> Apply for Pro — read without a limit
      </Link>
      <p className="mt-3 text-xs text-faint">
        You can still search and browse the whole catalogue while you wait.
      </p>
    </div>
  );
}
