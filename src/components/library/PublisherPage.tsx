import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight } from 'lucide-react';
import { Badge, Skeleton, buttonClass } from '../ui';

/**
 * A publisher, and the journals of theirs we hold.
 *
 * The publisher's name sits on every result row and every journal spine. It was
 * plain text everywhere, which is the one thing a name in this library is not
 * supposed to be. It is also the attribution the compliance policy asks us to
 * carry, so it earns a page of its own rather than a tooltip.
 */

type Journal = {
  id: string; title: string; issn?: string | null; domain?: string | null;
  licence?: string | null; licenceIsNC?: boolean | null;
  articleCount: number; volumeCount: number; issueCount: number;
  firstYear?: number | null; lastYear?: number | null;
};

type Publisher = {
  publisherName: string; slug: string;
  journals: Journal[];
  articles: number;
  firstYear?: number | null; lastYear?: number | null;
  departments: { name: string; journals: number }[];
};

const auth = (): Record<string, string> | undefined => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : undefined;
};

// Parts of a record line, with a separator drawn only between two parts that are
// present — a missing ISSN never leaves a dot hanging at the start of the line.
const META = "tnum mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted [&>*+*]:before:mr-2 [&>*+*]:before:inline-block [&>*+*]:before:text-rule-2 [&>*+*]:before:content-['·']";
const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-muted';
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function PublisherPage({
  journalBase = '/dashboard/journal',
  departmentBase = '/dashboard/department',
}: { journalBase?: string; departmentBase?: string } = {}) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<Publisher | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    if (!slug) return;
    setState('loading');
    fetch(`/api/library/publisher/${encodeURIComponent(slug)}`, { headers: auth() })
      .then(async r => {
        if (!r.ok) { setState('missing'); return; }
        setP(await r.json());
        setState('ok');
      })
      .catch(() => setState('missing'));
  }, [slug]);

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-5 py-9" role="status" aria-label="Loading publisher">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="mt-6 h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (state === 'missing' || !p) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Publisher not found</h1>
        <p className="mt-2 text-sm text-muted">We hold no journals under that name.</p>
        <button type="button" onClick={() => navigate(-1)} className={buttonClass('outline', 'md', 'mt-6')}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-ground">
      <Helmet>
        <title>{p.publisherName} | STM Digital Library</title>
        <meta name="description" content={`${p.journals.length} journals from ${p.publisherName} held in the library.`} />
      </Helmet>

      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-9">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span>Publishers</span>
          </nav>

          <h1 className="font-serif text-[26px] font-medium leading-tight tracking-tight text-ink sm:text-[33px]">
            {p.publisherName}
          </h1>

          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className={LABEL}>Journals held</dt>
              <dd className="tnum mt-0.5 font-mono text-[22px] text-ink">{p.journals.length.toLocaleString()}</dd>
            </div>
            <div>
              <dt className={LABEL}>Articles</dt>
              <dd className="tnum mt-0.5 font-mono text-[22px] text-ink">{p.articles.toLocaleString()}</dd>
            </div>
            {p.firstYear && p.lastYear && (
              <div>
                <dt className={LABEL}>Covering</dt>
                <dd className="tnum mt-0.5 font-mono text-[22px] text-ink">{p.firstYear}&ndash;{p.lastYear}</dd>
              </div>
            )}
          </dl>

          {p.departments.length > 0 && (
            <div className="mt-8">
              <h2 className={LABEL}>Departments</h2>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
                {p.departments.map(d => (
                  <li key={d.name} className="flex items-baseline gap-2 text-[13px]">
                    <span className="tnum font-mono text-[11.5px] text-muted">{d.journals}</span>
                    <Link to={`${departmentBase}/${slugify(d.name)}`} className="text-ink-2 hover:text-accent">
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className={LABEL}>Journals</h2>

        {p.journals.length === 0 ? (
          <div className="mt-3 card p-10 text-center">
            <p className="text-sm text-muted">Nothing from this publisher is in your subscription.</p>
            <Link to="/contact" className={buttonClass('outline', 'sm', 'mt-4')}>
              Request access
            </Link>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-rule overflow-hidden card">
            {p.journals.map((j, i) => (
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
                    {j.domain && (
                      <Link to={`${departmentBase}/${slugify(j.domain)}`} className="text-ink-2 hover:text-accent hover:underline">
                        {j.domain}
                      </Link>
                    )}
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
