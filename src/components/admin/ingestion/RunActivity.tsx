import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState } from '../../ui';
import { api } from './api';
import { N, ago } from './format';

const RESULTS = [['all', 'All'], ['added', 'Added'], ['held', 'Held'], ['failed', 'Failed'], ['skipped', 'Skipped']] as const;
const PHASES = [['', 'All kinds'], ['articles', 'Articles'], ['books', 'Books'], ['journals', 'Journals']] as const;

/** One sentence per row, in plain words. */
function rowText(r: any): string {
  if (r.error) return r.error;
  if (r.phase === 'Journals') return r.note || `${N(r.journalsSeen)} journals read · ${N(r.journalsAccepted)} accepted · ${N(r.journalsRefused)} metadata only`;
  const bits = [`${N(r.added)} added`];
  if (r.skippedHeld) bits.push(`${N(r.skippedHeld)} already held`);
  if (r.skippedRejected) bits.push(`${N(r.skippedRejected)} refused by a rule`);
  if (r.needsReview) bits.push(`${N(r.needsReview)} sent to review`);
  if (r.skippedFailed) bits.push(`${N(r.skippedFailed)} failed to write`);
  return bits.join(' · ') + (r.note ? ` — ${r.note}` : '');
}

/** Presentation only: consecutive rows for the same journal and outcome are shown together. Nothing is merged or hidden in the data. */
function group(runs: any[]) {
  const out: { head: any; n: number }[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.head.phase === r.phase && last.head.journalId && last.head.journalId === r.journalId && rowText(last.head) === rowText(r)) last.n++;
    else out.push({ head: r, n: 1 });
  }
  return out;
}

export function RunActivity({ refreshKey }: { refreshKey: number }) {
  const [result, setResult] = useState<string>('all');
  const [phase, setPhase] = useState<string>('');
  const [runs, setRuns] = useState<any[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);

  const query = (before?: string | null) => `/api/admin/ingest/history?result=${result}${phase ? `&phase=${phase}` : ''}&limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`;

  const load = useCallback(async () => {
    const r = await api(query());
    if (!r.ok) { setError(true); return; }
    setError(false); setRuns(r.data.runs); setNext(r.data.nextBefore);
  }, [result, phase]);

  useEffect(() => { setRuns(null); load(); }, [load, refreshKey]);
  useEffect(() => { const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);

  const loadMore = async () => {
    setMore(true);
    const r = await api(query(next));
    setMore(false);
    if (r.ok) { setRuns(prev => [...(prev || []), ...r.data.runs]); setNext(r.data.nextBefore); }
  };

  const grouped = runs ? group(runs) : [];

  return (
    <section className="card" aria-labelledby="activity-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4">
        <h2 id="activity-heading" className="text-base font-semibold text-ink">Run activity</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented" role="group" aria-label="Filter by result">
            {RESULTS.map(([id, label]) => <button key={id} type="button" aria-pressed={result === id} onClick={() => setResult(id)}>{label}</button>)}
          </div>
          <select className="input h-9 w-auto py-0 text-[13px]" aria-label="Filter by kind" value={phase} onChange={e => setPhase(e.target.value)}>
            {PHASES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="px-5 py-4 text-sm text-alarm">The run log could not be loaded. Nothing is shown rather than an empty list.</p>}
      {!error && runs === null && <div className="space-y-2 p-5" aria-busy="true"><span className="skeleton block h-5 w-full" /><span className="skeleton block h-5 w-5/6" /><span className="skeleton block h-5 w-2/3" /></div>}
      {!error && runs && !grouped.length && <EmptyState title="No runs match this filter" description="Try a different result or kind." />}

      {!error && runs && grouped.length > 0 && (
        <ul className="divide-y divide-rule">
          {grouped.map(({ head: r, n }) => {
            const failed = !!r.error || r.phase === 'Error' || r.skippedFailed > 0;
            return (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-[13px]">
                <span className="w-16 shrink-0 text-[12px] text-muted tabular-nums" title={new Date(r.at).toLocaleString()}>{ago(r.at)}</span>
                <span className={`badge ${failed ? 'badge-alarm' : 'badge-neutral'}`}>{r.phase}</span>
                <span className="min-w-0 flex-1 text-ink-2">
                  <b className="font-semibold text-ink">{r.journalTitle || (r.department ? r.department : r.source) || '—'}</b>
                  <span className="text-muted"> · </span>{rowText(r)}
                  {n > 1 && <span className="ml-2 text-muted">(×{n} in a row)</span>}
                </span>
                {r.source && <span className="text-[11.5px] text-muted">{r.source}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {next && <div className="border-t border-rule p-3 text-center"><Button variant="outline" size="sm" onClick={loadMore} loading={more}>{more ? 'Loading…' : 'Load older runs'}</Button></div>}
    </section>
  );
}
