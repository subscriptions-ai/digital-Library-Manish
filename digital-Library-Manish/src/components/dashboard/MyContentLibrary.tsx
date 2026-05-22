import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
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
  
  const [selectedDomain, setSelectedDomain] = useState(domain);
  const [filterSubjects, setFilterSubjects] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  
  const [availableFilters, setAvailableFilters] = useState<{ domains: string[], subjects: string[], tags: string[] }>({ domains: [], subjects: [], tags: [] });
  const ITEMS_PER_PAGE = 24;
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch dynamic filters based on selections
  useEffect(() => {
    let url = `/api/content/filters?1=1`;
    if (selectedDomain) url += `&domain=${encodeURIComponent(selectedDomain)}`;
    if (filterSubjects.length > 0) url += `&subjectArea=${encodeURIComponent(filterSubjects.join(','))}`;

    fetch(url, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(data => {
        setAvailableFilters(prev => ({
          domains: data.domains?.length > 0 ? data.domains : prev.domains,
          subjects: data.subjects || [],
          tags: data.tags || []
        }));
      })
      .catch(() => {});
  }, [selectedDomain, filterSubjects]);

  useEffect(() => {
    setLoading(true);
    let url = `/api/content/list?onlyUnlocked=true&page=${page}&limit=${ITEMS_PER_PAGE}`;
    if (selectedDomain) url += `&domain=${encodeURIComponent(selectedDomain)}`;
    if (type) url += `&contentType=${encodeURIComponent(type)}`;
    if (filterSubjects.length > 0) url += `&subjectArea=${encodeURIComponent(filterSubjects.join(','))}`;
    if (filterTags.length > 0) url += `&tag=${encodeURIComponent(filterTags.join(','))}`;
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
  }, [selectedDomain, type, page, filterSubjects, filterTags, debouncedSearch]);

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
    <div className="flex flex-col md:flex-row gap-6 pb-12 items-start">
      {/* Sidebar for Filters */}
      <div className="w-full md:w-[280px] shrink-0 space-y-6 md:sticky md:top-24">
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => navigate('/dashboard/access')} className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition-colors shrink-0 border border-slate-200 dark:border-slate-600">
              <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">{type || 'Content Library'}</h1>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{domain || 'All Domains'}</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search resources..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Domain Filter (Only if URL domain is empty) */}
            {!domain && availableFilters.domains.length > 0 && (
              <div className="pt-2">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Domain</h3>
                <select value={selectedDomain} onChange={e => { 
                    setSelectedDomain(e.target.value); 
                    setFilterSubjects([]);
                    setFilterTags([]);
                    setPage(1); 
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 outline-none text-slate-800 dark:text-slate-200 transition-all cursor-pointer appearance-none">
                  <option value="">All Domains</option>
                  {availableFilters.domains.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            
            {/* Subject Filter */}
            <AnimatePresence>
              {(selectedDomain || domain) && availableFilters.subjects.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Subject Area</h3>
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                    {availableFilters.subjects.map(s => (
                      <label key={s} className="flex items-start gap-3 cursor-pointer group">
                        <input 
                          type="checkbox"
                          checked={filterSubjects.includes(s)}
                          onChange={() => {
                            setFilterSubjects(prev => {
                              const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s];
                              setFilterTags([]); // Clear tags when subjects change
                              setPage(1);
                              return next;
                            });
                          }}
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 transition-colors"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-tight">
                          {s}
                        </span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Tags Filter */}
            <AnimatePresence>
              {filterSubjects.length > 0 && availableFilters.tags.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Popular Tags</h3>
                  <div className="flex flex-wrap gap-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                    {availableFilters.tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => { 
                          setFilterTags(prev => {
                            const next = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
                            setPage(1);
                            return next;
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                          ${filterTags.includes(tag) 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20' 
                            : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600/50 text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400'
                          }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="relative p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm h-[216px]"
            >
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 mb-4 animate-pulse" />
              <div className="h-5 w-3/4 rounded bg-slate-100 dark:bg-slate-700 mb-2 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-700 mb-4 animate-pulse" />
              <div className="h-5 w-16 rounded-lg bg-slate-100 dark:bg-slate-700 mb-4 animate-pulse" />
              <div className="h-8 w-24 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
            </motion.div>
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
    </div>
  );
}
