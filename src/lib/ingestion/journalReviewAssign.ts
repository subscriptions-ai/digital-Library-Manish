import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { canonicalDepartmentName, CANONICAL_NAMES } from '../departmentRegistry.js';
import { classifyJournal, JOURNAL_CLASSIFIER_VERSION, CURRENT_JOURNAL_THRESHOLDS, type JournalThresholds, type JournalTier } from './journalClassification.js';
import { JOURNAL_QUEUE, JOURNAL_COLUMNS, forgetJournalRows } from './journalReviewAnalysis.js';

/**
 * "Assign Department, Stay Current Status" — the single-record contract every journal assignment in Review Automation goes through, and the batch action
 * a person drives from Batch Review (Journals). Gated by REVIEW_JOURNAL_ASSIGN_ENABLED (off unless exactly "true"), a gate of its own: it is not the Book
 * assignment gate and not the future-ingestion routing gate.
 *
 * It does one thing: it writes the department. A journal assigned this way is exactly the journal it was, plus a department.
 *
 *   changes      domain (and updatedAt, which the database sets)
 *   preserves    status (NeedsReview, MetadataOnly, Accepted — whatever it was), licence, licenceIsNC, rightsBasis and every other rights field, ISSN and eISSN,
 *                title, publisher, subjects, cover, coverage and every scheduling and checkpoint field
 *   never        publishes or approves anything, rejects anything, overwrites a department, touches a Rejected journal, a partner publisher's journal, or one an
 *                administrator verified by hand
 *
 * It trusts nothing it was handed: the journal is read again NOW, checked, and — when the assignment rests on the classifier — judged again NOW and only
 * assigned if the journal still meets the rule and still names the same department. The write is one conditional UPDATE that repeats every one of those
 * conditions and pins the status, title and ISSN the decision was made on, so anything that changed in between leaves no row to update and the other change wins.
 *
 * Evidence is kept without a schema change: a Journal has no metadata column, so each assignment writes one small audit row (REVIEW_JOURNAL_ASSIGNED:
 * journal id and ISSN, department, tier, score, margin, classifier version, who, when), and each batch one summary row (REVIEW_JOURNAL_BATCH_ASSIGN).
 */

export const JOURNAL_GATE_ENV = 'REVIEW_JOURNAL_ASSIGN_ENABLED';
export const JOURNAL_THRESHOLDS_ENV = 'REVIEW_JOURNAL_ASSIGN_THRESHOLDS';
export const JOURNAL_BATCH_LIMIT = 250;
const BATCH_CHUNK = 50;
const GATE_OFF_MESSAGE = 'Journal department assignment is disabled by configuration.';

export const journalAssignEnabled = () => process.env[JOURNAL_GATE_ENV] === 'true';
export class JournalAssignDisabledError extends Error { constructor() { super(GATE_OFF_MESSAGE); this.name = 'JournalAssignDisabledError'; } }
export class JournalBatchError extends Error { constructor(message: string) { super(message); this.name = 'JournalBatchError'; } }

/**
 * The rule an operator has approved, from REVIEW_JOURNAL_ASSIGN_THRESHOLDS (JSON), e.g. {"highMinScore":8,"highMinMargin":4,"highRequiresBoth":true}. All three keys
 * are needed; nothing is assumed when they are missing. With none approved the analysis and the batch still work, under the provisional thresholds, and say so.
 */
