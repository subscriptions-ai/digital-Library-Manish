/**
 * A backfill worker in its own process, for the crash tests: `npx tsx scripts/backfill-worker-child.ts <workerId>`. It works jobs until none is left, exactly as the
 * server's worker does. BACKFILL_TEST_CRASH=<point> in its environment makes it SIGKILL itself at that point (see backfill/testHooks.ts). Scratch database only.
 */
import { readFileSync } from 'node:fs';
if (!/\/(stm_ingestion_test|stm_doaj_enrichment_test)$/.test(process.env.DATABASE_URL ?? '')) throw new Error('refusing to run against anything but a scratch database (stm_ingestion_test, stm_doaj_enrichment_test)');
void readFileSync;
const { backfillTick } = await import('../src/lib/ingestion/backfill/worker.js');
const workerId = process.argv[2] || 'child';
// Phase 2C: a child that must read the SAME fake OAPEN feed as the test (BACKFILL_CHILD_OAPEN="<seed>:<total>[:<padBytes>]").
if (process.env.BACKFILL_CHILD_OAPEN) {
  const [seed, total, pad] = process.env.BACKFILL_CHILD_OAPEN.split(':');
  const { fakeOapen, makeCorpus } = await import('./oapen-sample.js');
  const { __useFetchForTests } = await import('../src/lib/ingestion/sourceHealth.js');
  __useFetchForTests(fakeOapen(makeCorpus(seed, Number(total), pad ? { padBytes: Number(pad) } : {})).transport as any);
}
// Resource measurement for the tests: this process's resident memory before it works and at its peak (BACKFILL_CHILD_REPORT_RSS=1), printed once at the end.
const gcNow = () => { (globalThis as any).gc?.(); return process.memoryUsage().heapUsed; };
const heapBase = gcNow(); const rssBase = process.memoryUsage().rss; let rssPeak = rssBase; const rssTimer = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); }, 20);
const rssTrace: number[] = [];
for (let i = 0; i < 2000; i++) {
  const r = await backfillTick({ workerId });
  if (process.env.BACKFILL_CHILD_REPORT_RSS) rssTrace.push(process.memoryUsage().rss);
  if (!r.ran && (r.reason === 'no-job' || r.reason === 'disabled')) break;
}
clearInterval(rssTimer);
if (process.env.BACKFILL_CHILD_REPORT_RSS) console.log(`RSS:${JSON.stringify({ base: rssBase, peak: Math.max(rssPeak, process.memoryUsage().rss), heapBase, heapEnd: gcNow(), rssEnd: process.memoryUsage().rss, ticks: rssTrace.length, rssTrace: rssTrace.filter((_, i) => i % 10 === 9) })}`);
process.exit(0);
