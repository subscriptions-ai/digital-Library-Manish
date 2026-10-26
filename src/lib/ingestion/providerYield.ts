import { ingestionDb as db } from './db.js';
import { PROVIDER_FAILURE_SQL } from './runFilter.js';

/**
 * How efficiently each provider is turning the candidates it looks at into catalogue growth, from the run log over a window (default 24 hours).
 *
 *   unique yield      (added + sent to review) ÷ checked    — how much of what was looked at was NEW to us
 *   enrichment yield  enriched ÷ checked                    — how much of it completed a record we already hold
 *   duplicates        held = unchanged + enriched + conflicting. `enriched` and `duplicateConflicting` are columns; unchanged is what remains.
 *
 * Only runs that recorded how many candidates they `checked` take part in the two percentages (older article/journal rows did not), so the percentages are
 * never diluted by runs that cannot say; the plain counts cover every run. A provider's HTTP/connection failures (`providerFailures`) and records the
 * catalogue could not write (`failedWrites`) are different things and are kept in different columns. Maintenance (backlog) rows are not discovery and are left out.
 */

export type ProviderYield = {
  group: string; source: string; turns: number; checked: number;
  newPublished: number; review: number; held: number;
  duplicateUnchanged: number; duplicateEnriched: number; duplicateConflicting: number;
  refused: number; failedWrites: number; providerFailures: number;
  /** null when no run in the window recorded how much it checked. */
  uniqueYieldPct: number | null; enrichmentYieldPct: number | null;
  measuredChecked: number;
  lastProductiveAt: string | null; lastRunAt: string | null;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export async function providerYield(hours = 24, now = new Date()): Promise<{ hours: number; since: string; providers: ProviderYield[]; total: Omit<ProviderYield, 'group' | 'source'> }> {
  const h = Math.min(24 * 30, Math.max(1, Math.floor(hours) || 24));
  const since = new Date(now.getTime() - h * 3600_000).toISOString();
  const rows: any[] = await db.$queryRawUnsafe(
    `select r.phase, r.source,
            count(*)::int turns,
            coalesce(sum(r.checked), 0)::int checked,
            coalesce(sum(r.added), 0)::int added, coalesce(sum(r."needsReview"), 0)::int review, coalesce(sum(r."skippedHeld"), 0)::int held,
            coalesce(sum(r.enriched), 0)::int enriched, coalesce(sum(r."duplicateConflicting"), 0)::int conflicting,
            coalesce(sum(r."skippedRejected"), 0)::int refused, coalesce(sum(r."skippedFailed"), 0)::int "failedWrites",
            (count(*) filter (where ${PROVIDER_FAILURE_SQL}))::int "providerFailures",
            coalesce(sum(r.checked) filter (where r.checked > 0), 0)::int "measuredChecked",
            coalesce(sum(r.added + r."needsReview") filter (where r.checked > 0), 0)::int "measuredNew",
            coalesce(sum(r.enriched) filter (where r.checked > 0), 0)::int "measuredEnriched",
            max(r."at") filter (where r.added > 0 or r."needsReview" > 0 or r.enriched > 0) "lastProductiveAt",
            max(r."at") "lastRunAt"
       from "IngestionRun" r
      where r."at" >= ((($1)::text)::timestamptz at time zone 'UTC')
        and r.source is not null and r.phase in ('Journals', 'Articles', 'Books')
        and coalesce(r.note, '') not like 'Backlog%'
      group by r.phase, r.source
      order by sum(r.added) desc nulls last, r.source`, since).catch(() => []);

  const iso = (d: any) => (d ? new Date(d).toISOString() : null);
  const providers: ProviderYield[] = rows.map(r => ({
    group: r.phase, source: r.source, turns: r.turns, checked: r.checked, newPublished: r.added, review: r.review, held: r.held,
    duplicateEnriched: r.enriched, duplicateConflicting: r.conflicting, duplicateUnchanged: Math.max(0, r.held - r.enriched - r.conflicting),
    refused: r.refused, failedWrites: r.failedWrites, providerFailures: r.providerFailures,
    uniqueYieldPct: pct(r.measuredNew, r.measuredChecked), enrichmentYieldPct: pct(r.measuredEnriched, r.measuredChecked), measuredChecked: r.measuredChecked,
    lastProductiveAt: iso(r.lastProductiveAt), lastRunAt: iso(r.lastRunAt),
  }));
  const sum = (k: keyof ProviderYield) => providers.reduce((n, p) => n + (Number(p[k]) || 0), 0);
  const mNew = rows.reduce((n, r) => n + r.measuredNew, 0), mEnr = rows.reduce((n, r) => n + r.measuredEnriched, 0), mChk = rows.reduce((n, r) => n + r.measuredChecked, 0);
  return {
    hours: h, since, providers,
    total: {
      turns: sum('turns'), checked: sum('checked'), newPublished: sum('newPublished'), review: sum('review'), held: sum('held'),
      duplicateUnchanged: sum('duplicateUnchanged'), duplicateEnriched: sum('duplicateEnriched'), duplicateConflicting: sum('duplicateConflicting'),
      refused: sum('refused'), failedWrites: sum('failedWrites'), providerFailures: sum('providerFailures'),
      uniqueYieldPct: pct(mNew, mChk), enrichmentYieldPct: pct(mEnr, mChk), measuredChecked: mChk,
      lastProductiveAt: providers.map(p => p.lastProductiveAt).filter(Boolean).sort().pop() ?? null,
      lastRunAt: providers.map(p => p.lastRunAt).filter(Boolean).sort().pop() ?? null,
    },
  };
}
