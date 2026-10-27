import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { assignmentRecord } from './reviewAssignment.js';
import { judge, tierOf, famNames, CURRENT_THRESHOLDS, type Thresholds, type Tier } from './reviewClassification.js';
import { autoAssignEnabled, approvedThresholds, BATCH_LIMIT } from './reviewBatch.js';
import { bookPublicationEligibility, currentBookMinYear, PUBLISH_COLUMNS, PUBLISH_REASON_LABEL, type PublishReason, type PublishBook } from './publicationEligibility.js';
import { CLASSIFIER_RULES_VERSION, ANALYSIS_CLASSIFIER_V2, type ClassifierVariant } from './books/classifier.js';

/**
 * Review Automation — "Publish Eligible": make eligible Books public, in a controlled way.
 *
 * Confidence in a DEPARTMENT is not evidence of a RIGHT to publish. A book is published only when, at the moment of writing, it passes both:
 *   1. the classification check — judged again now, the department and the tier still what was approved; and
 *   2. publication eligibility (publicationEligibility.ts) — the application's own year, licence, rights, access, scope and duplicate rules.
 * Anything else is skipped, with a reason. Nothing is forced, and nothing here changes a licence, an access or a rights field, attaches a file, or
 * overwrites a department.
 *
 * The write is the same transition Approve makes (status → Published) in one conditional statement that also pins the licence, rights and access
 * the eligibility was judged on, so a book changed by someone else in the meantime is left alone. If it has no department, the revalidated
 * suggestion is written in the same statement (with the usual reviewAssignment note); an existing department is never replaced.
 *
 * Off unless REVIEW_AUTO_PUBLISH_ENABLED=true — a gate of its own: department assignment being enabled does not enable publication, and publication
 * (which may assign a department) also needs the assignment gate on.
 */

export const PUBLISH_GATE_ENV = 'REVIEW_AUTO_PUBLISH_ENABLED';
export const PUBLISH_GATE_OFF = 'Publication through Review Automation is disabled by configuration.';
export const PUBLISH_NEEDS_ASSIGN = 'Publication also needs department assignment to be enabled (REVIEW_AUTO_ASSIGN_ENABLED).';
export const publishGate = () => ({
  enabled: process.env[PUBLISH_GATE_ENV] === 'true' && autoAssignEnabled(),
  message: process.env[PUBLISH_GATE_ENV] !== 'true' ? PUBLISH_GATE_OFF : !autoAssignEnabled() ? PUBLISH_NEEDS_ASSIGN : null,
});
export class PublishDisabledError extends Error { constructor(message = PUBLISH_GATE_OFF) { super(message); this.name = 'PublishDisabledError'; } }
export const assertPublishEnabled = () => { const g = publishGate(); if (!g.enabled) throw new PublishDisabledError(g.message || PUBLISH_GATE_OFF); };

export type PublishRule = { classifier: ClassifierVariant; tiers: Tier[]; thresholds: Thresholds };
export type PublishOutcome = { bookId: string; result: 'published' | 'would_publish' | 'skipped'; reason?: PublishReason; detail?: string; department?: string; assignedDepartment?: boolean; tier?: Tier; score?: number };
const skip = (bookId: string, reason: PublishReason, detail?: string): PublishOutcome => ({ bookId, result: 'skipped', reason, detail });

export type Evaluation = { ok: boolean; reason?: PublishReason; detail?: string; department?: string; assign?: boolean; tier?: Tier; score?: number; margin?: number; second?: { department: string | null; score: number }; evidence?: string[]; checks?: string[] };

/** The whole decision for a book already in hand: standing, classification, then publication eligibility. Writes nothing. */
export async function evaluateForPublication(b: any, rule: PublishRule, expectedDepartment: string | null, minYear: number, opts: { checkDuplicates?: boolean } = {}): Promise<Evaluation> {
  if (b.status === 'Published') return { ok: false, reason: 'already_published' };
  if (b.status === 'Rejected' || b.rejectionNote) return { ok: false, reason: 'rejected' };
  if (b.status !== 'Draft') return { ok: false, reason: 'no_longer_draft', detail: b.status };
  if (b.ownershipSource !== 'Ingested') return { ok: false, reason: 'protected', detail: b.ownershipSource };
  const row = judge(b, rule.classifier);
  const tier = tierOf(row.score, row.margin, row.fam, rule.thresholds);
  if (!row.dept) return { ok: false, reason: 'no_suggestion' };
  if (!rule.tiers.includes(tier)) return { ok: false, reason: 'confidence_dropped', detail: `now ${tier} (${row.score}, margin ${row.margin})` };
  if (expectedDepartment && row.dept !== expectedDepartment) return { ok: false, reason: 'classifier_changed', detail: `now suggests ${row.dept}` };
  if (b.domain && b.domain !== row.dept) return { ok: false, reason: 'department_conflict', detail: `has ${b.domain}; the classifier suggests ${row.dept}` };
  const el = await bookPublicationEligibility(b as PublishBook, row.dept, minYear, opts);
  if (!el.ok) return { ok: false, reason: el.reason, detail: el.detail };
  return { ok: true, department: row.dept, assign: !b.domain, tier, score: row.score, margin: row.margin, second: { department: row.next, score: row.nextScore }, evidence: [...famNames(row.fam), ...(row.ddcUsed ? ['ddc'] : [])], checks: el.checks };
}

