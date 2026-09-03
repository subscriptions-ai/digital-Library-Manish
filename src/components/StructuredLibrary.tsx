import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { DOMAINS, CONTENT_TYPES } from '../constants';
import { SmartPagination } from './SmartPagination';
import { MetadataModal } from './MetadataModal';
import {
  FileText, Search, Archive, Sparkles, ChevronRight, ChevronDown,
  Unlock, Copy, SlidersHorizontal, X, BookMarked, Check,
} from 'lucide-react';

type Mode = 'new' | 'archived';
type Kind = 'articles' | 'books';
type Sort = 'newest' | 'oldest' | 'title';

const PAGE_SIZE = 12;

/**
 * Shared structured-content browser over the ingested Article/Journal/Book
 * dataset. Mounted in both the subscriber dashboard and the institution portal,
 * which have separate viewer routes — hence viewerBasePath.
 */
export function StructuredLibrary({ viewerBasePath = '/dashboard/viewer' }: { viewerBasePath?: string } = {}) {
  const navigate = useNavigate();
  // The journal page lives beside the viewer in whichever portal we are in.
  const journalBase = viewerBasePath.replace(/\/viewer$/, '/journal');
  const authOpts = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  // Filters live in the URL query string → survive back/forward/refresh/remount, and are shareable.
  const [sp, setSp] = useSearchParams();
  const spList = (k: string) => { const v = sp.get(k); return v ? v.split('~').filter(Boolean) : []; };
  const deptNames = useMemo(() => DOMAINS.map((d: any) => d.name), []);
  const journalsSig = useRef<string | null>(null);
  const lastSearch = useRef<string>(sp.get('q') || '');

  const [mode, setMode] = useState<Mode>((sp.get('mode') as Mode) || 'new');
  const [kind, setKind] = useState<Kind>((sp.get('kind') as Kind) || 'articles');
  const [domain, setDomain] = useState(sp.get('domain') || '');
  const [recentOnly, setRecentOnly] = useState(sp.get('recent') === '1');
  const [oaOnly, setOaOnly] = useState(sp.get('oa') === '1');
  const [search, setSearch] = useState(sp.get('q') || '');

  const [debounced, setDebounced] = useState(sp.get('q') || '');
  const [sort, setSort] = useState<Sort>((sp.get('sort') as Sort) || 'newest');

  const [publisher, setPublisher] = useState(sp.get('pub') || '');
  const [publishers, setPublishers] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [journalQuery, setJournalQuery] = useState('');
  const [selJournalIds, setSelJournalIds] = useState<string[]>(spList('jids'));
  const [facets, setFacets] = useState<{ years: number[]; volumes: string[]; issues: string[] }>({ years: [], volumes: [], issues: [] });
  const [year, setYear] = useState(sp.get('year') || '');
  const [volume, setVolume] = useState(sp.get('vol') || '');
  const [issue, setIssue] = useState(sp.get('iss') || '');

  // Archived (legacy Content) filters
  const [aType, setAType] = useState(sp.get('atype') || '');
  const [aSubjects, setASubjects] = useState<string[]>(spList('asub'));
  const [aTags, setATags] = useState<string[]>(spList('atag'));
  const [aFilters, setAFilters] = useState<{ subjects: string[]; tags: string[] }>({ subjects: [], tags: [] });

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(Number(sp.get('page')) || 1);
  const [loading, setLoading] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  // Filter options limited to what the user can access AND that actually has content.
  const [avail, setAvail] = useState<any>(null);
  useEffect(() => {
    fetch('/api/user/available-facets', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => { if (d && d.neu) setAvail(d); }).catch(() => { });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      if (search !== lastSearch.current) { setPage(1); lastSearch.current = search; }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Publishers list (new collection) — scoped to department + access
  useEffect(() => {
    if (mode !== 'new') return;
    const q = new URLSearchParams();
    if (domain) q.set('domain', domain);
    fetch(`/api/library/publishers?${q}`, authOpts()).then(r => r.json()).then(d => setPublishers(Array.isArray(d) ? d : [])).catch(() => setPublishers([]));
  }, [mode, domain]);

  // Journals sidebar
  useEffect(() => {
    if (mode !== 'new' || kind !== 'articles') return;
    const q = new URLSearchParams();
    if (domain) q.set('domain', domain);
    if (publisher) q.set('publisher', publisher);
    if (recentOnly) q.set('recentYears', '2');
    fetch(`/api/library/journals?${q}`, authOpts()).then(r => r.json()).then(d => setJournals(Array.isArray(d) ? d : [])).catch(() => setJournals([]));
    // Clear the journal selection ONLY when dept/kind/mode/recent/publisher genuinely changes.
    // Compare a value signature (not a mount flag) so StrictMode's double-invoke — which
    // re-runs this effect with identical deps — never wipes a restored selection.
    const sig = `${mode}|${kind}|${domain}|${recentOnly}|${publisher}`;
    if (journalsSig.current !== null && journalsSig.current !== sig) {
      setSelJournalIds([]); setYear(''); setVolume(''); setIssue('');
    }
    journalsSig.current = sig;
  }, [mode, kind, domain, recentOnly, publisher]);

  const jidsKey = selJournalIds.join(',');

  // Mirror all filters into the URL query string (replace, so it doesn't spam history).
  // The reader push is a new history entry → Back returns to this exact filtered URL.
  useEffect(() => {
    const p = new URLSearchParams();
    if (mode !== 'new') p.set('mode', mode);
    if (kind !== 'articles') p.set('kind', kind);
    if (domain) p.set('domain', domain);
    if (publisher) p.set('pub', publisher);
    if (oaOnly) p.set('oa', '1');
    if (recentOnly) p.set('recent', '1');
    if (search) p.set('q', search);
    if (sort !== 'newest') p.set('sort', sort);
    if (selJournalIds.length) p.set('jids', selJournalIds.join('~'));
    if (year) p.set('year', String(year));
    if (volume) p.set('vol', String(volume));
    if (issue) p.set('iss', String(issue));
    if (aType) p.set('atype', aType);
    if (aSubjects.length) p.set('asub', aSubjects.join('~'));
    if (aTags.length) p.set('atag', aTags.join('~'));
    if (page > 1) p.set('page', String(page));
    setSp(p, { replace: true });
  }, [mode, kind, domain, publisher, recentOnly, oaOnly, search, sort, jidsKey, year, volume, issue, aType, aSubjects, aTags, page]);

  // Cascading facets (across all selected journals; volume/issue only when exactly one)
  useEffect(() => {
    if (!selJournalIds.length) { setFacets({ years: [], volumes: [], issues: [] }); return; }
    const q = new URLSearchParams({ journalIds: jidsKey });
    if (selJournalIds.length === 1) { if (year) q.set('year', year); if (volume) q.set('volume', volume); }
    fetch(`/api/library/facets?${q}`, authOpts()).then(r => r.json()).then(setFacets).catch(() => { });
  }, [jidsKey, year, volume]);

  // Available archived filters (legacy Content) — subjects & tags
  useEffect(() => {
    if (mode !== 'archived') return;
    let url = `/api/content/filters?1=1`;
    if (domain) url += `&domain=${encodeURIComponent(domain)}`;
    if (aType) url += `&contentType=${encodeURIComponent(aType)}`;
    if (debounced) url += `&search=${encodeURIComponent(debounced)}`;
    if (aSubjects.length) url += `&subjectArea=${encodeURIComponent(aSubjects.join(','))}`;
    fetch(url).then(r => r.json()).then(d => setAFilters({ subjects: d.subjects || [], tags: d.tags || [] })).catch(() => { });
  }, [mode, domain, aType, aSubjects, debounced]);

  // Results
  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (debounced) q.set('search', debounced);
    if (domain) q.set('domain', domain);
    let url: string;
    if (mode === 'archived') {
      q.set('onlyUnlocked', 'false');
      if (aType) q.set('contentType', aType);
      if (aSubjects.length) q.set('subjectArea', aSubjects.join(','));
      if (aTags.length) q.set('tag', aTags.join(','));
      url = `/api/content/list?${q}`;
    } else if (kind === 'books') {
      url = `/api/library/books?${q}`;
    } else {
      if (publisher) q.set('publisher', publisher);
      if (selJournalIds.length) q.set('journalIds', jidsKey);
      if (year) q.set('year', year);
      if (selJournalIds.length === 1) { if (volume) q.set('volume', volume); if (issue) q.set('issue', issue); }
      url = `/api/library/articles?${q}`;
    }
    fetch(url, authOpts()).then(r => r.json())
      .then(d => { setItems(d.data || []); setTotal(d.total || 0); })
      .catch(() => setItems([])).finally(() => setLoading(false));
  }, [mode, kind, domain, publisher, jidsKey, year, volume, issue, debounced, page, aType, aSubjects, aTags]);

  const displayed = useMemo(() => {
    let list = [...items];
    if (oaOnly) list = list.filter(i => ['OpenAccess', 'Free'].includes(i.accessType));
    if (sort === 'oldest') list.sort((a, b) => (a.year || 0) - (b.year || 0));
    else if (sort === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else list.sort((a, b) => (b.year || 0) - (a.year || 0));
    return list;
  }, [items, oaOnly, sort]);

  const filteredJournals = journalQuery ? journals.filter(j => j.title?.toLowerCase().includes(journalQuery.toLowerCase())) : journals;
  const selJournals = journals.filter(j => selJournalIds.includes(j.id));
  const toggleJournal = (id: string) => {
    setSelJournalIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    setYear(''); setVolume(''); setIssue(''); setPage(1);
  };
  // Filter options: access-scoped AND only those that actually have content
  const isAll = !avail || avail.all;
  const deptOptions: string[] = !avail ? deptNames : (mode === 'archived' ? avail.archived.departments : avail.neu.departments);
  const allowedTypes = !avail ? CONTENT_TYPES : (CONTENT_TYPES as any[]).filter(c => avail.archived.contentTypes.includes(c.name));
  const showBooks = !avail ? true : avail.neu.hasBooks;
  const showArticles = !avail ? true : avail.neu.hasArticles;
  useEffect(() => { if (avail && !showBooks && kind === 'books') setKind('articles'); }, [avail, showBooks, kind]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeChips: { label: string; clear: () => void }[] = [];
  if (domain) activeChips.push({ label: domain, clear: () => setDomain('') });
  if (publisher) activeChips.push({ label: publisher, clear: () => { setPublisher(''); setPage(1); } });
  if (selJournals.length) selJournals.forEach(j => activeChips.push({ label: j.title, clear: () => toggleJournal(j.id) }));
  else if (selJournalIds.length) activeChips.push({ label: `${selJournalIds.length} journal(s)`, clear: () => setSelJournalIds([]) });
  if (year) activeChips.push({ label: `Year ${year}`, clear: () => { setYear(''); setVolume(''); setIssue(''); } });
  if (volume) activeChips.push({ label: `Vol ${volume}`, clear: () => { setVolume(''); setIssue(''); } });
  if (issue) activeChips.push({ label: `Issue ${issue}`, clear: () => setIssue('') });
  if (oaOnly) activeChips.push({ label: 'Open Access', clear: () => setOaOnly(false) });
  if (aType) activeChips.push({ label: aType, clear: () => setAType('') });
  aSubjects.forEach(s => activeChips.push({ label: s, clear: () => setASubjects(p => p.filter(x => x !== s)) }));
  aTags.forEach(t => activeChips.push({ label: `#${t}`, clear: () => setATags(p => p.filter(x => x !== t)) }));

  const clearAll = () => { setDomain(''); setPublisher(''); setSelJournalIds([]); setYear(''); setVolume(''); setIssue(''); setOaOnly(false); setRecentOnly(false); setSearch(''); setAType(''); setASubjects([]); setATags([]); };

  return (
    <div className="text-slate-800 dark:text-slate-100 pb-28">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BookMarked className="text-blue-600" size={24} /> Journals &amp; Books
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Discover open-access research — filter precisely, read in your secure viewer.</p>
        </div>
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
          <button onClick={() => setMode('new')} className={seg(mode === 'new')}><Sparkles size={14} /> New Collection</button>
          <button onClick={() => setMode('archived')} className={seg(mode === 'archived')}><Archive size={14} /> Archived</button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles, authors, journals, topics…"
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm shadow-sm outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-500 transition-all" />
        <button onClick={() => setMobileFilters(v => !v)} className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
          <SlidersHorizontal size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Sidebar filters ── */}
        <aside className={`lg:col-span-1 space-y-4 ${mobileFilters ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><SlidersHorizontal size={13} /> Refine</span>
              {activeChips.length > 0 && <button onClick={clearAll} className="text-[11px] font-bold text-blue-600 hover:underline">Clear All</button>}
            </div>

            <div className="p-4 space-y-4">
              {mode === 'new' && (showArticles || showBooks) && (
                <div className="inline-flex w-full bg-slate-100 dark:bg-slate-700/60 rounded-lg p-1">
                  {showArticles && <button onClick={() => setKind('articles')} className={seg2(kind === 'articles')}>Articles</button>}
                  {showBooks && <button onClick={() => setKind('books')} className={seg2(kind === 'books')}>Books</button>}
                </div>
              )}

              <Group label="Department">
                <select value={domain} onChange={e => { setDomain(e.target.value); setPublisher(''); setPage(1); }} className={selCls}>
                  <option value="">{isAll ? 'All Departments' : 'All My Departments'}</option>
                  {deptOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Group>

              {mode === 'new' && publishers.length > 0 && (
                <Group label="Publisher">
                  <select value={publisher} onChange={e => { setPublisher(e.target.value); setPage(1); }} className={selCls}>
                    <option value="">All Publishers</option>
                    {publishers.map((p: any) => <option key={p.name} value={p.name}>{p.name} ({p.count})</option>)}
                  </select>
                </Group>
              )}

              {mode === 'new' && (
                <Group label="Independent Filters">
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={oaOnly} onChange={e => setOaOnly(e.target.checked)} className="rounded text-emerald-600 w-4 h-4" />
                    <Unlock size={13} className="text-emerald-600" /> Open Access only
                  </label>
                  {kind === 'articles' && (
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer mt-2">
                      <input type="checkbox" checked={recentOnly} onChange={e => setRecentOnly(e.target.checked)} className="rounded text-blue-600 w-4 h-4" />
                      <Sparkles size={13} className="text-blue-600" /> New journals (last 2 yrs)
                    </label>
                  )}
                </Group>
              )}

              {mode === 'archived' && (
                <>
                  <Group label="Content Type">
                    <select value={aType} onChange={e => { setAType(e.target.value); setASubjects([]); setATags([]); setPage(1); }} className={selCls}>
                      <option value="">{isAll ? 'All Types' : 'All My Types'}</option>
                      {allowedTypes.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </Group>
                  {aFilters.subjects.length > 0 && (
                    <Group label="Subject Area">
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {aFilters.subjects.map(s => (
                          <label key={s} className="flex items-start gap-2.5 cursor-pointer group">
                            <input type="checkbox" checked={aSubjects.includes(s)} onChange={() => { setASubjects(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]); setATags([]); setPage(1); }} className="mt-0.5 w-4 h-4 rounded text-blue-600" />
                            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300 group-hover:text-blue-600 leading-tight">{s}</span>
                          </label>
                        ))}
                      </div>
                    </Group>
                  )}
                  {aSubjects.length > 0 && aFilters.tags.length > 0 && (
                    <Group label="Popular Tags">
                      <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
                        {aFilters.tags.map(t => (
                          <button key={t} onClick={() => { setATags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]); setPage(1); }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${aTags.includes(t) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}>{t}</button>
                        ))}
                      </div>
                    </Group>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Journals list + cascade */}
          {mode === 'new' && kind === 'articles' && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Journals ({journals.length})</span>
                  {selJournalIds.length > 0 && <button onClick={() => { setSelJournalIds([]); setYear(''); setVolume(''); setIssue(''); }} className="text-[10px] font-bold text-blue-600 hover:underline">{selJournalIds.length} selected · clear</button>}
                </div>
                <div className="relative mt-2">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={journalQuery} onChange={e => setJournalQuery(e.target.value)} placeholder="Filter journals…"
                    className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                {filteredJournals.length === 0 ? <p className="text-xs text-slate-400 px-2 py-3">No journals yet.</p> :
                  filteredJournals.map(j => {
                    const on = selJournalIds.includes(j.id);
                    return (
                      <button key={j.id} onClick={() => toggleJournal(j.id)}
                        className={`w-full text-left px-2 py-2 rounded-lg text-xs mb-0.5 flex items-center justify-between gap-2 transition-colors ${on ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>{on && <Check size={11} className="text-white" />}</span>
                          <span className="truncate">{j.title}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{j.articleCount}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            title="Open this journal and its volumes"
                            onClick={e => { e.stopPropagation(); navigate(`${journalBase}/${encodeURIComponent(j.issn || j.id)}`); }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`${journalBase}/${encodeURIComponent(j.issn || j.id)}`); } }}
                            className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer"
                          >
                            <ChevronRight size={13} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
              {selJournalIds.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-700 p-3 space-y-3">
                  {facets.years.length > 0 && <ChipRow label="Year" values={facets.years.map(String)} active={year} onPick={v => { setYear(v === year ? '' : v); setVolume(''); setIssue(''); setPage(1); }} />}
                  {selJournalIds.length === 1 && facets.volumes.length > 0 && <ChipRow label="Volume" prefix="Vol " values={facets.volumes} active={volume} onPick={v => { setVolume(v === volume ? '' : v); setIssue(''); setPage(1); }} />}
                  {selJournalIds.length === 1 && facets.issues.length > 0 && <ChipRow label="Issue" prefix="Iss " values={facets.issues} active={issue} onPick={v => { setIssue(v === issue ? '' : v); setPage(1); }} />}
                  {selJournalIds.length > 1 && <p className="text-[10px] text-slate-400">Volume/Issue drill-down shows when a single journal is selected.</p>}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Results ── */}
        <main className="lg:col-span-3">
          {/* result toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-sm"><b className="text-slate-900 dark:text-white">{total}</b> <span className="text-slate-500">results</span></span>
              {activeChips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                  {c.label.length > 22 ? c.label.slice(0, 22) + '…' : c.label}
                  <button onClick={c.clear}><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:block">Sort</span>
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 outline-none focus:border-blue-500">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-20 flex justify-center"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : displayed.length === 0 ? (
            <div className="py-20 text-center text-muted bg-surface rounded-md border border-rule">
              <FileText size={30} className="mx-auto mb-2 opacity-40" />
              No results. {mode === 'new' ? 'Try another department, or ingest data.' : 'No archived items match.'}
            </div>
          ) : (
            <div className="bg-surface border border-rule rounded-md divide-y divide-rule">
              {displayed.map((it, i) => (
                <ResultCard
                  key={it.id || i}
                  it={it}
                  n={(page - 1) * PAGE_SIZE + i + 1}
                  kind={kind}
                  mode={mode}
                  journalBase={journalBase}
                  onOpen={() => navigate(`${viewerBasePath}/${it.id}`)}
                />
              ))}
            </div>
          )}

          {/* smart pagination */}
          <SmartPagination page={page} totalPages={totalPages} onChange={setPage} total={total} pageSize={PAGE_SIZE} className="mt-6" />
        </main>
      </div>
    </div>
  );
}

