import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, BookMarked, Building2, ChevronRight, GraduationCap, Layers,
  RefreshCw, Search, ShieldCheck, Users,
} from 'lucide-react';
import { Bars, Collection, type DeptRow } from './charts';

/**
 * A second draft of the home page, at /home-preview, for side-by-side review.
 *
 * The brief was a page that reads like serious software: informative, and
 * technically credible. The rule that follows from that is that nothing on it
 * is asserted — every figure is read from the catalogue as the page loads, and
 * every capability described is one the product actually has. A number nobody
 * can stand behind undoes the rest of the page.
 *
 * It uses the design language of the dashboards rather than the marketing
 * site's, so the public face and the product read as one piece of software.
 */

type Stats = {
  total: number; articles: number; books: number; authors: number;
  departmentTotals: DeptRow[];
};
type Publisher = { name: string; count: number };
type NewArticle = { id: string; title: string; journalName: string | null; domain: string | null; createdAt: string };
type NewBook = { id: string; title: string; publisherName: string | null; domain: string | null; coverUrl: string | null };

const n = (x?: number) => (typeof x === 'number' ? x.toLocaleString('en-IN') : '—');
const LABEL = 'font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint';

function useLibrary() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [articles, setArticles] = useState<NewArticle[]>([]);
  const [books, setBooks] = useState<NewBook[]>([]);

  useEffect(() => {
    const get = (u: string) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    get('/api/library/stats').then(d => d && setStats(d));
    get('/api/library/publishers').then(d => Array.isArray(d) && setPublishers(d));
    get('/api/library/articles?limit=6&sort=newest').then(d => d?.data && setArticles(d.data));
    get('/api/library/books?limit=4&sort=newest').then(d => d?.data && setBooks(d.data));
  }, []);

  return { stats, publishers, articles, books };
}

/** A figure that is still loading shows a quiet bar, never a made-up number. */
function Figure({ value, className = '' }: { value?: number; className?: string }) {
  if (typeof value !== 'number') {
    return <span className={`inline-block h-[0.8em] w-24 animate-pulse rounded bg-surface-2 align-middle ${className}`} />;
  }
  return <span className={`tnum ${className}`}>{n(value)}</span>;
}

function Principle({ icon: Icon, title, children, proof }: {
  icon: any; title: string; children: React.ReactNode; proof?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-rule bg-surface p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon size={19} />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">{children}</p>
      {proof && <div className="mt-4 border-t border-rule pt-3">{proof}</div>}
    </div>
  );
}

