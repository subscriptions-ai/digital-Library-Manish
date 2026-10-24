import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock, FileText, Lock, Newspaper, Sparkles } from 'lucide-react';
import { useAllowance, inCooldown, clockTime, countdown, type Allowance } from '../membership/ReadingClock';
import { ResultCard } from '../StructuredLibrary';
import { EmptyState, ErrorState, Skeleton, buttonClass } from '../ui';
import { getLibraryPaths, libraryUrl } from '../../lib/libraryRoute';
import { SHELVES, SHELF_LABEL, addedToday, latest, toItems, type DeptItem, type ShelfKind } from '../../lib/departmentContent';

/**
 * What a signed-in member sees on a department's page: where they stand (Free Preview, cooldown, plan), and the department's newest
 * content — from the same endpoints the library and the home page read, narrowed to this department, opened the way the library opens it.
 *
 * Nothing here decides who may read. The server scopes every list to the member's plan and the reader enforces the Free Preview clock;
 * this page only asks, shows what it is told, and sends the member to the existing library, viewer or membership page.
 */

type Account = { role?: string | null; institutionId?: string | null };
const token = () => localStorage.getItem('token');
const auth = () => ({ headers: { Authorization: `Bearer ${token()}` } });
const PER_SHELF = 8;
const SHOWN = 8;

// ── Access: eligibility for THIS department, and the Free Preview clock ─────────────────────

export type DepartmentAccess = {
  /** null until the server has answered; false when the member's plan does not cover this department. */
  eligible: boolean | null;
  /** Which shelves the library itself will let this member browse (its own `available-facets` rule), so this page never lists what the library then hides. */
  shelves: Record<ShelfKind, boolean>;
  allowance: Allowance | null;
  msLeft: number | null;
  msUntil: number | null;
  cooling: boolean;
};

/**
 * The same two questions the library asks: what is this member's scope (`available-facets`) and what is their clock (`allowance`).
 * A member with no plan sees the departments they chose, on the Free Preview clock; a member with a plan sees what the plan covers.
 */
export function useDepartmentAccess(domainName: string, enabled: boolean): DepartmentAccess {
  const { allowance, msLeft, msUntil } = useAllowance(30_000, enabled);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [shelves, setShelves] = useState<Record<ShelfKind, boolean>>({ articles: true, books: true, periodicals: true });

  useEffect(() => {
    if (!enabled) { setEligible(null); return; }
    let live = true;
    fetch('/api/user/available-facets', auth())
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!live) return;
        if (!d || !d.neu) { setEligible(true); return; }                       // cannot tell: do not turn a member away on a guess
        const covered: string[] = Array.isArray(d.scope?.domains) ? d.scope.domains : [];
        setEligible(!!d.all || covered.includes(domainName));
        // The library's own rules for what a member is offered: Books and Articles from the new collection, Periodicals from the archive.
        setShelves({
          articles: !!d.all || d.neu.hasArticles !== false,
          books: !!d.all || d.neu.hasBooks === true,
          periodicals: !!d.all || (Array.isArray(d.archived?.contentTypes) ? d.archived.contentTypes.includes('Periodicals') : true),
        });
      })
      .catch(() => { if (live) setEligible(true); });
    return () => { live = false; };
  }, [domainName, enabled]);

  return { eligible, shelves, allowance, msLeft, msUntil, cooling: inCooldown(allowance, msUntil) };
}

/** One honest line about where the member stands. Renders nothing when there is nothing to say (a plan with no clock). */
export function AccessNotice({ access, department, account }: { access: DepartmentAccess; department: string; account: Account }) {
  const paths = getLibraryPaths(account);
  const a = access.allowance;

  if (access.eligible === false) {
    return (
      <div role="status" className="card mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 p-4 text-left">
        <p className="flex items-start gap-2 text-sm text-ink-2"><Lock size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
          <span>Your current plan does not include <b className="text-ink">{department}</b>.</span></p>
        <Link to={paths.membership} className={buttonClass('primary', 'md')}>View subscription options</Link>
      </div>
    );
  }
  if (!a?.timed) return null;

  if (access.cooling) {
    return (
      <p role="status" className="mx-auto flex max-w-3xl items-start gap-2 rounded-xl border border-caution bg-caution-soft px-4 py-3 text-left text-sm text-ink">
        <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-caution" />
        <span>{a.state === 'spent' ? 'Reading is available after midnight.' : <>Reading available at <b>{clockTime(a.nextOpensAt)}</b>.</>} You can still browse what {department} holds.</span>
      </p>
    );
  }
  if (a.state === 'running') {
    return (
      <p role="status" className="mx-auto flex max-w-3xl items-start gap-2 rounded-xl border border-accent bg-accent-soft px-4 py-3 text-left text-sm text-ink">
        <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
        <span><b>Your Free Preview is active</b>{access.msLeft != null ? <> — {countdown(access.msLeft)} left in this session</> : null}.</span>
      </p>
    );
  }
  return (
    <p role="status" className="mx-auto flex max-w-3xl items-start gap-2 rounded-xl border border-rule bg-surface-2 px-4 py-3 text-left text-sm text-ink-2">
      <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
      <span><b className="text-ink">Your Free Preview is ready.</b> Opening a document starts a 30-minute session{typeof a.sessionsLeft === 'number' ? `; ${a.sessionsLeft} left today` : ''}.</span>
    </p>
  );
}

