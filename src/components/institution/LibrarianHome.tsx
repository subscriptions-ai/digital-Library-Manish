import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardTitle, affiliation } from '../../lib/identity';
import { useAllowance, countdown } from '../membership/ReadingClock';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, Search, Sparkles, UserPlus, Users } from 'lucide-react';
import { Weeks, Bars, Collection } from '../charts';
import { usePricing } from './pricing/PricingContext';
import { ErrorState, MetricCard, Skeleton, StatusBadge, buttonClass, friendlyError } from '../ui';

/**
 * A librarian's home.
 *
 * Not a wall of statistics. The page is ordered by what a librarian does with
 * it: first anything that wants doing today, then what the college actually
 * bought — the figure they forward to their principal and the one a prospective
 * college asks for before anything else — and only then what is being read.
 *
 * The previous version led with four tiles, two of which were the same number
 * wearing different labels, drawn from a table that records one row per
 * student-and-item and overwrites its own timestamp.
 */

// A section's name: small, but large enough to read, and an h2 so the page has an outline.
const SECTION = 'text-xs font-semibold uppercase tracking-wider text-muted';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const n = (x: number) => Number(x || 0).toLocaleString();
const longDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

type Overview = {
  institution: { id: string; name: string };
  students: { total: number; neverSignedIn: number; activeLast30: number };
  subscription: { departments: string[]; fullAccess: boolean; onFreeAllowance?: boolean; endsOn: string | null; daysLeft: number | null };
  collection: {
    journals: number; articles: number; books: number; total: number;
    byDepartment: { name: string; articles: number; books: number; other: number; total: number }[];
  };
  newJournals: { id: string; title: string; issn: string | null; domain: string | null; articleCount: number }[];
  hasActiveSubscription: boolean;
  sparkline: number[];
  unansweredSearches: number;
  readByDepartment: { name: string; reads: number }[];
  recent: { at: string; itemId: string; itemType: string; domain: string | null; title: string; student: string | null }[];
};


/**
 * A figure worth looking at, on its own card.
 *
 * Four numbers with no relationship to each other are four headlines, not a
 * chart — there is nothing to compare and nothing to plot. The skill's own
 * answer to "is it even a chart" is no, and these are stat tiles.
 *
 * One shape for every tile on the page — label, number, a line of context —
 * with the whole card as the link when there is somewhere to go.
 */
function Stat({ label, value, context, to, loading }: {
  label: string; value: React.ReactNode | null; context?: React.ReactNode; to?: string; loading?: boolean;
}) {
  const card = (
    <MetricCard
      label={<span className="flex items-center justify-between gap-2">{label}
        {to && <ArrowUpRight size={14} className="shrink-0 text-faint transition-colors group-hover:text-accent" aria-hidden="true" />}
      </span>}
      value={value}
      context={context}
      loading={loading}
      className={`h-full ${to ? 'card-interactive' : ''}`}
    />
  );
  if (!to) return card;
  return (
    <Link to={to} aria-label={`Open ${label}`} className="group block rounded-xl">
      {card}
    </Link>
  );
}

/** A tile whose value is a state rather than a number: the state as a badge, in the product's own words. */
function StatusTile({ label, status, context }: { label: string; status: string; context?: React.ReactNode }) {
  return (
    <div className="card card-pad h-full">
      <p className="metric-label">{label}</p>
      <div className="mt-2.5"><StatusBadge status={status} /></div>
      {context && <p className="metric-context mt-2">{context}</p>}
    </div>
  );
}

/**
 * How much of the college is actually reading — a ring, because it is genuinely
 * two parts of one whole, which is the only case where a ring beats a bar.
 */
