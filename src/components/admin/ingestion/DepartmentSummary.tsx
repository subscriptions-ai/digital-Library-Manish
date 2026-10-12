import { useEffect, useState } from 'react';
import { api } from './api';
import { N, dayLabel } from './format';
import { rangeQuery, rangeLabel, honoured, STALE_SERVER, type DateRangeValue } from './DateRange';

function Tile({ label, value, note }: { label: string; value: any; note?: string | null }) {
  return (
    <div className="bg-surface px-3.5 py-3">
      <p className="text-lg font-semibold tabular-nums text-ink">{value === undefined ? <span aria-hidden="true" className="skeleton inline-block h-6 w-12 align-middle" /> : N(value)}</p>
      <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      {note ? <p className="mt-0.5 text-[11px] text-muted">{note}</p> : null}
    </div>
  );
}

function Group({ title, caption, children, cols }: { title: string; caption?: string | null; children: React.ReactNode; cols: string }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
        {caption ? <p className="text-[11.5px] text-muted">{caption}</p> : null}
      </div>
      <div className={`grid gap-px overflow-hidden rounded-xl border border-rule bg-rule ${cols}`}>{children}</div>
    </div>
  );
}

export type SummaryFilters = { phase: string; source: string; result: string };
const RESULT_RUNS: Record<string, string> = { added: 'Added runs', held: 'Held runs', failed: 'Failed runs', provider: 'Source-issue runs', skipped: 'Skipped runs' };

/**
 * What the chosen department holds now, and what ingestion did for it over the chosen dates — in two separate blocks,
 * because they are different kinds of number: one is a state of the library, the other a count of events.
 *
 * The first block ignores the date and every run filter. The second, the by-day table and the unattributed line are all
 * derived on the server from one filtered set of runs — the same set the list below shows. If the answer cannot be loaded,
 * or the server did not apply the range that was asked for, nothing is shown rather than numbers for another period.
 */
