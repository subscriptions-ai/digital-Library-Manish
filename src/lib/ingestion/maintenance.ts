import { ingestionDb as db } from './db.js';
import { maintenanceConfig } from './policy.js';
import { createRunWithStats } from './departmentStats.js';
import { LOCAL_JOBS, nextLocalJob, localOutcomeIsUseful, recordLocalOutcome, type LocalJob, type LocalOutcome } from './localWork.js';
import type { Group } from './rotationState.js';

/**
 * The MAINTENANCE lane.
 *
 * Work on records the catalogue already holds — licence completion, the second pass over held candidates, department classification — is a
 * lane of its own, beside discovery and never in front of it:
 *
 *   · it runs on its own cadence (INGESTION_MAINTENANCE_SECONDS, default 120), not in place of a discovery turn and not only when discovery has
 *     nothing to do;
 *   · it keeps its own state row (`ingestion.maintenance.v1`), so it can never overwrite the discovery scheduler's;
 *   · it is started WITHOUT being waited for, so a long backlog cannot delay the next discovery tick;
 *   · it does not touch the engine's health fields (last pass, last success, phase): "the engine is alive" is a statement about discovery.
 *
 * It creates no record and asks no source. Every job re-applies a rule the harvest already applies to data the harvest already fetched, and
 * publishes nothing that does not pass every rule it would have passed at harvest (see localWork.ts).
 */

type RunSummary = {
  at: string; job: string; label: string; group: Group; ok: boolean;
  checked: number; promoted: number; enriched: number; stillHeld: number; newEvidence: number; sentToReview: number; note: string;
};
export type MaintenanceState = {
  running: { job: string; label: string; group: Group; since: string } | null;
  /** When the lane last LOOKED (ran a job, or found nothing to do): the cadence is measured from here. */
  lastCheckAt: string | null;
  last: RunSummary | null;
  runs: number;
  /** The second pass over held candidates, cumulative: what the lane has done with the held backlog so far. */
  heldRecheck: { checked: number; newEvidence: number; promoted: number; sentToReview: number; stillHeld: number };
  updatedAt: string | null;
};

const KEY = 'ingestion.maintenance.v1';
const blank = (): MaintenanceState => ({ running: null, lastCheckAt: null, last: null, runs: 0, heldRecheck: { checked: 0, newEvidence: 0, promoted: 0, sentToReview: 0, stillHeld: 0 }, updatedAt: null });

export async function loadMaintenance(): Promise<MaintenanceState> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v: any = row?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...blank(), ...v, heldRecheck: { ...blank().heldRecheck, ...(v.heldRecheck || {}) } } : blank();
}
async function saveMaintenance(s: MaintenanceState) {
  s.updatedAt = new Date().toISOString();
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s as any, updatedBy: 'engine' }, update: { value: s as any, updatedBy: 'engine' } }).catch(() => {});
}
/** Tests only. A scheduling row; no catalogue data is touched. */
export async function __resetMaintenance() { await db.appSetting.deleteMany({ where: { key: KEY } }).catch(() => {}); }

// ── The jobs (plugged in, so the lane can be tested with stand-ins) ─────────

type Picker = (jobs: LocalJob[], allow: (g: Group) => boolean) => Promise<{ job: LocalJob; pending: number } | null>;
let jobs: LocalJob[] = LOCAL_JOBS;
let picker: Picker = nextLocalJob;
export const setMaintenanceJobs = (j: LocalJob[], p: Picker = nextLocalJob) => { jobs = j; picker = p; };
export const getMaintenanceJobs = () => jobs;

// ── One run ─────────────────────────────────────────────────────────────────

export type MaintenanceRun =
  | { ran: false; reason: 'disabled' | 'busy' | 'not-due' | 'nothing-to-do' }
  | { ran: true; job: string; label: string; group: Group; outcome: LocalOutcome | null; error: string | null };

let inFlight: Promise<MaintenanceRun> | null = null;

/**
 * Run one maintenance job if the lane is due (or `force`). Returns at once when another run is in progress in this process. Never throws.
 */
export function runMaintenanceOnce(opts: { force?: boolean } = {}): Promise<MaintenanceRun> {
  if (inFlight) return Promise.resolve({ ran: false, reason: 'busy' });
  const p = doRun(opts).catch((e): MaintenanceRun => { console.error('[ingest] maintenance failed:', e); return { ran: false, reason: 'nothing-to-do' }; }).finally(() => { inFlight = null; });
  inFlight = p;
  return p;
}