function Ring({ used, total, size = 132 }: { used: number; total: number; size?: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img"
      aria-label={`${pct}% of ${n(total)} users read something in the last month`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="fill-none stroke-rule" strokeWidth={11} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="fill-none stroke-accent" strokeWidth={11} strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="tnum text-2xl font-bold leading-none text-ink">{pct}%</span>
        <span className="mt-1 text-xs text-muted">of {n(total)}</span>
      </div>
    </div>
  );
}



/** Something the librarian can act on, with the action attached to it. */
function Todo({ tone, text, cta, to }: {
  tone: 'caution' | 'accent'; text: React.ReactNode; cta: string; to: string;
}) {
  // A line of prose with a link at the end read as a notice to be dismissed.
  // The same thing with a mark beside it and the action as a button reads as a
  // job, which is what it is.
  const caution = tone === 'caution';
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 sm:gap-4 ${
      caution ? 'border-caution/40 bg-caution-soft' : 'border-rule bg-surface'}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        caution ? 'bg-caution/15 text-caution' : 'bg-accent-soft text-accent'}`} aria-hidden="true">
        {caution ? <AlertCircle size={18} /> : <Sparkles size={18} />}
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug text-ink-2">{text}</p>
      <Link to={to} className={buttonClass(caution ? 'outline' : 'primary', 'sm', 'shrink-0')}>
        {cta} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

function Door({ to, icon: Icon, label, note }: {
  to: string; icon: any; label: string; note: string;
}) {
  return (
    <Link to={to}
      className="card card-interactive group flex items-start gap-3 p-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink group-hover:text-accent">{label}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{note}</span>
      </span>
    </Link>
  );
}

/** The page's shape while the overview is on its way, so nothing jumps when it lands. */
function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" role="status" aria-label="Loading your dashboard">
      <div className="card card-pad space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <MetricCard key={i} label={<span className="skeleton inline-block h-3 w-24 align-middle" />} value={null} loading />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card card-pad"><Skeleton className="h-40" /></div>
        <div className="card card-pad"><Skeleton className="h-40" /></div>
      </div>
    </div>
  );
}

export function LibrarianHome() {
  const { profile } = useAuth();
  const { allowance, msLeft, msUntil } = useAllowance();
  const pricing = usePricing();
  const plan = pricing?.plan ?? null;
  const [d, setD] = useState<Overview | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState('loading');
    fetch('/api/institution/overview', { headers: auth() })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) { setError(friendlyError(j, 'Could not load your dashboard')); setState('error'); return; }
        setD(j); setState('ok');
      })
      .catch((e) => { setError(friendlyError(e, 'Could not reach the server')); setState('error'); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state === 'loading') return <HomeSkeleton />;
  if (state === 'error' || !d) {
    return (
      <div className="card mx-auto max-w-lg">
        <ErrorState title="Dashboard unavailable" description={error} onRetry={load} />
      </div>
    );
  }

  const { students: st, subscription: sub, collection: col } = d;
  const depts = sub.fullAccess ? col.byDepartment.map(x => x.name) : sub.departments;

  // The subscription in the product's own words. Display only: every condition
  // here is read straight off the overview, nothing is decided by it.
  const expired = sub.daysLeft !== null && sub.daysLeft <= 0;
  const subStatus = sub.onFreeAllowance ? 'free-preview'
    : expired ? 'subscription-expired'
    : d.hasActiveSubscription || sub.fullAccess ? 'subscription-active'
    : null;
  const subContext = sub.onFreeAllowance ? 'Half-hour sessions, four a day'
    : expired ? (sub.endsOn ? `Ended ${longDate(sub.endsOn)}` : undefined)
    : sub.daysLeft !== null ? `${sub.endsOn ? `Ends ${longDate(sub.endsOn)} · ` : ''}${n(sub.daysLeft)} ${sub.daysLeft === 1 ? 'day' : 'days'} left`
    : undefined;

  // Only what is actually true today. An empty list is a good day, and the page
  // should say so rather than inventing a task.
  const todos: React.ReactNode[] = [];
  if (st.neverSignedIn > 0) {
    todos.push(
      <Todo key="never" tone="caution"
        text={<><b className="text-ink">{n(st.neverSignedIn)} of {n(st.total)} users</b> have never opened the library.</>}
        cta="See who" to="/institution/analytics" />
    );
  }
  if (d.unansweredSearches > 0) {
    todos.push(
      <Todo key="search" tone="caution"
        text={<><b className="text-ink">{n(d.unansweredSearches)} searches</b> came back with nothing in the last 30 days. Those are the subjects to ask us for.</>}
        cta="See them" to="/institution/analytics" />
    );
  }
  if (sub.daysLeft !== null && sub.daysLeft <= 45) {
    todos.push(
      <Todo key="exp" tone="caution"
        text={sub.daysLeft <= 0
          ? <><b className="text-ink">Subscription Expired.</b> Your access has ended.</>
          : <>Your access ends in <b className="text-ink">{sub.daysLeft} days</b>.</>}
        cta="Subscriptions" to="/institution/subscriptions" />
    );
  }
  if (st.total === 0) {
    todos.push(
      <Todo key="nostu" tone="accent"
        text={<>No users have been added yet. Add your faculty and researchers and they can start reading straight away.</>}
        cta="Add users" to="/institution/students" />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* What this college has, in one sentence. A div, not a <header>: the
          shell sizes any h1 inside a header as its own top-bar title. */}
      <div className="card card-pad">
        {/* Named for whoever is looking at it, over the place it is about. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{dashboardTitle(profile as any)}</p>
            <h1 className="type-page-title mt-1 break-words text-ink">{d.institution.name}</h1>
          </div>
          {/* The two things a librarian comes here to do. */}
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/institution/students" className={buttonClass('primary')}>
              <UserPlus size={16} aria-hidden="true" /> Add users
            </Link>
            <Link to="/institution/explore" className={buttonClass('outline')}>
              <BookOpen size={16} aria-hidden="true" /> Browse the library
            </Link>
          </div>
        </div>
        {affiliation(profile as any) && (
          <p className="mt-1 text-[13px] text-muted">
            {profile?.displayName}{profile?.displayName ? ' · ' : ''}{affiliation(profile as any)}
          </p>
        )}
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
          {/* The whole of it, counted once — articles, books and everything on
              the archived shelf — rather than two of its parts. */}
          {sub.onFreeAllowance
            ? <>The whole library — <b className="text-ink">{n(col.total)} items</b> — open to you and everyone you add, half an hour at a time.</>
            : sub.fullAccess
            ? <>Full access to <b className="text-ink">{n(col.total)} items</b>.</>
            : depts.length
              ? <>
                  <b className="text-ink">{n(col.total)} items</b>
                  {' '}across {depts.length} {depts.length === 1 ? 'department' : 'departments'}, for {n(st.total)} {st.total === 1 ? 'user' : 'users'}.
                </>
              : <>No departments are covered by an active subscription yet.</>}
        </p>
      </div>

      {/* 01 — anything wanting attention */}
      <section aria-labelledby="lh-attention">
        <h2 id="lh-attention" className={SECTION}>Wants your attention</h2>
        <div className="mt-3 space-y-3">
          {todos.length ? todos : (
            <div className="flex items-center gap-4 rounded-xl border border-rule bg-surface p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden="true">
                <Check size={18} />
              </span>
              <p className="text-sm text-ink-2">
                Nothing needs doing. Everyone enrolled has opened the library.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 02 — the subscription and the people on it. Users here is the plan's
          user count against its cap; who holds a licensed seat is managed on
          User Management, and is a different number. */}
      <section aria-labelledby="lh-subscription">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="lh-subscription" className={SECTION}>Subscription and users</h2>
          <Link to="/institution/subscriptions" className="text-[13px] font-semibold text-accent hover:underline">
            Manage subscription
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {subStatus
            ? <StatusTile label="Subscription Status" status={subStatus} context={subContext} />
            : <Stat label="Subscription Status" value="None" context="No department is subscribed yet" to="/institution/subscriptions" />}
          <Stat label="Departments" value={n(depts.length)}
            context={sub.fullAccess ? 'Full access' : depts.length ? 'Covered by your subscription' : undefined}
            to="/institution/access" />
          <Stat label="Total Members" value={n(st.total)}
            context={st.total ? `${n(st.activeLast30)} read this month · ${n(st.neverSignedIn)} never signed in` : 'No users added yet'}
            to="/institution/students" />
          {/* Only once the plan has answered; a missing figure shows a dash, not a zero. */}
          <Stat label="Users on your plan" loading={!!pricing?.loading}
            value={!plan ? null
              : plan.unlimitedSeats || plan.seats.capacity == null ? n(plan.seats.used)
              : !plan.hasSubscription || !plan.seats.capacity ? null
              : `${n(plan.seats.used)} / ${n(plan.seats.capacity)}`}
            context={!plan ? undefined
              : plan.unlimitedSeats || plan.seats.capacity == null ? 'No cap on users on the current plan'
              : !plan.hasSubscription || !plan.seats.capacity ? 'Subscribe to a department to add users'
              : `${n(plan.seats.available ?? 0)} places left · includes your librarian account`}
            to="/institution/students" />
        </div>
      </section>

      {/* 03 — what the college actually bought */}
      <section aria-labelledby="lh-hold">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="lh-hold" className={SECTION}>What you hold</h2>
          <Link to="/institution/explore" className="text-[13px] font-semibold text-accent hover:underline">
            Browse everything
          </Link>
        </div>

        {/* The numbers are true whether or not anything has been bought.
            This used to hide them behind "nothing is being held for your
            students yet" — which stopped being true the day a membership
            without a plan came to mean the whole library. */}
        {sub.onFreeAllowance && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft p-4 sm:gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-on" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <p className="min-w-0 flex-1 text-sm leading-snug text-ink-2">
              All of it is open to you now, in <b className="text-ink">half-hour sessions — four a day</b>.
              Pro removes the sessions, for you and for everyone you add.
            </p>
            <Link to="/institution/membership" className={buttonClass('primary', 'sm', 'shrink-0')}>
              Explore Subscription Options <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Items" value={n(col.total)} to="/institution/explore"
            context={d.newJournals.length ? `${d.newJournals.length} added lately` : undefined} />
          <Stat label="Articles" value={n(col.articles)} to="/institution/explore" />
          <Stat label="Books" value={n(col.books)} to="/institution/explore?kind=books" />
        </div>

        {/* Reading, who is doing it, and how long is left — the three things a
            librarian on the free allowance actually wants on one screen. */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div className="card card-pad">
            <h3 className="metric-label">Reading, by week</h3>
            <div className="mt-4">
              {d.sparkline?.some(x => x > 0)
                ? <Weeks data={d.sparkline} />
                : <p className="py-10 text-center text-[13px] text-muted">
                    Nothing has been read yet. It will show here as soon as it is.
                  </p>}
            </div>
          </div>

          <div className="card card-pad flex flex-col items-center justify-center">
            <h3 className="metric-label self-start">Who is reading</h3>
            <div className="my-3"><Ring used={st.activeLast30} total={st.total} /></div>
            <p className="text-center text-xs leading-snug text-muted">
              {st.total === 0
                ? 'No users added yet'
                : <>{n(st.activeLast30)} of {n(st.total)} read something in the last month</>}
            </p>
          </div>

          {/* The clock, given the weight the thing deserves. */}
          <div className="flex flex-col justify-between rounded-xl border border-accent bg-accent p-5 text-accent-on sm:p-6">
            <h3 className="text-[13px] font-medium opacity-80">
              {allowance?.timed ? 'Your reading session' : 'Your access'}
            </h3>
            {allowance?.timed ? (
              <>
                <p className="tnum my-3 text-[32px] font-bold leading-none">
                  {allowance.state === 'running' ? countdown(msLeft ?? 0)
                    : allowance.state === 'waiting' || allowance.state === 'spent' ? countdown(msUntil ?? 0)
                    : '30:00'}
                </p>
                <p className="text-xs leading-snug opacity-85">
                  {allowance.state === 'running' ? <>left in this session · {allowance.sessionsLeft} more today</>
                    : allowance.state === 'waiting' ? <>until the next session opens</>
                    : allowance.state === 'spent' ? <>until tomorrow — today’s two hours are used</>
                    : <>ready when you are · four sessions a day</>}
                </p>
                <Link to="/institution/membership"
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold underline-offset-4 hover:underline">
                  Read without a limit <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </>
            ) : (
              <>
                <p className="tnum my-3 text-[32px] font-bold leading-none" aria-hidden="true">∞</p>
                <p className="text-xs leading-snug opacity-85">
                  No session limit on this account.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Two questions a librarian is actually asked: what are they reading,
            and where is the collection deep. Same measure on each chart, one
            colour, and the labels read across rather than on their side. */}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="card card-pad">
            <h3 className="metric-label">What your users read</h3>
            <p className="mt-0.5 text-xs text-muted">by subject, last 30 days</p>
            <div className="mt-4">
              {d.readByDepartment?.length
                ? <Bars rows={d.readByDepartment.map(x => ({ name: x.name, value: x.reads }))} unit="reads" />
                : <p className="py-8 text-center text-[13px] text-muted">
                    Nothing has been opened yet this month.
                  </p>}
            </div>
          </div>

          <div className="card card-pad">
            <h3 className="metric-label">Where the collection is deep</h3>
            <p className="mt-0.5 text-xs text-muted">everything held, by department</p>
            <div className="mt-4">
              {col.byDepartment.length
                ? <Collection rows={col.byDepartment} />
                : <p className="py-8 text-center text-[13px] text-muted">Nothing on the shelves yet.</p>}
            </div>
          </div>
        </div>

      </section>

      {/* 04 — the things done most often */}
      <section aria-labelledby="lh-goto">
        <h2 id="lh-goto" className={SECTION}>Go to</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Door to="/institution/students" icon={UserPlus} label="Manage users"
            note={`${n(st.total)} enrolled · ${n(st.activeLast30)} read something this month`} />
          <Door to="/institution/explore" icon={BookOpen} label="The library"
            note="Search everything your subscription covers" />
          <Door to="/institution/analytics" icon={BarChart3} label="Usage"
            note="Who is reading, and what they could not find" />
          <Door to="/institution/subscriptions" icon={Users} label="Subscription"
            note={sub.daysLeft !== null ? `Runs for another ${Math.max(sub.daysLeft, 0)} days` : 'Departments and dates'} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 05 — the shelf moving */}
        <section aria-labelledby="lh-newest" className="card overflow-hidden">
          <div className="border-b border-rule px-5 py-3">
            <h2 id="lh-newest" className={SECTION}>Newest on your shelves</h2>
          </div>
          {d.newJournals.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Nothing added recently.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {d.newJournals.map(j => (
                <li key={j.id} className="px-5 py-3">
                  <Link to={`/institution/journal/${encodeURIComponent(j.issn || j.id)}`}
                    className="block text-[15px] font-medium leading-snug text-ink hover:text-accent">
                    {j.title}
                  </Link>
                  <p className="tnum mt-0.5 text-xs text-muted">
                    {/* A journal found last night has no articles yet; saying
                        "0 articles" about it reads like a fault rather than
                        like something still arriving. */}
                    {j.domain}{j.articleCount > 0 && <> · {n(j.articleCount)} articles</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 06 — read most recently */}
        <section aria-labelledby="lh-recent" className="card overflow-hidden">
          <div className="border-b border-rule px-5 py-3">
            <h2 id="lh-recent" className={SECTION}>Last opened</h2>
          </div>
          {d.recent.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Search size={20} className="mx-auto mb-2 text-faint" aria-hidden="true" />
              <p className="text-[13px] text-muted">Nobody has opened anything yet.</p>
              <Link to="/institution/students"
                className="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline">
                Add users
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {d.recent.map((r, i) => (
                <li key={i} className="px-5 py-3">
                  {r.itemType === 'article'
                    ? <Link to={`/institution/article/${r.itemId}`}
                        className="block text-sm font-medium leading-snug text-ink hover:text-accent">{r.title}</Link>
                    : <span className="block text-sm font-medium leading-snug text-ink-2">{r.title}</span>}
                  <p className="tnum mt-0.5 text-xs text-muted">
                    {r.student || 'A student'}
                    {' · '}
                    {new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
