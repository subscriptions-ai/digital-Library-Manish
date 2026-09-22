import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, BookMarked, BookOpen, Building2, ChevronDown, ChevronLeft, ChevronRight,
  FileText, GraduationCap, Layers, Library, Minus, Pause, Play, RefreshCw, Search,
  ShieldCheck, Users, UserSquare2,
} from 'lucide-react';
import { type DeptRow } from './charts';

/**
 * A second draft of the home page, at /home-preview.
 *
 * The shape is a reference the user chose — a hero that slides, a card of ways
 * in laid over it, a strip of names, a band of figures, a department explorer,
 * what is new, a walkthrough, who it is for, who is with us, questions, and a
 * closing band. It borrows that page's furniture and its type (Sora over
 * Inter), and nothing else.
 *
 * What fills it is ours and only ours. Every figure is read from the catalogue
 * as the page loads. Publishers are deliberately absent: where the reference
 * names its partners, this names the institutions whose people actually read
 * here, which is the fact a college wants from a library.
 */

type Stats = {
  total: number; articles: number; books: number; authors: number;
  departmentTotals: DeptRow[];
};
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
type Institutions = {
  total: number; members: number; organisations: number; states: number;
  byKind: Record<string, number>;
  institutions: { name: string; kind: string; members: number }[];
  designations: { name: string; members: number }[];
};
/** Universities first, then the rest, and inside each the busiest first. */
const KIND_ORDER = ['University', 'College', 'Institute', 'School', 'Organisation'];
const byKindThenSize = (a: { kind: string; members: number; name: string },
                        b: { kind: string; members: number; name: string }) => {
  const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
  return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb) || b.members - a.members || a.name.localeCompare(b.name);
};

type Department = {
  domain: string; slug: string; articles: number; books: number; authors: number;
  firstYear: number | null; lastYear: number | null;
  journals: { id: string; title: string; publisherName: string | null; articleCount: number }[];
  publishers: { name: string; journals: number }[];
};

const n = (x?: number) => (typeof x === 'number' ? x.toLocaleString('en-IN') : '—');
/** "University" → "Universities", "School" → "Schools". */
const plural = (word: string, count: number) =>
  count === 1 ? word : /y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
const named = (t?: string) => Boolean(t && t.trim() && t.trim().toLowerCase() !== 'untitled');

/**
 * Where a title on this page leads: its own record, which anybody can open.
 *
 * Everything used to point at the browse screen with a search on it, so three
 * different clicks landed on the same list — which is no navigation at all.
 */
const record = (kind: 'article' | 'book', id: string) => `/${kind}/${id}`;

