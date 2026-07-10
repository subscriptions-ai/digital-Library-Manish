import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CheckCircle2, Phone, Clock, ArrowRight, MapPin, Building2, Calendar } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const STAGE_COLORS: Record<string, string> = {
  'All': '#64748b',
  'Positive': '#3b82f6',
  'No Response': '#f59e0b',
  'Subscriber': '#10b981',
  'In Progress': '#a855f7',
  'Negative': '#ef4444',
  'Repeated': '#f97316',
};

const CHART_COLORS = ['#64748b', '#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#f97316'];

export function SalesDashboard() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/my-leads', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      setLeads(await res.json());
    } catch (error) {
      toast.error('Could not load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-slate-100 rounded w-1/3"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl"></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-slate-100 rounded-2xl"></div>
          <div className="h-64 bg-slate-100 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  // Calculate statistics
  const total = leads.length;
  const subscribers = leads.filter(l => l.status === 'Subscriber').length;
  const positive = leads.filter(l => l.status === 'Positive').length;
  const inProgress = leads.filter(l => l.status === 'In Progress').length;

  // Status breakdown data for Pie Chart
  const statusCounts = leads.reduce((acc: any, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(statusCounts).map(status => ({
    name: status,
    value: statusCounts[status],
  })).filter(item => item.value > 0);

  // State distribution data for Bar Chart
  const stateCounts = leads.reduce((acc: any, lead) => {
    const stateName = lead.state || 'Unknown';
    acc[stateName] = (acc[stateName] || 0) + 1;
    return acc;
  }, {});

  const barData = Object.keys(stateCounts)
    .map(state => ({
      name: state,
      count: stateCounts[state],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8); // Top 8 states

  // Recent 5 leads
  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="space-y-8">
      {/* Top Greeting */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          {getGreeting()}, {profile?.displayName || 'Executive'} 👋
        </h1>
        <p className="text-slate-500 mt-1 text-sm font-semibold">
          Here is your sales pipeline overview. Track your performance and upcoming actions.
        </p>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Leads</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{total}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Subscribers</p>
            <h3 className="text-3xl font-black text-emerald-950 mt-1">{subscribers}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Positive Contacts</p>
            <h3 className="text-3xl font-black text-blue-950 mt-1">{positive}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <Phone size={22} />
          </div>
        </div>

        <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-purple-500 uppercase tracking-wider">In Progress</p>
            <h3 className="text-3xl font-black text-purple-950 mt-1">{inProgress}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center">
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* Main Charts & Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart: Status Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-slate-800 text-base mb-1">Status Breakdown</h3>
            <p className="text-xs text-slate-400 font-semibold mb-6">Distribution of your leads by pipeline stage</p>
          </div>
          
          <div className="h-56 relative flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} Leads`, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-slate-400 text-xs font-semibold">No data available</span>
            )}
            {pieData.length > 0 && (
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-slate-800">{total}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Leads</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STAGE_COLORS[item.name] || CHART_COLORS[idx] }}></span>
                <span className="text-slate-600 font-medium truncate">{item.name}</span>
                <span className="text-slate-400 font-bold ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart: State Generation */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between lg:col-span-2">
          <div>
            <h3 className="font-extrabold text-slate-800 text-base mb-1">State Distribution</h3>
            <p className="text-xs text-slate-400 font-semibold mb-6">Leads generated across Indian States (Top 8)</p>
          </div>

          <div className="h-72">
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [`${value} Leads`, 'Volume']} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[0, 8, 8, 0]} barSize={16}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#818cf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-semibold">No data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Leads */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-extrabold text-slate-800 text-base mb-1">Recently Assigned Leads</h3>
            <p className="text-xs text-slate-400 font-semibold">Get in touch with your newest leads immediately</p>
          </div>
          <button 
            onClick={() => navigate('/sales/leads')}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 py-1.5 px-3 rounded-lg"
          >
            Manage All <ArrowRight size={14} />
          </button>
        </div>

        {recentLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase">
                  <th className="pb-3 pr-4 font-extrabold">Lead / Organization</th>
                  <th className="pb-3 px-4 font-extrabold">State</th>
                  <th className="pb-3 px-4 font-extrabold">Source</th>
                  <th className="pb-3 px-4 font-extrabold">Assigned Date</th>
                  <th className="pb-3 px-4 font-extrabold">Status</th>
                  <th className="pb-3 pl-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-4 pr-4">
                      <div className="font-bold text-slate-800">{lead.name}</div>
                      {lead.organization && (
                        <div className="text-xs text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                          <Building2 size={12} className="text-slate-400" /> {lead.organization}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      {lead.state ? (
                        <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                          <MapPin size={10} className="text-indigo-500" /> {lead.state}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-100 uppercase">{lead.source}</span>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap font-medium text-slate-500 flex items-center gap-1.5 mt-2.5">
                      <Calendar size={13} className="text-slate-400" />
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span 
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border"
                        style={{
                          backgroundColor: `${STAGE_COLORS[lead.status]}22`,
                          borderColor: STAGE_COLORS[lead.status],
                          color: STAGE_COLORS[lead.status],
                        }}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-4 pl-4 text-right">
                      <button 
                        onClick={() => navigate(`/sales/leads/${lead.id}`)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-auto"
                      >
                        Details <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 text-sm font-semibold">
            No leads assigned to you yet.
          </div>
        )}
      </div>
    </div>
  );
}
