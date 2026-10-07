import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, Lock, Search } from 'lucide-react';
import { Badge, Skeleton, buttonClass } from '../ui';

/**
 * A department, as a shelf of journals.
 *
 * A college asks how many journals you hold in their subject before it asks
 * anything else, so this page answers that first: the count, the years covered,
 * and then the journals themselves ordered by how much of each we actually
 * hold. The department existed only as a marketing landing page until now —
 * clicking "Nursing" in a breadcrumb told a reader nothing about the shelf.
 */

type Journal = {
  id: string; title: string; issn?: string | null; publisherName?: string | null;
  licence?: string | null; licenceIsNC?: boolean | null;
  articleCount: number; volumeCount: number; issueCount: number;
  firstYear?: number | null; lastYear?: number | null;
};

type Department = {
  domain: string; slug: string;
  journals: Journal[];
  articles: number; books: number;
  firstYear?: number | null; lastYear?: number | null;
  publishers: { name: string; journals: number }[];
};

const auth = (): Record<string, string> | undefined => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : undefined;
};

// Parts of a record line, with a separator drawn only between two parts that are
// present — a missing ISSN never leaves a dot hanging at the start of the line.
const META = "tnum mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted [&>*+*]:before:mr-2 [&>*+*]:before:inline-block [&>*+*]:before:text-rule-2 [&>*+*]:before:content-['·']";
const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-muted';

export function DepartmentPage({
  journalBase = '/dashboard/journal',
  browseBase = '/dashboard/library',
}: { journalBase?: string; browseBase?: string } = {}) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [d, setD] = useState<Department | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'denied'>('loading');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!slug) return;
    setState('loading');
    fetch(`/api/library/department/${encodeURIComponent(slug)}`, { headers: auth() })
      .then(async r => {
        if (r.status === 403) { setState('denied'); return; }
        if (!r.ok) { setState('missing'); return; }
        setD(await r.json());
        setState('ok');
      })
      .catch(() => setState('missing'));
  }, [slug]);

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-5 py-9" role="status" aria-label="Loading department">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="mt-6 h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Lock className="mx-auto mb-4 text-muted" size={32} aria-hidden="true" />
        <h1 className="font-serif text-xl font-medium text-ink">Not in your subscription</h1>
        <p className="mt-2 text-sm text-muted">Your account does not cover this department.</p>
        <Link to="/contact" className={buttonClass('primary', 'md', 'mt-6')}>
          Request access
        </Link>
      </div>
    );
  }

  if (state === 'missing' || !d) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Helmet><meta name="robots" content="noindex, follow" /></Helmet>
        <h1 className="font-serif text-xl font-medium text-ink">Department not found</h1>
        <p className="mt-2 text-sm text-muted">We hold no journals under that name.</p>
        <button type="button" onClick={() => navigate(-1)} className={buttonClass('outline', 'md', 'mt-6')}>
          Go back
        </button>
      </div>
    );
  }

  const shown = q
    ? d.journals.filter(j =>
        j.title.toLowerCase().includes(q.toLowerCase()) ||
        (j.publisherName || '').toLowerCase().includes(q.toLowerCase()))
    : d.journals;

  return (
    <div className="min-h-full bg-ground">
      <Helmet>
        <title>{d.domain} | STM Digital Library</title>
        <meta name="description" content={`${d.journals.length} journals and ${d.articles.toLocaleString()} articles in ${d.domain}.`} />
      </Helmet>

      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-9">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span>Departments</span>
          </nav>

          <h1 className="font-serif text-[28px] font-medium tracking-tight text-ink sm:text-[36px]">
            {d.domain}
          </h1>

          {/* The question a college asks first */}
          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
            {([
              ['Journals', d.journals.length],
              ['Articles', d.articles],
              ...(d.books > 0 ? [['Books', d.books] as const] : []),
            ] as const).map(([label, n]) => (
              <div key={label}>
                <dt className={LABEL}>{label}</dt>
                <dd className="tnum mt-0.5 font-mono text-[22px] text-ink">{Number(n).toLocaleString()}</dd>
              </div>
            ))}
            {d.firstYear && d.lastYear && (
              <div>
                <dt className={LABEL}>Covering</dt>
                <dd className="tnum mt-0.5 font-mono text-[22px] text-ink">{d.firstYear}&ndash;{d.lastYear}</dd>
              </div>
            )}
          </dl>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to={`${browseBase}?domain=${encodeURIComponent(d.domain)}`}
              className={buttonClass('primary')}
            >
              Search this department
            </Link>
          </div>

          {d.publishers.length > 0 && (
            <div className="mt-8">
              <h2 className={LABEL}>Publishers</h2>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
                {d.publishers.slice(0, 8).map(p => (
                  <li key={p.name} className="flex items-baseline gap-2 text-[13px]">
                    <span className="tnum font-mono text-[11.5px] text-muted">{p.journals}</span>
                    <span className="text-ink-2">{p.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={LABEL} aria-live="polite">
            Journals held {q && <span className="normal-case tracking-normal">&mdash; {shown.length} of {d.journals.length}</span>}
          </h2>
          <div className="relative w-full sm:w-64">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label="Filter journals in this department"
              placeholder="Filter journals…"
              className="input h-9 pl-9 text-[13px]"
            />
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="mt-3 card p-10 text-center text-sm text-muted">
            No journal matches that.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-rule overflow-hidden card">
            {shown.map((j, i) => (
              <div key={j.id} className="flex gap-4 px-4 py-4 sm:px-5">
                <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-[11px] text-faint sm:block">{i + 1}</span>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`${journalBase}/${encodeURIComponent(j.issn || j.id)}`}
                    className="block font-serif text-[16.5px] font-medium leading-snug text-ink hover:text-accent"
                  >
                    {j.title}
                  </Link>
                  <p className={META}>
                    {j.publisherName && <span className="text-ink-2">{j.publisherName}</span>}
                    {j.issn && <span>ISSN {j.issn}</span>}
                    {j.firstYear && j.lastYear && <span>{j.firstYear}–{j.lastYear}</span>}
                  </p>
                  {j.licence && (
                    <Badge tone={j.licenceIsNC ? 'caution' : 'accent'} className="mt-2">{j.licence}{j.licenceIsNC && ' · non-commercial'}</Badge>
                  )}
                  <p className="tnum mt-2 font-mono text-[11.5px] text-muted sm:hidden">
                    {typeof j.articleCount === 'number' ? j.articleCount.toLocaleString() : '—'} articles · {typeof j.volumeCount === 'number' ? j.volumeCount.toLocaleString() : '—'} volumes · {typeof j.issueCount === 'number' ? j.issueCount.toLocaleString() : '—'} issues
                  </p>
                </div>

                {/* What we hold of it — the reason a shelf is worth anything */}
                <dl className="hidden shrink-0 gap-6 text-right sm:flex" aria-label="Holdings">
                  {([['Articles', j.articleCount], ['Volumes', j.volumeCount], ['Issues', j.issueCount]] as const).map(([label, n]) => (
                    <div key={label}>
                      <dt className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</dt>
                      <dd className="tnum mt-0.5 font-mono text-[14px] text-ink-2">{typeof n === 'number' ? n.toLocaleString() : '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
