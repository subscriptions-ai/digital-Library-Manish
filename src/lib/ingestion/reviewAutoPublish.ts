import { randomUUID } from 'node:crypto';
import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { judge, tierOf, famNames, licenceState, CURRENT_THRESHOLDS, type Thresholds, type Tier } from './reviewClassification.js';
import { acquireReviewJob, releaseReviewJob, reviewJobHolder } from './reviewJobLock.js';
import { approvedThresholds } from './reviewBatch.js';
import { PUBLISH_COLUMNS, PUBLISH_REASON_LABEL, currentBookMinYear, type PublishReason } from './publicationEligibility.js';
import { publishOne, evaluateForPublication, assertPublishEnabled, publishGate, newPublishTally, tallyPublish, type PublishRule, type PublishTally } from './reviewPublish.js';
import { CLASSIFIER_RULES_VERSION, ANALYSIS_CLASSIFIER_V2, type ClassifierVariant } from './books/classifier.js';

/**
 * Review Automation — "Publish Eligible High / Medium Confidence": the bounded, previewed, cancellable, resumable job.
 *
 * It follows the assignment job's design (reviewAutoAssign.ts) and shares its lock: CHUNK books at a time by id, each candidate through
 * publishOne() (which revalidates classification AND publication eligibility at the moment of writing), state kept in one AppSetting row after
 * every chunk, "interrupted" after a restart until a person presses Resume, cancel finishing the chunk in hand and keeping what was published.
 *
 *   High and Medium are never one action: a job has exactly one tier. Low and Unclassifiable are not offered.
 *   A preview must exist first, for the same classifier, tier and scope — the server refuses to start without it, and the eligible count a person
 *   confirms comes from the server's own read of the queue, never from the browser.
 *   A Medium job also needs the person to say they have reviewed a sample.
 *   Idempotent: a published book leaves the queue (it is no longer a Draft), so a second run publishes nothing; the books skipped for a reason are
 *   skipped again for the same reason.
 */

export const CHUNK = 100;
const KEY = 'REVIEW_AUTO_PUBLISH_JOB';
const PREVIEW_MAX_AGE_MS = 60 * 60_000;
const SAMPLE = 40;
export type PublishTier = 'high' | 'medium';
export type Scope = { source?: string; department?: string };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const version = (v: ClassifierVariant) => (v === 'v2' ? ANALYSIS_CLASSIFIER_V2 : CLASSIFIER_RULES_VERSION);
const cleanScope = (s: Scope = {}): Scope => ({ ...(s.source ? { source: String(s.source).slice(0, 80) } : {}), ...(s.department ? { department: String(s.department).slice(0, 120) } : {}) });
const matches = (r: { source: string; dept: string | null }, s: Scope) => (!s.source || r.source === s.source) && (!s.department || r.dept === s.department);
export class AutoPublishError extends Error { constructor(message: string, public code = 'invalid') { super(message); this.name = 'AutoPublishError'; } }

const QUEUE_FOR_PUBLISH = `status = 'Draft' and "ownershipSource" = 'Ingested' and "rejectionNote" is null`;
async function readChunk(afterId: string, limit = CHUNK): Promise<any[]> {
  return db.$queryRawUnsafe(`select ${PUBLISH_COLUMNS} from "Book" where ${QUEUE_FOR_PUBLISH} and id > $1 order by id limit ${limit}`, afterId).catch(() => []);
}

/** The tier a book has under the approved thresholds. */
const tierFor = (r: { score: number; margin: number; fam: number }, t: Thresholds): Tier => tierOf(r.score, r.margin, r.fam, t);

// ── Preview (reads only) ────────────────────────────────────────────────────

