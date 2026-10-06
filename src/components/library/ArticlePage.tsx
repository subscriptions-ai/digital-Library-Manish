import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ExternalLink, Lock, Copy, Check } from 'lucide-react';
import { Skeleton, buttonClass } from '../ui';

/**
 * One article, and everything around it.
 *
 * The viewer is for reading; this is the record. Every entity here is a door —
 * the authors, the journal, the department — because a name that opens on one
 * page and not another reads as broken. It also carries source, identifier,
 * licence and a link to the publisher's own copy, which is what the external
 * audit asks every record to show.
 *
 * Set in the token palette, so it follows the app's theme without a single
 * `dark:` twin.
 */

type Author = { id: string; name: string; identitySource?: string; articleCount?: number; position: number };

type Article = {
  id: string; title: string; abstract?: string | null; authors?: string | null;
  doi?: string | null; pdfUrl?: string | null; originalUrl?: string | null;
  volume?: string | null; issue?: string | null; year?: number | null; pages?: string | null;
  domain?: string | null; subject?: string | null; contentType?: string | null;
  licence?: string | null; licenceIsNC?: boolean | null; accessStatus?: string | null;
  rightsHolder?: string | null; publisherName?: string | null;
  journalName?: string | null; journalIssn?: string | null;
  journal?: {
    id: string; title: string; issn?: string | null; publisherName?: string | null;
    domain?: string | null; licence?: string | null; licenceIsNC?: boolean | null;
    firstYear?: number | null; lastYear?: number | null; volumeCount?: number | null;
  } | null;
  authors_structured: Author[];
  siblings: { id: string; title: string; authors?: string | null; pages?: string | null }[];
};