export function approvedJournalThresholds(): { thresholds: JournalThresholds | null; problem: string | null } {
  const raw = process.env[JOURNAL_THRESHOLDS_ENV];
  if (!raw?.trim()) return { thresholds: null, problem: `No journal thresholds have been approved (${JOURNAL_THRESHOLDS_ENV} is not set).` };
  let o: any; try { o = JSON.parse(raw); } catch { return { thresholds: null, problem: `${JOURNAL_THRESHOLDS_ENV} is not valid JSON.` }; }
  const int = (v: any, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  if (!int(o?.highMinScore, 1, 40) || !int(o?.highMinMargin, 0, 40) || typeof o?.highRequiresBoth !== 'boolean')
    return { thresholds: null, problem: `${JOURNAL_THRESHOLDS_ENV} must give highMinScore, highMinMargin (whole numbers) and highRequiresBoth (true or false).` };
  return { thresholds: { ...CURRENT_JOURNAL_THRESHOLDS, highMinScore: o.highMinScore, highMinMargin: o.highMinMargin, highRequiresBoth: o.highRequiresBoth }, problem: null };
}
/** The thresholds in force: the approved ones, or the provisional ones when none are approved. */
export const journalThresholds = (): { thresholds: JournalThresholds; approved: boolean } => { const a = approvedJournalThresholds(); return { thresholds: a.thresholds ?? CURRENT_JOURNAL_THRESHOLDS, approved: !!a.thresholds }; };

export const journalAssignConfig = () => {
  const a = approvedJournalThresholds();
  return { enabled: journalAssignEnabled(), message: journalAssignEnabled() ? null : GATE_OFF_MESSAGE, approved: !!a.thresholds, thresholds: journalThresholds().thresholds, thresholdsProblem: a.problem, batchLimit: JOURNAL_BATCH_LIMIT, departments: [...CANONICAL_NAMES] };
};

// ── One journal ─────────────────────────────────────────────────────────────

export type JournalSkip = 'not-found' | 'rejected' | 'already-has-department' | 'protected' | 'unknown-department' | 'rule-required' | 'classification-changed' | 'below-rule' | 'no-suggestion' | 'changed-during-assignment';
export const JOURNAL_SKIP_LABEL: Record<JournalSkip, string> = {
  'not-found': 'Record missing', 'rejected': 'Rejected', 'already-has-department': 'Department already assigned', 'protected': 'Publisher-linked or manually verified',
  'unknown-department': 'Unknown department', 'rule-required': 'No rule given', 'classification-changed': 'Classifier changed', 'below-rule': 'Confidence dropped',
  'no-suggestion': 'No department suggested', 'changed-during-assignment': 'Changed while being assigned',
};

export type JournalAssignRequest = {
  journalId: string; department: string;
  /** 'classifier': the department is the classifier's suggestion and must still meet the rule. 'person': an administrator chose it. */
  basis: 'classifier' | 'person';
  rule?: { tiers: JournalTier[]; thresholds: JournalThresholds };
  /** What kind of action asked, for the record: 'batch-suggested', 'batch-chosen'. */
  source: string;
  by: { uid?: string; email?: string } | null;
};
export type JournalOutcome =
  | { journalId: string; result: 'assigned'; department: string; tier: JournalTier | null; score: number | null }
  | { journalId: string; result: 'skipped'; reason: JournalSkip; detail?: string };
const skip = (journalId: string, reason: JournalSkip, detail?: string): JournalOutcome => ({ journalId, result: 'skipped', reason, detail });

export async function readJournalForAssignment(id: string): Promise<any | null> {
  const rows: any[] = await db.$queryRawUnsafe(`select ${JOURNAL_COLUMNS}, domain, "publisherId", "rightsVerifiedBy" from "Journal" where id = $1`, id).catch(() => []);
  return rows[0] ?? null;
}

export async function assignJournalStayCurrent(req: JournalAssignRequest, opts: { dryRun?: boolean } = {}): Promise<JournalOutcome> {
  const { journalId } = req;
  const department = canonicalDepartmentName(req.department);
  if (!department) return skip(journalId, 'unknown-department', req.department);

  // 1. The journal as it is now, and whether anyone has already decided about it.
  const j = await readJournalForAssignment(journalId);
  if (!j) return skip(journalId, 'not-found');
  if (j.status === 'Rejected') return skip(journalId, 'rejected');
  if (j.domain) return skip(journalId, 'already-has-department', j.domain);
  if (j.publisherId || (j.rightsVerifiedBy && j.rightsVerifiedBy !== 'ingestion')) return skip(journalId, 'protected');

  // 2. If the classifier is the reason, does it still say so? Judged again now, under the rule that was given.
  let tier: JournalTier | null = null, score: number | null = null, margin: number | null = null, second: string | null = null, families: string[] | null = null;
  if (req.basis === 'classifier') {
    if (!req.rule) return skip(journalId, 'rule-required');
    const r = classifyJournal(j, req.rule.thresholds);
    tier = r.tier; score = r.score; margin = r.margin; second = r.next; families = r.families;
    if (!r.dept) return skip(journalId, 'no-suggestion');
    if (!req.rule.tiers.includes(r.tier)) return skip(journalId, 'below-rule', `now ${r.tier} (${r.score}, margin ${r.margin})`);
    if (r.dept !== department) return skip(journalId, 'classification-changed', `now suggests ${r.dept}`);
  }
  if (opts.dryRun) return { journalId, result: 'assigned', department, tier, score };

  // 3. One conditional write: the department, nothing else. Every condition above is repeated, and the status, title and ISSN the decision rested on are pinned,
  //    so if anything about the journal changed since step 1 no row matches and the other change stands.
  const done: any[] = await db.$queryRawUnsafe(
    `update "Journal" set domain = $2, "updatedAt" = now()
      where id = $1 and ${JOURNAL_QUEUE} and status = $3::text and title = $4::text and issn is not distinct from $5::text
      returning id`, journalId, department, j.status, j.title, j.issn ?? null);
  if (!done.length) return skip(journalId, 'changed-during-assignment');

  await audit(req.by, 'REVIEW_JOURNAL_ASSIGNED', {
    journalId, issn: j.issn ?? null, department, basis: req.basis, source: req.source, status: j.status,
    tier, score, margin, secondDepartment: second, evidence: families, classifier: req.basis === 'classifier' ? 'journal-rules' : null, classifierVersion: req.basis === 'classifier' ? JOURNAL_CLASSIFIER_VERSION : null,
    publishes: false,
  });
  return { journalId, result: 'assigned', department, tier, score };
}

// ── Batch Review: a bounded list of ids a person selected ───────────────────

export type JournalTally = { requested: number; assigned: number; skipped: number; failed: number; skippedReasons: Record<string, number> };
export const newJournalTally = (): JournalTally => ({ requested: 0, assigned: 0, skipped: 0, failed: 0, skippedReasons: {} });
export function tallyJournal(t: JournalTally, o: JournalOutcome | { result: 'failed' }) {
  t.requested++;
  if (o.result === 'assigned') t.assigned++;
  else if (o.result === 'failed') t.failed++;
  else { t.skipped++; const l = JOURNAL_SKIP_LABEL[(o as any).reason as JournalSkip] ?? String((o as any).reason); t.skippedReasons[l] = (t.skippedReasons[l] || 0) + 1; }
}

export type JournalBatchRequest = { ids: unknown; mode: unknown; department?: unknown; by: { uid?: string; email?: string } | null };
export type JournalBatchResult = JournalTally & { dryRun: boolean; thresholdsApproved: boolean; outcomes: { id: string; result: string; reason?: string; department?: string }[] };
/** A journal may be assigned on its own suggestion if it is High or Medium under the thresholds in force. Low and Unclassifiable are for a person to choose. */
export const JOURNAL_BATCH_TIERS: JournalTier[] = ['high', 'medium'];

function cleanIds(ids: unknown): string[] {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))];
  if (!list.length) throw new JournalBatchError('Select at least one journal.');
  if (list.length > JOURNAL_BATCH_LIMIT) throw new JournalBatchError(`At most ${JOURNAL_BATCH_LIMIT} journals can be assigned in one batch.`);
  return list;
}

