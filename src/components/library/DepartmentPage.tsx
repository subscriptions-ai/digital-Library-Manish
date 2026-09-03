import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, Loader2, Lock, Search } from 'lucide-react';

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

const LABEL = 'font-mono text-[10.5px] uppercase tracking-wider text-faint';

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
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-faint" size={26} />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Lock className="mx-auto mb-4 text-faint" size={32} />
        <h1 className="font-serif text-xl font-medium text-ink">Not in your subscription</h1>
        <p className="mt-2 text-sm text-muted">Your account does not cover this department.</p>
        <Link to="/contact" className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:bg-accent-hover">
          Request access
        </Link>
      </div>
    );
  }

  if (state === 'missing' || !d) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Department not found</h1>
        <p className="mt-2 text-sm text-muted">We hold no journals under that name.</p>
        <button onClick={() => navigate(-1)} className="mt-6 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
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
          <nav className="mb-5 flex items-center gap-1.5 font-mono text-[11px] text-faint">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            <ChevronRight size={11} />
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
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:bg-accent-hover"
            >
              Search this department
            </Link>
          </div>

          {d.publishers.length > 0 && (
            <div className="mt-8">
              <p className={LABEL}>Publishers</p>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
                {d.publishers.slice(0, 8).map(p => (
                  <li key={p.name} className="flex items-baseline gap-2 text-[13px]">
                    <span className="tnum font-mono text-[11.5px] text-faint">{p.journals}</span>
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
          <p className={LABEL}>
            Journals held {q && <span className="normal-case tracking-normal">&mdash; {shown.length} of {d.journals.length}</span>}
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter journals…"
              className="w-56 rounded-md border border-rule bg-surface py-1.5 pl-8 pr-3 text-[13px] outline-none transition-colors focus:border-accent"
            />
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="mt-3 rounded-md border border-rule bg-surface p-10 text-center text-sm text-muted">
            No journal matches that.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-rule overflow-hidden rounded-md border border-rule bg-surface">
            {shown.map((j, i) => (
              <div key={j.id} className="flex gap-4 px-5 py-4">
                <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-[11px] text-faint sm:block">{i + 1}</span>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`${journalBase}/${encodeURIComponent(j.issn || j.id)}`}
                    className="block font-serif text-[16.5px] font-medium leading-snug text-ink hover:text-accent"
                  >
                    {j.title}
                  </Link>
                  <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted">
                    {j.publisherName && <span className="text-ink-2">{j.publisherName}</span>}
                    {j.issn && <><span className="text-rule-2">·</span><span>ISSN {j.issn}</span></>}
                    {j.firstYear && j.lastYear && <><span className="text-rule-2">·</span><span>{j.firstYear}–{j.lastYear}</span></>}
                  </p>
                  {j.licence && (
                    <span className={`mt-2 inline-block rounded-[3px] border px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide ${
                      j.licenceIsNC ? 'border-caution bg-caution-soft text-caution' : 'border-accent bg-accent-soft text-accent'}`}>
                      {j.licence}
                    </span>
                  )}
                </div>

                {/* What we hold of it — the reason a shelf is worth anything */}
                <dl className="hidden shrink-0 gap-6 text-right sm:flex">
                  {([['Articles', j.articleCount], ['Volumes', j.volumeCount], ['Issues', j.issueCount]] as const).map(([label, n]) => (
                    <div key={label}>
                      <dt className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</dt>
                      <dd className="tnum mt-0.5 font-mono text-[14px] text-ink-2">{Number(n ?? 0).toLocaleString()}</dd>
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
