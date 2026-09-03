import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, Loader2 } from 'lucide-react';

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

const LABEL = 'font-mono text-[10.5px] uppercase tracking-wider text-faint';
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
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-faint" size={26} />
      </div>
    );
  }

  if (state === 'missing' || !p) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Publisher not found</h1>
        <p className="mt-2 text-sm text-muted">We hold no journals under that name.</p>
        <button onClick={() => navigate(-1)} className="mt-6 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
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
          <nav className="mb-5 flex items-center gap-1.5 font-mono text-[11px] text-faint">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            <ChevronRight size={11} />
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
              <p className={LABEL}>Departments</p>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
                {p.departments.map(d => (
                  <li key={d.name} className="flex items-baseline gap-2 text-[13px]">
                    <span className="tnum font-mono text-[11.5px] text-faint">{d.journals}</span>
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
        <p className={LABEL}>Journals</p>

        {p.journals.length === 0 ? (
          <div className="mt-3 rounded-md border border-rule bg-surface p-10 text-center">
            <p className="text-sm text-muted">Nothing from this publisher is in your subscription.</p>
            <Link to="/contact" className="mt-4 inline-block font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
              Request access
            </Link>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-rule overflow-hidden rounded-md border border-rule bg-surface">
            {p.journals.map((j, i) => (
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
                    {j.domain && (
                      <Link to={`${departmentBase}/${slugify(j.domain)}`} className="text-ink-2 hover:text-accent hover:underline">
                        {j.domain}
                      </Link>
                    )}
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