export type SampleRow = { id: string; title: string; source: string; year: number | null; licenceState: string; suggested: string | null; score: number; margin: number; evidence: string[]; eligible: boolean; reason: string | null };
export type PublishPreview = {
  status: 'idle' | 'running' | 'done' | 'failed'; classifier: ClassifierVariant | null; tier: PublishTier | null; scope: Scope; thresholds: Thresholds | null; thresholdsApproved: boolean;
  processed: number; total: number; candidates: number; eligible: number; ineligible: number; departmentsToAssign: number;
  reasons: Record<string, number>; byDepartment: { department: string; n: number }[]; bySource: Record<string, number>; sample: SampleRow[]; asOf: string | null; error: string | null;
};
const blankPreview = (): PublishPreview => ({ status: 'idle', classifier: null, tier: null, scope: {}, thresholds: null, thresholdsApproved: false, processed: 0, total: 0, candidates: 0, eligible: 0, ineligible: 0, departmentsToAssign: 0, reasons: {}, byDepartment: [], bySource: {}, sample: [], asOf: null, error: null });
let preview: PublishPreview = blankPreview();
export const publishPreviewState = (): PublishPreview => ({ ...preview });
export const __resetPublish = () => { preview = blankPreview(); live = null; };

export function startPublishPreview(classifier: unknown, tier: unknown, scope: Scope = {}): boolean {
  if (classifier !== 'v1' && classifier !== 'v2') throw new AutoPublishError('Choose the classifier (v1 or v2).');
  if (tier !== 'high' && tier !== 'medium') throw new AutoPublishError('Choose High or Medium confidence. Low and Unclassifiable books are never published in bulk.');
  if (preview.status === 'running' || !acquireReviewJob('publish-preview')) return false;
  const t = approvedThresholds();
  const thresholds = t.thresholds ?? CURRENT_THRESHOLDS;   // without approved thresholds a preview still works, under the provisional ones, and says so (thresholdsApproved: false); a job never starts without them
  const sc = cleanScope(scope);
  const rule: PublishRule = { classifier, tiers: [tier], thresholds };
  preview = { ...blankPreview(), status: 'running', classifier, tier, scope: sc, thresholds, thresholdsApproved: !!t.thresholds };
  (async () => {
    try {
      const [n] = await (db.$queryRawUnsafe(`select count(*)::int n from "Book" where ${QUEUE_FOR_PUBLISH}`) as Promise<any[]>);
      preview.total = Number(n?.n ?? 0);
      const minYear = await currentBookMinYear();
      const dept: Record<string, number> = {}; let last = '', seen = 0;
      for (;;) {
        const rows = await readChunk(last);
        if (!rows.length) break;
        for (const b of rows) {
          const r = judge(b, classifier);
          if (!r.dept || tierFor(r, thresholds) !== tier || !matches(r, sc)) continue;
          preview.candidates++;
          const ev = await evaluateForPublication(b, rule, null, minYear);
          let reason: PublishReason | null = null;
          if (ev.ok) { preview.eligible++; if (ev.assign) preview.departmentsToAssign++; dept[r.dept] = (dept[r.dept] || 0) + 1; preview.bySource[r.source] = (preview.bySource[r.source] || 0) + 1; }
          else { preview.ineligible++; reason = ev.reason!; const l = PUBLISH_REASON_LABEL[reason]; preview.reasons[l] = (preview.reasons[l] || 0) + 1; }
          // A bounded, representative sample (reservoir): what an admin reads before approving a Medium batch.
          seen++;
          const row: SampleRow = { id: b.id, title: String(b.title || '').slice(0, 140), source: r.source, year: r.year, licenceState: licenceState(b.licence, b.licenceIsNC), suggested: r.dept, score: r.score, margin: r.margin, evidence: [...famNames(r.fam), ...(r.ddcUsed ? ['ddc'] : [])], eligible: !!ev.ok, reason: reason ? PUBLISH_REASON_LABEL[reason] : null };
          if (preview.sample.length < SAMPLE) preview.sample.push(row); else { const j = Math.floor(Math.random() * seen); if (j < SAMPLE) preview.sample[j] = row; }
        }
        last = rows[rows.length - 1].id; preview.processed += rows.length;
        await sleep(5);
      }
      preview.byDepartment = Object.entries(dept).map(([department, n]) => ({ department, n })).sort((a, b) => b.n - a.n).slice(0, 12);
      preview.status = 'done'; preview.asOf = new Date().toISOString();
    } catch (e: any) { preview.status = 'failed'; preview.error = String(e?.message || e).slice(0, 300); }
    releaseReviewJob('publish-preview');
  })();
  return true;
}

