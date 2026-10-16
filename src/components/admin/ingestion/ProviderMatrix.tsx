import { useCallback, useEffect, useState } from 'react';
import { Table2 } from 'lucide-react';
import { api } from './api';
import { N, ago, clock } from './format';

/**
 * The Book provider matrix: every Book source on one table — what it has done, how it is behaving, when it may be asked again, and what the
 * catalogue holds from it. "Checked" is the candidates a run examined and is never the same figure as "Added"; failures are two numbers
 * (a run of failed requests since the last success, and every one there has ever been) plus books that failed to WRITE.
 */

type Row = {
  id: string; label: string; cls: string; mode: string; health: string; availability: string;
  checked: number; unique: number; added: number; existing: number; review: number; skipped: number;
  failures: { consecutive: number; lifetime: number; failedWrites: number };
  lastError: string | null; nextRetry: string | null; lastSuccess: string | null; runs: number;
  catalogue: { published: number; readable: number; external: number; metadataOnly: number; reviewWaiting: number };
  unaccountedRuns: number;
};
type Data = { period: string; rows: Row[]; accounting: { errors: number; runsChecked: number; recent: { at: string; source: string | null; checked: number; unaccounted: number; message: string | null }[] } };

const HEALTH: Record<string, [string, string]> = {
  healthy: ['Healthy', 'badge-success'], degraded: ['Degraded', 'badge-caution'], rate_limited: ['Rate limited', 'badge-caution'],
  cooling: ['Cooling down', 'badge-caution'], unavailable: ['Unavailable', 'badge-alarm'], unknown: ['Unknown', 'badge-neutral'],
};
const PERIODS = [['lifetime', 'Lifetime'], ['7d', 'Last 7 days'], ['24h', 'Last 24 hours']] as const;

export function ProviderMatrix({ refreshKey = 0 }: { refreshKey?: number }) {
  const [period, setPeriod] = useState<string>('lifetime');
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/ingest/provider-matrix?period=${period}`);
    if (r.ok) { setData(r.data); setFailed(false); } else setFailed(true);
  }, [period]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load, refreshKey]);

  const groups = data ? Array.from(new Set(data.rows.map(r => r.cls))) : [];
  return (
    <section className="card" aria-labelledby="matrix-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
        <div className="max-w-3xl">
          <h2 id="matrix-heading" className="flex items-center gap-2 text-base font-semibold text-ink"><Table2 size={16} aria-hidden="true" /> Book providers</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
            What each source has done, how it is behaving, and when it may be asked again. <b className="font-semibold text-ink-2">Checked</b> is candidates examined, not books added.
            Sources that state a licence can be read from here; metadata sources only say a book exists, so their books are catalogued without a Read button.
          </p>
        </div>
        <label className="text-[12px] text-muted">Period
          <select className="input ml-2 h-8 w-auto py-0 text-[12.5px]" value={period} onChange={e => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>

      {failed && !data && <p role="alert" className="px-5 py-4 text-sm text-ink">The provider table could not be loaded. If the server was started before this update, restart it. Nothing has been changed.</p>}
      {!data && !failed && <div className="p-5" aria-busy="true"><span className="skeleton block h-40 w-full" /></div>}

      {data && data.accounting.errors > 0 && (
        <div role="alert" className="border-b border-alarm/40 bg-alarm-soft px-5 py-3 text-[13px] text-ink">
          <b className="font-semibold">{N(data.accounting.errors)} Book run{data.accounting.errors === 1 ? '' : 's'} did not add up.</b> A run marked ACCOUNTING_ERROR checked more (or fewer) candidates than the outcomes it recorded, so some were lost from the count.
          <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-ink-2">
            {data.accounting.recent.slice(0, 5).map((e, i) => <li key={i}>{ago(e.at)} · {e.source || 'Books'} — {e.message || `${N(e.checked)} checked, ${N(Math.abs(e.unaccounted))} ${e.unaccounted > 0 ? 'unaccounted' : 'extra'}`}</li>)}
          </ul>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[12.5px]">
            <caption className="sr-only">Book providers: health, availability, work done, failures and retry time</caption>
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="min-w-[10.5rem] px-3 py-2 font-semibold">Provider</th>
                <th scope="col" className="px-3 py-2 font-semibold">Health</th>
                <th scope="col" className="px-3 py-2 font-semibold">Availability</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" title="Candidates examined">Checked</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" title="Different candidates, by identifier">Unique</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Added</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" title="Already in the catalogue">Existing</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" title="Held in the catalogue now as a record with nowhere to read it">Metadata Only</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" title="Sent to a person to place">Review</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Skipped</th>
                <th scope="col" className="px-3 py-2 font-semibold" title="Failed requests in a row / ever, and books that failed to write">Failures</th>
                <th scope="col" className="px-3 py-2 font-semibold">Next retry</th>
                <th scope="col" className="px-3 py-2 font-semibold">Last successful import</th>
              </tr>
            </thead>
            {groups.map(g => (
              <tbody key={g} className="divide-y divide-rule border-t border-rule">
                <tr><th scope="rowgroup" colSpan={13} className="bg-surface-2/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{g}</th></tr>
                {data.rows.filter(r => r.cls === g).map(r => {
                  const [hl, hc] = HEALTH[r.health] || HEALTH.unknown;
                  return (
                    <tr key={r.id} className="align-top">
                      <th scope="row" className="min-w-[10.5rem] px-3 py-2.5 font-semibold text-ink">{r.label}<span className="block text-[11px] font-normal text-muted">{r.mode}</span></th>
                      <td className="px-3 py-2.5"><span className={`badge ${hc}`}>{hl}</span></td>
                      <td className="max-w-[16rem] px-3 py-2.5 text-ink-2">{r.availability}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{N(r.checked)}{r.unaccountedRuns > 0 && <span className="ml-1 badge badge-alarm" title="Some runs did not add up">!</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{r.unique ? N(r.unique) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{N(r.added)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.existing)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.catalogue.metadataOnly)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.review)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.skipped)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-ink-2">
                        {N(r.failures.consecutive)} in a row · {N(r.failures.lifetime)} ever{r.failures.failedWrites ? ` · ${N(r.failures.failedWrites)} failed writes` : ''}
                        {r.lastError && <span className="block text-[11px] text-muted">{r.lastError}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{r.nextRetry ? clock(r.nextRetry) : '—'}</td>
                      <td className="px-3 py-2.5 text-ink-2">{r.lastSuccess ? ago(r.lastSuccess) : 'Never'}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
