import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ingestionDb as db } from '../db.js';
import { audit } from '../audit.js';
import { backfillEnabled, backfillLimits } from './config.js';
import { getAdapter } from './registry.js';
import { runBackfillChunk, PAGE_CHANGED } from './chunk.js';
import { SimulatedCrash } from './testHooks.js';
import { BackfillStop } from './types.js';
import type { Judged } from './types.js';

/**
 * The backfill worker: takes one job, runs ONE chunk, lets go, and waits before the next, so the continuous engine always gets turns on the provider.
 *
 *   gate        does nothing at all unless INGESTION_BACKFILL_ENABLED is on (a Running job found while it is off is left exactly as it is).
 *   one job     at most one job is worked at a time, across every process (BACKFILL_WORKER_CONCURRENCY is 1 in Phase 2A).
 *   lock        the provider lock is held for the length of one chunk only. If something else holds it the worker skips and tries later.
 *   heartbeat   while a chunk runs, `heartbeatAt` is refreshed every BACKFILL_HEARTBEAT_SECONDS, so a long chunk is never mistaken for a dead worker. A Running job whose
 *               heartbeat is older than BACKFILL_HEARTBEAT_STALE_SECONDS (never less than three beats) was interrupted: another worker takes it over from its checkpoint.
 *   boundaries  a pause or cancel is honoured between chunks, never inside one; a recovered job finishes (or safely stops on) its in-flight chunk first.
 */

export const WORKER_ID = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

export type TickResult = { ran: boolean; reason?: 'disabled' | 'no-job' | 'busy' | 'lost' | 'unavailable' | 'error' | 'stopped' | 'failed'; jobId?: string; chunk?: 'committed'; elapsedMs?: number; status?: string };

const staleCutoff = () => new Date(Date.now() - backfillLimits().heartbeatStaleSeconds * 1000);

/** Claim the job to work on: the one this worker already holds, else the oldest Pending one, else a Running one whose worker went silent. Atomic. */
export async function claimNext(workerId: string) {
  const L = backfillLimits();
  const own = await db.backfillJob.findFirst({ where: { status: 'Running', claimedBy: workerId }, orderBy: { createdAt: 'asc' } });
  if (own) return own;
  // At most `workerConcurrency` jobs are worked at once, whoever holds them: a job whose worker is alive blocks a new claim.
  const alive = await db.backfillJob.count({ where: { status: 'Running', heartbeatAt: { gte: staleCutoff() } } });
  if (alive >= L.workerConcurrency) return null;
  const cand = await db.backfillJob.findFirst({
    where: { OR: [{ status: 'Pending' }, { status: 'Running', OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: staleCutoff() } }] }] },
    orderBy: { createdAt: 'asc' },
  });
  if (!cand) return null;
  const won = await db.backfillJob.updateMany({
    where: { id: cand.id, OR: [{ status: 'Pending' }, { status: 'Running', OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: staleCutoff() } }] }] },
    data: { status: 'Running', claimedBy: workerId, heartbeatAt: new Date() },
  });
  if (won.count !== 1) return null;
  if (!cand.startedAt) await db.backfillJob.updateMany({ where: { id: cand.id, startedAt: null }, data: { startedAt: new Date() } });
  return db.backfillJob.findUnique({ where: { id: cand.id } });
}

/** The limit a job has reached, if any. Reaching one COMPLETES the job (it did what it was allowed to); it is not a failure. */
export function limitReached(job: any): string | null {
  const L = backfillLimits();
  if (job.recordsFetched >= Math.min(job.maxRecords, L.maxRecordsPerJob)) return 'maximum records reached';
  if (((job.config?.activeMs as number) || 0) >= L.maxRuntimeMinutes * 60_000) return 'maximum runtime reached';
  if (Number(job.bytesProcessed ?? 0) >= L.maxBytesPerJob) return 'maximum bytes reached';
  return null;
}

const finish = async (id: string, status: 'Completed' | 'Failed' | 'Cancelled' | 'Paused', patch: Record<string, any> = {}, because?: string) => {
  const cur = await db.backfillJob.findUnique({ where: { id }, select: { config: true } });
  const cfg = because ? { ...((cur?.config as any) ?? {}), finishedBecause: because } : undefined;
  await db.backfillJob.updateMany({
    where: { id },
    data: { status, claimedBy: null, ...(status === 'Completed' || status === 'Cancelled' || status === 'Failed' ? { completedAt: new Date() } : { pausedAt: new Date() }), pauseRequested: false, cancelRequested: false, ...(cfg ? { config: cfg as any } : {}), ...patch },
  });
  if (status === 'Completed' || status === 'Cancelled') await audit(null, 'BACKFILL_JOB_FINISHED', { jobId: id, status, because: because ?? null });
};

/** Honour a pause or cancel request, now that no chunk is half-done. Returns the new status, or null if none was asked for. */
async function settleFlags(id: string): Promise<'Cancelled' | 'Paused' | null> {
  const f = await db.backfillJob.findUnique({ where: { id }, select: { cancelRequested: true, pauseRequested: true } });
  if (f?.cancelRequested) { await finish(id, 'Cancelled', {}, 'cancelled by a person'); return 'Cancelled'; }
  if (f?.pauseRequested) { await finish(id, 'Paused'); return 'Paused'; }
  return null;
}

