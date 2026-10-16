import { randomUUID } from 'node:crypto';
import { ingestionDb } from './db.js';
import { reconcile, tallyOfRow } from './accounting.js';

/**
 * The per-department breakdown of one run.
 *
 * A single book harvest adds books to many departments, so a department cannot be written on the run itself. Each book is
 * counted, at the moment its fate is known, under the department it ended up in — the department it was PUBLISHED into, or the
 * department of the book already held. A book waiting for a person to decide has no confirmed department and is counted under
 * '' (unassigned / needs review); a weak suggestion is never promoted to a department to make a number look better.
 *
 * Stored in IngestionRunDepartmentStat, one row per run × department × content type, in the same transaction as the run row.
 * Runs from before it existed have none and stay "department breakdown not recorded".
 */

export type DeptCounts = { added: number; held: number; sentToReview: number; skipped: number; failed: number };
export type DeptStats = Record<string, DeptCounts>;

export const UNASSIGNED = '';
export const emptyCounts = (): DeptCounts => ({ added: 0, held: 0, sentToReview: 0, skipped: 0, failed: 0 });

/** Count one outcome. `department` null/undefined/'' all mean unassigned. */
export function bump(stats: DeptStats, department: string | null | undefined, key: keyof DeptCounts, n = 1) {
  const d = department || UNASSIGNED;
  (stats[d] ||= emptyCounts())[key] += n;
}

export function totals(stats: DeptStats): DeptCounts {
  const t = emptyCounts();
  for (const c of Object.values(stats)) for (const k of Object.keys(t) as (keyof DeptCounts)[]) t[k] += c[k];
  return t;
}

/**
 * The run row's columns for a book run, derived from the SAME tally the stat rows are written from, so the run's totals and
 * its department breakdown cannot disagree: Σ added over departments = added, Σ held = skippedHeld, and so on.
 */
export function runColumnsFromStats(stats: DeptStats) {
  const t = totals(stats);
  return { added: t.added, skippedHeld: t.held, needsReview: t.sentToReview, skippedRejected: t.skipped, skippedFailed: t.failed };
}

/**
 * Write the run and its breakdown together, or neither. Never throws: a log that cannot be written must not undo what was
 * catalogued. The run keeps the same totals it always had.
 */
export async function createRunWithStats(row: Record<string, any>, stats: DeptStats | null | undefined, contentType = 'Books', db: any = ingestionDb): Promise<string | null> {
  const id = randomUUID();
  // A Book run that says how many candidates it examined must account for every one of them (see accounting.ts). The check is made
  // here, on the row's own columns, so every writer of a Book run — continuous, Quick Import, bulk, targeted — is held to it once.
  if (row.phase === 'Books' && typeof row.checked === 'number') {
    const r = reconcile(tallyOfRow(row));
    row.accounting = r.status; row.unaccounted = r.unaccounted;
    if (!r.ok) {
      row.error = [row.error, r.message].filter(Boolean).join(' — ').slice(0, 900);
      console.error(`[ingest] ${row.source ?? 'Books'}: ${r.message}`);
    }
  }
  const rows = Object.entries(stats || {}).filter(([, c]) => Object.values(c).some(n => n > 0));
  try {
    await db.$transaction(async (tx: any) => {
      await tx.ingestionRun.create({ data: { ...row, id } });
      if (rows.length) await tx.ingestionRunDepartmentStat.createMany({ data: rows.map(([department, c]) => ({ runId: id, department, contentType, ...c })) });
    });
    return id;
  } catch (e: any) {
    console.error('[ingest] could not write the run row:', e?.message);
    return null;
  }
}
