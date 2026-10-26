import { ingestionDb as db } from './db.js';
import { canonicalDepartmentName } from '../departmentRegistry.js';
import { CLASSIFIER_RULES_VERSION, ANALYSIS_CLASSIFIER_V2, type ClassifierVariant } from './books/classifier.js';
import { judge, readOneForJudging, tierOf, CURRENT_THRESHOLDS, type Thresholds, type Tier } from './reviewClassification.js';

/**
 * "Assign Department, Stay Draft" — the contract R2's batch actions will be built on. NOT wired to any route, screen or job: nothing calls it
 * outside its tests, and no historical record is touched until R2 is approved.
 *
 * It is deliberately NOT "Approve". Approve publishes the book (status → Published, and with it the book's access); this does one thing:
 * it writes the department. A book that is assigned this way is exactly the book it was before, plus a department and a note of who assigned it
 * and on what evidence:
 *
 *   changes      domain; metadata.reviewAssignment (department, score, margin, tier, classifier, rules version, source, who, when)
 *   preserves    status (stays Draft), licence, licenceIsNC, accessType, accessStatus, rightsStatus and its basis, rejectionNote, source, year,
 *                fingerprint, every other metadata key, and every ingestion checkpoint (it never reads or writes one)
 *
 * It trusts nothing it was handed. Whoever calls it passes a book id and the department they want; the book is read again NOW, checked for
 * eligibility, and — when the assignment rests on the classifier — judged again NOW, and only assigned if today's judgement still satisfies the
 * approved rule and still names the same department. An analysis result from an hour ago is a reason to look at a book, never a reason to write to it.
 * The write itself is one conditional statement, so a book that was published, rejected or placed by someone else in the meantime is left alone.
 */

export type AssignmentRule = {
  /** Which classifier's judgement the rule is about. */
  classifier: ClassifierVariant;
  /** The tiers the approved rule accepts, e.g. ['high']. */
  tiers: Tier[];
  thresholds?: Thresholds;
};

export type AssignmentRequest = {
  bookId: string;
  department: string;
  /** 'classifier': the assignment is the classifier's suggestion and must still pass the rule. 'person': an admin chose this department themselves. */
  basis: 'classifier' | 'person';
  rule?: AssignmentRule;
  /** What kind of action asked, for the record: 'high-confidence', 'batch-suggested', 'batch-chosen', 'single'. */
  source: string;
  by: { uid?: string; email?: string } | null;
};

export type SkipReason =
  | 'not-found' | 'not-a-draft' | 'not-ingested' | 'already-has-department' | 'rejected'
  | 'unknown-department' | 'rule-required' | 'classification-changed' | 'below-rule' | 'changed-during-assignment';

export type AssignmentOutcome =
  | { bookId: string; result: 'assigned'; department: string; tier: Tier | null; score: number | null }
  | { bookId: string; result: 'skipped'; reason: SkipReason; detail?: string };

const skip = (bookId: string, reason: SkipReason, detail?: string): AssignmentOutcome => ({ bookId, result: 'skipped', reason, detail });

export async function assignDepartmentStayDraft(req: AssignmentRequest, opts: { dryRun?: boolean } = {}): Promise<AssignmentOutcome> {
  const { bookId } = req;
  const department = canonicalDepartmentName(req.department);
  if (!department) return skip(bookId, 'unknown-department', req.department);

  // 1. Read the book as it is now.
  const b = await readOneForJudging(bookId);
  if (!b) return skip(bookId, 'not-found');

  // 2. Is it still a book this action may touch?
  if (b.status === 'Rejected' || b.rejectionNote) return skip(bookId, 'rejected');
  if (b.status !== 'Draft') return skip(bookId, 'not-a-draft', b.status);
  if (b.ownershipSource !== 'Ingested') return skip(bookId, 'not-ingested', b.ownershipSource);
  if (b.domain) return skip(bookId, 'already-has-department', b.domain);

  // 3. If the classifier is the reason, does it still say so? Judged again now, under the rule that was approved.
  let tier: Tier | null = null, score: number | null = null, margin: number | null = null;
  const rule = req.rule;
  if (req.basis === 'classifier') {
    if (!rule) return skip(bookId, 'rule-required');
    const row = judge(b, rule.classifier);
    tier = tierOf(row.score, row.margin, row.fam, rule.thresholds ?? CURRENT_THRESHOLDS); score = row.score; margin = row.margin;
    if (!rule.tiers.includes(tier)) return skip(bookId, 'below-rule', `now ${tier} (${row.score}, margin ${row.margin})`);
    if (row.dept !== department) return skip(bookId, 'classification-changed', `now suggests ${row.dept ?? 'nothing'}`);
  }
  if (opts.dryRun) return { bookId, result: 'assigned', department, tier, score };

  // 4. One conditional write: the department and the note, nothing else. If anything about the book changed since step 1, no row matches.
  const record = {
    department, basis: req.basis, source: req.source, tier, score, margin,
    classifier: rule ? { variant: rule.classifier, version: rule.classifier === 'v2' ? ANALYSIS_CLASSIFIER_V2 : CLASSIFIER_RULES_VERSION } : null,
    by: req.by?.email || req.by?.uid || null, at: new Date().toISOString(),
  };
  const done: any[] = await db.$queryRawUnsafe(
    `update "Book" set domain = $2, "updatedAt" = now(), metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{reviewAssignment}', $3::jsonb, true)
      where id = $1 and status = 'Draft' and "ownershipSource" = 'Ingested' and (domain is null or domain = '') and "rejectionNote" is null
      returning id`, bookId, department, JSON.stringify(record));
  if (!done.length) return skip(bookId, 'changed-during-assignment');
  return { bookId, result: 'assigned', department, tier, score };
}
