import { ingestionDb as db } from './db.js';

/**
 * What an administrator did to the engine, and what the engine did to protect itself, written
 * once and never changed. A row says who, when, what and enough to understand it — and never a
 * credential, so any key that looks like one is dropped before the row is written.
 */

export type AuditAction =
  | 'ENGINE_PAUSED' | 'ENGINE_RESUMED' | 'MANUAL_PASS_REQUESTED'
  | 'INGESTION_SETTINGS_CHANGED' | 'INGESTION_SCOPE_CHANGED'
  | 'DRY_RUN_CREATED' | 'ONE_OFF_IMPORT_STARTED' | 'MASS_JOURNAL_IMPORT_STARTED'
  | 'STALE_CLAIM_RECOVERED' | 'SOURCE_PAUSED' | 'SOURCE_RATE_LIMITED' | 'NCBI_ARCHIVE_DOWNLOADED'
  | 'QUICK_IMPORT_STARTED' | 'QUICK_IMPORT_FINISHED' | 'QUICK_IMPORT_FAILED'
  | 'BOOK_PRIORITY_CHANGED' | 'TARGETED_BOOKS_STARTED' | 'TARGETED_BOOKS_FINISHED' | 'BULK_SYNC_STARTED' | 'BULK_SYNC_FINISHED' | 'BULK_SYNC_FAILED' | 'BULK_SYNC_PAUSE_REQUESTED' | 'OPENLIBRARY_DUMP_SOURCE_CHANGED' | 'GOOGLE_BOOKS_ENRICHMENT'
  /** The scheduler changed what it does with a provider: it started resting, a fallback took over, it returned. One row per change, never per tick. */
  | 'SCHEDULER_ROTATION'
  /** Historical backfill: a job was created, and a job was paused / resumed / cancelled / re-planned. Never a record, never a credential. */
  | 'BACKFILL_JOB_CREATED' | 'BACKFILL_JOB_CONTROL' | 'BACKFILL_JOB_FINISHED'
  /** DOAJ journal enrichment: one chunk wrote descriptive fields into journals already held (counts, the fields and at most 50 ISSNs; never a value, never a credential). */
  | 'DOAJ_ENRICHMENT_APPLIED' | 'DOAJ_CONFLICT_DECISION'
  /** Full-text candidate review: a person approved, held or rejected a candidate. A record only — nothing is downloaded and the Book is not changed. */
  | 'FULLTEXT_CANDIDATE_DECISION'
  /** Review automation: a classification analysis (or v1-vs-v2 comparison) of the "Needs a department" queue was run. Counts only; it does not modify catalogue or content records. */
  | 'REVIEW_CLASSIFICATION_ANALYSIS' | 'REVIEW_CLASSIFICATION_COMPARISON'
  /** Review automation R2: a department-assignment batch or job. Counts and short scope only; the books' own audit note lives in metadata.reviewAssignment. */
  | 'REVIEW_AUTO_ASSIGN_STARTED' | 'REVIEW_AUTO_ASSIGN_FINISHED' | 'REVIEW_BATCH_ASSIGN'
  /** Review automation: eligible Books were made public (a bulk job, or a selection). Counts and a short scope only. */
  | 'REVIEW_PUBLISH_STARTED' | 'REVIEW_PUBLISH_FINISHED' | 'REVIEW_PUBLISH_SELECTED'
  /** Review automation R3A: newly ingested Drafts were given a department by future-ingestion routing (one row per page of a harvest, counts only). Publishes nothing. */
  | 'REVIEW_INGEST_ROUTING'
  /** Review automation R3B (journals): an analysis, one department assignment (one small row per journal, since a Journal has no metadata column to hold the note), and a batch summary. None publishes or changes status. */
  | 'REVIEW_JOURNAL_ANALYSIS' | 'REVIEW_JOURNAL_ASSIGNED' | 'REVIEW_JOURNAL_BATCH_ASSIGN';

const SECRET = /pass(word)?|token|secret|authorization|api[_-]?key|credential|cookie/i;

function clean(v: any, depth = 0): any {
  if (v == null || depth > 4) return v ?? null;
  if (Array.isArray(v)) return v.slice(0, 50).map(x => clean(x, depth + 1));
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) { if (!SECRET.test(k)) o[k] = clean(x, depth + 1); }
    return o;
  }
  if (typeof v === 'string') return v.slice(0, 500);
  return v;
}

/** `admin` is the authenticated request's user ({ uid, email }), or null for something the engine did itself. */
export async function audit(admin: { uid?: string; id?: string; email?: string } | null | undefined, action: AuditAction, meta: Record<string, any> = {}) {
  try {
    await db.ingestionAudit.create({
      data: { adminId: admin?.uid || admin?.id || null, adminEmail: admin?.email || null, action, meta: clean(meta) },
    });
  } catch (e: any) {
    // An audit failure must never stop the action it describes, but it must not pass silently either.
    console.error('[ingestion-audit] could not write', action, e?.message);
  }
}
