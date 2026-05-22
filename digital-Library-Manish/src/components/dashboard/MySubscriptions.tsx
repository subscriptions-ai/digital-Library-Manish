import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, AlertCircle, CreditCard, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function MySubscriptions() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Active' | 'Expired'>('All');

  useEffect(() => {
    fetch('/api/user/subscriptions', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(setSubscriptions)
      .catch(() => toast.error("Failed to load subscriptions"))
      .finally(() => setLoading(false));
  }, []);

  const calculateProgress = (start: string, end: string) => {
    const startDate = new Date(start).getTime();
    const endDate = new Date(end).getTime();
    const now = new Date().getTime();
    if (now > endDate) return 100;
    if (now < startDate) return 0;
    return Math.round(((now - startDate) / (endDate - startDate)) * 100);
  };

  const calculateDaysLeft = (end: string) => {
    const diff = new Date(end).getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 3600 * 24)));
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-slate-200 dark:bg-slate-700 rounded-3xl" />)}
      </div>
    );
  }

  const filteredSubs = subscriptions.filter(sub => filter === 'All' || sub.status === filter);
  const activeCount = subscriptions.filter(s => s.status === 'Active').length;
  const expiredCount = subscriptions.filter(s => s.status !== 'Active').length;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Timeline & Billing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your active plans and renew expiring subscriptions.</p>
        </div>

        {/* Summary Pills */}
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-bold border border-emerald-100 dark:border-emerald-800/30">
              <CheckCircle2 size={13} /> {activeCount} Active
            </span>
          )}
          {expiredCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold border border-red-100 dark:border-red-800/30">
              <AlertCircle size={13} /> {expiredCount} Expired
            </span>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-max">
        {(['All', 'Active', 'Expired'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
              filter === tab 
                ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-6">
        <AnimatePresence mode="popLayout">
          {filteredSubs.map((sub, idx) => {
            const isExpired = sub.status !== 'Active';
            const progress = calculateProgress(sub.startDate, sub.endDate);
            const daysLeft = calculateDaysLeft(sub.endDate);
            const isUrgent = !isExpired && daysLeft <= 30;

            return (
              <motion.div
                key={sub.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                className={`bg-white dark:bg-slate-800 rounded-3xl border shadow-sm p-6 relative overflow-hidden transition-shadow hover:shadow-md ${
                  isExpired 
                    ? 'border-red-100 dark:border-red-900/30' 
                    : isUrgent 
                      ? 'border-amber-100 dark:border-amber-800/30' 
                      : 'border-slate-100 dark:border-slate-700'
                }`}
              >
                {/* Subtle left accent bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-3xl ${
                  isExpired ? 'bg-red-400 dark:bg-red-600' : isUrgent ? 'bg-amber-400 dark:bg-amber-500' : 'bg-emerald-400 dark:bg-emerald-500'
                }`} />

                <div className="pl-3 flex flex-col sm:flex-row justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md ${
                        isExpired 
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
                          : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {sub.status}
                      </span>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-md">{sub.planName}</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{sub.domainName}</h2>
                    {sub.allowedContentTypes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg">
                        Includes: {(sub.allowedContentTypes).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center sm:justify-end gap-2">
                      <Calendar size={16} className="text-slate-400 dark:text-slate-500" />
                      {new Date(sub.startDate).toLocaleDateString()} — {new Date(sub.endDate).toLocaleDateString()}
                    </div>
                    {!isExpired ? (
                      <p className={`text-xs font-bold mt-2 flex items-center sm:justify-end gap-1 ${isUrgent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {isUrgent && <AlertCircle size={14}/>} {daysLeft} days remaining
                      </p>
                    ) : (
                      <p className="text-xs font-bold mt-2 text-red-500 dark:text-red-400">Subscription Expired</p>
                    )}
                    {isExpired && (
                      <a href="/subscriptions" className="mt-2 inline-block text-[10px] font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                        Renew Plan
                      </a>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-6 pl-3">
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${progress}%` }} 
                      transition={{ duration: 1, delay: 0.2 }}
                      className={`h-full rounded-full ${
                        isExpired ? 'bg-red-500 dark:bg-red-600' : isUrgent ? 'bg-amber-500 dark:bg-amber-400' : 'bg-emerald-500 dark:bg-emerald-400'
                      }`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5">
                    <span>Started</span>
                    <span>{progress}% Elapsed</span>
                    <span>Ends</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredSubs.length === 0 && (
          <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
            <CreditCard size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No subscriptions found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">You don't have any {filter.toLowerCase()} subscriptions at the moment.</p>
            <a href="/subscriptions" className="mt-4 inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors">
              Browse Plans
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