export async function backfillTick(opts: { workerId?: string } = {}): Promise<TickResult> {
  if (!backfillEnabled()) return { ran: false, reason: 'disabled' };
  const L = backfillLimits();
  const workerId = opts.workerId ?? WORKER_ID;
  const job = await claimNext(workerId);
  if (!job) return { ran: false, reason: 'no-job' };

  const adapter = getAdapter(job.provider);
  const avail = adapter ? adapter.available() : 'that provider is not registered here';
  if (!adapter || avail !== true) {
    await finish(job.id, 'Paused', { lastError: `BACKFILL_ADAPTER_UNAVAILABLE: ${avail}` });
    return { ran: false, reason: 'unavailable', jobId: job.id, status: 'Paused' };
  }

  // A chunk half-done (a plan was saved and not committed) is finished before anything else, even a pause: it is the safe place to stop.
  if (!job.inflight) {
    const settled = await settleFlags(job.id); if (settled) return { ran: false, reason: 'stopped', jobId: job.id, status: settled };
    const lim = limitReached(job); if (lim) { await finish(job.id, 'Completed', {}, lim); return { ran: false, reason: 'stopped', jobId: job.id, status: 'Completed' }; }
  }

  // While the chunk runs the worker says it is alive, so a long fetch or a long apply is never taken for a dead worker.
  const beat = setInterval(() => { db.backfillJob.updateMany({ where: { id: job.id, claimedBy: workerId, status: 'Running' }, data: { heartbeatAt: new Date() } }).catch(() => {}); }, L.heartbeatSeconds * 1000);
  beat.unref?.();
  try {
    const title = (j: Judged) => (j.item as any)?.candidate?.title ?? (j.item as any)?.title ?? null;
    const r = await runBackfillChunk(job, adapter, { workerId, chunkSize: L.chunkSize, title });
    switch (r.kind) {
      case 'busy': await db.backfillJob.updateMany({ where: { id: job.id, claimedBy: workerId }, data: { heartbeatAt: new Date() } }); return { ran: false, reason: 'busy', jobId: job.id };
      case 'lost': return { ran: false, reason: 'lost', jobId: job.id };
      case 'limit': case 'empty': await finish(job.id, 'Completed', {}, r.kind === 'empty' ? 'end of data' : 'maximum records reached'); return { ran: false, reason: 'stopped', jobId: job.id, status: 'Completed' };
      case 'mismatch':
        // The source no longer returns the page that was planned. Nothing is applied, nothing is counted, the saved plan is kept as evidence, and a person decides (re-plan).
        await finish(job.id, 'Failed', { lastError: `${PAGE_CHANGED}: ${r.detail}`.slice(0, 1000) });
        return { ran: false, reason: 'failed', jobId: job.id, status: 'Failed' };
      case 'committed': {
        const fresh = await db.backfillJob.findUnique({ where: { id: job.id } });
        let status = 'Running';
        if (r.last) { await finish(job.id, 'Completed', {}, 'end of data'); status = 'Completed'; }
        else {
          const lim = fresh ? limitReached(fresh) : null;
          if (lim) { await finish(job.id, 'Completed', {}, lim); status = 'Completed'; }
          else { const s = await settleFlags(job.id); if (s) status = s; }      // a pause or cancel asked for during the chunk is honoured now that it is committed
        }
        return { ran: true, jobId: job.id, chunk: 'committed', elapsedMs: r.elapsedMs, status };
      }
    }
  } catch (e: any) {
    if (e instanceof SimulatedCrash) throw e;                    // a simulated crash leaves the job exactly as a real one would
    if (e instanceof BackfillStop) {
      // The source is no longer what the job was started against (a changed snapshot). Not retried, not reset: the cursor and any saved plan stay as evidence, and a person decides.
      await finish(job.id, 'Failed', { lastError: `${e.code}: ${e.message}`.slice(0, 1000) });
      return { ran: false, reason: 'failed', jobId: job.id, status: 'Failed' };
    }
    // Something threw (a source that did not answer, our own bug). The job is released for another try; three in a row fail it, with the reason.
    const cur = await db.backfillJob.findUnique({ where: { id: job.id }, select: { config: true } });
    const streak = (((cur?.config as any)?.errorStreak as number) || 0) + 1;
    const msg = String(e?.message || e).slice(0, 500);
    const cfg = { ...((cur?.config as any) ?? {}), errorStreak: streak };
    if (streak >= 3) await finish(job.id, 'Failed', { lastError: msg, config: cfg as any });
    else await db.backfillJob.updateMany({ where: { id: job.id }, data: { claimedBy: null, heartbeatAt: null, lastError: msg, config: cfg as any } });
    return { ran: false, reason: 'error', jobId: job.id };
  } finally { clearInterval(beat); }
}

/** How long to leave the provider alone after a chunk: at least the minimum gap, and as long as the chunk took (so the worker uses at most half the provider's time). */
export const nextDelayMs = (r: TickResult): number => {
  const L = backfillLimits();
  if (r.ran) return Math.max(L.minGapSeconds * 1000, r.elapsedMs ?? 0);
  if (r.reason === 'busy' || r.reason === 'error') return Math.max(L.minGapSeconds * 1000, 5000);
  return r.reason === 'stopped' || r.reason === 'failed' || r.reason === 'lost' ? 1000 : L.idlePollSeconds * 1000;
};

/** The server's loop: one chunk, wait, again. Returns a function that stops it. Costs nothing while the gate is off (a tick returns before touching the database). */
export function startBackfillWorker(): () => void {
  let stopped = false; let timer: NodeJS.Timeout | null = null;
  const loop = async () => {
    let delay = backfillLimits().idlePollSeconds * 1000;
    try { delay = nextDelayMs(await backfillTick()); } catch (e: any) { console.error('[backfill] worker tick failed:', e?.message); }
    if (!stopped) { timer = setTimeout(loop, delay); timer.unref?.(); }
  };
  timer = setTimeout(loop, 5000); timer.unref?.();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

