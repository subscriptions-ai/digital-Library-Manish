import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6'];

interface DashboardChartsProps {
  stats: any;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs font-bold ring-1 ring-white/10">
        <div className="text-slate-400 mb-1">{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span>{p.name}:</span>
            <span>{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function DashboardCharts({ stats }: DashboardChartsProps) {
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Domain Distribution - Bar Chart */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[350px]">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-4">Content by Domain</h2>
          <div className="flex-1 w-full relative min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.domainsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} 
                  tickFormatter={(val) => val.length > 10 ? val.substring(0, 10) + '...' : val} 
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.domainsData?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Content Types - Pie Chart */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[350px]">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-4">Content Types</h2>
          <div className="flex-1 w-full relative min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.contentTypeCounts}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => percent > 0.05 ? `${name}` : ''}
                  labelLine={false}
                  stroke="none"
                >
                  {stats.contentTypeCounts?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Revenue Trends - Line Chart */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[350px]">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-4">Revenue Growth</h2>
          <div className="flex-1 w-full relative min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `₹${value/1000}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth - Area Chart */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[350px]">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-4">User Acquisition</h2>
          <div className="flex-1 w-full relative min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.userGrowthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="users" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
