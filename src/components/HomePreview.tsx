import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, BookMarked, BookOpen, Building2, ChevronLeft, ChevronRight, FileText,
  GraduationCap, Layers, Library, Pause, Play, RefreshCw, Search, ShieldCheck, Sparkles, Tags,
  Users, UserSquare2,
} from 'lucide-react';
import { Bars, Collection, Columns, Donut, type DeptRow } from './charts';

/**
 * A second draft of the home page, at /home-preview, for side-by-side review.
 *
 * The shape follows a reference the user chose — a hero that slides, a card of
 * ways in laid over it, a strip of names, a band of figures, a department
 * explorer, what is new, a walkthrough, who it is for. What fills that shape is
 * ours and only ours: every figure is read from the catalogue as the page
 * loads, every name and title is a real row, and where the reference uses
 * photography this uses the book covers we actually hold. A number nobody can
 * stand behind undoes the rest of the page.
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
type NewBook = {
  id: string; title: string; authors: string | null; publisherName: string | null;
  domain: string | null; coverUrl: string | null; year: number | null; createdAt: string;
};
type Department = {
  domain: string; slug: string; articles: number; books: number;
  firstYear: number | null; lastYear: number | null;
  journals: { id: string; title: string; publisherName: string | null; articleCount: number; firstYear: number | null; lastYear: number | null }[];
  publishers: { name: string; journals: number }[];
};

const n = (x?: number) => (typeof x === 'number' ? x.toLocaleString('en-IN') : '—');
const LABEL = 'font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint';

/** "Added today", "Added 3 days ago" — vague on purpose past a fortnight. */
function added(iso?: string) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < 14) return `Added ${days} days ago`;
  return `Added ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

/** OpenAlex sends the occasional issue record with no title of its own. */
const named = (t?: string) => Boolean(t && t.trim() && t.trim().toLowerCase() !== 'untitled');

/**
 * Where a title on this page leads.
 *
 * The reader's own pages live behind a login, and a home page that bounces a
 * first-time visitor to a sign-in form has wasted the click. The browse screen
 * is public and takes a search, so a title opens there, found and waiting.
 */
const browse = (kind: 'articles' | 'books', title: string) =>
  `/digital-library?kind=${kind}&q=${encodeURIComponent(title)}`;

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
    get('/api/library/articles?limit=12&sort=newest').then(d => d?.data && setArticles(d.data.filter((a: NewArticle) => named(a.title))));
    // More than are shown: fewer than half the books carry a cover, and the
    // cards want covers.
    get('/api/library/books?limit=36&sort=newest').then(d => d?.data && setBooks(d.data));
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
      className="relative self-start overflow-hidden rounded-2xl border border-rule bg-ground shadow-2xl"
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

      {/* The counter reads like the reference's — this slide, of how many, with
          the run of them drawn as a rule that fills. */}
      <div className="flex items-center justify-between border-t border-rule bg-surface px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="tnum font-mono text-[15px] text-ink">{String(i + 1).padStart(2, '0')}</span>
          <span className="font-mono text-[11px] text-faint">/ {String(count).padStart(2, '0')}</span>
          <div className="flex items-center gap-1.5">
            {slides.map((sl, k) => (
              <button key={sl.key} type="button" onClick={() => go(k)}
                aria-label={`Show slide ${k + 1}: ${sl.label}`} aria-current={k === i}
                className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-accent' : 'w-1.5 bg-rule-2 hover:bg-muted'}`} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
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
                  <Link to={browse('articles', a.title)} className="group block" tabIndex={-1}>
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

/**
 * The backdrop of the hero: the covers we actually hold, tiled and turned
 * almost all the way down. The reference uses stock photography of people in
 * labs; a library's own shelf is both truer and cheaper.
 */
