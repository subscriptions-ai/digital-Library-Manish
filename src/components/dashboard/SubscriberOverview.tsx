import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Library, Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

export function SubscriberOverview() {
  const { profile } = useAuth();
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
          <div className="h-32 bg-rule rounded-md" />
          <div className="h-32 bg-rule rounded-md" />
          <div className="h-32 bg-rule rounded-md" />
        </div>
      </div>
    );
  }

  const nearestExpiryStr = data?.nearestExpiry ? new Date(data.nearestExpiry).toLocaleDateString() : 'None';

  return (
    <div className="space-y-8 pb-12">
      {profile?.isDemoAccount && (
        <div className="flex items-center justify-between rounded-md border border-caution bg-caution-soft p-4 text-caution">
          <div>
            <h2 className="font-bold text-lg">⚠️ Demo Account</h2>
            <p className="mt-1 text-[13px]">
              This demo account is valid for 30 days and will expire on {profile.demoExpiresAt ? new Date(profile.demoExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'its expiry date'}.
            </p>
          </div>
          <Link to="/contact" className="bg-surface text-caution px-4 py-2 rounded-md text-sm font-bold shadow-sm hover:bg-caution-soft transition-colors">
            Request Access
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Welcome back!</h1>
        <p className="text-sm text-muted mt-1">Here's an overview of your active subscriptions and content access.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-accent rounded-md p-6 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-20"><CreditCard size={100} /></div>
          <div className="relative z-10">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-faint"><CreditCard size={16}/> Active Subs</div>
            <div className="text-4xl font-extrabold">{data?.activeSubscriptions || 0}</div>
            <div className="mt-4 text-xs font-medium bg-accent/50 px-3 py-1.5 rounded-lg w-max backdrop-blur-md">
              Total Spent: ₹{data?.totalSpent?.toLocaleString() || 0}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-accent rounded-md p-6 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-20"><Library size={100} /></div>
          <div className="relative z-10">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-faint"><Library size={16}/> Covered Domains</div>
            <div className="text-4xl font-extrabold">{data?.allowedDomains?.length || 0}</div>
            <div className="mt-4 text-[11.5px] text-muted">Across the library platforms</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-accent rounded-md p-6 text-white shadow-lg  relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-20"><Clock size={100} /></div>
          <div className="relative z-10">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-faint"><Clock size={16}/> Nearest Expiry</div>
            <div className="text-2xl font-extrabold mt-2 whitespace-nowrap">{nearestExpiryStr}</div>
            {data?.nearestExpiry && (
              <Link to="/dashboard/subscriptions" className="mt-4 inline-flex items-center gap-1 text-xs font-bold bg-surface text-caution px-3 py-1.5 rounded-lg hover:bg-caution-soft transition-colors">
                Manage <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </motion.div>
      </div>

      {/* Expired Subscriptions Alert */}
      {data?.expiredSubscriptions?.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-alarm uppercase tracking-widest flex items-center gap-2">
            <AlertCircle size={16} /> Expired Subscriptions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.expiredSubscriptions.map((sub: any) => (
              <div key={sub.id} className="bg-alarm-soft border border-alarm rounded-md p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                  <h3 className="font-bold text-ink">{sub.domainName}</h3>
                  <p className="text-xs text-alarm font-medium mt-1">
                    Expired on: {new Date(sub.endDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <Link to="/contact" className="shrink-0 bg-alarm hover:opacity-90 text-white text-xs font-bold px-4 py-2 rounded-md transition-colors shadow-sm shadow-red-600/20">
                  Request Renewal
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mini Activity & Allowed Domains */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-md p-6 border border-rule shadow-sm">
          <h2 className="text-sm font-bold text-ink uppercase tracking-widest mb-4">Your Purchased Domains</h2>
          <div className="space-y-3">
            {data?.allowedDomains?.length > 0 ? data.allowedDomains.map((domain: string) => (
              <div key={domain} className="flex items-center justify-between p-4 bg-surface-2 rounded-md">
                <span className="font-bold text-ink">{domain}</span>
                <Link to="/dashboard/library/access" className="p-2 bg-surface rounded-lg shadow-sm text-accent hover:text-accent hover:shadow">
                  <ArrowRight size={18} />
                </Link>
              </div>
            )) : (
              <p className="text-sm text-muted">You don't have any active subscriptions yet.</p>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-md p-6 border border-rule shadow-sm">
          <h2 className="text-sm font-bold text-ink uppercase tracking-widest mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {data?.recentActivity?.map((activity: any) => (
              <div key={activity.id} className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-rule last:border-0 last:pb-0">
                <div>
                  <div className="font-bold text-ink">{activity.title}</div>
                  <div className="text-xs text-muted mt-1">{activity.type}</div>
                </div>
                <div className="text-xs font-medium text-faint mt-2 sm:mt-0">
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
