import { Prisma } from '@prisma/client';
import { ingestionDb as db } from '../db.js';
import { canonicalDepartmentName } from '../../departmentRegistry.js';
import { audit } from '../audit.js';
import { backfillEnabled, backfillLimits, configHash, type BackfillRequest } from './config.js';
import { getAdapter, listAdapters } from './registry.js';
import { ACCESS_PREFERENCES, ACTIVE, BACKFILL_TYPES, BackfillError, RESERVED_TYPES, TERMINAL, TYPE_LABEL, isBackfillType, isReservedType, type JobStatus } from './types.js';
import { PAGE_CHANGED } from './chunk.js';

/**
 * Creating a job and steering it: preview, start, pause, resume, cancel, re-plan. Every change of state is one atomic conditional update, so two clicks (or a click
 * and the worker) can never leave a job half-changed. Nothing here deletes anything: cancelling stops future work and keeps what was imported.
 *
 *   gate        INGESTION_BACKFILL_ENABLED must be on for anything that creates or advances a job; reading status never needs it.
 *   preview     a dry run (the default): reads, judges, writes nothing. Its `config.hash` fingerprints the exact request.
 *   start       a real run needs a COMPLETED dry run of the very same request (same hash) made within BACKFILL_PREVIEW_VALID_MINUTES.
 *   one at a time per provider and content type (Pending, Running or Paused).
 */

const admin = (a: any) => (a ? { uid: a.uid ?? a.id, email: a.email } : null);

export function parseRequest(body: any): BackfillRequest & { dryRun: boolean; previewJobId: string | null; preset: string | null } {
  const L = backfillLimits();
  const b = body && typeof body === 'object' ? body : {};
  const provider = String(b.provider ?? '');
  const contentType = String(b.contentType ?? '');
  if (!provider) throw new BackfillError('PROVIDER_REQUIRED', 'Choose a provider.');
  if (!isBackfillType(contentType)) throw new BackfillError('BAD_CONTENT_TYPE', `Content type must be one of ${BACKFILL_TYPES.join(', ')}.`);
  const date = (v: any, name: string) => { if (v == null || v === '') return null; const d = new Date(v); if (isNaN(d.getTime())) throw new BackfillError('BAD_WINDOW', `${name} is not a date.`); return d.toISOString(); };
  const windowStart = date(b.windowStart, 'The window start'), windowEnd = date(b.windowEnd, 'The window end');
  if (windowStart && windowEnd && windowStart > windowEnd) throw new BackfillError('BAD_WINDOW', 'The window start must be on or before its end.');
  const depsIn: unknown[] = Array.isArray(b.departments) ? b.departments : [];
  const resolved = depsIn.map(d => canonicalDepartmentName(d));
  if (resolved.some(d => !d)) throw new BackfillError('BAD_DEPARTMENT', 'One of the departments is not a department of this library.');
  const departments = [...new Set(resolved as string[])];
  const accessPreference = String(b.accessPreference ?? 'OAFirst');
  if (!(ACCESS_PREFERENCES as readonly string[]).includes(accessPreference)) throw new BackfillError('BAD_ACCESS', `Access preference must be ${ACCESS_PREFERENCES.join(' or ')}.`);
  const maxRecords = b.maxRecords === undefined ? Math.min(1000, L.maxRecordsPerJob) : b.maxRecords;
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > L.maxRecordsPerJob) throw new BackfillError('BAD_MAX_RECORDS', `Maximum records must be a whole number from 1 to ${L.maxRecordsPerJob}.`);
  const adapter = b.adapter && typeof b.adapter === 'object' && !Array.isArray(b.adapter) ? b.adapter : {};
  if (JSON.stringify(adapter).length > 2000) throw new BackfillError('BAD_ADAPTER_CONFIG', 'The provider settings are too large.');
  const dryRun = b.dryRun === undefined ? true : b.dryRun === true;
  if (b.dryRun !== undefined && typeof b.dryRun !== 'boolean') throw new BackfillError('BAD_DRY_RUN', 'Dry run must be true or false.');
  return { provider, contentType, windowStart, windowEnd, departments, accessPreference, maxRecords, adapter, dryRun, previewJobId: b.previewJobId ? String(b.previewJobId) : null, preset: b.preset ? String(b.preset).slice(0, 60) : null };
}

