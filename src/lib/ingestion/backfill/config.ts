import { createHash } from 'node:crypto';

/**
 * Switches and limits, read from the environment on every use (a restart with a new value needs no rebuild). The gate is deployment-time ONLY: there is no runtime
 * toggle and nothing in the database can turn backfill on.
 *
 *   INGESTION_BACKFILL_ENABLED         must be "true" (or "1") for any job to be created, started, resumed or worked on. Default off.
 *   BACKFILL_MAX_RECORDS_PER_JOB       ceiling on a job's maximum records. Default 5000.
 *   BACKFILL_MAX_RUNTIME_MINUTES       active working time of one job. Default 60.
 *   BACKFILL_MAX_BYTES_PER_JOB         bytes of source data one job may process. Default 256 MB.
 *   BACKFILL_WORKER_CONCURRENCY        jobs worked at once. Phase 2A supports exactly 1; a larger value is read as 1.
 *   BACKFILL_CHUNK_SIZE                records per chunk. Default 100 (never above 500).
 *   BACKFILL_MIN_GAP_SECONDS           least wait between two chunks; the worker also waits as long as the chunk took (at most half its time on a provider). Default 10.
 *   BACKFILL_HEARTBEAT_SECONDS         how often a worker says it is alive WHILE a chunk is running. Default 20.
 *   BACKFILL_HEARTBEAT_STALE_SECONDS   a Running job silent this long was interrupted and may be taken over. Default 120 (always at least 3 heartbeats).
 *   BACKFILL_IDLE_POLL_SECONDS         how often the server's worker looks for a job when it has none. Default 15.
 *   BACKFILL_PREVIEW_MAX_RECORDS       records a dry run looks at. Default 500.
 *   BACKFILL_PREVIEW_VALID_MINUTES     how long a completed dry run lets its configuration be started for real. Default 60.
 *   BACKFILL_FIXTURE=1                 the test fixture adapter exists (never when NODE_ENV=production).
 */

const envInt = (key: string, fallback: number, min: number, max: number) => {
  const raw = process.env[key]; const v = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
};

export const backfillEnabled = () => ['true', '1'].includes(String(process.env.INGESTION_BACKFILL_ENABLED ?? '').toLowerCase());

export function backfillLimits() {
  const heartbeatSeconds = envInt('BACKFILL_HEARTBEAT_SECONDS', 20, 1, 300);
  return {
    maxRecordsPerJob: envInt('BACKFILL_MAX_RECORDS_PER_JOB', 5000, 1, 10_000_000),
    maxRuntimeMinutes: envInt('BACKFILL_MAX_RUNTIME_MINUTES', 60, 1, 24 * 60),
    maxBytesPerJob: envInt('BACKFILL_MAX_BYTES_PER_JOB', 256 * 1024 * 1024, 1, Number.MAX_SAFE_INTEGER),
    workerConcurrency: 1 as const,
    chunkSize: envInt('BACKFILL_CHUNK_SIZE', 100, 1, 500),
    minGapSeconds: envInt('BACKFILL_MIN_GAP_SECONDS', 10, 0, 3600),
    heartbeatSeconds,
    // Never closer than three heartbeats, so one late beat can never look like a dead worker.
    heartbeatStaleSeconds: Math.max(envInt('BACKFILL_HEARTBEAT_STALE_SECONDS', 120, 1, 3600), heartbeatSeconds * 3),
    idlePollSeconds: envInt('BACKFILL_IDLE_POLL_SECONDS', 15, 1, 600),
    previewMaxRecords: envInt('BACKFILL_PREVIEW_MAX_RECORDS', 500, 1, 100_000),
    previewValidMinutes: envInt('BACKFILL_PREVIEW_VALID_MINUTES', 60, 1, 24 * 60),
  };
}

export const fixtureAllowed = () => process.env.BACKFILL_FIXTURE === '1' && process.env.NODE_ENV !== 'production';

/** What a person asks for. Everything that decides WHAT a job brings in is here, and therefore in the hash. */
export type BackfillRequest = {
  provider: string; contentType: string; windowStart: string | null; windowEnd: string | null; departments: string[]; accessPreference: string; maxRecords: number;
  /** The adapter's own parameters (a fixture's seed and size; a real provider's query). */
  adapter: Record<string, any>;
};

const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;

/**
 * A deterministic fingerprint of a configuration. A real start is allowed only from a completed dry run with the SAME hash, so changing the provider, the content
 * type, the window, the departments, the access preference, the maximum or any adapter parameter invalidates the preview. Departments are order-independent.
 */
export function configHash(r: BackfillRequest): string {
  const norm = canon({
    provider: r.provider, contentType: r.contentType, windowStart: r.windowStart ? new Date(r.windowStart).toISOString() : null, windowEnd: r.windowEnd ? new Date(r.windowEnd).toISOString() : null,
    departments: [...r.departments].sort(), accessPreference: r.accessPreference, maxRecords: r.maxRecords, adapter: r.adapter ?? {},
  });
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
