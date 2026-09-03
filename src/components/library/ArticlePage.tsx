import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ExternalLink, Loader2, Lock, Copy, Check } from 'lucide-react';

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

const LABEL = 'font-mono text-[10.5px] uppercase tracking-wider text-faint';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[68px] shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd className="tnum min-w-0 flex-1 text-[12.5px] text-ink-2">{children}</dd>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-rule bg-surface p-5">
      <p className={LABEL}>{label}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ArticlePage({
  viewerBase = '/dashboard/viewer',
  journalBase = '/dashboard/journal',
  authorBase = '/dashboard/author',
  articleBase = '/dashboard/article',
}: {
  viewerBase?: string; journalBase?: string; authorBase?: string; articleBase?: string;
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
        <p className="mt-2 text-sm text-muted">This sits in a department your account does not cover.</p>
        <Link to="/contact" className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:bg-accent-hover">
          Request access
        </Link>
      </div>
    );
  }

  if (state === 'missing' || !a) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Article not found</h1>
        <button onClick={() => navigate(-1)} className="mt-6 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
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

  return (
    <div className="min-h-full bg-ground">
      <Helmet>
        <title>{a.title} | STM Digital Library</title>
        {a.abstract && <meta name="description" content={a.abstract.slice(0, 155)} />}
      </Helmet>

      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-9">
          <nav className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-faint">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            {a.domain && (
              <>
                <ChevronRight size={11} />
                <Link to={`/domain/${slug(a.domain)}`} className="hover:text-accent">{a.domain}</Link>
              </>
            )}
            {jName && journalKey && (
              <>
                <ChevronRight size={11} />
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
                    {i > 0 && <span className="text-faint"> · </span>}
                    <Link to={`${authorBase}/${au.id}`} className="text-accent hover:underline">{au.name}</Link>
                  </React.Fragment>
                ))
              : rawAuthors.length ? rawAuthors.join(' · ') : <span className="text-faint">Author unrecorded</span>}
          </p>

          {/* Where it appeared, set as a citation */}
          <p className="tnum mt-2.5 flex flex-wrap items-center gap-x-2 font-mono text-[12px] text-muted">
            {jName && (
              journalKey
                ? <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`} className="text-ink-2 hover:text-accent hover:underline">{jName}</Link>
                : <span className="text-ink-2">{jName}</span>
            )}
            {a.volume && <><span className="text-rule-2">·</span><span>{a.volume}{a.issue ? `(${a.issue})` : ''}</span></>}
            {a.year && <><span className="text-rule-2">·</span><span>{a.year}</span></>}
            {a.pages && <><span className="text-rule-2">·</span><span>pp {a.pages}</span></>}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {canRead ? (
              <Link to={`${viewerBase}/${a.id}`}
                className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:bg-accent-hover">
                Read full text
              </Link>
            ) : a.originalUrl ? (
              <a href={a.originalUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:bg-accent-hover">
                Read at publisher <ExternalLink size={14} />
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-md border border-rule-2 px-4 py-2.5 text-sm text-faint">
                <Lock size={14} /> No full text held
              </span>
            )}
            {doiUrl && (
              <button
                onClick={() => { navigator.clipboard?.writeText(doiUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-rule-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted hover:border-accent hover:text-accent">
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy DOI</>}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl gap-5 px-5 py-8 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {a.abstract && (
            <Panel label="Abstract">
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-2">{a.abstract}</p>
            </Panel>
          )}

          {/* The rest of the rack */}
          {a.siblings.length > 0 && (
            <section className="rounded-md border border-rule bg-surface">
              <div className="border-b border-rule px-5 py-3.5">
                <p className={LABEL}>Also in this issue</p>
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
                <Field label="Publisher"><span className="font-sans">{a.publisherName || a.journal?.publisherName}</span></Field>
              )}
              {(a.journal?.issn || a.journalIssn) && (
                <Field label="ISSN"><span className="font-mono">{a.journal?.issn || a.journalIssn}</span></Field>
              )}
              {a.doi && <Field label="DOI"><span className="break-all font-mono">{a.doi}</span></Field>}
              {a.year && <Field label="Published">{a.year}</Field>}
              <Field label="Licence">
                {a.licence
                  ? <span className={a.licenceIsNC ? 'text-caution' : 'text-accent'}>
                      {a.licence}{a.licenceIsNC && ' — non-commercial'}
                    </span>
                  : <span className="text-faint">Not recorded</span>}
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
                    Publisher&rsquo;s copy <ExternalLink size={10} className="shrink-0" />
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
                {a.journal.firstYear && a.journal.lastYear && <>{a.journal.firstYear}&ndash;{a.journal.lastYear} · </>}
                {a.journal.volumeCount ?? 0} volumes held
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
                      <span className="tnum shrink-0 font-mono text-[11px] text-faint">{au.articleCount}</span>
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