export async function createJob(body: any, who: any) {
  if (!backfillEnabled()) throw new BackfillError('BACKFILL_DISABLED', 'Historical backfill is switched off on this server (INGESTION_BACKFILL_ENABLED is not true).', 403);
  const L = backfillLimits();
  const r = parseRequest(body);
  const adapter = getAdapter(r.provider);
  if (!adapter) throw new BackfillError('NO_SUCH_PROVIDER', 'That provider is not available for backfill.');
  const avail = adapter.available(); if (avail !== true) throw new BackfillError('PROVIDER_UNAVAILABLE', avail);
  if (isReservedType(r.contentType)) throw new BackfillError('TYPE_RESERVED', `${TYPE_LABEL[r.contentType as keyof typeof TYPE_LABEL]} are reserved: their catalogue model has not been confirmed, so nothing can be backfilled for them yet.`);
  if (!adapter.contentTypes.includes(r.contentType as any)) throw new BackfillError('TYPE_NOT_SUPPORTED', `${adapter.label} cannot backfill ${TYPE_LABEL[r.contentType as keyof typeof TYPE_LABEL]}.`);
  const busy = await db.backfillJob.findFirst({ where: { provider: r.provider, contentType: r.contentType, status: { in: ACTIVE } }, select: { id: true, status: true } });
  if (busy) throw new BackfillError('JOB_ALREADY_ACTIVE', `A ${busy.status.toLowerCase()} backfill already exists for this provider and content type. Finish or cancel it first.`, 409);

  const hash = configHash(r);
  // What the source is, now: a snapshot's identity. A source that cannot be used is refused here, before any job exists.
  const identity = adapter.sourceIdentity ? await adapter.sourceIdentity(r.adapter) : null;
  let previewJobId: string | null = null;
  if (!r.dryRun) {
    if (!r.previewJobId) throw new BackfillError('PREVIEW_REQUIRED', 'Run Preview Backfill first: a real backfill starts only from a completed dry run of the same settings.');
    const pv = await db.backfillJob.findUnique({ where: { id: r.previewJobId } });
    if (!pv || !pv.dryRun || pv.status !== 'Completed') throw new BackfillError('PREVIEW_REQUIRED', 'That preview is not a completed dry run. Run Preview Backfill again.');
    if ((pv.config as any)?.hash !== hash) throw new BackfillError('PREVIEW_MISMATCH', 'The settings changed since the preview. Run Preview Backfill again.');
    if (!pv.completedAt || Date.now() - pv.completedAt.getTime() > L.previewValidMinutes * 60_000) throw new BackfillError('PREVIEW_STALE', `The preview is older than ${L.previewValidMinutes} minutes. Run Preview Backfill again.`);
    if (identity && (pv.config as any)?.identity !== identity) throw new BackfillError('SOURCE_CHANGED_SINCE_PREVIEW', 'The source has changed since the preview (a different snapshot is staged now). Run Preview Backfill again.');
    previewJobId = pv.id;
  }
  // A dry run looks at a bounded sample of what was asked for; the hash is of the request as asked, so the real run can match it.
  const effectiveMax = r.dryRun ? Math.min(r.maxRecords, L.previewMaxRecords) : r.maxRecords;
  const row = await db.backfillJob.create({
    data: {
      provider: r.provider, contentType: r.contentType, status: 'Pending', dryRun: r.dryRun,
      windowStart: r.windowStart ? new Date(r.windowStart) : null, windowEnd: r.windowEnd ? new Date(r.windowEnd) : null,
      departments: r.departments as any, accessPreference: r.accessPreference, maxRecords: effectiveMax,
      config: { hash, requestedMaxRecords: r.maxRecords, adapter: r.adapter, preset: r.preset, ...(identity ? { identity } : {}), ...(previewJobId ? { previewJobId } : {}) } as any,
      createdBy: who?.email ?? who?.uid ?? null,
    },
  });
  await audit(admin(who), 'BACKFILL_JOB_CREATED', { jobId: row.id, provider: r.provider, contentType: r.contentType, dryRun: r.dryRun, maxRecords: effectiveMax, hash });
  return row;
}