/**
 * `dryRun` is the server's own preview of a selection: the same checks and judgements, nothing written and nothing audited, and available with the gate off
 * (the gate controls writing, not looking).
 */
export async function batchAssignJournals(req: JournalBatchRequest, opts: { dryRun?: boolean } = {}): Promise<JournalBatchResult> {
  const dryRun = !!opts.dryRun;
  if (!dryRun && !journalAssignEnabled()) throw new JournalAssignDisabledError();
  const ids = cleanIds(req.ids);
  let department: string | null = null;
  if (req.mode === 'chosen') { department = canonicalDepartmentName(req.department); if (!department) throw new JournalBatchError('Choose a department from the list.'); }
  else if (req.mode !== 'suggested') throw new JournalBatchError('Unknown batch action.');
  const { thresholds, approved } = journalThresholds();

  const out: JournalBatchResult = { ...newJournalTally(), dryRun, thresholdsApproved: approved, outcomes: [] };
  for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
    for (const id of ids.slice(i, i + BATCH_CHUNK)) {
      try {
        let o: JournalOutcome;
        if (req.mode === 'suggested') {
          const j = await readJournalForAssignment(id);
          const r = j ? classifyJournal(j, thresholds) : null;
          o = !j ? skip(id, 'not-found') : !r!.dept ? skip(id, 'no-suggestion')
            : await assignJournalStayCurrent({ journalId: id, department: r!.dept, basis: 'classifier', rule: { tiers: JOURNAL_BATCH_TIERS, thresholds }, source: 'batch-suggested', by: req.by }, { dryRun });
        } else o = await assignJournalStayCurrent({ journalId: id, department: department!, basis: 'person', source: 'batch-chosen', by: req.by }, { dryRun });
        tallyJournal(out, o);
        out.outcomes.push({ id, result: dryRun && o.result === 'assigned' ? 'would_assign' : o.result, ...(o.result === 'skipped' ? { reason: JOURNAL_SKIP_LABEL[o.reason] } : { department: (o as any).department }) });
      } catch { tallyJournal(out, { result: 'failed' }); out.outcomes.push({ id, result: 'failed' }); }
    }
    await new Promise(r => setImmediate(r));   // give the event loop back between chunks
  }
  if (!dryRun) {
    // Assigned journals, and any that left the queue meanwhile, no longer belong in the list the person is working through.
    forgetJournalRows(out.outcomes.filter(o => o.result === 'assigned' || ['Department already assigned', 'Rejected', 'Record missing', 'Publisher-linked or manually verified'].includes(o.reason ?? '')).map(o => o.id));
    await audit(req.by, 'REVIEW_JOURNAL_BATCH_ASSIGN', {
      mode: req.mode, department, tiers: req.mode === 'suggested' ? JOURNAL_BATCH_TIERS : null, classifierVersion: JOURNAL_CLASSIFIER_VERSION, thresholdsApproved: approved,
      thresholds: { highMinScore: thresholds.highMinScore, highMinMargin: thresholds.highMinMargin, highRequiresBoth: thresholds.highRequiresBoth },
      requested: out.requested, assigned: out.assigned, skipped: out.skipped, failed: out.failed, skippedReasons: out.skippedReasons, publishes: false,
    });
  }
  return out;
}
