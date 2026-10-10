import { useEffect, useState } from 'react';
import { api } from './api';
import { N } from './format';
import { InfoTip } from './InfoTip';

const PERIODS = [['lifetime', 'Lifetime'], ['7d', '7 days'], ['24h', '24 hours']] as const;

const TILES: { key: string; label: string; tip: string }[] = [
  { key: 'journalsSeen', label: 'Journals seen', tip: 'Journal listings read from DOAJ. A journal read again on a later sweep is counted again.' },
  { key: 'accepted', label: 'Accepted', tip: 'Journals whose declared licence permits commercial use, so full text may be served here.' },
  { key: 'refused', label: 'Refused — non-commercial', tip: 'Journals catalogued as metadata only because their declared licence does not permit commercial use. They link to the publisher; no file is served.' },
  { key: 'articlesAdded', label: 'Articles added', tip: 'New articles the engine wrote to the catalogue from OpenAlex.' },
  { key: 'booksAdded', label: 'Books added', tip: 'New books catalogued from DOAB, OAPEN, Open Textbook Library and NCBI Bookshelf. No book files are hosted here, so each is catalogued with a link.' },
  { key: 'alreadyHeld', label: 'Already held', tip: 'Records encountered during ingestion that already exist in the catalogue. (Totals from before the latest update also include a small number of records that could not be written.)' },
];

export function Metrics({ state }: { state: any }) {
  const [period, setPeriod] = useState<'lifetime' | '7d' | '24h'>('lifetime');
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  // Lifetime is the engine's own running totals, straight from the state it already loaded — never recomputed.
  const lifetime = {
    journalsSeen: state.journalsSeen, accepted: state.journalsAccepted, refused: state.journalsRejected,
    articlesAdded: state.articlesAdded, booksAdded: state.booksAdded, alreadyHeld: (state.articlesSkipped || 0) + (state.booksSkipped || 0),
  };

  useEffect(() => {
    if (period === 'lifetime') { setData(null); setFailed(false); return; }
    let alive = true; setData(null); setFailed(false);
    const load = async () => { const r = await api(`/api/admin/ingest/metrics?period=${period}`); if (!alive) return; r.ok ? setData(r.data) : setFailed(true); };
    load(); const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [period]);

  const values: any = period === 'lifetime' ? lifetime : data;

  return (
    <section aria-labelledby="metrics-heading">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 id="metrics-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Metrics</h2>
        <div className="segmented" role="group" aria-label="Time period">
          {PERIODS.map(([id, label]) => <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map(t => (
          <div key={t.key} className="bg-surface px-3.5 py-3.5">
            <p className="text-xl font-semibold tabular-nums text-ink">
              {values ? N(values[t.key]) : failed ? '—' : <span aria-hidden="true" className="skeleton inline-block h-6 w-16 align-middle" />}
              {!values && !failed && <span className="sr-only">Loading</span>}
            </p>
            <p className="mt-1 flex items-center gap-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{t.label}<InfoTip label={t.label}>{t.tip}</InfoTip></p>
          </div>
        ))}
      </div>
      {failed && <p role="status" className="mt-2 text-[12px] text-muted">These figures could not be loaded just now, so none are shown rather than a zero that would mean nothing.</p>}
      {period !== 'lifetime' && <p className="mt-2 text-[11.5px] text-muted">Summed from the run log for the last {period === '24h' ? '24 hours' : '7 days'}. Lifetime totals are the engine's own running counters and are never recalculated.</p>}
    </section>
  );
}
