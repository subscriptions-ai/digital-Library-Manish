import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Lock, FileText, ArrowLeft, Search, PlayCircle } from 'lucide-react';

export function MyContentLibrary() {
  const [params] = useSearchParams();
  const domain = params.get('domain') || '';
  const type = params.get('type') || '';
  const navigate = useNavigate();

  const [contents, setContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Pagination State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const ITEMS_PER_PAGE = 24;
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    let url = `/api/content/list?onlyUnlocked=true&domain=${encodeURIComponent(domain)}&page=${page}&limit=${ITEMS_PER_PAGE}`;
    if (type) url += `&contentType=${encodeURIComponent(type)}`;
    if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;

    fetch(url, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => {
        const items = Array.isArray(data) ? data : (data.data || []);
        setContents(items);
        setTotalItems(data.total ?? items.length);
      })
      .catch(() => toast.error("Failed to load content"))
      .finally(() => setLoading(false));
  }, [domain, type, page, debouncedSearch]);

  const handleOpen = (item: any) => {
    if (item.locked) {
      toast.error('This content is locked. Please upgrade your subscription.');
      navigate(`/domain/${domain.toLowerCase().replace(/\s+/g, '-')}`);
    } else if (item.contentType === 'Educational Videos') {
      navigate(`/dashboard/videos/player/${item.id}`);
    } else {
      navigate(`/dashboard/viewer/${item.id}`);
    }
  };

  const isVideo = type === 'Educational Videos';

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/dashboard/access')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
          <ArrowLeft size={20} className="text-slate-500 dark:text-slate-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{type || 'Content Library'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{domain}</p>
        </div>
      </div>

      <div className="relative flex-1 w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
        <input
          type="text"
          placeholder="Search items..."
          className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-shadow outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-3xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {contents.map((content, idx) => (
            <motion.div
              key={content.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              onClick={() => handleOpen(content)}
              className={`relative p-6 rounded-3xl border transition-all cursor-pointer group ${
                content.locked 
                  ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600' 
                  : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1 dark:hover:border-blue-700/50'
              }`}
            >
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-4 ${
                content.locked 
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500' 
                  : isVideo 
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform'
                    : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform'
              }`}>
                {content.locked ? <Lock size={20} /> : isVideo ? <PlayCircle size={20} /> : <FileText size={20} />}
              </div>
              <h3 className={`font-bold text-lg leading-tight mb-2 line-clamp-2 ${content.locked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                {content.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">
                {content.authors} • {content.subjectArea || 'General'}
              </p>
              {content.locked ? (
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 w-max px-3 py-1 rounded-lg">
                  <Lock size={12} /> Locked
                </span>
              ) : (
                <button className={`text-xs font-bold px-4 py-1.5 rounded-xl transition-colors ${
                  isVideo 
                    ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 group-hover:bg-purple-600 group-hover:text-white'
                    : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 group-hover:bg-blue-600 group-hover:text-white'
                }`}>
                  {isVideo ? 'Watch Now' : 'Read Now'}
                </button>
              )}
            </motion.div>
          ))}

          {contents.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
              No content found matching your criteria.
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {totalItems > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center gap-4 pt-8">
          <button
            disabled={page <= 1}
            onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-600 dark:hover:text-blue-400 transition-all shadow-sm"
          >
            ← Prev
          </button>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl shadow-sm">
            Page <strong className="text-blue-600 dark:text-blue-400">{page}</strong> of <strong>{Math.ceil(totalItems / ITEMS_PER_PAGE)}</strong>
          </span>
          <button
            disabled={page >= Math.ceil(totalItems / ITEMS_PER_PAGE)}
            onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-600 dark:hover:text-blue-400 transition-all shadow-sm"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
