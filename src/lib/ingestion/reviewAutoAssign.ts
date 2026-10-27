import { randomUUID } from 'node:crypto';
import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { assignDepartmentStayDraft } from './reviewAssignment.js';
import { readChunk, judge, tierOf, loadSummary, forgetRows, CURRENT_THRESHOLDS, type Thresholds, type Tier } from './reviewClassification.js';
import { acquireReviewJob, releaseReviewJob, reviewJobHolder } from './reviewJobLock.js';
import { assertAssignmentEnabled, approvedThresholds, autoAssignEnabled, newTally, tally, GATE_OFF_MESSAGE, type Tally } from './reviewBatch.js';
import { CLASSIFIER_RULES_VERSION, ANALYSIS_CLASSIFIER_V2, type ClassifierVariant } from './books/classifier.js';

/**
 * Review Automation R2 — "Auto-assign High Confidence": a bounded, resumable, cancellable job that gives a department to the Books in the
 * "Needs a department" queue that the chosen classifier is confident about, and does nothing else to them. It never publishes a book.
 *
 *   gate        off unless REVIEW_AUTO_ASSIGN_ENABLED=true, and unless an operator has written the approved thresholds down
 *               (REVIEW_AUTO_ASSIGN_THRESHOLDS). The classifier must be chosen explicitly, and an analysis with that classifier must exist.
 *   chunks      CHUNK books at a time, by id. Each is judged, and the ones that qualify go one by one through assignDepartmentStayDraft(), which
 *               revalidates them at the moment of writing. No transaction spans more than one book, and no table is locked.
 *   state       kept in one AppSetting row after every chunk (a cursor and counters, never a list of books), so progress is visible and a
 *               restart loses nothing. After a restart the job shows as "interrupted" and is continued by a person pressing Resume — it never
 *               starts again by itself.
 *   idempotent  an assigned book leaves the queue (it has a department), and an assignment of a book that has one is refused, so a second run
 *               over the same queue assigns nothing.
 *   cancel      finishes the chunk in hand, stops, and keeps what was assigned. There is no rollback.
 */

export const CHUNK = 100;
const KEY = 'REVIEW_AUTO_ASSIGN_JOB';
const TIERS: Tier[] = ['high'];

export type Scope = { source?: string; department?: string };
export type AutoAssignJob = {
  id: string; status: 'running' | 'done' | 'cancelled' | 'failed' | 'interrupted';
  classifier: ClassifierVariant; classifierVersion: number; thresholds: Thresholds; scope: Scope;
  startedAt: string; finishedAt: string | null; by: string | null;
  /** How many the preview (or the start) expected to qualify: a guide for the progress bar, not a promise. */
  eligibleAtStart: number | null;
  cursor: string; scanned: number; cancelRequested: boolean; error: string | null;
} & Tally;

let live: AutoAssignJob | null = null;   // the job this process is running right now
const persist = async (j: AutoAssignJob) => { await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: j as any, updatedBy: j.by || 'review-automation' }, update: { value: j as any, updatedBy: j.by || 'review-automation' } }); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const variantVersion = (v: ClassifierVariant) => (v === 'v2' ? ANALYSIS_CLASSIFIER_V2 : CLASSIFIER_RULES_VERSION);

export class AutoAssignError extends Error { constructor(message: string, public code = 'invalid') { super(message); this.name = 'AutoAssignError'; } }

export type AutoAssignConfig = {
  enabled: boolean; gateMessage: string | null; thresholds: Thresholds | null; thresholdsProblem: string | null; chunk: number; tiers: Tier[];
};
export function autoAssignConfig(): AutoAssignConfig {
  const t = approvedThresholds();
  return { enabled: autoAssignEnabled(), gateMessage: autoAssignEnabled() ? null : GATE_OFF_MESSAGE, thresholds: t.thresholds, thresholdsProblem: t.problem, chunk: CHUNK, tiers: TIERS };
}

/** The persisted job, with a job this process is no longer running reported as interrupted rather than running forever. */
export async function autoAssignStatus(): Promise<AutoAssignJob | null> {
  if (live) return { ...live };
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const j = (row?.value as AutoAssignJob) ?? null;
  return j && j.status === 'running' ? { ...j, status: 'interrupted' } : j;
}

const matchesScope = (r: { source: string; dept: string | null }, s: Scope) => (!s.source || r.source === s.source) && (!s.department || r.dept === s.department);

