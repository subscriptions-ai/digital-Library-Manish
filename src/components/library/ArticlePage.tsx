import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  BookOpen, Building2, ChevronRight, ExternalLink, FileText, Layers,
  Loader2, Lock, ShieldCheck, User, Copy, Check,
} from 'lucide-react';

/**
 * One article, and everything around it.
 *
 * The viewer is for reading; this is the record. Every entity here is a door —
 * the authors, the journal, the department — because a name that opens on one
 * page and not another reads as broken. It also carries source, identifier,
 * licence and a link to the publisher's own copy, which is what the external
 * audit asks every record to show.
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{children}</dd>
    </div>
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
    return <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="animate-spin text-slate-300" size={28} />
    </div>;
  }

  if (state === 'denied') {
    return <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <Lock className="mx-auto mb-4 text-slate-300" size={36} />
      <h1 className="text-xl font-bold text-slate-900">Not in your subscription</h1>
      <p className="mt-2 text-sm text-slate-500">This sits in a department your account does not cover.</p>
      <Link to="/contact" className="mt-6 inline-block rounded-full bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
        Request access
      </Link>
    </div>;
  }

  if (state === 'missing' || !a) {
    return <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-xl font-bold text-slate-900">Article not found</h1>
      <button onClick={() => navigate(-1)} className="mt-6 text-sm font-bold text-blue-600 hover:underline">Go back</button>
    </div>;
  }

  const journalKey = a.journal?.issn || a.journalIssn || a.journal?.id;
  const jName = a.journal?.title || a.journalName;
  const canRead = a.accessStatus !== 'LinkOnly' && !!a.pdfUrl;
  const doiUrl = a.doi ? `https://doi.org/${a.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : null;
  // Where authors were never resolved into records, fall back to the raw string
  // so the line is never empty — it simply is not clickable.
  const rawAuthors = (a.authors || '').split(',').map(s => s.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <Helmet>
        <title>{a.title} | STM Digital Library</title>
        {a.abstract && <meta name="description" content={a.abstract.slice(0, 155)} />}
      </Helmet>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-9 sm:px-6">
          <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-400">
            <Link to="/digital-library" className="hover:text-slate-700">Library</Link>
            {a.domain && <>
              <ChevronRight size={12} />
              <Link to={`/domain/${slug(a.domain)}`} className="hover:text-slate-700">{a.domain}</Link>
            </>}
            {jName && journalKey && <>
              <ChevronRight size={12} />
              <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`} className="hover:text-slate-700">{jName}</Link>
            </>}
          </nav>

          <h1 className="text-2xl font-extrabold leading-snug tracking-tight text-slate-900 sm:text-3xl">
            {a.title}
          </h1>

          {/* Authors — every one a door */}
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {a.authors_structured.length > 0
              ? a.authors_structured.map((au, i) => (
                  <React.Fragment key={au.id}>
                    {i > 0 && <span className="text-slate-300"> · </span>}
                    <Link to={`${authorBase}/${au.id}`} className="font-medium text-blue-600 hover:underline">
                      {au.name}
                    </Link>
                  </React.Fragment>
                ))
              : rawAuthors.length ? rawAuthors.join(' · ') : <span className="text-slate-400">Author unrecorded</span>}
          </p>

          {/* Where it appeared */}
          {jName && (
            <p className="mt-3 text-sm text-slate-600">
              in{' '}
              {journalKey
                ? <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`} className="font-semibold text-slate-800 hover:text-blue-600">{jName}</Link>
                : <span className="font-semibold text-slate-800">{jName}</span>}
              {a.volume && <> · Volume {a.volume}</>}
              {a.issue && <> · Issue {a.issue}</>}
              {a.year && <> · {a.year}</>}
              {a.pages && <> · pp {a.pages}</>}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {canRead ? (
              <Link to={`${viewerBase}/${a.id}`}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
                <BookOpen size={16} /> Read full text
              </Link>
            ) : a.originalUrl ? (
              <a href={a.originalUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                Read at publisher <ExternalLink size={15} />
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-400">
                <Lock size={15} /> No full text held
              </span>
            )}
            {doiUrl && (
              <button
                onClick={() => { navigator.clipboard?.writeText(doiUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                {copied ? <><Check size={15} className="text-emerald-600" /> Copied</> : <><Copy size={15} /> Copy DOI</>}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {a.abstract && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-sm font-bold text-slate-900">Abstract</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{a.abstract}</p>
            </div>
          )}

          {/* The rest of the rack */}
          {a.siblings.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Layers size={15} className="text-blue-600" />
                  Also in this issue
                </h2>
              </div>
              <ul className="divide-y divide-slate-50">
                {a.siblings.map(s => (
                  <li key={s.id} className="group px-6 py-3.5">
                    <Link to={`${articleBase}/${s.id}`}
                      className="block text-sm font-medium leading-snug text-slate-800 group-hover:text-blue-600">
                      {s.title}
                    </Link>
                    {s.authors && <p className="mt-0.5 text-xs text-slate-500">{s.authors}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Source & rights — what the audit asks every record to show */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldCheck size={15} className="text-blue-600" /> Source &amp; rights
            </h2>
            <dl className="space-y-3.5">
              {(a.publisherName || a.journal?.publisherName) && (
                <Field label="Publisher">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 size={13} className="text-slate-400" />
                    {a.publisherName || a.journal?.publisherName}
                  </span>
                </Field>
              )}
              {(a.journal?.issn || a.journalIssn) && (
                <Field label="ISSN"><span className="font-mono text-xs">{a.journal?.issn || a.journalIssn}</span></Field>
              )}
              {a.doi && <Field label="DOI"><span className="break-all font-mono text-xs">{a.doi}</span></Field>}
              {a.year && <Field label="Published">{a.year}</Field>}
              <Field label="Licence">
                {a.licence
                  ? <span className={a.licenceIsNC ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>
                      {a.licence}{a.licenceIsNC && ' — non-commercial'}
                    </span>
                  : <span className="text-slate-400">Not recorded</span>}
              </Field>
              <Field label="Access">
                {a.accessStatus === 'ViewableHere' ? 'Readable here'
                  : a.accessStatus === 'LinkOnly' ? 'At the publisher'
                  : a.accessStatus === 'MetadataOnly' ? 'Catalogue entry only'
                  : 'As held'}
              </Field>
              {a.rightsHolder && <Field label="Rights holder">{a.rightsHolder}</Field>}
              {a.originalUrl && (
                <Field label="Original">
                  <a href={a.originalUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 break-all text-xs font-semibold text-blue-600 hover:underline">
                    Publisher's copy <ExternalLink size={11} className="shrink-0" />
                  </a>
                </Field>
              )}
            </dl>
          </div>

          {a.journal && journalKey && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText size={15} className="text-blue-600" /> This journal
              </h2>
              <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`}
                className="text-sm font-semibold text-slate-800 hover:text-blue-600">
                {a.journal.title}
              </Link>
              <p className="mt-1 text-xs text-slate-500">
                {a.journal.firstYear && a.journal.lastYear && <>{a.journal.firstYear}–{a.journal.lastYear} · </>}
                {a.journal.volumeCount ?? 0} volumes held
              </p>
            </div>
          )}

          {a.authors_structured.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <User size={15} className="text-blue-600" /> Authors
              </h2>
              <ul className="space-y-2">
                {a.authors_structured.map(au => (
                  <li key={au.id}>
                    <Link to={`${authorBase}/${au.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {au.name}
                    </Link>
                    {typeof au.articleCount === 'number' && au.articleCount > 1 && (
                      <span className="ml-1.5 text-xs text-slate-400">{au.articleCount} works here</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
