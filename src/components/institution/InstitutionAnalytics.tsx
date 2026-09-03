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
        <div className="h-10 w-64 bg-rule rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-rule h-32 rounded-md w-full" />)}
        </div>
        <div className="h-64 bg-rule rounded-md" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Reading Students",
      value: analytics?.totalStudents || 0,
      icon: <Users size={22} />,
      bg: "bg-accent-soft",
      change: 'Active learners',
    },
    {
      label: "Total Interactions",
      value: analytics?.totalInteractions || 0,
      icon: <Activity size={22} />,
      bg: "bg-accent-soft",
      change: 'All time',
    },
    {
      label: "Star Reader",
      value: analytics?.starReader?.name || 'N/A',
      icon: <Award size={22} />,
      bg: "bg-caution-soft",
      change: `${analytics?.starReader?.interactions || 0} interactions`,
    },
    {
      label: "Average Interactions",
      value: analytics?.totalStudents ? Math.round((analytics.totalInteractions / analytics.totalStudents) * 10) / 10 : 0,
      icon: <TrendingUp size={22} />,
      bg: "bg-accent-soft",
      change: 'Per student',
    },
  ];

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest px-2.5 py-1 bg-accent-soft rounded-full border border-rule">
            Analytics
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">Student Engagement Analytics</h1>
        <p className="text-muted text-sm mt-1">Detailed view of how students are interacting with the digital library.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="bg-surface rounded-md border border-rule shadow-sm p-6 hover:shadow-lg hover:-translate-y-0.5 hover:border-rule transition-all group"
          >
            <div className="flex items-start justify-between mb-5">
              <div className={`h-11 w-11 rounded-md bg-accent-soft text-accent flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform`}>
                {c.icon}
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-surface-2 text-faint truncate max-w-[100px]">{c.change}</span>
            </div>
            <div className="text-2xl font-black text-ink tracking-tight truncate" title={String(c.value)}>{c.value}</div>
            <div className="text-xs font-semibold text-muted mt-1">{c.label}</div>
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
          className="bg-surface rounded-md border border-rule shadow-sm p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-accent-soft rounded-md">
              <Activity className="text-accent" size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Reading Timeline (Last 7 Days)</h2>
              <p className="text-xs text-muted">Daily student interactions</p>
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
          className="bg-surface rounded-md border border-rule shadow-sm p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-accent-soft rounded-md">
              <BookOpen className="text-accent" size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Most Read Content</h2>
              <p className="text-xs text-muted">Top 5 content pieces by interactions</p>
            </div>
          </div>
          
          {analytics?.topContent && analytics.topContent.length > 0 ? (
            <div className="space-y-4">
              {analytics.topContent.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-surface-2 rounded-md hover:bg-surface-2 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-rule flex items-center justify-center text-ink-2 font-bold text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{item.title}</div>
                      <div className="text-xs text-muted">{item.type}</div>
                    </div>
                  </div>
                  <div className="shrink-0 ml-3 flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-lg border border-rule shadow-sm">
                    <span className="font-bold text-sm text-ink-2">{item.reads}</span>
                    <span className="text-[10px] text-faint uppercase font-bold tracking-wider">Reads</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[200px] flex flex-col items-center justify-center text-faint">
              <BookOpen size={32} className="opacity-20 mb-3" />
              <p className="text-sm">No content data available yet.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
