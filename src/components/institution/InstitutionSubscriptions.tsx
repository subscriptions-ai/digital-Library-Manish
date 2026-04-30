import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Package, Calendar, CheckCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, Tag, Globe, Settings, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function InstitutionSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubs = async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const res = await fetch('/api/institution/subscriptions', { headers });
        if (res.ok) {
          const data = await res.json();
          setSubscriptions(data);
        } else {
          toast.error('Failed to load subscriptions');
        }
      } catch (err) {
        toast.error('Could not load subscriptions');
      } finally {
        setLoading(false);
      }
    };
    fetchSubs();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-slate-200 rounded-xl" />
        <div className="h-48 bg-slate-200 rounded-3xl" />
        <div className="h-48 bg-slate-200 rounded-3xl" />
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest px-2.5 py-1 bg-indigo-50 rounded-full border border-indigo-100">
            Subscriptions
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Access Plans & Licensing</h1>
        <p className="text-slate-500 text-sm mt-1">Detailed overview of all active and past content subscriptions for your institution.</p>
      </div>

      {subscriptions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center">
          <div className="mx-auto w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Package size={32} className="text-slate-300" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">No Subscriptions Found</h2>
          <p className="text-slate-500 max-w-md mx-auto text-sm">
            Your institution does not have any active or past subscriptions assigned. Please contact your STM representative to configure your access plans.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {subscriptions.map((sub, idx) => {
            const isActive = sub.status === 'Active';
            const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000);
            const isExpiring = isActive && daysLeft <= 30 && daysLeft > 0;
            const isExpanded = expandedId === sub.id;

            // Parse domains
            let domains: string[] = [];
            try {
              if (Array.isArray(sub.domains)) domains = sub.domains;
              else if (typeof sub.domains === 'string') domains = JSON.parse(sub.domains);
              if (domains.length === 0 && sub.domainName) domains = [sub.domainName];
            } catch (e) {
              if (sub.domainName) domains = [sub.domainName];
            }

            // Parse content types
            let contentTypes: string[] = [];
            try {
              if (Array.isArray(sub.contentTypes)) contentTypes = sub.contentTypes;
              else if (typeof sub.contentTypes === 'string') contentTypes = JSON.parse(sub.contentTypes);
            } catch (e) {}

            return (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`bg-white rounded-2xl border ${isActive ? (isExpiring ? 'border-amber-200' : 'border-emerald-100') : 'border-slate-200'} shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md`}
              >
                {/* Collapsed Header */}
                <div 
                  className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-colors ${isActive ? (isExpiring ? 'bg-amber-50/30' : 'bg-emerald-50/20') : 'bg-slate-50/50'}`}
                  onClick={() => toggleExpand(sub.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                      <Shield size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-slate-800">{sub.planName || 'Custom Institution Plan'}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                          {sub.status}
                        </span>
                        {isExpiring && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 flex items-center gap-1">
                            <AlertTriangle size={10} /> Expiring in {daysLeft}d
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(sub.startDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        <span className="text-slate-300">→</span>
                        <span className={`flex items-center gap-1 ${isExpiring ? 'text-amber-600 font-medium' : ''}`}><Calendar size={14} /> {new Date(sub.endDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 sm:ml-auto">
                    <div className="hidden sm:block text-right">
                      <div className="text-xs text-slate-500 mb-0.5">Assigned Domains</div>
                      <div className="font-semibold text-slate-700 text-sm">
                        {domains.length > 0 ? (domains.length === 1 ? domains[0] : `${domains.length} Domains`) : 'All Domains'}
                      </div>
                    </div>
                    <button className="p-2 rounded-full hover:bg-slate-200 transition-colors">
                      {isExpanded ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-6 border-t border-slate-100 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left Col: Scope & Coverage */}
                      <div className="space-y-6">
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Globe size={14} /> Domain Coverage
                          </h4>
                          {domains.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {domains.map((d, i) => (
                                <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100">
                                  {d}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm border border-slate-200 flex items-center gap-2">
                              <CheckCircle size={14} className="text-emerald-500" /> Unrestricted Domain Access
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Tag size={14} /> Content Types
                          </h4>
                          {contentTypes.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {contentTypes.map((ct, i) => (
                                <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200">
                                  {ct}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm border border-slate-200 flex items-center gap-2">
                              <CheckCircle size={14} className="text-emerald-500" /> All Content Types Included
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Col: Admin Details */}
                      <div className="space-y-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Settings size={14} /> Subscription Details
                          </h4>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                              <span className="text-slate-500 text-sm">Subscription ID</span>
                              <span className="text-slate-800 font-mono text-xs font-medium">{sub.id}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                              <span className="text-slate-500 text-sm">Status</span>
                              <span className={`text-xs font-bold ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}>{sub.status}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                              <span className="text-slate-500 text-sm">Created On</span>
                              <span className="text-slate-800 text-sm font-medium">{new Date(sub.createdAt).toLocaleDateString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                              <span className="text-slate-500 text-sm">User Type Allocation</span>
                              <span className="text-slate-800 text-sm font-medium">{sub.userType || 'Institution Wide'}</span>
                            </div>
                            {sub.transactionId && (
                              <div className="flex justify-between items-center pt-1">
                                <span className="text-slate-500 text-sm flex items-center gap-1.5"><FileText size={14} /> Transaction Ref</span>
                                <span className="text-slate-800 font-mono text-xs">{sub.transactionId}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
