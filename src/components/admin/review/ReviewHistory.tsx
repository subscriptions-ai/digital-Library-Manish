import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Badge, Button } from '../../ui';
import { api } from '../ingestion/api';
import { N, exactTime } from '../ingestion/format';

/** What Review Automation has done: each analysis, comparison, batch and assignment job, with its counts. Read from the audit log; nothing is editable here. */
export function ReviewHistory() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (p: number) => { const r = await api(`/api/admin/review/history?page=${p}&limit=20`); if (r.ok) { setData(r.data); setError(null); } else setError(r.data?.error || 'Could not read the history.'); }, []);
  useEffect(() => { load(page); }, [page, load]);

  return (
    <section className="card" aria-label="Review history">
      <div className="border-b border-rule p-4">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><History size={13} aria-hidden="true" /> Review history</h2>
        <p className="mt-1 text-[13px] text-ink-2">Every Review Automation action, newest first. Assignments never publish a book.</p>
      </div>
      {error && <p role="alert" className="p-4 text-[12.5px] text-alarm">{error}</p>}
      {!data ? <span aria-hidden="true" className="skeleton m-4 block h-32" /> : !data.rows.length ? <p className="p-5 text-[13px] text-ink-2">Nothing has been run yet.</p> : (
        <ul className="divide-y divide-rule/60">
          {data.rows.map((r: any) => (
            <li key={r.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12px] text-muted">{exactTime(r.at)}</span>
                <span className="text-[12px] text-muted">{r.admin || 'System'}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{r.label}</span>{r.cancelled && <Badge tone="caution">Cancelled</Badge>}{r.detail && <span className="text-[12px] text-muted">{r.detail}</span>}</div>
              {r.assigns && (
                <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[12.5px] sm:grid-cols-4">
                  {([['Requested', r.requested], ['Assigned', r.assigned], ['Skipped', r.skipped], ['Failed', r.failed]] as const).map(([l, v]) => <div key={l} className="flex justify-between gap-2"><dt className="text-muted">{l}</dt><dd className="font-semibold tabular-nums text-ink">{N(v)}</dd></div>)}
                </dl>
              )}
              {Object.keys(r.skippedReasons || {}).length > 0 && <p className="mt-1 text-[11.5px] text-muted">Skipped: {Object.entries<number>(r.skippedReasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${N(n)}`).join(' · ')}</p>}
              <p className="mt-1 text-[11.5px] text-muted">{r.classifier ? `Classifier ${r.classifier}` : ''}{r.classifier && r.scope ? ' · ' : ''}{r.scope}</p>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > data.take && (
        <div className="flex items-center justify-between border-t border-rule px-4 py-3 text-[12px] text-muted"><span>Page {page} of {Math.ceil(data.total / data.take)}</span>
          <span className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page * data.take >= data.total} onClick={() => setPage(page + 1)}>Next</Button></span></div>
      )}
    </section>
  );
}