// ───────── record ─────────
/**
 * One result, as a catalogue record.
 *
 * This was a card: rounded, shadowed, five coloured pills, a bold blue title and
 * a filled button. Twelve of them read as twelve separate objects rather than one
 * list, and nothing led. A record is a ruled row — the title in the serif because
 * it is what the reader came for, the identifiers in mono because that is how a
 * catalogue has always set them, and colour spent only on whether the thing can
 * actually be read.
 */
function ResultCard({ it, n, kind, mode, onOpen, journalBase }: {
  it: any; n: number; kind: Kind; mode: Mode; onOpen: () => void; journalBase: string;
}) {
  const isBook = kind === 'books' || it.contentType === 'Books';
  const hasPdf = !!(it.pdfUrl || it.fileUrl);
  // Legacy archived rows come back with fileUrl stripped when the user lacks access —
  // those still route to the viewer so the upgrade prompt shows. Only genuinely
  // file-less records ("metadata only") get the Read More popup.
  const metaOnly = !hasPdf && !it.locked;
  const [showMeta, setShowMeta] = useState(false);
  const [copied, setCopied] = useState(false);

  const authors = (it.authors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const shown = authors.slice(0, 3);
  const journalKey = it.journalIssn || it.journalId;

  // Volume and issue read as 9(3), the way a citation is written.
  const volIss = it.volume ? `${it.volume}${it.issue ? `(${it.issue})` : ''}` : (it.issue ? `(${it.issue})` : '');
  const bits: string[] = isBook
    ? [it.publisherName, it.isbn ? `ISBN ${it.isbn}` : '', it.edition ? `${it.edition} ed.` : '', it.year].filter(Boolean)
    : [volIss, it.year, it.pages ? `pp ${it.pages}` : '', it.journalIssn ? `ISSN ${it.journalIssn}` : ''].filter(Boolean);

  const open = metaOnly ? () => setShowMeta(true) : onOpen;
  const copyDoi = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!it.doi) return;
    navigator.clipboard?.writeText(it.doi);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Content type only says something when it varies. Every article in the new
  // collection is a periodical, so naming it on all of them is noise.
  const typeMark = isBook ? 'Book' : (mode === 'archived' && it.contentType !== 'Periodicals' ? it.contentType : null);

  return (
    <div className="group flex gap-3 px-4 py-4 sm:gap-4 sm:px-5">
      <span className="tnum hidden shrink-0 pt-1 font-mono text-[11px] text-faint sm:block sm:w-7">{n}</span>

      <div className="min-w-0 flex-1">
        <button onClick={open} className="block w-full text-left">
          <h3 className="font-serif text-[17px] font-medium leading-snug text-ink group-hover:text-accent sm:text-[17.5px]">
            {it.title}
          </h3>
        </button>

        {authors.length > 0 && (
          <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
            {shown.join(' · ')}
            {authors.length > 3 && <span className="text-faint"> +{authors.length - 3} more</span>}
          </p>
        )}

        <p className="tnum mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted">
          {!isBook && it.journalName && (
            journalKey ? (
              <Link
                to={`${journalBase}/${encodeURIComponent(journalKey)}`}
                onClick={e => e.stopPropagation()}
                className="text-ink-2 hover:text-accent hover:underline"
              >
                {it.journalName}
              </Link>
            ) : <span className="text-ink-2">{it.journalName}</span>
          )}
          {bits.map((b, i) => (
            <React.Fragment key={i}>
              {(i > 0 || (!isBook && it.journalName)) && <span className="text-rule-2">·</span>}
              <span>{b}</span>
            </React.Fragment>
          ))}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {hasPdf && <Mark tone="accent">Full text</Mark>}
          {metaOnly && <Mark tone="caution">Metadata only</Mark>}
          {it.locked && <Mark>Subscription</Mark>}
          {typeMark && <Mark>{typeMark}</Mark>}
          {it.domain && <Mark>{it.domain}</Mark>}
          {it.doi && (
            <button
              onClick={copyDoi}
              title="Copy DOI"
              className="inline-flex items-center gap-1 rounded-[3px] border border-rule-2 px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'DOI'}
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 self-start pt-0.5">
        <button
          onClick={open}
          className="font-mono text-[11px] uppercase tracking-wider text-muted underline-offset-4 hover:text-accent hover:underline"
        >
          {metaOnly ? 'Details' : hasPdf ? 'Read' : 'Open'}
        </button>
      </div>

      {showMeta && <MetadataModal item={it} isBook={isBook} onClose={() => setShowMeta(false)} />}
    </div>
  );
}

/** An outlined mark. Colour is spent only on whether the record can be read. */
function Mark({ children, tone }: { children: React.ReactNode; tone?: 'accent' | 'caution' }) {
  const t = tone === 'accent' ? 'border-accent text-accent bg-accent-soft'
          : tone === 'caution' ? 'border-caution text-caution bg-caution-soft'
          : 'border-rule-2 text-muted';
  return (
    <span className={`rounded-[3px] border px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide ${t}`}>
      {children}
    </span>
  );
}

// ───────── small helpers ─────────
const seg = (active: boolean) => `inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${active ? 'bg-slate-900 dark:bg-blue-600 text-white shadow' : 'text-slate-500 dark:text-slate-400'}`;
const seg2 = (active: boolean) => `flex-1 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${active ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`;
const selCls = "w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 outline-none focus:border-blue-500";

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${className}`}>{children}</span>;
}
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
function ChipRow({ label, values, active, onPick, prefix = '' }: { label: string; values: string[]; active: string; onPick: (v: string) => void; prefix?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <button key={v} onClick={() => onPick(v)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${active === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-400'}`}>
            {prefix}{v}
          </button>
        ))}
      </div>
    </div>
  );
}
