import React, { useEffect, useState } from 'react';
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
  subscription: { departments: string[]; fullAccess: boolean; endsOn: string | null; daysLeft: number | null };
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
 * Seats in use, as a part of the whole.
 *
 * This is the renewal number — how much of what the college pays for is being
 * used — and it is genuinely two parts of one total, which is the only case
 * where a ring beats a bar. Two colours, so no categorical palette to get wrong.
 */
function Seats({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.min(used / total, 1) : 0;
  const R = 30, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90 shrink-0" role="img"
        aria-label={`${used} of ${total} students reading`}>
        <circle cx="38" cy="38" r={R} fill="none" stroke="var(--rule)" strokeWidth="7" />
        <circle cx="38" cy="38" r={R} fill="none" stroke="var(--accent)" strokeWidth="7"
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <div>
        <p className="tnum font-mono text-[24px] leading-none text-ink">
          {n(used)}<span className="text-[15px] text-muted"> of {n(total)}</span>
        </p>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">
          students have read something in the last month
        </p>
      </div>
    </div>
  );
}

/** Twelve weeks of reading, at a glance. One series, so no legend and no labels. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 3) return null;
  const W = 150, H = 34, max = Math.max(...values, 1);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - (v / max) * (H - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" role="img"
      aria-label="Reads over the last twelve weeks">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--accent)" opacity="0.10" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill="var(--accent)" />
    </svg>
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
          <p className={LABEL}>Your library</p>
          <h1 className="mt-1 font-serif text-[27px] font-medium tracking-tight text-ink sm:text-[33px]">
            {d.institution.name}
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
            {sub.fullAccess
              ? <>Full access to <b className="text-ink">{n(col.journals)} journals</b> and <b className="text-ink">{n(col.articles)} articles</b>.</>
              : depts.length
                ? <>
                    <b className="text-ink">{n(col.journals)} journals</b> and <b className="text-ink">{n(col.articles)} articles</b>
                    {' '}across {depts.length} {depts.length === 1 ? 'department' : 'departments'}, for {n(st.total)} {st.total === 1 ? 'student' : 'students'}.
                  </>
                : <>No departments are covered by an active subscription yet.</>}
          </p>

          {st.total > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-6 border-t border-rule pt-6">
              <Seats used={st.activeLast30} total={st.total} />
              {d.sparkline?.length >= 3 && (
                <div className="text-right">
                  <p className={LABEL}>Last 12 weeks</p>
                  <div className="mt-1.5"><Spark values={d.sparkline} /></div>
                </div>
              )}
            </div>
          )}
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

          {!d.hasActiveSubscription ? (
            <div className="mt-2.5 rounded-md border border-caution bg-caution-soft px-4 py-3.5">
              <p className="text-[14px] leading-snug text-ink-2">
                No active subscription is on this account, so nothing is being held for your
                students yet.
              </p>
              <Link to="/contact"
                className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
                Talk to us <ArrowRight size={12} />
              </Link>
            </div>
          ) : (<>
          <dl className="mt-2.5 grid grid-cols-2 divide-rule overflow-hidden rounded-md border border-rule bg-surface sm:grid-cols-4 sm:divide-x">
            {([
              ['Journals', col.journals],
              ['Articles', col.articles],
              ...(col.books > 0 ? [['Books', col.books] as const] : []),
              ['Departments', depts.length],
            ] as const).map(([label, v]) => (
              <div key={label} className="border-b border-rule p-4 sm:border-b-0">
                <dt className={LABEL}>{label}</dt>
                <dd className="tnum mt-1.5 font-mono text-[26px] leading-none text-ink">{n(v as number)}</dd>
              </div>
            ))}
          </dl>

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
          </>)}
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
