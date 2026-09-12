import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardTitle, affiliation } from '../../lib/identity';
import { useAllowance, countdown } from '../membership/ReadingClock';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, BookOpen, Loader2, Search, UserPlus, Users,
} from 'lucide-react';

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

const LABEL = 'font-mono text-[10.5px] uppercase tracking-wider text-faint';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const n = (x: number) => Number(x || 0).toLocaleString();

type Overview = {
  institution: { id: string; name: string };
  students: { total: number; neverSignedIn: number; activeLast30: number };
  subscription: { departments: string[]; fullAccess: boolean; onFreeAllowance?: boolean; endsOn: string | null; daysLeft: number | null };
  collection: {
    journals: number; articles: number; books: number;
    byDepartment: { name: string; journals: number; articles: number }[];
  };
  newJournals: { id: string; title: string; issn: string | null; domain: string | null; articleCount: number }[];
  hasActiveSubscription: boolean;
  sparkline: number[];
  unansweredSearches: number;
  recent: { at: string; itemId: string; itemType: string; domain: string | null; title: string; student: string | null }[];
};


/**
 * A figure worth looking at, on its own card.
 *
 * Four numbers with no relationship to each other are four headlines, not a
 * chart — there is nothing to compare and nothing to plot. The skill's own
 * answer to "is it even a chart" is no, and these are stat tiles.
 */
function Stat({ label, value, note, accent = false }: {
  label: string; value: number; note?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accent
      ? 'border-accent bg-accent text-white'
      : 'border-rule bg-surface'}`}>
      <p className={`font-mono text-[10.5px] uppercase tracking-wider ${accent ? 'text-white/70' : 'text-faint'}`}>
        {label}
      </p>
      <p className={`tnum mt-2 font-mono text-[30px] leading-none ${accent ? 'text-white' : 'text-ink'}`}>
        {n(value)}
      </p>
      {note && (
        <p className={`mt-2 text-[11.5px] ${accent ? 'text-white/80' : 'text-muted'}`}>{note}</p>
      )}
    </div>
  );
}

/**
 * Twelve weeks of reading, one bar a week.
 *
 * One series, so no legend — the heading names it — and one colour. The most
 * recent week is picked out because it is a particular week, not because it is
 * the tallest; colour that followed rank would move every time the data did.
 * Only the peak is labelled: a number over every bar is a table with extra
 * steps.
 */
function Weeks({ data }: { data: number[] }) {
  const [over, setOver] = useState<number | null>(null);
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const peak = data.indexOf(max);

  return (
    <div>
      <div className="flex h-[120px] items-end gap-[3px]">
        {data.map((v, i) => {
          const last = i === data.length - 1;
          return (
            <div
              key={i}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setOver(i)}
              onMouseLeave={() => setOver(null)}
            >
              {/* A hit target taller than the bar, so a short week is still
                  easy to point at. */}
              <div className="absolute inset-0" />
              <div
                className={`w-full rounded-t-[4px] transition-colors ${
                  last ? 'bg-accent' : over === i ? 'bg-accent/70' : 'bg-accent-soft'}`}
                style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
              />
              {over === i && (
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-rule bg-surface px-2 py-1 text-[11px] text-ink shadow-lg">
                  <b className="tnum font-mono">{n(v)}</b> {v === 1 ? 'read' : 'reads'}
                  <span className="text-faint"> · {i === data.length - 1 ? 'this week' : `${data.length - 1 - i} weeks ago`}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-baseline justify-between font-mono text-[10.5px] text-faint">
        <span>12 weeks ago</span>
        <span>{max > 0 ? `peak ${n(max)} in week ${peak + 1}` : 'nothing read yet'}</span>
        <span>this week</span>
      </div>
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
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="fill-none stroke-rule" strokeWidth={11} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="fill-none stroke-accent" strokeWidth={11} strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-mono text-[24px] leading-none text-ink">{pct}%</span>
        <span className="mt-1 text-[10.5px] text-faint">of {n(total)}</span>
      </div>
    </div>
  );
}



/** Something the librarian can act on, with the action attached to it. */
function Todo({ tone, text, cta, to }: {
  tone: 'caution' | 'accent'; text: React.ReactNode; cta: string; to: string;
}) {
  const c = tone === 'caution'
    ? 'border-caution bg-caution-soft'
    : 'border-rule bg-surface';
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${c}`}>
      <p className="text-[14px] leading-snug text-ink-2">{text}</p>
      <Link to={to}
        className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
        {cta} <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function Door({ to, icon: Icon, label, note }: {
  to: string; icon: any; label: string; note: string;
}) {
  return (
    <Link to={to}
      className="group flex items-start gap-3 rounded-md border border-rule bg-surface p-4 transition-colors hover:border-accent">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block font-serif text-[15px] font-medium text-ink group-hover:text-accent">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{note}</span>
      </span>
    </Link>
  );
}

