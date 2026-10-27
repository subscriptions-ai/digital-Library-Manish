import { ingestionDb as db } from './db.js';

/**
 * Review History: what Review Automation did, read from the existing ingestion audit log (no new table). Each row is one action with its counts and
 * a short scope — never a list of books. The per-book note of an assignment lives on the book itself (metadata.reviewAssignment).
 */

const ACTIONS = ['REVIEW_AUTO_ASSIGN_FINISHED', 'REVIEW_BATCH_ASSIGN', 'REVIEW_PUBLISH_FINISHED', 'REVIEW_PUBLISH_SELECTED', 'REVIEW_CLASSIFICATION_ANALYSIS', 'REVIEW_CLASSIFICATION_COMPARISON', 'REVIEW_JOURNAL_ANALYSIS', 'REVIEW_JOURNAL_BATCH_ASSIGN'] as const;

const LABEL: Record<string, string> = {
  REVIEW_AUTO_ASSIGN_FINISHED: 'Auto-assign High Confidence', REVIEW_BATCH_ASSIGN: 'Batch assignment', REVIEW_PUBLISH_FINISHED: 'Publish Eligible', REVIEW_PUBLISH_SELECTED: 'Publish Selected Eligible',
  REVIEW_CLASSIFICATION_ANALYSIS: 'Classification analysis', REVIEW_CLASSIFICATION_COMPARISON: 'Classifier v1 vs v2 comparison',
  REVIEW_JOURNAL_ANALYSIS: 'Journal classification analysis', REVIEW_JOURNAL_BATCH_ASSIGN: 'Journal batch assignment',
};

export type HistoryRow = {
  id: string; at: string; admin: string | null; action: string; label: string; detail: string | null; classifier: string | null; scope: string;
  assigns: boolean; /** A publication action: it made books public. */ publishes: boolean; published: number | null; departmentsAssigned: number | null; eligibleAtPreview: number | null; /** The approved High-confidence rule a job ran under, in words. Null for other actions. */ thresholds: string | null; /** Books a cancelled job had not got to (estimate), or null. */ cancelledRemaining: number | null; requested: number | null; assigned: number | null; skipped: number | null; failed: number | null; cancelled: boolean; skippedReasons: Record<string, number>;
};

const scopeOf = (a: string, m: any): string => {
  if (a === 'REVIEW_AUTO_ASSIGN_FINISHED') {
    const s = m.scope || {}; const parts = [s.source ? `provider ${s.source}` : null, s.department ? `department ${s.department}` : null].filter(Boolean);
    return parts.length ? parts.join(', ') : 'All departments, all providers';
  }
  if (a === 'REVIEW_PUBLISH_FINISHED') {
    const s = m.scope || {}; const parts = [s.source ? `provider ${s.source}` : null, s.department ? `department ${s.department}` : null].filter(Boolean);
    return parts.length ? parts.join(', ') : 'All departments, all providers';
  }
  if (a === 'REVIEW_PUBLISH_SELECTED') return 'The books selected in Batch Review';
  if (a === 'REVIEW_JOURNAL_BATCH_ASSIGN') return m.mode === 'chosen' ? `Journals · chosen department: ${m.department ?? '—'}` : 'Journals · each journal’s own suggestion';
  if (a === 'REVIEW_BATCH_ASSIGN') return m.mode === 'chosen' ? `Chosen department: ${m.department ?? '—'}` : 'Each book’s own suggestion';
  return '';
};

export async function reviewHistory(page = 1, take = 25): Promise<{ total: number; page: number; take: number; rows: HistoryRow[] }> {
  take = Math.min(Math.max(1, take), 100); page = Math.max(1, page);
  const where = { action: { in: [...ACTIONS] } };
  const [total, rows] = await Promise.all([
    db.ingestionAudit.count({ where }),
    db.ingestionAudit.findMany({ where, orderBy: { at: 'desc' }, skip: (page - 1) * take, take }),
  ]);
  return {
    total, page, take,
    rows: rows.map((r: any): HistoryRow => {
      const m = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as any;
      const publishes = r.action === 'REVIEW_PUBLISH_FINISHED' || r.action === 'REVIEW_PUBLISH_SELECTED';
      const assigns = r.action === 'REVIEW_AUTO_ASSIGN_FINISHED' || r.action === 'REVIEW_BATCH_ASSIGN' || r.action === 'REVIEW_JOURNAL_BATCH_ASSIGN' || publishes;
      const num = (v: any) => (typeof v === 'number' ? v : null);
      return {
        id: r.id, at: new Date(r.at).toISOString(), admin: r.adminEmail || null, action: r.action,
        label: r.action === 'REVIEW_PUBLISH_FINISHED' ? `Publish Eligible ${m.tier === 'medium' ? 'Medium' : 'High'} Confidence` : LABEL[r.action] || r.action,
        detail: r.action === 'REVIEW_AUTO_ASSIGN_FINISHED' || r.action === 'REVIEW_PUBLISH_FINISHED' ? (m.status === 'cancelled' ? 'Cancelled before it finished' : m.status === 'failed' ? `Stopped: ${m.error ?? 'error'}` : null)
          : r.action === 'REVIEW_CLASSIFICATION_ANALYSIS' ? `${num(m.analysed) ?? '—'} books analysed` : r.action === 'REVIEW_CLASSIFICATION_COMPARISON' ? `${num(m.analysed) ?? '—'} books compared` : r.action === 'REVIEW_JOURNAL_ANALYSIS' ? `${num(m.analysed) ?? '—'} journals analysed` : null,
        classifier: m.classifier ?? (r.action === 'REVIEW_CLASSIFICATION_ANALYSIS' ? 'v1' : null), scope: scopeOf(r.action, m), assigns, publishes,
        published: publishes ? num(m.published) : null, departmentsAssigned: publishes ? num(m.departmentsAssigned) : null, eligibleAtPreview: publishes ? num(m.eligibleAtPreview) : null,
        requested: assigns ? num(m.requested) : null, assigned: assigns ? num(m.assigned) : null, skipped: assigns ? num(m.skipped) : null, failed: assigns ? num(m.failed) : null,
        thresholds: (r.action === 'REVIEW_AUTO_ASSIGN_FINISHED' || r.action === 'REVIEW_PUBLISH_FINISHED') && m.thresholds ? `High: score ≥ ${m.thresholds.highMinScore}, margin ≥ ${m.thresholds.highMinMargin}${m.thresholds.highRequiresCode ? ', controlled code + title/subject' : ''}` : null,
        cancelledRemaining: typeof m.cancelledRemaining === 'number' ? m.cancelledRemaining : null, cancelled: m.status === 'cancelled', skippedReasons: assigns && m.skippedReasons && typeof m.skippedReasons === 'object' ? m.skippedReasons : {},
      };
    }),
  };
}
