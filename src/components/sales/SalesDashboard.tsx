import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CheckCircle2, Phone, Clock, ArrowRight, Sparkles, FileText, Hourglass, UserPlus, ClipboardList } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList } from 'recharts';
import { toast } from 'react-hot-toast';
import { isPast } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { EmptyState, ErrorState, Skeleton, buttonClass, PageHeader } from '../ui';
import {
  AttentionTile, AXIS_TICK, ChartTooltip, DataNote, NO_STATE, STAGE_COLOR, STAGE_ORDER, StatCard,
  formatStamp, interactionIcon, isQuiet, pct, stageLabel, timeAgo,
} from './salesUi';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const getJson = (url: string) => fetch(url, { headers: authHeaders() }).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

type Extras = {
  enquiries: number | null;          // subscription enquiries waiting (whole team)
  openQuotes: number | null;         // raised by this person, not paid or cancelled
  expiredQuotes: number | null;      // of those, past their valid-until date
  activity: any[] | null;            // latest interactions
};

export function SalesDashboard() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setExtras(null);
    try {
      setLeads(await getJson('/api/sales/my-leads'));
    } catch {
      setLoadFailed(true);
      toast.error('Could not load dashboard metrics', { id: 'sales-dash' });
      setLoading(false);
      return;
    }
    setLoading(false);

    // The rest of the page is useful without these, so each one fails on its
    // own — to a dash, never to a zero that reads as fact.
    const [enq, quotes, act] = await Promise.allSettled([
      getJson('/api/sales/pro-applications?status=Pending'),
      getJson('/api/my/quotations'),
      getJson('/api/sales/my-activity'),
    ]);
    const open = quotes.status === 'fulfilled'
      ? (quotes.value.quotations || []).filter((q: any) => !['Paid', 'Cancelled'].includes(q.status))
      : null;
    setExtras({
      enquiries: enq.status === 'fulfilled' ? enq.value.pending ?? 0 : null,
      openQuotes: open ? open.length : null,
      expiredQuotes: open ? open.filter((q: any) => q.expiresAt && isPast(new Date(q.expiresAt))).length : null,
      activity: act.status === 'fulfilled' ? act.value : null,
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = leads.length;
  const count = (status: string) => leads.filter(l => l.status === status).length;
  const subscribers = count('Subscriber'), positive = count('Positive'), inProgress = count('In Progress');
  const fresh = count('All');
  const quiet = useMemo(() => leads.filter(isQuiet).length, [leads]);
  const lastMonth = leads.filter(l => Date.now() - new Date(l.assignedAt || l.createdAt).getTime() < 30 * 864e5).length;

  // Status breakdown — only stages that have leads, in pipeline order.
  const statusData = useMemo(() => {
    const by: Record<string, number> = {};
    leads.forEach(l => { by[l.status || 'All'] = (by[l.status || 'All'] || 0) + 1; });
    return Object.keys(by)
      .sort((a, b) => (STAGE_ORDER.indexOf(a) < 0 ? 99 : STAGE_ORDER.indexOf(a)) - (STAGE_ORDER.indexOf(b) < 0 ? 99 : STAGE_ORDER.indexOf(b)))
      .map(s => ({ key: s, name: stageLabel(s), value: by[s], color: STAGE_COLOR[s] || 'var(--faint)' }));
  }, [leads]);

  // State distribution: real states by size; leads with none are counted and said so, not buried.
  const { stateData, noState, stateCount } = useMemo(() => {
    const by: Record<string, number> = {};
    let none = 0;
    leads.forEach(l => { const s = (l.state || '').trim(); if (s) by[s] = (by[s] || 0) + 1; else none++; });
    const all = Object.entries(by).map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { stateData: all.slice(0, 8), noState: none, stateCount: all.length };
  }, [leads]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  })();

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <div className="space-y-2"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-4 w-1/2" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[124px] rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[360px] rounded-xl" /><Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    );
  }

  // A failed load would otherwise show every count as 0, which reads as fact.
  if (loadFailed) return <ErrorState title="Your dashboard could not be loaded" onRetry={load} />;

  const recent = (extras?.activity || []).slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        className="mb-0"
        title={`${greeting}, ${profile?.displayName?.trim() || 'Executive'}`}
        description="Today's sales overview — what needs you first, and where your pipeline stands."
      />

      {/* Headline numbers */}
      <section aria-label="Lead totals" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard to="/sales/leads" label="Total Leads" value={total} icon={Users}
          context={total ? `${lastMonth} assigned in the last 30 days` : 'Nothing assigned yet'} />
        <StatCard to="/sales/leads?status=Subscriber" label="Subscribers" value={subscribers} icon={CheckCircle2}
          context={total ? `${pct(subscribers, total)}% of your leads` : 'No leads yet'} />
        <StatCard to="/sales/leads?status=Positive" label="Positive Contacts" value={positive} icon={Phone}
          context={total ? `${pct(positive, total)}% of your leads` : 'No leads yet'} />
        <StatCard to="/sales/leads?status=In%20Progress" label="In Progress" value={inProgress} icon={Clock}
          context={total ? `${pct(inProgress, total)}% of your leads` : 'No leads yet'} />
      </section>

      {/* What wants doing */}
      <section aria-labelledby="attention-h" className="space-y-3">
        <h2 id="attention-h" className="text-xs font-semibold uppercase tracking-wider text-muted">Needs attention</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AttentionTile to="/sales/leads?status=new" icon={UserPlus} label="New leads" count={fresh}
            context="Waiting for a first contact" />
          <AttentionTile to="/sales/leads?quiet=1" icon={Hourglass} label="Gone quiet" count={quiet}
            context="Positive or in progress, no activity for 7+ days" />
          <AttentionTile to="/sales/quotations?scope=open" icon={FileText} label="Open quotations" count={extras ? extras.openQuotes : null}
            context={extras?.expiredQuotes ? `${extras.expiredQuotes} past their valid-until date` : 'Raised, not yet paid'} />
          <AttentionTile to="/sales/pro-applications" icon={Sparkles} label="Enquiries waiting" count={extras ? extras.enquiries : null}
            context="Members asking for help to subscribe" />
        </div>
      </section>

      {/* Pipeline */}
      <section aria-labelledby="pipeline-h" className="space-y-3">
        <h2 id="pipeline-h" className="text-xs font-semibold uppercase tracking-wider text-muted">Pipeline overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status breakdown */}
          <div className="card card-pad flex flex-col min-w-0">
            <h3 className="card-title">Status breakdown</h3>
            <p className="mt-1 text-sm text-muted">Your leads by pipeline stage</p>
            {statusData.length > 0 ? (
              <div className="mt-4 flex flex-1 flex-col items-center gap-6 sm:flex-row">
                <div className="relative h-48 w-48 shrink-0" role="img"
                  aria-label={`Leads by status: ${statusData.map(d => `${d.name} ${d.value}, ${pct(d.value, total)} percent`).join('; ')}.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={84}
                        paddingAngle={statusData.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                        {statusData.map(d => <Cell key={d.key} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                    <span className="text-3xl font-bold leading-none tabular-nums text-ink">{total}</span>
                    <span className="mt-1 text-xs text-muted">Total leads</span>
                  </div>
                </div>
                <ul className="w-full min-w-0 flex-1 space-y-2.5">
                  {statusData.map(d => (
                    <li key={d.key} className="flex items-center gap-2.5 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-ink-2">{d.name}</span>
                      <span className="font-semibold tabular-nums text-ink">{d.value}</span>
                      <span className="w-10 text-right text-xs tabular-nums text-muted">{pct(d.value, total)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState icon={Users} title="No leads yet" description="Your status breakdown appears once leads are assigned." className="flex-1" />
            )}
          </div>

          {/* State distribution */}
          <div className="card card-pad flex flex-col min-w-0">
            <h3 className="card-title">State distribution</h3>
            <p className="mt-1 text-sm text-muted">
              {stateData.length > 0
                ? `Where your leads are — top ${stateData.length} of ${stateCount} ${stateCount === 1 ? 'state' : 'states'}`
                : 'Where your leads are'}
            </p>
            {stateData.length > 0 ? (
              <div className="mt-4 w-full" style={{ height: Math.max(160, stateData.length * 36 + 8) }}
                role="img" aria-label={`Leads by state: ${stateData.map(d => `${d.name} ${d.count}`).join(', ')}.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stateData} layout="vertical" margin={{ left: 0, right: 32, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={116} tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip />} />
                    <Bar dataKey="count" fill="var(--accent)" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
                      <LabelList dataKey="count" position="right" style={{ fill: 'var(--ink)', fontSize: 12, fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={Users} title="No state recorded" description="None of your leads has a state on file yet." className="flex-1" />
            )}
            {noState > 0 && (
              <div className="mt-auto pt-4">
                <DataNote>
                  <b className="font-semibold text-ink-2">{noState} {noState === 1 ? 'lead has' : 'leads have'} no state</b> ({NO_STATE.toLowerCase()}) and
                  {noState === 1 ? ' is' : ' are'} not in the bars above. Sign-ups from outside India and some enquiry forms do not capture one.
                </DataNote>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section aria-labelledby="recent-h" className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
          <div>
            <h2 id="recent-h" className="card-title">Recent activity</h2>
            <p className="mt-1 text-sm text-muted">Your latest notes, calls, emails and status changes</p>
          </div>
          <Link to="/sales/activity" className={buttonClass('outline', 'sm')}>View all <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {extras === null ? (
          <div className="space-y-3 border-t border-rule p-5" role="status" aria-label="Loading activity">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : extras.activity === null ? (
          <p className="border-t border-rule px-6 py-8 text-center text-sm text-muted">Recent activity could not be loaded.</p>
        ) : recent.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No activity yet" description="Notes, calls and emails you log on a lead will appear here." className="border-t border-rule" />
        ) : (
          <ul className="divide-y divide-rule border-t border-rule">
            {recent.map(a => {
              const { icon: Icon, tone } = interactionIcon(a.type);
              return (
                <li key={a.id}>
                  <Link to={`/sales/leads/${a.leadId}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none sm:px-6">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden="true"><Icon size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-ink">{a.lead?.name || 'Unknown lead'}</span>
                        {a.lead?.organization && <span className="truncate text-xs text-muted">{a.lead.organization}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-ink-2">{a.notes}</span>
                    </span>
                    <time dateTime={a.createdAt} title={formatStamp(a.createdAt)} className="shrink-0 pt-0.5 text-xs text-muted">{timeAgo(a.createdAt)}</time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
