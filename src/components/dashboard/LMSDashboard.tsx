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
  recentActivity?: { id: string; title: string; type: string; date: string }[];
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

const contentTypeBadgeColor = (type?: string) => {
  const t = (type || '').toLowerCase();
  if (t.includes('video')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
  if (t.includes('thesis')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  if (t.includes('periodical') || t.includes('journal')) return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
};

const domainGradient = (domain: string) => {
  const map: Record<string, string> = {
    'Medical': 'from-rose-500 to-rose-700',
    'Engineering': 'from-blue-500 to-blue-700',
    'Pharmacy': 'from-green-500 to-green-700',
    'Nursing': 'from-teal-500 to-teal-700',
    'Law': 'from-amber-500 to-amber-700',
    'Management': 'from-purple-500 to-purple-700',
    'Architecture': 'from-orange-500 to-orange-700',
    'Arts & Humanities': 'from-pink-500 to-pink-700',
  };
  return map[domain] || 'from-slate-500 to-slate-700';
};

// ─── Content Card ─────────────────────────────────────────────────────────────
function ContentCard({ item, onOpen }: { item: ContentItem; onOpen: (item: ContentItem) => void }) {
  const isLocked = item.locked;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={!isLocked ? { y: -4, scale: 1.02 } : {}}
      className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer
        ${isLocked
          ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-75'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-xl hover:shadow-blue-500/10 hover:border-blue-200 dark:hover:border-blue-700'
        }`}
      onClick={() => !isLocked && onOpen(item)}
    >
      {/* Thumbnail / Placeholder */}
      <div className={`relative h-36 flex items-center justify-center text-white bg-gradient-to-br ${domainGradient(item.domain || '')}`}>
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.title} className={`w-full h-full object-cover ${isLocked ? 'blur-sm' : ''}`} />
        ) : (
          <div className="text-6xl opacity-30">
            {contentTypeIcon(item.contentType)}
          </div>
        )}
        {/* Lock overlay */}
        {isLocked && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
            <div className="bg-white/20 backdrop-blur-md rounded-full p-3">
              <Lock size={24} className="text-white" />
            </div>
          </div>
        )}
        {/* Content type badge */}
        <div className="absolute top-2 left-2">
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide backdrop-blur-md bg-black/30 text-white`}>
            {contentTypeIcon(item.contentType)} {item.contentType || 'Book'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className={`font-semibold text-sm line-clamp-2 mb-1 leading-snug ${isLocked ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
          {item.title}
        </h3>
        <p className={`text-xs line-clamp-1 mb-3 ${isLocked ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {item.authors || 'Unknown Author'}
        </p>
        <div className="flex items-center gap-2">
          {item.domain && (
            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-[10px] font-bold rounded-md uppercase tracking-wide truncate max-w-[80px]">
              {item.domain}
            </span>
          )}
          <div className="flex-1" />
          {isLocked ? (
            <button className="text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 px-3 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
              Upgrade
            </button>
          ) : (
            <button className="text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 px-3 py-1 rounded-lg group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all flex items-center gap-1">
              Open <ChevronRight size={10} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
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

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>('grouped');
  const [showLocked, setShowLocked] = useState(false);

  // pagination
  const ITEMS_PER_PAGE = 20;
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // dark mode
  const [dark, setDark] = useState(() => localStorage.getItem('lms-dark') === '1');
  useEffect(() => {
    const el = document.documentElement;
    if (dark) el.classList.add('dark');
    else el.classList.remove('dark');
    localStorage.setItem('lms-dark', dark ? '1' : '0');
  }, [dark]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);


  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  // Fetch dashboard summary
  useEffect(() => {
    fetch('/api/user/dashboard', { headers: authHeader() })
      .then(r => r.json()).then(setDashData)
      .catch(() => toast.error('Failed to load dashboard data'))
      .finally(() => setLoadingDash(false));
  }, []);

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
  }, [domainFilter, typeFilter, debouncedSearch, page, showLocked]);

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
  const expiryStr = dashData?.nearestExpiry ? new Date(dashData.nearestExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  const CONTENT_TYPES = ['Books', 'Periodicals', 'Theses', 'Videos', 'Case Reports'];
  const domains = Object.keys(grouped);

  const gradients = [
    'from-blue-600 to-indigo-700',
    'from-emerald-500 to-teal-600',
    'from-rose-500 to-pink-600',
    'from-amber-500 to-orange-600',
    'from-purple-500 to-violet-600',
  ];

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 transition-colors duration-300`}>
      {/* ── TOP HEADER ── */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Welcome */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
              Welcome back, <span className="text-blue-600 dark:text-blue-400">{dashData?.displayName || profile?.displayName || 'Reader'}</span> 👋
            </h1>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {expiryStr && (
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Clock size={12} /> Subscription expires {expiryStr}
                </span>
              )}
              {dashData?.organization && (
                <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                  <GraduationCap size={12} /> {dashData.organization}
                </span>
              )}
            </div>
          </div>
          {/* Quick Stats */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-100 dark:border-emerald-800/40">
              <CheckCircle size={15} /> {unlockedCount} Accessible
            </div>
            {lockedCount > 0 && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl text-sm font-semibold border border-red-100 dark:border-red-800/40">
                <Lock size={15} /> {lockedCount} Locked
              </div>
            )}
            <button onClick={() => setDark(d => !d)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-lg" title="Toggle Dark Mode">
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* ── STATS ROW ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active Subscriptions', value: dashData?.activeSubscriptions ?? '—', gradient: 'from-blue-500 to-blue-700', icon: <Star size={22} /> },
            { label: 'Accessible Content', value: unlockedCount, gradient: 'from-emerald-500 to-emerald-700', icon: <BookOpen size={22} /> },
            { label: 'Domains Covered', value: dashData?.allowedDomains?.length ?? 0, gradient: 'from-purple-500 to-purple-700', icon: <Layers size={22} /> },
            { label: 'Items Read', value: dashData?.recentActivity?.length ?? 0, gradient: 'from-amber-500 to-orange-600', icon: <TrendingUp size={22} /> },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className={`bg-gradient-to-br ${s.gradient} rounded-2xl p-5 text-white shadow-lg relative overflow-hidden`}>
              <div className="absolute -right-4 -top-4 opacity-20">{s.icon}</div>
              <div className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">{s.label}</div>
              <div className="text-4xl font-extrabold">{loadingDash ? <div className="w-10 h-8 bg-white/20 rounded animate-pulse" /> : s.value}</div>
            </motion.div>
          ))}
        </div>

        {/* ── CONTINUE LEARNING (Netflix Style) ── */}
        {dashData?.recentActivity && dashData.recentActivity.length > 0 && (
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 rounded-full bg-gradient-to-b from-blue-600 to-blue-400 shadow-sm shadow-blue-500/20" />
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Continue Reading</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Pick up right where you left off</p>
                </div>
              </div>
              <button className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
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
                  className="min-w-[280px] w-[280px] snap-start group relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 hover:border-blue-300 dark:hover:border-blue-600 transition-all cursor-pointer"
                  onClick={() => navigate(`/dashboard/viewer/${a.id}?page=${a.lastPage || 1}`)}
                >
                  {/* Thumbnail / Domain Header */}
                  <div className={`h-24 bg-gradient-to-br ${domainGradient(a.domain || '')} relative flex items-center justify-center`}>
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                    <BookOpen size={32} className="text-white/30 group-hover:scale-110 transition-transform duration-500" />
                    
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
                        className="h-full bg-blue-500"
                      />
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 line-clamp-1 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {a.title}
                    </h3>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Current Progress</span>
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">Page {a.lastPage}</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
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
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search titles, authors, topics..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 text-slate-800 dark:text-white placeholder:text-slate-400"
            />
          </div>
          {/* Domain Filter */}
          <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
            className="min-w-[150px] px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm focus:outline-none focus:border-blue-400 text-slate-700 dark:text-slate-200">
            <option value="">All Domains</option>
            {(dashData?.allowedDomains || domains).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {/* Content Type Filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="min-w-[150px] px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm focus:outline-none focus:border-blue-400 text-slate-700 dark:text-slate-200">
            <option value="">All Types</option>
            {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* View Toggle */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
            <button onClick={() => setViewMode('grouped')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'grouped' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
              Grouped
            </button>
            <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
              Grid
            </button>
          </div>
          {/* Toggle Locked */}
          {lockedCount > 0 && (
            <button 
              onClick={() => setShowLocked(!showLocked)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border
                ${showLocked 
                  ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 hover:border-blue-300'
                }`}
            >
              {showLocked ? <Eye size={14} /> : <Lock size={14} />}
              {showLocked ? 'Hide Locked' : 'Show All'}
            </button>
          )}

          {/* Refresh */}
          <button onClick={fetchContent} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 transition-colors">
            <RefreshCw size={16} className={loadingContent ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── CONTENT AREA ── */}
        {loadingContent ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-slate-200 dark:bg-slate-700 h-60 animate-pulse" />
            ))}
          </div>
        ) : content.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-slate-700 dark:text-slate-200 font-bold text-xl mb-2">No content found</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500">Try adjusting your filters or contact your administrator.</p>
          </div>
        ) : viewMode === 'grouped' ? (
          // Grouped by Domain
          <div className="space-y-10">
            {Object.entries(grouped).map(([domain, items]) => (
              <div key={domain}>
                {/* Domain Header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white bg-gradient-to-br ${domainGradient(domain)} shadow-sm`}>
                    <BookMarked size={16} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">{domain}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{items.length} items · {items.filter(i => !i.locked).length} accessible</p>
                  </div>
                  <button onClick={() => setDomainFilter(domain)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                    See all <ChevronRight size={13} />
                  </button>
                </div>
                {/* Content types sub-grouped */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {items.map(item => <ContentCard key={item.id} item={item} onOpen={handleOpen} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat grid
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {displayContent.map(item => <ContentCard key={item.id} item={item} onOpen={handleOpen} />)}
            </AnimatePresence>
          </div>
        )}

        {/* ── PAGINATION ── */}
        {totalItems > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-center gap-3 py-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl shadow-sm">
              Page <strong className="text-blue-600 dark:text-blue-400">{page}</strong> of <strong>{Math.ceil(totalItems / ITEMS_PER_PAGE)}</strong>
            </span>
            <button
              disabled={page >= Math.ceil(totalItems / ITEMS_PER_PAGE)}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── LOCKED CONTENT NOTICE ── */}
        {lockedCount > 0 && !domainFilter && !typeFilter && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 bg-gradient-to-r from-rose-50 to-rose-50/50 dark:from-rose-900/20 dark:to-rose-900/10 border border-rose-200 dark:border-rose-800/40 rounded-2xl p-5">
            <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={24} className="text-rose-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-800 dark:text-rose-300">{lockedCount} items are locked</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">Upgrade your subscription to access more content and domains.</p>
            </div>
            <button onClick={() => navigate('/pricing')} className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors">
              Upgrade Plan
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

