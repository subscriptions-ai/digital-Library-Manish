import { Prisma } from '@prisma/client';
import { ingestionDb as db } from '../db.js';
import { tryLockProvider, unlockProvider } from '../providerLocks.js';
import { sha } from './config.js';
import { crashPoint } from './testHooks.js';
import { addToPreview } from './preview.js';
import { zeroCounts, type BackfillAdapter, type Counts, type Inflight, type JobView, type Judged, type PlanCode, type BackfillType } from './types.js';

/**
 * ONE chunk of ONE job, for ANY adapter. This is the only place a backfill reads a page, writes to the catalogue and moves a checkpoint, and it knows nothing about
 * what kind of content it is moving.
 *
 *   PLAN    fetch the page at `cursor`, read it, judge every record against the catalogue (read-only). A real run then saves the chunk's BOUNDED IDENTITY in
 *           BackfillJob.inflight: which cursor, which page (a hash of the record ids and the next cursor), each record's stable id with its planned outcome, and the
 *           planned counts. Never a record.
 *   APPLY   write what the plan says (nothing, for a dry run). Idempotent: a record that is already in the catalogue is found, not written again.
 *   COMMIT  ONE compare-and-set statement: the planned counts are added to the totals, the cursor moves, `inflight` is cleared. It succeeds only for the worker that
 *           holds the job and only for the chunk it expects, so a chunk's counts are committed once, by one worker, whatever crashed or was retried.
 *
 * A retry finds `inflight`, fetches the SAME cursor again and compares the page's identity with the plan. Same page → apply the same plan and commit its counts.
 * Different page → nothing is applied, nothing is counted, and the job stops with BACKFILL_PAGE_CHANGED_DURING_RETRY. A different page is never written under another
 * page's counts.
 *
 * The job's own checkpoint (cursor, inflight) is the only checkpoint touched. No engine checkpoint, sweep, journal cursor, rotation row or health row is read or written here.
 */

export const PAGE_CHANGED = 'BACKFILL_PAGE_CHANGED_DURING_RETRY';

export type ChunkResult =
  | { kind: 'committed'; counts: Counts; last: boolean; elapsedMs: number; attempt: number }
  | { kind: 'busy' }                                   // the provider lock is held (the continuous engine, a Quick Import): try again later
  | { kind: 'lost' }                                   // this worker no longer holds the job; nothing was counted
  | { kind: 'limit' }                                  // the job's maximum is already reached
  | { kind: 'empty' }                                  // the source has nothing at this cursor and nothing after it
  | { kind: 'mismatch'; detail: string };              // the retry's page is not the planned page

const CODE: Record<string, PlanCode> = { publish: 'P', review: 'R', held: 'H', refused: 'X' };
const NEW: PlanCode[] = ['P', 'R', 'H'];

/** A stable id kept short enough that one chunk's plan stays small however long a source's identifiers are. */
export const shortId = (id: string) => (id.length <= 120 ? id : `${id.slice(0, 100)}#${sha(id).slice(0, 12)}`);

export function jobView(job: any): JobView {
  return {
    id: job.id, provider: job.provider, contentType: job.contentType as BackfillType, dryRun: !!job.dryRun,
    windowStart: job.windowStart ?? null, windowEnd: job.windowEnd ?? null, departments: Array.isArray(job.departments) ? job.departments : [],
    accessPreference: job.accessPreference, maxRecords: job.maxRecords, adapter: (job.config?.adapter ?? {}) as Record<string, any>,
  };
}

export const planCode = (j: Judged): PlanCode => (j.outcome === 'duplicate' ? (j.dup === 'enriched' ? 'E' : j.dup === 'conflicting' ? 'C' : 'U') : CODE[j.outcome]);

/**
 * The totals of a chunk from its plan. `failedIds` are planned-NEW records the write could not complete this time: they move out of published/review/held into failed,
 * so the totals describe what is really in the catalogue. Unreadable records ('F' in the plan) are failed and were never normalised.
 */
