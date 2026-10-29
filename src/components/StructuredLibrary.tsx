import React, { useState, useEffect, useMemo, useRef, useId, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { SmartPagination } from './SmartPagination';
import {
  FileText, Search, Archive, Sparkles, ChevronRight, ChevronDown,
  SlidersHorizontal, X, BookMarked, Check, Lock, Info, ShieldAlert,
} from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, buttonClass } from './ui';
import { useAllowance, inCooldown, clockTime } from './membership/ReadingClock';
import { ContinueReading } from './library/ContinueReading';
import { ResultCard } from './library/ResultCard';
import { readerBaseOf } from '../lib/readerBase';
import {
  LIBRARY_PAGE_SIZE as PAGE_SIZE, COLLECTION_HELP, CONTENT_TYPE_NAMES, SORTS_ARCHIVED, SORTS_NEW,
  applyPatch, parseLibraryParams, resolveForAccess, toSearchParams,
  type LibraryCaps, type LibraryState, type LibrarySort,
} from '../lib/libraryParams';

// The result card is shared with the department page; it lives in its own file and is re-exported for its other readers.
export { ResultCard };

type Facets = {
  publishers: { name: string; count: number }[];
  languages: { name: string; count: number }[];
  years: { year: number; count: number }[];
  types: { name: string; count: number }[];
  availability: { readable: number; external: number; metadata: number };
  verifiedOa: number;
  denied?: boolean;
};

const SORT_LABEL: Record<LibrarySort, string> = { newest: 'Newest first', added: 'Recently added', oldest: 'Oldest first', title: 'Title A–Z' };
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

/**
 * The structured content browser over the ingested Article/Journal/Book dataset and the archived shelf. Mounted in both reader dashboards
 * (the individual/member one and the institution one), which have separate viewer routes — hence viewerBasePath.
 *
 * The ADDRESS is the state. Everything the reader has chosen is read from the query string (src/lib/libraryParams.ts), every change writes
 * a new address, and nothing is kept in a second copy that could drift from it. That is what makes a result list shareable, reloadable and
 * restorable: Back from a record or from the reader lands on exactly this page, and a link built by any "Browse" button carries its
 * department, content type and shelf intact. A value the page does not understand is dropped on the way in, never sent to the server.
 */
