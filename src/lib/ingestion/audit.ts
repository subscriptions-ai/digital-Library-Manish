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
  | 'STALE_CLAIM_RECOVERED' | 'SOURCE_PAUSED' | 'NCBI_ARCHIVE_DOWNLOADED';

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
