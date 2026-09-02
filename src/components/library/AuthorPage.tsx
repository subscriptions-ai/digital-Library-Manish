import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, ChevronRight, ExternalLink, Loader2, User, Info } from 'lucide-react';

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

export function AuthorPage({ viewerBase = '/dashboard/viewer' }: { viewerBase?: string } = {}) {
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
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-slate-300" size={28} />
      </div>
    );
  }

  if (state === 'missing' || !a) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-xl font-bold text-slate-900">Author not found</h1>
        <button onClick={() => navigate(-1)} className="mt-6 text-sm font-bold text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const inferred = a.identitySource === 'NameMatch';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <Helmet><title>{a.name} | STM Digital Library</title></Helmet>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <nav className="mb-5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Link to="/digital-library" className="hover:text-slate-700">Library</Link>
            <ChevronRight size={12} />
            <span className="text-slate-600">Authors</span>
          </nav>

          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <User size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{a.name}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {a.articleCount ?? a.articles.length} {(a.articleCount ?? a.articles.length) === 1 ? 'work' : 'works'} in this library
                {a.affiliation && <> · {a.affiliation}</>}
              </p>
              {a.orcid && (
                <a href={`https://orcid.org/${a.orcid.replace(/^https?:\/\/orcid\.org\//, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                  ORCID <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>

          {inferred && (
            <p className="mt-5 inline-flex max-w-2xl items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />
              These works are grouped by name. Two researchers who publish under the same name will
              appear together here, and one who publishes under more than one spelling may appear twice.
            </p>
          )}

          {(a.journals.length > 0 || a.domains.length > 0) && (
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              {a.journals.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Publishes in</p>
                  <ul className="space-y-1.5">
                    {a.journals.slice(0, 6).map(j => (
                      <li key={j.name} className="flex items-baseline gap-2 text-sm">
                        <span className="w-7 shrink-0 text-right font-bold tabular-nums text-slate-400">{j.count}</span>
                        <span className="text-slate-700">{j.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {a.domains.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Subject areas</p>
                  <ul className="space-y-1.5">
                    {a.domains.slice(0, 6).map(d => (
                      <li key={d.name} className="flex items-baseline gap-2 text-sm">
                        <span className="w-7 shrink-0 text-right font-bold tabular-nums text-slate-400">{d.count}</span>
                        <Link to={`/domain/${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                          className="text-slate-700 hover:text-blue-600">{d.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
          <BookOpen size={18} className="text-blue-600" /> Works
        </h2>

        {a.articles.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            Nothing recorded for this author yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {a.articles.map(art => (
              <div key={art.id} className="group px-5 py-4">
                <Link to={`${viewerBase}/${art.id}`}
                  className="block font-medium leading-snug text-slate-800 group-hover:text-blue-600">
                  {art.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                  {art.year && <span className="tabular-nums">{art.year}</span>}
                  {art.journalName && (
                    <>
                      <span className="text-slate-300">·</span>
                      {art.journalIssn
                        ? <Link to={`/journal/${encodeURIComponent(art.journalIssn)}`}
                            className="font-medium hover:text-blue-600">{art.journalName}</Link>
                        : <span>{art.journalName}</span>}
                    </>
                  )}
                  {art.accessStatus === 'LinkOnly' && art.originalUrl && (
                    <>
                      <span className="text-slate-300">·</span>
                      <a href={art.originalUrl} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-blue-600 hover:underline">read at publisher</a>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