export function LibrarianHome() {
  const { profile } = useAuth();
  const { allowance, msLeft, msUntil } = useAllowance();
  const [d, setD] = useState<Overview | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/institution/overview', { headers: auth() })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) { setError(j.error || 'Could not load your dashboard'); setState('error'); return; }
        setD(j); setState('ok');
      })
      .catch(() => { setError('Could not reach the server'); setState('error'); });
  }, []);

  if (state === 'loading') {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-faint" size={26} /></div>;
  }
  if (state === 'error' || !d) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }

  const { students: st, subscription: sub, collection: col } = d;
  const depts = sub.fullAccess ? col.byDepartment.map(x => x.name) : sub.departments;

  // Only what is actually true today. An empty list is a good day, and the page
  // should say so rather than inventing a task.
  const todos: React.ReactNode[] = [];
  if (st.neverSignedIn > 0) {
    todos.push(
      <Todo key="never" tone="caution"
        text={<><b className="text-ink">{n(st.neverSignedIn)} of {n(st.total)} students</b> have never opened the library.</>}
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
          ? <><b className="text-ink">Your access has expired.</b></>
          : <>Your access ends in <b className="text-ink">{sub.daysLeft} days</b>.</>}
        cta="Subscriptions" to="/institution/subscriptions" />
    );
  }
  if (st.total === 0) {
    todos.push(
      <Todo key="nostu" tone="accent"
        text={<>No students are enrolled yet. Add them and they can start reading straight away.</>}
        cta="Add students" to="/institution/students" />
    );
  }

  return (
    <div className="min-h-full bg-ground">
      {/* What this college has, in one sentence */}
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-8">
          {/* Named for whoever is looking at it, over the place it is about. */}
          <p className={LABEL}>{dashboardTitle(profile as any)}</p>
          <h1 className="mt-1 font-serif text-[27px] font-medium tracking-tight text-ink sm:text-[33px]">
            {d.institution.name}
          </h1>
          {affiliation(profile as any) && (
            <p className="mt-1 text-[13px] text-muted">
              {profile?.displayName}{profile?.displayName ? ' · ' : ''}{affiliation(profile as any)}
            </p>
          )}
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
            {sub.onFreeAllowance
              ? <>The whole library — <b className="text-ink">{n(col.journals)} journals</b> and <b className="text-ink">{n(col.articles)} articles</b> — open to you and your students, half an hour at a time.</>
              : sub.fullAccess
              ? <>Full access to <b className="text-ink">{n(col.journals)} journals</b> and <b className="text-ink">{n(col.articles)} articles</b>.</>
              : depts.length
                ? <>
                    <b className="text-ink">{n(col.journals)} journals</b> and <b className="text-ink">{n(col.articles)} articles</b>
                    {' '}across {depts.length} {depts.length === 1 ? 'department' : 'departments'}, for {n(st.total)} {st.total === 1 ? 'student' : 'students'}.
                  </>
                : <>No departments are covered by an active subscription yet.</>}
          </p>

        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-7 px-5 py-7">

        {/* 01 — anything wanting attention */}
        <section>
          <p className={LABEL}>Wants your attention</p>
          <div className="mt-2.5 space-y-2.5">
            {todos.length ? todos : (
              <div className="rounded-md border border-rule bg-surface px-4 py-3.5">
                <p className="text-[14px] text-ink-2">
                  Nothing needs doing. Everyone enrolled has opened the library and your access is
                  running normally.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 02 — what the college actually bought */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className={LABEL}>What you hold</p>
            <Link to="/institution/explore"
              className="font-mono text-[11px] uppercase tracking-wider text-muted underline-offset-4 hover:text-accent hover:underline">
              Browse everything
            </Link>
          </div>

          {/* The numbers are true whether or not anything has been bought.
              This used to hide them behind "nothing is being held for your
              students yet" — which stopped being true the day a membership
              without a plan came to mean the whole library. */}
          {sub.onFreeAllowance && (
            <div className="mt-2.5 rounded-md border border-accent bg-accent-soft px-4 py-3.5">
              <p className="text-[14px] leading-snug text-ink-2">
                All of it is open to you now, in half-hour sessions — four a day.
                Pro removes the sessions, for you and for your students.
              </p>
              <Link to="/dashboard/pro"
                className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
                Apply for Pro <ArrowRight size={12} />
              </Link>
            </div>
          )}
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Journals" value={col.journals} accent
              note={d.newJournals.length ? `${d.newJournals.length} added lately` : undefined} />
            <Stat label="Articles" value={col.articles} />
            <Stat label="Books" value={col.books} />
            <Stat label="Departments" value={depts.length} />
          </div>

          {/* Reading, who is doing it, and how long is left — the three things a
              librarian on the free allowance actually wants on one screen. */}
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr]">
            <div className="rounded-2xl border border-rule bg-surface p-5">
              <p className={LABEL}>Reading, by week</p>
              <div className="mt-4">
                {d.sparkline?.some(x => x > 0)
                  ? <Weeks data={d.sparkline} />
                  : <p className="py-10 text-center text-[13px] text-faint">
                      Nothing has been read yet. It will show here as soon as it is.
                    </p>}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl border border-rule bg-surface p-5">
              <p className={`${LABEL} self-start`}>Who is reading</p>
              <div className="my-3"><Ring used={st.activeLast30} total={st.total} /></div>
              <p className="text-center text-[12px] leading-snug text-muted">
                {st.total === 0
                  ? 'No students enrolled yet'
                  : <>{n(st.activeLast30)} of {n(st.total)} read something in the last month</>}
              </p>
            </div>

            {/* The clock, given the weight the thing deserves. */}
            <div className="flex flex-col justify-between rounded-2xl border border-accent bg-accent p-5 text-white">
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-white/70">
                {allowance?.timed ? 'Your reading session' : 'Your access'}
              </p>
              {allowance?.timed ? (
                <>
                  <p className="tnum my-3 font-mono text-[34px] leading-none">
                    {allowance.state === 'running' ? countdown(msLeft ?? 0)
                      : allowance.state === 'waiting' || allowance.state === 'spent' ? countdown(msUntil ?? 0)
                      : '30:00'}
                  </p>
                  <p className="text-[12px] leading-snug text-white/80">
                    {allowance.state === 'running' ? <>left in this session · {allowance.sessionsLeft} more today</>
                      : allowance.state === 'waiting' ? <>until the next session opens</>
                      : allowance.state === 'spent' ? <>until tomorrow — today’s two hours are used</>
                      : <>ready when you are · four sessions a day</>}
                  </p>
                  <Link to="/dashboard/pro"
                    className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-white underline-offset-4 hover:underline">
                    Read without a limit <ArrowRight size={12} />
                  </Link>
                </>
              ) : (
                <>
                  <p className="tnum my-3 font-mono text-[34px] leading-none">∞</p>
                  <p className="text-[12px] leading-snug text-white/80">
                    No session limit on this account.
                  </p>
                </>
              )}
            </div>
          </div>

          {col.byDepartment.length > 0 && (
            <ul className="mt-2.5 divide-y divide-rule overflow-hidden rounded-md border border-rule bg-surface">
              {col.byDepartment.slice(0, 8).map(x => (
                <li key={x.name}>
                  <Link to={`/institution/department/${slug(x.name)}`}
                    className="flex items-baseline justify-between gap-4 px-5 py-2.5 hover:bg-surface-2">
                    <span className="truncate text-[13.5px] text-ink-2">{x.name}</span>
                    <span className="tnum shrink-0 font-mono text-[12px] text-muted">
                      {n(x.journals)} journals · {n(x.articles)} articles
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 03 — the things done most often */}
        <section>
          <p className={LABEL}>Go to</p>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Door to="/institution/students" icon={UserPlus} label="Students"
              note={`${n(st.total)} enrolled · ${n(st.activeLast30)} read something this month`} />
            <Door to="/institution/explore" icon={BookOpen} label="The library"
              note="Search everything your subscription covers" />
            <Door to="/institution/analytics" icon={BarChart3} label="Usage"
              note="Who is reading, and what they could not find" />
            <Door to="/institution/subscriptions" icon={Users} label="Access"
              note={sub.daysLeft !== null ? `Runs for another ${Math.max(sub.daysLeft, 0)} days` : 'Departments and dates'} />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 04 — the shelf moving */}
          <section className="overflow-hidden rounded-md border border-rule bg-surface">
            <div className="border-b border-rule px-5 py-3">
              <p className={LABEL}>Newest on your shelves</p>
            </div>
            {d.newJournals.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">Nothing added recently.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {d.newJournals.map(j => (
                  <li key={j.id} className="px-5 py-3">
                    <Link to={`/institution/journal/${encodeURIComponent(j.issn || j.id)}`}
                      className="block font-serif text-[15px] leading-snug text-ink hover:text-accent">
                      {j.title}
                    </Link>
                    <p className="tnum mt-0.5 font-mono text-[11.5px] text-muted">
                      {j.domain}{j.domain && ' · '}{n(j.articleCount)} articles
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 05 — read most recently */}
          <section className="overflow-hidden rounded-md border border-rule bg-surface">
            <div className="border-b border-rule px-5 py-3">
              <p className={LABEL}>Last opened</p>
            </div>
            {d.recent.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Search size={20} className="mx-auto mb-2 text-faint" />
                <p className="text-[13px] text-muted">Nobody has opened anything yet.</p>
                <Link to="/institution/students"
                  className="mt-3 inline-block font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
                  Add students
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-rule">
                {d.recent.map((r, i) => (
                  <li key={i} className="px-5 py-3">
                    {r.itemType === 'article'
                      ? <Link to={`/institution/article/${r.itemId}`}
                          className="block font-serif text-[14.5px] leading-snug text-ink hover:text-accent">{r.title}</Link>
                      : <span className="block font-serif text-[14.5px] leading-snug text-ink-2">{r.title}</span>}
                    <p className="tnum mt-0.5 font-mono text-[11.5px] text-muted">
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
    </div>
  );
}
