import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Activity, TrendingUp, Award, Clock, BookOpen, ChevronRight, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

export function InstitutionAnalytics() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const res = await fetch('/api/institution/analytics', { headers });
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data);
        } else {
          toast.error('Failed to load analytics');
        }
      } catch (err) {
        toast.error('Could not load analytics data');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-200 h-32 rounded-3xl w-full" />)}
        </div>
        <div className="h-64 bg-slate-200 rounded-3xl" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Reading Students",
      value: analytics?.totalStudents || 0,
      icon: <Users size={22} />,
      gradient: "from-blue-500 to-blue-600",
      bg: "bg-blue-50",
      change: 'Active learners',
    },
    {
      label: "Total Interactions",
      value: analytics?.totalInteractions || 0,
      icon: <Activity size={22} />,
      gradient: "from-purple-500 to-violet-600",
      bg: "bg-purple-50",
      change: 'All time',
    },
    {
      label: "Star Reader",
      value: analytics?.starReader?.name || 'N/A',
      icon: <Award size={22} />,
      gradient: "from-amber-400 to-orange-500",
      bg: "bg-amber-50",
      change: `${analytics?.starReader?.interactions || 0} interactions`,
    },
    {
      label: "Average Interactions",
      value: analytics?.totalStudents ? Math.round((analytics.totalInteractions / analytics.totalStudents) * 10) / 10 : 0,
      icon: <TrendingUp size={22} />,
      gradient: "from-emerald-500 to-teal-600",
      bg: "bg-emerald-50",
      change: 'Per student',
    },
  ];

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest px-2.5 py-1 bg-indigo-50 rounded-full border border-indigo-100">
            Analytics
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Student Engagement Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Detailed view of how students are interacting with the digital library.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-200 transition-all group"
          >
            <div className="flex items-start justify-between mb-5">
              <div className={`h-11 w-11 rounded-2xl bg-gradient-to-br ${c.gradient} flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform`}>
                {c.icon}
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-50 text-slate-400 truncate max-w-[100px]">{c.change}</span>
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight truncate" title={String(c.value)}>{c.value}</div>
            <div className="text-xs font-semibold text-slate-500 mt-1">{c.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Timeline Chart */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-indigo-50 rounded-xl">
              <Activity className="text-indigo-600" size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Reading Timeline (Last 7 Days)</h2>
              <p className="text-xs text-slate-500">Daily student interactions</p>
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics?.readingTimeline || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorInteractions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area type="monotone" dataKey="interactions" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorInteractions)" activeDot={{ r: 6, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Most Read Content */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-emerald-50 rounded-xl">
              <BookOpen className="text-emerald-600" size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Most Read Content</h2>
              <p className="text-xs text-slate-500">Top 5 content pieces by interactions</p>
            </div>
          </div>
          
          {analytics?.topContent && analytics.topContent.length > 0 ? (
            <div className="space-y-4">
              {analytics.topContent.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 text-sm truncate">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.type}</div>
                    </div>
                  </div>
                  <div className="shrink-0 ml-3 flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <span className="font-bold text-sm text-slate-700">{item.reads}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Reads</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[200px] flex flex-col items-center justify-center text-slate-400">
              <BookOpen size={32} className="opacity-20 mb-3" />
              <p className="text-sm">No content data available yet.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