export async function readForPublish(id: string): Promise<any | null> {
  const rows: any[] = await db.$queryRawUnsafe(`select ${PUBLISH_COLUMNS} from "Book" where id = $1`, id).catch(() => []);
  return rows[0] ?? null;
}

/**
 * Publish one book if — now — it still qualifies. `dryRun` answers the same question and writes nothing (that is what every preview calls).
 * `action` is recorded on the book ('publish-high', 'publish-medium', 'publish-selected').
 */
export async function publishOne(req: { bookId: string; rule: PublishRule; expectedDepartment?: string | null; action: string; by: { uid?: string; email?: string } | null }, opts: { dryRun?: boolean; minYear?: number } = {}): Promise<PublishOutcome> {
  const { bookId, rule } = req;
  const b = await readForPublish(bookId);
  if (!b) return skip(bookId, 'record_missing');
  const ev = await evaluateForPublication(b, rule, req.expectedDepartment ?? null, opts.minYear ?? await currentBookMinYear());
  if (!ev.ok) return skip(bookId, ev.reason, ev.detail);
  if (opts.dryRun) return { bookId, result: 'would_publish', department: ev.department, assignedDepartment: ev.assign, tier: ev.tier, score: ev.score };

  const by = req.by?.email || req.by?.uid || null, at = new Date().toISOString();
  const classifierVersion = rule.classifier === 'v2' ? ANALYSIS_CLASSIFIER_V2 : CLASSIFIER_RULES_VERSION;
  // Bounded evidence, under a key of its own: no other workflow's metadata is overwritten.
  const publication = { source: 'review-automation', action: req.action, classifier: rule.classifier, classifierVersion, tier: ev.tier, topScore: ev.score, margin: ev.margin, department: ev.department,
    departmentAssigned: ev.assign, eligibility: { result: 'eligible', checks: ev.checks }, performedBy: by, performedAt: at };
  const note = ev.assign ? assignmentRecord({ department: ev.department, basis: 'classifier', source: req.action, tier: ev.tier, score: ev.score, margin: ev.margin, second: ev.second, evidence: ev.evidence, classifier: rule.classifier, by: req.by }) : null;
  // One conditional statement. It pins the licence, rights and access the eligibility was judged on, and the department (unset, or exactly the one it matched),
  // so any change made by someone else since the read means no row matches and the other change wins.
  const done: any[] = await db.$queryRawUnsafe(
    `update "Book" set status = 'Published', domain = $2, "updatedAt" = now(),
            metadata = jsonb_set(${note ? `jsonb_set(coalesce(metadata, '{}'::jsonb), '{reviewAssignment}', $10::jsonb, true)` : `coalesce(metadata, '{}'::jsonb)`}, '{reviewPublication}', $3::jsonb, true)
      where id = $1 and status = 'Draft' and "ownershipSource" = 'Ingested' and "rejectionNote" is null
        and ${ev.assign ? `(domain is null or domain = '')` : `domain = $2`}
        and licence is not distinct from $4::text and "licenceIsNC" is not distinct from $5::boolean and "rightsStatus" is not distinct from $6::text
        and "accessStatus" is not distinct from $7::text and "pdfUrl" is null and "rightsBasis" is not distinct from $8::text and year is not distinct from $9::int
      returning id`,
    bookId, ev.department, JSON.stringify(publication), b.licence, b.licenceIsNC, b.rightsStatus, b.accessStatus, b.rightsBasis, b.year, ...(note ? [JSON.stringify(note)] : []));
  if (done.length) return { bookId, result: 'published', department: ev.department, assignedDepartment: ev.assign, tier: ev.tier, score: ev.score };

  // Nothing matched: somebody changed the book. Say which kind of change, from what is there now.
  const now = await readForPublish(bookId);
  if (!now) return skip(bookId, 'record_missing');
  if (now.status === 'Published') return skip(bookId, 'already_published');
  if (now.status === 'Rejected' || now.rejectionNote) return skip(bookId, 'rejected');
  if (now.status !== 'Draft') return skip(bookId, 'no_longer_draft', now.status);
  if (now.domain && now.domain !== ev.department) return skip(bookId, 'department_conflict', `has ${now.domain}`);
  return skip(bookId, 'concurrent_change');
}