function Audience({ icon: Icon, who, points }: { icon: any; who: string; points: string[] }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
          <Icon size={17} />
        </span>
        <h3 className="font-serif text-[20px] font-medium text-ink">{who}</h3>
      </div>
      <ul className="mt-4 space-y-2.5">
        {points.map(p => (
          <li key={p} className="flex gap-2.5 text-[13.5px] leading-snug text-ink-2">
            <ChevronRight size={15} className="mt-[2px] shrink-0 text-accent" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomePreview() {
  const navigate = useNavigate();
  const { stats, publishers, articles, books } = useLibrary();
  const [q, setQ] = useState('');

  const depts = stats?.departmentTotals || [];
  const topDepts = depts.slice(0, 6).map(d => ({ name: d.name, value: d.total }));

  return (
    <div className="bg-ground text-ink">
      <Helmet>
        <title>STM Digital Library — research your institution can open</title>
      </Helmet>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* Every grid here names one column on a phone. Left unnamed, the implicit
          column sized itself to the longest truncated line — a journal title —
          and the page came out 411px wide on a 390px screen, cutting the hero
          text off at the right. */}
      <section className="border-b border-rule bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-14 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div className="min-w-0">
            <p className={LABEL}>STM Digital Library · research, organised</p>
            <h1 className="mt-4 font-serif text-[38px] font-medium leading-[1.12] tracking-tight text-ink sm:text-[48px]">
              An academic library your whole institution can open.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">
              <b className="text-ink"><Figure value={stats?.total} /> items</b> of research —{' '}
              <Figure value={stats?.articles} /> articles and <Figure value={stats?.books} /> books —
              catalogued by department, journal, volume and issue, with every licence checked
              before anything is served.
            </p>

            <form
              onSubmit={e => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}
              className="mt-7 flex max-w-xl items-center gap-2 rounded-xl border border-rule-2 bg-surface p-1.5 shadow-sm focus-within:border-accent"
            >
              <Search size={18} className="ml-2.5 shrink-0 text-faint" />
              <input
                value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search articles, books, journals, authors…"
                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[14.5px] text-ink outline-none placeholder:text-faint"
              />
              <button type="submit" className="shrink-0 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover">
                Search
              </button>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-[14px] font-semibold text-surface hover:opacity-90">
                Register Now <ArrowRight size={16} />
              </Link>
              <Link to="/digital-library" className="inline-flex items-center gap-2 rounded-xl border border-rule-2 bg-surface px-5 py-3 text-[14px] font-semibold text-ink hover:bg-surface-2">
                Browse the collection
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] text-faint">
              Free to register · the whole library in half-hour sessions · Pro removes the limit
            </p>
          </div>

          {/* The catalogue itself, as the product sees it. */}
          <div className="rounded-2xl border border-rule bg-ground p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className={LABEL}>Live catalogue</p>
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> read from the database
              </span>
            </div>
            <p className="mt-4 font-mono text-[44px] leading-none text-ink">
              <Figure value={stats?.total} />
            </p>
            <p className="mt-1.5 text-[12.5px] text-muted">items across {depts.length || '—'} departments</p>

            <dl className="mt-5 grid grid-cols-3 divide-x divide-rule rounded-xl border border-rule bg-surface">
              {[
                ['Articles', stats?.articles],
                ['Books', stats?.books],
                ['Authors', stats?.authors],
              ].map(([label, value]) => (
                <div key={label as string} className="px-3 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</dt>
                  <dd className="mt-1 font-mono text-[17px] text-ink"><Figure value={value as number | undefined} /></dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-xl border border-rule bg-surface p-4">
              <p className="mb-3 text-[12px] font-semibold text-ink-2">Largest departments</p>
              {topDepts.length
                ? <Bars rows={topDepts} unit="items" />
                : <div className="space-y-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-6 animate-pulse rounded bg-surface-2" />)}</div>}
            </div>
          </div>
        </div>
      </section>

      {/* ── The collection in numbers ─────────────────────────────────────── */}
      <section className="border-b border-rule bg-surface">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Items of content', stats?.total],
            ['Research articles', stats?.articles],
            ['Books', stats?.books],
            ['Authors indexed', stats?.authors],
            ['Departments', depts.length || undefined],
            ['Publishers', publishers.length || undefined],
          ].map(([label, value]) => (
            <div key={label as string} className="border-rule px-2 py-7 text-center lg:border-l lg:first:border-l-0">
              <dd className="font-mono text-[26px] leading-none text-ink"><Figure value={value as number | undefined} /></dd>
              <dt className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ── How the library is built ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className={LABEL}>How it is built</p>
        <h2 className="mt-3 max-w-2xl font-serif text-[32px] font-medium leading-tight text-ink">
          Not a pile of PDFs. A catalogue, kept the way a library keeps one.
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Principle icon={Layers} title="Structured like a library"
            proof={
              <div className="flex flex-wrap items-center gap-1 font-mono text-[10.5px] text-muted">
                {['Department', 'Journal', 'Volume', 'Issue', 'Article'].map((s, i) => (
                  <span key={s} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={11} className="text-faint" />}
                    <span className="rounded bg-surface-2 px-1.5 py-0.5">{s}</span>
                  </span>
                ))}
              </div>
            }>
            Every article sits in its journal, volume and issue, under a department — so a reader can
            browse the way they would walk a shelf, not only search.
          </Principle>
          <Principle icon={ShieldCheck} title="Every licence checked"
            proof={<p className="font-mono text-[10.5px] text-muted">Served here · or linked to the publisher's copy</p>}>
            Full text is shown inside the library only where its licence allows it. Where it does not,
            the record is kept and the reader is sent to the publisher's own copy.
          </Principle>
          <Principle icon={RefreshCw} title="Always growing"
            proof={<p className="font-mono text-[10.5px] text-muted">DOAJ · DOAB · OpenAlex</p>}>
            New titles arrive continuously from open scholarly sources, and each is checked for its
            licence and its department on the way in.
          </Principle>
          <Principle icon={BookMarked} title="Picks up where you left off"
            proof={<p className="font-mono text-[10.5px] text-muted">Resume · history · what to open next</p>}>
            The reader remembers the page you stopped on, keeps your reading history, and suggests what
            to open next in the departments you care about.
          </Principle>
        </div>
      </section>

      {/* ── Where the collection is deep ─────────────────────────────────── */}
      <section className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={LABEL}>Where the collection is deep</p>
              <h2 className="mt-3 font-serif text-[32px] font-medium leading-tight text-ink">
                Everything held, department by department.
              </h2>
            </div>
            <Link to="/digital-library" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
              Explore every department <ArrowRight size={13} />
            </Link>
          </div>
          <div className="mt-8 rounded-2xl border border-rule bg-ground p-6">
            {depts.length
              ? <Collection rows={depts} />
              : <div className="space-y-4">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-7 animate-pulse rounded bg-surface-2" />)}</div>}
          </div>
        </div>
      </section>

      {/* ── Who it is for ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className={LABEL}>Built for everyone at the institution</p>
        <h2 className="mt-3 max-w-2xl font-serif text-[32px] font-medium leading-tight text-ink">
          One library, three ways in.
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Audience icon={Building2} who="Librarians" points={[
            'Add faculty and researchers to your institution',
            'See reading by week and by subject',
            'Find the searches that came back empty — the gaps to fill',
            'Manage access and membership in one place',
          ]} />
          <Audience icon={GraduationCap} who="Faculty & researchers" points={[
            `Search ${stats ? n(stats.total) : 'the whole'} items from one box`,
            'Browse by department, journal, volume and issue',
            'Resume where you stopped, with your history kept',
            'Suggestions of what to open next in your departments',
          ]} />
          <Audience icon={Users} who="Institutions" points={[
            'Free: the whole library, in half-hour sessions',
            'Pro: no session limit for anyone you add',
            'Pro: students added, in numbers agreed with you',
          ]} />
        </div>
      </section>

      {/* ── Just added ───────────────────────────────────────────────────── */}
      <section className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className={LABEL}>Just added to the library</p>
          <h2 className="mt-3 font-serif text-[32px] font-medium leading-tight text-ink">
            The shelves move every day.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="overflow-hidden rounded-2xl border border-rule bg-ground">
              <p className={`${LABEL} border-b border-rule px-5 py-3`}>Articles</p>
              <ul className="divide-y divide-rule">
                {(articles.length ? articles : Array.from({ length: 5 }) as any[]).map((a: NewArticle | undefined, i) => (
                  <li key={a?.id || i} className="px-5 py-3.5">
                    {a ? (
                      <Link to={`/library/article/${a.id}`} className="group block">
                        <p className="line-clamp-1 text-[14px] text-ink-2 group-hover:text-accent">{a.title}</p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-faint">
                          {[a.journalName, a.domain].filter(Boolean).join(' · ')}
                        </p>
                      </Link>
                    ) : <div className="h-9 animate-pulse rounded bg-surface-2" />}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl border border-rule bg-ground">
              <p className={`${LABEL} border-b border-rule px-5 py-3`}>Books</p>
              <ul className="divide-y divide-rule">
                {(books.length ? books : Array.from({ length: 4 }) as any[]).map((b: NewBook | undefined, i) => (
                  <li key={b?.id || i} className="flex items-center gap-3.5 px-5 py-3">
                    {b ? (
                      <>
                        <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-surface-2">
                          {b.coverUrl && <img src={b.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[13.5px] leading-snug text-ink-2">{b.title}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-faint">
                            {[b.publisherName, b.domain].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </>
                    ) : <div className="h-14 w-full animate-pulse rounded bg-surface-2" />}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Publishers ───────────────────────────────────────────────────── */}
      {publishers.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-16">
          <p className={LABEL}>From {n(publishers.length)} publishers, including</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {publishers.slice(0, 14).map(p => (
              <span key={p.name} className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3.5 py-1.5 text-[12.5px] text-ink-2">
                {p.name}
                <span className="tnum font-mono text-[11px] text-faint">{n(p.count)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Close ────────────────────────────────────────────────────────── */}
      <section className="border-t border-rule bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="font-serif text-[30px] font-medium leading-tight text-surface">
              Open the library for your institution.
            </h2>
            <p className="mt-2 text-[14px] text-surface/70">
              Register free, add your faculty and researchers, and start reading today.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white hover:bg-accent-hover">
              Register Now <ArrowRight size={16} />
            </Link>
            <Link to="/digital-library" className="inline-flex items-center gap-2 rounded-xl border border-surface/25 px-5 py-3 text-[14px] font-semibold text-surface hover:bg-surface/10">
              Browse the collection
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