async function finish(j: AutoAssignJob, status: AutoAssignJob['status'], error: string | null = null) {
  j.status = status; j.finishedAt = new Date().toISOString(); j.error = error;
  await persist(j).catch(() => {});
  await audit(j.by ? { email: j.by } : null, 'REVIEW_AUTO_ASSIGN_FINISHED', {
    jobId: j.id, status, classifier: j.classifier, classifierVersion: j.classifierVersion, thresholds: { highMinScore: j.thresholds.highMinScore, highMinMargin: j.thresholds.highMinMargin, highRequiresCode: j.thresholds.highRequiresCode },
    scope: j.scope, requested: j.requested, assigned: j.assigned, skipped: j.skipped, failed: j.failed, skippedReasons: j.skippedReasons, cancelled: status === 'cancelled', publishes: false, error,
  });
  live = null; releaseReviewJob('auto-assign');
}

async function work(j: AutoAssignJob) {
  const by = j.by ? { email: j.by } : null;
  try {
    for (;;) {
      if (j.cancelRequested) return finish(j, 'cancelled');
      const rows = await readChunk(j.cursor, undefined, CHUNK);
      if (!rows.length) return finish(j, 'done');
      for (const b of rows) {
        const r = judge(b, j.classifier);
        if (!r.dept || !TIERS.includes(tierOf(r.score, r.margin, r.fam, j.thresholds)) || !matchesScope(r, j.scope)) continue;
        try {
          const o = await assignDepartmentStayDraft({ bookId: b.id, department: r.dept, basis: 'classifier', rule: { classifier: j.classifier, tiers: TIERS, thresholds: j.thresholds }, source: 'auto-assign-high', by });
          tally(j, o);
          if (o.result === 'assigned') forgetRows([b.id]);   // it has left the queue: keep Batch Review's list honest
        } catch { tally(j, { result: 'failed' }); }
      }
      j.cursor = rows[rows.length - 1].id; j.scanned += rows.length;
      await persist(j).catch(() => {});
      await sleep(20);   // the engine and the admin screens share this process
    }
  } catch (e: any) { return finish(j, 'failed', String(e?.message || e).slice(0, 300)); }
}

export async function startAutoAssign(admin: { uid?: string; email?: string } | null, opts: { classifier: unknown; scope?: Scope; eligibleAtStart?: number | null }): Promise<AutoAssignJob> {
  assertAssignmentEnabled();
  if (opts.classifier !== 'v1' && opts.classifier !== 'v2') throw new AutoAssignError('Choose the classifier (v1 or v2) before starting.');
  const classifier = opts.classifier as ClassifierVariant;
  const t = approvedThresholds();
  if (!t.thresholds) throw new AutoAssignError(t.problem || 'No thresholds have been approved.', 'thresholds');
  const summary = await loadSummary();
  if (!summary) throw new AutoAssignError('Run the classification analysis first: assignment is only offered once the queue has been analysed.', 'no-analysis');
  if ((summary.classifier ?? 'v1') !== classifier) throw new AutoAssignError(`The last analysis used classifier ${summary.classifier ?? 'v1'}. Run the analysis with ${classifier} before assigning with it.`, 'wrong-analysis');
  const prior = await autoAssignStatus();
  if (prior && (prior.status === 'running' || prior.status === 'interrupted')) throw new AutoAssignError('An assignment job is already in progress. Resume or cancel it first.', 'busy');
  if (!acquireReviewJob('auto-assign')) throw new AutoAssignError(`Another review job (${reviewJobHolder()}) is running. Try again when it has finished.`, 'busy');
  const scope: Scope = { ...(opts.scope?.source ? { source: String(opts.scope.source).slice(0, 80) } : {}), ...(opts.scope?.department ? { department: String(opts.scope.department).slice(0, 120) } : {}) };
  const j: AutoAssignJob = {
    id: randomUUID(), status: 'running', classifier, classifierVersion: variantVersion(classifier), thresholds: t.thresholds, scope, startedAt: new Date().toISOString(), finishedAt: null,
    by: admin?.email || admin?.uid || null, eligibleAtStart: typeof opts.eligibleAtStart === 'number' ? opts.eligibleAtStart : null, cursor: '', scanned: 0, cancelRequested: false, error: null, ...newTally(),
  };
  live = j;
  try { await persist(j); } catch (e) { live = null; releaseReviewJob('auto-assign'); throw e; }
  await audit(admin, 'REVIEW_AUTO_ASSIGN_STARTED', { jobId: j.id, classifier, classifierVersion: j.classifierVersion, thresholds: { highMinScore: t.thresholds.highMinScore, highMinMargin: t.thresholds.highMinMargin, highRequiresCode: t.thresholds.highRequiresCode }, scope, eligibleAtStart: j.eligibleAtStart });
  void work(j);
  return { ...j };
}