const auth = (): Record<string, string> | undefined => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : undefined;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-muted';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[72px] shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="tnum min-w-0 flex-1 text-[13px] text-ink-2 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="card card-pad">
      <h2 className={LABEL}>{label}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ArticlePage({
  viewerBase = '/dashboard/viewer',
  journalBase = '/dashboard/journal',
  authorBase = '/dashboard/author',
  articleBase = '/dashboard/article',
  departmentBase = '/dashboard/department',
  publisherBase = '/dashboard/publisher',
}: {
  viewerBase?: string; journalBase?: string; authorBase?: string; articleBase?: string;
  departmentBase?: string; publisherBase?: string;
} = {}) {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const [a, setA] = useState<Article | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'denied'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    setState('loading');
    fetch(`/api/library/article/${encodeURIComponent(articleId)}`, { headers: auth() })
      .then(async r => {
        if (r.status === 403) { setState('denied'); return; }
        if (!r.ok) { setState('missing'); return; }
        setA(await r.json());
        setState('ok');
      })
      .catch(() => setState('missing'));
  }, [articleId]);

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-5 py-9" role="status" aria-label="Loading article">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Lock className="mx-auto mb-4 text-muted" size={32} aria-hidden="true" />
        <h1 className="font-serif text-xl font-medium text-ink">Not in your subscription</h1>
        <p className="mt-2 text-sm text-muted">This sits in a department your account does not cover.</p>
        <Link to="/contact" className={buttonClass('primary', 'md', 'mt-6')}>
          Request access
        </Link>
      </div>
    );
  }

  if (state === 'missing' || !a) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Article not found</h1>
        <p className="mt-2 text-sm text-muted">It may have been withdrawn, or the link may be wrong.</p>
        <button type="button" onClick={() => navigate(-1)} className={buttonClass('outline', 'md', 'mt-6')}>
          Go back
        </button>
      </div>
    );
  }

  const journalKey = a.journal?.issn || a.journalIssn || a.journal?.id;
  const jName = a.journal?.title || a.journalName;
  const canRead = a.accessStatus !== 'LinkOnly' && !!a.pdfUrl;
  const doiUrl = a.doi ? `https://doi.org/${a.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : null;
  // Where authors were never resolved into records, fall back to the raw string
  // so the line is never empty — it simply is not clickable.
  const rawAuthors = (a.authors || '').split(',').map(s => s.trim()).filter(Boolean);
  // Volume and issue read as 9(3), the way a citation is written; a missing part is left out.
  const volIss = a.volume ? `${a.volume}${a.issue ? `(${a.issue})` : ''}` : (a.issue ? `Issue ${a.issue}` : '');
  const citeBits = [volIss, a.year ? String(a.year) : '', a.pages ? `pp ${a.pages}` : ''].filter(Boolean);
  const issn = a.journal?.issn || a.journalIssn;

  return (
    <div className="min-h-full bg-ground">
      <Helmet>
        <title>{a.title} | STM Digital Library</title>
        {a.abstract && <meta name="description" content={a.abstract.slice(0, 155)} />}
      </Helmet>

      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-9">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            {a.domain && (
              <>
                <ChevronRight size={12} aria-hidden="true" />
                <Link to={`${departmentBase}/${slug(a.domain)}`} className="hover:text-accent">{a.domain}</Link>
              </>
            )}
            {jName && journalKey && (
              <>
                <ChevronRight size={12} aria-hidden="true" />
                <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`} className="truncate hover:text-accent">{jName}</Link>
              </>
            )}
          </nav>

          <h1 className="font-serif text-[26px] font-medium leading-snug text-ink sm:text-[31px]">
            {a.title}
          </h1>

          {/* Every author a door */}
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
            {a.authors_structured.length > 0
              ? a.authors_structured.map((au, i) => (
                  <React.Fragment key={au.id}>
                    {i > 0 && <span className="text-faint" aria-hidden="true"> · </span>}
                    <Link to={`${authorBase}/${au.id}`} className="text-accent hover:underline">{au.name}</Link>
                  </React.Fragment>
                ))
              : rawAuthors.length ? rawAuthors.join(' · ') : <span className="text-muted">Author unrecorded</span>}
          </p>

          {/* Where it appeared, set as a citation */}
          {(jName || citeBits.length > 0) && (
            <p className="tnum mt-2.5 flex flex-wrap items-center gap-x-2 font-mono text-[12px] text-muted">
              {jName && (
                journalKey
                  ? <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`} className="text-ink-2 hover:text-accent hover:underline">{jName}</Link>
                  : <span className="text-ink-2">{jName}</span>
              )}
              {citeBits.map((b, i) => (
                <React.Fragment key={i}>
                  {(i > 0 || jName) && <span className="text-rule-2" aria-hidden="true">·</span>}
                  <span>{b}</span>
                </React.Fragment>
              ))}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {canRead ? (
              <Link to={`${viewerBase}/${a.id}`} className={buttonClass('primary')}>
                Read full text
              </Link>
            ) : a.originalUrl ? (
              <a href={a.originalUrl} target="_blank" rel="noopener noreferrer"
                className={buttonClass('primary')}>
                Read at publisher <ExternalLink size={16} aria-hidden="true" />
              </a>
            ) : (
              <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-rule-2 px-4 text-sm text-muted">
                <Lock size={16} aria-hidden="true" /> No full text held
              </span>
            )}
            {doiUrl && (
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(doiUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                className={buttonClass('outline')}>
                {copied ? <><Check size={16} aria-hidden="true" /> Copied</> : <><Copy size={16} aria-hidden="true" /> Copy DOI</>}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl gap-5 px-5 py-8 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Said plainly when there is none, so the column never sits empty
              beside the record's facts. */}
          <Panel label="Abstract">
            {a.abstract
              ? <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-2">{a.abstract}</p>
              : <p className="text-[14px] leading-relaxed text-muted">The publisher did not supply an abstract for this record.</p>}
          </Panel>

          {/* The rest of the rack */}
          {a.siblings.length > 0 && (
            <section className="card overflow-hidden">
              <div className="border-b border-rule px-5 py-3">
                <h2 className={LABEL}>Also in this issue</h2>
              </div>
              <ul className="divide-y divide-rule">
                {a.siblings.map(s => (
                  <li key={s.id} className="px-5 py-3">
                    <Link to={`${articleBase}/${s.id}`}
                      className="block font-serif text-[15px] leading-snug text-ink-2 hover:text-accent">
                      {s.title}
                    </Link>
                    {s.authors && <p className="mt-0.5 text-[12.5px] text-muted">{s.authors}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Source and rights — what the audit asks every record to show */}
        <aside className="space-y-5">
          <Panel label="Source &amp; rights">
            <dl className="space-y-2">
              {(a.publisherName || a.journal?.publisherName) && (
                <Field label="Publisher">
                  <Link to={`${publisherBase}/${slug(a.publisherName || a.journal?.publisherName || '')}`}
                    className="font-sans text-accent hover:underline">
                    {a.publisherName || a.journal?.publisherName}
                  </Link>
                </Field>
              )}
              {jName && <Field label="Journal"><span className="font-sans">{jName}</span></Field>}
              {a.volume && <Field label="Volume">{a.volume}</Field>}
              {a.issue && <Field label="Issue">{a.issue}</Field>}
              {a.pages && <Field label="Pages">{a.pages}</Field>}
              {a.year && <Field label="Published">{a.year}</Field>}
              {issn && <Field label="ISSN"><span className="font-mono">{issn}</span></Field>}
              {a.doi && <Field label="DOI"><span className="break-all font-mono">{a.doi}</span></Field>}
              {a.subject && <Field label="Subject"><span className="font-sans">{a.subject}</span></Field>}
              <Field label="Licence">
                {a.licence
                  ? <span className={a.licenceIsNC ? 'text-caution' : 'text-accent'}>
                      {a.licence}{a.licenceIsNC && ' — non-commercial'}
                    </span>
                  : <span className="text-muted">Not recorded</span>}
              </Field>
              <Field label="Access">
                {a.accessStatus === 'ViewableHere' ? 'Readable here'
                  : a.accessStatus === 'LinkOnly' ? 'At the publisher'
                  : a.accessStatus === 'MetadataOnly' ? 'Catalogue entry only'
                  : 'As held'}
              </Field>
              {a.rightsHolder && <Field label="Rights"><span className="font-sans">{a.rightsHolder}</span></Field>}
              {a.originalUrl && (
                <Field label="Original">
                  <a href={a.originalUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 break-all text-accent hover:underline">
                    Publisher&rsquo;s copy <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
                  </a>
                </Field>
              )}
            </dl>
          </Panel>

          {a.journal && journalKey && (
            <Panel label="This journal">
              <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`}
                className="font-serif text-[15px] font-medium leading-snug text-ink hover:text-accent">
                {a.journal.title}
              </Link>
              <p className="tnum mt-1.5 font-mono text-[11px] text-muted">
                {[
                  a.journal.firstYear && a.journal.lastYear ? `${a.journal.firstYear}–${a.journal.lastYear}` : '',
                  typeof a.journal.volumeCount === 'number' ? `${a.journal.volumeCount} ${a.journal.volumeCount === 1 ? 'volume' : 'volumes'} held` : '',
                ].filter(Boolean).join(' · ')}
              </p>
            </Panel>
          )}

          {a.authors_structured.length > 0 && (
            <Panel label="Authors">
              <ul className="space-y-1.5">
                {a.authors_structured.map(au => (
                  <li key={au.id} className="flex items-baseline justify-between gap-3">
                    <Link to={`${authorBase}/${au.id}`} className="text-[13.5px] text-accent hover:underline">
                      {au.name}
                    </Link>
                    {typeof au.articleCount === 'number' && au.articleCount > 1 && (
                      <span className="tnum shrink-0 font-mono text-[11px] text-muted" title={`${au.articleCount} works in the library`}>{au.articleCount}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
