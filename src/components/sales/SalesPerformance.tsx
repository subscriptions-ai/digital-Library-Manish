import React, { useEffect, useState } from 'react';
import { Award, Flame, Zap, MapPin, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { toast } from 'react-hot-toast';

export function SalesPerformance() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/my-leads', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      setLeads(await res.json());
    } catch {
      toast.error('Failed to load performance metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-100 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl"></div>)}
        </div>
        <div className="h-64 bg-slate-100 rounded-2xl"></div>
      </div>
    );
  }

  // Calculations
  const totalLeads = leads.length;
  const subscribers = leads.filter(l => l.status === 'Subscriber').length;
  const conversionRate = totalLeads > 0 ? ((subscribers / totalLeads) * 100).toFixed(1) : '0.0';

  // Pipeline conversion funnel data
  const funnelStages = ['All', 'Positive', 'In Progress', 'Subscriber'];
  const funnelData = funnelStages.map(stage => ({
    name: stage,
    count: leads.filter(l => l.status === stage).length
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
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">Performance Metrics</h1>
        <p className="text-slate-500 text-sm font-semibold mt-1">Track your conversion targets and performance across regions.</p>
      </div>

      {/* Target Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-3xl text-white shadow-md shadow-indigo-600/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-100">Conversion Rate</span>
            <h3 className="text-3xl font-black mt-1">{conversionRate}%</h3>
            <p className="text-xs text-indigo-100/80 font-medium mt-1">Target is 30% conversion</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
            <Award size={22} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Pipeline</span>
            <h3 className="text-3xl font-black text-slate-800 mt-1">{leads.filter(l => ['Positive', 'In Progress'].includes(l.status)).length} Leads</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">Currently in discussion</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
            <Flame size={22} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Won Subscriptions</span>
            <h3 className="text-3xl font-black text-slate-800 mt-1">{subscribers} Leads</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">Successfully closed deals</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
            <Zap size={22} />
          </div>
        </div>
      </div>

      {/* Conversion Funnel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel Graph */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-slate-800 text-base mb-1">Conversion Funnel</h3>
            <p className="text-xs text-slate-400 font-semibold mb-6">Visual progression of leads from discovery to conversion</p>
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
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
          <div>
            <h3 className="font-extrabold text-slate-800 text-base mb-1">State Efficiency</h3>
            <p className="text-xs text-slate-400 font-semibold mb-6">Closed deals per state region</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 max-h-[250px] pr-1">
            {sortedStateStats.length > 0 ? (
              sortedStateStats.map(({ state, total, subs, rate }) => (
                <div key={state} className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-700 text-xs truncate flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400" />
                      {state}
                    </div>
                    <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{subs} closed of {total} total</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-slate-800 text-xs">{rate}%</div>
                    <div className="text-[9px] font-bold text-emerald-500 mt-0.5 uppercase flex items-center gap-0.5 justify-end">
                      <CheckCircle2 size={10} /> Win Rate
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">No regional data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
