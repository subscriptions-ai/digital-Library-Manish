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
        <div className="h-10 w-64 bg-rule rounded-md" />
        <div className="h-48 bg-rule rounded-md" />
        <div className="h-48 bg-rule rounded-md" />
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
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest px-2.5 py-1 bg-accent-soft rounded-full border border-rule">
            Subscriptions
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">Access Plans & Licensing</h1>
        <p className="text-muted text-sm mt-1">Detailed overview of all active and past content subscriptions for your institution.</p>
      </div>

      {subscriptions.length === 0 ? (
        <div className="bg-surface rounded-md border border-rule shadow-sm p-12 text-center">
          <div className="mx-auto w-20 h-20 bg-surface-2 rounded-full flex items-center justify-center mb-4">
            <Package size={32} className="text-faint" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">No Subscriptions Found</h2>
          <p className="text-muted max-w-md mx-auto text-sm">
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
                className={`bg-surface rounded-md border ${isActive ? (isExpiring ? 'border-caution' : 'border-rule') : 'border-rule'} shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md`}
              >
                {/* Collapsed Header */}
                <div 
                  className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-colors ${isActive ? (isExpiring ? 'bg-caution-soft/30' : 'bg-accent-soft/20') : 'bg-surface-2/50'}`}
                  onClick={() => toggleExpand(sub.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-md flex items-center justify-center shrink-0 ${isActive ? 'bg-accent-soft text-accent' : 'bg-rule text-muted'}`}>
                      <Shield size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-ink">{sub.planName || 'Custom Institution Plan'}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${isActive ? 'bg-accent-soft text-accent' : 'bg-rule text-muted'}`}>
                          {sub.status}
                        </span>
                        {isExpiring && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-caution-soft text-caution flex items-center gap-1">
                            <AlertTriangle size={10} /> Expiring in {daysLeft}d
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(sub.startDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        <span className="text-faint">→</span>
                        <span className={`flex items-center gap-1 ${isExpiring ? 'text-caution font-medium' : ''}`}><Calendar size={14} /> {new Date(sub.endDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 sm:ml-auto">
                    <div className="hidden sm:block text-right">
                      <div className="text-xs text-muted mb-0.5">Assigned Domains</div>
                      <div className="font-semibold text-ink-2 text-sm">
                        {domains.length > 0 ? (domains.length === 1 ? domains[0] : `${domains.length} Domains`) : 'All Domains'}
                      </div>
                    </div>
                    <button className="p-2 rounded-full hover:bg-rule transition-colors">
                      {isExpanded ? <ChevronUp size={20} className="text-muted" /> : <ChevronDown size={20} className="text-muted" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-6 border-t border-rule bg-surface">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left Col: Scope & Coverage */}
                      <div className="space-y-6">
                        <div>
                          <h4 className="text-xs font-bold text-faint uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Globe size={14} /> Domain Coverage
                          </h4>
                          {domains.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {domains.map((d, i) => (
                                <span key={i} className="px-3 py-1.5 bg-accent-soft text-accent rounded-lg text-sm font-medium border border-rule">
                                  {d}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 bg-surface-2 text-ink-2 rounded-lg text-sm border border-rule flex items-center gap-2">
                              <CheckCircle size={14} className="text-accent" /> Unrestricted Domain Access
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-faint uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Tag size={14} /> Content Types
                          </h4>
                          {contentTypes.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {contentTypes.map((ct, i) => (
                                <span key={i} className="px-3 py-1 bg-surface-2 text-ink-2 rounded-lg text-xs font-medium border border-rule">
                                  {ct}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 bg-surface-2 text-ink-2 rounded-lg text-sm border border-rule flex items-center gap-2">
                              <CheckCircle size={14} className="text-accent" /> All Content Types Included
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Col: Admin Details */}
                      <div className="space-y-6 bg-surface-2 p-5 rounded-md border border-rule">
                        <div>
                          <h4 className="text-xs font-bold text-faint uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Settings size={14} /> Subscription Details
                          </h4>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-rule/60">
                              <span className="text-muted text-sm">Subscription ID</span>
                              <span className="text-ink font-mono text-xs font-medium">{sub.id}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-rule/60">
                              <span className="text-muted text-sm">Status</span>
                              <span className={`text-xs font-bold ${isActive ? 'text-accent' : 'text-muted'}`}>{sub.status}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-rule/60">
                              <span className="text-muted text-sm">Created On</span>
                              <span className="text-ink text-sm font-medium">{new Date(sub.createdAt).toLocaleDateString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-rule/60">
                              <span className="text-muted text-sm">User Type Allocation</span>
                              <span className="text-ink text-sm font-medium">{sub.userType || 'Institution Wide'}</span>
                            </div>
                            {sub.transactionId && (
                              <div className="flex justify-between items-center pt-1">
                                <span className="text-muted text-sm flex items-center gap-1.5"><FileText size={14} /> Transaction Ref</span>
                                <span className="text-ink font-mono text-xs">{sub.transactionId}</span>
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
