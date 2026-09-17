import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, BookMarked, Building2, ChevronLeft, ChevronRight, GraduationCap, Layers,
  Pause, Play, RefreshCw, Search, ShieldCheck, Users,
} from 'lucide-react';
import { Bars, Collection, Columns, Donut, type DeptRow } from './charts';

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
type Insights = {
  composition: { total: number; articles: number; books: number; other: number; otherTypes: { type: string; n: number }[] };
  access: { readHere: number; atPublisher: number; recordOnly: number };
  licences: { key: string; label: string; n: number }[];
  years: { year: number; n: number }[];
};
type Subject = { name: string; slug: string; journals: number; articles: number };
type NewArticle = { id: string; title: string; journalName: string | null; domain: string | null; createdAt: string };
type NewBook = { id: string; title: string; publisherName: string | null; domain: string | null; coverUrl: string | null };

const n = (x?: number) => (typeof x === 'number' ? x.toLocaleString('en-IN') : '—');
const LABEL = 'font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint';

function useLibrary() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [articles, setArticles] = useState<NewArticle[]>([]);
  const [books, setBooks] = useState<NewBook[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    const get = (u: string) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    get('/api/library/stats').then(d => d && setStats(d));
    get('/api/library/publishers').then(d => Array.isArray(d) && setPublishers(d));
    get('/api/library/articles?limit=6&sort=newest').then(d => d?.data && setArticles(d.data));
    get('/api/library/books?limit=4&sort=newest').then(d => d?.data && setBooks(d.data));
    get('/api/library/insights').then(d => d?.composition && setInsights(d));
    get('/api/library/subjects').then(d => Array.isArray(d) && setSubjects(d));
  }, []);

  return { stats, publishers, articles, books, insights, subjects };
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

/**
 * One total split into its parts, as a single bar — the compact form of the
 * donuts further down, sized for a slide. Parts sit in their given order with a
 * 2px surface gap and rounded outer ends; the legend under it carries every
 * label and share, so colour is never the only thing that identifies a part.
 */
