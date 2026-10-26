/**
 * Crash points for the tests, and nothing else. A hook fires only when it is armed (BACKFILL_TEST_CRASH in the environment of a child process, or __setCrash in
 * the test's own process) and NEVER when NODE_ENV is production. In a child process it is a real SIGKILL: no handler, no finally, no cleanup — exactly a crash.
 *
 *   before-inflight   the chunk is planned in memory, nothing saved
 *   after-inflight    the plan is saved, nothing written
 *   mid-apply:N       after N records have been written
 *   after-apply       everything written, nothing committed
 */
export class SimulatedCrash extends Error { constructor(public point: string) { super(`simulated crash at ${point}`); } }

let armed: string | null = null;
export const __setCrash = (p: string | null) => { armed = p; };

export function crashPoint(name: string, n?: number) {
  if (process.env.NODE_ENV === 'production') return;
  const want = armed ?? process.env.BACKFILL_TEST_CRASH;
  if (!want) return;
  const [w, arg] = want.split(':');
  if (w !== name) return;
  if (arg !== undefined && n !== undefined && n < Number(arg)) return;
  if (armed) { armed = null; throw new SimulatedCrash(name); }        // in-process: one shot, and the worker lets it through without any cleanup
  process.kill(process.pid, 'SIGKILL');
}
