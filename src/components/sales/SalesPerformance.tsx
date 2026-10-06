import React, { useEffect, useState } from 'react';
import { Award, Flame, Zap, MapPin } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { toast } from 'react-hot-toast';
import { EmptyState, ErrorState, MetricCard, Skeleton } from '../ui';

export function SalesPerformance() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch('/api/sales/my-leads', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      setLeads(await res.json());
    } catch {
      setLoadFailed(true);
      toast.error('Failed to load performance metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading performance">
        <Skeleton className="h-8 w-1/4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // Without this a failed load reads as a 0.0% conversion rate.
  if (loadFailed) {
    return <ErrorState title="Performance metrics could not be loaded" onRetry={fetchLeads} />;
  }

  // Calculations
  const totalLeads = leads.length;
  const subscribers = leads.filter(l => l.status === 'Subscriber').length;
  const conversionRate = totalLeads > 0 ? ((subscribers / totalLeads) * 100).toFixed(1) : '0.0';

  // Pipeline conversion funnel data
  const funnelStages = ['All', 'Positive', 'In Progress', 'Subscriber'];
  const funnelData = funnelStages.map(stage => ({
    name: stage,
    count: stage === 'All' ? leads.length : leads.filter(l => l.status === stage).length
  }));

  // State conversion breakdown
  const stateStats = leads.reduce((acc: any, lead) => {
    const sName = lead.state || 'Unknown';
    if (!acc[sName]) {
      acc[sName] = { total: 0, subs: 0 };
    }
    acc[sName].total += 1;
    if (lead.status === 'Subscriber') {
      acc[sName].subs += 1;
    }
    return acc;
  }, {});

  const sortedStateStats = Object.keys(stateStats)
    .map(state => {
      const { total, subs } = stateStats[state];
      const rate = total > 0 ? ((subs / total) * 100).toFixed(1) : '0.0';
      return { state, total, subs, rate: parseFloat(rate) };
    })
    .sort((a, b) => b.subs - a.subs || b.total - a.total);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Title */}
      <div>
        <h1 className="type-page-title text-ink">Performance Metrics</h1>
        <p className="text-muted text-sm mt-1">Track your conversion targets and performance across regions.</p>
      </div>

      {/* Target Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Conversion Rate" value={`${conversionRate}%`} context="Target is 30% conversion" icon={Award} />
        <MetricCard
          label="Active Pipeline"
          value={`${leads.filter(l => ['Positive', 'In Progress'].includes(l.status)).length} Leads`}
          context="Currently in discussion"
          icon={Flame}
        />
        <MetricCard label="Won Subscriptions" value={`${subscribers} Leads`} context="Successfully closed deals" icon={Zap} />
      </div>

      {/* Conversion Funnel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel Graph */}
        <div className="card card-pad lg:col-span-2 flex flex-col justify-between min-w-0">
          <div className="mb-4">
            <h2 className="card-title">Conversion Funnel</h2>
            <p className="text-sm text-muted mt-1">Visual progression of leads from discovery to conversion</p>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ left: -20, right: 10, top: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [`${value} Leads`, 'Volume']} />
                <Bar dataKey="count" fill="#4f46e5" radius={[8, 8, 0, 0]} barSize={40}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 3 ? '#10b981' : '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* State Performance Breakdown */}
        <div className="card card-pad flex flex-col">
          <div className="mb-4">
            <h2 className="card-title">State Efficiency</h2>
            <p className="text-sm text-muted mt-1">Closed deals per state region</p>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[250px] pr-1">
            {sortedStateStats.length > 0 ? (
              <ul className="divide-y divide-rule">
                {sortedStateStats.map(({ state, total, subs, rate }) => (
                  <li key={state} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-ink text-sm truncate flex items-center gap-1">
                        <MapPin size={12} className="text-faint shrink-0" aria-hidden="true" />
                        {state}
                      </div>
                      <div className="text-xs text-muted mt-0.5">{subs} closed of {total} total</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-ink text-sm tabular-nums">{rate}%</div>
                      <div className="text-[11px] text-muted mt-0.5">Win rate</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={MapPin} title="No regional data available" className="py-8" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
