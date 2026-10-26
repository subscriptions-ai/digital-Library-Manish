/**
 * A backfill worker in its own process, for the crash tests: `npx tsx scripts/backfill-worker-child.ts <workerId>`. It works jobs until none is left, exactly as the
 * server's worker does. BACKFILL_TEST_CRASH=<point> in its environment makes it SIGKILL itself at that point (see backfill/testHooks.ts). Scratch database only.
 */
import { readFileSync } from 'node:fs';
if (!process.env.DATABASE_URL?.endsWith('/stm_ingestion_test')) throw new Error('refusing to run against anything but stm_ingestion_test');
void readFileSync;
const { backfillTick } = await import('../src/lib/ingestion/backfill/worker.js');
const workerId = process.argv[2] || 'child';
for (let i = 0; i < 200; i++) {
  const r = await backfillTick({ workerId });
  if (!r.ran && (r.reason === 'no-job' || r.reason === 'disabled')) break;
}
process.exit(0);