const added = (iso?: string) => {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < 14) return `Added ${days} days ago`;
  return `Added ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
};

function useLibrary() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [articles, setArticles] = useState<NewArticle[]>([]);
  const [books, setBooks] = useState<NewBook[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [institutions, setInstitutions] = useState<Institutions | null>(null);

  useEffect(() => {
    const get = (u: string) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    get('/api/library/stats').then(d => d && setStats(d));
    get('/api/library/articles?limit=12&sort=newest').then(d => d?.data && setArticles(d.data.filter((a: NewArticle) => named(a.title))));
    get('/api/library/books?limit=36&sort=newest').then(d => d?.data && setBooks(d.data));
    get('/api/library/insights').then(d => d?.composition && setInsights(d));
    get('/api/library/subjects').then(d => Array.isArray(d) && setSubjects(d));
    get('/api/library/institutions').then(d => d?.total !== undefined && setInstitutions(d));
  }, []);

  return { stats, articles, books, insights, subjects, institutions };
}

// ── The furniture the reference is built from ───────────────────────────────

/** The small uppercase line over every heading, with its amber dot. */
function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
      onDark ? 'bg-white/10 text-white/80' : 'bg-[color:var(--np-soft)] text-[color:var(--np-body)]'}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--np-amber)' }} />
      {children}
    </p>
  );
}

function Heading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`np-display mt-4 text-[30px] leading-[1.15] sm:text-[38px] ${className}`}
      style={{ color: 'var(--np-ink)' }}>{children}</h2>
  );
}

/** A figure still loading shows a quiet bar, never a made-up number. */
function Figure({ value, className = '' }: { value?: number; className?: string }) {
  if (typeof value !== 'number') {
    return <span className={`inline-block h-[0.75em] w-20 animate-pulse rounded bg-[color:var(--np-soft)] align-middle ${className}`} />;
  }
  return <span className={className}>{n(value)}</span>;
}

const btnPrimary = 'inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90';
const btnGhost = 'inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-[14px] font-bold transition-colors';

/**
 * The hero's picture: photographs, one to a slide.
 *
 * Five of them, CC0 and kept in the repository at 1280×720 and about 100 KB
 * each, so there is no third party to wait for and nothing to go missing.
 * They cross-fade with the slide rather than cutting, and the one for the next
 * slide is already in the page, so the fade never shows a gap.
 *
 * Two drawn attempts came before this — a wall of covers, then an illustration
 * — and both read as filler. A photograph of somebody reading does not.
 */
const HERO_PHOTOS = [
  '/hero/library.jpg',
  '/hero/students.jpg',
  '/hero/research.jpg',
  '/hero/shelves.jpg',
  '/hero/reading-room.jpg',
];

function HeroPhotos({ slide }: { slide: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {HERO_PHOTOS.map((src, k) => (
        <div key={src}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
          style={{
            backgroundImage: `url(${src})`,
            opacity: k === slide % HERO_PHOTOS.length ? 1 : 0,
            // A slow drift, so a still photograph does not sit dead behind the words.
            transform: 'scale(1.06)',
          }} />
      ))}
      {/* Dark where the words are, clearer on the right, so the photograph is
          still a photograph and the headline is still readable. */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--np-navy) 96%, transparent) 0%, color-mix(in srgb, var(--np-navy) 88%, transparent) 38%, color-mix(in srgb, var(--np-navy) 62%, transparent) 70%, color-mix(in srgb, var(--np-navy) 52%, transparent) 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(0deg, color-mix(in srgb, var(--np-navy) 92%, transparent), transparent)' }} />
    </div>
  );
}

// ── 1. The hero, which slides ───────────────────────────────────────────────

/** The hero turns over this often — and keeps turning, cursor or no cursor. */
const SLIDE_MS = 3000;

type Slide = { key: string; eyebrow: string; lead: string; highlight: string; body: string; chips: string[] };

function buildSlides(stats: Stats | null, insights: Insights | null, inst: Institutions | null, depts: DeptRow[]): Slide[] {
  // Names rather than a tally: a list of colleges reads as a community, and a
  // small number reads as a small one.
  const someColleges = (inst?.institutions || []).slice(0, 3).map(x => x.name);
  const someRoles = (inst?.designations || []).slice(0, 3).map(x => x.name);
  const acc = insights?.access;
  const accTotal = acc ? acc.readHere + acc.atPublisher + acc.recordOnly : 0;
  const readPct = acc && accTotal ? Math.round((acc.readHere / accTotal) * 100) : undefined;
  const years = insights?.years || [];
  const thisYear = years[years.length - 1];

  return [
    {
      key: 'collection',
      eyebrow: 'STM Digital Library',
      lead: 'An academic library your whole institution can',
      highlight: 'open.',
      body: `${n(stats?.total)} items of research — ${n(stats?.articles)} articles and ${n(stats?.books)} books — catalogued by department, journal, volume and issue.`,
      chips: [`${n(stats?.total)} items`, `${depts.length || '—'} departments`, `${n(stats?.articles)} articles`],
    },
    {
      key: 'access',
      eyebrow: 'Where you read it',
      lead: 'Most of it opens right here, in the',
      highlight: 'browser.',
      body: `${readPct ?? '—'}% of the ${n(accTotal || undefined)} catalogued works open in the reader itself. The rest link to the publisher's own copy, and say so.`,
      chips: [`${readPct ?? '—'}% read here`, 'No download needed', 'Nothing to install'],
    },
    {
      key: 'institutions',
      eyebrow: 'Who is with us',
      lead: 'Colleges and universities already reading',
      highlight: 'here.',
      body: someColleges.length
        ? `${someColleges.join(', ')} — and others — have their faculty, researchers and students on the library.`
        : 'Colleges and universities have their faculty, researchers and students on the library.',
      chips: someColleges.length ? someColleges : ['Colleges', 'Universities', 'Institutes'],
    },
    {
      key: 'people',
      eyebrow: 'Who reads here',
      lead: 'Librarians, professors and researchers, in the same',
      highlight: 'library.',
      body: someRoles.length
        ? `${someRoles.join(', ')} and others read here — the whole department on one account, however many of them there are.`
        : 'Librarians, professors, research scholars and students read here — the whole department on one account.',
      chips: someRoles.length ? someRoles : ['Librarians', 'Professors', 'Researchers'],
    },
    {
      key: 'recency',
      eyebrow: 'How current it is',
      lead: 'Research published this year, already on the',
      highlight: 'shelf.',
      body: `${n(thisYear?.n)} articles published in ${thisYear?.year ?? 'this year'} are in the library. The collection leans recent, not archival.`,
      chips: [`${n(thisYear?.n)} from ${thisYear?.year ?? ''}`, 'Added every day', 'Recent, not archival'],
    },
    {
      key: 'free',
      eyebrow: 'What it costs',
      lead: 'Free to register, and the whole library is',
      highlight: 'yours.',
      body: 'Free membership reads the entire collection in half-hour sessions. Pro removes the clock, for you and for everyone your institution adds.',
      chips: ['Free to register', 'No request forms', 'Pro removes the clock'],
    },
  ];
}