/** Continue an interrupted job from its cursor. The approved thresholds must be the ones it started with. */
export async function resumeAutoAssign(admin: { uid?: string; email?: string } | null): Promise<AutoAssignJob> {
  assertAssignmentEnabled();
  const j = await autoAssignStatus();
  if (!j || j.status !== 'interrupted') throw new AutoAssignError('There is no interrupted assignment job to resume.', 'nothing');
  const t = approvedThresholds();
  const same = t.thresholds && t.thresholds.highMinScore === j.thresholds.highMinScore && t.thresholds.highMinMargin === j.thresholds.highMinMargin && t.thresholds.highRequiresCode === j.thresholds.highRequiresCode;
  if (!same) throw new AutoAssignError('The approved thresholds have changed since this job started, so it cannot be resumed. Cancel it and start again.', 'thresholds');
  if (!acquireReviewJob('auto-assign')) throw new AutoAssignError(`Another review job (${reviewJobHolder()}) is running.`, 'busy');
  const run: AutoAssignJob = { ...j, status: 'running', cancelRequested: false, error: null, finishedAt: null };
  live = run;
  await persist(run);
  await audit(admin, 'REVIEW_AUTO_ASSIGN_STARTED', { jobId: run.id, resumed: true, cursorAfterScanned: run.scanned, classifier: run.classifier });
  void work(run);
  return { ...run };
}

/** Stop future chunks; what has been assigned stays assigned. An interrupted job (no worker) is closed straight away. */
export async function cancelAutoAssign(admin: { uid?: string; email?: string } | null): Promise<AutoAssignJob> {
  if (live) { live.cancelRequested = true; await persist(live).catch(() => {}); return { ...live }; }
  const j = await autoAssignStatus();
  if (!j || j.status !== 'interrupted') throw new AutoAssignError('There is no assignment job to cancel.', 'nothing');
  const closed = { ...j, by: j.by ?? admin?.email ?? null };
  await finish(closed, 'cancelled');
  return closed;
}

export const __resetAutoAssign = () => { live = null; };

// ── Preview: how many would qualify right now (reads only; needs no gate) ───

export type Preview = {
  status: 'idle' | 'running' | 'done' | 'failed'; classifier: ClassifierVariant | null; scope: Scope; thresholds: Thresholds | null; thresholdsApproved: boolean;
  processed: number; total: number; eligible: number; byDepartment: { department: string; n: number }[]; bySource: Record<string, number>; asOf: string | null; error: string | null;
};
let preview: Preview = { status: 'idle', classifier: null, scope: {}, thresholds: null, thresholdsApproved: false, processed: 0, total: 0, eligible: 0, byDepartment: [], bySource: {}, asOf: null, error: null };
export const previewState = (): Preview => ({ ...preview });
export const __resetPreview = () => { preview = { status: 'idle', classifier: null, scope: {}, thresholds: null, thresholdsApproved: false, processed: 0, total: 0, eligible: 0, byDepartment: [], bySource: {}, asOf: null, error: null }; };

export function startPreview(classifier: unknown, scope: Scope = {}): boolean {
  if (classifier !== 'v1' && classifier !== 'v2') throw new AutoAssignError('Choose the classifier (v1 or v2).');
  if (preview.status === 'running' || !acquireReviewJob('preview')) return false;
  const t = approvedThresholds();
  const thresholds = t.thresholds ?? CURRENT_THRESHOLDS;
  const sc: Scope = { ...(scope.source ? { source: String(scope.source).slice(0, 80) } : {}), ...(scope.department ? { department: String(scope.department).slice(0, 120) } : {}) };
  preview = { status: 'running', classifier, scope: sc, thresholds, thresholdsApproved: !!t.thresholds, processed: 0, total: 0, eligible: 0, byDepartment: [], bySource: {}, asOf: null, error: null };
  (async () => {
    try {
      const [n] = await (db.$queryRawUnsafe(`select count(*)::int n from "Book" where status = 'Draft' and "ownershipSource" = 'Ingested' and domain is null and "rejectionNote" is null`) as Promise<any[]>);
      preview.total = Number(n?.n ?? 0);
      const dept: Record<string, number> = {}; let last = '';
      for (;;) {
        const rows = await readChunk(last);
        if (!rows.length) break;
        for (const b of rows) {
          const r = judge(b, classifier);
          if (r.dept && TIERS.includes(tierOf(r.score, r.margin, r.fam, thresholds)) && matchesScope(r, sc)) { preview.eligible++; dept[r.dept] = (dept[r.dept] || 0) + 1; preview.bySource[r.source] = (preview.bySource[r.source] || 0) + 1; }
        }
        last = rows[rows.length - 1].id; preview.processed += rows.length;
        await sleep(5);
      }
      preview.byDepartment = Object.entries(dept).map(([department, n]) => ({ department, n })).sort((a, b) => b.n - a.n).slice(0, 12);
      preview.status = 'done'; preview.asOf = new Date().toISOString();
    } catch (e: any) { preview.status = 'failed'; preview.error = String(e?.message || e).slice(0, 300); }
    releaseReviewJob('preview');
  })();
  return true;
}
