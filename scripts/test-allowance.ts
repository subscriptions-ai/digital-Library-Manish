/**
 * The free member's clock, checked against a table of situations.
 *
 *   npx tsx scripts/test-allowance.ts
 *
 * Every rule here takes hours to happen and milliseconds to check, which is the
 * whole reason `decide` takes the time as an argument instead of reading a clock.
 * Nothing is written and no database is touched.
 */
import {
  decide, decidePause, istDay, nextIstMidnight,
  SESSION_MS, HOLD_MS, SESSIONS_PER_DAY, type Session,
} from '../src/lib/freeAllowance.js';

const G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', O = '\x1b[0m';
let pass = 0; const failures: string[] = [];

const check = (name: string, got: any, want: any) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log(`  ${G}pass${O}  ${name}`); }
  else { failures.push(name); console.log(`  ${R}FAIL${O}  ${name}\n        want ${b}\n        got  ${a}`); }
};

const MIN = 60_000;
/** 09:30 IST on 12 September 2026. */
const T0 = Date.parse('2026-09-12T04:00:00.000Z');

const session = (o: Partial<Session>): Session => ({
  id: o.id ?? 's1', day: o.day ?? istDay(T0), number: o.number ?? 1,
  usedMs: o.usedMs ?? 0, runningSince: o.runningSince ?? null,
  completedAt: o.completedAt ?? null, holdUntil: o.holdUntil ?? null,
});

const at = (sessions: Session[], now: number, start = false) =>
  decide(sessions, now, { start });

console.log('\nThe free member’s clock\n' + '─'.repeat(62));

// ── arriving ────────────────────────────────────────────────────────────────
console.log('\nArriving');
{
  const d = at([], T0);
  check('a new member is not yet using anything',
    [d.allowance.state, d.allowance.allowed, d.writes.length], ['available', false, 0]);
}
{
  const d = at([], T0, true);
  check('signing in starts the clock',
    [d.allowance.state, d.allowance.allowed, d.allowance.number,
     Number(d.allowance.endsAt) - T0, d.writes[0]?.op],
    ['running', true, 1, SESSION_MS, 'create']);
}
{
  // The screen asking how much is left must not spend any of it.
  const d = at([], T0, false);
  check('asking the time does not start the clock', d.writes.length, 0);
}

// ── while it runs ───────────────────────────────────────────────────────────
console.log('\nWhile it runs');
const running = [session({ runningSince: new Date(T0) })];
{
  const d = at(running, T0 + 10 * MIN);
  check('ten minutes in, twenty are left',
    [d.allowance.state, d.allowance.remainingMs / MIN, d.allowance.usedTodayMs / MIN],
    ['running', 20, 10]);
}
{
  // Closing the tab is not signing out, so the clock keeps going.
  const d = at(running, T0 + 45 * MIN);
  check('the tab was closed at ten past, and the clock still ran out at half past',
    [d.allowance.state, Number(d.allowance.nextOpensAt) - T0],
    ['waiting', SESSION_MS + HOLD_MS]);
  check('it is recorded as having ended when it ended, not when we noticed',
    [d.writes[0]?.op, Number((d.writes[0] as any)?.completedAt) - T0], ['complete', SESSION_MS]);
}
{
  const d = at(running, T0 + 30 * MIN);
  check('exactly at the half hour it is over', d.allowance.state, 'waiting');
}

// ── signing out ─────────────────────────────────────────────────────────────
console.log('\nSigning out');
{
  const w = decidePause(running, T0 + 10 * MIN);
  check('signing out banks the ten minutes used',
    [w[0]?.op, (w[0] as any)?.usedMs / MIN], ['pause', 10]);
}
{
  // Signing out hours later must not move when the wait began.
  const w = decidePause(running, T0 + 90 * MIN);
  check('signing out after it already ran out only records the ending',
    [w.length, w[0]?.op, Number((w[0] as any)?.completedAt) - T0], [1, 'complete', SESSION_MS]);
}
const paused = [session({ usedMs: 10 * MIN, runningSince: null })];
{
  const d = at(paused, T0 + 60 * MIN);
  check('what was left is kept for them',
    [d.allowance.state, d.allowance.remainingMs / MIN], ['paused', 20]);
}
{
  const d = at(paused, T0 + 60 * MIN, true);
  check('coming back starts it again from where it stopped',
    [d.allowance.state, d.allowance.remainingMs / MIN, d.writes[0]?.op], ['running', 20, 'resume']);
}