/** Start the lane without waiting for it: what a discovery tick calls. */
export function startMaintenance(): void { void runMaintenanceOnce(); }

/** Tests: wait for whatever run is in progress. */
export async function __awaitMaintenance(): Promise<void> { while (inFlight) await inFlight.catch(() => {}); }

async function doRun(opts: { force?: boolean }): Promise<MaintenanceRun> {
  const cfg = maintenanceConfig();
  if (!cfg.enabled || !jobs.length) return { ran: false, reason: 'disabled' };
  const s = await loadMaintenance();
  if (!opts.force && s.lastCheckAt && Date.now() - Date.parse(s.lastCheckAt) < cfg.intervalSeconds * 1000) return { ran: false, reason: 'not-due' };

  s.lastCheckAt = new Date().toISOString();
  const picked = await picker(jobs, () => true).catch(() => null);
  if (!picked) { s.running = null; await saveMaintenance(s); return { ran: false, reason: 'nothing-to-do' }; }

  const { job, pending } = picked;
  s.running = { job: job.id, label: job.label, group: job.group, since: new Date().toISOString() };
  await saveMaintenance(s);

  const t0 = Date.now();
  let o: LocalOutcome | null = null; let err: string | null = null;
  try { o = await job.run(cfg.batch); } catch (e: any) { err = String(e?.message || e).slice(0, 300); }
  if (o) await recordLocalOutcome(job.id, o).catch(() => {});

  // The run log gets a row, as it always did, so what the lane did is visible. It is marked as backlog work and carries no `added`: nothing here is new.
  if (o) {
    await createRunWithStats({
      phase: job.group, source: job.label, more: pending > o.checked, durationMs: Date.now() - t0,
      added: 0, promoted: o.promoted, enriched: o.enriched, skippedHeld: o.duplicates, skippedRejected: o.refused, skippedFailed: o.failed,
      note: `Backlog · ${o.note}`.slice(0, 900),
    }, null).catch(() => {});
  } else {
    await createRunWithStats({ phase: 'Error', source: job.label, error: `Backlog job failed — ${err}`.slice(0, 500) }, null).catch(() => {});
  }

  const fresh = await loadMaintenance();               // the job may have taken a while; nothing else writes this row, but read it anyway
  fresh.running = null; fresh.lastCheckAt = s.lastCheckAt; fresh.runs = (fresh.runs || 0) + 1;
  fresh.last = {
    at: new Date().toISOString(), job: job.id, label: job.label, group: job.group, ok: !!o,
    checked: o?.checked ?? 0, promoted: o?.promoted ?? 0, enriched: o?.enriched ?? 0, stillHeld: o?.stillHeld ?? 0, newEvidence: o?.newEvidence ?? 0, sentToReview: o?.sentToReview ?? 0,
    note: (o?.note ?? err ?? '').slice(0, 400),
  };
  if (o && job.id === 'held-books') {
    const h = fresh.heldRecheck;
    h.checked += o.checked; h.newEvidence += o.newEvidence ?? 0; h.promoted += o.promoted; h.sentToReview += o.sentToReview ?? 0; h.stillHeld += o.stillHeld;
  }
  await saveMaintenance(fresh);
  return { ran: true, job: job.id, label: job.label, group: job.group, outcome: o, error: err };
}

// ── What the screen shows ───────────────────────────────────────────────────

export async function maintenanceStatus() {
  const cfg = maintenanceConfig();
  const s = await loadMaintenance();
  const backlog = jobs.length ? await Promise.all(jobs.map(async j => ({ id: j.id, label: j.label, group: j.group, pending: await j.pending().catch(() => 0) }))) : [];
  const nextRunAt = cfg.enabled && s.lastCheckAt ? new Date(Date.parse(s.lastCheckAt) + cfg.intervalSeconds * 1000).toISOString() : null;
  return {
    enabled: cfg.enabled && jobs.length > 0, intervalSeconds: cfg.intervalSeconds,
    running: s.running, last: s.last, runs: s.runs, lastCheckAt: s.lastCheckAt, nextRunAt, backlog, heldRecheck: s.heldRecheck,
    /** Whether the last run changed anything. A run that only looked is still progress through the backlog. */
    lastUseful: s.last ? s.last.promoted > 0 || s.last.enriched > 0 : false,
  };
}

export { localOutcomeIsUseful };
