import { ingestionDb as db } from './db.js';

/**
 * PUBLICATION EVENTS — the moment a record became public, written once when a person approves it.
 *
 * The catalogue keeps no "published at" column, and a manual Approve changes `status` (and `updatedAt`, which any later edit also moves) without leaving a trace.
 * The Daily Ingestion Summary needs the real transition, so an Approve now writes one small row to the existing ingestion audit log:
 *
 *     action  CONTENT_PUBLISHED
 *     meta    { type: 'article' | 'book', id, method: 'manual', via: 'approve' | 'bulk-approve', department }
 *
 * It is written ONLY when the record was not already public, so approving a published record again, or editing it afterwards, writes nothing and moves nothing.
 * It changes no rule and no field of the record, and a failure to write it never stops the approval (the same promise `audit()` makes).
 *
 * Review Automation needs no event of its own: `publishOne` already stamps `metadata.reviewPublication.performedAt` on the Book in the same statement that publishes it.
 * Ingestion that publishes at the moment it creates a record needs none either: its publication time IS `createdAt`.
 */

export const PUBLISHED_ACTION = 'CONTENT_PUBLISHED';
export type PublishedEvent = { type: 'article' | 'book'; id: string; department?: string | null; via: 'approve' | 'bulk-approve' };

/** One row per record that actually moved into public status. `at` exists for rebuilding history and for tests; real callers leave it out. */
export async function recordPublications(admin: { uid?: string; id?: string; email?: string } | null | undefined, events: PublishedEvent[], opts: { at?: Date } = {}): Promise<number> {
  if (!events.length) return 0;
  try {
    const r = await db.ingestionAudit.createMany({
      data: events.map(e => ({
        adminId: admin?.uid || admin?.id || null, adminEmail: admin?.email || null, action: PUBLISHED_ACTION,
        meta: { type: e.type, id: e.id, method: 'manual', via: e.via, department: e.department ?? null } as any,
        ...(opts.at ? { at: opts.at } : {}),
      })),
    });
    return r.count;
  } catch (e: any) {
    console.error('[publication-events] could not write', events.length, 'event(s):', e?.message);
    return 0;
  }
}
