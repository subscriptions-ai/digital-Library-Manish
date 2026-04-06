import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, BookOpen, Activity, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

export function InstitutionDashboardHome() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/institution/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!response.ok) throw new Error("Failed to load stats");
        const data = await response.json();
        setStats(data);
      } catch (err) {
        toast.error("Could not load internal statistics");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-200 h-28 rounded-2xl w-full" />)}
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Enrolled Students", value: stats?.studentCount || 0, icon: <Users size={24} className="text-blue-500" />, bg: "bg-blue-50" },
    { label: "Active Access Grants", value: stats?.activeGrants || 0, icon: <BookOpen size={24} className="text-emerald-500" />, bg: "bg-emerald-50" },
    { label: "Content Interactions", value: stats?.totalInteractions || 0, icon: <Activity size={24} className="text-amber-500" />, bg: "bg-amber-50" },
    { label: "Avg. Learning Time", value: stats?.avgLearningTime || '0h 0m', icon: <Clock size={24} className="text-purple-500" />, bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Welcome, {profile?.organization || 'Institution Head'}</h1>
        <p className="text-slate-500 text-sm mt-1">Here is a high-level overview of your students' activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((c, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4"
          >
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${c.bg}`}>
              {c.icon}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{c.label}</div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">{c.value}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Student List Preview */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800">Recent Student Activity</h2>
        </div>
        {stats?.recentActivity?.length > 0 ? (
          <div className="space-y-4">
            {stats.recentActivity.map((act: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{act.user.displayName || act.user.email}</div>
                  <div className="text-xs text-slate-500">Accessed: {act.content?.title || 'External Module'}</div>
                </div>
                <div className="text-slate-400 text-xs">
                  {new Date(act.accessedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Activity className="mx-auto mb-3 opacity-20" size={32} />
            <p>No recent student activity registered.</p>
          </div>
        )}
      </div>
    </div>
  );
}