// ── waiting ─────────────────────────────────────────────────────────────────
console.log('\nWaiting');
const done1 = [session({
  usedMs: SESSION_MS, completedAt: new Date(T0 + 30 * MIN),
  holdUntil: new Date(T0 + 30 * MIN + HOLD_MS),
})];
{
  const d = at(done1, T0 + 60 * MIN, true);
  check('the two hours cannot be started out of',
    [d.allowance.state, d.writes.length], ['waiting', 0]);
}
{
  // The rule the whole design turns on: the next stretch waits for them.
  const d = at(done1, T0 + 30 * MIN + HOLD_MS + MIN);
  check('when the wait is over nothing starts on its own', d.allowance.state, 'available');
  check('and nothing is written until they come back', d.writes.length, 0);
}
{
  const d = at(done1, T0 + 30 * MIN + HOLD_MS + MIN, true);
  check('the second stretch starts when they come back',
    [d.allowance.state, d.allowance.number, d.writes[0]?.op, (d.writes[0] as any)?.number],
    ['running', 2, 'create', 2]);
}

// ── the day's four ──────────────────────────────────────────────────────────
console.log('\nThe day’s four');
const fourDone: Session[] = [1, 2, 3, 4].map(n => session({
  id: `s${n}`, number: n, usedMs: SESSION_MS,
  completedAt: new Date(T0 + n * 150 * MIN),
  holdUntil: new Date(T0 + n * 150 * MIN + HOLD_MS),
}));
{
  const d = at(fourDone, T0 + 4 * 150 * MIN + HOLD_MS + MIN, true);
  check('after four stretches the day is done',
    [d.allowance.state, d.allowance.sessionsToday, d.allowance.usedTodayMs / MIN, d.writes.length],
    ['spent', SESSIONS_PER_DAY, 120, 0]);
  check('and it comes back at midnight',
    Number(d.allowance.nextOpensAt), Number(nextIstMidnight(T0)));
}
{
  const d = at(fourDone.slice(0, 3), T0 + 3 * 150 * MIN + HOLD_MS + MIN);
  check('three used leaves one', d.allowance.sessionsLeft, 1);
}

// ── midnight ────────────────────────────────────────────────────────────────
console.log('\nMidnight');
{
  // 23:45 IST, finishing at 00:15, waiting until 02:15.
  const late = Date.parse('2026-09-12T18:15:00.000Z');
  const s = [session({
    day: istDay(late), usedMs: SESSION_MS,
    completedAt: new Date(late + 30 * MIN), holdUntil: new Date(late + 30 * MIN + HOLD_MS),
  })];
  const d = at(s, late + 60 * MIN, true);
  check('a wait that crosses midnight still runs its two hours',
    [d.allowance.state, Number(d.allowance.nextOpensAt) - late], ['waiting', 30 * MIN + HOLD_MS]);
}
{
  // Yesterday's four, and the last wait long over.
  const y = Date.parse('2026-09-11T10:00:00.000Z');
  const s: Session[] = [1, 2, 3, 4].map(n => session({
    id: `y${n}`, day: istDay(y), number: n, usedMs: SESSION_MS,
    completedAt: new Date(y + n * 150 * MIN), holdUntil: new Date(y + n * 150 * MIN + HOLD_MS),
  }));
  const d = at(s, T0, true);
  check('a new day brings four more',
    [d.allowance.state, d.allowance.number, d.allowance.sessionsToday, d.allowance.usedTodayMs],
    ['running', 1, 1, 0]);
}

// ── the day itself ──────────────────────────────────────────────────────────
console.log('\nThe day itself');
check('IST is ahead of UTC, so late evening here is already tomorrow there',
  istDay(Date.parse('2026-09-12T19:00:00.000Z')), '2026-09-13');
check('and the day turns at half past six the previous evening, UTC',
  nextIstMidnight(T0).toISOString(), '2026-09-12T18:30:00.000Z');

console.log('\n' + '─'.repeat(62));
console.log(`${pass} passed · ${failures.length ? R : ''}${failures.length} failed${O}`);
if (failures.length) { failures.forEach(f => console.log('  · ' + f)); process.exit(1); }