// ── The content ─────────────────────────────────────────────────────────────

type Shelves = Record<ShelfKind, { items: DeptItem[]; total: number }>;
const ICON: Record<ShelfKind, any> = { articles: FileText, books: BookOpen, periodicals: Newspaper };

/** "Latest in {department}", with the shelf filter. Fetches real Published content for this department only. */
export function DepartmentContent({ department, account, access }: { department: string; account: Account; access: DepartmentAccess }) {
  const navigate = useNavigate();
  const paths = getLibraryPaths(account);
  const [sp, setSp] = useSearchParams();
  const [shelves, setShelves] = useState<Shelves | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  const q = useMemo(() => new URLSearchParams({ domain: department, limit: String(PER_SHELF), sort: 'added' }).toString(), [department]);

  useEffect(() => {
    if (access.eligible !== true) return;                    // nothing to list for a plan that does not cover it
    let live = true;
    setShelves(null); setFailed(false);
    const get = async (url: string, shelf: ShelfKind) => {
      const r = await fetch(url, auth());
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      return { items: toItems(shelf, d?.data), total: Number.isFinite(d?.total) ? d.total : 0 };
    };
    const none = (shelf: ShelfKind) => Promise.resolve({ items: [] as DeptItem[], total: 0 });
    Promise.all([
      access.shelves.articles ? get(`/api/library/articles?${q}`, 'articles') : none('articles'),
      access.shelves.books ? get(`/api/library/books?${q}`, 'books') : none('books'),
      access.shelves.periodicals ? get(`/api/content/list?${q}&contentType=Periodicals&onlyUnlocked=false`, 'periodicals') : none('periodicals'),
    ]).then(([articles, books, periodicals]) => { if (live) setShelves({ articles, books, periodicals }); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [q, access.eligible, access.shelves.articles, access.shelves.books, access.shelves.periodicals, retry]);

  // Only the shelves that actually hold something here are offered.
  const present = shelves ? SHELVES.filter(s => shelves[s].total > 0) : [];
  const want = sp.get('show') as ShelfKind | null;
  const show: 'all' | ShelfKind = want && present.includes(want) ? want : 'all';
  const choose = useCallback((s: 'all' | ShelfKind) => {
    const next = new URLSearchParams(sp);
    s === 'all' ? next.delete('show') : next.set('show', s);
    setSp(next, { replace: true, preventScrollReset: true });
  }, [sp, setSp]);

  const all = useMemo(() => (shelves ? SHELVES.flatMap(s => shelves[s].items) : []), [shelves]);
  const shown = useMemo(() => latest(all, show, SHOWN), [all, show]);
  const anyToday = addedToday(shown);
  const lockedLabel = !access.cooling ? '' : access.allowance?.state === 'spent' ? 'Available after midnight' : `Available at ${clockTime(access.allowance?.nextOpensAt)}`;
  const journalBase = paths.viewer.replace(/\/viewer$/, '/journal');

  if (access.eligible !== true) return null;

  return (
    <section id="latest" aria-labelledby="latest-heading" className="scroll-mt-8 bg-surface section-spacing">
      <div className="container-public">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 id="latest-heading" className="text-2xl font-bold text-ink sm:text-3xl">Latest in {department}</h2>
            <p className="mt-1 text-sm text-muted">The newest additions to this department, from the live catalogue.</p>
          </div>
          {shelves && present.length > 0 && (
            <div role="group" aria-label="Show" className="segmented">
              {(['all', ...present] as const).map(s => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => choose(s)}>{s === 'all' ? 'All' : SHELF_LABEL[s]}</button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          {failed ? (
            <div className="card"><ErrorState description={`We could not load ${department} content right now.`} onRetry={() => setRetry(n => n + 1)} /></div>
          ) : !shelves ? (
            <div aria-busy="true" className="card space-y-3 p-5"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-4/5" /></div>
          ) : present.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={BookOpen}
                title="No published content is currently available in this department."
                action={<Link to={libraryUrl(account)} className={buttonClass('brand', 'md')}>Browse all library content</Link>}
              />
            </div>
          ) : (
            <>
              {!anyToday && (
                <p role="status" className="mb-3 text-[13px] text-muted">
                  No new content was added today in this department. Showing the latest available content instead.
                </p>
              )}
              <ol className="card divide-y divide-rule overflow-hidden">
                {shown.map((it, i) => (
                  <li key={it.key}>
                    <ResultCard
                      it={it.raw}
                      n={i + 1}
                      kind={it.shelf === 'books' ? 'books' : 'articles'}
                      mode={it.shelf === 'periodicals' ? 'archived' : 'new'}
                      journalBase={journalBase}
                      lockedLabel={lockedLabel}
                      onOpen={() => navigate(`${paths.viewer}/${it.raw.id}`)}
                    />
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
                {present.map(s => {
                  const Icon = ICON[s];
                  const to = s === 'periodicals'
                    ? libraryUrl(account, { domain: department, mode: 'archived', atype: 'Periodicals' })
                    : libraryUrl(account, { domain: department, kind: s === 'books' ? 'books' : 'articles' });
                  return (
                    <Link key={s} to={to} className="inline-flex items-center gap-1.5 text-accent hover:underline">
                      <Icon size={14} aria-hidden="true" /> View all {SHELF_LABEL[s]} <span className="tnum font-normal text-muted">({shelves[s].total.toLocaleString('en-IN')})</span> <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