type Action = 'pause' | 'resume' | 'cancel' | 'replan';

/** Pause / resume / cancel / re-plan, each one conditional update. Returns the job as it is afterwards. */
export async function controlJob(id: string, action: Action, who: any) {
  const job = await db.backfillJob.findUnique({ where: { id } });
  if (!job) throw new BackfillError('NOT_FOUND', 'No such backfill job.', 404);
  if (action !== 'pause' && action !== 'cancel' && !backfillEnabled()) throw new BackfillError('BACKFILL_DISABLED', 'Historical backfill is switched off on this server.', 403);
  const st = job.status as JobStatus;
  const now = new Date();
  const set = (where: any, data: any) => db.backfillJob.updateMany({ where: { id, ...where }, data });
  const bad = (msg: string) => new BackfillError('BAD_STATE', msg, 409);

  if (action === 'pause') {
    if (TERMINAL.includes(st)) throw bad(`A ${st.toLowerCase()} job cannot be paused.`);
    if (st === 'Paused') return job;
    if (st === 'Pending') await set({ status: 'Pending' }, { status: 'Paused', pausedAt: now, pauseRequested: false });
    else await set({ status: 'Running' }, { pauseRequested: true });        // the worker finishes and commits the chunk it is on, then pauses
  } else if (action === 'resume') {
    if (st === 'Paused') await set({ status: 'Paused' }, { status: 'Pending', pausedAt: null, pauseRequested: false, claimedBy: null, heartbeatAt: null });
    else if (st === 'Running' && job.pauseRequested) await set({ status: 'Running' }, { pauseRequested: false });
    else throw bad('Only a paused job can be resumed.');
  } else if (action === 'cancel') {
    if (TERMINAL.includes(st)) throw bad(`A ${st.toLowerCase()} job cannot be cancelled.`);
    if (st === 'Pending' || st === 'Paused') await set({ status: { in: ['Pending', 'Paused'] } }, { status: 'Cancelled', completedAt: now, pauseRequested: false, claimedBy: null });
    else await set({ status: 'Running' }, { cancelRequested: true });       // finishes and commits the current chunk, then stops; nothing already imported is touched
  } else {
    // Explicit re-plan, only after the page changed during a retry. The saved plan is dropped (its counts were never committed), and the job says so, so a person reading
    // its totals knows that chunk may have written some records that are counted as duplicates now.
    if (st !== 'Failed' || !String(job.lastError ?? '').startsWith(PAGE_CHANGED)) throw bad('Re-plan applies only to a job that stopped because the page changed during a retry.');
    const notes = Array.isArray((job.config as any)?.replans) ? (job.config as any).replans : [];
    const planned = (job.inflight as any)?.counts ?? null;
    const cfg = { ...(job.config as any), replans: [...notes, { at: now.toISOString(), chunk: (job.inflight as any)?.chunkNumber ?? job.chunksCompleted + 1, discardedPlan: planned, by: who?.email ?? null }].slice(-20), errorStreak: 0 };
    await set({ status: 'Failed' }, { status: 'Paused', pausedAt: now, inflight: Prisma.DbNull, lastError: null, claimedBy: null, heartbeatAt: null, config: cfg as any });
  }
  await audit(admin(who), 'BACKFILL_JOB_CONTROL', { jobId: id, action, was: st });
  return db.backfillJob.findUnique({ where: { id } });
}

