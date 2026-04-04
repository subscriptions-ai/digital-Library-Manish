import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Library, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export function SubscriberOverview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/dashboard', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setData)
      .catch(() => toast.error("Failed to load overview data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 bg-slate-200 rounded-3xl" />
          <div className="h-32 bg-slate-200 rounded-3xl" />
          <div className="h-32 bg-slate-200 rounded-3xl" />
        </div>
      </div>
    );
  }

  const nearestExpiryStr = data?.nearestExpiry ? new Date(data.nearestExpiry).toLocaleDateString() : 'None';

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back!</h1>
        <p className="text-sm text-slate-500 mt-1">Here's an overview of your active subscriptions and content access.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-20"><CreditCard size={100} /></div>
          <div className="relative z-10">
            <div className="text-emerald-100 font-bold text-xs tracking-wider uppercase mb-2 flex items-center gap-2"><CreditCard size={16}/> Active Subs</div>
            <div className="text-4xl font-extrabold">{data?.activeSubscriptions || 0}</div>
            <div className="mt-4 text-xs font-medium bg-emerald-500/50 px-3 py-1.5 rounded-lg w-max backdrop-blur-md">
              Total Spent: ₹{data?.totalSpent?.toLocaleString() || 0}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-20"><Library size={100} /></div>
          <div className="relative z-10">
            <div className="text-blue-100 font-bold text-xs tracking-wider uppercase mb-2 flex items-center gap-2"><Library size={16}/> Covered Domains</div>
            <div className="text-4xl font-extrabold">{data?.allowedDomains?.length || 0}</div>
            <div className="mt-4 text-xs font-medium text-blue-100">Across the library platforms</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-3xl p-6 text-white shadow-lg shadow-amber-500/20 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-20"><Clock size={100} /></div>
          <div className="relative z-10">
            <div className="text-amber-100 font-bold text-xs tracking-wider uppercase mb-2 flex items-center gap-2"><Clock size={16}/> Nearest Expiry</div>
            <div className="text-2xl font-extrabold mt-2 whitespace-nowrap">{nearestExpiryStr}</div>
            {data?.nearestExpiry && (
              <Link to="/dashboard/subscriptions" className="mt-4 inline-flex items-center gap-1 text-xs font-bold bg-white text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors">
                Manage <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </motion.div>
      </div>

      {/* Mini Activity & Allowed Domains */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Your Purchased Domains</h2>
          <div className="space-y-3">
            {data?.allowedDomains?.length > 0 ? data.allowedDomains.map((domain: string) => (
              <div key={domain} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <span className="font-bold text-slate-800">{domain}</span>
                <Link to="/dashboard/access" className="p-2 bg-white rounded-lg shadow-sm text-blue-600 hover:text-blue-700 hover:shadow">
                  <ArrowRight size={18} />
                </Link>
              </div>
            )) : (
              <p className="text-sm text-slate-500">You don't have any active subscriptions yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {data?.recentActivity?.map((activity: any) => (
              <div key={activity.id} className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                <div>
                  <div className="font-bold text-slate-900">{activity.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{activity.type}</div>
                </div>
                <div className="text-xs font-medium text-slate-400 mt-2 sm:mt-0">
                  {new Date(activity.date).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
