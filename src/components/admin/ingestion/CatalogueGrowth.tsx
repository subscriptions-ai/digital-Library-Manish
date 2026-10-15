import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { N } from './format';

/**
 * Catalogue growth: what the catalogue holds NOW, and — separately — what ingestion did in a period. They are different numbers and are never
 * added together: a record looked at five times is five events and one catalogue entry; a duplicate is an event and never growth.
 */

type Block = { current: number; discovered: number; checked: number; newRecords: number; duplicates: number; review: number; published: number; metadataOnly: number; rejected: number; providerFailures: number };
type Data = { period: string; since: string | null; books: Block & { reviewWaiting: number; failedWrites: number }; journals: Block & { accepted: number; metadataOnlyHeld: number; reviewWaiting: number };
  providers: { books: { source: string; published: number; review: number }[]; journals: { basis: string; status: string; n: number }[] } };

const PERIODS = [['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']] as const;

function Events({ title, b, bookish }: { title: string; b: Block; bookish: boolean }) {
  const cols: [string, number, string][] = [
    ['Discovered', b.discovered, 'Records a run examined'], ['Checked', b.checked, 'The same records, as checked'], ['New', b.newRecords, 'Not held before: published + sent to review'],
    ['Duplicates', b.duplicates, 'Already held — never counted as growth'], ['Review', b.review, 'Waiting for a person; not public'], ['Published', b.published, 'Made public by the run'],
    ...(bookish ? [['Metadata Only', b.metadataOnly, 'New public books with nowhere to read them'] as [string, number, string]] : [['Metadata Only', b.metadataOnly, 'Catalogued, refused for full text on licence'] as [string, number, string]]),
    ['Rejected', b.rejected, 'Refused by a rule or no reliable department'], ['Provider failures', b.providerFailures, 'Runs in which a source did not answer'],
  ];
  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="text-[13px] text-ink-2"><span className="text-muted">In the catalogue now </span><strong className="text-lg font-semibold tabular-nums text-ink">{N(b.current)}</strong></p>
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Ingestion events in this period</p>
      <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-5">
        {cols.map(([l, v, hint]) => (
          <div key={l} className="bg-surface px-3.5 py-2.5" title={hint}><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
        ))}
      </dl>
    </div>
  );
}

export function CatalogueGrowth() {
  const [period, setPeriod] = useState<typeof PERIODS[number][0]>('7d');
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { const r = await api<Data>(`/api/admin/ingest/catalogue-growth?period=${period}`); if (r.ok) { setData(r.data); setFailed(false); } else setFailed(true); }, [period]);
  useEffect(() => { setData(null); load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  return (
    <section className="space-y-5" aria-labelledby="growth-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="growth-heading" className="text-base font-semibold text-ink">Catalogue growth</h2>
          <p className="mt-0.5 max-w-2xl text-[12.5px] text-muted">“In the catalogue now” is counted from the catalogue itself. The figures below it are what ingestion did in the period — kept apart, because events include duplicates and records that were only looked at.</p>
        </div>
        <div className="segmented" role="group" aria-label="Period">{PERIODS.map(([id, label]) => <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}</div>
      </div>
      {failed && !data && <p role="alert" className="rounded-xl border border-alarm/40 bg-alarm-soft px-4 py-3 text-sm text-ink">Catalogue growth could not be loaded. Nothing has been changed.</p>}
      {!data && !failed && <span className="skeleton block h-48 w-full" aria-busy="true" />}
      {data && (
        <>
          <Events title="Journals" b={data.journals} bookish={false} />
          <p className="-mt-3 text-[12px] text-muted">Journals held: {N(data.journals.accepted)} with full text accepted · {N(data.journals.metadataOnlyHeld)} metadata only · {N(data.journals.reviewWaiting)} waiting for review (open access unverified).</p>
          <Events title="Books" b={data.books} bookish />
          <p className="-mt-3 text-[12px] text-muted">Books waiting for review: {N(data.books.reviewWaiting)} (not public). Records that could not be written in this period: {N(data.books.failedWrites)}.</p>

          <div className="card">
            <div className="border-b border-rule px-5 py-3.5"><h3 className="text-[15px] font-semibold text-ink">Where the catalogue came from</h3></div>
            <div className="grid gap-px bg-rule md:grid-cols-2">
              <div className="bg-surface px-5 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Books by source</p>
                <ul className="mt-2 space-y-1 text-[13px]">{data.providers.books.map(b => <li key={b.source} className="flex justify-between gap-3"><span className="text-ink-2">{b.source}</span><span className="tabular-nums text-ink">{N(b.published)} published{b.review ? ` · ${N(b.review)} review` : ''}</span></li>)}</ul></div>
              <div className="bg-surface px-5 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Journals by basis</p>
                <ul className="mt-2 space-y-1 text-[13px]">{data.providers.journals.map(j => <li key={`${j.basis}${j.status}`} className="flex justify-between gap-3"><span className="text-ink-2">{j.basis} · {j.status}</span><span className="tabular-nums text-ink">{N(j.n)}</span></li>)}</ul></div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
