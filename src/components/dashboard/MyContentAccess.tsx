import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Search, ArrowRight, Lock, ChevronLeft, LayoutGrid, BookOpen, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

/**
 * Send Browse to the shelf the items are actually on.
 *
 * These counts are drawn from Content, Article and Book together, but the two
 * datasets live on different shelves. A Nursing reader was told "1,821 items"
 * and then sent to the archived shelf, which holds none of them.
 */
function browseHref(mod: any, domain: string) {
  const q = new URLSearchParams({ domain });
  if ((mod.newCount ?? 0) > 0) {
    if (mod.contentType === 'Books') q.set('kind', 'books');
    return `/dashboard/library?${q}`;
  }
  q.set('mode', 'archived');
  if (mod.contentType) q.set('atype', mod.contentType);
  return `/dashboard/library?${q}`;
}

export function MyContentAccess() {
  const [accessMap, setAccessMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
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

  // Sort domains: those with any access come first
  const sortedDomains = [...domains].sort((a, b) => {
    const aAccess = accessMap[a].some(m => m.hasAccess) ? 1 : 0;
    const bAccess = accessMap[b].some(m => m.hasAccess) ? 1 : 0;
    if (aAccess !== bAccess) return bAccess - aAccess;
    return a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-3xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (selectedDomain) {
    const modules = accessMap[selectedDomain] || [];
    const unlockedCount = modules.filter(m => m.hasAccess).length;
    const isFullyUnlocked = unlockedCount > 0 && unlockedCount === modules.length;

    return (
      <div className="space-y-6 pb-12">
        <button 
          onClick={() => setSelectedDomain(null)}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ChevronLeft size={16} /> Back to Departments
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <LayoutGrid className="text-blue-600" /> {selectedDomain}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                {unlockedCount} of {modules.length} content types unlocked
              </p>
            </div>
            {isFullyUnlocked ? (
              <span className="px-4 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 w-max border border-emerald-200 dark:border-emerald-800/40">
                <CheckCircle2 size={16} /> Full Access
              </span>
            ) : (
              <a href={`/domain/${selectedDomain.toLowerCase().replace(/\s+/g, '-')}`} className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2 w-max">
                <Lock size={14} /> Upgrade Plan for More
              </a>
            )}
          </div>
          
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {modules.length === 0 ? (
               <div className="p-8 text-center text-slate-500">No content types found in this department.</div>
            ) : (
              modules.map((mod) => (
                <div key={mod.id} className="p-5 sm:px-8 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors group">
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${mod.hasAccess ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-600'}`}>
                      {mod.hasAccess ? <BookOpen size={24} /> : <Lock size={20} />}
                    </div>
                    <div>
                      <p className={`font-bold text-lg ${mod.hasAccess ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                        {mod.contentType}
                      </p>
                      <p className="text-sm font-medium text-slate-400 dark:text-slate-500 mt-0.5">
                        {mod.totalCount.toLocaleString()} item{mod.totalCount !== 1 ? 's' : ''} available
                      </p>
                    </div>
                  </div>
                  
                  {mod.hasAccess ? (
                    <button 
                      onClick={() => navigate(browseHref(mod, selectedDomain))}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 text-sm font-bold"
                    >
                      Browse <ArrowRight size={16} />
                    </button>
                  ) : (
                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-400 text-xs font-bold rounded-lg uppercase tracking-wider hidden sm:block">Locked</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Layers className="text-blue-600" size={32} /> My Content Access
        </h1>
        <p className="text-base font-medium text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
          Select a department below to see which content types (Books, Periodicals, etc.) you have unlocked. Browse and read instantly.
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Search departments..."
          className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-base focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-500 transition-all outline-none text-slate-800 dark:text-slate-200 shadow-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
        {sortedDomains
          .filter(d => d.toLowerCase().includes(search.toLowerCase()))
          .map((domain, index) => {
            const modules = accessMap[domain] || [];
            const unlockedCount = modules.filter(m => m.hasAccess).length;
            const hasAnyAccess = unlockedCount > 0;

            return (
              <motion.button 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={domain}
                onClick={() => setSelectedDomain(domain)}
                className={`text-left relative p-6 rounded-3xl border transition-all duration-300 group ${
                  hasAnyAccess 
                    ? 'bg-white dark:bg-slate-800 border-blue-100 dark:border-blue-900/40 shadow-md hover:shadow-xl hover:-translate-y-1 hover:border-blue-300 dark:hover:border-blue-700'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-80 hover:opacity-100 hover:shadow-md'
                }`}
              >
                {hasAnyAccess && (
                  <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                )}
                
                <div className="mb-4">
                  <h3 className={`text-xl font-black ${hasAnyAccess ? 'text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors' : 'text-slate-600 dark:text-slate-400'}`}>
                    {domain}
                  </h3>
                </div>
                
                <div className="space-y-1.5">
                  <p className={`text-sm font-semibold flex items-center gap-1.5 ${hasAnyAccess ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {hasAnyAccess ? <CheckCircle2 size={16} /> : <Lock size={16} />}
                    {unlockedCount} of {modules.length} accessible
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 font-medium">
                    Total {modules.reduce((acc, m) => acc + m.totalCount, 0).toLocaleString()} items
                  </p>
                </div>
              </motion.button>
            );
        })}
        {domains.length === 0 && !loading && (
          <div className="col-span-full text-center p-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
             <p className="text-lg font-bold text-slate-500 dark:text-slate-400">No departments available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