export function DepartmentSummary({ department, range, filters, narrowedBy, refreshKey }: {
  department: string; range: DateRangeValue; filters: SummaryFilters; narrowedBy: string[]; refreshKey: number;
}) {
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [byDay, setByDay] = useState(false);

  const qs = [
    rangeQuery(range), department && `department=${encodeURIComponent(department)}`,
    filters.phase && `phase=${filters.phase}`, filters.source && `source=${encodeURIComponent(filters.source)}`, filters.result !== 'all' && `result=${filters.result}`,
    byDay && 'byDay=1',
  ].filter(Boolean).join('&');

  useEffect(() => {
    let alive = true; setData(null); setFailed(null);
    const load = async () => {
      const r = await api(`/api/admin/ingest/department-metrics?${qs}`);
      if (!alive) return;                                          // the filters changed while this was on its way
      if (!r.ok) { setFailed(r.data?.error || 'could not be loaded'); return; }
      if (!honoured(range, r.data?.range)) { setData(null); setFailed(STALE_SERVER); return; }
      setData(r.data); setFailed(null);
    };
    load(); const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [qs, refreshKey]);

  const title = department || 'All departments';
  const label = rangeLabel(range);                                  // from what was asked for: never a placeholder
  const resultNote = RESULT_RUNS[filters.result];
  if (failed && !data) {
    return <p role="alert" className="border-b border-rule px-5 py-4 text-sm text-alarm">The figures for {title} could not be shown ({failed}){failed === STALE_SERVER ? '' : ' — none are shown rather than zeros that would mean nothing.'}</p>;
  }

  const c = data?.catalogue; const g = data?.ingestion; const u = data?.unattributed; const rg = data?.range;
  const empty = !!c && !c.books && !c.articles && !c.journals;
  const unplaced = u && (u.runs > 0)
    ? [u.booksAdded && `${N(u.booksAdded)} book${u.booksAdded === 1 ? '' : 's'} added`, u.articlesAdded && `${N(u.articlesAdded)} article${u.articlesAdded === 1 ? '' : 's'} added`, u.journalsAccepted && `${N(u.journalsAccepted)} journal${u.journalsAccepted === 1 ? '' : 's'} accepted`, u.failedRuns && `${N(u.failedRuns)} failed run${u.failedRuns === 1 ? '' : 's'}`].filter(Boolean).join(', ') || `${N(u.runs)} run${u.runs === 1 ? '' : 's'} with nothing added`
    : null;
  const caption = !rg ? null : rg.key === 'lifetime'
    ? `Run log${data.ingestionSince ? ` since ${dayLabel(data.ingestionSince.slice(0, 10))}` : ''}`
    : rg.text || null;
  const days: any[] | null = data?.byDay || null;
  const total = days ? days.reduce((t, d) => ({ books: t.books + d.books, articles: t.articles + d.articles, journals: t.journals + d.journals, held: t.held + d.held, failedRuns: t.failedRuns + d.failedRuns, providerFailures: t.providerFailures + d.providerFailures, sentToReview: t.sentToReview + d.sentToReview }), { books: 0, articles: 0, journals: 0, held: 0, failedRuns: 0, providerFailures: 0, sentToReview: 0 }) : null;

  return (
    <div className="space-y-4 border-b border-rule bg-surface-2/40 px-5 py-4" aria-live="polite" aria-busy={!data}>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-[12px] text-muted">{label}{narrowedBy.length ? ` · ${narrowedBy.join(' · ')}` : ''}</p>
      </div>

      <Group title="Current catalogue" caption="What the library holds now — not affected by the date or the filters" cols="grid-cols-2 sm:grid-cols-4">
        <Tile label="Books" value={c?.books} />
        <Tile label="Articles" value={c?.articles} />
        <Tile label="Journals" value={c?.journals} note={c ? 'full text accepted' : null} />
        <Tile label="Awaiting review" value={c?.needsReview} note={c ? 'current queue' : null} />
      </Group>
      {empty && <p className="text-[12.5px] text-muted">No catalogue content found for this department yet.</p>}

      <Group title={`Ingestion activity — ${label}${resultNote ? ` · ${resultNote}` : ''}`} caption={caption} cols="grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        <Tile label="Books added" value={g?.booksAdded} />
        <Tile label="Articles added" value={g?.articlesAdded} />
        <Tile label="Journals accepted" value={g?.journalsAccepted} />
        <Tile label="Held" value={g?.held} note={g ? 'already in catalogue' : null} />
        <Tile label="Failed runs" value={g?.failedRuns} note={g && g.failedWrites ? `${N(g.failedWrites)} records not written` : null} />
        <Tile label="Source issues" value={g?.providerFailures} note={g ? 'a source did not answer' : null} />
        <Tile label="Sent to review" value={g?.sentToReview} />
        <Tile label="Refused by a rule" value={g?.refused} />
      </Group>
      {g && narrowedBy.length > 0 && (
        <p className="text-[12px] text-muted">
          Counted only from the {N(g.runs)} run{g.runs === 1 ? '' : 's'} matching {narrowedBy.join(' · ')} in this range. Every figure above is what those same runs recorded — nothing from other runs or other dates.
        </p>
      )}
      {g && g.runs === 0 && <p className="text-[12.5px] text-muted">No ingestion activity was recorded for this department and date range.</p>}
      {data?.unassigned && (data.unassigned.sentToReview > 0 || data.unassigned.held > 0) && (
        <div className="rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-[12px] text-muted">
          <p className="font-semibold text-ink-2">Unassigned / needs review</p>
          <p className="mt-0.5">{[data.unassigned.sentToReview > 0 && `${N(data.unassigned.sentToReview)} book${data.unassigned.sentToReview === 1 ? '' : 's'} sent to review`, data.unassigned.held > 0 && `${N(data.unassigned.held)} already held while waiting`].filter(Boolean).join(', ')} in this range. These have no confirmed department yet — a person places them — so they are not part of {title}’s figures, and a suggested department is never counted as one.</p>
        </div>
      )}
      {unplaced && (
        <div className="rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-[12px] text-muted">
          <p className="font-semibold text-ink-2">Unattributed activity</p>
          <p className="mt-0.5">{unplaced} in this range, kept apart from {title}. Department breakdown was not recorded for these historical runs, so they are not part of {title}’s figures above.</p>
        </div>
      )}

      <div>
        <button type="button" className="text-[12.5px] font-medium text-accent underline-offset-2 hover:underline" aria-expanded={byDay} onClick={() => setByDay(v => !v)}>
          {byDay ? 'Hide' : 'Show'} by day
        </button>
        {byDay && (
          !days ? <span className="skeleton mt-2 block h-5 w-full" />
          : !days.length ? <p className="mt-2 text-[12.5px] text-muted">No ingestion activity was recorded for this department and date range.</p>
          : (
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-rule bg-surface">
              <table className="w-full min-w-[540px] text-left text-[13px]">
                <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Date</th><th className="px-3 py-2 text-right font-semibold">Books</th><th className="px-3 py-2 text-right font-semibold">Articles</th>
                    <th className="px-3 py-2 text-right font-semibold">Journals</th><th className="px-3 py-2 text-right font-semibold">Held</th><th className="px-3 py-2 text-right font-semibold">Failed</th><th className="px-3 py-2 text-right font-semibold">Source issues</th><th className="px-4 py-2 text-right font-semibold">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {days.map(d => (
                    <tr key={d.day} className={d.books || d.articles || d.journals || d.held || d.failedRuns || d.providerFailures || d.sentToReview ? '' : 'text-muted'}>
                      <td className="px-4 py-1.5">{dayLabel(d.day)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{N(d.books)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(d.articles)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(d.journals)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{N(d.held)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(d.failedRuns)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(d.providerFailures)}</td><td className="px-4 py-1.5 text-right tabular-nums">{N(d.sentToReview)}</td>
                    </tr>
                  ))}
                </tbody>
                {total && (
                  <tfoot className="sticky bottom-0 bg-surface-2 font-semibold text-ink">
                    <tr>
                      <td className="px-4 py-1.5">Total</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{N(total.books)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(total.articles)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(total.journals)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{N(total.held)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(total.failedRuns)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(total.providerFailures)}</td><td className="px-4 py-1.5 text-right tabular-nums">{N(total.sentToReview)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              <p className="border-t border-rule px-4 py-1.5 text-[11.5px] text-muted">India days. {rg?.key === 'lifetime' ? 'Only days with activity are listed, newest first.' : 'Every day in the range is listed, oldest first; a day with no activity is 0.'} The total equals the figures above.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
