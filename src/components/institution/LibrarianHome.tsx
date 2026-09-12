import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardTitle, affiliation } from '../../lib/identity';
import { useAllowance, countdown } from '../membership/ReadingClock';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, Loader2, Search, Sparkles, TrendingUp, UserPlus, Users } from 'lucide-react';

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
    journals: number; articles: number; books: number; total: number;
    byDepartment: { name: string; journals: number; articles: number }[];
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
 */
function Stat({ label, value, note, accent = false, to }: {
  label: string; value: number; note?: string; accent?: boolean; to?: string;
}) {
  return (
    <div className={`group rounded-2xl border p-5 ${accent
      ? 'border-accent bg-accent text-white'
      : 'border-rule bg-surface'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`font-mono text-[10.5px] uppercase tracking-wider ${accent ? 'text-white/70' : 'text-faint'}`}>
          {label}
        </p>
        {to && (
          <Link
            to={to}
            aria-label={`Open ${label}`}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
              accent ? 'bg-white/15 text-white hover:bg-white/25'
                     : 'bg-surface-2 text-muted hover:bg-accent-soft hover:text-accent'}`}
          >
            <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      <p className={`tnum mt-3 font-mono text-[30px] leading-none ${accent ? 'text-white' : 'text-ink'}`}>
        {n(value)}
      </p>
      {note && (
        <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${
          accent ? 'bg-white/15 text-white' : 'bg-accent-soft text-accent'}`}>
          <TrendingUp size={12} /> {note}
        </span>
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

  // Always twelve slots, padded at the front. A single week of data was
  // becoming a single bar the width of the frame — a solid slab that looked
  // like a rendering fault rather than like one quiet week.
  const weeks = [...Array(Math.max(0, 12 - data.length)).fill(0), ...data].slice(-12);
  const max = Math.max(...weeks, 1);
  const peak = weeks.indexOf(max);

  return (
    <div>
      <div className="flex h-[120px] items-end gap-[3px]">
        {weeks.map((v, i) => {
          const last = i === weeks.length - 1;
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
                  <span className="text-faint"> · {i === weeks.length - 1 ? 'this week' : `${weeks.length - 1 - i} weeks ago`}</span>
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
 * Magnitude across things with names — subjects, departments.
 *
 * Horizontal, because the labels are words and words read across; vertical bars
 * would have them turned on their side or cut short. One measure, one colour,
 * and the value sits at the end of its own bar rather than on an axis nobody
 * reads.
 */
function Bars({ rows, unit }: { rows: { name: string; value: number }[]; unit: string }) {
  const [over, setOver] = useState<string | null>(null);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map(r => (
        <li
          key={r.name}
          onMouseEnter={() => setOver(r.name)}
          onMouseLeave={() => setOver(null)}
          className="cursor-default"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] text-ink-2">{r.name}</span>
            <span className="tnum shrink-0 font-mono text-[12px] text-muted">
              {n(r.value)} <span className="text-faint">{unit}</span>
            </span>
          </div>
          <div className="mt-1.5 h-[7px] w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full transition-colors ${over === r.name ? 'bg-accent' : 'bg-accent/55'}`}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
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
  // A line of prose with a link at the end read as a notice to be dismissed.
  // The same thing with a mark beside it and the action as a button reads as a
  // job, which is what it is.
  const caution = tone === 'caution';
  return (
    <div className={`flex flex-wrap items-center gap-4 rounded-2xl border p-4 ${
      caution ? 'border-caution/40 bg-caution-soft' : 'border-rule bg-surface'}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        caution ? 'bg-caution/15 text-caution' : 'bg-accent-soft text-accent'}`}>
        {caution ? <AlertCircle size={17} /> : <Sparkles size={17} />}
      </span>
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink-2">{text}</p>
      <Link to={to}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-colors ${
          caution ? 'bg-caution text-white hover:opacity-90' : 'bg-accent text-white hover:bg-accent-hover'}`}>
        {cta} <ArrowRight size={13} />
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={LABEL}>{dashboardTitle(profile as any)}</p>
              <h1 className="mt-1 font-serif text-[27px] font-medium tracking-tight text-ink sm:text-[33px]">
                {d.institution.name}
              </h1>
            </div>
            {/* The two things a librarian comes here to do. */}
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link to="/institution/students"
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover">
                <UserPlus size={15} /> Add students
              </Link>
              <Link to="/institution/explore"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2">
                <BookOpen size={15} /> Browse the library
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
              ? <>The whole library — <b className="text-ink">{n(col.total)} items</b> across <b className="text-ink">{n(col.journals)} journals</b> — open to you and your students, half an hour at a time.</>
              : sub.fullAccess
              ? <>Full access to <b className="text-ink">{n(col.total)} items</b> across <b className="text-ink">{n(col.journals)} journals</b>.</>
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
              <div className="flex items-center gap-4 rounded-2xl border border-rule bg-surface p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Check size={17} />
                </span>
                <p className="text-[14px] text-ink-2">
                  Nothing needs doing. Everyone enrolled has opened the library.
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
            <div className="mt-2.5 flex flex-wrap items-center gap-4 rounded-2xl border border-accent/40 bg-accent-soft p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                <Sparkles size={17} />
              </span>
              <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink-2">
                All of it is open to you now, in <b className="text-ink">half-hour sessions — four a day</b>.
                Pro removes the sessions, for you and for your students.
              </p>
              <Link to="/dashboard/pro"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover">
                Apply for Pro <ArrowRight size={13} />
              </Link>
            </div>
          )}
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Journals" value={col.journals} accent to="/institution/explore"
              note={d.newJournals.length ? `${d.newJournals.length} added lately` : undefined} />
            <Stat label="Articles" value={col.articles} to="/institution/explore" />
            <Stat label="Books" value={col.books} to="/institution/explore?kind=books" />
            <Stat label="Departments" value={depts.length} to="/institution/access" />
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

          {/* Two questions a librarian is actually asked: what are they reading,
              and where is the collection deep. Same measure on each chart, one
              colour, and the labels read across rather than on their side. */}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-rule bg-surface p-5">
              <p className={LABEL}>What your students read</p>
              <p className="mt-1 text-[12px] text-faint">by subject, last 30 days</p>
              <div className="mt-4">
                {d.readByDepartment?.length
                  ? <Bars rows={d.readByDepartment.map(x => ({ name: x.name, value: x.reads }))} unit="reads" />
                  : <p className="py-8 text-center text-[13px] text-faint">
                      Nothing has been opened yet this month.
                    </p>}
              </div>
            </div>

            <div className="rounded-2xl border border-rule bg-surface p-5">
              <p className={LABEL}>Where the collection is deep</p>
              <p className="mt-1 text-[12px] text-faint">articles held, by department</p>
              <div className="mt-4">
                {col.byDepartment.length
                  ? <Bars rows={col.byDepartment.slice(0, 8).map(x => ({ name: x.name, value: x.articles }))} unit="articles" />
                  : <p className="py-8 text-center text-[13px] text-faint">Nothing on the shelves yet.</p>}
              </div>
            </div>
          </div>

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
