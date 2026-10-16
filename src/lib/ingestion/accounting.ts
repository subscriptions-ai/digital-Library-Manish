/**
 * Run accounting: every candidate a run examines ends in exactly one bucket.
 *
 *   checked = added + already held + review + skipped + failed
 *
 * "Already held" is the one bucket for what the catalogue already has — a duplicate of a held book (the run log has always called it
 * `skippedHeld`), whether or not the held row was enriched. A candidate the provider calls unchanged since the last sync, deleted,
 * unreadable, outside the provider's departments, or without a reliable department is SKIPPED, with a reason, never dropped.
 * Metadata Only, Open External and Full Text describe HOW an added book may be read; they are a split of `added`, not another bucket.
 *
 * A run whose buckets do not add up to `checked` is marked ACCOUNTING_ERROR and shown to the administrator: a candidate that vanished
 * is a bug in the pipeline, and the one place it can be seen is the arithmetic.
 */

export type Tally = { checked: number; added: number; alreadyHeld: number; review: number; skipped: number; failed: number };

export type Reconciliation = {
  ok: boolean;
  status: 'OK' | 'ACCOUNTING_ERROR';
  checked: number;
  accounted: number;
  /** checked − accounted. Positive: candidates in no bucket. Negative: more outcomes than candidates. */
  unaccounted: number;
  message: string | null;
};

const n = (v: unknown) => (Number.isFinite(v as number) ? Math.trunc(v as number) : 0);

export function accountedOf(t: Omit<Tally, 'checked'>): number {
  return n(t.added) + n(t.alreadyHeld) + n(t.review) + n(t.skipped) + n(t.failed);
}

export function reconcile(t: Tally): Reconciliation {
  const checked = n(t.checked), accounted = accountedOf(t), gap = checked - accounted;
  if (gap === 0) return { ok: true, status: 'OK', checked, accounted, unaccounted: 0, message: null };
  const parts = `${n(t.added)} added + ${n(t.alreadyHeld)} already held + ${n(t.review)} review + ${n(t.skipped)} skipped + ${n(t.failed)} failed = ${accounted}`;
  return {
    ok: false, status: 'ACCOUNTING_ERROR', checked, accounted, unaccounted: gap,
    message: gap > 0
      ? `ACCOUNTING_ERROR: ${checked} candidates checked but only ${accounted} accounted for (${parts}); ${gap} appear in no bucket.`
      : `ACCOUNTING_ERROR: ${checked} candidates checked but ${accounted} outcomes recorded (${parts}); ${-gap} more outcomes than candidates.`,
  };
}

/** The run-log row's own columns as a tally (a row stores the buckets as skippedHeld / needsReview / skippedRejected / skippedFailed). */
export function tallyOfRow(row: { checked?: number | null; added?: number | null; skippedHeld?: number | null; needsReview?: number | null; skippedRejected?: number | null; skippedFailed?: number | null }): Tally {
  return { checked: n(row.checked), added: n(row.added), alreadyHeld: n(row.skippedHeld), review: n(row.needsReview), skipped: n(row.skippedRejected), failed: n(row.skippedFailed) };
}
