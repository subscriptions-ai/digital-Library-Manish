import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { CONTENT_TYPES } from '../../constants';
import { SmartPagination } from '../SmartPagination';
import {
  Lock, FileText, PlayCircle, Search, SlidersHorizontal, X, ArrowRight, BookOpen, Library, ChevronDown, ChevronRight,
} from 'lucide-react';

type Sort = 'title' | 'subject';

export function MyContentLibrary() {
  const [params] = useSearchParams();
  const urlDomain = params.get('domain') || '';
  const urlType = params.get('type') || '';
  const navigate = useNavigate();

  const [contents, setContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => sessionStorage.getItem('my_lib_search') || '');
  const [debounced, setDebounced] = useState(search);
  const [selectedDomain, setSelectedDomain] = useState(() => urlDomain || sessionStorage.getItem('my_lib_domain') || '');
  const [contentType, setContentType] = useState(() => urlType || sessionStorage.getItem('my_lib_ctype') || '');
  const [filterSubjects, setFilterSubjects] = useState<string[]>(() => JSON.parse(sessionStorage.getItem('my_lib_subjects') || '[]'));
  const [filterTags, setFilterTags] = useState<string[]>(() => JSON.parse(sessionStorage.getItem('my_lib_tags') || '[]'));
  const [available, setAvailable] = useState<{ domains: string[]; subjects: string[]; tags: string[] }>({ domains: [], subjects: [], tags: [] });
  const [avail, setAvail] = useState<any>(null);
  useEffect(() => {
    fetch('/api/user/available-facets', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => { if (d && d.legacy) setAvail(d); }).catch(() => {});
  }, []);
  // Only departments/types the user can access AND that actually have content
  const scopedDomains: string[] = !avail ? available.domains : avail.legacy.departments;
  const scopedTypes = !avail ? CONTENT_TYPES : (CONTENT_TYPES as any[]).filter(c => avail.legacy.contentTypes.includes(c.name));
  const [sort, setSort] = useState<Sort>('title');
  const [mobileFilters, setMobileFilters] = useState(false);
  const ITEMS_PER_PAGE = 18;
  const [page, setPage] = useState(() => Number(sessionStorage.getItem('my_lib_page')) || 1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    sessionStorage.setItem('my_lib_search', search);
    sessionStorage.setItem('my_lib_domain', selectedDomain);
    sessionStorage.setItem('my_lib_ctype', contentType);
    sessionStorage.setItem('my_lib_subjects', JSON.stringify(filterSubjects));
    sessionStorage.setItem('my_lib_tags', JSON.stringify(filterTags));
    sessionStorage.setItem('my_lib_page', String(page));
  }, [search, selectedDomain, contentType, filterSubjects, filterTags, page]);

  useEffect(() => { const t = setTimeout(() => { if (debounced !== search) { setDebounced(search); setPage(1); } }, 350); return () => clearTimeout(t); }, [search, debounced]);

  // available filters
  useEffect(() => {
    let url = `/api/content/filters?1=1`;
    if (selectedDomain) url += `&domain=${encodeURIComponent(selectedDomain)}`;
    if (contentType) url += `&contentType=${encodeURIComponent(contentType)}`;
    if (debounced) url += `&search=${encodeURIComponent(debounced)}`;
    if (filterSubjects.length) url += `&subjectArea=${encodeURIComponent(filterSubjects.join(','))}`;
    fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(d => setAvailable(prev => ({ domains: d.domains?.length ? d.domains : prev.domains, subjects: d.subjects || [], tags: d.tags || [] })))
      .catch(() => {});
  }, [selectedDomain, contentType, filterSubjects, debounced]);

  // content
  useEffect(() => {
    setLoading(true);
    let url = `/api/content/list?onlyUnlocked=true&page=${page}&limit=${ITEMS_PER_PAGE}`;
    if (selectedDomain) url += `&domain=${encodeURIComponent(selectedDomain)}`;
    if (contentType) url += `&contentType=${encodeURIComponent(contentType)}`;
    if (filterSubjects.length) url += `&subjectArea=${encodeURIComponent(filterSubjects.join(','))}`;
    if (filterTags.length) url += `&tag=${encodeURIComponent(filterTags.join(','))}`;
    if (debounced) url += `&search=${encodeURIComponent(debounced)}`;
    fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(d => { const items = Array.isArray(d) ? d : (d.data || []); setContents(items); setTotal(d.total ?? items.length); })
      .catch(() => toast.error('Failed to load content'))
      .finally(() => setLoading(false));
  }, [selectedDomain, contentType, page, filterSubjects, filterTags, debounced]);

  const open = (item: any) => {
    if (item.locked) { toast.error('This content is locked. Please upgrade your subscription.'); return; }
    if (item.contentType === 'Educational Videos') navigate(`/dashboard/videos/player/${item.id}`);
    else navigate(`/dashboard/viewer/${item.id}`);
  };

  const displayed = useMemo(() => {
    const list = [...contents];
    if (sort === 'subject') list.sort((a, b) => (a.subjectArea || '').localeCompare(b.subjectArea || ''));
    else list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return list;
  }, [contents, sort]);

  const toggleSubject = (s: string) => { setFilterSubjects(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]); setFilterTags([]); setPage(1); };
  const toggleTag = (t: string) => { setFilterTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]); setPage(1); };

  const chips: { label: string; clear: () => void }[] = [];
  if (selectedDomain && !urlDomain) chips.push({ label: selectedDomain, clear: () => { setSelectedDomain(''); setFilterSubjects([]); setFilterTags([]); } });
  if (contentType && !urlType) chips.push({ label: contentType, clear: () => setContentType('') });
  filterSubjects.forEach(s => chips.push({ label: s, clear: () => setFilterSubjects(p => p.filter(x => x !== s)) }));
  filterTags.forEach(t => chips.push({ label: `#${t}`, clear: () => setFilterTags(p => p.filter(x => x !== t)) }));
  const clearAll = () => { if (!urlDomain) setSelectedDomain(''); if (!urlType) setContentType(''); setFilterSubjects([]); setFilterTags([]); setSearch(''); };
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  return (
    <div className="text-slate-800 dark:text-slate-100 pb-28">
      {/* header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Library className="text-blue-600" size={24} /> {urlType || 'My Library'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your subscribed collection — {urlDomain || selectedDomain || 'all domains'}.</p>
        </div>
      </div>

      {/* search */}
      <div className="relative mb-5">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your resources, authors, subjects…"
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm shadow-sm outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-500 transition-all" />
        <button onClick={() => setMobileFilters(v => !v)} className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"><SlidersHorizontal size={16} /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* sidebar */}
        <aside className={`lg:col-span-1 space-y-4 ${mobileFilters ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><SlidersHorizontal size={13} /> Refine</span>
              {chips.length > 0 && <button onClick={clearAll} className="text-[11px] font-bold text-blue-600 hover:underline">Clear All</button>}
            </div>
            <div className="p-4 space-y-4">
              {!urlDomain && (
                <Group label="Domain">
                  <select value={selectedDomain} onChange={e => { setSelectedDomain(e.target.value); setFilterSubjects([]); setFilterTags([]); setPage(1); }} className={selCls}>
                    <option value="">All Domains</option>
                    {scopedDomains.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Group>
              )}
              {!urlType && (
                <Group label="Content Type">
                  <select value={contentType} onChange={e => { setContentType(e.target.value); setPage(1); }} className={selCls}>
                    <option value="">All Types</option>
                    {scopedTypes.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </Group>
              )}
              {(selectedDomain || urlDomain) && available.subjects.length > 0 && (
                <Group label="Subject Area">
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {available.subjects.map(s => (
                      <label key={s} className="flex items-start gap-2.5 cursor-pointer group">
                        <input type="checkbox" checked={filterSubjects.includes(s)} onChange={() => toggleSubject(s)} className="mt-0.5 w-4 h-4 rounded text-blue-600" />
                        <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300 group-hover:text-blue-600 leading-tight">{s}</span>
                      </label>
                    ))}
                  </div>
                </Group>
              )}
              {filterSubjects.length > 0 && available.tags.length > 0 && (
                <Group label="Popular Tags">
                  <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
                    {available.tags.map(t => (
                      <button key={t} onClick={() => toggleTag(t)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${filterTags.includes(t) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}>{t}</button>
                    ))}
                  </div>
                </Group>
              )}
            </div>
          </div>
        </aside>

        {/* results */}
        <main className="lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-sm"><b className="text-slate-900 dark:text-white">{total}</b> <span className="text-slate-500">items</span></span>
              {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                  {c.label.length > 22 ? c.label.slice(0, 22) + '…' : c.label}<button onClick={c.clear}><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:block">Sort</span>
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 outline-none focus:border-blue-500">
                <option value="title">Title A–Z</option>
                <option value="subject">Subject</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-40 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 animate-pulse" />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <FileText size={30} className="mx-auto mb-2 opacity-40" /> No content matches your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayed.map(c => <LibraryCard key={c.id} c={c} onOpen={() => open(c)} />)}
            </div>
          )}

          <SmartPagination page={page} totalPages={totalPages} onChange={setPage} total={total} pageSize={ITEMS_PER_PAGE} className="mt-6" />
        </main>
      </div>
    </div>
  );
}

function LibraryCard({ c, onOpen }: { c: any; onOpen: () => void }) {
  const isVideo = c.contentType === 'Educational Videos';
  const isBook = c.contentType === 'Books';
  const locked = !!c.locked;
  const authors = (c.authors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  return (
    <button onClick={onOpen} disabled={locked}
      className={`text-left flex flex-col rounded-2xl border p-5 transition-all ${locked ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer'}`}>
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center mb-3 ${locked ? 'bg-slate-200 dark:bg-slate-700 text-slate-400' : isVideo ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600' : isBook ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'}`}>
        {locked ? <Lock size={18} /> : isVideo ? <PlayCircle size={18} /> : isBook ? <BookOpen size={18} /> : <FileText size={18} />}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {c.contentType && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{c.contentType}</span>}
        {c.domain && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{c.domain}</span>}
      </div>
      <h3 className={`font-bold text-[15px] leading-snug mb-1 line-clamp-3 ${locked ? 'text-slate-500' : 'text-slate-900 dark:text-white'}`}>{c.title}</h3>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
        {authors.slice(0, 2).join(', ')}{authors.length > 2 ? ` +${authors.length - 2}` : ''}{c.subjectArea ? ` · ${c.subjectArea}` : ''}
      </p>
      <div className="mt-auto">
        {locked ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-lg"><Lock size={12} /> Locked</span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg ${isVideo ? 'text-purple-700 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300' : 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300'}`}>
            {isVideo ? 'Watch Now' : 'Read Now'} <ArrowRight size={13} />
          </span>
        )}
      </div>
    </button>
  );
}

const selCls = "w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 outline-none focus:border-blue-500";
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        {label} {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && children}
    </div>
  );
}
