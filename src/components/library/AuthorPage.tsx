import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Skeleton, buttonClass } from '../ui';

/**
 * A person, and everything of theirs the library holds.
 *
 * Identity is not equally certain for everyone. Ingested work carries an ORCID
 * or a stable identifier; our own articles store authors as one string, so those
 * are grouped by normalised name, which occasionally splits a person or merges
 * two. The page says which it is rather than implying more precision than we
 * have — but every name is a link either way, because a name that opens on one
 * page and not another reads as broken.
 */

type Article = {
  id: string; title: string; year?: number | null; journalName?: string | null;
  journalIssn?: string | null; domain?: string | null; accessStatus?: string | null;
  doi?: string | null; originalUrl?: string | null;
};

type Author = {
  id: string; name: string; orcid?: string | null; identitySource?: string;
  affiliation?: string | null; articleCount?: number;
  articles: Article[];
  journals: { name: string; count: number }[];
  domains: { name: string; count: number }[];
};

const auth = (): Record<string, string> | undefined => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : undefined;
};

// Parts of a record line, with a separator drawn only between two parts that are
// present — a missing ISSN never leaves a dot hanging at the start of the line.
const META = "tnum mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted [&>*+*]:before:mr-2 [&>*+*]:before:inline-block [&>*+*]:before:text-rule-2 [&>*+*]:before:content-['·']";
const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-muted';

export function AuthorPage({
  journalBase = '/dashboard/journal',
  articleBase = '/dashboard/article',
  departmentBase = '/dashboard/department',
}: { viewerBase?: string; journalBase?: string; articleBase?: string; departmentBase?: string } = {}) {
  const { authorId } = useParams<{ authorId: string }>();
  const navigate = useNavigate();
  const [a, setA] = useState<Author | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    if (!authorId) return;
    setState('loading');
    fetch(`/api/library/author/${encodeURIComponent(authorId)}`, { headers: auth() })
      .then(async r => {
        if (!r.ok) { setState('missing'); return; }
        setA(await r.json());
        setState('ok');
      })
      .catch(() => setState('missing'));
  }, [authorId]);

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-5 py-9" role="status" aria-label="Loading author">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="mt-6 h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (state === 'missing' || !a) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Helmet><meta name="robots" content="noindex, follow" /></Helmet>
        <h1 className="font-serif text-xl font-medium text-ink">Author not found</h1>
        <button type="button" onClick={() => navigate(-1)} className={buttonClass('outline', 'md', 'mt-6')}>
          Go back
        </button>
      </div>
    );
  }

  const inferred = a.identitySource === 'NameMatch';
  const total = a.articleCount ?? a.articles.length;

  return (
    <div className="min-h-full bg-ground">
      <Helmet><title>{a.name} | STM Digital Library</title></Helmet>

      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-9">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span>Authors</span>
          </nav>

          <h1 className="font-serif text-[28px] font-medium tracking-tight text-ink sm:text-[34px]">{a.name}</h1>

          <p className="tnum mt-2 flex flex-wrap items-center gap-x-2 font-mono text-[12px] text-muted">
            <span>{total} {total === 1 ? 'work' : 'works'} held</span>
            {a.affiliation && <><span className="text-rule-2" aria-hidden="true">·</span><span className="font-sans">{a.affiliation}</span></>}
            {a.orcid && (
              <>
                <span className="text-rule-2" aria-hidden="true">·</span>
                <a href={`https://orcid.org/${a.orcid.replace(/^https?:\/\/orcid\.org\//, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline">
                  ORCID <ExternalLink size={12} aria-hidden="true" />
                </a>
              </>
            )}
          </p>

          {inferred && (
            <p className="mt-5 max-w-2xl card-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
              These works are grouped by name. Two researchers who publish under the same name will
              appear together here, and one who publishes under more than one spelling may appear twice.
            </p>
          )}

          {(a.journals.length > 0 || a.domains.length > 0) && (
            <div className="mt-7 grid gap-7 sm:grid-cols-2">
              {a.journals.length > 0 && (
                <div>
                  <h2 className={LABEL}>Publishes in</h2>
                  <ul className="mt-2 space-y-1">
                    {a.journals.slice(0, 6).map(j => (
                      <li key={j.name} className="flex items-baseline gap-3 text-[13.5px]">
                        <span className="tnum w-7 shrink-0 text-right font-mono text-[12px] text-muted">{j.count}</span>
                        <span className="text-ink-2">{j.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {a.domains.length > 0 && (
                <div>
                  <h2 className={LABEL}>Subject areas</h2>
                  <ul className="mt-2 space-y-1">
                    {a.domains.slice(0, 6).map(d => (
                      <li key={d.name} className="flex items-baseline gap-3 text-[13.5px]">
                        <span className="tnum w-7 shrink-0 text-right font-mono text-[12px] text-muted">{d.count}</span>
                        <Link to={`${departmentBase}/${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                          className="text-ink-2 hover:text-accent">{d.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className={LABEL}>Works</h2>

        {a.articles.length === 0 ? (
          <div className="mt-3 card p-10 text-center text-sm text-muted">
            Nothing recorded for this author yet.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-rule overflow-hidden card">
            {a.articles.map((art, i) => (
              <div key={art.id} className="flex gap-4 px-5 py-4">
                <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-[11px] text-faint sm:block">{i + 1}</span>
                <div className="min-w-0">
                  <Link to={`${articleBase}/${art.id}`}
                    className="block font-serif text-[16px] font-medium leading-snug text-ink hover:text-accent">
                    {art.title}
                  </Link>
                  <p className={META}>
                    {art.journalName && (
                      art.journalIssn
                        ? <Link to={`${journalBase}/${encodeURIComponent(art.journalIssn)}`}
                            className="text-ink-2 hover:text-accent hover:underline">{art.journalName}</Link>
                        : <span className="text-ink-2">{art.journalName}</span>
                    )}
                    {art.year && <span>{art.year}</span>}
                    {art.accessStatus === 'LinkOnly' && art.originalUrl && (
                      <a href={art.originalUrl} target="_blank" rel="noopener noreferrer"
                          className="text-accent hover:underline">read at publisher</a>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