// ── The job ─────────────────────────────────────────────────────────────────

export type PublishJob = {
  id: string; status: 'running' | 'done' | 'cancelled' | 'failed' | 'interrupted'; tier: PublishTier; classifier: ClassifierVariant; classifierVersion: number; thresholds: Thresholds; scope: Scope;
  startedAt: string; finishedAt: string | null; by: string | null; eligibleAtPreview: number | null; candidatesAtPreview: number | null; cursor: string; scanned: number; cancelRequested: boolean; error: string | null;
} & PublishTally;
let live: PublishJob | null = null;
const persist = async (j: PublishJob) => { await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: j as any, updatedBy: j.by || 'review-automation' }, update: { value: j as any, updatedBy: j.by || 'review-automation' } }); };

export async function autoPublishStatus(): Promise<PublishJob | null> {
  if (live) return { ...live };
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const j = (row?.value as PublishJob) ?? null;
  return j && j.status === 'running' ? { ...j, status: 'interrupted' } : j;
}

async function finish(j: PublishJob, status: PublishJob['status'], error: string | null = null) {
  // The terminal state is made visible (in memory and in the saved record) only together with the release of the job lock, never before it:
  // anything that reads "done" and immediately starts the next job (a preview, a start) must not find the lock still held.
  const closed: PublishJob = { ...j, status, finishedAt: new Date().toISOString(), error };
  await persist(closed).catch(() => {});
  await audit(j.by ? { email: j.by } : null, 'REVIEW_PUBLISH_FINISHED', {
    jobId: j.id, status, tier: j.tier, classifier: j.classifier, classifierVersion: j.classifierVersion,
    thresholds: { highMinScore: j.thresholds.highMinScore, highMinMargin: j.thresholds.highMinMargin, highRequiresCode: j.thresholds.highRequiresCode }, scope: j.scope,
    eligibleAtPreview: j.eligibleAtPreview, candidatesAtPreview: j.candidatesAtPreview, requested: j.requested, published: j.published, departmentsAssigned: j.departmentsAssigned,
    skipped: j.skipped, failed: j.failed, skippedReasons: j.skippedReasons, cancelled: status === 'cancelled', publishes: true, error,
    cancelledRemaining: status === 'cancelled' && j.candidatesAtPreview != null ? Math.max(0, j.candidatesAtPreview - j.requested) : null,
  });
  Object.assign(j, closed);   // the caller's object turns terminal at the same moment the lock goes
  live = null; releaseReviewJob('auto-publish');
}

async function work(j: PublishJob) {
  const by = j.by ? { email: j.by } : null;
  const rule: PublishRule = { classifier: j.classifier, tiers: [j.tier], thresholds: j.thresholds };
  try {
    const minYear = await currentBookMinYear();
    for (;;) {
      if (j.cancelRequested) return finish(j, 'cancelled');
      const rows = await readChunk(j.cursor);
      if (!rows.length) return finish(j, 'done');
      for (const b of rows) {
        const r = judge(b, j.classifier);
        if (!r.dept || tierFor(r, j.thresholds) !== j.tier || !matches(r, j.scope)) continue;
        try { tallyPublish(j, await publishOne({ bookId: b.id, rule, action: `publish-${j.tier}`, by }, { minYear })); }
        catch { tallyPublish(j, { result: 'failed' }); }
      }
      j.cursor = rows[rows.length - 1].id; j.scanned += rows.length;
      await persist(j).catch(() => {});
      await sleep(20);
    }
  } catch (e: any) { return finish(j, 'failed', String(e?.message || e).slice(0, 300)); }
}