// ── Tally ───────────────────────────────────────────────────────────────────

export type PublishTally = { requested: number; published: number; departmentsAssigned: number; skipped: number; failed: number; skippedReasons: Record<string, number> };
export const newPublishTally = (): PublishTally => ({ requested: 0, published: 0, departmentsAssigned: 0, skipped: 0, failed: 0, skippedReasons: {} });
export function tallyPublish(t: PublishTally, o: PublishOutcome | { result: 'failed' }) {
  t.requested++;
  if (o.result === 'published' || o.result === 'would_publish') { t.published++; if ((o as any).assignedDepartment) t.departmentsAssigned++; }
  else if (o.result === 'failed') t.failed++;
  else { t.skipped++; const l = PUBLISH_REASON_LABEL[(o as any).reason as PublishReason] ?? String((o as any).reason); t.skippedReasons[l] = (t.skippedReasons[l] || 0) + 1; }
}

// ── Selected books (Batch Review) ───────────────────────────────────────────

export class PublishRequestError extends Error { constructor(message: string) { super(message); this.name = 'PublishRequestError'; } }
export type SelectedResult = PublishTally & { dryRun: boolean; outcomes: { id: string; result: string; reason?: PublishReason; label?: string }[] };

/** Selected books may be High or Medium; Low and Unclassifiable never. The approved thresholds apply when there are any, the provisional ones otherwise. */
export const SELECTED_TIERS: Tier[] = ['high', 'medium'];

async function runSelected(ids: unknown, classifier: unknown, by: { uid?: string; email?: string } | null, dryRun: boolean): Promise<SelectedResult> {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string' && x.length > 0 && x.length <= 64))];
  if (!list.length) throw new PublishRequestError('Select at least one book.');
  if (list.length > BATCH_LIMIT) throw new PublishRequestError(`At most ${BATCH_LIMIT} books can be published in one batch.`);
  if (classifier !== 'v1' && classifier !== 'v2') throw new PublishRequestError('Choose the classifier (v1 or v2).');
  const rule: PublishRule = { classifier, tiers: SELECTED_TIERS, thresholds: approvedThresholds().thresholds ?? CURRENT_THRESHOLDS };
  const minYear = await currentBookMinYear();
  const out: SelectedResult = { ...newPublishTally(), dryRun, outcomes: [] };
  for (let i = 0; i < list.length; i += 50) {
    for (const id of list.slice(i, i + 50)) {
      try {
        const o = await publishOne({ bookId: id, rule, action: 'publish-selected', by }, { dryRun, minYear });
        tallyPublish(out, o);
        out.outcomes.push(o.result === 'skipped' ? { id, result: 'skipped', reason: o.reason, label: PUBLISH_REASON_LABEL[o.reason] } : { id, result: o.result });
      } catch { tallyPublish(out, { result: 'failed' }); out.outcomes.push({ id, result: 'failed' }); }
    }
    await new Promise(r => setImmediate(r));
  }
  return out;
}

/** What publishing these books would do right now. Reads only; needs no gate; writes nothing, not even an audit row. */
export const previewSelected = (ids: unknown, classifier: unknown) => runSelected(ids, classifier, null, true);

/** Publish the selected books that are eligible now. Gated. */
export async function publishSelected(req: { ids: unknown; classifier: unknown; by: { uid?: string; email?: string } | null }): Promise<SelectedResult> {
  assertPublishEnabled();
  const out = await runSelected(req.ids, req.classifier, req.by, false);
  await audit(req.by, 'REVIEW_PUBLISH_SELECTED', {
    classifier: req.classifier, tiers: SELECTED_TIERS, requested: out.requested, published: out.published, departmentsAssigned: out.departmentsAssigned, skipped: out.skipped, failed: out.failed, skippedReasons: out.skippedReasons, publishes: true,
  });
  return out;
}
