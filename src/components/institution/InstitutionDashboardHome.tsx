import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, BookOpen, Activity, Clock, CreditCard, Calendar,
  CheckCircle, AlertTriangle, Package, ChevronRight, TrendingUp,
  Sparkles, ArrowUpRight, Zap
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';

export function InstitutionDashboardHome() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const institutionName = profile?.organization || profile?.displayName || 'Institution';

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const [statsRes, subsRes] = await Promise.allSettled([
          fetch('/api/institution/stats', { headers }),
          fetch('/api/institution/subscriptions', { headers }),
        ]);
        if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
          setStats(await statsRes.value.json());
        }
        if (subsRes.status === 'fulfilled' && subsRes.value.ok) {
          const data = await subsRes.value.json();
          setSubs(Array.isArray(data) ? data : []);
        }
      } catch {
        toast.error('Could not load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-200 h-32 rounded-3xl w-full" />)}
        </div>
        <div className="h-24 bg-slate-200 rounded-3xl" />
        <div className="h-64 bg-slate-200 rounded-3xl" />
      </div>
    );
  }

  const activeSubs = subs.filter(s => s.status === 'Active');
  const expiringSoon = activeSubs.filter(s => {
    const daysLeft = Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000);
    return daysLeft <= 30 && daysLeft > 0;
  });

  const statCards = [
    {
      label: "Enrolled Students",
      value: stats?.studentCount ?? 0,
      icon: <Users size={22} />,
      gradient: "from-blue-500 to-blue-600",
      bg: "bg-blue-50",
      change: '+3 this month',
      positive: true,
    },
    {
      label: "Active Access Grants",
      value: stats?.activeGrants ?? 0,
      icon: <BookOpen size={22} />,
      gradient: "from-emerald-500 to-teal-600",
      bg: "bg-emerald-50",
      change: `${activeSubs.length} plan(s)`,
      positive: true,
    },
    {
      label: "Content Interactions",
      value: stats?.totalInteractions ?? 0,
      icon: <Activity size={22} />,
      gradient: "from-amber-400 to-orange-500",
      bg: "bg-amber-50",
      change: 'All time',
      positive: null,
    },
    {
      label: "Avg. Learning Time",
      value: stats?.avgLearningTime ?? '0h 0m',
      icon: <Clock size={22} />,
      gradient: "from-purple-500 to-violet-600",
      bg: "bg-purple-50",
      change: 'Per student',
      positive: null,
    },
  ];

  return (
    <div className="space-y-8 pb-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest px-2.5 py-1 bg-indigo-50 rounded-full border border-indigo-100">
              Institution Dashboard
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{institutionName}</h1>
          <p className="text-slate-500 text-sm mt-1">Here is a real-time overview of your institution's activity.</p>
        </div>
        <Link to="/institution/library"
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-2xl transition-all shadow-md shadow-indigo-200 hover:shadow-indigo-300/50 group"
        >
          <Sparkles size={15} /> Browse Library <ArrowUpRight size={15} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

      {/* Expiry Alert */}
      {expiringSoon.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-4"
        >
          <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-amber-600" size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-amber-900 text-sm">
              {expiringSoon.length} subscription{expiringSoon.length > 1 ? 's' : ''} expiring within 30 days
            </div>
            <div className="text-amber-700 text-xs mt-0.5">
              {expiringSoon.map(s => s.planName || s.domainName).join(', ')} — Contact your STM subscription manager to renew access.
            </div>
          </div>
          <div className="text-xs font-bold text-amber-700 shrink-0 hidden sm:block">
            Action Required
          </div>
        </motion.div>
      )}

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
              {c.positive !== null && (
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${c.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                  <TrendingUp size={10} /> {c.change}
                </span>
              )}
              {c.positive === null && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-50 text-slate-400">{c.change}</span>
              )}
            </div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{c.value}</div>
            <div className="text-xs font-semibold text-slate-500 mt-1">{c.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Quick Action: Content Library Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
      >
        <Link to="/institution/library"
          className="flex items-center gap-5 p-6 bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-700 text-white rounded-3xl shadow-xl shadow-indigo-200/60 hover:shadow-2xl hover:shadow-indigo-300/50 transition-all hover:-translate-y-0.5 group"
        >
          <div className="h-14 w-14 bg-white/15 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-white/25 transition-colors">
            <BookOpen size={26} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-lg">Browse Your Content Library</div>
            <div className="text-indigo-200 text-sm mt-0.5">Read journals, books, periodicals and more included in your subscription plan.</div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-xl text-sm font-bold">
              <Zap size={13} /> Open Library
            </span>
            <ChevronRight size={22} className="text-indigo-200 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </motion.div>

      {/* Subscription Details */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-50 bg-slate-50/50">
          <div className="p-2.5 bg-indigo-50 rounded-xl">
            <CreditCard className="text-indigo-600" size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Subscription Plans</h2>
            <p className="text-xs text-slate-500">Content access plans assigned to your institution</p>
          </div>
          <span className="ml-auto px-2.5 py-1 bg-indigo-50 text-indigo-600 font-bold text-xs rounded-lg border border-indigo-100">
            {subs.length} plan{subs.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="p-6">
          {subs.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto mb-3 text-slate-300" size={36} />
              <p className="text-slate-500 text-sm font-medium">No subscriptions found for your institution.</p>
              <p className="text-slate-400 text-xs mt-1">Contact your STM representative to set up access.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subs.map((sub: any, i: number) => {
                const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000);
                const isActive = sub.status === 'Active';
                const isExpiring = isActive && daysLeft <= 30;
                const progress = Math.max(0, Math.min(100, Math.round(
                  ((new Date(sub.startDate).getTime() - Date.now() + (new Date(sub.endDate).getTime() - new Date(sub.startDate).getTime())) /
                  (new Date(sub.endDate).getTime() - new Date(sub.startDate).getTime())) * 100
                )));

                return (
                  <motion.div
                    key={sub.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`relative p-4 rounded-2xl border overflow-hidden ${
                      isExpiring ? 'border-amber-200 bg-amber-50/50'
                      : isActive ? 'border-emerald-100 bg-emerald-50/30'
                      : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {/* Left accent */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${isExpiring ? 'bg-amber-400' : isActive ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    <div className="pl-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-sm">{sub.planName || sub.domainName || 'Subscription Plan'}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                          }`}>{sub.status}</span>
                          {isExpiring && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 flex items-center gap-1">
                              <AlertTriangle size={9} /> {daysLeft}d left
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(sub.startDate).toLocaleDateString('en-IN')}</span>
                          <span className="text-slate-300">→</span>
                          <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(sub.endDate).toLocaleDateString('en-IN')}</span>
                        </div>
                        {sub.domainName && sub.planName && <div className="text-xs text-slate-400 mt-0.5">Domain: {sub.domainName}</div>}
                      </div>
                      <div className="shrink-0">
                        {isActive ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                            <CheckCircle size={16} /> Active
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold">
                            <AlertTriangle size={16} /> Expired
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* Recent Student Activity */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.48 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 rounded-xl">
              <Activity className="text-purple-600" size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Recent Student Activity</h2>
              <p className="text-xs text-slate-500">Latest content access by your enrolled students</p>
            </div>
          </div>
          <Link to="/institution/students" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
            View All <ChevronRight size={14} />
          </Link>
        </div>

        <div className="p-6">
          {stats?.recentActivity?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((act: any, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                      {(act.user?.displayName || act.user?.email || 'S')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{act.user?.displayName || act.user?.email || 'Student'}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs">Accessed: {act.content?.title || 'External Module'}</div>
                    </div>
                  </div>
                  <div className="text-slate-400 text-xs shrink-0 ml-4">{new Date(act.accessedAt).toLocaleString()}</div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Activity className="mx-auto mb-3 opacity-20" size={32} />
              <p className="text-sm font-medium">No recent student activity registered yet.</p>
              <p className="text-xs text-slate-400 mt-1">Students will appear here once they start reading content.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
