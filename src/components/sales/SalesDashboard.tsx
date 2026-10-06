import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CheckCircle2, Phone, Clock, ArrowRight, MapPin, Building2, Calendar } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { EmptyState, ErrorState, MetricCard, Skeleton, buttonClass } from '../ui';
import { LeadStatusBadge } from './SalesLeadTable';

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
  const [loadFailed, setLoadFailed] = useState(false);
  const navigate = useNavigate();

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
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      setLeads(await res.json());
    } catch (error) {
      setLoadFailed(true);
      toast.error('Could not load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  // A failed load would otherwise show every count as 0, which reads as fact.
  if (loadFailed) {
    return <ErrorState title="Your dashboard could not be loaded" onRetry={fetchLeads} />;
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
    <div className="space-y-6 sm:space-y-8">
      {/* Top Greeting */}
      <div>
        <h1 className="type-page-title text-ink">
          {getGreeting()}, {profile?.displayName || 'Executive'}
        </h1>
        <p className="text-muted mt-1 text-sm">
          Here is your sales pipeline overview. Track your performance and upcoming actions.
        </p>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Leads" value={total} icon={Users} />
        <MetricCard label="Subscribers" value={subscribers} icon={CheckCircle2} />
        <MetricCard label="Positive Contacts" value={positive} icon={Phone} />
        <MetricCard label="In Progress" value={inProgress} icon={Clock} />
      </div>

      {/* Main Charts & Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart: Status Breakdown */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="mb-4">
            <h2 className="card-title">Status Breakdown</h2>
            <p className="text-sm text-muted mt-1">Distribution of your leads by pipeline stage</p>
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
              <span className="text-muted text-sm">No data available</span>
            )}
            {pieData.length > 0 && (
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-ink tabular-nums">{total}</span>
                <span className="text-xs text-muted font-medium">Leads</span>
              </div>
            )}
          </div>

          {pieData.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-rule">
              {pieData.map((item, idx) => (
                <li key={item.name} className="flex items-center gap-2 text-xs min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STAGE_COLORS[item.name] || CHART_COLORS[idx] }} aria-hidden="true"></span>
                  <span className="text-ink-2 truncate">{item.name}</span>
                  <span className="text-muted font-semibold ml-auto tabular-nums">{item.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bar Chart: State Generation */}
        <div className="card card-pad flex flex-col justify-between lg:col-span-2 min-w-0">
          <div className="mb-4">
            <h2 className="card-title">State Distribution</h2>
            <p className="text-sm text-muted mt-1">Leads generated across Indian States (Top 8)</p>
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
              <div className="h-full flex items-center justify-center text-muted text-sm">No data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Leads */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
          <div>
            <h2 className="card-title">Recently Assigned Leads</h2>
            <p className="text-sm text-muted mt-1">Get in touch with your newest leads immediately</p>
          </div>
          <button
            onClick={() => navigate('/sales/leads')}
            className={buttonClass('outline', 'sm')}
          >
            Manage All <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>

        {recentLeads.length > 0 ? (
          <div className="table-wrap border-t border-rule">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead / Organization</th>
                  <th>State</th>
                  <th>Source</th>
                  <th>Assigned Date</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="font-semibold text-ink">{lead.name}</div>
                      {lead.organization && (
                        <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                          <Building2 size={12} className="text-faint" aria-hidden="true" /> {lead.organization}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {lead.state ? (
                        <span className="inline-flex items-center gap-1 text-ink-2">
                          <MapPin size={12} className="text-faint" aria-hidden="true" /> {lead.state}
                        </span>
                      ) : (
                        <span className="text-muted text-xs">N/A</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="badge badge-neutral">{lead.source}</span>
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={14} className="text-faint" aria-hidden="true" />
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/sales/leads/${lead.id}`)}
                        className={buttonClass('ghost', 'sm', 'text-accent')}
                        aria-label={`Details for ${lead.name}`}
                      >
                        Details <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No leads assigned to you yet" description="New leads will appear here as soon as they are assigned." className="border-t border-rule" />
        )}
      </div>
    </div>
  );
}
