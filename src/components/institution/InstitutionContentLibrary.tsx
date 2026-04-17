import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Search, Filter, Lock, FileText, PlayCircle, Tag, ChevronRight, LayoutGrid, List, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  'Books':                   <BookOpen size={18} />,
  'Periodicals':             <FileText size={18} />,
  'Magazines':               <FileText size={18} />,
  'Case Reports':            <FileText size={18} />,
  'Theses':                  <FileText size={18} />,
  'Conference Proceedings':  <FileText size={18} />,
  'Educational Videos':      <PlayCircle size={18} />,
  'Newsletters':             <FileText size={18} />,
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  'Books':                  'bg-blue-50 text-blue-600',
  'Periodicals':            'bg-indigo-50 text-indigo-600',
  'Magazines':              'bg-purple-50 text-purple-600',
  'Case Reports':           'bg-amber-50 text-amber-600',
  'Theses':                 'bg-emerald-50 text-emerald-600',
  'Conference Proceedings': 'bg-teal-50 text-teal-600',
  'Educational Videos':     'bg-red-50 text-red-600',
  'Newsletters':            'bg-orange-50 text-orange-600',
};

export function InstitutionContentLibrary() {
  const navigate = useNavigate();

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [contents, setContents]           = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [subsLoading, setSubsLoading]     = useState(true);

  // Filters
  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterType, setFilterType]   = useState('');
  const [viewMode, setViewMode]       = useState<'grid' | 'list'>('grid');

  // Pagination
  const PER_PAGE = 24;
  const [page, setPage]         = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch subscriptions to show what domains are active
  useEffect(() => {
    setSubsLoading(true);
    fetch('/api/institution/subscriptions', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(data => setSubscriptions(Array.isArray(data) ? data.filter(s => s.status === 'Active') : []))
      .catch(() => {})
      .finally(() => setSubsLoading(false));
  }, []);

  // Fetch content based on filters
  const fetchContent = useCallback(() => {
    setLoading(true);
    let url = `/api/content/list?page=${page}&limit=${PER_PAGE}`;
    if (filterDomain) url += `&domain=${encodeURIComponent(filterDomain)}`;
    if (filterType)   url += `&contentType=${encodeURIComponent(filterType)}`;
    if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;

    fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : (data.data || []);
        setContents(items);
        setTotalItems(data.total ?? items.length);
      })
      .catch(() => toast.error('Failed to load content'))
      .finally(() => setLoading(false));
  }, [page, filterDomain, filterType, debouncedSearch]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const handleOpen = (item: any) => {
    if (item.locked) {
      toast.error("This content is outside your institution's subscription scope.");
      return;
    }
    if (item.contentType === 'Educational Videos') {
      navigate(`/dashboard/videos/player/${item.id}`);
    } else {
      navigate(`/dashboard/viewer/${item.id}`);
    }
  };

  // Derive unique domains/types available from subscriptions
  const subscribedDomains = Array.from(new Set(subscriptions.flatMap(s => Array.isArray(s.domains) ? s.domains : [])));
  const subscribedTypes   = Array.from(new Set(subscriptions.flatMap(s => Array.isArray(s.contentTypes) ? s.contentTypes : [])));
  const totalPages = Math.ceil(totalItems / PER_PAGE);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Content Library</h1>
          <p className="text-sm text-slate-500 mt-1">Browse all content your institution has access to.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode('grid')} className={`p-2 rounded-xl border transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-2 rounded-xl border transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Active Subscription Badges */}
      {!subsLoading && subscribedDomains.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {subscribedDomains.map(d => (
            <button key={d} onClick={() => { setFilterDomain(filterDomain === d ? '' : d); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterDomain === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:border-indigo-400'}`}>
              <Tag size={11} /> {d}
            </button>
          ))}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search by title, author, subject…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 outline-none bg-white transition-all" />
        </div>
        <div className="flex gap-2">
          <select value={filterDomain} onChange={e => { setFilterDomain(e.target.value); setPage(1); }}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 outline-none">
            <option value="">All Domains</option>
            {subscribedDomains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 outline-none">
            <option value="">All Types</option>
            {(subscribedTypes.length > 0 ? subscribedTypes : ['Books','Periodicals','Magazines','Theses','Educational Videos']).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button onClick={fetchContent} className="p-2.5 border border-slate-200 bg-white rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-all">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Content Grid / List */}
      {loading ? (
        <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-slate-100 rounded-2xl h-44" />
          ))}
        </div>
      ) : contents.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
          <BookOpen className="mx-auto mb-3 text-slate-300" size={40} />
          <p className="text-slate-500 font-semibold">No content found.</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or search query.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {contents.map((item, idx) => (
              <motion.div key={item.id} layout
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => handleOpen(item)}
                className={`relative p-5 rounded-2xl border cursor-pointer group transition-all duration-200 ${
                  item.locked
                    ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-slate-100 hover:shadow-xl hover:shadow-indigo-100/40 hover:-translate-y-1 hover:border-indigo-200'
                }`}
              >
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-4 ${item.locked ? 'bg-slate-200 text-slate-400' : (CONTENT_TYPE_COLORS[item.contentType] || 'bg-indigo-50 text-indigo-600')}`}>
                  {item.locked ? <Lock size={18} /> : (CONTENT_TYPE_ICONS[item.contentType] || <FileText size={18} />)}
                </div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className={`font-bold text-sm leading-snug line-clamp-2 ${item.locked ? 'text-slate-400' : 'text-slate-900'}`}>{item.title}</h3>
                  {!item.locked && <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 shrink-0 mt-0.5 transition-colors" />}
                </div>
                <p className="text-xs text-slate-500 line-clamp-1 mb-3">{item.authors || 'Unknown Author'}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CONTENT_TYPE_COLORS[item.contentType] || 'bg-slate-100 text-slate-500'}`}>
                    {item.contentType}
                  </span>
                  {item.locked ? (
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Lock size={10}/> Locked</span>
                  ) : (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-colors">Read Now →</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      ) : (
        /* List view */
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
          {contents.map((item, idx) => (
            <motion.div key={item.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
              onClick={() => handleOpen(item)}
              className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer group transition-colors ${item.locked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-indigo-50/40'}`}
            >
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${item.locked ? 'bg-slate-100 text-slate-400' : (CONTENT_TYPE_COLORS[item.contentType] || 'bg-indigo-50 text-indigo-600')}`}>
                {item.locked ? <Lock size={16}/> : (CONTENT_TYPE_ICONS[item.contentType] || <FileText size={16}/>)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-800 truncate">{item.title}</div>
                <div className="text-xs text-slate-400 truncate">{item.authors || 'Unknown'} · {item.domain}</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${CONTENT_TYPE_COLORS[item.contentType] || 'bg-slate-100 text-slate-500'}`}>
                {item.contentType}
              </span>
              {!item.locked && <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 shrink-0 transition-colors" />}
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          <button disabled={page <= 1} onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0 }); }}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:border-indigo-400 transition-all">
            ← Prev
          </button>
          <span className="text-sm font-medium text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-xl">
            Page <strong className="text-indigo-600">{page}</strong> of <strong>{totalPages}</strong>
          </span>
          <button disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0 }); }}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:border-indigo-400 transition-all">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
