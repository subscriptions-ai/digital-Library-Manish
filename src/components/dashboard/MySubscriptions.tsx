import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, AlertCircle, CreditCard } from 'lucide-react';
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
        {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-slate-200 rounded-3xl" />)}
      </div>
    );
  }

  const filteredSubs = subscriptions.filter(sub => filter === 'All' || sub.status === filter);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Timeline & Billing</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your active plans and renew expiring subscriptions.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {['All', 'Active', 'Expired'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab as any)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === tab ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6">
        <AnimatePresence>
          {filteredSubs.map((sub, idx) => {
            const isExpired = sub.status !== 'Active';
            const progress = calculateProgress(sub.startDate, sub.endDate);
            const daysLeft = calculateDaysLeft(sub.endDate);

            return (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                className={`bg-white rounded-3xl border shadow-sm p-6 relative overflow-hidden ${isExpired ? 'border-red-100' : 'border-slate-100'}`}
              >
                {isExpired && <div className="absolute inset-0 bg-slate-50/50 backdrop-blur-[1px] z-10 pointer-events-none" />}
                
                <div className="relative z-20 flex flex-col sm:flex-row justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                       <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md ${isExpired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {sub.status}
                      </span>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">{sub.planName}</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">{sub.domainName}</h2>
                    {sub.allowedContentTypes && (
                      <p className="text-xs text-slate-500 mt-1 max-w-lg">
                        Includes: {(sub.allowedContentTypes).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-sm font-bold text-slate-800 flex items-center sm:justify-end gap-2">
                      <Calendar size={16} className="text-slate-400" />
                      {new Date(sub.startDate).toLocaleDateString()} — {new Date(sub.endDate).toLocaleDateString()}
                    </div>
                    {!isExpired ? (
                      <p className={`text-xs font-bold mt-2 flex items-center sm:justify-end gap-1 ${daysLeft <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {daysLeft <= 30 && <AlertCircle size={14}/>} {daysLeft} days remaining
                      </p>
                    ) : (
                      <p className="text-xs font-bold mt-2 text-red-500">Expired</p>
                    )}
                  </div>
                </div>

                <div className="mt-8 relative z-20">
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${progress}%` }} 
                      transition={{ duration: 1, delay: 0.2 }}
                      className={`h-full ${isExpired ? 'bg-red-500' : progress > 90 ? 'bg-amber-500' : 'bg-blue-600'}`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                    <span>Started</span>
                    <span>{progress}% Elapsed</span>
                    <span>Ends</span>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filteredSubs.length === 0 && (
          <div className="text-center p-12 bg-white rounded-3xl border border-slate-100">
            <CreditCard size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-1">No subscriptions found</h3>
            <p className="text-sm text-slate-500">You don't have any {filter.toLowerCase()} subscriptions at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
