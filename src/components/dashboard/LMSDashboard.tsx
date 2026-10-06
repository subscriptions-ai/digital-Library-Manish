import React, { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardTitle } from '../../lib/identity';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Search, BookOpen, Play, FileText, BookMarked, Lock, Clock,
  ChevronRight, ChevronLeft, CheckCircle,
  RefreshCw, Eye, AlertCircle, AlertTriangle, GraduationCap, Newspaper
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Weeks, Bars, Collection } from '../charts';
import { Button, EmptyState, MetricCard, SkeletonRows, StatusBadge } from '../ui';


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
  membership?: { name: string; kind: 'Free' | 'Pro'; timed: boolean };
  collection?: {
    journals: number; articles: number; books: number; total: number;
    byDepartment: { name: string; articles: number; books: number; other: number; total: number }[];
  };
  departmentsCovered?: number;
  selectedDepartments?: number;
  itemsRead?: number;
  readByWeek?: number[];
  readByDepartment?: { name: string; reads: number }[];
  minutesRead?: number;
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
    <div className="group flex gap-4 px-4 py-4 sm:px-5">
      <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-xs text-faint sm:block" aria-hidden="true">{n}</span>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => !isLocked && onOpen(item)}
          disabled={isLocked}
          className="block w-full text-left disabled:cursor-default"
        >
          <h3 className={`font-serif text-base font-medium leading-snug transition-colors duration-150 ${
            isLocked ? 'text-muted' : 'text-ink group-hover:text-accent'}`}>
            {item.title}
          </h3>
        </button>

        <p className="mt-1 truncate text-[13px] text-ink-2">{item.authors || 'Author unrecorded'}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.contentType && (
            <span className="badge badge-neutral">
              <span aria-hidden="true">{contentTypeIcon(item.contentType)}</span> {item.contentType}
            </span>
          )}
          {item.domain && (
            <span className="badge badge-neutral max-w-full truncate">{item.domain}</span>
          )}
          {isLocked && (
            <span className="badge badge-caution">
              <Lock size={12} aria-hidden="true" /> Not in your subscription
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 self-start">
        {isLocked ? (
          <button
            type="button"
            onClick={() => navigate('/contact')}
            aria-label={`Request access to ${item.title}`}
            className="btn btn-ghost btn-sm text-accent"
          >
            Request access
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(item)}
            aria-label={`Open ${item.title}`}
            className="btn btn-ghost btn-sm text-accent"
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

type Trending = {
  since: string | null;
  chosenBy?: 'asked' | 'registration' | 'collection';
  departments: { name: string; basis: 'read' | 'new'; items: {
    id: string; type: string; title: string; where?: string | null; reads?: number; at?: string;
  }[] }[];
};

const readerPath = (type: string, id: string) =>
  type === 'article' ? `/dashboard/article/${id}`
  : type === 'book' ? `/dashboard/viewer/${id}`
  : `/dashboard/content/${id}`;

const ago = (iso?: string) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days <= 0 ? 'added today' : days === 1 ? 'added yesterday'
    : days < 30 ? `added ${days} days ago` : `added ${Math.round(days / 30)} months ago`;
};

/**
 * Where to go next, by department.
 *
 * The dashboard ended in a wall of filters over a shelf that could come back
 * empty, which is a dead end dressed as a library. This answers the question
 * the filters were making the reader ask for themselves.
 *
 * It says what it is measuring, because the two things it can honestly measure
 * are small: what members here have opened in the last thirty days, and — for a
 * department nobody has opened yet — what arrived most recently. It is not a
 * global trend. We hold no citation counts, and a number with no source behind
 * it is worth less than no number.
 */
function WorthOpening({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<Trending | null>(null);

  useEffect(() => {
    fetch('/api/library/trending', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data?.departments?.length) return null;

  return (
    <section className="space-y-4" aria-labelledby="dash-recommended">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="dash-recommended" className="type-section text-ink">Worth opening next</h2>
        <p className="text-xs text-muted">
          {data.chosenBy === 'registration'
            ? 'In the departments you chose when you registered'
            : data.chosenBy === 'asked' ? 'In the departments you asked for'
            : 'In the departments we hold most of'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.departments.map(d => (
          <div key={d.name} className="card card-pad flex flex-col">
            <h3 className="truncate text-sm font-semibold text-ink" title={d.name}>
              {d.name}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {d.basis === 'read' ? 'Most opened here, last 30 days' : 'Nobody has opened these yet — newest first'}
            </p>
            <ul className="mt-4 space-y-3">
              {d.items.map(it => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => navigate(readerPath(it.type, it.id))}
                    className="group w-full rounded-lg text-left"
                  >
                    <p className="line-clamp-2 text-[13px] leading-snug text-ink-2 transition-colors duration-150 group-hover:text-accent">
                      {it.title}
                    </p>
                    <p className="mt-1 flex items-baseline gap-1.5 text-xs text-muted">
                      {it.where && <span className="min-w-0 truncate">{it.where}</span>}
                      {it.where && <span className="shrink-0" aria-hidden="true">·</span>}
                      <span className="shrink-0 tabular-nums">
                        {d.basis === 'read'
                          ? `${it.reads} ${it.reads === 1 ? 'read' : 'reads'}`
                          : ago(it.at)}
                      </span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => navigate(`/dashboard/department/${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`)}
              className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-accent hover:underline"
            >
              Browse the department <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
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
      .then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setDashData)
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
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
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

  // Both of these describe the page of results in hand, not the library, so
  // they may switch a filter on and off but must never be quoted as a figure:
  // "20 Accessible" was this, on a library of 61,706.
  const lockedCount = content.filter(c => c.locked).length;
  
  const expiryDate = dashData?.nearestExpiry ? new Date(dashData.nearestExpiry) : null;
  const expiryStr = expiryDate ? expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const maxDaysLeft = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)) : 0;
  const isExpired = expiryDate && maxDaysLeft === 0;

  const CONTENT_TYPES = ['Books', 'Periodicals', 'Theses', 'Videos', 'Case Reports'];
  const domains = Object.keys(grouped);


  // Labels for the four headline figures. A figure that did not arrive shows
  // "—" (MetricCard's null), never a 0 the member could take for the truth.
  const fmt = (n?: number | null) => (typeof n === 'number' ? n.toLocaleString() : null);

  return (
    <div className="space-y-8">
      {/* ── DEMO ACCOUNT BANNER ── */}
      {profile?.isDemoAccount && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-caution bg-caution-soft px-4 py-3 text-sm text-ink-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
          <p>This is a Demo Account. It is valid for 30 days and will expire on {profile.demoExpiresAt ? new Date(profile.demoExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'its expiry date'}.</p>
        </div>
      )}

      {/* ── WELCOME ── */}
      {/* This used to be a second sticky bar under the layout's own sticky
          header, so the two stacked over the content as the page scrolled. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {dashboardTitle(profile as any)}
          </p>
          <h1 className="type-page-title mt-1 truncate text-ink">
            Welcome back, <span className="text-accent">{dashData?.displayName || profile?.displayName || 'Reader'}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {expiryStr && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                <Clock size={14} aria-hidden="true" /> Subscription expires {expiryStr}
              </span>
            )}
            {dashData?.organization && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-accent">
                <GraduationCap size={14} className="shrink-0" aria-hidden="true" /> <span className="truncate">{dashData.organization}</span>
              </span>
            )}
          </div>
        </div>
        {/* What is open to them — the library's figure, not the page's.
            This read "20 Accessible" on a library of 61,706, because it
            counted the rows of the page that had just been fetched. */}
        {!loadingDash && typeof dashData?.collection?.total === 'number' && (
          <span className="badge badge-accent hidden shrink-0 lg:inline-flex">
            <CheckCircle size={14} aria-hidden="true" />
            {dashData.collection.total.toLocaleString()} items open to you
          </span>
        )}
      </div>

      {/* ── EXPIRED SUBSCRIPTION ALERT ── */}
      {/* Expiry is something to act on, not a failure, so it reads as a
          caution rather than an error. */}
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
            <div role="status" className="flex flex-col items-start justify-between gap-4 rounded-xl border border-caution bg-caution-soft p-5 md:flex-row md:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <AlertCircle size={20} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink">
                      {recentExpired.planName || 'Subscription'} Expired
                    </h2>
                    <StatusBadge status="subscription-expired" />
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    Your access to <span className="font-semibold text-ink">{displayName}</span> ended on {new Date(recentExpired.endDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}.
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate('/dashboard/subscriptions')} className="shrink-0">
                Renew Access Now
              </Button>
            </div>
          );
        })()
      )}

      {/* ── SUBSCRIPTION ACCESS ── */}
      {expiryDate && (
        <section aria-label="Subscription access" className={`flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between ${
          isExpired || maxDaysLeft <= 10 ? 'border-caution bg-caution-soft' : 'card'}`}>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {dashData?.planName ? `${dashData.planName} · ${dashData.planType}` : 'Your access'}
            </p>
            <div className="mt-2">
              <StatusBadge status={isExpired ? 'subscription-expired' : 'subscription-active'} />
            </div>
            <p className="mt-2 text-sm text-ink-2">
              {isExpired
                ? 'Renew to open the collection again.'
                : `Runs until ${new Date(expiryDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`}
            </p>
          </div>
          {!isExpired && (
            <div className="shrink-0 text-left sm:text-right">
              <p className={`tnum font-mono text-3xl leading-none ${maxDaysLeft <= 10 ? 'text-caution' : 'text-ink'}`}>
                {maxDaysLeft}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                {maxDaysLeft === 1 ? 'day left' : 'days left'}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── WHAT THE SUBSCRIPTION COVERS ── */}
      {/* Four figures a member can act on. Three of these were wrong: the
          first counted subscriptions on a product that no longer sells the
          member one, the second counted the page instead of the library, and
          the last counted the recent-activity list, which stops at six. */}
      <section aria-label="Your account at a glance" className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Subscription"
          loading={loadingDash}
          value={dashData ? (dashData.membership?.name || 'Basic') : null}
          context={dashData ? (dashData.membership?.timed ? 'Free · half an hour at a time' : 'No session limit') : undefined}
        />
        <MetricCard
          label="Open to you"
          loading={loadingDash}
          value={fmt(dashData?.collection?.total)}
          context={dashData?.collection
            ? `${Number(dashData.collection.articles ?? 0).toLocaleString()} articles · ${Number(dashData.collection.books ?? 0).toLocaleString()} books`
            : undefined}
        />
        {dashData?.selectedDepartments
          ? <MetricCard label="Your departments" loading={loadingDash} value={fmt(dashData.selectedDepartments)} context="The ones you selected" />
          : <MetricCard label="Departments" loading={loadingDash} value={fmt(dashData?.departmentsCovered)} context="Holding something you can open" />}
        <MetricCard
          label="Items you have read"
          loading={loadingDash}
          value={fmt(dashData?.itemsRead)}
          context={(dashData?.minutesRead ?? 0) > 0 ? `${dashData?.minutesRead} minutes on the page` : undefined}
        />
      </section>

      {/* ── CONTINUE READING ── */}
      {dashData?.recentActivity && dashData.recentActivity.length > 0 && (
        <section aria-labelledby="dash-continue">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="dash-continue" className="type-section text-ink">Continue Reading</h2>
              <p className="mt-1 text-sm text-muted">Pick up right where you left off</p>
            </div>
            <button type="button" onClick={() => navigate('/dashboard/history')} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline">
              View history <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          {/* The bar that used to sit under each card was drawn from the page
              number over a guessed fifty pages — a progress figure we do not
              hold — so it has gone and the page number stays. */}
          <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 scrollbar-hide">
            {dashData.recentActivity.slice(0, 6).map(a => (
              <button
                type="button"
                key={a.id}
                className="card card-interactive group w-[260px] min-w-[260px] snap-start overflow-hidden text-left sm:w-[280px] sm:min-w-[280px]"
                onClick={() => navigate(`/dashboard/viewer/${a.id}?page=${a.lastPage || 1}`)}
                aria-label={`Continue reading ${a.title}, page ${a.lastPage}`}
              >
                <div className="flex h-14 items-center justify-between border-b border-rule bg-surface-2 px-4">
                  <span className="badge badge-neutral">{a.type || 'Book'}</span>
                  <BookOpen size={20} className="text-faint" aria-hidden="true" />
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-1 text-sm font-semibold text-ink transition-colors duration-150 group-hover:text-accent">
                    {a.title}
                  </h3>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted">Last page read</span>
                      <span className="text-sm font-semibold text-accent">Page {a.lastPage}</span>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-on" aria-hidden="true">
                      <Play size={14} className="fill-current" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── WHAT YOU READ ────────────────────────────────────────────────── */}
      {/* A dashboard for one reader has a hard problem: on the first day
          there is no reading to show, and a page of empty frames is worse
          than no page. So half of this is about the member and appears once
          they have read something, and half is about the library and is
          there from the first minute — which is also the half that tells
          them where to go next. */}
      {!loadingDash && (
        <section className="space-y-4" aria-labelledby="dash-reading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="dash-reading" className="type-section text-ink">Your reading</h2>
            {(dashData?.itemsRead ?? 0) > 0 && (
              <button type="button" onClick={() => navigate('/dashboard/history')}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline">
                Reading History <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {(dashData?.readByWeek?.length || dashData?.readByDepartment?.length) ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card card-pad">
                <h3 className="card-title">Reading, by week</h3>
                <p className="mt-1 text-sm text-muted">The last twelve weeks</p>
                <div className="mt-4">
                  {dashData?.readByWeek?.length
                    ? <Weeks data={dashData.readByWeek} />
                    : <p className="py-8 text-center text-sm text-muted">Nothing opened in the last twelve weeks.</p>}
                </div>
              </div>
              <div className="card card-pad">
                <h3 className="card-title">What you read</h3>
                <p className="mt-1 text-sm text-muted">By subject, since you joined</p>
                <div className="mt-4">
                  {dashData?.readByDepartment?.length
                    ? <Bars rows={dashData.readByDepartment.map(x => ({ name: x.name, value: x.reads }))} unit="opened" />
                    : <p className="py-8 text-center text-sm text-muted">Nothing opened yet.</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <EmptyState
                icon={BookOpen}
                title="No reading yet"
                description="You have not opened anything yet. Once you do, this is where your reading shows up — week by week, and by subject."
                action={<Button variant="outline" size="sm" onClick={() => navigate('/dashboard/library')}>Browse the library</Button>}
              />
            </div>
          )}
        </section>
      )}

      {/* ── WHERE TO GO NEXT ── */}
      <WorthOpening navigate={navigate} />

      {!loadingDash && dashData?.collection?.byDepartment?.length ? (
        <section className="card card-pad" aria-labelledby="dash-depth">
          <h2 id="dash-depth" className="card-title">Where the library is deep</h2>
          <p className="mt-1 text-sm text-muted">Everything open to you, by department</p>
          <div className="mt-4">
            <Collection rows={dashData.collection.byDepartment} />
          </div>
        </section>
      ) : null}

      {/* ── BROWSE: FILTERS & SEARCH ── */}
      <section className="space-y-4" aria-labelledby="dash-browse">
        <h2 id="dash-browse" className="type-section text-ink">Browse your library</h2>
        <div className="flex flex-col gap-3">
          <div className="card flex w-full flex-col flex-wrap items-stretch gap-3 p-4 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search titles, authors, subjects and tags"
                placeholder="Search titles, authors, subjects, tags..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-9"
              />
            </div>
            {/* Domain Filter */}
            <select aria-label="Domain" value={domainFilter} onChange={e => { setDomainFilter(e.target.value); setSubjectFilter(''); setTagFilter(''); setPage(1); }}
              className="input sm:w-auto sm:min-w-[150px]">
              <option value="">All Domains</option>
              {(avail?.legacy?.departments || dashData?.allowedDomains || domains).map((d: string) => <option key={d} value={d}>{d}</option>)}
            </select>
            {/* Content Type Filter */}
            <select aria-label="Content type" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setSubjectFilter(''); setTagFilter(''); setPage(1); }}
              className="input sm:w-auto sm:min-w-[150px]">
              <option value="">All Types</option>
              {(avail?.legacy?.contentTypes || CONTENT_TYPES).map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
            {/* Subject Filter */}
            {availableFilters.subjects.length > 0 && (
              <select aria-label="Subject" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
                className="input max-w-full truncate sm:w-auto sm:min-w-[150px]">
                <option value="">All Subjects</option>
                {availableFilters.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {/* View Toggle */}
            <div className="flex w-full shrink-0 gap-1 rounded-lg bg-surface-2 p-1 sm:w-auto" role="group" aria-label="Layout">
              <button type="button" aria-pressed={viewMode === 'grouped'} onClick={() => setViewMode('grouped')} className={`h-8 flex-1 rounded-md px-3 text-xs font-semibold transition-colors duration-150 sm:flex-none ${viewMode === 'grouped' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink-2'}`}>
                Grouped
              </button>
              <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} className={`h-8 flex-1 rounded-md px-3 text-xs font-semibold transition-colors duration-150 sm:flex-none ${viewMode === 'grid' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink-2'}`}>
                Grid
              </button>
            </div>
            {/* Toggle Locked */}
            {lockedCount > 0 && (
              <button 
                type="button"
                aria-pressed={showLocked}
                onClick={() => setShowLocked(!showLocked)}
                className={`btn btn-sm w-full shrink-0 sm:w-auto ${showLocked ? 'btn-secondary' : 'btn-outline'}`}
              >
                {showLocked ? <Eye size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                {showLocked ? 'Hide Locked' : 'Show All'}
              </button>
            )}
            {/* Refresh */}
            <button
              type="button"
              onClick={fetchContent}
              aria-label="Refresh results"
              title="Refresh results"
              className="btn btn-outline btn-icon shrink-0 self-end sm:self-auto"
            >
              <RefreshCw size={16} className={loadingContent ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          </div>
          
          {/* Quick-Tag Chips */}
          <AnimatePresence>
            {availableFilters.tags.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="card flex flex-wrap items-center gap-2 p-4"
              >
                <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted">Popular tags</span>
                {availableFilters.tags.slice(0, 15).map(tag => (
                  <button
                    type="button"
                    key={tag}
                    aria-pressed={tagFilter === tag}
                    onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                    className={`max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150
                      ${tagFilter === tag 
                        ? 'border-accent bg-accent text-accent-on' 
                        : 'border-rule bg-surface-2 text-ink-2 hover:border-accent hover:text-accent'
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── CONTENT AREA ── */}
        {loadingContent ? (
          <div className="card card-pad">
            <SkeletonRows rows={6} />
          </div>
        ) : content.length === 0 ? (
          // A shelf that comes back empty because of a filter set on a previous
          // visit — the state survives in sessionStorage — used to end in advice
          // to adjust filters, with nothing to press. Now there is something to
          // press, and a way into the rest of the library.
          <div className="card">
            <EmptyState
              icon={Search}
              title="No research results match these filters"
              description={[search && `“${search}”`, domainFilter, typeFilter, subjectFilter, tagFilter].filter(Boolean).join(' · ') || 'No filters are set.'}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    onClick={() => {
                      setSearch(''); setDebouncedSearch('');
                      setDomainFilter(''); setTypeFilter(''); setSubjectFilter(''); setTagFilter('');
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/dashboard/library')}>
                    Search the whole library
                  </Button>
                </div>
              }
            />
          </div>
        ) : viewMode === 'grouped' ? (
          // Grouped by Domain
          <div className="space-y-8">
            {Object.entries(grouped).map(([domain, items]) => (
              <div key={domain}>
                {/* Domain Header */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                    <BookMarked size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-ink">{domain}</h3>
                    <p className="text-xs text-muted">{items.length} items · {items.filter(i => !i.locked).length} accessible</p>
                  </div>
                  <button type="button" onClick={() => setDomainFilter(domain)} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline" aria-label={`See all in ${domain}`}>
                    See all <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="card divide-y divide-rule overflow-hidden">
                  {items.map((item, i) => <ContentCard key={item.id} item={item} n={i + 1} onOpen={handleOpen} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat grid
          <div className="card divide-y divide-rule overflow-hidden">
            {displayContent.map((item, i) => (
              <ContentCard key={item.id} item={item} n={(page - 1) * ITEMS_PER_PAGE + i + 1} onOpen={handleOpen} />
            ))}
          </div>
        )}

        {/* ── PAGINATION ── */}
        {totalItems > ITEMS_PER_PAGE && (
          <nav className="flex flex-wrap items-center justify-center gap-3 py-2" aria-label="Pagination">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} aria-hidden="true" /> Previous
            </Button>
            <span className="text-sm text-ink-2" aria-current="page">
              Page <strong className="text-ink">{page}</strong> of <strong className="text-ink">{Math.ceil(totalItems / ITEMS_PER_PAGE)}</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(totalItems / ITEMS_PER_PAGE)}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
            >
              Next <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </nav>
        )}

        {/* ── LOCKED CONTENT NOTICE ── */}
        {lockedCount > 0 && !domainFilter && !typeFilter && (
          <div className="flex flex-col gap-4 rounded-xl border border-caution bg-caution-soft p-5 sm:flex-row sm:items-center">
            <Lock size={20} className="shrink-0 text-caution" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Some items here are locked</p>
              <p className="mt-1 text-sm text-ink-2">Ask your administrator to extend your access</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/contact')} className="shrink-0">
              Request Access
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