export function countsOf(planned: [string, PlanCode][], bytes: number, failedIds: Set<string> = new Set()): Counts {
  const c = zeroCounts(); c.fetched = planned.length; c.bytes = bytes;
  let unreadable = 0;
  for (const [id, code0] of planned) {
    if (code0 === 'F') unreadable++;
    const code: PlanCode = failedIds.has(id) && NEW.includes(code0) ? 'F' : code0;
    switch (code) {
      case 'P': c.published++; c.unique++; break;
      case 'R': c.review++; c.unique++; break;
      case 'H': c.held++; c.unique++; break;
      case 'U': c.duplicate++; break;
      case 'E': c.duplicate++; c.enriched++; break;
      case 'C': c.duplicate++; c.conflicting++; break;
      case 'X': c.refused++; break;
      case 'F': c.failed++; break;
    }
  }
  c.normalized = c.fetched - unreadable;
  return c;
}

const pageHashOf = (ids: string[], next: string | null) => sha(`${ids.join('\n')}\n|${next ?? ''}`);

export async function runBackfillChunk(job: any, adapter: BackfillAdapter, ctx: { workerId: string; chunkSize: number; title?: (j: Judged) => string | null }): Promise<ChunkResult> {
  const t0 = Date.now();
  if (!tryLockProvider(adapter.lock, 'backfill')) return { kind: 'busy' };
  try {
    const view = jobView(job);
    const inflight: Inflight | null = !job.dryRun && job.inflight && typeof job.inflight === 'object' ? (job.inflight as Inflight) : null;
    const mine = { id: job.id, claimedBy: ctx.workerId, chunksCompleted: job.chunksCompleted };

    // ── fetch: the planned page again (a retry), or the next one ──────────────────────────────────────────
    const room = job.maxRecords - job.recordsFetched;
    if (!inflight && room <= 0) return { kind: 'limit' };
    const limit = inflight ? inflight.limit : Math.min(ctx.chunkSize, room);
    const cursor = inflight ? inflight.cursorBefore : job.cursor ?? null;
    const page = await adapter.fetchPage(view, cursor, limit);
    const ids = page.records.map(r => shortId(adapter.stableId(r)));
    if (!inflight && !page.records.length && page.nextCursor === null) return { kind: 'empty' };

    // ── a retry must prove it is the same chunk ──────────────────────────────────────────────────────────
    if (inflight) {
      const same = inflight.chunkNumber === job.chunksCompleted + 1 && inflight.pageHash === pageHashOf(ids, page.nextCursor) && inflight.planned.length === ids.length && inflight.planned.every(([id], i) => id === ids[i]);
      if (!same) return { kind: 'mismatch', detail: `chunk ${inflight.chunkNumber} was planned from ${inflight.planned.length} records ending at cursor ${inflight.expectedCursorAfter ?? 'end'}; the source now returns ${ids.length} records ending at ${page.nextCursor ?? 'end'} for the same cursor` };
    }

    // ── read and judge (read-only) ───────────────────────────────────────────────────────────────────────
    const items: { id: string; item: any }[] = []; const unreadable = new Map<string, string>();
    page.records.forEach((r, i) => { const n = adapter.normalize(r, view); (n && typeof n === 'object' && 'error' in (n as any) && Object.keys(n as any).length === 1) ? unreadable.set(ids[i], String((n as any).error)) : items.push({ id: ids[i], item: n }); });
    const judged = await adapter.judge(items, view);
    const byId = new Map(judged.map(j => [j.id, j]));

    // ── the plan: from the saved one on a retry, otherwise from what was just judged ─────────────────────
    let plan: Inflight;
    if (inflight) {
      // The retry is recorded on the plan itself (attempts + 1), in the same compare-and-set, so it is visible afterwards and a stale worker cannot do it.
      plan = { ...inflight, attempts: inflight.attempts + 1 };
      const done = await db.backfillJob.updateMany({ where: mine, data: { inflight: plan as any, heartbeatAt: new Date() } });
      if (done.count !== 1) return { kind: 'lost' };
    }
    else {
      const planned: [string, PlanCode][] = ids.map(id => [id, unreadable.has(id) ? 'F' : (byId.get(id) ? planCode(byId.get(id)!) : 'F')] as [string, PlanCode]);
      plan = { v: 1, chunkNumber: job.chunksCompleted + 1, cursorBefore: cursor, expectedCursorAfter: page.nextCursor, limit, pageHash: pageHashOf(ids, page.nextCursor), planned, counts: countsOf(planned, page.bytes), bytes: page.bytes, plannedAt: new Date().toISOString(), attempts: 0 };
      crashPoint('before-inflight');
      if (!job.dryRun) {
        const done = await db.backfillJob.updateMany({ where: mine, data: { inflight: plan as any, heartbeatAt: new Date() } });
        if (done.count !== 1) return { kind: 'lost' };
        crashPoint('after-inflight');
      }
    }

    // ── apply (not for a dry run) ────────────────────────────────────────────────────────────────────────
    const failedIds = new Set<string>(); const failReasons: { id: string; reason: string }[] = [];
    if (!job.dryRun) {
      const planMap = new Map(plan.planned);
      const write: Judged[] = [], enrich: Judged[] = [];
      for (const j of judged) {
        const code = planMap.get(j.id);
        if (!code) continue;
        if (NEW.includes(code)) {
          if (j.outcome === 'publish' || j.outcome === 'review' || j.outcome === 'held') write.push(j);
          else if (j.outcome === 'duplicate') { /* already in the catalogue — written by an earlier attempt of this very chunk, or just now by someone else */ }
          else { failedIds.add(j.id); failReasons.push({ id: j.id, reason: 'no longer passes the rules at write time' }); }
        } else if (code === 'E' && j.outcome === 'duplicate' && j.dup === 'enriched') enrich.push(j);
      }
      for (const [id, code] of plan.planned) if (NEW.includes(code) && !byId.has(id)) { failedIds.add(id); failReasons.push({ id, reason: 'could not be judged' }); }
      const results = write.length || enrich.length ? await adapter.apply(write, enrich, view) : new Map();
      for (const [id, res] of results) if (res === 'failed' && NEW.includes(planMap.get(id) as PlanCode)) { failedIds.add(id); failReasons.push({ id, reason: 'the catalogue could not write it' }); }
      crashPoint('after-apply');
    }

    // ── commit: once, by the worker that holds the job, for the chunk it expects ─────────────────────────
    const counts = countsOf(plan.planned, plan.bytes, failedIds);
    const elapsedMs = Date.now() - t0;
    const preview = job.dryRun ? addToPreview(job.preview, judged, [...unreadable].map(([id, reason]) => ({ id, reason })), ctx.title ?? (() => null)) : undefined;
    const cfg = { ...(job.config ?? {}), activeMs: ((job.config?.activeMs as number) || 0) + elapsedMs, errorStreak: 0 };
    const last = plan.expectedCursorAfter === null;
    const done = await db.backfillJob.updateMany({
      where: mine,
      data: {
        recordsFetched: { increment: counts.fetched }, recordsNormalized: { increment: counts.normalized }, recordsUnique: { increment: counts.unique },
        recordsDuplicate: { increment: counts.duplicate }, recordsEnriched: { increment: counts.enriched }, recordsDuplicateConflicting: { increment: counts.conflicting },
        recordsHeld: { increment: counts.held }, recordsReview: { increment: counts.review }, recordsPublished: { increment: counts.published },
        recordsRefused: { increment: counts.refused }, recordsFailed: { increment: counts.failed }, bytesProcessed: { increment: BigInt(Math.max(0, Math.trunc(counts.bytes))) },
        cursor: plan.expectedCursorAfter, chunksCompleted: { increment: 1 }, checkpointAt: new Date(), heartbeatAt: new Date(), inflight: Prisma.DbNull,
        config: cfg as any, ...(preview ? { preview: preview as any } : {}),
      },
    });
    if (done.count !== 1) return { kind: 'lost' };
    return { kind: 'committed', counts, last, elapsedMs, attempt: plan.attempts + 1 };
  } finally { unlockProvider(adapter.lock, 'backfill'); }
}
