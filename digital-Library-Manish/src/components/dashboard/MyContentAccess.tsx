import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Search, ArrowRight, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export function MyContentAccess() {
  const [accessMap, setAccessMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('All');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/user/content-access', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setAccessMap)
      .catch(() => toast.error("Failed to load access map"))
      .finally(() => setLoading(false));
  }, []);

  const domains = Object.keys(accessMap);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 rounded-3xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">My Content Access</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">See what content types you have access to across the library domains.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-slate-800 p-4 items-center rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Search domains or content types..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-shadow outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterDomain}
          onChange={(e) => setFilterDomain(e.target.value)}
          className="w-full sm:w-64 px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 cursor-pointer"
        >
          <option value="All">All Domains</option>
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="space-y-8 pt-4">
        {domains
          .filter(d => filterDomain === 'All' || filterDomain === d)
          .filter(d => d.toLowerCase().includes(search.toLowerCase()) || accessMap[d].some(c => c.contentType.toLowerCase().includes(search.toLowerCase())))
          .map((domain, index) => {
            const modules = accessMap[domain];
            const unlockedCount = modules.filter(m => m.hasAccess).length;
            const isFullyUnlocked = unlockedCount === modules.length;

            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                key={domain} 
                className="bg-white dark:bg-slate-800/80 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">{domain}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{unlockedCount} of {modules.length} content types unlocked</p>
                  </div>
                  {isFullyUnlocked ? (
                    <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider rounded-lg flex items-center gap-1 w-max border border-emerald-200 dark:border-emerald-800/40">
                      <CheckCircle2 size={14} /> Full Access
                    </span>
                  ) : (
                    <a href={`/domain/${domain.toLowerCase().replace(/\s+/g, '-')}`} className="px-4 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5">
                      <Lock size={12} /> Upgrade Plan
                    </a>
                  )}
                </div>
                
                <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {modules
                    .filter(m => m.contentType.toLowerCase().includes(search.toLowerCase()) || search === '')
                    .map((mod) => (
                    <div key={mod.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mod.hasAccess ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>
                          {mod.hasAccess ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                        </div>
                        <div>
                          <p className={`font-bold ${mod.hasAccess ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{mod.contentType}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{mod.totalCount} items available</p>
                        </div>
                      </div>
                      
                      {mod.hasAccess && (
                        <button 
                          onClick={() => navigate(`/dashboard/library?domain=${encodeURIComponent(domain)}&type=${encodeURIComponent(mod.contentType)}`)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-all hidden sm:flex items-center gap-2 text-xs font-bold"
                        >
                          Browse <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            );
        })}
        {domains.length === 0 && !loading && (
          <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
             <p className="font-medium text-slate-500 dark:text-slate-400">No content modules found. Contact your administrator.</p>
          </div>
        )}
      </div>
    </div>
  );
}