export async function startAutoPublish(admin: { uid?: string; email?: string } | null, opts: { classifier: unknown; tier: unknown; scope?: Scope; sampleReviewed?: unknown }): Promise<PublishJob> {
  assertPublishEnabled();
  if (opts.classifier !== 'v1' && opts.classifier !== 'v2') throw new AutoPublishError('Choose the classifier (v1 or v2) before starting.');
  if (opts.tier !== 'high' && opts.tier !== 'medium') throw new AutoPublishError('Choose High or Medium confidence. Low and Unclassifiable books are never published in bulk.');
  const classifier = opts.classifier as ClassifierVariant, tier = opts.tier as PublishTier;
  const t = approvedThresholds();
  if (!t.thresholds) throw new AutoPublishError(t.problem || 'No thresholds have been approved.', 'thresholds');
  if (tier === 'medium' && opts.sampleReviewed !== true) throw new AutoPublishError('Review a sample of the Medium-confidence books first, and confirm that you have.', 'sample');
  const scope = cleanScope(opts.scope);
  // The preview this start is confirming: same classifier, tier and scope, and recent. The eligible count a person agreed to came from it.
  const p = preview;
  if (p.status !== 'done' || p.classifier !== classifier || p.tier !== tier || JSON.stringify(p.scope) !== JSON.stringify(scope) || !p.thresholdsApproved
      || !p.asOf || Date.now() - Date.parse(p.asOf) > PREVIEW_MAX_AGE_MS) throw new AutoPublishError('Preview the publication first (for this classifier, confidence and scope). The preview must be less than an hour old.', 'preview');
  const prior = await autoPublishStatus();
  if (prior && (prior.status === 'running' || prior.status === 'interrupted')) throw new AutoPublishError('A publication job is already in progress. Resume or cancel it first.', 'busy');
  if (!acquireReviewJob('auto-publish')) throw new AutoPublishError(`Another review job (${reviewJobHolder()}) is running. Try again when it has finished.`, 'busy');
  const j: PublishJob = {
    id: randomUUID(), status: 'running', tier, classifier, classifierVersion: version(classifier), thresholds: t.thresholds, scope, startedAt: new Date().toISOString(), finishedAt: null,
    by: admin?.email || admin?.uid || null, eligibleAtPreview: p.eligible, candidatesAtPreview: p.candidates, cursor: '', scanned: 0, cancelRequested: false, error: null, ...newPublishTally(),
  };
  live = j;
  try { await persist(j); } catch (e) { live = null; releaseReviewJob('auto-publish'); throw e; }
  await audit(admin, 'REVIEW_PUBLISH_STARTED', { jobId: j.id, tier, classifier, thresholds: { highMinScore: t.thresholds.highMinScore, highMinMargin: t.thresholds.highMinMargin, highRequiresCode: t.thresholds.highRequiresCode }, scope, eligibleAtPreview: p.eligible, candidatesAtPreview: p.candidates, sampleReviewed: tier === 'medium' ? true : null });
  void work(j);
  return { ...j };
}

export async function resumeAutoPublish(admin: { uid?: string; email?: string } | null): Promise<PublishJob> {
  assertPublishEnabled();
  const j = await autoPublishStatus();
  if (!j || j.status !== 'interrupted') throw new AutoPublishError('There is no interrupted publication job to resume.', 'nothing');
  const t = approvedThresholds();
  const same = t.thresholds && t.thresholds.highMinScore === j.thresholds.highMinScore && t.thresholds.highMinMargin === j.thresholds.highMinMargin && t.thresholds.highRequiresCode === j.thresholds.highRequiresCode;
  if (!same) throw new AutoPublishError('The approved thresholds have changed since this job started, so it cannot be resumed. Cancel it and start again.', 'thresholds');
  if (!acquireReviewJob('auto-publish')) throw new AutoPublishError(`Another review job (${reviewJobHolder()}) is running.`, 'busy');
  const run: PublishJob = { ...j, status: 'running', cancelRequested: false, error: null, finishedAt: null };
  live = run;
  await persist(run);
  await audit(admin, 'REVIEW_PUBLISH_STARTED', { jobId: run.id, resumed: true, tier: run.tier, classifier: run.classifier });
  void work(run);
  return { ...run };
}

export async function cancelAutoPublish(admin: { uid?: string; email?: string } | null): Promise<PublishJob> {
  if (live) { live.cancelRequested = true; await persist(live).catch(() => {}); return { ...live }; }
  const j = await autoPublishStatus();
  if (!j || j.status !== 'interrupted') throw new AutoPublishError('There is no publication job to cancel.', 'nothing');
  const closed = { ...j, by: j.by ?? admin?.email ?? null };
  await finish(closed, 'cancelled');
  return closed;
}
export { publishGate };
