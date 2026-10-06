import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Search, Lock, PlayCircle, ArrowLeft, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, EmptyState, Skeleton } from '../ui';

export function InstitutionContentLibrary() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Arriving via "Browse" (URL carries domain/type) starts a fresh context —
  // don't inherit a stale subject/tag/search filter from a previous session,
  // which would silently return "0 results" for content that actually exists.
  const freshBrowse = !!(searchParams.get('domain') || searchParams.get('type'));

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subsLoading, setSubsLoading] = useState(true);

  // Filters (Init from URL query OR sessionStorage)
  const [search, setSearch] = useState(() => searchParams.get('search') || (freshBrowse ? '' : sessionStorage.getItem('inst_lib_search') || ''));
  const [debouncedSearch, setDebounced] = useState(search);
  const [filterDomain, setFilterDomain] = useState(() => searchParams.get('domain') || sessionStorage.getItem('inst_lib_domain') || '');
  const [filterType, setFilterType] = useState(() => searchParams.get('type') || sessionStorage.getItem('inst_lib_type') || '');
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
  const [page, setPage] = useState(() => Number(sessionStorage.getItem('inst_lib_page')) || 1);
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
      .catch(() => { })
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
      .catch(() => { });
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
    if (filterType) url += `&contentType=${encodeURIComponent(filterType)}`;
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
  const subscribedTypes = Array.from(new Set(subscriptions.flatMap(s => Array.isArray(s.contentTypes) ? s.contentTypes : [])));
  const totalPages = Math.ceil(totalItems / PER_PAGE);

  return (
    <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 md:flex-row">
      {/* Sidebar for Filters */}
      <div className="w-full shrink-0 space-y-6 md:sticky md:top-24 md:w-[280px]">
        <div className="card card-pad">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <button type="button" onClick={() => navigate('/institution/access')} aria-label="Back to My Content Access"
              className="btn btn-outline btn-icon shrink-0">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 className="!text-xl leading-tight text-ink">Content Library</h1>
              <p className="mt-0.5 text-xs font-semibold text-muted">Advanced Filters</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Search */}
            <div className="relative">
              <label htmlFor="lib-search" className="sr-only">Search resources</label>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" size={16} aria-hidden="true" />
              <input
                id="lib-search"
                type="text"
                placeholder="Search resources..."
                className="input pl-9 pr-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Content Type Filter */}
            <div className="field pt-2">
              <label htmlFor="lib-type" className="field-label">Content Type</label>
              <select id="lib-type" value={filterType} onChange={e => {
                setFilterType(e.target.value);
                setFilterSubjects([]);
                setFilterTags([]);
                setPage(1);
              }}
                className="input cursor-pointer">
                <option value="">All Types</option>
                {(subscribedTypes.length > 0 ? subscribedTypes : ['Books', 'Periodicals', 'Magazines', 'Theses', 'Educational Videos']).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Domain Filter */}
            {availableFilters.domains.length > 0 && (
              <div className="field border-t border-rule pt-4">
                <label htmlFor="lib-domain" className="field-label">Domain</label>
                <select id="lib-domain" value={filterDomain} onChange={e => {
                  setFilterDomain(e.target.value);
                  setFilterSubjects([]);
                  setFilterTags([]);
                  setPage(1);
                }}
                  className="input cursor-pointer">
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
                <motion.fieldset initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-rule pt-4">
                  <legend className="field-label mb-3 float-left w-full">Subject Area</legend>
                  <div className="clear-both max-h-[220px] space-y-2.5 overflow-y-auto pr-2 custom-scrollbar">
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
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-rule-2 accent-[var(--accent)]"
                        />
                        <span className="text-sm leading-tight text-ink-2 transition-colors group-hover:text-accent">{s}</span>
                      </label>
                    ))}
                  </div>
                </motion.fieldset>
              )}
            </AnimatePresence>

            {/* Tags Filter */}
            <AnimatePresence>
              {availableFilters.tags.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-rule pt-4"
                  role="group" aria-labelledby="lib-tags-label">
                  <p id="lib-tags-label" className="field-label mb-3">Topics & Tags</p>
                  <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                    {availableFilters.tags.map(t => {
                      const isSelected = filterTags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            if (isSelected) setFilterTags(filterTags.filter(tag => tag !== t));
                            else setFilterTags([...filterTags, t]);
                            setPage(1);
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${isSelected
                              ? 'bg-accent text-accent-on border-accent'
                              : 'bg-surface text-ink-2 border-rule hover:border-accent hover:text-accent'
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
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted" aria-live="polite">
            Showing <span className="font-semibold text-ink">{totalItems}</span> results
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading content">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] h-auto rounded-xl" />
            ))}
          </div>
        ) : contents.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={BookOpen}
              title="No content found"
              description="Try adjusting your filters or search query to find what you're looking for."
              action={(search || filterSubjects.length > 0 || filterTags.length > 0) ? (
                <Button variant="outline" size="sm"
                  onClick={() => { setSearch(''); setFilterSubjects([]); setFilterTags([]); setFilterDomain(''); setFilterType(''); }}>
                  Clear all filters
                </Button>
              ) : undefined}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {contents.map((item, idx) => {
              const isVideo = item.contentType === 'Educational Videos';
              return (
                <motion.button
                  type="button"
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(idx, 12) * 0.03, duration: 0.2 }}
                  onClick={() => handleOpen(item)}
                  aria-label={`${item.locked ? 'Locked: ' : ''}${item.title}${item.author ? `, ${item.author}` : ''}`}
                  className="card card-interactive group relative flex flex-col overflow-hidden text-left"
                >
                  <div className={`relative w-full ${isVideo ? 'aspect-video' : 'aspect-[3/4]'} ${item.coverImage ? 'bg-ink' : 'bg-accent'} overflow-hidden`}>
                    {item.coverImage ? (
                      <img src={item.coverImage} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                        {isVideo ? <PlayCircle size={64} className="text-white/10" /> : <BookOpen size={64} className="text-white/10" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      <span className="rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
                        {item.contentType}
                      </span>
                    </div>

                    {item.locked && (
                      <div className="absolute top-3 right-3 rounded-lg border border-rule bg-surface/90 p-1.5 text-ink-2 shadow-sm backdrop-blur" aria-hidden="true">
                        <Lock size={14} />
                      </div>
                    )}

                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">
                        <div className="rounded-full bg-accent p-3 text-accent-on shadow-lg">
                          <PlayCircle size={28} fill="currentColor" />
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <h3 className="line-clamp-3 text-sm font-semibold leading-snug">{item.title}</h3>
                      {item.author && <p className="mt-1 line-clamp-1 text-xs text-white/80">{item.author}</p>}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={page === 1}
              onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            >
              Previous
            </Button>
            <p className="px-3 text-sm font-semibold text-ink" aria-current="page">
              Page {page} of {totalPages}
            </p>
            <Button
              variant="outline" size="sm"
              disabled={page === totalPages}
              onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            >
              Next
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
