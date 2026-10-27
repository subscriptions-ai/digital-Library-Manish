import { audit } from './audit.js';
import { canonicalDepartmentName, CANONICAL_NAMES } from '../departmentRegistry.js';
import { assignDepartmentStayDraft, type SkipReason, type AssignmentOutcome } from './reviewAssignment.js';
import { judge, readOneForJudging, forgetRows, CURRENT_THRESHOLDS, type Thresholds, type Tier } from './reviewClassification.js';
import type { ClassifierVariant } from './books/classifier.js';

/**
 * Review Automation R2 — the gate, the approved thresholds, and the batch assignment a person triggers from Batch Review.
 *
 * Department assignment only. Nothing here approves, rejects or publishes a book: every record goes through assignDepartmentStayDraft(), which
 * re-reads the book, re-checks that it is still an ingested Draft with no department and no rejection note, re-judges it, and writes the department
 * and a bounded note in one conditional statement. A record that has changed since the person looked at it is skipped, never forced.
 */

// ── The gate ────────────────────────────────────────────────────────────────

/** Every assignment action is off unless the deployment says otherwise. Analysis, comparison and previews never need it. */
export const GATE_ENV = 'REVIEW_AUTO_ASSIGN_ENABLED';
export const THRESHOLDS_ENV = 'REVIEW_AUTO_ASSIGN_THRESHOLDS';
export const autoAssignEnabled = () => process.env[GATE_ENV] === 'true';
export const GATE_OFF_MESSAGE = 'Historical auto-assignment is disabled by configuration.';

export class AssignmentDisabledError extends Error { constructor(message = GATE_OFF_MESSAGE) { super(message); this.name = 'AssignmentDisabledError'; } }
export const assertAssignmentEnabled = () => { if (!autoAssignEnabled()) throw new AssignmentDisabledError(); };

/**
 * The "high confidence" rule an operator has approved, from REVIEW_AUTO_ASSIGN_THRESHOLDS (JSON), e.g.
 *   {"highMinScore":6,"highMinMargin":3,"highRequiresCode":true}
 * All three keys must be present: approving a rule means writing it down. Nothing is assumed when it is missing or malformed.
 */
