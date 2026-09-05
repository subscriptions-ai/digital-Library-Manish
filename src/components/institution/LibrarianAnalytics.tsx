import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Loader2, Search, TrendingDown, TrendingUp } from 'lucide-react';

/**
 * What the librarian came to find out.
 *
 * Six panels in the order the questions are actually asked: is it being used,
 * who is not using it, how is that trending, what did they look for and not
 * find, what are they reading, and who reads most.
 *
 * Only one of these is a chart. Usage is four numbers, and a number is the right
 * form for a number; the rest are lists, because a librarian acts on a list of
 * names and cannot act on an average. The chart plots one measure — reads — and
 * active readers sits in the stat row rather than on a second axis, since two
 * scales on one chart is the mistake that makes every other reading of it wrong.
 */

const LABEL = 'font-mono text-[10.5px] uppercase tracking-wider text-faint';

type Data = {
  institution: { id: string; name: string };
  period: { days: number; from: string; to: string };
  usage: {
    students: number; activeStudents: number; previousActiveStudents: number;
    reads: number; previousReads: number; neverRead: number;
  };
  silent: { id: string; name: string; year: string | null; lastSeen: string | null; everRead: boolean }[];
  silentTotal: number;
  reading: {
    byDomain: { name: string; reads: number }[];
    byJournal: { issn: string; name: string; reads: number }[];
    topItems: { id: string; itemType: string; title: string; reads: number }[];
  };
  demand: { query: string; searches: number }[];
  trend: { week: string; reads: number; readers: number }[];
  trendBucket?: 'day' | 'week';
  topReaders: { id: string; name: string; reads: number }[];
};

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const n = (x: number) => Number(x || 0).toLocaleString();

/** A figure with the same figure from the period before it. */
function Stat({ label, value, prev, suffix }: { label: string; value: number; prev?: number; suffix?: string }) {
  const delta = prev === undefined ? null : value - prev;
  const up = (delta ?? 0) > 0;
  return (
    <div className="border-b border-rule p-4 sm:border-b-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="tnum mt-1.5 font-mono text-[26px] leading-none text-ink">
        {n(value)}{suffix && <span className="text-[15px] text-muted">{suffix}</span>}
      </dd>
      {delta !== null && delta !== 0 && (
        <p className={`tnum mt-1.5 flex items-center gap-1 font-mono text-[11px] ${up ? 'text-accent' : 'text-caution'}`}>
          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {up ? '+' : ''}{n(delta)} on the period before
        </p>
      )}
    </div>
  );
}

/**
 * Reads per week. One series, so no legend — the heading names it. The line is
 * 2px, the grid recessive, and only the highest point is labelled, because a
 * number on every point is noise rather than information.
 */