function Hero({ stats, insights, institutions, depts }: {
  stats: Stats | null; insights: Insights | null; institutions: Institutions | null; depts: DeptRow[];
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
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

  const slides = buildSlides(stats, insights, institutions, depts);
  const count = slides.length;
  const go = useCallback((to: number) => setI(((to % count) + count) % count), [count]);
  // Hovering no longer stops it: a reader moving the mouse across the hero
  // was freezing the thing they had come to watch.
  const running = !paused && !reduced;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(i + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, running, go]);

  const s = slides[i];

  return (
    <section
      role="region" aria-roledescription="carousel" aria-label="What the library is"
      onKeyDown={e => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
        touch.current = null;
      }}
      className="relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--np-navy) 0%, var(--np-navy-2) 55%, #1b2f63 100%)' }}
    >
      <HeroPhotos slide={i} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(900px 420px at 15% 0%, rgba(245,179,1,0.10), transparent 60%), radial-gradient(700px 400px at 85% 100%, rgba(99,102,241,0.18), transparent 60%)' }} />

      <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 sm:pb-14 sm:pt-20">
        <div className="min-h-[330px] max-w-2xl" aria-live={running ? 'off' : 'polite'}>
          <Eyebrow onDark>{s.eyebrow}</Eyebrow>
          <h1 className="np-display mt-5 max-w-[620px] text-[38px] leading-[1.08] text-white sm:text-[50px]">
            {s.lead}{' '}
            <span style={{ color: 'var(--np-amber)' }}>{s.highlight}</span>
          </h1>
          <p className="mt-5 max-w-[620px] text-[16px] leading-relaxed text-white/75">{s.body}</p>

          <div className="mt-6 flex max-w-[620px] flex-wrap gap-2">
            {s.chips.map(c => (
              <span key={c} className="rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-[12.5px] font-semibold text-white/85">
                {c}
              </span>
            ))}
          </div>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}
          className="mt-8 flex max-w-xl items-center gap-2 rounded-2xl bg-white p-1.5 shadow-2xl"
        >
          <Search size={18} className="ml-3 shrink-0 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search articles, books, journals, authors…"
            className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[14.5px] text-slate-900 outline-none placeholder:text-slate-400" />
          <button type="submit" className={btnPrimary} style={{ background: 'var(--np-navy)' }}>Search</button>
        </form>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link to="/signup" className={btnPrimary} style={{ background: 'var(--np-amber)', color: '#1a1200' }}>
            Register free <ArrowRight size={16} />
          </Link>
          <Link to="/digital-library" className={`${btnGhost} border-white/25 text-white hover:bg-white/10`}>
            Explore the library
          </Link>
        </div>

        {/* The run of slides, counted the way the reference counts it */}
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <span className="np-display text-[20px] text-white">{String(i + 1).padStart(2, '0')}</span>
          <span className="text-[12px] text-white/50">/ {String(count).padStart(2, '0')}</span>
          <div className="h-[3px] w-40 overflow-hidden rounded-full bg-white/20">
            <div key={`${i}-${running}`}
              className={`h-full origin-left rounded-full ${running ? 'slider-progress' : ''}`}
              style={{ background: 'var(--np-amber)', animationDuration: `${SLIDE_MS}ms`, transform: running ? undefined : 'scaleX(1)' }} />
          </div>
          <div className="flex items-center gap-1.5">
            {slides.map((sl, k) => (
              <button key={sl.key} type="button" onClick={() => go(k)} aria-label={`Slide ${k + 1}: ${sl.eyebrow}`}
                aria-current={k === i}
                className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60'}`} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play' : 'Pause'}
              className="rounded-lg border border-white/20 p-2 text-white/80 hover:bg-white/10">
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button type="button" onClick={() => go(i - 1)} aria-label="Previous slide"
              className="rounded-lg border border-white/20 p-2 text-white/80 hover:bg-white/10"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => go(i + 1)} aria-label="Next slide"
              className="rounded-lg border border-white/20 p-2 text-white/80 hover:bg-white/10"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 2. Who is with us, walking past ─────────────────────────────────────────

function InstitutionStrip({ inst }: { inst: Institutions | null }) {
  const list = inst?.institutions || [];
  if (!list.length) return null;
  const row = list.length < 8 ? [...list, ...list, ...list] : list;
  return (
    <section className="border-y py-7" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
      <div className="mx-auto mb-4 max-w-6xl px-5">
        <p className="text-[12.5px]" style={{ color: 'var(--np-body)' }}>
          <b className="np-strong" style={{ color: 'var(--np-ink)' }}>Colleges and universities</b> whose faculty,
          researchers and students read here.
        </p>
      </div>
      <div className="marquee relative overflow-hidden">
        {/* The animation crosses half the track in one turn, so a fixed duration
            means the strip races as institutions are added — at 141 of them it
            was a blur. Held to about one chip every four seconds instead. */}
        <div className="marquee-track flex w-max gap-3"
          style={{ animationDuration: `${Math.max(40, row.length * 4)}s` }}>
          {row.concat(row).map((x, k) => (
            <span key={`${x.name}-${k}`}
              className="inline-flex shrink-0 items-center gap-2.5 rounded-full border bg-surface px-4 py-2 text-[13px]"
              style={{ borderColor: 'var(--np-line)', color: 'var(--np-ink)' }}>
              <Building2 size={13} style={{ color: 'var(--np-amber)' }} />
              {x.name}
              <span className="text-[11px]" style={{ color: 'var(--np-body)' }}>{x.kind}</span>
            </span>
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16"
          style={{ background: 'linear-gradient(90deg, var(--np-soft), transparent)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16"
          style={{ background: 'linear-gradient(270deg, var(--np-soft), transparent)' }} />
      </div>
    </section>
  );
}

// ── 3. The figures ──────────────────────────────────────────────────────────

function Impact({ stats, depts, inst }: { stats: Stats | null; depts: DeptRow[]; inst: Institutions | null }) {
  const cards = [
    { icon: Library, value: stats?.total, label: 'Items of content', hint: 'Articles, books and archived material', tone: 1 },
    { icon: FileText, value: stats?.articles, label: 'Research articles', hint: 'Each in its journal, volume and issue', tone: 3 },
    { icon: BookOpen, value: stats?.books, label: 'Books', hint: 'Monographs, textbooks and edited volumes', tone: 2 },
    { icon: Layers, value: depts.length || undefined, label: 'Departments', hint: 'Every subject the library covers', tone: 6 },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <Eyebrow>Built for trust</Eyebrow>
      <Heading className="max-w-3xl">Every figure here is read from the catalogue as the page loads.</Heading>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border bg-surface p-6" style={{ borderColor: 'var(--np-line)' }}>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `var(--t${c.tone}-bg)`, color: `var(--t${c.tone}-ink)` }}>
              <c.icon size={21} />
            </span>
            <p className="np-display mt-5 text-[32px] leading-none" style={{ color: 'var(--np-ink)' }}>
              <Figure value={c.value} />
            </p>
            <p className="np-strong mt-2 text-[14px]" style={{ color: 'var(--np-ink)' }}>{c.label}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--np-body)' }}>{c.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 4. Who is with us, in full ─────────────────────────────────────────────

const WITH_US_SHOWN = 18;

function WithUs({ inst }: { inst: Institutions | null }) {
  // Universities lead, and the page opens on them: they are what a visitor
  // asking "who else is on this" is looking for.
  const [chosen, setChosen] = useState<string | null>(null);
  if (!inst?.institutions?.length) return null;
  const kind = chosen ?? (inst.byKind?.University ? 'University' : 'All');
  const setKind = setChosen;
  const kinds = [...KIND_ORDER.filter(k => inst.byKind?.[k]),
    ...Object.keys(inst.byKind || {}).filter(k => !KIND_ORDER.includes(k)), 'All'];
  const all = [...inst.institutions].sort(byKindThenSize);
  const matching = kind === 'All' ? all : all.filter(i => i.kind === kind);
  const shown = matching.slice(0, WITH_US_SHOWN);
  const rest = matching.length - shown.length;
  const roles = inst.designations || [];

  return (
    <section className="mx-auto max-w-6xl border-t px-5 py-20" style={{ borderColor: 'var(--np-line)' }}>
      <Eyebrow>Who is with us</Eyebrow>
      <Heading className="max-w-3xl">
        The institutions whose people read here.
      </Heading>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--np-body)' }}>
        Colleges, universities and institutes have their faculty, researchers and students on the
        library — the whole department on one account, however many of them there are.
      </p>

      {/* Kind rather than count: how many is our business, who is theirs. */}
      <div className="mt-7 flex flex-wrap gap-2">
        {kinds.map(k => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className="np-strong rounded-full px-4 py-2 text-[12.5px] transition-colors"
            style={kind === k
              ? { background: 'var(--np-navy)', color: '#fff' }
              : { border: '1px solid var(--np-line)', color: 'var(--np-ink)' }}>
            {k === 'All' ? 'All of them' : plural(k, 2)}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-3"
        style={{ background: 'var(--np-line)', borderColor: 'var(--np-line)' }}>
        {shown.map(i => (
          <div key={i.name} className="flex items-center gap-3 bg-surface px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--t6-bg)', color: 'var(--t6-ink)' }}>
              <Building2 size={16} />
            </span>
            <span className="min-w-0">
              <span className="np-strong block truncate text-[13.5px]" style={{ color: 'var(--np-ink)' }}>{i.name}</span>
              <span className="block text-[11.5px]" style={{ color: 'var(--np-body)' }}>{i.kind}</span>
            </span>
          </div>
        ))}
        {/* As on the institutions page: no grey holes in a part-filled row. */}
        {Array.from({ length: (3 - shown.length % 3) % 3 }).map((_, f) => (
          <div key={`w${f}`} className="hidden bg-surface lg:block" />
        ))}
        {Array.from({ length: (2 - shown.length % 2) % 2 }).map((_, f) => (
          <div key={`n${f}`} className="hidden bg-surface sm:block lg:hidden" />
        ))}
      </div>

      {rest > 0 && (
        <Link to="/institutions" className={`${btnGhost} mt-6`}
          style={{ borderColor: 'var(--np-line)', color: 'var(--np-ink)' }}>
          See all {n(matching.length)} {kind === 'All' ? 'institutions' : plural(kind, 2).toLowerCase()}
          <ArrowRight size={15} />
        </Link>
      )}

      {/* And who, inside them, is actually reading. */}
      {roles.length > 0 && (
        <div className="mt-8 rounded-2xl border p-6" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--np-body)' }}>
            Who reads here
          </p>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed" style={{ color: 'var(--np-ink)' }}>
            The people on the library describe themselves as:
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {roles.map((r, k) => (
              <span key={r.name} className="np-strong inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px]"
                style={{ background: `var(--t${(k % 6) + 1}-bg)`, color: `var(--t${(k % 6) + 1}-ink)` }}>
                <Users size={13} /> {plural(r.name, 2)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── 5. The departments, as the reference shows its domains ──────────────────

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

  return (
    <section className="border-y py-20" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
      <div className="mx-auto max-w-6xl px-5">
        <Eyebrow>Core departments</Eyebrow>
        <Heading className="max-w-3xl">Explore the collection department by department.</Heading>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--np-body)' }}>
          Choose a department to see what it holds — how many articles and books, which journals carry
          the most, and how far back it reaches.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="max-h-[560px] overflow-y-auto rounded-2xl border bg-surface p-2" style={{ borderColor: 'var(--np-line)' }}>
            {(depts.length ? depts : Array.from({ length: 8 }) as any[]).map((x: DeptRow | undefined, k) => (
              x ? (
                <button key={x.name} type="button" onClick={() => setChosen(x.name)} aria-current={x.name === current}
                  className="block w-full rounded-xl px-3.5 py-3 text-left transition-colors"
                  style={x.name === current ? { background: 'var(--t1-bg)' } : undefined}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="np-strong truncate text-[13.5px]"
                      style={{ color: x.name === current ? 'var(--t1-ink)' : 'var(--np-ink)' }}>{x.name}</span>
                    <span className="shrink-0 text-[11.5px]" style={{ color: 'var(--np-body)' }}>{n(x.total)}</span>
                  </span>
                </button>
              ) : <div key={k} className="m-1 h-10 animate-pulse rounded-xl" style={{ background: 'var(--np-line)' }} />
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border bg-surface" style={{ borderColor: 'var(--np-line)' }}>
            <div className="px-6 py-7 text-white"
              style={{ background: 'linear-gradient(120deg, var(--np-navy) 0%, var(--np-navy-2) 70%, #23336b 100%)' }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Department</p>
              <h3 className="np-display mt-2 text-[30px] leading-tight text-white">{current || '—'}</h3>
              <p className="mt-2 text-[13.5px] text-white/70">
                {row ? <>{n(row.total)} items held</> : 'Reading the catalogue…'}
                {d?.firstYear ? <> · published {d.firstYear}–{d.lastYear}</> : null}
              </p>
            </div>

            <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: 'var(--np-line)' }}>
              {[
                // Not the number of journals: it is the smallest figure here and
                // the least of what a department actually amounts to.
                ['Articles', d?.articles], ['Books', d?.books],
                ['Authors', d?.authors], ['Publishers', d?.publishers.length],
              ].map(([label, value], k) => (
                <div key={label as string} className="border-r px-5 py-4 last:border-r-0" style={{ borderColor: 'var(--np-line)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--np-body)' }}>{label}</p>
                  <p className="np-display mt-1 text-[20px]" style={{ color: 'var(--np-ink)' }}>
                    {loading && !d ? <span className="inline-block h-4 w-12 animate-pulse rounded" style={{ background: 'var(--np-line)' }} /> : <Figure value={value as number | undefined} />}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--np-body)' }}>
                Journals with the most articles
              </p>
              <ul className="mt-3 divide-y" style={{ borderColor: 'var(--np-line)' }}>
                {(d?.journals.slice().sort((a, b) => b.articleCount - a.articleCount).slice(0, 5) || Array.from({ length: 4 }) as any[])
                  .map((j: any, k: number) => (
                    j ? (
                      <li key={j.id} className="flex items-baseline justify-between gap-4 border-t py-2.5 first:border-t-0"
                        style={{ borderColor: 'var(--np-line)' }}>
                        <span className="min-w-0 truncate text-[13.5px]" style={{ color: 'var(--np-ink)' }}>{j.title}</span>
                        <span className="shrink-0 text-[12px]" style={{ color: 'var(--np-body)' }}>{n(j.articleCount)}</span>
                      </li>
                    ) : <li key={k} className="py-3"><div className="h-5 animate-pulse rounded" style={{ background: 'var(--np-line)' }} /></li>
                  ))}
              </ul>
              {current && (
                <Link to={`/domain/${slug(current)}`} className={`${btnPrimary} mt-6`} style={{ background: 'var(--np-navy)' }}>
                  Explore {current} <ArrowRight size={15} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 6. How it is built ──────────────────────────────────────────────────────

const PRINCIPLES = [
  { icon: Layers, title: 'Structured like a library', tone: 1,
    body: 'Every article sits in its journal, volume and issue, under a department — so a reader can walk the shelf, not only search it.' },
  { icon: ShieldCheck, title: 'Checked before it is shelved', tone: 5,
    body: 'Nothing reaches the shelf unexamined: each title is checked, placed in its department, and recorded with the journal, volume and issue it came from.' },
  { icon: RefreshCw, title: 'Always growing', tone: 2,
    body: 'New titles arrive every day, each one catalogued and placed in its department on the way in — the shelf is never the same two weeks running.' },
  { icon: BookMarked, title: 'Picks up where you left off', tone: 6,
    body: 'The reader remembers the page you stopped on, keeps your history, and suggests what to open next in your departments.' },
];

function Principles() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <Eyebrow>How it is built</Eyebrow>
      <Heading className="max-w-3xl">Not a pile of PDFs. A catalogue, kept the way a library keeps one.</Heading>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map(p => (
          <div key={p.title} className="overflow-hidden rounded-2xl border bg-surface p-6" style={{ borderColor: 'var(--np-line)' }}>
            <span aria-hidden className="-mx-6 -mt-6 mb-6 block h-1" style={{ background: `var(--t${p.tone}-ink)` }} />
            <span className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: `var(--t${p.tone}-bg)`, color: `var(--t${p.tone}-ink)` }}>
              <p.icon size={19} />
            </span>
            <h3 className="np-strong mt-4 text-[15px]" style={{ color: 'var(--np-ink)' }}>{p.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'var(--np-body)' }}>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 7. What is new ──────────────────────────────────────────────────────────

function Cover({ book, tone, className = '' }: { book: NewBook; tone: number; className?: string }) {
  if (book.coverUrl) {
    return (
      <span className={`block ${className}`} style={{ background: `var(--t${tone}-bg)` }}>
        <img src={`/api/library/cover/${book.id}`} alt="" loading="lazy" decoding="async"
          className="h-full w-full object-cover"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      </span>
    );
  }
  return (
    <div className={`flex flex-col justify-between p-4 ${className}`} style={{ background: `var(--t${tone}-bg)`, color: `var(--t${tone}-ink)` }}>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{book.domain || 'Book'}</span>
      <span className="np-strong line-clamp-4 text-[15px] leading-tight">{book.title}</span>
    </div>
  );
}

function WhatIsNew({ books, articles }: { books: NewBook[]; articles: NewArticle[] }) {
  const withCovers = books.filter(b => b.coverUrl);
  const featured = (withCovers.length >= 3 ? withCovers : books).slice(0, 3);
  return (
    <section className="border-y py-20" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Just added</Eyebrow>
            <Heading>The shelves move every day.</Heading>
          </div>
          <Link to="/digital-library" className="np-strong inline-flex items-center gap-1.5 text-[13.5px]" style={{ color: 'var(--np-ink)' }}>
            See everything <ArrowRight size={14} />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {(featured.length ? featured : Array.from({ length: 3 }) as any[]).map((b: NewBook | undefined, k) => (
            b ? (
              <Link key={b.id} to={record('book', b.id)}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-surface transition-shadow hover:shadow-xl"
                style={{ borderColor: 'var(--np-line)' }}>
                <Cover book={b} tone={(k % 6) + 1} className="h-48 w-full" />
                <div className="flex flex-1 flex-col p-5">
                  <span className="w-fit rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ background: `var(--t${(k % 6) + 1}-bg)`, color: `var(--t${(k % 6) + 1}-ink)` }}>
                    {added(b.createdAt) || 'Book'}{b.domain ? ` · ${b.domain}` : ''}
                  </span>
                  <h3 className="np-strong mt-3 line-clamp-2 text-[17px] leading-tight" style={{ color: 'var(--np-ink)' }}>{b.title}</h3>
                  <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed" style={{ color: 'var(--np-body)' }}>
                    {[b.authors, b.publisherName].filter(Boolean).join(' · ') || 'Book'}
                  </p>
                  <span className="np-strong mt-4 inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--np-ink)' }}>
                    View details <ArrowRight size={13} />
                  </span>
                </div>
              </Link>
            ) : <div key={k} className="h-80 animate-pulse rounded-2xl" style={{ background: 'var(--np-line)' }} />
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border bg-surface" style={{ borderColor: 'var(--np-line)' }}>
          <p className="border-b px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ borderColor: 'var(--np-line)', color: 'var(--np-body)' }}>Newest articles</p>
          <ul>
            {(articles.length ? articles.slice(0, 5) : Array.from({ length: 5 }) as any[]).map((a: NewArticle | undefined, k) => (
              <li key={a?.id || k} className="border-b px-5 py-3.5 last:border-b-0" style={{ borderColor: 'var(--np-line)' }}>
                {a ? (
                  <Link to={record('article', a.id)} className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]" style={{ color: 'var(--np-ink)' }}>{a.title}</span>
                      <span className="block truncate text-[11.5px]" style={{ color: 'var(--np-body)' }}>
                        {[a.journalName, a.domain].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: 'var(--np-body)' }}>{added(a.createdAt)}</span>
                  </Link>
                ) : <div className="h-9 animate-pulse rounded" style={{ background: 'var(--np-line)' }} />}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── 8. How reading works ────────────────────────────────────────────────────

function Walkthrough({ stats, depts, subjects, articles }: {
  stats: Stats | null; depts: DeptRow[]; subjects: Subject[]; articles: NewArticle[];
}) {
  const steps = [
    ['Search or browse', `One box over ${stats ? n(stats.total) : 'every'} items, or walk down from department to journal, volume and issue.`],
    ['Open it where it lives', 'Most of it opens in the reader here, page by page, with nothing to download. The rest opens at the publisher.'],
    ['Come back to it', 'Your history is kept, the reader remembers the page, and the dashboard suggests what to read next.'],
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <div>
          <Eyebrow>How reading works</Eyebrow>
          <Heading>From a search box to the page you stopped on.</Heading>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--np-body)' }}>
            No request forms, no waiting for a login to be approved, no PDF sent by email. A reader
            signs in and the library is open.
          </p>
          <ol className="mt-8 space-y-6">
            {steps.map(([title, body], k) => (
              <li key={title} className="flex gap-4">
                <span className="np-strong flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px]"
                  style={{ background: 'var(--t2-bg)', color: 'var(--t2-ink)' }}>{k + 1}</span>
                <span>
                  <span className="np-strong block text-[15px]" style={{ color: 'var(--np-ink)' }}>{title}</span>
                  <span className="mt-1 block text-[13.5px] leading-relaxed" style={{ color: 'var(--np-body)' }}>{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="overflow-hidden rounded-2xl p-5 shadow-2xl"
          style={{ background: 'linear-gradient(140deg, var(--np-navy) 0%, #1b2f63 60%, var(--np-navy-2) 100%)' }}>
          <div className="flex items-center gap-2 pb-4">
            {[0, 1, 2].map(k => <span key={k} className="h-2.5 w-2.5 rounded-full bg-white/25" />)}
            <span className="ml-2 text-[10.5px] text-white/50">the reader</span>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--np-line)' }}>
              <Search size={14} style={{ color: 'var(--np-body)' }} />
              <span className="text-[11.5px]" style={{ color: 'var(--np-body)' }}>Search the library…</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[['Departments', depts.length || undefined], ['Subjects', subjects.length || undefined], ['Articles', stats?.articles]].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--np-line)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--np-body)' }}>{label}</p>
                  <p className="np-strong mt-0.5 text-[13px]" style={{ color: 'var(--np-ink)' }}><Figure value={value as number | undefined} /></p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--np-body)' }}>Newest in the library</p>
            <ul className="mt-1.5 space-y-2">
              {(articles.slice(0, 3).length ? articles.slice(0, 3) : Array.from({ length: 3 }) as any[]).map((a: NewArticle | undefined, k) => (
                <li key={a?.id || k} className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--np-line)' }}>
                  {a ? (
                    <>
                      <p className="line-clamp-1 text-[12.5px]" style={{ color: 'var(--np-ink)' }}>{a.title}</p>
                      <p className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--np-body)' }}>
                        {[a.journalName, a.domain].filter(Boolean).join(' · ')}
                      </p>
                    </>
                  ) : <div className="h-7 animate-pulse rounded" style={{ background: 'var(--np-line)' }} />}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: 'var(--t2-bg)', color: 'var(--t2-ink)' }}>
              <span className="text-[10.5px] font-bold uppercase tracking-wider">Resume reading</span>
              <span className="text-[10.5px]">page 7 of 14</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 9. Who it is for ────────────────────────────────────────────────────────

function Audiences({ stats }: { stats: Stats | null }) {
  const cards = [
    { icon: GraduationCap, who: 'Students', tone: 1, to: '/for-students',
      blurb: 'Everything the department holds, from the first year onwards.',
      points: ['Search the whole library from one box', 'Read in the browser, nothing to install', 'Added by your librarian on Pro'] },
    { icon: UserSquare2, who: 'Faculty & researchers', tone: 5, to: '/for-students',
      blurb: 'Browse the way you would walk a shelf, and pick up where you stopped.',
      points: [`Search ${stats ? n(stats.total) : 'the whole'} items`, 'Department, journal, volume, issue', 'History kept, with suggestions'] },
    { icon: Library, who: 'Librarians', tone: 2, to: '/for-institutions',
      blurb: 'Run access for the whole institution from one screen.',
      points: ['Add faculty and researchers yourself', 'See reading by week and subject', 'Find the searches that came back empty'] },
    { icon: Building2, who: 'Institutions', tone: 6, to: '/for-institutions',
      blurb: 'Free to start, and Pro when the sessions get in the way.',
      points: ['Free: the whole library, in half-hour sessions', 'Pro: no session limit for anyone you add', 'Pro: students added, in agreed numbers'] },
  ];
  return (
    <section className="border-y py-20" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
      <div className="mx-auto max-w-6xl px-5">
        <Eyebrow>Community</Eyebrow>
        <Heading className="max-w-3xl">One library, four ways in.</Heading>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(c => (
            <div key={c.who} className="flex flex-col rounded-2xl border bg-surface p-6" style={{ borderColor: 'var(--np-line)' }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `var(--t${c.tone}-bg)`, color: `var(--t${c.tone}-ink)` }}>
                <c.icon size={19} />
              </span>
              <h3 className="np-strong mt-4 text-[18px]" style={{ color: 'var(--np-ink)' }}>{c.who}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--np-body)' }}>{c.blurb}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {c.points.map(p => (
                  <li key={p} className="flex gap-2 text-[13px] leading-snug" style={{ color: 'var(--np-ink)' }}>
                    <ChevronRight size={14} className="mt-[2px] shrink-0" style={{ color: `var(--t${c.tone}-ink)` }} />{p}
                  </li>
                ))}
              </ul>
              <Link to={c.to} className="np-strong mt-5 inline-flex items-center gap-1.5 text-[13px]"
                style={{ color: `var(--t${c.tone}-ink)` }}>
                Learn more <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 10. Questions ───────────────────────────────────────────────────────────

const FAQS: [string, string][] = [
  ['Is it really free?',
    'Yes. A free membership reads the entire library — every subject and every kind of material — in half-hour sessions, four a day. Nothing is charged, and no card is asked for.'],
  ['What is the half-hour session?',
    'On free membership the library opens for thirty minutes at a time, four times a day, with two hours between sessions. The clock stops when you sign out, and whatever is left of a session is kept for your next visit. Pro removes the clock entirely.'],
  ['Why does some of it open elsewhere?',
    'Most of the library opens in the reader here, page by page. A small part is held as a catalogue record with a link to where the full text lives — and the page says so plainly, rather than letting you find out after a click.'],
  ['Can my college add its own people?',
    'Yes. A librarian adds faculty and researchers themselves, as many as they like, at no extra cost and without waiting for us to approve anyone. Students can be added on Pro.'],
  ['How current is the library?',
    'New work arrives every day and is catalogued the same way as the rest — department, journal, volume, issue. Most of what you will find was published in the last few years, and the oldest reaches back decades.'],
  ['What do you do with my reading history?',
    'It is used to show you where you stopped and to suggest what to open next, and your librarian sees reading by week and by subject for the institution. It is not sold, and it is not shared with publishers.'],
];

function Questions() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="border-y py-20" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
      <div className="mx-auto max-w-4xl px-5">
        <Eyebrow>Before you register</Eyebrow>
        <Heading>Common questions.</Heading>
        <div className="mt-10 overflow-hidden rounded-2xl border bg-surface" style={{ borderColor: 'var(--np-line)' }}>
          {FAQS.map(([q, a], k) => (
            <div key={q} className="border-b last:border-b-0" style={{ borderColor: 'var(--np-line)' }}>
              <button type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}
                className="flex w-full items-center gap-4 px-6 py-5 text-left">
                <span className="np-display text-[13px]" style={{ color: 'var(--np-amber)' }}>{String(k + 1).padStart(2, '0')}</span>
                <span className="np-strong flex-1 text-[15px]" style={{ color: 'var(--np-ink)' }}>{q}</span>
                <ChevronDown size={18} className={`shrink-0 transition-transform ${open === k ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--np-body)' }} />
              </button>
              {open === k && (
                <p className="px-6 pb-5 pl-[4.4rem] text-[14px] leading-relaxed" style={{ color: 'var(--np-body)' }}>{a}</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-5 text-[13px]" style={{ color: 'var(--np-body)' }}>
          Something else? <Link to="/faq" className="np-strong underline" style={{ color: 'var(--np-ink)' }}>All questions</Link>
          {' '}or <Link to="/contact" className="np-strong underline" style={{ color: 'var(--np-ink)' }}>ask us</Link>.
        </p>
      </div>
    </section>
  );
}

// ── 11. The closing band, and the notice ────────────────────────────────────

function Closing({ stats, inst }: { stats: Stats | null; inst: Institutions | null }) {
  return (
    <>
      <section className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--np-navy) 0%, var(--np-navy-2) 60%, #1b2f63 100%)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(700px 360px at 80% 0%, rgba(245,179,1,0.12), transparent 60%)' }} />
        <div className="relative mx-auto max-w-4xl px-5 py-20 text-center">
          <Eyebrow onDark>Your reading starts here</Eyebrow>
          <h2 className="np-display mx-auto mt-5 max-w-2xl text-[34px] leading-tight text-white sm:text-[42px]">
            Open the library for your institution.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15.5px] text-white/75">
            Join the colleges and universities already reading {n(stats?.total)} items — free to
            register, and open from the first minute.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup" className={btnPrimary} style={{ background: 'var(--np-amber)', color: '#1a1200' }}>
              Register free <ArrowRight size={16} />
            </Link>
            <Link to="/contact" className={`${btnGhost} border-white/25 text-white hover:bg-white/10`}>
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t py-8" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
        <div className="mx-auto max-w-6xl px-5">
          <p className="np-strong text-[13px]" style={{ color: 'var(--np-ink)' }}>A note on what is held here</p>
          <p className="mt-2 max-w-4xl text-[12.5px] leading-relaxed" style={{ color: 'var(--np-body)' }}>
            STM Digital Library catalogues scholarly work that is free to read, and serves it in
            line with the terms it was published under. Any rights holder who wants an item removed
            can ask, and it will be — see <Link to="/content-removal" className="underline">Content Removal</Link>.
          </p>
        </div>
      </section>
    </>
  );
}

// ── The page ────────────────────────────────────────────────────────────────

export function HomePreview() {
  const { stats, articles, books, insights, subjects, institutions } = useLibrary();
  const depts = stats?.departmentTotals || [];

  return (
    <div className="np bg-surface" style={{ color: 'var(--np-body)' }}>
      <Helmet>
        <title>STM Digital Library — research your institution can open</title>
      </Helmet>

      <Hero stats={stats} insights={insights} institutions={institutions} depts={depts} />
      <InstitutionStrip inst={institutions} />
      <Impact stats={stats} depts={depts} inst={institutions} />
      <WithUs inst={institutions} />
      <DepartmentExplorer depts={depts} />
      <Principles />
      <WhatIsNew books={books} articles={articles} />
      <Walkthrough stats={stats} depts={depts} subjects={subjects} articles={articles} />
      <Audiences stats={stats} />
      <Questions />
      <Closing stats={stats} inst={institutions} />
    </div>
  );
}
