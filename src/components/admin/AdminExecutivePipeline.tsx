import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, MapPin, Building2, Mail, Phone, Clock, Filter, Award, Users, CheckCircle2, TrendingUp, Zap, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const PIPELINE_STAGES = ['All', 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];

const STAGE_META: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  'All':          { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-200', hex: '#64748b' },
  'Positive':     { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',  hex: '#3b82f6' },
  'No Response':  { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200', hex: '#f59e0b' },
  'Subscriber':   { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hex: '#10b981' },
  'In Progress':  { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200', hex: '#a855f7' },
  'Negative':     { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200',   hex: '#ef4444' },
  'Repeated':     { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200', hex: '#f97316' },
};

export function AdminExecutivePipeline() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<any[]>([]);
  const [executive, setExecutive] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeStatus, setActiveStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamRes, leadsRes] = await Promise.all([
        fetch('/api/admin/sales-team', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch('/api/admin/leads',       { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
      ]);
      if (teamRes.ok) {
        const team = await teamRes.json();
        setExecutive(team.find((t: any) => t.id === id) || null);
      }
      if (leadsRes.ok) {
        const allLeads = await leadsRes.json();
        setLeads(allLeads.filter((l: any) => l.assignedToId === id));
      }
    } catch { toast.error('Failed to load pipeline data'); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6 max-w-7xl mx-auto">
        <div className="h-8 bg-slate-100 rounded w-1/3" />
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}</div>
        <div className="h-64 bg-slate-100 rounded-3xl" />
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────
  const total        = leads.length;
  const subscribers  = leads.filter(l => l.status === 'Subscriber').length;
  const positive     = leads.filter(l => l.status === 'Positive').length;
  const noResponse   = leads.filter(l => l.status === 'No Response').length;
  const inProgress   = leads.filter(l => l.status === 'In Progress').length;
  const negative     = leads.filter(l => l.status === 'Negative').length;
  const convRate     = total > 0 ? ((subscribers / total) * 100).toFixed(1) : '0.0';

  const uniqueStates   = Array.from(new Set(leads.map(l => l.state).filter(Boolean))).sort() as string[];
  const uniqueSources  = Array.from(new Set(leads.map(l => l.source).filter(Boolean))).sort() as string[];

  const getStatusCount = (s: string) => s === 'All' ? total : leads.filter(l => l.status === s).length;

  const filteredLeads = leads.filter(lead => {
    if (activeStatus !== 'All' && lead.status !== activeStatus) return false;
    if (stateFilter  !== 'All' && lead.state  !== stateFilter)  return false;
    if (sourceFilter !== 'All' && lead.source !== sourceFilter)  return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !lead.name?.toLowerCase().includes(q) &&
        !lead.email?.toLowerCase().includes(q) &&
        !lead.organization?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // Charts
  const pieData = PIPELINE_STAGES.filter(s => s !== 'All').map(s => ({
    name: s, value: leads.filter(l => l.status === s).length
  })).filter(d => d.value > 0);

  const barData = Object.entries(
    leads.reduce((acc: any, l) => { const st = l.state || 'Unknown'; acc[st] = (acc[st] || 0) + 1; return acc; }, {})
  ).map(([name, count]) => ({ name, count })).sort((a: any, b: any) => b.count - a.count).slice(0, 8) as any[];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/sales-team')}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-slate-900">
            {executive?.displayName || 'Executive'}'s Pipeline
          </h1>
          <p className="text-sm text-slate-500 font-semibold mt-0.5">
            Deep-dive into this executive's lead progression and conversion metrics.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2">
          <Mail size={14} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-600">{executive?.email || '—'}</span>
        </div>
      </div>

      {/* ── KPI Stats ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Conversion Rate — hero card */}
        <div className="col-span-2 md:col-span-1 lg:col-span-2 bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 rounded-2xl text-white shadow-md shadow-indigo-600/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-100">Conv. Rate</p>
            <h3 className="text-3xl font-black mt-0.5">{convRate}%</h3>
            <p className="text-xs text-indigo-100/80 font-semibold mt-1">{subscribers} of {total} converted</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
            <Award size={22} />
          </div>
        </div>

        {[
          { label: 'Total Leads',  value: total,       icon: <Users size={18} />,        bg: 'bg-white',          iconBg: 'bg-slate-100 text-slate-600' },
          { label: 'Subscribers',  value: subscribers, icon: <CheckCircle2 size={18} />, bg: 'bg-emerald-50/60',  iconBg: 'bg-emerald-100 text-emerald-600' },
          { label: 'Positive',     value: positive,    icon: <TrendingUp size={18} />,   bg: 'bg-blue-50/60',     iconBg: 'bg-blue-100 text-blue-600' },
          { label: 'In Progress',  value: inProgress,  icon: <Zap size={18} />,          bg: 'bg-purple-50/60',   iconBg: 'bg-purple-100 text-purple-600' },
          { label: 'No Response',  value: noResponse,  icon: <AlertCircle size={18} />,  bg: 'bg-amber-50/60',    iconBg: 'bg-amber-100 text-amber-600' },
        ].map(({ label, value, icon, bg, iconBg }) => (
          <div key={label} className={`${bg} border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center justify-between`}>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5">{value}</h3>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
          </div>
        ))}
      </div>

      {/* ── Status Pills ───────────────────────────────── */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100">
        {PIPELINE_STAGES.map(stage => {
          const count = getStatusCount(stage);
          const isActive = activeStatus === stage;
          return (
            <button
              key={stage}
              onClick={() => setActiveStatus(stage)}
              className={`flex items-center gap-2 py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all border ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {stage}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${isActive ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Main Layout: Table + Charts ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

        {/* Table (2/3 width) */}
        <div className="xl:col-span-2 space-y-4">
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
            <div className="relative flex-1 w-full">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email or organization..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
              />
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shrink-0">
              <MapPin size={14} className="text-slate-400" />
              <select
                value={stateFilter}
                onChange={e => setStateFilter(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="All">All States</option>
                {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shrink-0">
              <Filter size={14} className="text-slate-400" />
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="All">All Sources</option>
                {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {filteredLeads.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      <th className="py-3.5 px-5">Lead / Organization</th>
                      <th className="py-3.5 px-4">State</th>
                      <th className="py-3.5 px-4 text-center">Contact</th>
                      <th className="py-3.5 px-4">Source</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Assigned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredLeads.map(lead => {
                      const meta = STAGE_META[lead.status] || STAGE_META['All'];
                      return (
                        <tr key={lead.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="font-bold text-slate-800">{lead.name}</div>
                            {lead.organization && (
                              <div className="text-xs text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                                <Building2 size={11} className="text-slate-400 shrink-0" />
                                <span className="truncate max-w-[180px]">{lead.organization}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {lead.state
                              ? <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase"><MapPin size={9} className="text-indigo-500" />{lead.state}</span>
                              : <span className="text-slate-400 text-xs italic">N/A</span>
                            }
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <a href={`mailto:${lead.email}`} className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all" title={lead.email}>
                                <Mail size={13} />
                              </a>
                              {lead.phone && (
                                <a href={`tel:${lead.phone}`} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all" title={lead.phone}>
                                  <Phone size={13} />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-extrabold text-[10px] uppercase border border-indigo-100">{lead.source}</span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${meta.bg} ${meta.text} ${meta.border}`}>
                              {lead.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                              <Clock size={11} className="text-slate-400" />
                              {new Date(lead.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-14">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Users size={20} />
                </div>
                <h4 className="font-extrabold text-slate-700 text-sm">No Matching Leads</h4>
                <p className="text-slate-400 text-xs mt-1">Try adjusting your filters above.</p>
              </div>
            )}
          </div>
          <p className="text-xs font-bold text-slate-400 text-right">
            Showing {filteredLeads.length} of {total} leads
          </p>
        </div>

        {/* Charts (1/3 width) */}
        <div className="space-y-5">
          {/* Donut: Status breakdown */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-extrabold text-slate-800 text-sm mb-1">Status Breakdown</h3>
            <p className="text-[10px] text-slate-400 font-semibold mb-4">Pipeline distribution</p>
            <div className="h-48 relative flex items-center justify-center">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={70} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={STAGE_META[entry.name]?.hex || '#64748b'} />)}
                    </Pie>
                    <Tooltip formatter={v => [`${v} leads`, 'Count']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <span className="text-slate-400 text-xs">No data</span>}
              {pieData.length > 0 && (
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-black text-slate-800">{total}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Total</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-3 pt-3 border-t border-slate-100">
              {pieData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAGE_META[item.name]?.hex || '#64748b' }} />
                  <span className="text-slate-600 font-medium truncate">{item.name}</span>
                  <span className="text-slate-400 font-bold ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar: State distribution */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-extrabold text-slate-800 text-sm mb-1">State Distribution</h3>
            <p className="text-[10px] text-slate-400 font-semibold mb-4">Top states by lead volume</p>
            <div className="h-52">
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 5, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={90} tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} formatter={v => [`${v} leads`, 'Volume']} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={12}>
                      {barData.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? '#4f46e5' : '#818cf8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-slate-400 text-xs font-semibold">No state data</div>}
            </div>
          </div>

          {/* Summary stats */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-extrabold text-slate-800 text-sm">Executive Summary</h3>
            {[
              { label: 'Negative Leads',  value: negative, color: 'text-rose-600' },
              { label: 'Repeated Leads',  value: leads.filter(l => l.status === 'Repeated').length, color: 'text-orange-600' },
              { label: 'Total Interactions', value: executive?._count?.leadInteractions ?? '—', color: 'text-indigo-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-xs font-bold text-slate-500">{label}</span>
                <span className={`text-sm font-black ${color}`}>{value}</span>
              </div>
            ))}
            {executive?.lastActiveAt && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-500">Last Active</span>
                <span className="text-xs font-black text-slate-700">{new Date(executive.lastActiveAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
