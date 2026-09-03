import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Search, BookOpen, Play, FileText, BookMarked, Layers, Lock, Clock,
  ChevronRight, ChevronLeft, TrendingUp, Star, CheckCircle, Sparkles, Filter,
  RefreshCw, Eye, AlertCircle, GraduationCap, Newspaper
} from 'lucide-react';
import { toast } from 'react-hot-toast';


// ─── Types ────────────────────────────────────────────────────────────────────
interface ContentItem {
  id: string;
  title: string;
  authors?: string;
  domain?: string;
  contentType?: string;
  thumbnailUrl?: string;
  fileUrl?: string;
  accessType?: string;
  status?: string;
  locked?: boolean;
  publishedAt?: string;
  description?: string;
}

interface DashboardData {
  displayName?: string;
  nearestExpiry?: string;
  organization?: string;
  role?: string;
  allowedDomains?: string[];
  activeSubscriptions?: number;
  recentActivity?: { id: string; title: string; type: string; date: string; lastPage: number; domain: string }[];
  planType?: string;
  planName?: string;
  expiredSubscriptions?: any[];
}

// ─── Content type icon helper ─────────────────────────────────────────────────
const contentTypeIcon = (type?: string) => {
  const t = (type || '').toLowerCase();
  if (t.includes('video')) return <Play size={14} />;
  if (t.includes('thesis')) return <GraduationCap size={14} />;
  if (t.includes('periodical') || t.includes('journal')) return <Newspaper size={14} />;
  if (t.includes('case')) return <FileText size={14} />;
  return <BookOpen size={14} />;
};

import { DOMAINS } from '../../constants';

// ─── Content row ──────────────────────────────────────────────────────────────
/**
 * One item on the dashboard, as a record.
 *
 * This was a tile: a coloured gradient standing in for a cover that does not
 * exist, a badge in one of four hues, and a hover lift. Twenty of them read as
 * twenty products. It is the same ruled row the search results and the wish
 * list use, so an item looks like itself wherever a reader meets it.
 */