function Trend({ points }: { points: { week: string; reads: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 190, PAD = { t: 14, r: 14, b: 26, l: 44 };

  // The frame stays even when there is nothing in it. A chart that disappears
  // reads as broken; a chart with an axis and no line reads as waiting.
  const empty = points.length < 2;

  const max = Math.max(...points.map(p => p.reads), 1);
  const step = max <= 5 ? 1 : max <= 20 ? 5 : max <= 100 ? 25 : 50;
  const nice = Math.max(Math.ceil(max / step) * step, step);
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / nice) * (H - PAD.t - PAD.b);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.reads).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const peak = points.length ? points.reduce((a, b, i) => (b.reads > points[a].reads ? i : a), 0) : 0;
  const fmt = (w: string) => new Date(w).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={empty ? 'Reads over time, not enough data yet' : `Reads over time, peaking at ${points[peak].reads}`}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--rule)" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(nice * f) + 3.5} textAnchor="end"
              className="tnum" fill="var(--faint)" fontSize="10" fontFamily="var(--mono)">
              {n(Math.round(nice * f))}
            </text>
          </g>
        ))}

        {!empty && <>
          <path d={area} fill="var(--accent)" opacity="0.09" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Only the peak is labelled. */}
          <circle cx={x(peak)} cy={y(points[peak].reads)} r="4" fill="var(--accent)"
            stroke="var(--surface)" strokeWidth="2" />
          <text x={x(peak)} y={y(points[peak].reads) - 10} textAnchor="middle"
            className="tnum" fill="var(--ink-2)" fontSize="10.5" fontFamily="var(--mono)">
            {n(points[peak].reads)}
          </text>
        </>}

        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--faint)"
            fontSize="11.5" fontFamily="var(--mono)">
            {points.length === 1 ? 'One day of activity so far' : 'No reads in this period yet'}
          </text>
        )}

        {!empty && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--rule-2)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(points[hover].reads)} r="4.5" fill="var(--accent)"
              stroke="var(--surface)" strokeWidth="2" />
          </>
        )}

        {points.length > 0 && <>
          <text x={PAD.l} y={H - 8} className="tnum" fill="var(--faint)" fontSize="10" fontFamily="var(--mono)">
            {fmt(points[0].week)}
          </text>
          <text x={W - PAD.r} y={H - 8} textAnchor="end" className="tnum" fill="var(--faint)" fontSize="10" fontFamily="var(--mono)">
            {fmt(points[points.length - 1].week)}
          </text>
        </>}

        {/* Hit targets wider than the marks. */}
        {!empty && points.map((_, i) => (
          <rect key={i} x={x(i) - (W / points.length) / 2} y={0} width={W / points.length} height={H}
            fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>

      {!empty && hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border border-rule bg-surface px-3 py-1.5 shadow-sm">
          <p className="tnum font-mono text-[11px] text-ink">
            {fmt(points[hover].week)} · {n(points[hover].reads)} reads
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A ranked list. The bar is a comparison, and a comparison needs something to
 * compare — with one row, or with counts this small, a full-width bar says
 * "dominant" about a single read. Below that threshold the number stands alone.
 */
function Ranked({ rows, hrefOf }: { rows: { name: string; reads: number; key: string }[]; hrefOf?: (k: string) => string | null }) {
  const max = Math.max(...rows.map(r => r.reads), 1);
  const worthComparing = rows.length >= 3 && max >= 5;
  return (
    <ul className="divide-y divide-rule">
      {rows.map(r => {
        const href = hrefOf?.(r.key);
        return (
          <li key={r.key} className="px-5 py-2.5">
            <div className="flex items-baseline justify-between gap-4">
              {href
                ? <Link to={href} className="truncate text-[13.5px] text-ink-2 hover:text-accent hover:underline">{r.name}</Link>
                : <span className="truncate text-[13.5px] text-ink-2">{r.name}</span>}
              <span className="tnum shrink-0 font-mono text-[12px] text-muted">{n(r.reads)}</span>
            </div>
            {worthComparing && (
              <div className="mt-1.5 h-[3px] w-full rounded-full bg-surface-2">
                <div className="h-[3px] rounded-full bg-accent/70" style={{ width: `${Math.max((r.reads / max) * 100, 2)}%` }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Panel({ label, note, children, action }: {
  label: string; note?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-rule bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <div>
          <p className={LABEL}>{label}</p>
          {note && <p className="mt-0.5 text-[12px] text-muted">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LibrarianAnalytics({
  institutionId,
  journalBase = '/institution/journal',
  departmentBase = '/institution/department',
  articleBase = '/institution/article',
}: {
  institutionId?: string;
  journalBase?: string; departmentBase?: string; articleBase?: string;
} = {}) {
  // An administrator opens a particular institution's page with it named in the
  // URL; a librarian's own institution is resolved from their account and the
  // parameter is ignored for them by the endpoint.
  const [sp] = useSearchParams();
  const forInstitution = institutionId || sp.get('institutionId') || undefined;

  const [days, setDays] = useState(90);
  const [d, setD] = useState<Data | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    setState('loading');
    const q = new URLSearchParams({ days: String(days) });
    if (forInstitution) q.set('institutionId', forInstitution);
    fetch(`/api/analytics/institution?${q}`, { headers: auth() })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) { setError(j.error || 'Could not load analytics'); setState('error'); return; }
        setD(j); setState('ok');
      })
      .catch(() => { setError('Could not reach the server'); setState('error'); });
  }, [days, forInstitution]);

  // Everything on screen, as the rows behind it. A librarian who wants a pivot
  // table should get the data, not a picture of it.
  const download = () => {
    if (!d) return;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(`STM Digital Library — ${d.institution.name}`);
    lines.push(`Last ${d.period.days} days, generated ${new Date().toISOString().slice(0, 10)}`, '');
    lines.push('Measure,Value');
    lines.push(`Students,${d.usage.students}`, `Active students,${d.usage.activeStudents}`,
      `Reads,${d.usage.reads}`, `Never read,${d.usage.neverRead}`, '');
    lines.push('Searched for, not found,Searches');
    d.demand.forEach(m => lines.push(`${esc(m.query)},${m.searches}`));
    lines.push('', 'Department,Reads');
    d.reading.byDomain.forEach(x => lines.push(`${esc(x.name)},${x.reads}`));
    lines.push('', 'Journal,ISSN,Reads');
    d.reading.byJournal.forEach(x => lines.push(`${esc(x.name)},${esc(x.issn)},${x.reads}`));
    lines.push('', 'Week,Reads,Active readers');
    d.trend.forEach(t => lines.push(`${String(t.week).slice(0, 10)},${t.reads},${t.readers}`));
    // Names are left out on purpose; a file that leaves the building should not
    // carry a student's reading history by default.
    lines.push('', 'Student names are excluded from this export.');

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `analytics-${slug(d.institution.name)}-${d.period.days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const trend = useMemo(() => (d?.trend ?? []).map(t => ({ week: String(t.week), reads: t.reads })), [d]);

  if (state === 'loading') {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-faint" size={26} /></div>;
  }
  if (state === 'error' || !d) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Analytics unavailable</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }

  const u = d.usage;
  const quiet = u.students - u.activeStudents;

  return (
    <div className="min-h-full bg-ground">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-7">
          <p className={LABEL}>Usage</p>
          <h1 className="mt-1 font-serif text-[26px] font-medium tracking-tight text-ink sm:text-[31px]">
            {d.institution.name}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {[30, 90, 365].map(v => (
              <button key={v} onClick={() => setDays(v)}
                className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  days === v ? 'border-accent bg-accent-soft text-accent' : 'border-rule text-muted hover:border-accent hover:text-accent'}`}>
                {v === 365 ? 'This year' : `${v} days`}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={download}
              className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted hover:border-accent hover:text-accent">
              <Download size={12} /> CSV
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-5 py-7">

        {/* An institution that has barely started should be told so plainly.
            Panels built for hundreds of rows, each showing one, read as a
            broken page rather than an early one. */}
        {u.reads < 25 && (
          <div className="rounded-md border border-rule bg-surface p-5">
            <p className={LABEL}>Just getting started</p>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
              {u.reads === 0
                ? <>Nobody has opened anything in the last {d.period.days} days, so there is nothing to
                    measure yet.</>
                : <>Your students have opened {n(u.reads)} {u.reads === 1 ? 'item' : 'items'} in the
                    last {d.period.days} days. That is too little to draw a trend from or to rank
                    anything by, so the panels below are showing exactly what there is rather than
                    padding it out.</>}
            </p>
            <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
              They fill in on their own as students read. The one worth watching first is
              <b className="text-ink-2"> searched for, not found</b> — it tells you what to ask us
              to add, and it needs only a handful of students to start being useful.
            </p>
          </div>
        )}

        {/* 01 — the renewal question */}
        <dl className="grid grid-cols-2 divide-rule overflow-hidden rounded-md border border-rule bg-surface sm:grid-cols-4 sm:divide-x">
          <Stat label="Students" value={u.students} />
          <Stat label="Active this period" value={u.activeStudents} prev={u.previousActiveStudents} />
          <Stat label="Reads" value={u.reads} prev={u.previousReads} />
          <Stat label="Never opened it" value={u.neverRead} />
        </dl>

        {/* 02 — the one chart */}
        <Panel label="Reads per week" note={`${n(u.activeStudents)} students active across the period`}>
          <div className="px-5 py-5"><Trend points={trend} /></div>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 03 — the acquisition signal */}
          <Panel
            label="Searched for, not found"
            note="What your students looked for that we do not hold"
          >
            {d.demand.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">
                Nothing came back empty this period.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-rule">
                  {d.demand.map(m => (
                    <li key={m.query} className="flex items-baseline justify-between gap-4 px-5 py-2.5">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <Search size={11} className="shrink-0 translate-y-0.5 text-faint" />
                        <span className="truncate text-[13.5px] text-ink-2">{m.query}</span>
                      </span>
                      <span className="tnum shrink-0 font-mono text-[12px] text-muted">
                        {n(m.searches)} {m.searches === 1 ? 'search' : 'searches'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-rule px-5 py-3 text-[12.5px] leading-relaxed text-muted">
                  These are the subjects to ask us for next. Send this list and we will
                  point the collection at them.
                </p>
              </>
            )}
          </Panel>

          {/* 04 — who is not using it */}
          <Panel
            label="Has not opened it"
            note={`${n(quiet)} of ${n(u.students)} students, this period`}
          >
            {d.silent.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">Everyone has read something.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {d.silent.slice(0, 12).map(s => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4 px-5 py-2.5">
                    <span className="truncate text-[13.5px] text-ink-2">
                      {s.name}
                      {s.year && <span className="ml-2 font-mono text-[11px] text-faint">{s.year}</span>}
                    </span>
                    <span className="tnum shrink-0 font-mono text-[11px] text-faint">
                      {s.everRead && s.lastSeen
                        ? `last ${new Date(s.lastSeen).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                        : 'never signed in'}
                    </span>
                  </li>
                ))}
                {d.silentTotal > 12 && (
                  <li className="px-5 py-2.5 font-mono text-[11px] text-faint">
                    and {n(d.silentTotal - 12)} more
                  </li>
                )}
              </ul>
            )}
          </Panel>

          {/* 05 — what they read */}
          <Panel label="Departments read" note={d.reading.byDomain.length ? 'Each opens its shelf' : undefined}>
            {d.reading.byDomain.length === 0
              ? <p className="px-5 py-8 text-center text-[13px] text-muted">No reads recorded this period.</p>
              : <Ranked
              rows={d.reading.byDomain.map(x => ({ key: x.name, name: x.name, reads: x.reads }))}
              hrefOf={k => `${departmentBase}/${slug(k)}`}
            />}
          </Panel>

          <Panel label="Journals read" note="Each opens its run of volumes">
            {d.reading.byJournal.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">
                No reads carried a journal this period.
              </p>
            ) : (
              <Ranked
                rows={d.reading.byJournal.map(x => ({ key: x.issn, name: x.name, reads: x.reads }))}
                hrefOf={k => `${journalBase}/${encodeURIComponent(k)}`}
              />
            )}
          </Panel>

          <Panel label="Most read" note={d.reading.topItems.length ? 'The titles themselves' : undefined}>
            {d.reading.topItems.length === 0 && (
              <p className="px-5 py-8 text-center text-[13px] text-muted">Nothing has been opened yet.</p>
            )}
            <ul className="divide-y divide-rule">
              {d.reading.topItems.map((t, i) => (
                <li key={t.id} className="flex gap-3 px-5 py-3">
                  <span className="tnum w-5 shrink-0 pt-0.5 font-mono text-[11px] text-faint">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    {t.itemType === 'article'
                      ? <Link to={`${articleBase}/${t.id}`} className="block font-serif text-[14.5px] leading-snug text-ink hover:text-accent">{t.title}</Link>
                      : <span className="block font-serif text-[14.5px] leading-snug text-ink-2">{t.title}</span>}
                  </div>
                  <span className="tnum shrink-0 font-mono text-[12px] text-muted">{n(t.reads)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel label="Reads most" note={d.topReaders.length > 2 ? 'Your heaviest users this period' : undefined}>
            {d.topReaders.length === 0 && (
              <p className="px-5 py-8 text-center text-[13px] text-muted">No reader activity this period.</p>
            )}
            <ul className="divide-y divide-rule">
              {d.topReaders.map((r, i) => (
                <li key={r.id} className="flex items-baseline justify-between gap-4 px-5 py-2.5">
                  <span className="flex min-w-0 items-baseline gap-3">
                    <span className="tnum w-4 shrink-0 font-mono text-[11px] text-faint">{i + 1}</span>
                    <span className="truncate text-[13.5px] text-ink-2">{r.name}</span>
                  </span>
                  <span className="tnum shrink-0 font-mono text-[12px] text-muted">{n(r.reads)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
