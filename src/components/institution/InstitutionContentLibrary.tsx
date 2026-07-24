import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Search, Filter, Lock, FileText, PlayCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function InstitutionContentLibrary() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Arriving via "Browse" (URL carries domain/type) starts a fresh context —
  // don't inherit a stale subject/tag/search filter from a previous session,
  // which would silently return "0 results" for content that actually exists.
  const freshBrowse = !!(searchParams.get('domain') || searchParams.get('type'));

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [contents, setContents]           = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [subsLoading, setSubsLoading]     = useState(true);

  // Filters (Init from URL query OR sessionStorage)
  const [search, setSearch]           = useState(() => searchParams.get('search') || (freshBrowse ? '' : sessionStorage.getItem('inst_lib_search') || ''));
  const [debouncedSearch, setDebounced] = useState(search);
  const [filterDomain, setFilterDomain] = useState(() => searchParams.get('domain') || sessionStorage.getItem('inst_lib_domain') || '');
  const [filterType, setFilterType]   = useState(() => searchParams.get('type') || sessionStorage.getItem('inst_lib_type') || '');
  const [filterSubjects, setFilterSubjects] = useState<string[]>(() => {
    const fromUrl = searchParams.get('subjectArea');
    if (fromUrl) return fromUrl.split(',');
    if (freshBrowse) return [];
    return JSON.parse(sessionStorage.getItem('inst_lib_subjects') || '[]');
  });
  const [filterTags, setFilterTags] = useState<string[]>(() => {
    const fromUrl = searchParams.get('tag');
    if (fromUrl) return fromUrl.split(',');
    if (freshBrowse) return [];
    return JSON.parse(sessionStorage.getItem('inst_lib_tags') || '[]');
  });
  
  const [availableFilters, setAvailableFilters] = useState<{ domains: string[], subjects: string[], tags: string[] }>({ domains: [], subjects: [], tags: [] });

  // Pagination
  const PER_PAGE = 24;
  const [page, setPage]         = useState(() => Number(sessionStorage.getItem('inst_lib_page')) || 1);
  const [totalItems, setTotalItems] = useState(0);

  // Persist state changes
  useEffect(() => {
    sessionStorage.setItem('inst_lib_search', search);
    sessionStorage.setItem('inst_lib_domain', filterDomain);
    sessionStorage.setItem('inst_lib_type', filterType);
    sessionStorage.setItem('inst_lib_subjects', JSON.stringify(filterSubjects));
    sessionStorage.setItem('inst_lib_tags', JSON.stringify(filterTags));
    sessionStorage.setItem('inst_lib_page', String(page));
  }, [search, filterDomain, filterType, filterSubjects, filterTags, page]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { 
      if (debouncedSearch !== search) {
        setDebounced(search); 
        setPage(1); 
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, debouncedSearch]);

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

  // Fetch dynamic filters based on selections
  useEffect(() => {
    let url = `/api/content/filters?1=1`;
    if (filterDomain) {
      url += `&domain=${encodeURIComponent(filterDomain)}`;
    } else if (subscriptions.length > 0) {
      const subDomains = Array.from(new Set(subscriptions.flatMap(s => Array.isArray(s.domains) ? s.domains : [])));
      if (subDomains.length > 0) {
        url += `&domain=${encodeURIComponent(subDomains.join(','))}`;
      }
    }
    if (filterType) url += `&contentType=${encodeURIComponent(filterType)}`;
    if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
    if (filterSubjects.length > 0) url += `&subjectArea=${encodeURIComponent(filterSubjects.join(','))}`;

    fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
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
  }, [filterDomain, filterType, debouncedSearch, filterSubjects]);

  // Fetch content based on filters
  const fetchContent = useCallback(() => {
    setLoading(true);
    let url = `/api/content/list?onlyUnlocked=true&page=${page}&limit=${PER_PAGE}`;
    if (filterDomain) {
      url += `&domain=${encodeURIComponent(filterDomain)}`;
    } else {
      const subDomains = Array.from(new Set(subscriptions.flatMap(s => Array.isArray(s.domains) ? s.domains : [])));
      if (subDomains.length > 0) {
        url += `&domain=${encodeURIComponent(subDomains.join(','))}`;
      }
    }
    if (filterType)   url += `&contentType=${encodeURIComponent(filterType)}`;
    if (filterSubjects.length > 0) url += `&subjectArea=${encodeURIComponent(filterSubjects.join(','))}`;
    if (filterTags.length > 0) url += `&tag=${encodeURIComponent(filterTags.join(','))}`;
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
  }, [page, filterDomain, filterType, filterSubjects, filterTags, debouncedSearch]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const handleOpen = (item: any) => {
    if (item.locked) {
      toast.error("This content is outside your institution's subscription scope.");
      return;
    }
    if (item.contentType === 'Educational Videos') {
      navigate(`/institution/videos/player/${item.id}`);
    } else {
      navigate(`/institution/viewer/${item.id}`);
    }
  };

  const subscribedDomains = Array.from(new Set(subscriptions.flatMap(s => Array.isArray(s.domains) ? s.domains : [])));
  const subscribedTypes   = Array.from(new Set(subscriptions.flatMap(s => Array.isArray(s.contentTypes) ? s.contentTypes : [])));
  const totalPages = Math.ceil(totalItems / PER_PAGE);

  return (
    <div className="flex flex-col md:flex-row gap-6 pb-12 items-start">
      {/* Sidebar for Filters */}
      <div className="w-full md:w-[280px] shrink-0 space-y-6 md:sticky md:top-24">
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => navigate('/institution/access')} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors shrink-0 border border-slate-200">
              <ArrowLeft size={18} className="text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">Content Library</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Advanced Filters</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search resources..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 transition-all outline-none text-slate-800 placeholder:text-slate-400"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            {/* Content Type Filter */}
            <div className="pt-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Content Type</h3>
              <select value={filterType} onChange={e => { 
                  setFilterType(e.target.value); 
                  setFilterSubjects([]);
                  setFilterTags([]);
                  setPage(1); 
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 outline-none text-slate-800 transition-all cursor-pointer appearance-none">
                <option value="">All Types</option>
                {(subscribedTypes.length > 0 ? subscribedTypes : ['Books','Periodicals','Magazines','Theses','Educational Videos']).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Domain Filter */}
            {availableFilters.domains.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Domain</h3>
                <select value={filterDomain} onChange={e => { 
                    setFilterDomain(e.target.value); 
                    setFilterSubjects([]);
                    setFilterTags([]);
                    setPage(1); 
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 outline-none text-slate-800 transition-all cursor-pointer appearance-none">
                  <option value="">All Subscribed Domains</option>
                  {availableFilters.domains
                    .filter(d => subscribedDomains.length === 0 || subscribedDomains.includes(d))
                    .map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            
            {/* Subject Filter */}
            <AnimatePresence>
              {availableFilters.subjects.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Subject Area</h3>
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                    {availableFilters.subjects.map(s => (
                      <label key={s} className="flex items-start gap-3 cursor-pointer group">
                        <input 
                          type="checkbox"
                          checked={filterSubjects.includes(s)}
                          onChange={(e) => {
                            if (e.target.checked) setFilterSubjects([...filterSubjects, s]);
                            else setFilterSubjects(filterSubjects.filter(sub => sub !== s));
                            setPage(1);
                          }}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-100 border-slate-300 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-sm text-slate-700 group-hover:text-indigo-600 transition-colors leading-tight">{s}</span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tags Filter */}
            <AnimatePresence>
              {availableFilters.tags.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Topics & Tags</h3>
                  <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                    {availableFilters.tags.map(t => {
                      const isSelected = filterTags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => {
                            if (isSelected) setFilterTags(filterTags.filter(tag => tag !== t));
                            else setFilterTags([...filterTags, t]);
                            setPage(1);
                          }}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 text-white border-indigo-600' 
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <div className="text-slate-500 text-sm font-medium">
            Showing <span className="text-slate-900 font-bold">{totalItems}</span> results
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse flex flex-col h-[280px]">
                <div className="bg-slate-200 rounded-xl aspect-[3/4] w-full" />
                <div className="mt-3 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-full" />
                  <div className="h-3 bg-slate-200 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : contents.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No content found</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto mt-2">Try adjusting your filters or search query to find what you're looking for.</p>
            {(search || filterSubjects.length > 0 || filterTags.length > 0) && (
              <button 
                onClick={() => { setSearch(''); setFilterSubjects([]); setFilterTags([]); setFilterDomain(''); setFilterType(''); }}
                className="mt-6 text-indigo-600 font-bold text-sm hover:text-indigo-700"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {contents.map((item, idx) => {
              const isVideo = item.contentType === 'Educational Videos';
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handleOpen(item)}
                  className="group relative flex flex-col bg-white rounded-2xl overflow-hidden cursor-pointer border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className={`relative w-full ${isVideo ? 'aspect-video' : 'aspect-[3/4]'} ${item.coverImage ? 'bg-slate-900' : 'bg-gradient-to-br from-slate-700 to-slate-900'} overflow-hidden`}>
                    {item.coverImage ? (
                      <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {isVideo ? <PlayCircle size={64} className="text-white/10" /> : <BookOpen size={64} className="text-white/10" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
                    
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-md rounded-md border border-white/10">
                        {item.contentType}
                      </span>
                    </div>

                    {item.locked && (
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-slate-700 p-1.5 rounded-lg shadow-sm border border-slate-200">
                        <Lock size={14} />
                      </div>
                    )}

                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-blue-600 text-white rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                          <PlayCircle size={28} fill="currentColor" />
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <h3 className="font-bold text-sm leading-snug group-hover:text-blue-200 transition-colors">{item.title}</h3>
                      <p className="text-[11px] text-white/70 line-clamp-1 mt-1 font-medium">{item.author}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-12 mb-8">
            <button 
              disabled={page === 1}
              onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
            >
              Previous
            </button>
            <div className="px-4 py-2 text-sm font-bold text-slate-800">
              Page {page} of {totalPages}
            </div>
            <button 
              disabled={page === totalPages}
              onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
