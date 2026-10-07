import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { DOMAINS, CONTENT_TYPES } from '../constants';
import { SmartPagination } from './SmartPagination';
import { MetadataModal } from './MetadataModal';
import {
  FileText, Search, Archive, Sparkles, ChevronRight, ChevronDown,
  Unlock, Copy, SlidersHorizontal, X, BookMarked, Check, Lock,
} from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, buttonClass, type BadgeTone } from './ui';
import { useAllowance, inCooldown, clockTime } from './membership/ReadingClock';

type Mode = 'new' | 'archived';
type Kind = 'articles' | 'books';
type Sort = 'newest' | 'added' | 'oldest' | 'title';

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
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearSearch = () => {
    setSearch('');
    setDebounced('');
    setPage(1);
    lastSearch.current = '';
    searchInputRef.current?.focus();
  };

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
  // A failed load is said as a failure, not shown as "0 results" — the shelf is not empty.
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [subjectQuery, setSubjectQuery] = useState('');
  // The free member's clock. While they are waiting, the way into a reader is shut, and the
  // list says so — with the time it opens — rather than offering "Read" for a door that is locked.
  // msUntil counts down locally, so "Read" comes back by itself when the wait ends.
  const { allowance, msUntil } = useAllowance();
  const waiting = inCooldown(allowance, msUntil);
  const lockedLabel = !waiting ? '' : allowance?.state === 'spent' ? 'Available after midnight' : `Available at ${clockTime(allowance?.nextOpensAt)}`;
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

  // Narrowing or reordering changes what the first page holds, so page 20 of the
  // old result set is not a place to stay.
  const narrowSig = useRef<string | null>(null);
  useEffect(() => {
    const sig = `${oaOnly}|${sort}`;
    if (narrowSig.current !== null && narrowSig.current !== sig) setPage(1);
    narrowSig.current = sig;
  }, [oaOnly, sort]);

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
    setFailed(false);
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
    } else {
      // Open access and sort go to the server. Filtering the page it had just
      // sent back showed three results under a heading claiming 27,056, and
      // ordering those rows restarted the order on every page.
      if (oaOnly) q.set('oa', '1');
      if (sort !== 'newest') q.set('sort', sort);
      if (kind === 'books') {
        url = `/api/library/books?${q}`;
      } else {
        if (publisher) q.set('publisher', publisher);
        if (selJournalIds.length) q.set('journalIds', jidsKey);
        if (year) q.set('year', year);
        if (selJournalIds.length === 1) { if (volume) q.set('volume', volume); if (issue) q.set('issue', issue); }
        url = `/api/library/articles?${q}`;
      }
    }
    fetch(url, authOpts()).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { setItems(d.data || []); setTotal(d.total || 0); })
      .catch(() => { setItems([]); setFailed(true); }).finally(() => setLoading(false));
  }, [mode, kind, domain, publisher, jidsKey, year, volume, issue, debounced, page, aType, aSubjects, aTags, oaOnly, sort, retryKey]);

  const displayed = items;

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
  // A view with nothing in it for this member is not offered. Until the server has answered, both are.
  const showCollection = !avail || avail.all || showArticles || showBooks;
  const showArchive = !avail || avail.all || (avail.archived?.departments?.length ?? 0) > 0;
  useEffect(() => {
    if (!avail) return;
    if (mode === 'archived' && !showArchive) setMode('new');
    else if (mode === 'new' && !showCollection && showArchive) setMode('archived');
  }, [avail, mode, showArchive, showCollection]);

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
  // The search words are a narrowing too, so they get a chip like the rest.
  if (search) activeChips.push({ label: `“${search}”`, clear: () => { setSearch(''); setDebounced(''); setPage(1); lastSearch.current = ''; } });

  const clearAll = () => { setDomain(''); setPublisher(''); setSelJournalIds([]); setYear(''); setVolume(''); setIssue(''); setOaOnly(false); setRecentOnly(false); setSearch(''); setAType(''); setASubjects([]); setATags([]); };

  const hasNarrowing = activeChips.length > 0;

  return (
    <div className="text-ink pb-28">
      <PageHeader
        title={<span className="flex items-center gap-2"><BookMarked className="shrink-0 text-accent" size={24} aria-hidden="true" /> Content Library</span>}
        description="Discover academic research — filter precisely and read in your secure viewer."
        actions={(showCollection && showArchive) ? (
          // These are two views of the library, shown only where the member has something in them.
          <div role="group" aria-label="Collection" className="inline-flex w-fit rounded-lg bg-surface-2 p-1">
            <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')} className={seg(mode === 'new')}><Sparkles size={14} aria-hidden="true" /> New Collection</button>
            <button type="button" aria-pressed={mode === 'archived'} onClick={() => setMode('archived')} className={seg(mode === 'archived')}><Archive size={14} aria-hidden="true" /> Archived</button>
          </div>
        ) : undefined}
      />

      {/* Search inside the current filters. The header's search box is the one that
          covers the whole library; this one is named so the two are not confused. */}
      <div className="mb-6">
        <label htmlFor="library-search" className="field-label">Search within these results</label>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              id="library-search"
              ref={searchInputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-describedby="library-search-help"
              placeholder="Title, author or keyword…"
              className="input pl-9 pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                title="Clear search"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileFilters(v => !v)}
            aria-expanded={mobileFilters}
            aria-controls="library-filters"
            className={buttonClass('outline', 'md', 'shrink-0 lg:hidden')}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filters
            {hasNarrowing && <span className="tnum rounded-full bg-accent px-1.5 text-xs text-accent-on">{activeChips.length}</span>}
          </button>
        </div>
        <p id="library-search-help" className="field-help mt-1.5">Works together with the filters you have chosen.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* ── Sidebar filters ── */}
        <aside id="library-filters" aria-label="Filters" className={`min-w-0 space-y-4 lg:col-span-1 ${mobileFilters ? 'block' : 'hidden lg:block'}`}>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"><SlidersHorizontal size={14} aria-hidden="true" /> Refine</h2>
              {hasNarrowing && <button type="button" onClick={clearAll} className="text-xs font-semibold text-accent hover:underline">Clear all</button>}
            </div>

            <div className="space-y-5 p-4">
              {mode === 'new' && (showArticles || showBooks) && (
                <div role="group" aria-label="Content kind" className="inline-flex w-full rounded-lg bg-surface-2 p-1">
                  {showArticles && <button type="button" aria-pressed={kind === 'articles'} onClick={() => setKind('articles')} className={seg2(kind === 'articles')}>Articles</button>}
                  {showBooks && <button type="button" aria-pressed={kind === 'books'} onClick={() => setKind('books')} className={seg2(kind === 'books')}>Books</button>}
                </div>
              )}

              <Group label="Department">
                <select aria-label="Department" value={domain} onChange={e => { setDomain(e.target.value); setPublisher(''); setPage(1); }} className={selCls}>
                  <option value="">{isAll ? 'All Departments' : 'All My Departments'}</option>
                  {deptOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Group>

              {mode === 'new' && publishers.length > 0 && (
                <Group label="Publisher">
                  <select aria-label="Publisher" value={publisher} onChange={e => { setPublisher(e.target.value); setPage(1); }} className={selCls}>
                    <option value="">All Publishers</option>
                    {publishers.map((p: any) => <option key={p.name} value={p.name}>{p.name} ({p.count})</option>)}
                  </select>
                </Group>
              )}

              {mode === 'new' && (
                <Group label="Independent Filters">
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                      <input type="checkbox" checked={oaOnly} onChange={e => setOaOnly(e.target.checked)} className={checkCls} />
                      <Unlock size={14} aria-hidden="true" className="text-accent" /> Open Access only
                    </label>
                    {kind === 'articles' && (
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                        <input type="checkbox" checked={recentOnly} onChange={e => setRecentOnly(e.target.checked)} className={checkCls} />
                        <Sparkles size={14} aria-hidden="true" className="text-accent" /> New journals (last 2 yrs)
                      </label>
                    )}
                  </div>
                </Group>
              )}

              {mode === 'archived' && (
                <>
                  <Group label="Content Type">
                    <select aria-label="Content type" value={aType} onChange={e => { setAType(e.target.value); setASubjects([]); setATags([]); setPage(1); }} className={selCls}>
                      <option value="">{isAll ? 'All Types' : 'All My Types'}</option>
                      {allowedTypes.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </Group>
                  {aFilters.subjects.length > 0 && (
                    <Group label="Subject Area">
                      <div className="relative mb-2">
                        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                        <input value={subjectQuery} onChange={e => setSubjectQuery(e.target.value)}
                          aria-label="Filter subject areas" placeholder="Filter subject areas…"
                          className={miniInputCls} />
                      </div>
                      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                        {/* A subject you have ticked stays listed even when the filter hides its neighbours. */}
                        {aFilters.subjects.filter(s => !subjectQuery || aSubjects.includes(s) || s.toLowerCase().includes(subjectQuery.trim().toLowerCase())).map(s => (
                          <label key={s} className="group flex cursor-pointer items-start gap-2">
                            <input type="checkbox" checked={aSubjects.includes(s)} onChange={() => { setASubjects(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]); setATags([]); setPage(1); }} className={`mt-0.5 ${checkCls}`} />
                            <span className="text-[13px] leading-tight text-ink-2 group-hover:text-accent">{s}</span>
                          </label>
                        ))}
                        {subjectQuery && !aFilters.subjects.some(s => s.toLowerCase().includes(subjectQuery.trim().toLowerCase())) && (
                          <p className="text-xs text-muted">No subject area matches.</p>
                        )}
                      </div>
                    </Group>
                  )}
                  {aSubjects.length > 0 && aFilters.tags.length > 0 && (
                    <Group label="Popular Tags">
                      <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                        {aFilters.tags.map(t => (
                          <button key={t} type="button" aria-pressed={aTags.includes(t)} onClick={() => { setATags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]); setPage(1); }}
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${aTags.includes(t) ? 'border-accent bg-accent text-accent-on' : 'border-rule bg-surface-2 text-ink-2 hover:border-accent'}`}>{t}</button>
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
            <div className="card">
              <div className="border-b border-rule px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Journals <span className="tnum">({journals.length})</span></h2>
                  {selJournalIds.length > 0 && <button type="button" onClick={() => { setSelJournalIds([]); setYear(''); setVolume(''); setIssue(''); }} className="text-xs font-semibold text-accent hover:underline">{selJournalIds.length} selected · clear</button>}
                </div>
                <div className="relative mt-2">
                  <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                  <input
                    value={journalQuery}
                    onChange={e => setJournalQuery(e.target.value)}
                    aria-label="Filter journals"
                    placeholder="Filter journals…"
                    className={`${miniInputCls} pr-7`}
                  />
                  {journalQuery && (
                    <button
                      type="button"
                      onClick={() => setJournalQuery('')}
                      title="Clear filter"
                      aria-label="Clear journal filter"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint transition-colors hover:text-ink"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <ul className="max-h-64 overflow-y-auto p-2">
                {filteredJournals.length === 0 ? <li className="px-2 py-3 text-xs text-muted">{journalQuery ? 'No journal matches.' : 'No journals yet.'}</li> :
                  filteredJournals.map(j => {
                    const on = selJournalIds.includes(j.id);
                    return (
                      <li key={j.id} className={`mb-0.5 flex items-center gap-1 rounded-lg transition-colors ${on ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                        <button type="button" onClick={() => toggleJournal(j.id)} aria-pressed={on} title={j.title}
                          className={`flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left text-xs ${on ? 'font-semibold text-accent' : 'text-ink-2'}`}>
                          <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent' : 'border-rule-2'}`}>{on && <Check size={11} className="text-accent-on" />}</span>
                          <span className="truncate">{j.title}</span>
                          <span className="tnum ml-auto shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted" aria-label={`${j.articleCount} articles`}>{j.articleCount}</span>
                        </button>
                        <Link
                          to={`${journalBase}/${encodeURIComponent(j.issn || j.id)}`}
                          title="Open this journal and its volumes"
                          aria-label={`Open ${j.title} and its volumes`}
                          className="mr-1 shrink-0 rounded p-1 text-faint hover:bg-accent-soft hover:text-accent"
                        >
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
              </ul>
              {selJournalIds.length > 0 && (
                <div className="space-y-3 border-t border-rule p-3">
                  {facets.years.length > 0 && <ChipRow label="Year" values={facets.years.map(String)} active={year} onPick={v => { setYear(v === year ? '' : v); setVolume(''); setIssue(''); setPage(1); }} />}
                  {selJournalIds.length === 1 && facets.volumes.length > 0 && <ChipRow label="Volume" prefix="Vol " values={facets.volumes} active={volume} onPick={v => { setVolume(v === volume ? '' : v); setIssue(''); setPage(1); }} />}
                  {selJournalIds.length === 1 && facets.issues.length > 0 && <ChipRow label="Issue" prefix="Iss " values={facets.issues} active={issue} onPick={v => { setIssue(v === issue ? '' : v); setPage(1); }} />}
                  {selJournalIds.length > 1 && <p className="text-xs text-muted">Volume/Issue drill-down shows when a single journal is selected.</p>}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Results ── */}
        <section aria-label="Results" className="min-w-0 lg:col-span-3">
          {/* result toolbar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" aria-live="polite">
              {failed ? null
                : loading && items.length === 0 ? <span className="text-muted">Loading results…</span>
                : <><b className="tnum text-ink">{total.toLocaleString()}</b> <span className="text-muted">{total === 1 ? 'result' : 'results'}</span></>}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="library-sort" className="text-xs text-muted">Sort by</label>
              <select id="library-sort" value={mode === 'archived' ? 'title' : sort} onChange={e => setSort(e.target.value as Sort)}
                title={mode === 'archived' ? 'Archived items carry no reliable publication date' : undefined}
                className="input h-8 w-auto py-0 pl-2.5 text-xs font-semibold">
                {mode !== 'archived' && <option value="newest">Newest first</option>}
                {mode !== 'archived' && <option value="added">Recently added</option>}
                {mode !== 'archived' && <option value="oldest">Oldest first</option>}
                <option value="title">Title A–Z</option>
              </select>
            </div>
          </div>

          {hasNarrowing && (
            <ul aria-label="Active filters" className="mb-4 flex flex-wrap items-center gap-2">
              {activeChips.map((c, i) => (
                <li key={i} className="badge badge-accent max-w-full gap-1 pr-1" title={c.label}>
                  <span className="max-w-[14rem] truncate">{c.label}</span>
                  <button type="button" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}
                    className="rounded-full p-0.5 transition-colors hover:bg-accent hover:text-accent-on">
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li><button type="button" onClick={clearAll} className="text-xs font-semibold text-accent hover:underline">Clear all</button></li>
            </ul>
          )}

          {failed ? (
            <div className="card">
              <ErrorState description="We could not load these results right now. Please try again." onRetry={() => setRetryKey(k => k + 1)} />
            </div>
          ) : loading ? (
            <ResultSkeleton />
          ) : displayed.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={FileText}
                title={hasNarrowing ? 'No research results match these filters' : 'No research results yet'}
                description={mode === 'new' ? 'Try another department, or remove a filter.' : 'No archived items match.'}
                action={hasNarrowing ? <Button variant="outline" size="sm" onClick={clearAll}>Clear filters</Button> : undefined}
              />
            </div>
          ) : (
            <ol className="card divide-y divide-rule overflow-hidden">
              {displayed.map((it, i) => (
                <li key={it.id || i}>
                  <ResultCard
                    it={it}
                    n={(page - 1) * PAGE_SIZE + i + 1}
                    kind={kind}
                    mode={mode}
                    journalBase={journalBase}
                    lockedLabel={lockedLabel}
                    onOpen={() => navigate(`${viewerBasePath}/${it.id}`)}
                  />
                </li>
              ))}
            </ol>
          )}

          {/* smart pagination */}
          {!failed && <SmartPagination page={page} totalPages={totalPages} onChange={setPage} total={total} pageSize={PAGE_SIZE} className="mt-6" />}
        </section>
      </div>
    </div>
  );
}

/** Placeholder rows in the shape of a result, so the list does not jump when it arrives. */
function ResultSkeleton() {
  return (
    <div className="card divide-y divide-rule overflow-hidden" role="status" aria-label="Loading results">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
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
const ResultCard = React.memo(function ResultCard({ it, n, kind, mode, onOpen, journalBase, lockedLabel }: {
  it: any; n: number; kind: Kind; mode: Mode; onOpen: () => void; journalBase: string; lockedLabel: string;
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
    ? [it.publisherName, it.isbn ? `ISBN ${it.isbn}` : '', it.edition ? `${it.edition} ed.` : '', it.year, it.doi ? `DOI ${it.doi}` : ''].filter(Boolean)
    // Source · year · volume(issue) · pages · ISSN · DOI. A missing part is left out, never filled in.
    : [it.year, volIss, it.pages ? `pp ${it.pages}` : '', it.journalIssn ? `ISSN ${it.journalIssn}` : '', it.doi ? `DOI ${it.doi}` : ''].filter(Boolean);

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
    <article className="group flex flex-col gap-3 px-4 py-4 sm:flex-row sm:gap-4 sm:px-5">
      <span className="tnum hidden shrink-0 pt-1 font-mono text-[11px] text-faint sm:block sm:w-7" aria-hidden="true">{n}</span>

      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-[17px] font-medium leading-snug text-ink">
          <button type="button" onClick={open} className="text-left transition-colors hover:text-accent group-hover:text-accent">
            {it.title}
          </button>
        </h3>

        {authors.length > 0 && (
          <p className="mt-1 text-[13px] leading-snug text-ink-2">
            {shown.join(' · ')}
            {authors.length > 3 && <span className="text-muted"> +{authors.length - 3} more</span>}
          </p>
        )}

        {((!isBook && it.journalName) || bits.length > 0) && (
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
                {(i > 0 || (!isBook && it.journalName)) && <span className="text-rule-2" aria-hidden="true">·</span>}
                <span className="min-w-0 [overflow-wrap:anywhere]">{b}</span>
              </React.Fragment>
            ))}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {hasPdf && <Mark tone="accent">Full text</Mark>}
          {(it.accessType === 'OpenAccess' || it.accessType === 'Free') && <Mark tone="accent">Open access</Mark>}
          {metaOnly && it.originalUrl && <Mark>External source</Mark>}
          {metaOnly && <Mark tone="caution">Metadata only</Mark>}
          {it.locked && <Mark>Subscription</Mark>}
          {typeMark && <Mark>{typeMark}</Mark>}
          {it.domain && <Mark>{it.domain}</Mark>}
          {it.doi && (
            <button
              type="button"
              onClick={copyDoi}
              title="Copy DOI"
              className="badge badge-neutral transition-colors hover:border-accent hover:text-accent"
            >
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />} {copied ? 'Copied' : 'Copy DOI'}
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 sm:self-start sm:pt-0.5">
        {lockedLabel && !metaOnly ? (
          // Said in words and with a lock, not by colour: reading is shut until the time shown.
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-caution"
            aria-label={`Reading is locked. ${lockedLabel}`}>
            <Lock size={12} aria-hidden="true" />
            <span className="leading-tight sm:max-w-[9rem] sm:text-right">{lockedLabel}</span>
          </span>
        ) : (
          <button type="button" onClick={open} className={buttonClass('outline', 'sm')}>
            {metaOnly ? 'Details' : hasPdf ? 'Read' : 'Open'}
          </button>
        )}
      </div>

      {showMeta && <MetadataModal item={it} isBook={isBook} onClose={() => setShowMeta(false)} />}
    </article>
  );
});

/** A status mark, in the shared badge shape. Colour is spent only on whether the record can be read. */
function Mark({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: BadgeTone }) {
  return (
    <Badge tone={tone} className="max-w-full">
      <span className="truncate">{children}</span>
    </Badge>
  );
}

// ───────── small helpers ─────────
const seg = (active: boolean) => `inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${active ? 'bg-accent text-accent-on' : 'text-muted hover:text-ink-2'}`;
const seg2 = (active: boolean) => `flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink-2'}`;
const selCls = 'input text-sm';
const checkCls = 'h-4 w-4 shrink-0 rounded accent-[var(--accent)]';
const miniInputCls = 'w-full rounded-lg border border-rule bg-surface-2 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30';

/** A collapsible filter section. The heading is the toggle, and says whether it is open. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <div>
      <h3 className="mb-2">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={id}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink-2">
          {label} {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
      </h3>
      <div id={id} hidden={!open}>{children}</div>
    </div>
  );
}
function ChipRow({ label, values, active, onPick, prefix = '' }: { label: string; values: string[]; active: string; onPick: (v: string) => void; prefix?: string }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <button key={v} type="button" aria-pressed={active === v} onClick={() => onPick(v)}
            className={`tnum rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${active === v ? 'border-accent bg-accent text-accent-on' : 'border-rule bg-surface text-ink-2 hover:border-accent'}`}>
            {prefix}{v}
          </button>
        ))}
      </div>
    </div>
  );
}
