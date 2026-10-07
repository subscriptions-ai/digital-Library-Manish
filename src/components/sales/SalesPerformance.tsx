import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Flame, Zap, Banknote, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui';
import {
  DataNote, LIVE_STAGES, NO_STATE, STAGE_COLOR, STAGE_ORDER, StatCard, inr, pct, stageLabel,
} from './salesUi';

/** The conversion target the page has always shown. It is a constant here, not a setting anywhere. */
const CONVERSION_TARGET = 30;
const STATES_SHOWN = 5;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export function SalesPerformance() {
  const [leads, setLeads] = useState<any[]>([]);
  const [won, setWon] = useState<{ value: number; paid: number } | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [allStates, setAllStates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setWon(undefined);
    try {
      const res = await fetch('/api/sales/my-leads', { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setLeads(await res.json());
    } catch {
      setLoadFailed(true);
      toast.error('Failed to load performance metrics', { id: 'sales-perf' });
      setLoading(false);
      return;
    }
    setLoading(false);
    // Revenue comes from quotations, a separate source; if it fails the card says so.
    fetch('/api/my/quotations', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setWon({ value: d.stats?.value || 0, paid: d.stats?.paid || 0 }))
      .catch(() => setWon(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = leads.length;
  const subscribers = leads.filter(l => l.status === 'Subscriber').length;
  const open = leads.filter(l => LIVE_STAGES.includes(l.status)).length;
  const rate = total ? (subscribers / total) * 100 : 0;

  // Each lead is in one stage at a time, so this is a snapshot of where they are — not a funnel.
  const stages = useMemo(() => {
    const by: Record<string, number> = {};
    leads.forEach(l => { by[l.status || 'All'] = (by[l.status || 'All'] || 0) + 1; });
    return Object.keys(by)
      .sort((a, b) => (STAGE_ORDER.indexOf(a) < 0 ? 99 : STAGE_ORDER.indexOf(a)) - (STAGE_ORDER.indexOf(b) < 0 ? 99 : STAGE_ORDER.indexOf(b)))
      .map(k => ({ key: k, label: stageLabel(k), n: by[k] }));
  }, [leads]);
  const widest = Math.max(1, ...stages.map(s => s.n));

  const { states, noState } = useMemo(() => {
    const by: Record<string, { total: number; won: number }> = {};
    let none = 0;
    for (const l of leads) {
      const s = (l.state || '').trim();
      if (!s) { none++; continue; }
      by[s] = by[s] || { total: 0, won: 0 };
      by[s].total++;
      if (l.status === 'Subscriber') by[s].won++;
    }
    const list = Object.entries(by)
      .map(([state, v]) => ({ state, ...v, rate: pct(v.won, v.total) }))
      .sort((a, b) => b.won - a.won || b.total - a.total || a.state.localeCompare(b.state));
    return { states: list, noState: none };
  }, [leads]);

  const heading = <PageHeader title="Performance" description="How your leads are converting, and where." />;

  if (loading) {
    return (
      <div>
        {heading}
        <div className="space-y-6" role="status" aria-label="Loading performance">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[124px] rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
        </div>
      </div>
    );
  }
  // Without this a failed load reads as a 0% conversion rate.
  if (loadFailed) return <div>{heading}<div className="card"><ErrorState title="Performance metrics could not be loaded" onRetry={load} /></div></div>;

  const shown = allStates ? states : states.slice(0, STATES_SHOWN);

  return (
    <div className="space-y-6">
      {heading}

      <section aria-label="Headline metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Conversion rate" icon={Award} value={total ? `${rate.toFixed(1)}%` : null}
          context={total ? `${subscribers} of ${total} leads · target ${CONVERSION_TARGET}%` : 'No leads yet'} />
        <StatCard label="Open opportunities" icon={Flame} value={open} context="Positive or in progress" to="/sales/leads?status=In%20Progress" />
        <StatCard label="Won deals" icon={Zap} value={subscribers} context="Leads who subscribed" to="/sales/leads?status=Subscriber" />
        <StatCard label="Value won" icon={Banknote} value={won ? inr(won.value) : null} loading={won === undefined}
          context={won === null ? 'Could not be loaded' : won ? `From ${won.paid} paid ${won.paid === 1 ? 'quotation' : 'quotations'}` : undefined}
          to="/sales/quotations?status=Paid" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
        {/* Pipeline overview */}
        <section className="card card-pad min-w-0" aria-labelledby="overview-h">
          <h2 id="overview-h" className="card-title">Pipeline overview</h2>
          <p className="mt-1 text-sm text-muted">Where your leads are right now</p>
          {stages.length > 0 ? (
            <ul className="mt-5 space-y-4">
              {stages.map(s => (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-2">{s.label}</span>
                    <span><b className="font-semibold tabular-nums text-ink">{s.n}</b> <span className="text-xs tabular-nums text-muted">· {pct(s.n, total)}%</span></span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${(s.n / widest) * 100}%`, background: STAGE_COLOR[s.key] || 'var(--faint)' }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Flame} title="No leads yet" description="Your pipeline appears once leads are assigned." />
          )}
          {stages.length > 0 && (
            <p className="mt-5 border-t border-rule pt-4 text-xs leading-relaxed text-muted">
              A lead sits in one stage at a time, so this is a snapshot, not a funnel.
            </p>
          )}
        </section>

        {/* State efficiency */}
        <section className="card min-w-0 overflow-hidden" aria-labelledby="states-h">
          <div className="p-5 sm:p-6">
            <h2 id="states-h" className="card-title">State efficiency</h2>
            <p className="mt-1 text-sm text-muted">Deals won against leads, by state</p>
          </div>
          {states.length > 0 ? (
            <>
              <div className="table-wrap relative border-t border-rule">
                <table className="data-table">
                  <thead>
                    <tr><th>State</th><th className="text-right">Won</th><th className="text-right">Leads</th><th className="min-w-[8rem]">Win rate</th></tr>
                  </thead>
                  <tbody>
                    {shown.map(s => (
                      <tr key={s.state}>
                        <td className="font-medium text-ink"><span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-faint" aria-hidden="true" />{s.state}</span></td>
                        <td className="text-right font-semibold tabular-nums text-ink">{s.won}</td>
                        <td className="text-right tabular-nums">{s.total}</td>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-track" aria-hidden="true">
                              <span className="block h-full rounded-full bg-accent" style={{ width: `${s.rate}%` }} />
                            </span>
                            <span className="text-xs font-semibold tabular-nums text-ink">{s.rate}%</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {states.length > STATES_SHOWN && (
                <div className="border-t border-rule px-5 py-3">
                  <Button variant="ghost" size="sm" onClick={() => setAllStates(v => !v)} aria-expanded={allStates}>
                    {allStates ? 'Show top 5 only' : `View all ${states.length} states`}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={MapPin} title="No regional data yet" description="None of your leads has a state on file." className="border-t border-rule" />
          )}
          {noState > 0 && (
            <div className="border-t border-rule px-5 py-4 sm:px-6">
              <DataNote>
                <b className="font-semibold text-ink-2">{noState} {noState === 1 ? 'lead has' : 'leads have'} no state</b> ({NO_STATE.toLowerCase()}), so
                {noState === 1 ? ' it is' : ' they are'} left out of this table rather than counted against a region.
              </DataNote>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
