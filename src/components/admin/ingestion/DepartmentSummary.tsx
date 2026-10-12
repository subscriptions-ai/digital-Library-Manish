import { useEffect, useState } from 'react';
import { api } from './api';
import { N, dayLabel } from './format';
import { rangeQuery, type DateRangeValue } from './DateRange';

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

/**
 * What the chosen department holds now, and what ingestion did for it over the chosen dates — in two separate blocks,
 * because they are different kinds of number: one is a state of the library, the other a count of events.
 *
 * The first block ignores the date and every run filter. The second is a sum over exactly the runs the list below shows.
 * Every figure comes from /api/admin/ingest/department-metrics. If it cannot be loaded nothing is shown, never zeros.
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
      if (!alive) return;
      if (r.ok) { setData(r.data); setFailed(null); } else setFailed(r.data?.error || 'could not be loaded');
    };
    load(); const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [qs, refreshKey]);

  const title = department || 'All departments';
  if (failed && !data) {
    return <p role="alert" className="border-b border-rule px-5 py-4 text-sm text-alarm">The figures for {title} could not be loaded just now ({failed}), so none are shown rather than zeros that would mean nothing.</p>;
  }

  const c = data?.catalogue; const g = data?.ingestion; const u = data?.unattributed; const rg = data?.range;
  const empty = !!c && !c.books && !c.articles && !c.journals;
  const label = rg?.label || '…';
  const missed = u && (u.booksAdded || u.articlesAdded || u.journalsAccepted)
    ? [u.booksAdded && `${N(u.booksAdded)} book${u.booksAdded === 1 ? '' : 's'}`, u.articlesAdded && `${N(u.articlesAdded)} article${u.articlesAdded === 1 ? '' : 's'}`, u.journalsAccepted && `${N(u.journalsAccepted)} journal${u.journalsAccepted === 1 ? '' : 's'}`].filter(Boolean).join(', ')
    : null;
  const caption = !rg ? null : rg.key === 'lifetime'
    ? `Run log${data.ingestionSince ? ` since ${dayLabel(data.ingestionSince.slice(0, 10))} ${data.ingestionSince.slice(0, 4)}` : ''}`
    : rg.text || null;

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

      <Group title={`Ingestion activity — ${label}`} caption={caption} cols="grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        <Tile label="Books added" value={g?.booksAdded} />
        <Tile label="Articles added" value={g?.articlesAdded} />
        <Tile label="Journals accepted" value={g?.journalsAccepted} />
        <Tile label="Held" value={g?.held} note={g ? 'already in catalogue' : null} />
        <Tile label="Failed runs" value={g?.failedRuns} note={g && g.failedWrites ? `${N(g.failedWrites)} records not written` : null} />
        <Tile label="Sent to review" value={g?.sentToReview} />
        <Tile label="Refused by a rule" value={g?.refused} />
      </Group>
      {narrowedBy.length > 0 && <p className="text-[12px] text-muted">These totals cover only the runs matching {narrowedBy.join(' · ')}.</p>}
      {g && g.runs === 0 && <p className="text-[12.5px] text-muted">No ingestion activity was recorded for this department and date range.</p>}
      {missed && (
        <p className="text-[12px] text-muted">
          Not counted above: {missed} added in this range by book harvests, Quick Import or catalogue imports. Those runs cover many departments and the run log does not say which.
        </p>
      )}

      <div>
        <button type="button" className="text-[12.5px] font-medium text-accent underline-offset-2 hover:underline" aria-expanded={byDay} onClick={() => setByDay(v => !v)}>
          {byDay ? 'Hide' : 'Show'} by day
        </button>
        {byDay && (
          !data?.byDay ? <span className="skeleton mt-2 block h-5 w-full" />
          : !data.byDay.length ? <p className="mt-2 text-[12.5px] text-muted">No day in this range has any activity.</p>
          : (
            <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-rule bg-surface">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wide text-muted">
                  <tr><th className="px-4 py-2 font-semibold">Date</th><th className="px-3 py-2 text-right font-semibold">Books</th><th className="px-3 py-2 text-right font-semibold">Articles</th><th className="px-4 py-2 text-right font-semibold">Journals</th></tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {data.byDay.map((d: any) => (
                    <tr key={d.day}><td className="px-4 py-1.5 text-ink">{dayLabel(d.day)}{rg?.key === 'lifetime' || rg?.fromDay?.slice(0, 4) !== rg?.toDay?.slice(0, 4) ? ` ${d.day.slice(0, 4)}` : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{N(d.books)}</td><td className="px-3 py-1.5 text-right tabular-nums">{N(d.articles)}</td><td className="px-4 py-1.5 text-right tabular-nums">{N(d.journals)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-rule px-4 py-1.5 text-[11.5px] text-muted">India days. A day with no activity is left out.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