function ContentCard({ item, n, onOpen }: { item: ContentItem; n: number; onOpen: (item: ContentItem) => void }) {
  const navigate = useNavigate();
  const isLocked = item.locked;

  return (
    <div className="group flex gap-4 px-5 py-4">
      <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-[11px] text-faint sm:block">{n}</span>

      <div className="min-w-0 flex-1">
        <button
          onClick={() => !isLocked && onOpen(item)}
          disabled={isLocked}
          className="block w-full text-left disabled:cursor-default"
        >
          <h3 className={`font-serif text-[16px] font-medium leading-snug ${
            isLocked ? 'text-faint' : 'text-ink group-hover:text-accent'}`}>
            {item.title}
          </h3>
        </button>

        <p className="mt-1 truncate text-[13px] text-ink-2">{item.authors || 'Author unrecorded'}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.contentType && (
            <span className="inline-flex items-center gap-1 rounded-[3px] border border-rule-2 px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-muted">
              {contentTypeIcon(item.contentType)} {item.contentType}
            </span>
          )}
          {item.domain && (
            <span className="rounded-[3px] border border-rule-2 px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-muted">
              {item.domain}
            </span>
          )}
          {isLocked && (
            <span className="inline-flex items-center gap-1 rounded-[3px] border border-caution bg-caution-soft px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-caution">
              <Lock size={9} /> Not in your subscription
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 self-start pt-0.5">
        {isLocked ? (
          <button
            onClick={() => navigate('/contact')}
            className="font-mono text-[11px] uppercase tracking-wider text-muted underline-offset-4 hover:text-accent hover:underline"
          >
            Request access
          </button>
        ) : (
          <button
            onClick={() => onOpen(item)}
            className="font-mono text-[11px] uppercase tracking-wider text-muted underline-offset-4 hover:text-accent hover:underline"
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function LMSDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingContent, setLoadingContent] = useState(true);

  const [search, setSearch] = useState(() => sessionStorage.getItem('lms_search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [domainFilter, setDomainFilter] = useState(() => sessionStorage.getItem('lms_domain') || '');
  const [typeFilter, setTypeFilter] = useState(() => sessionStorage.getItem('lms_type') || '');
  const [subjectFilter, setSubjectFilter] = useState(() => sessionStorage.getItem('lms_subject') || '');
  const [tagFilter, setTagFilter] = useState(() => sessionStorage.getItem('lms_tag') || '');
  const [availableFilters, setAvailableFilters] = useState<{ subjects: string[], tags: string[] }>({ subjects: [], tags: [] });
  const [avail, setAvail] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>(() => (sessionStorage.getItem('lms_view') as any) || 'grouped');
  const [showLocked, setShowLocked] = useState(() => sessionStorage.getItem('lms_locked') === '1');

  // pagination
  const ITEMS_PER_PAGE = 20;
  const [page, setPage] = useState(() => Number(sessionStorage.getItem('lms_page')) || 1);
  const [totalItems, setTotalItems] = useState(0);

  // persist state changes
  useEffect(() => {
    sessionStorage.setItem('lms_search', search);
    sessionStorage.setItem('lms_domain', domainFilter);
    sessionStorage.setItem('lms_type', typeFilter);
    sessionStorage.setItem('lms_subject', subjectFilter);
    sessionStorage.setItem('lms_tag', tagFilter);
    sessionStorage.setItem('lms_view', viewMode);
    sessionStorage.setItem('lms_locked', showLocked ? '1' : '0');
    sessionStorage.setItem('lms_page', String(page));
  }, [search, domainFilter, typeFilter, subjectFilter, tagFilter, viewMode, showLocked, page]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { 
      if (debouncedSearch !== search) {
        setDebouncedSearch(search); 
        setPage(1); 
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, debouncedSearch]);


  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  // Fetch dashboard summary
  useEffect(() => {
    fetch('/api/user/dashboard', { headers: authHeader() })
      .then(r => r.json()).then(setDashData)
      .catch(() => toast.error('Failed to load dashboard data'))
      .finally(() => setLoadingDash(false));
  }, []);

  // Access + availability scope (only depts/types the user can access AND that have content)
  useEffect(() => {
    fetch('/api/user/available-facets', { headers: authHeader() })
      .then(r => r.json()).then(d => { if (d && d.legacy) setAvail(d); }).catch(() => {});
  }, []);

  // Fetch dynamic filters — scoped to the user's UNLOCKED content so every tag/subject yields results
  useEffect(() => {
    let url = `/api/content/filters?1=1${showLocked ? '' : '&onlyUnlocked=true'}`;
    if (domainFilter) url += `&domain=${encodeURIComponent(domainFilter)}`;
    if (typeFilter) url += `&contentType=${encodeURIComponent(typeFilter)}`;
    if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;

    fetch(url, { headers: authHeader() })
      .then(r => r.json())
      .then(data => setAvailableFilters(data))
      .catch(err => console.error("Failed to fetch filters", err));
  }, [domainFilter, typeFilter, debouncedSearch, showLocked]);

  // Fetch content list
  const fetchContent = useCallback(async () => {
    setLoadingContent(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
      });
      if (!showLocked) q.set('onlyUnlocked', 'true');
      if (domainFilter) q.set('domain', domainFilter);
      if (typeFilter) q.set('contentType', typeFilter);
      if (subjectFilter) q.set('subjectArea', subjectFilter);
      if (tagFilter) q.set('tag', tagFilter);
      if (debouncedSearch) q.set('search', debouncedSearch);
      const res = await fetch(`/api/content/list?${q}`, { headers: authHeader() });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const items = Array.isArray(json) ? json : json.data || [];
      const total = json.total ?? items.length;
      setContent(items);
      setTotalItems(total);
    } catch { toast.error('Failed to load content'); }
    finally { setLoadingContent(false); }
  }, [domainFilter, typeFilter, subjectFilter, tagFilter, debouncedSearch, page, showLocked]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const handleOpen = (item: ContentItem) => {
    if (item.contentType === 'Educational Videos' || item.contentType === 'Videos') {
      navigate(`/dashboard/videos/player/${item.id}`);
    } else {
      navigate(`/dashboard/content/${item.id}`);
    }
  };

  // Filter content based on showLocked toggle
  const displayContent = showLocked ? content : content.filter(c => !c.locked);

  // Group content by domain
  const grouped = displayContent.reduce<Record<string, ContentItem[]>>((acc, c) => {
    const domain = c.domain || 'General';
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(c);
    return acc;
  }, {});

  const unlockedCount = content.filter(c => !c.locked).length;
  const lockedCount = content.filter(c => c.locked).length;
  
  const expiryDate = dashData?.nearestExpiry ? new Date(dashData.nearestExpiry) : null;
  const expiryStr = expiryDate ? expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const maxDaysLeft = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)) : 0;
  const isExpired = expiryDate && maxDaysLeft === 0;

  const CONTENT_TYPES = ['Books', 'Periodicals', 'Theses', 'Videos', 'Case Reports'];
  const domains = Object.keys(grouped);


  return (
    <div className="min-h-full bg-ground">
      {/* ── DEMO ACCOUNT BANNER ── */}
      {profile?.isDemoAccount && (
        <div className="relative z-40 border-b border-caution bg-caution-soft px-4 py-2 text-center text-[13px] text-caution">
          ⚠️ This is a Demo Account. It is valid for 30 days and will expire on {profile.demoExpiresAt ? new Date(profile.demoExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'its expiry date'}.
        </div>
      )}

      {/* ── TOP HEADER ── */}
      <div className="bg-surface/80 backdrop-blur-xl border-b border-rule/50 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Welcome */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink truncate">
              Welcome back, <span className="text-accent">{dashData?.displayName || profile?.displayName || 'Reader'}</span> 👋
            </h1>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {expiryStr && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Clock size={12} /> Subscription expires {expiryStr}
                </span>
              )}
              {dashData?.organization && (
                <span className="flex items-center gap-1 text-xs text-accent font-medium">
                  <GraduationCap size={12} /> {dashData.organization}
                </span>
              )}
            </div>
          </div>
          {/* Quick Stats */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center gap-2 bg-accent-soft text-accent px-4 py-2 rounded-md text-sm font-semibold border border-rule">
              <CheckCircle size={15} /> {unlockedCount} Accessible
            </div>
            {lockedCount > 0 && (
              <div className="flex items-center gap-2 bg-alarm-soft text-alarm px-4 py-2 rounded-md text-sm font-semibold border border-alarm">
                <Lock size={15} /> {lockedCount} Locked
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* ── SUBSCRIPTION COUNTDOWN WIDGET ── */}
        {expiryDate && (
          <div className={`flex flex-col gap-4 rounded-md border p-5 sm:flex-row sm:items-center sm:justify-between ${
            isExpired || maxDaysLeft <= 10 ? 'border-caution bg-caution-soft' : 'border-rule bg-surface'}`}>
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint">
                {dashData?.planName ? `${dashData.planName} · ${dashData.planType}` : 'Your access'}
              </p>
              <h2 className="mt-1.5 font-serif text-[19px] font-medium text-ink">
                {isExpired ? 'Your access has expired' : 'Your access is active'}
              </h2>
              <p className="mt-1 text-[13.5px] text-ink-2">
                {isExpired
                  ? 'Renew to open the collection again.'
                  : `Runs until ${new Date(expiryDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`}
              </p>
            </div>
            {!isExpired && (
              <div className="shrink-0 text-left sm:text-right">
                <p className={`tnum font-mono text-[30px] leading-none ${maxDaysLeft <= 10 ? 'text-caution' : 'text-ink'}`}>
                  {maxDaysLeft}
                </p>
                <p className="mt-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">
                  {maxDaysLeft === 1 ? 'day left' : 'days left'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── WHAT THE SUBSCRIPTION COVERS ── */}
        {/* These four were gradient tiles in four different hues. They are the
            headline figures of the page, so they stay big — but one surface,
            one rule, and the numbers set in mono so they line up. */}
        <dl className="grid grid-cols-2 divide-rule overflow-hidden rounded-md border border-rule bg-surface sm:grid-cols-4 sm:divide-x">
          {[
            { label: 'Active subscriptions', value: dashData?.activeSubscriptions ?? '—' },
            { label: 'Accessible items',     value: unlockedCount },
            { label: 'Departments covered',  value: dashData?.allowedDomains?.length ?? 0 },
            { label: 'Items read',           value: dashData?.recentActivity?.length ?? 0 },
          ].map(st => (
            <div key={st.label} className="border-b border-rule p-4 sm:border-b-0">
              <dt className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{st.label}</dt>
              <dd className="tnum mt-1.5 font-mono text-[26px] leading-none text-ink">
                {loadingDash ? <span className="text-faint">—</span> : Number(st.value ?? 0).toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── EXPIRED SUBSCRIPTION ALERT ── */}
        {dashData?.expiredSubscriptions && dashData.expiredSubscriptions.length > 0 && (
          (() => {
            const recentExpired = dashData.expiredSubscriptions[0];
            let domainsArr: string[] = [];
            try {
              domainsArr = Array.isArray(recentExpired.domains) ? recentExpired.domains : (recentExpired.domains ? JSON.parse(recentExpired.domains as string) : []);
            } catch (e) {}
            const coveredDomainsStr = domainsArr.length > 0 ? domainsArr.join(', ') : 'All Domains';
            const displayName = recentExpired.domainName || coveredDomainsStr;
            
            return (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-md border border-alarm bg-alarm-soft p-5 md:flex-row md:items-center">
                  <div className="absolute -top-10 -right-10 opacity-[0.03] text-alarm pointer-events-none">
                    <AlertCircle size={200} />
                  </div>
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-md bg-alarm-soft flex items-center justify-center flex-shrink-0 shadow-inner">
                      <AlertCircle size={24} className="text-alarm" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-alarm">
                        {recentExpired.planName || 'Subscription'} Expired
                      </h2>
                      <p className="text-sm text-alarm/90 font-medium mt-1">
                        Your access to <span className="font-bold text-alarm">{displayName}</span> ended on {new Date(recentExpired.endDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}.
                      </p>
                    </div>
                  </div>
                  <button onClick={() => navigate('/dashboard/subscriptions')} className="shrink-0 bg-alarm hover:opacity-90 text-white font-bold px-6 py-3 rounded-md transition-all shadow-lg shadow-red-600/20 hover:shadow-red-600/40 hover:-translate-y-0.5 relative z-10">
                    Renew Access Now
                  </button>
                </div>
              </motion.div>
            );
          })()
        )}

        {/* ── CONTINUE LEARNING (Netflix Style) ── */}
        {dashData?.recentActivity && dashData.recentActivity.length > 0 && (
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-accent" />
                <div>
                  <h2 className="text-xl font-bold text-ink tracking-tight">Continue Reading</h2>
                  <p className="text-xs text-muted font-medium">Pick up right where you left off</p>
                </div>
              </div>
              <button onClick={() => navigate('/dashboard/history')} className="text-xs font-bold text-accent hover:underline flex items-center gap-1">
                View History <ChevronRight size={14} />
              </button>
            </div>

            <div className="flex gap-5 overflow-x-auto pb-6 px-1 -mx-1 scrollbar-hide snap-x snap-mandatory">
              {dashData.recentActivity.slice(0, 6).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="min-w-[280px] w-[280px] snap-start group relative bg-surface rounded-md border border-rule overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 hover:border-accent transition-all cursor-pointer"
                  onClick={() => navigate(`/dashboard/viewer/${a.id}?page=${a.lastPage || 1}`)}
                >
                  {/* Domain header */}
                  <div className="relative flex h-16 items-center justify-center border-b border-rule bg-surface-2">
                    <BookOpen size={24} className="text-faint" />
                    
                    {/* Badge */}
                    <div className="absolute top-3 left-3">
                      <span className="px-2 py-1 rounded-lg bg-black/40 backdrop-blur-md text-[9px] font-black text-white uppercase tracking-widest border border-white/10">
                        {a.type || 'Book'}
                      </span>
                    </div>

                    {/* Progress Bar (Mock for now, lastPage / 100 as fallback) */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (a.lastPage / 50) * 100)}%` }}
                        className="h-full bg-accent"
                      />
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-sm text-ink line-clamp-1 mb-1 group-hover:text-accent transition-colors">
                      {a.title}
                    </h3>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-faint uppercase tracking-tighter">Current Progress</span>
                        <span className="text-xs font-black text-accent">Page {a.lastPage}</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                        <Play size={14} className="fill-current" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── FILTERS & SEARCH ── */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center bg-surface rounded-md border border-rule p-4 shadow-sm w-full">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} />
              <input
                type="text"
                placeholder="Search titles, authors, subjects, tags..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-md bg-surface-2 border border-rule text-sm focus:outline-none focus:border-accent text-ink placeholder:text-faint"
              />
            </div>
            {/* Domain Filter */}
            <select value={domainFilter} onChange={e => { setDomainFilter(e.target.value); setSubjectFilter(''); setTagFilter(''); setPage(1); }}
              className="w-full sm:w-auto min-w-[150px] px-3 py-2.5 rounded-md bg-surface-2 border border-rule text-sm focus:outline-none focus:border-accent text-ink-2">
              <option value="">All Domains</option>
              {(avail?.legacy?.departments || dashData?.allowedDomains || domains).map((d: string) => <option key={d} value={d}>{d}</option>)}
            </select>
            {/* Content Type Filter */}
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setSubjectFilter(''); setTagFilter(''); setPage(1); }}
              className="w-full sm:w-auto min-w-[150px] px-3 py-2.5 rounded-md bg-surface-2 border border-rule text-sm focus:outline-none focus:border-accent text-ink-2">
              <option value="">All Types</option>
              {(avail?.legacy?.contentTypes || CONTENT_TYPES).map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
            {/* Subject Filter */}
            {availableFilters.subjects.length > 0 && (
              <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
                className="w-full sm:w-auto min-w-[150px] max-w-full px-3 py-2.5 rounded-md bg-surface-2 border border-rule text-sm focus:outline-none focus:border-accent text-ink-2 truncate">
                <option value="">All Subjects</option>
                {availableFilters.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {/* View Toggle */}
            <div className="flex gap-1 bg-surface-2 rounded-md p-1 w-full sm:w-auto overflow-x-auto shrink-0">
              <button onClick={() => setViewMode('grouped')} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'grouped' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink-2'}`}>
                Grouped
              </button>
              <button onClick={() => setViewMode('grid')} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'grid' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink-2'}`}>
                Grid
              </button>
            </div>
            {/* Toggle Locked */}
            {lockedCount > 0 && (
              <button 
                onClick={() => setShowLocked(!showLocked)}
                className={`flex justify-center items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border w-full sm:w-auto shrink-0
                  ${showLocked 
                    ? 'bg-alarm-soft border-alarm text-alarm' 
                    : 'bg-surface-2 border-rule text-muted hover:border-accent'
                  }`}
              >
                {showLocked ? <Eye size={14} /> : <Lock size={14} />}
                {showLocked ? 'Hide Locked' : 'Show All'}
              </button>
            )}
          </div>
          
          {/* Quick-Tag Chips */}
          <AnimatePresence>
            {availableFilters.tags.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 items-center bg-surface rounded-md border border-rule p-4 shadow-sm"
              >
                <span className="text-xs font-bold text-faint uppercase tracking-widest mr-1">Popular Tags:</span>
                {availableFilters.tags.slice(0, 15).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                    className={`max-w-full truncate px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                      ${tagFilter === tag 
                        ? 'bg-accent border-accent text-white shadow-md shadow-blue-500/20' 
                        : 'bg-surface-2 border-rule text-ink-2 hover:border-accent hover:text-accent'
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Refresh */}
          <button onClick={fetchContent} className="p-2.5 rounded-md bg-surface-2 border border-rule text-muted hover:bg-accent-soft hover:text-accent transition-colors">
            <RefreshCw size={16} className={loadingContent ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── CONTENT AREA ── */}
        {loadingContent ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-md bg-surface-2 h-60 animate-pulse" />
            ))}
          </div>
        ) : content.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-ink-2 font-bold text-xl mb-2">No content found</h3>
            <p className="text-sm text-faint">Try adjusting your filters or contact your administrator.</p>
          </div>
        ) : viewMode === 'grouped' ? (
          // Grouped by Domain
          <div className="space-y-10">
            {Object.entries(grouped).map(([domain, items]) => (
              <div key={domain}>
                {/* Domain Header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <BookMarked size={15} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-ink">{domain}</h2>
                    <p className="text-xs text-muted">{items.length} items · {items.filter(i => !i.locked).length} accessible</p>
                  </div>
                  <button onClick={() => setDomainFilter(domain)} className="text-xs font-semibold text-accent hover:underline flex items-center gap-1">
                    See all <ChevronRight size={13} />
                  </button>
                </div>
                <div className="divide-y divide-rule rounded-md border border-rule bg-surface">
                  {items.map((item, i) => <ContentCard key={item.id} item={item} n={i + 1} onOpen={handleOpen} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat grid
          <div className="divide-y divide-rule rounded-md border border-rule bg-surface">
            {displayContent.map((item, i) => (
              <ContentCard key={item.id} item={item} n={(page - 1) * ITEMS_PER_PAGE + i + 1} onOpen={handleOpen} />
            ))}
          </div>
        )}

        {/* ── PAGINATION ── */}
        {totalItems > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-center gap-3 py-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-4 py-2 rounded-md bg-surface border border-rule text-sm font-semibold text-ink-2 disabled:opacity-40 hover:border-accent hover:text-accent transition-all shadow-sm"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm font-medium text-ink-2 bg-surface border border-rule px-4 py-2 rounded-md shadow-sm">
              Page <strong className="text-accent">{page}</strong> of <strong>{Math.ceil(totalItems / ITEMS_PER_PAGE)}</strong>
            </span>
            <button
              disabled={page >= Math.ceil(totalItems / ITEMS_PER_PAGE)}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 px-4 py-2 rounded-md bg-surface border border-rule text-sm font-semibold text-ink-2 disabled:opacity-40 hover:border-accent hover:text-accent transition-all shadow-sm"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── LOCKED CONTENT NOTICE ── */}
        {lockedCount > 0 && !domainFilter && !typeFilter && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 rounded-md border border-alarm bg-alarm-soft p-5">
            <div className="w-12 h-12 rounded-md bg-alarm-soft flex items-center justify-center flex-shrink-0">
              <AlertCircle size={24} className="text-alarm" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-alarm">{lockedCount} items are locked</p>
              <p className="text-xs text-alarm mt-0.5">Ask your administrator to extend your access</p>
            </div>
            <button onClick={() => navigate('/contact')} className="shrink-0 bg-alarm hover:opacity-90 text-white px-4 py-2 rounded-md text-xs font-bold transition-colors">
              Request Access
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

