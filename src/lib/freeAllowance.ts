/**
 * The free member's clock.
 *
 * A free account may read for two hours a day, taken as four thirty-minute
 * stretches with a two-hour wait after each. The clock starts when they sign in
 * and stops only when they sign out — closing the tab does not stop it. That is
 * deliberate: the allowance measures time signed in, not time spent reading, so
 * there is nothing to report from the browser and nothing to game by not
 * reporting it.
 *
 * One rule is not literal about signing in: after a wait ends, the next stretch
 * begins when the member comes back, not the moment the wait is over. Without
 * that, someone who shut the laptop without signing out would have all four
 * stretches burn through the afternoon in an empty room, and find nothing left
 * in the evening.
 *
 * All of the reasoning lives in `decide`, which touches no database and no
 * clock of its own: it takes the rows, the moment, and what the member just did,
 * and returns what they are allowed plus the writes that record it. That is what
 * makes two hours of waiting testable in a millisecond.
 */

export const SESSION_MS = 30 * 60_000;
export const HOLD_MS = 2 * 60 * 60_000;
export const SESSIONS_PER_DAY = 4;

/** India keeps one offset all year, so a fixed shift is exact, not an estimate. */
const IST_OFFSET_MS = 5.5 * 60 * 60_000;

/** The IST day a moment falls in, as YYYY-MM-DD. */
export function istDay(at: Date | number): string {
  return new Date(Number(at) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The next midnight in IST — when the day's four stretches come back. */
export function nextIstMidnight(at: Date | number): Date {
  const shifted = new Date(Number(at) + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + 864e5 - IST_OFFSET_MS);
}

export type Session = {
  id?: string;
  day: string;
  number: number;
  usedMs: number;
  runningSince: Date | null;
  completedAt: Date | null;
  holdUntil: Date | null;
};

/**
 * What the member may do now.
 *
 *   running   the clock is going; `endsAt` is when this stretch runs out
 *   paused    they signed out mid-stretch; `remainingMs` is waiting for them
 *   available nothing is running and nothing is stopping them from starting
 *   waiting   the two hours after a stretch; `nextOpensAt` is when it lifts
 *   spent     all four used; `nextOpensAt` is midnight
 */
export type AllowanceState = 'running' | 'paused' | 'available' | 'waiting' | 'spent';

export type Allowance = {
  state: AllowanceState;
  /** True only while reading is permitted this instant. */
  allowed: boolean;
  /** Stretch this is about, 1 to 4. */
  number: number;
  /** When the running stretch runs out. */
  endsAt: Date | null;
  /** What is left of the current stretch, running or paused. */
  remainingMs: number;
  /** When reading becomes possible again — end of a wait, or midnight. */
  nextOpensAt: Date | null;
  /** Time used today across all stretches, live. */
  usedTodayMs: number;
  /** Stretches begun today, including the one in hand. */
  sessionsToday: number;
  /** Of the day's four, how many are still to come. */
  sessionsLeft: number;
};

export type Write =
  | { op: 'complete'; id?: string; completedAt: Date; holdUntil: Date }
  | { op: 'resume'; id?: string; at: Date }
  | { op: 'pause'; id?: string; usedMs: number }
  | { op: 'create'; day: string; number: number; at: Date };

export type Decision = { allowance: Allowance; writes: Write[] };

const liveUsed = (s: Session, now: number) =>
  s.usedMs + (s.runningSince ? Math.max(0, now - Number(s.runningSince)) : 0);

/**
 * Decide where a member stands.
 *
 * `start` says whether what they just did should set the clock going — signing
 * in, or opening the library. Merely asking how much time is left must not,
 * or the countdown on the screen would spend the very thing it reports.
 */
export function decide(
  sessions: Session[],
  nowAt: Date | number,
  opts: { start?: boolean } = {},
): Decision {
  const now = Number(nowAt);
  const writes: Write[] = [];

  // Newest last, so the current stretch is simply the final row.
  const sorted = [...sessions].sort((a, b) => a.day.localeCompare(b.day) || a.number - b.number);
  let current: Session | null = sorted.length ? { ...sorted[sorted.length - 1] } : null;

  // A stretch that ran out while nobody was looking is finished here, at the
  // moment it actually ran out rather than the moment we noticed. Otherwise a
  // member who closed the tab would have their two-hour wait start whenever
  // they next happened to load a page, which would push it later the longer
  // they stayed away.
  if (current && !current.completedAt && liveUsed(current, now) >= SESSION_MS) {
    const completedAt = current.runningSince
      ? new Date(Number(current.runningSince) + (SESSION_MS - current.usedMs))
      : new Date(now);
    const holdUntil = new Date(completedAt.getTime() + HOLD_MS);
    writes.push({ op: 'complete', id: current.id, completedAt, holdUntil });
    current = { ...current, usedMs: SESSION_MS, runningSince: null, completedAt, holdUntil };
    sorted[sorted.length - 1] = current;
  }

  const today = istDay(now);
  const todays = sorted.filter(s => s.day === today);
  const usedTodayMs = todays.reduce((n, s) => n + liveUsed(s, now), 0);
  const sessionsToday = todays.length;

  const base = {
    usedTodayMs,
    sessionsToday,
    sessionsLeft: Math.max(0, SESSIONS_PER_DAY - sessionsToday),
    endsAt: null as Date | null,
    nextOpensAt: null as Date | null,
    remainingMs: 0,
  };

  // ── a stretch is in hand ──────────────────────────────────────────────────
  if (current && !current.completedAt) {
    const remainingMs = SESSION_MS - liveUsed(current, now);

    if (current.runningSince) {
      return {
        allowance: { ...base, state: 'running', allowed: true, number: current.number,
          endsAt: new Date(now + remainingMs), remainingMs },
        writes,
      };
    }
    // Signed out mid-stretch. What is left is kept for them, and starts again
    // the moment they come back — including with a token they kept from before
    // signing out, so signing out is never a way to read for nothing.
    if (opts.start) {
      writes.push({ op: 'resume', id: current.id, at: new Date(now) });
      return {
        allowance: { ...base, state: 'running', allowed: true, number: current.number,
          endsAt: new Date(now + remainingMs), remainingMs },
        writes,
      };
    }
    return {
      allowance: { ...base, state: 'paused', allowed: false, number: current.number, remainingMs },
      writes,
    };
  }

  // ── between stretches ─────────────────────────────────────────────────────
  // The wait is checked before the day's count, so a wait that began late last
  // night still runs its two hours rather than being wiped by midnight.
  if (current?.holdUntil && now < Number(current.holdUntil)) {
    return {
      allowance: { ...base, state: 'waiting', allowed: false, number: current.number,
        nextOpensAt: current.holdUntil },
      writes,
    };
  }

  if (sessionsToday >= SESSIONS_PER_DAY) {
    return {
      allowance: { ...base, state: 'spent', allowed: false, number: SESSIONS_PER_DAY,
        nextOpensAt: nextIstMidnight(now) },
      writes,
    };
  }

  const number = sessionsToday + 1;
  if (opts.start) {
    writes.push({ op: 'create', day: today, number, at: new Date(now) });
    return {
      allowance: { ...base, state: 'running', allowed: true, number,
        sessionsToday: sessionsToday + 1,
        sessionsLeft: Math.max(0, SESSIONS_PER_DAY - (sessionsToday + 1)),
        endsAt: new Date(now + SESSION_MS), remainingMs: SESSION_MS },
      writes,
    };
  }
  return {
    allowance: { ...base, state: 'available', allowed: false, number, remainingMs: SESSION_MS },
    writes,
  };
}

/**
 * Signing out. The clock stops and what is left of the stretch is banked.
 *
 * A stretch that had already run out is finished first, so signing out late
 * cannot rewrite when the wait began.
 */
export function decidePause(sessions: Session[], nowAt: Date | number): Write[] {
  const now = Number(nowAt);
  const { writes } = decide(sessions, now, { start: false });

  const sorted = [...sessions].sort((a, b) => a.day.localeCompare(b.day) || a.number - b.number);
  const current = sorted.length ? sorted[sorted.length - 1] : null;
  if (!current || current.completedAt || !current.runningSince) return writes;
  if (writes.some(w => w.op === 'complete')) return writes;   // it ended on its own

  return [...writes, { op: 'pause', id: current.id, usedMs: Math.min(SESSION_MS, liveUsed(current, now)) }];
}

// ── the database side ────────────────────────────────────────────────────────
// The client is passed in rather than imported so that everything above stays a
// plain function of its arguments, and the test above needs no database at all.

/**
 * Read where a member stands, recording anything that changed.
 *
 * The whole read-decide-write runs inside one transaction holding a lock on the
 * member. Two tabs arriving in the same instant would otherwise each see "no
 * stretch running" and each begin one, spending two of the day's four on a
 * single sitting — a loss the member would never be able to account for.
 */
export async function allowanceFor(
  p: any, userId: string, opts: { start?: boolean } = {},
): Promise<Allowance> {
  return p.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('select pg_advisory_xact_lock(hashtext($1))', userId);
    const rows: Session[] = await tx.freeSession.findMany({
      where: { userId },
      orderBy: [{ day: 'desc' }, { number: 'desc' }],
      take: 8,                       // today's four at most, plus last night's
    });
    const { allowance, writes } = decide(rows, new Date(), opts);
    await applyWrites(tx, userId, writes);
    return allowance;
  });
}

/** Signing out: bank what was used and stop the clock. */
export async function pauseFor(p: any, userId: string): Promise<void> {
  await p.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('select pg_advisory_xact_lock(hashtext($1))', userId);
    const rows: Session[] = await tx.freeSession.findMany({
      where: { userId }, orderBy: [{ day: 'desc' }, { number: 'desc' }], take: 8,
    });
    await applyWrites(tx, userId, decidePause(rows, new Date()));
  });
}

async function applyWrites(tx: any, userId: string, writes: Write[]) {
  for (const w of writes) {
    if (w.op === 'complete') {
      await tx.freeSession.update({
        where: { id: w.id },
        data: { usedMs: SESSION_MS, runningSince: null, completedAt: w.completedAt, holdUntil: w.holdUntil },
      });
    } else if (w.op === 'resume') {
      await tx.freeSession.update({ where: { id: w.id }, data: { runningSince: w.at } });
    } else if (w.op === 'pause') {
      await tx.freeSession.update({ where: { id: w.id }, data: { usedMs: w.usedMs, runningSince: null } });
    } else if (w.op === 'create') {
      await tx.freeSession.create({
        data: { userId, day: w.day, number: w.number, runningSince: w.at, startedAt: w.at },
      });
    }
  }
}