function Split({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  const shown = parts.filter(p => p.value > 0);
  const pct = (v: number) => { const x = (v / total) * 100; return x > 0 && x < 1 ? '<1%' : `${Math.round(x)}%`; };
  return (
    <div>
      <div className="flex h-3 gap-[2px]">
        {shown.map((p, i) => (
          <div key={p.key} style={{ flex: `${p.value} 1 0%`, background: p.color }}
            className={`${i === 0 ? 'rounded-l-[4px]' : ''} ${i === shown.length - 1 ? 'rounded-r-[4px]' : ''}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-1.5">
        {parts.map(p => (
          <li key={p.key} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{p.label}</span>
            <span className="tnum font-mono text-[12px] text-ink">{n(p.value)}</span>
            <span className="tnum w-9 text-right font-mono text-[11px] text-faint">{pct(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SlideData = {
  stats: Stats | null; insights: Insights | null; articles: NewArticle[];
  publishers: Publisher[]; depts: DeptRow[];
};

const SLIDE_MS = 7000;

/**
 * The hero's right-hand panel, as a run of slides — each one a single fact
 * about the library with the figure that proves it.
 *
 * Only the panel moves. The headline, the search box and Register Now stay
 * where the eye left them, because a carousel that carries the main action away
 * is a carousel people stop trusting.
 *
 * It advances on its own, and stops when a reader points at it, focuses it,
 * or has asked their system for reduced motion — a slide that changes while it
 * is being read is worse than no slide. Arrows, dots, the keyboard and a swipe
 * all move it by hand. Every slide is drawn at the same height so the page
 * underneath never jumps.
 */
function HeroSlider(d: SlideData) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);

  const slides = buildSlides(d);
  const count = slides.length;
  const go = useCallback((to: number) => setI(((to % count) + count) % count), [count]);
  const running = !hover && !paused && !reduced;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(i + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, running, go]);

  return (
    <div
      role="region" aria-roledescription="carousel" aria-label="Facts about the library"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      onKeyDown={e => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
        touch.current = null;
      }}
      className="relative overflow-hidden rounded-2xl border border-rule bg-ground shadow-sm"
    >
      {/* how long this slide has left */}
      <div className="h-[2px] w-full bg-rule">
        <div key={`${i}-${running}`}
          className={`h-full origin-left bg-accent ${running ? 'slider-progress' : ''}`}
          style={{ animationDuration: `${SLIDE_MS}ms`, transform: running ? undefined : 'scaleX(0)' }} />
      </div>

      <div className="relative h-[452px]" aria-live={running ? 'off' : 'polite'}>
        {slides.map((sl, k) => (
          <div key={sl.key}
            role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${count}: ${sl.label}`}
            aria-hidden={k !== i}
            className={`absolute inset-0 flex flex-col p-5 transition-all duration-500 ${
              k === i ? 'translate-x-0 opacity-100' : k < i ? '-translate-x-6 opacity-0 pointer-events-none' : 'translate-x-6 opacity-0 pointer-events-none'}`}>
            <p className={LABEL}>{sl.label}</p>
            {sl.body}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-rule bg-surface px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {slides.map((sl, k) => (
            <button key={sl.key} type="button" onClick={() => go(k)}
              aria-label={`Show slide ${k + 1}: ${sl.label}`} aria-current={k === i}
              className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-accent' : 'w-1.5 bg-rule-2 hover:bg-muted'}`} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="tnum mr-1 font-mono text-[10.5px] text-faint">{i + 1} / {count}</span>
          <button type="button" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play slides' : 'Pause slides'}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button type="button" onClick={() => go(i - 1)} aria-label="Previous slide"
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => go(i + 1)} aria-label="Next slide"
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

/** The slides, each built only from data already on the page. */
function buildSlides({ stats, insights, articles, publishers, depts }: SlideData) {
  const Big = ({ value, suffix }: { value?: number; suffix?: string }) => (
    <p className="mt-3 font-mono text-[44px] leading-none text-ink">
      <Figure value={value} />{suffix && typeof value === 'number' && <span className="text-[28px] text-muted">{suffix}</span>}
    </p>
  );
  const Line = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-2 text-[13px] leading-snug text-muted">{children}</p>
  );
  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-5 flex flex-1 flex-col overflow-hidden rounded-xl border border-rule bg-surface p-4">{children}</div>
  );
  // A closing line pinned to the foot of a slide's frame: what the figure above means.
  const Footnote = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-auto flex items-start gap-2 border-t border-rule pt-3 text-[12px] leading-snug text-muted">
      <ShieldCheck size={14} className="mt-[1px] shrink-0 text-accent" /><span>{children}</span>
    </p>
  );

  const acc = insights?.access;
  const accTotal = acc ? acc.readHere + acc.atPublisher + acc.recordOnly : 0;
  const readPct = acc && accTotal ? Math.round((acc.readHere / accTotal) * 100) : undefined;
  const years = insights?.years || [];
  const thisYear = years[years.length - 1];
  const licTotal = insights ? insights.licences.reduce((t, l) => t + l.n, 0) : undefined;
  // Of the articles we did not publish ourselves, the share under CC BY or
  // CC BY-SA — the two licences that allow reuse, commercial included, with credit.
  const licOf = (k: string) => insights?.licences.find(l => l.key === k)?.n || 0;
  const outside = licTotal !== undefined ? licTotal - licOf('own') : 0;
  const reusePct = outside ? Math.round(((licOf('by') + licOf('bysa')) / outside) * 100) : undefined;

  return [
    {
      key: 'catalogue', label: 'Live catalogue',
      body: (
        <>
          <Big value={stats?.total} />
          <Line>items across {depts.length || '—'} departments — read from the database as this page loaded</Line>
          <dl className="mt-4 grid grid-cols-3 divide-x divide-rule rounded-xl border border-rule bg-surface">
            {([['Articles', stats?.articles], ['Books', stats?.books], ['Authors', stats?.authors]] as const).map(([label, value]) => (
              <div key={label} className="px-3 py-2.5">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</dt>
                <dd className="mt-1 font-mono text-[16px] text-ink"><Figure value={value} /></dd>
              </div>
            ))}
          </dl>
          <Frame>
            <p className="mb-3 text-[12px] font-semibold text-ink-2">Largest departments</p>
            {depts.length ? <Bars rows={depts.slice(0, 4).map(x => ({ name: x.name, value: x.total }))} unit="items" /> : null}
          </Frame>
        </>
      ),
    },
    {
      key: 'access', label: 'Where you read it',
      body: (
        <>
          <Big value={readPct} suffix="%" />
          <Line>of the {n(accTotal || undefined)} articles and books in the catalogue open right here in the library — the rest link to the publisher's own copy.</Line>
          <Frame>
            {acc ? <Split parts={[
              { key: 'here', label: 'Read here, in the library', value: acc.readHere, color: 'var(--acc-1)' },
              { key: 'pub', label: "At the publisher's site", value: acc.atPublisher, color: 'var(--acc-2)' },
              { key: 'rec', label: 'Catalogue record only', value: acc.recordOnly, color: 'var(--acc-3)' },
            ]} /> : null}
            <Footnote>
              Full text is served here only where its licence allows. Everything else stays in the
              catalogue, with a link to the publisher's own copy.
            </Footnote>
          </Frame>
        </>
      ),
    },
    {
      key: 'new', label: 'Just added',
      body: (
        <>
          <p className="mt-3 font-serif text-[26px] leading-tight text-ink">The shelves move every day.</p>
          <Line>The newest articles to reach the catalogue, with their journal and department.</Line>
          <Frame>
            <ul className="divide-y divide-rule">
              {articles.slice(0, 3).map(a => (
                <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link to={`/library/article/${a.id}`} className="group block" tabIndex={-1}>
                    <p className="line-clamp-2 text-[13px] leading-snug text-ink-2 group-hover:text-accent">{a.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[10.5px] text-faint">{[a.journalName, a.domain].filter(Boolean).join(' · ')}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Frame>
        </>
      ),
    },
    {
      key: 'recency', label: 'How current it is',
      body: (
        <>
          <Big value={thisYear?.n} />
          <Line>articles published in {thisYear?.year ?? 'this year'} so far — the collection leans recent, not archival.</Line>
          <Frame>
            {years.length ? <Columns unit="articles" data={years.map(y => ({ label: String(y.year), value: y.n }))} /> : null}
          </Frame>
        </>
      ),
    },
    {
      key: 'licences', label: 'On what terms',
      body: (
        <>
          <Big value={licTotal} />
          <Line>catalogue articles, and every one of them carries its licence — from our own publications to the most restricted Creative Commons terms.</Line>
          <Frame>
            {insights ? <Split parts={insights.licences.map((l, k) => ({ key: l.key, label: l.label, value: l.n, color: `var(--lic-${k + 1})` }))} /> : null}
            {typeof reusePct === 'number' && (
              <Footnote>
                Of the {n(outside)} articles we did not publish ourselves, {reusePct}% are under CC BY or
                CC BY-SA — licences that allow reuse, commercial included, with credit.
              </Footnote>
            )}
          </Frame>
        </>
      ),
    },
    {
      key: 'publishers', label: 'Where it comes from',
      body: (
        <>
          <Big value={publishers.length || undefined} />
          <Line>publishers contribute to the collection. The largest of them:</Line>
          <Frame>
            {publishers.length ? <Bars rows={publishers.slice(0, 5).map(p => ({ name: p.name, value: p.count }))} unit="articles" /> : null}
          </Frame>
        </>
      ),
    },
  ];
}

function ChartCard({ label, title, children, note }: {
  label: string; title: string; children: React.ReactNode; note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-rule bg-surface p-6">
      <p className={LABEL}>{label}</p>
      <h3 className="mt-2 text-[15px] font-semibold text-ink">{title}</h3>
      <div className="mt-5 flex-1">{children}</div>
      {note && <div className="mt-4 border-t border-rule pt-3 text-[12px] leading-relaxed text-muted">{note}</div>}
    </div>
  );
}

const ChartSkeleton = ({ h = 260 }: { h?: number }) => (
  <div className="animate-pulse rounded-xl bg-surface-2" style={{ height: h }} />
);

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
  const { stats, publishers, articles, books, insights, subjects } = useLibrary();
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

          {/* The catalogue itself, as the product sees it — one fact a slide. */}
          <HeroSlider stats={stats} insights={insights} articles={articles} publishers={publishers} depts={depts} />
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

      {/* ── At a glance: what, where, on what terms ──────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-20">
        <p className={LABEL}>The collection at a glance</p>
        <h2 className="mt-3 max-w-2xl font-serif text-[32px] font-medium leading-tight text-ink">
          What it is, where you read it, and on what terms.
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard label="Composition" title="What the library is made of"
            note={insights?.composition.otherTypes.length ? (
              <>Other: {insights.composition.otherTypes.map(t => `${t.type} ${n(t.n)}`).join(' · ')}</>
            ) : undefined}>
            {insights ? (
              <Donut centerLabel="items in all" slices={[
                { key: 'articles', label: 'Articles', value: insights.composition.articles, color: 'var(--series-1)' },
                { key: 'books', label: 'Books', value: insights.composition.books, color: 'var(--series-2)' },
                { key: 'other', label: 'Other kinds', value: insights.composition.other, color: 'var(--series-3)' },
              ]} />
            ) : <ChartSkeleton />}
          </ChartCard>

          <ChartCard label="Access" title="Where you read it"
            note={insights ? (
              <>Full text is shown here only where the licence allows; otherwise the reader goes to the
              publisher's own copy. Counts the {n(insights.access.readHere + insights.access.atPublisher + insights.access.recordOnly)} articles
              and books in the structured catalogue — archived items carry no access record.</>
            ) : undefined}>
            {insights ? (
              <Donut centerLabel="in the catalogue" slices={[
                { key: 'here', label: 'Read here, in the library', value: insights.access.readHere, color: 'var(--acc-1)' },
                { key: 'publisher', label: "At the publisher's site", value: insights.access.atPublisher, color: 'var(--acc-2)' },
                { key: 'record', label: 'Catalogue record only', value: insights.access.recordOnly, color: 'var(--acc-3)' },
              ]} />
            ) : <ChartSkeleton />}
          </ChartCard>

          <ChartCard label="Licences" title="On what terms"
            note={insights ? (
              <>Ordered from most open to most restricted. Every one of the{' '}
              {n(insights.licences.reduce((t, l) => t + l.n, 0))} catalogue articles carries its licence;
              archived periodicals carry no licence record.</>
            ) : undefined}>
            {insights ? (
              <Donut centerLabel="catalogue articles" slices={insights.licences.map((l, i) => ({
                key: l.key, label: l.label, value: l.n, color: `var(--lic-${i + 1})`,
              }))} />
            ) : <ChartSkeleton />}
          </ChartCard>
        </div>
      </section>

      {/* ── How current, and in which subjects ───────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-4">
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
          <ChartCard label="Recency" title="Articles by year of publication"
            note={insights?.years.length ? `${insights.years[insights.years.length - 1].year} counts the year so far.` : undefined}>
            {insights?.years.length
              ? <Columns unit="articles" data={insights.years.map(y => ({ label: String(y.year), value: y.n }))} />
              : <ChartSkeleton h={200} />}
          </ChartCard>
          <ChartCard label="Subjects" title="Largest subjects by articles">
            {subjects.length
              ? <Bars rows={subjects.slice(0, 7).map(x => ({ name: x.name, value: x.articles }))} unit="articles" />
              : <ChartSkeleton h={200} />}
          </ChartCard>
        </div>
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