export function StructuredLibrary({ viewerBasePath = '/dashboard/viewer' }: { viewerBasePath?: string } = {}) {
  const navigate = useNavigate();
  const readerBase = readerBaseOf(viewerBasePath);
  const journalBase = viewerBasePath.replace(/\/viewer$/, '/journal');
  const [sp, setSp] = useSearchParams();

  // ── What the account can open ──
  const [avail, setAvail] = useState<any>(null);
  const [availFailed, setAvailFailed] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    fetch('/api/user/available-facets', { ...authHeaders(), signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { if (d && d.neu) setAvail(d); else throw new Error('shape'); })
      .catch(e => { if (e?.name !== 'AbortError') setAvailFailed(true); });
    return () => ctl.abort();
  }, []);

  const caps: LibraryCaps | null = useMemo(() => !avail ? null : ({
    hasArchive: !!avail.all || (avail.archived?.departments?.length ?? 0) > 0,
    hasArticles: !!avail.all || !!avail.neu.hasArticles,
    hasBooks: !!avail.neu.hasBooks,
    departments: avail.all ? null : (avail.neu.departments as string[]),
  }), [avail]);

  // ── The address, read once per change, and made to agree with what the account can open ──
  const spKey = sp.toString();
  const requested = useMemo(() => parseLibraryParams(new URLSearchParams(spKey)), [spKey]);
  const { state: s, notice } = useMemo(() => caps ? resolveForAccess(requested, caps) : { state: requested, notice: null }, [requested, caps]);
  const canonical = useMemo(() => toSearchParams(s).toString(), [s]);
  // An address that arrived in an old or hand-written form is rewritten to its canonical form (no new history entry).
  useEffect(() => { if (canonical !== spKey) setSp(new URLSearchParams(canonical), { replace: true, preventScrollReset: true }); }, [canonical, spKey, setSp]);

  const resultsTop = useRef<HTMLHeadingElement>(null);
  /** A change of filter writes a new address (so Back steps through the filters); typing in the search box replaces it. */
  const update = useCallback((patch: Partial<LibraryState>, o: { replace?: boolean } = {}) => {
    const next = applyPatch(s, patch);
    setSp(toSearchParams(next), { replace: !!o.replace, preventScrollReset: true });
    if ('page' in patch) requestAnimationFrame(() => resultsTop.current?.scrollIntoView({ block: 'start' }));
  }, [s, setSp]);

  // ── The search box: its own text while typing, the address after a pause ──
  const [searchText, setSearchText] = useState(s.q);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setSearchText(s.q); }, [s.q]);
  useEffect(() => {
    if (searchText === s.q) return;
    const t = setTimeout(() => update({ q: searchText }, { replace: true }), 350);
    return () => clearTimeout(t);
  }, [searchText, s.q, update]);
  const clearSearch = () => { setSearchText(''); update({ q: '' }, { replace: true }); searchInputRef.current?.focus(); };

  // ── The free member's clock ──
  // While they are waiting, the way into a reader is shut, and the list says so — with the time it opens — rather than offering "Read"
  // for a door that is locked. msUntil counts down locally, so "Read" comes back by itself when the wait ends.
  const { allowance, msUntil } = useAllowance();
  const waiting = inCooldown(allowance, msUntil);
  const lockedLabel = !waiting ? '' : allowance?.state === 'spent' ? 'Available after midnight' : `Available at ${clockTime(allowance?.nextOpensAt)}`;

  // ── What each filter can offer, for this shelf and department ──
  const [facets, setFacets] = useState<Facets | null>(null);
  const kindKey = s.mode === 'new' ? s.kind : '';
  useEffect(() => {
    if (s.mode !== 'new') { setFacets(null); return; }
    const ctl = new AbortController();
    const q = new URLSearchParams({ kind: s.kind });
    if (s.domain) q.set('domain', s.domain);
    if (s.kind === 'articles' && s.atype) q.set('atype', s.atype);
    fetch(`/api/library/discovery-facets?${q}`, { ...authHeaders(), signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(setFacets)
      .catch(e => { if (e?.name !== 'AbortError') setFacets(null); });
    return () => ctl.abort();
  }, [s.mode, kindKey, s.domain, s.atype]);

  // Journals sidebar (articles in the new collection)
  const [journals, setJournals] = useState<any[]>([]);
  const [journalQuery, setJournalQuery] = useState('');
  useEffect(() => {
    if (s.mode !== 'new' || s.kind !== 'articles') return;
    const ctl = new AbortController();
    const q = new URLSearchParams();
    if (s.domain) q.set('domain', s.domain);
    if (s.publisher) q.set('publisher', s.publisher);
    if (s.recent) q.set('recentYears', '2');
    fetch(`/api/library/journals?${q}`, { ...authHeaders(), signal: ctl.signal }).then(r => r.json()).then(d => setJournals(Array.isArray(d) ? d : [])).catch(e => { if (e?.name !== 'AbortError') setJournals([]); });
    return () => ctl.abort();
  }, [s.mode, s.kind, s.domain, s.publisher, s.recent]);

  // Volume / issue under the chosen journals (year is the general Year filter)
  const jidsKey = s.jids.join(',');
  const [volFacets, setVolFacets] = useState<{ volumes: string[]; issues: string[] }>({ volumes: [], issues: [] });
  useEffect(() => {
    if (s.jids.length !== 1) { setVolFacets({ volumes: [], issues: [] }); return; }
    const ctl = new AbortController();
    const q = new URLSearchParams({ journalIds: jidsKey });
    if (s.year) q.set('year', s.year);
    if (s.vol) q.set('volume', s.vol);
    fetch(`/api/library/facets?${q}`, { ...authHeaders(), signal: ctl.signal }).then(r => r.json()).then(d => setVolFacets({ volumes: d.volumes || [], issues: d.issues || [] })).catch(() => { });
    return () => ctl.abort();
  }, [jidsKey, s.year, s.vol]);

  // Archived shelf: subject areas and tags
  const [aFilters, setAFilters] = useState<{ subjects: string[]; subjectCounts: Record<string, number>; tags: string[] }>({ subjects: [], subjectCounts: {}, tags: [] });
  const [subjectQuery, setSubjectQuery] = useState('');
  useEffect(() => {
    if (s.mode !== 'archived') return;
    const ctl = new AbortController();
    const q = new URLSearchParams();
    if (s.domain) q.set('domain', s.domain);
    if (s.atype) q.set('contentType', s.atype);
    if (s.q) q.set('search', s.q);
    if (s.asub.length) q.set('subjectArea', s.asub.join(','));
    fetch(`/api/content/filters?${q}`, { ...authHeaders(), signal: ctl.signal }).then(r => r.json())
      .then(d => setAFilters({ subjects: d.subjects || [], subjectCounts: d.subjectCounts || {}, tags: d.tags || [] }))
      .catch(e => { if (e?.name !== 'AbortError') setAFilters({ subjects: [], subjectCounts: {}, tags: [] }); });
    return () => ctl.abort();
  }, [s.mode, s.domain, s.atype, s.q, s.asub.join('~')]);

  // ── The results ──
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // A failed load is said as a failure, not shown as "0 results" — the shelf is not empty.
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const listUrl = useMemo(() => {
    const q = new URLSearchParams({ page: String(s.page), limit: String(PAGE_SIZE) });
    if (s.q) q.set('search', s.q);
    if (s.domain) q.set('domain', s.domain);
    if (s.avail) q.set('avail', s.avail);
    if (s.mode === 'archived') {
      q.set('onlyUnlocked', 'false');
      if (s.atype) q.set('contentType', s.atype);
      if (s.asub.length) q.set('subjectArea', s.asub.join(','));
      if (s.atag.length) q.set('tag', s.atag.join(','));
      if (s.sort === 'added') q.set('sort', 'added');
      return `/api/content/list?${q}`;
    }
    // Everything below is decided by the server, in the query that is counted: filtering the page already sent shows three results
    // under a heading that says 27,056, and re-ordering those rows starts the order again on every page.
    if (s.oa) q.set('oa', '1');
    if (s.sort !== 'newest') q.set('sort', s.sort);
    if (s.publisher) q.set('publisher', s.publisher);
    if (s.year) q.set('year', s.year);
    if (s.language) q.set('lang', s.language);
    if (s.kind === 'books') return `/api/library/books?${q}`;
    if (s.atype) q.set('atype', s.atype);
    if (s.jids.length) q.set('journalIds', s.jids.join(','));
    if (s.jids.length === 1) { if (s.vol) q.set('volume', s.vol); if (s.iss) q.set('issue', s.iss); }
    return `/api/library/articles?${q}`;
  }, [s]);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true); setFailed(false); setDenied(false);
    fetch(listUrl, { ...authHeaders(), signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { setItems(d.data || []); setTotal(d.total || 0); setDenied(!!d.denied); setLoading(false); })
      // An aborted request is a newer one replacing this one, not a failure.
      .catch(e => { if (e?.name === 'AbortError') return; setItems([]); setTotal(0); setFailed(true); setLoading(false); });
    return () => ctl.abort();
  }, [listUrl, retryKey]);

  // ── Derived ──
  const selJournals = journals.filter(j => s.jids.includes(j.id));
  const filteredJournals = journalQuery ? journals.filter(j => j.title?.toLowerCase().includes(journalQuery.toLowerCase())) : journals;
  const toggleJournal = (id: string) => update({ jids: s.jids.includes(id) ? s.jids.filter(x => x !== id) : [...s.jids, id] });

  const isAll = !avail || avail.all;
  const deptOptions: string[] = !avail ? [] : (s.mode === 'archived' ? avail.archived.departments : avail.neu.departments);
  // The requested department stays selectable even when the list has not caught up with it, so the box never shows a department that is not the one in use.
  const deptList = s.domain && !deptOptions.includes(s.domain) ? [s.domain, ...deptOptions] : deptOptions;
  const archivedTypes: string[] = !avail ? [...CONTENT_TYPE_NAMES] : (CONTENT_TYPE_NAMES as readonly string[]).filter(c => avail.archived.contentTypes.includes(c));
  const showArticles = !caps || caps.hasArticles;
  const showBooks = !caps || caps.hasBooks;
  const showCollection = !caps || showArticles || showBooks;
  const showArchive = !caps || caps.hasArchive;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (s.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, s.page * PAGE_SIZE);

  const chips: { label: string; clear: () => void }[] = [];
  if (s.domain) chips.push({ label: s.domain, clear: () => update({ domain: '' }) });
  if (s.mode === 'archived') chips.push({ label: 'Archived', clear: () => update({ mode: 'new' }) });
  else if (s.kind === 'books') chips.push({ label: 'Books', clear: () => update({ kind: 'articles' }) });
  if (s.atype) chips.push({ label: s.atype, clear: () => update({ atype: '' }) });
  if (s.publisher) chips.push({ label: s.publisher, clear: () => update({ publisher: '' }) });
  if (s.language) chips.push({ label: `Language: ${s.language}`, clear: () => update({ language: '' }) });
  if (selJournals.length) selJournals.forEach(j => chips.push({ label: j.title, clear: () => toggleJournal(j.id) }));
  else if (s.jids.length) chips.push({ label: `${s.jids.length} journal(s)`, clear: () => update({ jids: [] }) });
  if (s.year) chips.push({ label: `Year ${s.year}`, clear: () => update({ year: '' }) });
  if (s.vol) chips.push({ label: `Vol ${s.vol}`, clear: () => update({ vol: '' }) });
  if (s.iss) chips.push({ label: `Issue ${s.iss}`, clear: () => update({ iss: '' }) });
  if (s.avail) chips.push({ label: AVAIL_LABEL[s.avail], clear: () => update({ avail: '' }) });
  if (s.oa) chips.push({ label: 'Open access (licensed)', clear: () => update({ oa: false }) });
  if (s.recent) chips.push({ label: 'New journals', clear: () => update({ recent: false }) });
  s.asub.forEach(x => chips.push({ label: x, clear: () => update({ asub: s.asub.filter(y => y !== x) }) }));
  s.atag.forEach(t => chips.push({ label: `#${t}`, clear: () => update({ atag: s.atag.filter(y => y !== t) }) }));
  if (s.q) chips.push({ label: `“${s.q}”`, clear: () => { setSearchText(''); update({ q: '' }); } });
  // The shelf and the department are where the reader IS; "Clear filters" returns to the shelf, it does not leave it.
  const narrowing = chips.filter(c => c.label !== 'Archived' && c.label !== 'Books').length;
  const clearAll = () => { setSearchText(''); update({ domain: '', atype: '', publisher: '', language: '', year: '', avail: '', oa: false, recent: false, q: '', jids: [], vol: '', iss: '', asub: [], atag: [] }); };

  // ── The filter drawer on a small screen ──
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = useCallback(() => { setDrawer(false); requestAnimationFrame(() => openerRef.current?.focus()); }, []);
  useEffect(() => {
    if (!drawer) return;
    const el = drawerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => el?.querySelector<HTMLElement>('[data-drawer-close]')?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const a = document.activeElement as HTMLElement | null;
      if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    // A drawer left open when the window grows into the desktop layout would hold the page's scroll for nothing.
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => { if (mq.matches) setDrawer(false); };
    mq.addEventListener?.('change', onMq);
    return () => { document.removeEventListener('keydown', onKey); mq.removeEventListener?.('change', onMq); document.body.style.overflow = prevOverflow; };
  }, [drawer, closeDrawer]);

  const searchHint = s.mode === 'archived' ? 'Matches title, author, subject area and tags.' : 'Matches title and author.';
  const noun = s.mode === 'archived' ? 'archived item' : s.kind === 'books' ? 'book' : 'article';

  return (
    <div className="text-ink pb-40">
      <PageHeader
        title={<span className="flex items-center gap-2"><BookMarked className="shrink-0 text-accent" size={24} aria-hidden="true" /> Content Library</span>}
        description="Discover academic research — filter precisely and read in your secure viewer."
        actions={(showCollection && showArchive) ? (
          // Two shelves of the same library, shown only where the member has something on both. Neither is "recent" or "old", and
          // neither is "closed": what each holds is said below, and both are open to the plan.
          <div role="group" aria-label="Collection" className="inline-flex w-fit rounded-lg bg-surface-2 p-1">
            <button type="button" aria-pressed={s.mode === 'new'} onClick={() => update({ mode: 'new' })} className={seg(s.mode === 'new')} title={COLLECTION_HELP.new.short}><Sparkles size={14} aria-hidden="true" /> {COLLECTION_HELP.new.label}</button>
            <button type="button" aria-pressed={s.mode === 'archived'} onClick={() => update({ mode: 'archived' })} className={seg(s.mode === 'archived')} title={COLLECTION_HELP.archived.short}><Archive size={14} aria-hidden="true" /> {COLLECTION_HELP.archived.label}</button>
          </div>
        ) : undefined}
      />

      {showCollection && showArchive && <p className="-mt-3 mb-4 flex items-start gap-1.5 text-[13px] text-muted"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />{COLLECTION_HELP[s.mode].short}</p>}

      {notice && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-rule bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          {notice === 'archive-unavailable' ? 'The Archived shelf is not part of your access, so this link was opened on the New Collection.' : 'Books are not part of your access, so this link was opened on Articles.'}
        </p>
      )}
      {availFailed && !avail && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rule bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          <ShieldAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-caution" />
          We could not check which departments your account covers, so the department list is not shown. Results are still limited to what you may open.
        </p>
      )}
      {waiting && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-rule bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-caution" />
          Your free reading session has ended. {lockedLabel}. You can still browse, search and save.
        </p>
      )}

      <ContinueReading base={readerBase} />

      {/* Search inside the current filters. The header's search box is the one that covers the whole library; this one is named so the two are not confused. */}
      <div className="mb-6">
        <label htmlFor="library-search" className="field-label">Search within these results</label>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              id="library-search"
              ref={searchInputRef}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              aria-describedby="library-search-help"
              placeholder={s.mode === 'archived' ? 'Title, author, subject or tag…' : 'Title or author…'}
              className="input pl-9 pr-10"
            />
            {searchText && (
              <button type="button" onClick={clearSearch} title="Clear search" aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <button type="button" ref={openerRef} onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="library-filters" className={buttonClass('outline', 'md', 'shrink-0 lg:hidden')}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filters
            {narrowing > 0 && <span className="tnum rounded-full bg-accent px-1.5 text-xs text-accent-on">{narrowing}</span>}
          </button>
        </div>
        <p id="library-search-help" className="field-help mt-1.5">{searchHint} Works together with the filters you have chosen.</p>
      </div>

      {drawer && <div className="fixed inset-0 z-[70] bg-black/50 lg:hidden" aria-hidden="true" onClick={closeDrawer} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* ── Filters: a sidebar on a wide screen, a drawer on a small one ── */}
        <aside
          id="library-filters" ref={drawerRef} aria-label="Filters"
          {...(drawer ? { role: 'dialog', 'aria-modal': true } : {})}
          className={drawer
            ? 'fixed inset-y-0 left-0 z-[80] flex w-[min(24rem,92vw)] flex-col overflow-y-auto bg-surface-2 p-4 shadow-2xl lg:static lg:z-auto lg:w-auto lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none'
            : 'hidden min-w-0 space-y-4 lg:col-span-1 lg:block'}
        >
          {drawer && (
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <h2 className="text-base font-semibold">Filters</h2>
              <button type="button" data-drawer-close onClick={closeDrawer} aria-label="Close filters" className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-ink"><X size={18} aria-hidden="true" /></button>
            </div>
          )}
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-rule px-4 py-3">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"><SlidersHorizontal size={14} aria-hidden="true" /> Refine</h2>
                {narrowing > 0 && <button type="button" onClick={clearAll} className="text-xs font-semibold text-accent hover:underline">Clear filters</button>}
              </div>

              <div className="space-y-5 p-4">
                {s.mode === 'new' && (showArticles || showBooks) && (
                  <div role="group" aria-label="Content kind" className="inline-flex w-full rounded-lg bg-surface-2 p-1">
                    {showArticles && <button type="button" aria-pressed={s.kind === 'articles'} onClick={() => update({ kind: 'articles' })} className={seg2(s.kind === 'articles')}>Articles</button>}
                    {showBooks && <button type="button" aria-pressed={s.kind === 'books'} onClick={() => update({ kind: 'books' })} className={seg2(s.kind === 'books')}>Books</button>}
                  </div>
                )}

                <Group label="Department">
                  <select aria-label="Department" value={s.domain} onChange={e => update({ domain: e.target.value })} className={selCls}>
                    <option value="">{isAll ? 'All Departments' : 'All My Departments'}</option>
                    {deptList.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Group>

                {/* Content type: other article types of the new collection, or the archived shelf's own types. */}
                {s.mode === 'archived' && (
                  <Group label="Content type">
                    <select aria-label="Content type" value={s.atype} onChange={e => update({ atype: e.target.value })} className={selCls}>
                      <option value="">{isAll ? 'All Types' : 'All My Types'}</option>
                      {archivedTypes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Group>
                )}
                {s.mode === 'new' && s.kind === 'articles' && facets && (facets.types.length > 1 || s.atype) && (
                  <Group label="Content type">
                    <select aria-label="Content type" value={s.atype} onChange={e => update({ atype: e.target.value })} className={selCls}>
                      <option value="">All types</option>
                      {facets.types.map(t => <option key={t.name} value={t.name}>{t.name} ({t.count.toLocaleString()})</option>)}
                      {s.atype && !facets.types.some(t => t.name === s.atype) && <option value={s.atype}>{s.atype}</option>}
                    </select>
                  </Group>
                )}

                {s.mode === 'new' && facets && facets.publishers.length > 0 && (
                  <Group label="Publisher">
                    <select aria-label="Publisher" value={s.publisher} onChange={e => update({ publisher: e.target.value })} className={selCls}>
                      <option value="">All Publishers</option>
                      {facets.publishers.map(p => <option key={p.name} value={p.name}>{p.name} ({p.count.toLocaleString()})</option>)}
                      {s.publisher && !facets.publishers.some(p => p.name === s.publisher) && <option value={s.publisher}>{s.publisher}</option>}
                    </select>
                  </Group>
                )}

                {/* Offered only where the records carry a language at all: an empty list is not a filter. */}
                {s.mode === 'new' && facets && facets.languages.length > 0 && (
                  <Group label="Language">
                    <select aria-label="Language" value={s.language} onChange={e => update({ language: e.target.value })} className={selCls}>
                      <option value="">Any language</option>
                      {facets.languages.map(l => <option key={l.name} value={l.name}>{l.name} ({l.count.toLocaleString()})</option>)}
                    </select>
                  </Group>
                )}

                {s.mode === 'new' && facets && facets.years.length > 0 && (
                  <Group label="Publication year">
                    <select aria-label="Publication year" value={s.year} onChange={e => update({ year: e.target.value })} className={selCls}>
                      <option value="">Any year</option>
                      {facets.years.map(y => <option key={y.year} value={String(y.year)}>{y.year} ({y.count.toLocaleString()})</option>)}
                      {s.year && !facets.years.some(y => String(y.year) === s.year) && <option value={s.year}>{s.year}</option>}
                    </select>
                  </Group>
                )}

                <Group label="Availability">
                  <fieldset>
                    <legend className="sr-only">Availability</legend>
                    <div className="space-y-1.5">
                      <Radio name="avail" checked={s.avail === ''} onChange={() => update({ avail: '' })}>Any</Radio>
                      <Radio name="avail" checked={s.avail === 'readable'} onChange={() => update({ avail: 'readable' })} count={s.mode === 'new' ? facets?.availability.readable : undefined}>Readable here</Radio>
                      {s.mode === 'new' && <Radio name="avail" checked={s.avail === 'external'} onChange={() => update({ avail: 'external' })} count={facets?.availability.external}>At the source</Radio>}
                      <Radio name="avail" checked={s.avail === 'metadata'} onChange={() => update({ avail: 'metadata' })} count={s.mode === 'new' ? facets?.availability.metadata : undefined}>Metadata only</Radio>
                    </div>
                  </fieldset>
                  <p className="field-help mt-2">“Readable here” means the full text is held in this library. “At the source” links to the publisher’s page.</p>
                </Group>

                {s.mode === 'new' && (
                  <Group label="More filters">
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-2">
                        <input type="checkbox" checked={s.oa} onChange={e => update({ oa: e.target.checked })} className={`mt-0.5 ${checkCls}`} />
                        <span>Open access with a recorded licence{facets ? <span className="tnum text-muted"> ({facets.verifiedOa.toLocaleString()})</span> : null}
                          <span className="block text-xs text-muted">Open at the source. This does not mean the full text is held here.</span></span>
                      </label>
                      {s.kind === 'articles' && (
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                          <input type="checkbox" checked={s.recent} onChange={e => update({ recent: e.target.checked })} className={checkCls} />
                          <Sparkles size={14} aria-hidden="true" className="text-accent" /> Journals started in the last 2 years
                        </label>
                      )}
                    </div>
                  </Group>
                )}

                {s.mode === 'archived' && (
                  <>
                    {aFilters.subjects.length > 0 && (
                      <Group label="Subject area">
                        <div className="relative mb-2">
                          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                          <input value={subjectQuery} onChange={e => setSubjectQuery(e.target.value)} aria-label="Filter subject areas" placeholder="Filter subject areas…" className={miniInputCls} />
                        </div>
                        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                          {/* A subject you have ticked stays listed even when the filter hides its neighbours. */}
                          {aFilters.subjects.filter(x => !subjectQuery || s.asub.includes(x) || x.toLowerCase().includes(subjectQuery.trim().toLowerCase())).map(x => (
                            <label key={x} className="group flex cursor-pointer items-start gap-2">
                              <input type="checkbox" checked={s.asub.includes(x)} onChange={() => update({ asub: s.asub.includes(x) ? s.asub.filter(y => y !== x) : [...s.asub, x] })} className={`mt-0.5 ${checkCls}`} />
                              <span className="text-[13px] leading-tight text-ink-2 group-hover:text-accent">{x}{aFilters.subjectCounts[x] ? <span className="tnum text-muted"> ({aFilters.subjectCounts[x]})</span> : null}</span>
                            </label>
                          ))}
                          {subjectQuery && !aFilters.subjects.some(x => x.toLowerCase().includes(subjectQuery.trim().toLowerCase())) && <p className="text-xs text-muted">No subject area matches.</p>}
                        </div>
                      </Group>
                    )}
                    {s.asub.length > 0 && aFilters.tags.length > 0 && (
                      <Group label="Popular tags">
                        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                          {aFilters.tags.map(t => (
                            <button key={t} type="button" aria-pressed={s.atag.includes(t)} onClick={() => update({ atag: s.atag.includes(t) ? s.atag.filter(y => y !== t) : [...s.atag, t] })}
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${s.atag.includes(t) ? 'border-accent bg-accent text-accent-on' : 'border-rule bg-surface-2 text-ink-2 hover:border-accent'}`}>{t}</button>
                          ))}
                        </div>
                      </Group>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Journals list + volume / issue */}
            {s.mode === 'new' && s.kind === 'articles' && (
              <div className="card">
                <div className="border-b border-rule px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Journals <span className="tnum">({journals.length})</span></h2>
                    {s.jids.length > 0 && <button type="button" onClick={() => update({ jids: [] })} className="text-xs font-semibold text-accent hover:underline">{s.jids.length} selected · clear</button>}
                  </div>
                  <div className="relative mt-2">
                    <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                    <input value={journalQuery} onChange={e => setJournalQuery(e.target.value)} aria-label="Filter journals" placeholder="Filter journals…" className={`${miniInputCls} pr-7`} />
                    {journalQuery && (
                      <button type="button" onClick={() => setJournalQuery('')} title="Clear filter" aria-label="Clear journal filter" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint transition-colors hover:text-ink">
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <ul className="max-h-64 overflow-y-auto p-2">
                  {filteredJournals.length === 0 ? <li className="px-2 py-3 text-xs text-muted">{journalQuery ? 'No journal matches.' : 'No journals yet.'}</li> :
                    filteredJournals.map(j => {
                      const on = s.jids.includes(j.id);
                      return (
                        <li key={j.id} className={`mb-0.5 flex items-center gap-1 rounded-lg transition-colors ${on ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                          <button type="button" onClick={() => toggleJournal(j.id)} aria-pressed={on} title={j.title}
                            className={`flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left text-xs ${on ? 'font-semibold text-accent' : 'text-ink-2'}`}>
                            <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent' : 'border-rule-2'}`}>{on && <Check size={11} className="text-accent-on" />}</span>
                            <span className="truncate">{j.title}</span>
                            <span className="tnum ml-auto shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted" aria-label={`${j.articleCount} articles`}>{j.articleCount}</span>
                          </button>
                          <Link to={`${journalBase}/${encodeURIComponent(j.issn || j.id)}`} title="Open this journal and its volumes" aria-label={`Open ${j.title} and its volumes`}
                            className="mr-1 shrink-0 rounded p-1 text-faint hover:bg-accent-soft hover:text-accent">
                            <ChevronRight size={14} aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                </ul>
                {s.jids.length > 0 && (
                  <div className="space-y-3 border-t border-rule p-3">
                    {s.jids.length === 1 && volFacets.volumes.length > 0 && <ChipRow label="Volume" prefix="Vol " values={volFacets.volumes} active={s.vol} onPick={v => update({ vol: v === s.vol ? '' : v })} />}
                    {s.jids.length === 1 && volFacets.issues.length > 0 && <ChipRow label="Issue" prefix="Iss " values={volFacets.issues} active={s.iss} onPick={v => update({ iss: v === s.iss ? '' : v })} />}
                    {s.jids.length > 1 && <p className="text-xs text-muted">Volume/Issue drill-down shows when a single journal is selected.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          {drawer && (
            <div className="sticky bottom-0 -mx-4 mt-4 border-t border-rule bg-surface-2 p-3 lg:hidden">
              <Button className="w-full" onClick={closeDrawer}>{loading ? 'Show results' : `Show ${total.toLocaleString()} ${total === 1 ? 'result' : 'results'}`}</Button>
            </div>
          )}
        </aside>

        {/* ── Results ── */}
        <section aria-labelledby="results-heading" className="min-w-0 lg:col-span-3">
          <h2 id="results-heading" ref={resultsTop} tabIndex={-1} className="sr-only">Results</h2>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" aria-live="polite">
              {failed ? null
                : loading && items.length === 0 ? <span className="text-muted">Loading results…</span>
                : <><b className="tnum text-ink">{total.toLocaleString()}</b> <span className="text-muted">{total === 1 ? 'result' : 'results'}</span>{total > 0 && <span className="tnum text-muted"> · showing {first.toLocaleString()}–{last.toLocaleString()}</span>}</>}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="library-sort" className="text-xs text-muted">Sort by</label>
              <select id="library-sort" value={s.sort} onChange={e => update({ sort: e.target.value as LibrarySort })}
                title={s.mode === 'archived' ? 'Archived items carry no reliable publication date' : undefined}
                className="input h-8 w-auto py-0 pl-2.5 text-xs font-semibold">
                {(s.mode === 'archived' ? SORTS_ARCHIVED : SORTS_NEW).map(o => <option key={o} value={o}>{SORT_LABEL[o]}</option>)}
              </select>
            </div>
          </div>

          {chips.length > 0 && (
            <ul aria-label="Active filters" className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((c, i) => (
                <li key={`${c.label}-${i}`} className="badge badge-accent max-w-full gap-1 pr-1" title={c.label}>
                  <span className="max-w-[14rem] truncate">{c.label}</span>
                  <button type="button" onClick={c.clear} aria-label={`Remove filter: ${c.label}`} className="rounded-full p-0.5 transition-colors hover:bg-accent hover:text-accent-on">
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
              {narrowing > 0 && <li><button type="button" onClick={clearAll} className="text-xs font-semibold text-accent hover:underline">Clear filters</button></li>}
            </ul>
          )}

          {failed ? (
            <div className="card">
              <ErrorState description="We could not load these results right now. Your filters are unchanged. Please try again." onRetry={() => setRetryKey(k => k + 1)} />
            </div>
          ) : loading ? (
            <ResultSkeleton />
          ) : denied ? (
            <div className="card">
              <EmptyState
                icon={ShieldAlert}
                title={`${s.domain || 'This department'} is not part of your access`}
                description="Your subscription or plan does not include this department. Departments you can open are listed in the Department filter."
                action={<Button variant="outline" size="sm" onClick={() => update({ domain: '' })}>Show my departments</Button>}
              />
            </div>
          ) : items.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={FileText}
                title={narrowing ? `No ${noun}s match these filters` : `No ${noun}s here yet`}
                description={narrowing ? 'Try another department, or remove a filter.' : s.mode === 'new' ? 'Nothing has been published on this shelf for your departments yet.' : 'No archived items are available for your departments.'}
                action={narrowing ? <Button variant="outline" size="sm" onClick={clearAll}>Clear filters</Button> : undefined}
              />
            </div>
          ) : (
            <ol className="card divide-y divide-rule overflow-hidden">
              {items.map((it, i) => (
                <li key={it.id || i}>
                  <ResultCard
                    it={it}
                    n={(s.page - 1) * PAGE_SIZE + i + 1}
                    kind={s.kind}
                    mode={s.mode}
                    journalBase={journalBase}
                    lockedLabel={lockedLabel}
                    onOpen={() => navigate(`${viewerBasePath}/${it.id}`)}
                  />
                </li>
              ))}
            </ol>
          )}

          {!failed && !denied && total > 0 && <SmartPagination page={s.page} totalPages={totalPages} onChange={p => update({ page: p })} total={total} pageSize={PAGE_SIZE} className="mt-6" />}
        </section>
      </div>
    </div>
  );
}

const AVAIL_LABEL: Record<string, string> = { readable: 'Readable here', external: 'At the source', metadata: 'Metadata only' };

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

// ───────── small helpers ─────────
const seg = (active: boolean) => `inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${active ? 'bg-accent text-accent-on' : 'text-muted hover:text-ink-2'}`;
const seg2 = (active: boolean) => `flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink-2'}`;
const selCls = 'input text-sm';
const checkCls = 'h-4 w-4 shrink-0 rounded accent-[var(--accent)]';
const miniInputCls = 'w-full rounded-lg border border-rule bg-surface-2 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30';

function Radio({ name, checked, onChange, count, children }: { name: string; checked: boolean; onChange: () => void; count?: number; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} className={checkCls} />
      <span>{children}{typeof count === 'number' && <span className="tnum text-muted"> ({count.toLocaleString()})</span>}</span>
    </label>
  );
}

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