export function approvedThresholds(): { thresholds: Thresholds | null; problem: string | null } {
  const raw = process.env[THRESHOLDS_ENV];
  if (!raw?.trim()) return { thresholds: null, problem: `No thresholds have been approved (${THRESHOLDS_ENV} is not set).` };
  let o: any;
  try { o = JSON.parse(raw); } catch { return { thresholds: null, problem: `${THRESHOLDS_ENV} is not valid JSON.` }; }
  const int = (v: any, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  if (!int(o?.highMinScore, 1, 40) || !int(o?.highMinMargin, 0, 40) || typeof o?.highRequiresCode !== 'boolean')
    return { thresholds: null, problem: `${THRESHOLDS_ENV} must give highMinScore, highMinMargin (whole numbers) and highRequiresCode (true or false).` };
  return { thresholds: { ...CURRENT_THRESHOLDS, highMinScore: o.highMinScore, highMinMargin: o.highMinMargin, highRequiresCode: o.highRequiresCode }, problem: null };
}

export const BATCH_LIMIT = 250;
const BATCH_CHUNK = 50;

/** The departments a person may choose (the product's canonical list). */
export const assignableDepartments = (): string[] => [...CANONICAL_NAMES];

// ── Skip reasons, grouped for people ────────────────────────────────────────

export type AnySkip = SkipReason | 'no-suggestion';
export const SKIP_LABEL: Record<AnySkip, string> = {
  'already-has-department': 'Department already assigned', 'classification-changed': 'Classifier changed', 'below-rule': 'Confidence dropped',
  'rejected': 'Rejected', 'not-a-draft': 'No longer a Draft', 'not-found': 'Record missing', 'not-ingested': 'Not an ingested record',
  'unknown-department': 'Unknown department', 'rule-required': 'No approved rule', 'changed-during-assignment': 'Changed while being assigned', 'no-suggestion': 'No department suggested',
};

export type Tally = { requested: number; assigned: number; skipped: number; failed: number; skippedReasons: Record<string, number> };
export const newTally = (): Tally => ({ requested: 0, assigned: 0, skipped: 0, failed: 0, skippedReasons: {} });
export function tally(t: Tally, o: AssignmentOutcome | { result: 'skipped'; reason: AnySkip } | { result: 'failed' }) {
  t.requested++;
  if (o.result === 'assigned') t.assigned++;
  else if (o.result === 'failed') t.failed++;
  else { t.skipped++; const l = SKIP_LABEL[(o as any).reason as AnySkip] ?? String((o as any).reason); t.skippedReasons[l] = (t.skippedReasons[l] || 0) + 1; }
}

// ── One book, on its own classifier suggestion ──────────────────────────────

export type SuggestedRule = { classifier: ClassifierVariant; tiers: Tier[]; thresholds?: Thresholds };

/** Assign the department the classifier suggests for this book, if it still suggests one that meets the rule. Revalidated inside. */
export async function assignSuggested(bookId: string, rule: SuggestedRule, source: string, by: { uid?: string; email?: string } | null): Promise<AssignmentOutcome | { bookId: string; result: 'skipped'; reason: AnySkip }> {
  const b = await readOneForJudging(bookId);
  if (!b) return { bookId, result: 'skipped', reason: 'not-found' };
  const row = judge(b, rule.classifier);
  if (!row.dept) return { bookId, result: 'skipped', reason: 'no-suggestion' };
  return assignDepartmentStayDraft({ bookId, department: row.dept, basis: 'classifier', rule, source, by });
}

// ── Batch Review: a bounded list of ids a person selected ───────────────────

export type BatchRequest = { ids: string[]; mode: 'suggested' | 'chosen'; classifier?: ClassifierVariant; department?: string; by: { uid?: string; email?: string } | null };
export type BatchResult = Tally & { outcomes: { id: string; result: 'assigned' | 'skipped' | 'failed'; reason?: string }[] };

export class BatchRequestError extends Error { constructor(message: string) { super(message); this.name = 'BatchRequestError'; } }

/** Medium-confidence review: a book may be assigned on its own suggestion if it is still High or Medium under the provisional thresholds. */
export const BATCH_TIERS: Tier[] = ['high', 'medium'];

export async function batchAssign(req: BatchRequest): Promise<BatchResult> {
  assertAssignmentEnabled();
  const ids = [...new Set((Array.isArray(req.ids) ? req.ids : []).filter(x => typeof x === 'string' && x.length > 0 && x.length <= 64))];
  if (!ids.length) throw new BatchRequestError('Select at least one book.');
  if (ids.length > BATCH_LIMIT) throw new BatchRequestError(`At most ${BATCH_LIMIT} books can be assigned in one batch.`);
  let department: string | null = null;
  if (req.mode === 'chosen') {
    department = canonicalDepartmentName(req.department);
    if (!department) throw new BatchRequestError('Choose a department from the list.');
  } else if (req.mode === 'suggested') {
    if (req.classifier !== 'v1' && req.classifier !== 'v2') throw new BatchRequestError('Choose the classifier whose suggestions to use (v1 or v2).');
  } else throw new BatchRequestError('Unknown batch action.');

  const out: BatchResult = { ...newTally(), outcomes: [] };
  for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
    for (const id of ids.slice(i, i + BATCH_CHUNK)) {
      try {
        const o: any = req.mode === 'suggested'
          ? await assignSuggested(id, { classifier: req.classifier!, tiers: BATCH_TIERS }, 'batch-suggested', req.by)
          : await assignDepartmentStayDraft({ bookId: id, department: department!, basis: 'person', source: 'batch-chosen', by: req.by });
        tally(out, o); out.outcomes.push({ id, result: o.result, ...(o.reason ? { reason: SKIP_LABEL[o.reason as AnySkip] ?? o.reason } : {}) });
      } catch (e: any) {
        tally(out, { result: 'failed' }); out.outcomes.push({ id, result: 'failed' });
      }
    }
    await new Promise(r => setImmediate(r));   // give the event loop back between chunks
  }
  // Books that were assigned, or that turned out to have left the queue, no longer belong in the list the person is working through.
  forgetRows(out.outcomes.filter(o => o.result === 'assigned' || ['Department already assigned', 'Rejected', 'No longer a Draft', 'Record missing'].includes(o.reason ?? '')).map(o => o.id));
  await audit(req.by, 'REVIEW_BATCH_ASSIGN', {
    mode: req.mode, classifier: req.mode === 'suggested' ? req.classifier : null, department, tiers: req.mode === 'suggested' ? BATCH_TIERS : null,
    requested: out.requested, assigned: out.assigned, skipped: out.skipped, failed: out.failed, skippedReasons: out.skippedReasons, publishes: false,
  });
  return out;
}
