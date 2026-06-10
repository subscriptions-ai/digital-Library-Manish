import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Activity, LayoutDashboard } from 'lucide-react';

export function TrafficAnalyticsChart() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const response = await fetch('/api/analytics/traffic', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
          const json = await response.json();
          setData(json);
        }
      } catch (err) {
        console.error('Failed to fetch traffic analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTraffic();
  }, []);

  if (loading) {
    return <div className="bg-white rounded-3xl border border-slate-100 p-6 h-[400px] animate-pulse" />;
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Line/Area Chart for Daily Visitors */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 lg:col-span-2">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="text-blue-500" size={20} />
              Daily Traffic
            </h2>
            <p className="text-sm text-slate-500">Unique visitor sessions over the last 30 days ({data.totalUniqueSessions} total)</p>
          </div>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.dailyData}>
              <defs>
                <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} 
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
                }}
              />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
              />
              <Area type="monotone" dataKey="uniqueSessions" name="Sessions" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVisits)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Pages List */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="text-emerald-500" size={20} />
            Top Pages
          </h2>
          <p className="text-sm text-slate-500">Most visited URLs</p>
        </div>
        <div className="space-y-4">
          {data.topPages.length > 0 ? data.topPages.map((page: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center group">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                  {idx + 1}
                </div>
                <div className="truncate">
                  <p className="text-sm font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors" title={page.path}>
                    {page.path === '/' ? '/home' : page.path}
                  </p>
                </div>
              </div>
              <div className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded shrink-0">
                {page.count}
              </div>
            </div>
          )) : (
            <p className="text-sm text-slate-500 text-center py-8">No traffic recorded yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
