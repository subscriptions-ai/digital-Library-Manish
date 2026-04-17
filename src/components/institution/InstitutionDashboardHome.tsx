import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, BookOpen, Activity, Clock, CreditCard, Calendar, CheckCircle, AlertTriangle, Package, ChevronRight } from 'lucide-react';
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-200 h-28 rounded-2xl w-full" />)}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Enrolled Students", value: stats?.studentCount || 0, icon: <Users size={24} className="text-blue-500" />, bg: "bg-blue-50" },
    { label: "Active Access Grants", value: stats?.activeGrants || 0, icon: <BookOpen size={24} className="text-emerald-500" />, bg: "bg-emerald-50" },
    { label: "Content Interactions", value: stats?.totalInteractions || 0, icon: <Activity size={24} className="text-amber-500" />, bg: "bg-amber-50" },
    { label: "Avg. Learning Time", value: stats?.avgLearningTime || '0h 0m', icon: <Clock size={24} className="text-purple-500" />, bg: "bg-purple-50" },
  ];

  const activeSubs = subs.filter(s => s.status === 'Active');
  const expiringSoon = activeSubs.filter(s => {
    const daysLeft = Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000);
    return daysLeft <= 30 && daysLeft > 0;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">
          Institution Dashboard
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">{institutionName}</h1>
        <p className="text-slate-500 text-sm mt-1">Here is a high-level overview of your institution's activity.</p>
      </div>

      {/* Expiry Alert */}
      {expiringSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <div>
            <div className="font-bold text-amber-800 text-sm">
              {expiringSoon.length} subscription{expiringSoon.length > 1 ? 's' : ''} expiring within 30 days
            </div>
            <div className="text-amber-600 text-xs mt-0.5">
              Contact your STM subscription manager to renew access.
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((c, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
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

      {/* Content Library Quick Access */}
      <Link to="/institution/library"
        className="flex items-center gap-5 p-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300/50 transition-all hover:-translate-y-0.5 group">
        <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <BookOpen size={24} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-base">Browse Content Library</div>
          <div className="text-indigo-100 text-sm">Read journals, books, periodicals and more included in your subscription.</div>
        </div>
        <ChevronRight size={22} className="text-indigo-200 group-hover:translate-x-1 transition-transform shrink-0" />
      </Link>

      {/* Subscription Details */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-50 rounded-xl">
            <CreditCard className="text-indigo-600" size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Subscription Details</h2>
            <p className="text-xs text-slate-500">Content access plans assigned to your institution</p>
          </div>
        </div>

        {subs.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="text-slate-500 text-sm">No subscriptions found for your institution.</p>
            <p className="text-slate-400 text-xs mt-1">Contact your STM representative to set up access.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {subs.map((sub: any, i: number) => {
              const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000);
              const isActive = sub.status === 'Active';
              const isExpiring = isActive && daysLeft <= 30;
              return (
                <motion.div
                  key={sub.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border ${
                    isExpiring ? 'border-amber-200 bg-amber-50'
                    : isActive ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm">{sub.planName || sub.domainName || 'Subscription Plan'}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {sub.status}
                      </span>
                      {isExpiring && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-700">
                          Expires in {daysLeft}d
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} /> Start: {new Date(sub.startDate).toLocaleDateString('en-IN')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} /> End: {new Date(sub.endDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    {sub.domainName && <div className="text-xs text-slate-400 mt-0.5">Domain: {sub.domainName}</div>}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {isActive ? (
                      <CheckCircle className="text-emerald-500" size={18} />
                    ) : (
                      <AlertTriangle className="text-slate-400" size={18} />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800">Recent Student Activity</h2>
        </div>
        {stats?.recentActivity?.length > 0 ? (
          <div className="space-y-4">
            {stats.recentActivity.map((act: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{act.user?.displayName || act.user?.email || 'Student'}</div>
                  <div className="text-xs text-slate-500">Accessed: {act.content?.title || 'External Module'}</div>
                </div>
                <div className="text-slate-400 text-xs">{new Date(act.accessedAt).toLocaleString()}</div>
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