/** The job as the API sends it: BigInt as a string, the plan reduced to a summary (never its record list), the unchanged-duplicate count derived. */
export function serializeJob(j: any) {
  const infl = j.inflight && typeof j.inflight === 'object' ? j.inflight : null;
  return {
    id: j.id, provider: j.provider, contentType: j.contentType, status: j.status, dryRun: j.dryRun,
    windowStart: j.windowStart, windowEnd: j.windowEnd, departments: j.departments, accessPreference: j.accessPreference, maxRecords: j.maxRecords,
    requestedMaxRecords: j.config?.requestedMaxRecords ?? j.maxRecords, preset: j.config?.preset ?? null, previewJobId: j.config?.previewJobId ?? null, finishedBecause: j.config?.finishedBecause ?? null,
    replans: j.config?.replans ?? [], activeMs: j.config?.activeMs ?? 0, sourceStats: j.config?.sourceStats ?? {}, sourceIdentity: j.config?.identity ?? null,
    cursor: j.cursor, checkpointAt: j.checkpointAt, chunksCompleted: j.chunksCompleted,
    inflight: infl ? { chunkNumber: infl.chunkNumber, records: Array.isArray(infl.planned) ? infl.planned.length : 0, plannedAt: infl.plannedAt, attempts: infl.attempts, counts: infl.counts } : null,
    records: {
      fetched: j.recordsFetched, normalized: j.recordsNormalized, unique: j.recordsUnique, duplicate: j.recordsDuplicate, enriched: j.recordsEnriched, conflicting: j.recordsDuplicateConflicting,
      unchangedDuplicate: Math.max(0, j.recordsDuplicate - j.recordsEnriched - j.recordsDuplicateConflicting),
      held: j.recordsHeld, review: j.recordsReview, published: j.recordsPublished, refused: j.recordsRefused, failed: j.recordsFailed,
    },
    bytesProcessed: String(j.bytesProcessed ?? 0),
    startedAt: j.startedAt, completedAt: j.completedAt, pausedAt: j.pausedAt, pauseRequested: j.pauseRequested, cancelRequested: j.cancelRequested,
    heartbeatAt: j.heartbeatAt, lastError: j.lastError, preview: j.preview ?? null, createdBy: j.createdBy, createdAt: j.createdAt, updatedAt: j.updatedAt,
  };
}

export async function listJobs(limit = 20) {
  const rows = await db.backfillJob.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(100, Math.max(1, limit)) });
  return rows.map(serializeJob);
}

/** What the screen needs to draw itself, whether or not backfill is switched on. */
export async function overview() {
  const L = backfillLimits();
  const adapters = listAdapters().map(a => ({ id: a.id, label: a.label, contentTypes: a.contentTypes, available: a.available() === true, reason: a.available() === true ? null : a.available(), fixture: !!a.fixture, params: a.params ?? [], describes: !!a.describe }));
  let jobs: any[] = [], tableMissing = false;
  try { jobs = await listJobs(20); } catch { tableMissing = true; }       // a database that has not had the BackfillJob table added yet: say so rather than fail
  return {
    enabled: backfillEnabled(), tableMissing,
    limits: { maxRecordsPerJob: L.maxRecordsPerJob, maxRuntimeMinutes: L.maxRuntimeMinutes, maxBytesPerJob: String(L.maxBytesPerJob), chunkSize: L.chunkSize, workerConcurrency: L.workerConcurrency, previewMaxRecords: L.previewMaxRecords, previewValidMinutes: L.previewValidMinutes, minGapSeconds: L.minGapSeconds },
    types: BACKFILL_TYPES.map(t => ({ id: t, label: TYPE_LABEL[t], reserved: (RESERVED_TYPES as readonly string[]).includes(t), providers: (RESERVED_TYPES as readonly string[]).includes(t) ? [] : adapters.filter(a => a.available && (a.contentTypes as readonly string[]).includes(t)).map(a => a.id) })),
    adapters, jobs,
  };
}

/** What the source an adapter would read looks like, for the screen to show before a preview. Reads nothing into the catalogue and writes nothing. */
export async function describeSource(provider: string, adapterCfg: any) {
  const a = getAdapter(provider);
  if (!a) throw new BackfillError('NO_SUCH_PROVIDER', 'That provider is not available for backfill.');
  const avail = a.available(); if (avail !== true) throw new BackfillError('PROVIDER_UNAVAILABLE', avail);
  if (!a.describe) return { summary: `${a.label}`, details: {} };
  return a.describe(adapterCfg && typeof adapterCfg === 'object' && !Array.isArray(adapterCfg) ? adapterCfg : {});
}