function CoverWall({ books }: { books: NewBook[] }) {
  const covers = books.filter(b => b.coverUrl).slice(0, 18);
  if (!covers.length) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-wrap gap-3 p-3 opacity-[0.16] blur-[1px]">
        {covers.concat(covers).map((b, i) => (
          <img key={`${b.id}-${i}`} src={b.coverUrl as string} alt="" loading="lazy"
            className="h-40 w-28 shrink-0 rounded object-cover" />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/95 to-ink/70" />
    </div>
  );
}

/** A book with no cover still gets one: its own title, set on a tinted panel. */
function Cover({ book, className = '' }: { book: NewBook; className?: string }) {
  if (book.coverUrl) {
    return <img src={book.coverUrl} alt="" loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex flex-col justify-between bg-accent-soft p-3 ${className}`}>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">{book.domain || 'Book'}</span>
      <span className="line-clamp-4 font-serif text-[13px] leading-tight text-ink">{book.title}</span>
      <span className="truncate font-mono text-[9px] text-muted">{book.publisherName || ''}</span>
    </div>
  );
}

/** The card of ways in, laid over the foot of the hero. */
const WAYS_IN: { to: string; icon: any; title: string; sub: string }[] = [
  { to: '/digital-library?kind=articles', icon: FileText, title: 'Articles', sub: 'Peer-reviewed research' },
  { to: '/digital-library?kind=books', icon: BookOpen, title: 'Books', sub: 'Open-access monographs' },
  { to: '/journals', icon: Library, title: 'Journals', sub: 'By volume and issue' },
  { to: '/digital-library', icon: Layers, title: 'Departments', sub: 'Browse like a shelf' },
  { to: '/digital-library', icon: Building2, title: 'Publishers', sub: 'Who published it' },
  { to: '/digital-library?sort=newest', icon: Sparkles, title: 'Newest first', sub: 'What arrived today' },
  { to: '/digital-library?oa=1', icon: Tags, title: 'Open access only', sub: 'Read here, in full' },
  { to: '/for-institutions', icon: UserSquare2, title: 'For institutions', sub: 'Add your people' },
];

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
 * The department explorer: every department on the left with what it holds, the
 * chosen one opened on the right. The list is the figure the reference gives to
 * three domains — we have twenty-eight, so the list scrolls and the panel is
 * fetched for whichever is chosen, rather than all of them at load.
 */
function DepartmentExplorer({ depts }: { depts: DeptRow[] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, Department>>({});
  const [loading, setLoading] = useState(false);

  const current = chosen ?? depts[0]?.name ?? null;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  useEffect(() => {
    if (!current || cache[current]) return;
    let live = true;
    setLoading(true);
    fetch(`/api/library/department/${slug(current)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && d?.domain) setCache(c => ({ ...c, [current]: d })); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [current, cache]);

  const d = current ? cache[current] : undefined;
  const row = depts.find(x => x.name === current);
  const max = depts[0]?.total || 1;

  return (
    <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="max-h-[560px] overflow-y-auto rounded-2xl border border-rule bg-surface p-2">
        {(depts.length ? depts : Array.from({ length: 8 }) as any[]).map((x: DeptRow | undefined, i) => (
          x ? (
            <button key={x.name} type="button" onClick={() => setChosen(x.name)}
              aria-current={x.name === current}
              className={`block w-full rounded-xl px-3.5 py-3 text-left transition-colors ${
                x.name === current ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
              <span className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-[13.5px] ${x.name === current ? 'font-semibold text-accent' : 'text-ink-2'}`}>{x.name}</span>
                <span className={`tnum shrink-0 font-mono text-[11.5px] ${x.name === current ? 'text-accent' : 'text-faint'}`}>{n(x.total)}</span>
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-rule">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (x.total / max) * 100)}%` }} />
              </span>
            </button>
          ) : <div key={i} className="m-1 h-10 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
        <div className="border-b border-rule bg-ink px-6 py-7 text-surface">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-surface/60">Department</p>
          <h3 className="mt-2 font-serif text-[30px] font-medium leading-tight">{current || '—'}</h3>
          <p className="mt-2 text-[13.5px] text-surface/70">
            {row ? <>{n(row.total)} items held</> : 'Reading the catalogue…'}
            {d?.firstYear ? <> · published {d.firstYear}–{d.lastYear}</> : null}
          </p>
        </div>

        <div className="grid grid-cols-2 divide-x divide-rule border-b border-rule sm:grid-cols-4">
          {[
            ['Articles', d?.articles],
            ['Books', d?.books],
            ['Journals', d?.journals.length],
            ['Publishers', d?.publishers.length],
          ].map(([label, value]) => (
            <div key={label as string} className="px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</p>
              <p className="mt-1 font-mono text-[20px] text-ink">
                {loading && !d ? <span className="inline-block h-4 w-12 animate-pulse rounded bg-surface-2" /> : <Figure value={value as number | undefined} />}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[1.3fr_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className={LABEL}>Journals with the most articles</p>
            <ul className="mt-3 divide-y divide-rule">
              {(d?.journals.slice().sort((a, b) => b.articleCount - a.articleCount).slice(0, 5) || Array.from({ length: 4 }) as any[]).map((j: any, i: number) => (
                j ? (
                  <li key={j.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-ink-2">{j.title}</span>
                      <span className="block truncate font-mono text-[10.5px] text-faint">{j.publisherName || '—'}</span>
                    </span>
                    <span className="tnum shrink-0 font-mono text-[12px] text-ink">{n(j.articleCount)}</span>
                  </li>
                ) : <li key={i} className="py-3"><div className="h-6 animate-pulse rounded bg-surface-2" /></li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <p className={LABEL}>Publishers here</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(d?.publishers.slice(0, 8) || []).map(p => (
                <span key={p.name} className="max-w-full truncate rounded-full border border-rule bg-ground px-3 py-1 text-[11.5px] text-ink-2">
                  {p.name}
                </span>
              ))}
              {!d && <div className="h-20 w-full animate-pulse rounded-xl bg-surface-2" />}
            </div>
            {current && (
              <Link to={`/domain/${slug(current)}`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover">
                Explore {current} <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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

function Audience({ icon: Icon, who, blurb, points, to }: {
  icon: any; who: string; blurb: string; points: string[]; to: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-rule bg-surface p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
        <Icon size={18} />
      </span>
      <h3 className="mt-4 font-serif text-[20px] font-medium text-ink">{who}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{blurb}</p>
      <ul className="mt-4 flex-1 space-y-2">
        {points.map(p => (
          <li key={p} className="flex gap-2 text-[13px] leading-snug text-ink-2">
            <ChevronRight size={14} className="mt-[2px] shrink-0 text-accent" /><span>{p}</span>
          </li>
        ))}
      </ul>
      <Link to={to} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
        Learn more <ArrowRight size={14} />
      </Link>
    </div>
  );
}

/** Where the collection comes from, as the reference shows its affiliations. */
function Provenance({ publishers }: { publishers: Publisher[] }) {
  const [tab, setTab] = useState<'publishers' | 'sources'>('publishers');
  const sources = [
    { name: 'DOAJ', what: 'Directory of Open Access Journals', gives: 'Journals, and the licence each one declares' },
    { name: 'DOAB', what: 'Directory of Open Access Books', gives: 'Books, catalogued with a link to the publisher' },
    { name: 'OpenAlex', what: 'Open catalogue of scholarly work', gives: 'Articles, with their journal, volume and issue' },
    { name: 'OAPEN Library', what: 'Open-access book library', gives: 'The book files themselves, where they exist' },
  ];
  return (
    <div className="rounded-2xl border border-rule bg-surface p-6">
      <div className="flex flex-wrap gap-1.5">
        {([['publishers', `Publishers ${publishers.length || ''}`], ['sources', `Sources ${sources.length}`]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              tab === id ? 'bg-ink text-surface' : 'border border-rule text-ink-2 hover:bg-surface-2'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'publishers' ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {publishers.slice(0, 24).map(p => (
            <span key={p.name} className="inline-flex max-w-full items-center gap-2 rounded-full border border-rule bg-ground px-3.5 py-1.5 text-[12.5px] text-ink-2">
              <span className="truncate">{p.name}</span>
              <span className="tnum shrink-0 font-mono text-[11px] text-faint">{n(p.count)}</span>
            </span>
          ))}
          {!publishers.length && <div className="h-24 w-full animate-pulse rounded-xl bg-surface-2" />}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sources.map(s => (
            <div key={s.name} className="rounded-xl border border-rule bg-ground p-4">
              <p className="font-mono text-[12px] uppercase tracking-wider text-accent">{s.name}</p>
              <p className="mt-1 text-[13.5px] text-ink">{s.what}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{s.gives}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-5 border-t border-rule pt-3 text-[11.5px] leading-relaxed text-faint">
        Publisher names are shown as the catalogue records them. Nothing is served here unless the
        licence on the work allows it.
      </p>
    </div>
  );
}

export function HomePreview() {
  const navigate = useNavigate();
  const { stats, publishers, articles, books, insights, subjects } = useLibrary();
  const [q, setQ] = useState('');

  const depts = stats?.departmentTotals || [];
  const withCovers = books.filter(b => b.coverUrl);
  const featured = (withCovers.length >= 3 ? withCovers : books).slice(0, 3);
  const years = insights?.years || [];
  const span = years.length ? `${years[0].year}–${years[years.length - 1].year}` : undefined;

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
      <section className="relative overflow-hidden bg-ink">
        <CoverWall books={books} />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 pb-28 pt-14 lg:grid-cols-[1.1fr_1fr] lg:pb-32 lg:pt-20">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-surface/10 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-surface/80">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> The collection
            </p>
            <h1 className="mt-5 font-serif text-[40px] font-medium leading-[1.08] tracking-tight text-surface sm:text-[54px]">
              An academic library your whole institution can{' '}
              <span className="relative whitespace-nowrap text-accent">
                open
                <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-accent/70" />
              </span>.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-surface/75">
              <b className="text-surface"><Figure value={stats?.total} /> items</b> of research —{' '}
              <Figure value={stats?.articles} /> articles and <Figure value={stats?.books} /> books —
              catalogued by department, journal, volume and issue, with every licence checked
              before anything is served.
            </p>

            <form
              onSubmit={e => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}
              className="mt-7 flex max-w-xl items-center gap-2 rounded-xl border border-surface/15 bg-surface/95 p-1.5 shadow-xl focus-within:border-accent"
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

            {/* Who the library is for, as the reference sets out its audiences. */}
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { label: 'Students', to: '/for-students', icon: GraduationCap },
                { label: 'Faculty & researchers', to: '/for-students', icon: UserSquare2 },
                { label: 'Librarians', to: '/for-institutions', icon: Library },
                { label: 'Institutions', to: '/for-institutions', icon: Building2 },
              ].map(a => (
                <Link key={a.label} to={a.to}
                  className="inline-flex items-center gap-2 rounded-full border border-surface/20 bg-surface/5 px-3.5 py-1.5 text-[12.5px] text-surface/85 hover:bg-surface/15">
                  <a.icon size={14} className="text-accent" /> {a.label}
                </Link>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white hover:bg-accent-hover">
                Register Now <ArrowRight size={16} />
              </Link>
              <Link to="/digital-library" className="inline-flex items-center gap-2 rounded-xl border border-surface/25 px-5 py-3 text-[14px] font-semibold text-surface hover:bg-surface/10">
                Browse the collection
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] text-surface/55">
              Free to register · the whole library in half-hour sessions · Pro removes the limit
            </p>
          </div>

          {/* The catalogue itself, as the product sees it — one fact a slide. */}
          <HeroSlider stats={stats} insights={insights} articles={articles} publishers={publishers} depts={depts} />
        </div>
      </section>

      {/* ── Ways in, laid over the foot of the hero ──────────────────────── */}
      <section className="relative z-10 mx-auto -mt-20 max-w-6xl px-5">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-rule bg-rule shadow-xl sm:grid-cols-2 lg:grid-cols-4">
          {WAYS_IN.map(w => (
            <Link key={w.title} to={w.to} className="group flex items-center gap-3 bg-surface px-5 py-4 hover:bg-surface-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <w.icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-ink group-hover:text-accent">{w.title}</span>
                <span className="block truncate text-[11.5px] text-muted">{w.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── The publishers, walking past ─────────────────────────────────── */}
      <section className="mt-16 border-y border-rule bg-surface py-6">
        <div className="mx-auto mb-4 max-w-6xl px-5">
          <p className={LABEL}>Published by {n(publishers.length || undefined)} publishers, among them</p>
        </div>
        <div className="marquee relative overflow-hidden">
          <div className="marquee-track flex w-max gap-3">
            {(publishers.length ? publishers.slice(0, 30).concat(publishers.slice(0, 30)) : []).map((p, i) => (
              <span key={`${p.name}-${i}`} className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-rule bg-ground px-4 py-2 text-[13px] text-ink-2">
                {p.name}
                <span className="tnum font-mono text-[11px] text-faint">{n(p.count)}</span>
              </span>
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-surface to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-surface to-transparent" />
        </div>
      </section>

      {/* ── What the library adds up to ──────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className={LABEL}>Built for trust, not for the brochure</p>
        <h2 className="mt-3 max-w-2xl font-serif text-[32px] font-medium leading-tight text-ink">
          Every figure on this page is read from the catalogue as it loads.
        </h2>
        <dl className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Layers, value: stats?.total, label: 'Items of content', hint: `Articles, books and archived material across ${depts.length || '—'} departments` },
            { icon: FileText, value: stats?.articles, label: 'Research articles', hint: 'Each one in its journal, volume and issue' },
            { icon: BookOpen, value: stats?.books, label: 'Books', hint: 'Open-access monographs and edited volumes' },
            { icon: Users, value: stats?.authors, label: 'Authors indexed', hint: 'Searchable by name, with everything they wrote' },
          ].map(s => (
            <div key={s.label}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <s.icon size={20} />
              </span>
              <dd className="mt-4 font-mono text-[32px] leading-none text-ink"><Figure value={s.value} /></dd>
              <dt className="mt-2 text-[14px] font-semibold text-ink">{s.label}</dt>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{s.hint}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Department explorer ──────────────────────────────────────────── */}
      <section className="border-y border-rule bg-ground">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className={LABEL}>Core departments</p>
          <h2 className="mt-3 max-w-2xl font-serif text-[32px] font-medium leading-tight text-ink">
            Explore the collection department by department.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Choose a department to see what it actually holds — how many articles and books, which
            journals carry the most, and which publishers they come from.
          </p>
          <DepartmentExplorer depts={depts} />
        </div>
      </section>

      {/* ── Why it reads like a library ──────────────────────────────────── */}
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

      {/* ── Just added ───────────────────────────────────────────────────── */}
      <section className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={LABEL}>Just added</p>
              <h2 className="mt-3 font-serif text-[32px] font-medium leading-tight text-ink">
                The shelves move every day.
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                The newest books to reach the catalogue, and the articles that arrived with them.
              </p>
            </div>
            <Link to="/digital-library" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
              See everything <ArrowRight size={14} />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {(featured.length ? featured : Array.from({ length: 3 }) as any[]).map((b: NewBook | undefined, i) => (
              b ? (
                <Link key={b.id} to={browse('books', b.title)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-rule bg-ground transition-shadow hover:shadow-lg">
                  <Cover book={b} className="h-52 w-full" />
                  <div className="flex flex-1 flex-col p-5">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">
                      {added(b.createdAt) || 'Book'}{b.domain ? ` · ${b.domain}` : ''}
                    </p>
                    <h3 className="mt-2 line-clamp-2 font-serif text-[19px] font-medium leading-tight text-ink group-hover:text-accent">
                      {b.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">
                      {[b.authors, b.publisherName].filter(Boolean).join(' · ') || 'Open-access book'}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
                      View details <ArrowRight size={13} />
                    </span>
                  </div>
                </Link>
              ) : <div key={i} className="h-80 animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-rule bg-ground">
            <p className={`${LABEL} border-b border-rule px-5 py-3`}>Newest articles</p>
            <ul className="divide-y divide-rule">
              {(articles.length ? articles.slice(0, 5) : Array.from({ length: 5 }) as any[]).map((a: NewArticle | undefined, i) => (
                <li key={a?.id || i} className="px-5 py-3.5">
                  {a ? (
                    <Link to={browse('articles', a.title)} className="group flex items-baseline justify-between gap-4">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] text-ink-2 group-hover:text-accent">{a.title}</span>
                        <span className="block truncate font-mono text-[11px] text-faint">
                          {[a.journalName, a.domain].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-faint">{added(a.createdAt)}</span>
                    </Link>
                  ) : <div className="h-9 animate-pulse rounded bg-surface-2" />}
                </li>
              ))}
            </ul>
          </div>
        </div>
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
            note={years.length ? `${years[years.length - 1].year} counts the year so far.` : undefined}>
            {years.length
              ? <Columns unit="articles" data={years.map(y => ({ label: String(y.year), value: y.n }))} />
              : <ChartSkeleton h={200} />}
          </ChartCard>
          <ChartCard label="Subjects" title="Largest subjects by articles">
            {subjects.length
              ? <Bars rows={subjects.slice(0, 7).map(x => ({ name: x.name, value: x.articles }))} unit="articles" />
              : <ChartSkeleton h={200} />}
          </ChartCard>
        </div>
      </section>

      {/* ── From search to reading ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className={LABEL}>How reading works</p>
            <h2 className="mt-3 font-serif text-[32px] font-medium leading-tight text-ink">
              From a search box to the page you stopped on.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              No request forms, no waiting for a login to be approved, no PDF sent by email. A reader
              signs in and the library is open.
            </p>
            <ol className="mt-8 space-y-6">
              {[
                ['Search or browse', `One box over ${stats ? n(stats.total) : 'every'} items, or walk down from department to journal, volume and issue.`],
                ['Open it where it lives', 'Whatever the licence allows opens in the reader here, page by page. The rest links to the publisher.'],
                ['Come back to it', 'Your history is kept, the reader remembers the page, and the dashboard suggests what to read next.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent font-mono text-[13px] text-accent">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-ink">{title}</span>
                    <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* The product, drawn rather than photographed: the reader's own
              furniture, with this library's real figures in it. */}
          <div className="overflow-hidden rounded-2xl border border-rule bg-ink p-5 shadow-xl">
            <div className="flex items-center gap-2 pb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-surface/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-surface/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-surface/25" />
              <span className="ml-2 font-mono text-[10.5px] text-surface/50">the reader</span>
            </div>
            <div className="rounded-xl bg-surface p-4">
              <div className="flex items-center gap-2 rounded-lg border border-rule bg-ground px-3 py-2">
                <Search size={14} className="text-faint" />
                <span className="font-mono text-[11.5px] text-faint">Search the library…</span>
              </div>
              {/* What the reader has to search across, not the results of any
                  one search — a figure standing in for a result count would be
                  the one invented number on the page. */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ['Departments', depts.length || undefined],
                  ['Subjects', subjects.length || undefined],
                  ['Articles', stats?.articles],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-rule bg-ground px-3 py-2">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-faint">{label}</p>
                    <p className="mt-0.5 font-mono text-[13px] text-ink"><Figure value={value as number | undefined} /></p>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[9px] uppercase tracking-wider text-faint">Newest in the library</p>
              <ul className="mt-1.5 space-y-2">
                {(articles.slice(0, 3).length ? articles.slice(0, 3) : Array.from({ length: 3 }) as any[]).map((a: NewArticle | undefined, i) => (
                  <li key={a?.id || i} className="rounded-lg border border-rule bg-ground px-3 py-2.5">
                    {a ? (
                      <>
                        <p className="line-clamp-1 text-[12.5px] text-ink-2">{a.title}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-faint">{[a.journalName, a.domain].filter(Boolean).join(' · ')}</p>
                      </>
                    ) : <div className="h-7 animate-pulse rounded bg-surface-2" />}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2">
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-accent">Resume reading</span>
                <span className="font-mono text-[10.5px] text-accent">page 7 of 14</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-4">
              {[
                ['In-app', 'No download needed'],
                ['Kept', 'History and place'],
                ['Cited', 'DOI on every record'],
                ['Open', span ? `Covers ${span}` : 'Recent work'],
              ].map(([t, s]) => (
                <div key={t}>
                  <p className="text-[12.5px] font-semibold text-surface">{t}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-surface/60">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Who we serve ─────────────────────────────────────────────────── */}
      <section className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className={LABEL}>Who it is for</p>
          <h2 className="mt-3 max-w-2xl font-serif text-[32px] font-medium leading-tight text-ink">
            One library, four ways in.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Audience icon={GraduationCap} who="Students" to="/for-students"
              blurb="Everything the department holds, from the first year onwards."
              points={['Search the whole library from one box', 'Read in the browser, nothing to install', 'Added by your librarian on Pro']} />
            <Audience icon={UserSquare2} who="Faculty & researchers" to="/for-students"
              blurb="Browse the way you would walk a shelf, and pick up where you stopped."
              points={[`Search ${stats ? n(stats.total) : 'the whole'} items`, 'Department, journal, volume, issue', 'History kept, with suggestions']} />
            <Audience icon={Library} who="Librarians" to="/for-institutions"
              blurb="Run access for the whole institution from one screen."
              points={['Add faculty and researchers yourself', 'See reading by week and subject', 'Find the searches that came back empty']} />
            <Audience icon={Building2} who="Institutions" to="/for-institutions"
              blurb="Free to start, and Pro when the sessions get in the way."
              points={['Free: the whole library, in half-hour sessions', 'Pro: no session limit for anyone you add', 'Pro: students added, in agreed numbers']} />
          </div>
        </div>
      </section>

      {/* ── Where the collection is deep ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
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
        <div className="mt-8 rounded-2xl border border-rule bg-surface p-6">
          {depts.length
            ? <Collection rows={depts} />
            : <div className="space-y-4">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-7 animate-pulse rounded bg-surface-2" />)}</div>}
        </div>
      </section>

      {/* ── Where it comes from ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <p className={LABEL}>Where the collection comes from</p>
        <h2 className="mt-3 mb-8 max-w-2xl font-serif text-[32px] font-medium leading-tight text-ink">
          Open scholarship, with its paperwork.
        </h2>
        <Provenance publishers={publishers} />
      </section>

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
