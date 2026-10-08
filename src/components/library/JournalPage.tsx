import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ChevronDown, ExternalLink, Lock } from 'lucide-react';
import { Badge, Skeleton, buttonClass } from '../ui';

/**
 * A journal, and its run of volumes.
 *
 * This is the page the whole catalogue exists to produce: the spine on the
 * shelf, with the back-run underneath it. Opening a volume shows its issues in
 * order, the way an issue actually reads, so a reader can walk backwards through
 * the years without going back to a search box.
 */

type Volume = { volume: string; year: number | null; issues: number; articles: number };

type Journal = {
  id: string; title: string; issn?: string | null; eissn?: string | null;
  publisherName?: string | null; domain?: string | null; description?: string | null;
  homepage?: string | null; licence?: string | null; licenceIsNC?: boolean | null;
  subjects?: string[] | null;
  status?: string; firstYear?: number | null; lastYear?: number | null;
  articleCount?: number; volumeCount?: number; issueCount?: number;
  volumes: Volume[];
};

const auth = (): Record<string, string> | undefined => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : undefined;
};

const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-muted';

/** Access follows from the licence, so it is stated plainly rather than implied. */
function LicenceMark({ licence, isNC }: { licence?: string | null; isNC?: boolean | null }) {
  if (!licence) {
    return (
      <Badge tone="neutral"><Lock size={12} aria-hidden="true" /> Licence not recorded</Badge>
    );
  }
  const ok = !isNC;
  return (
    <Badge tone={ok ? 'accent' : 'caution'}>
      {licence}{!ok && ' · read at publisher'}
    </Badge>
  );
}

function VolumeRow({ issn, vol, articleBase }: { issn: string; vol: Volume; articleBase: string }) {
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Issues are fetched the first time a volume is opened, not all at once —
  // a journal can carry forty years of them.
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && issues === null) {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/library/journal/${encodeURIComponent(issn)}/volume/${encodeURIComponent(vol.volume)}`,
          { headers: auth() });
        setIssues(r.ok ? (await r.json()).issues || [] : []);
      } catch { setIssues([]); }
      finally { setLoading(false); }
    }
  };

  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:flex-nowrap sm:px-5">
        {open ? <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted" />
              : <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted" />}
        <span className="tnum shrink-0 font-mono text-[13px] text-ink sm:w-24">Vol {vol.volume}</span>
        <span className="tnum shrink-0 font-mono text-[12px] text-muted sm:w-14">{vol.year ?? '—'}</span>
        <span className="tnum font-mono text-[12px] text-muted">
          {vol.issues} {vol.issues === 1 ? 'issue' : 'issues'} · {vol.articles} articles
        </span>
      </button>

      {open && (
        <div className="border-t border-rule bg-surface-2/60 px-4 pb-4 sm:px-5 sm:pl-14">
          {loading && <div className="space-y-2 py-3" role="status" aria-label="Loading issues"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>}
          {issues?.length === 0 && !loading && (
            <p className="py-3 text-[13px] text-muted">Nothing recorded in this volume yet.</p>
          )}
          {issues?.map(iss => (
            <div key={iss.issue} className="py-3">
              <h3 className={LABEL}>Issue {iss.issue} — {iss.articles.length} {iss.articles.length === 1 ? 'article' : 'articles'}</h3>
              <ul className="mt-2 space-y-2.5">
                {iss.articles.map((a: any) => (
                  <li key={a.id}>
                    <Link to={`${articleBase}/${a.id}`}
                      className="block font-serif text-[15px] leading-snug text-ink-2 hover:text-accent">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {a.authors || 'Author unrecorded'}
                      {a.pages && <span className="tnum font-mono"> · pp {a.pages}</span>}
                      {a.accessStatus === 'LinkOnly' && a.originalUrl && (
                        <> · <a href={a.originalUrl} target="_blank" rel="noopener noreferrer"
                              className="text-accent hover:underline">read at publisher</a></>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function JournalPage({
  articleBase = '/dashboard/article',
  departmentBase = '/dashboard/department',
  publisherBase = '/dashboard/publisher',
  subjectBase = '/dashboard/subject',
}: {
  viewerBase?: string; articleBase?: string; departmentBase?: string;
  publisherBase?: string; subjectBase?: string;
} = {}) {
  const { journalId } = useParams<{ journalId: string }>();
  const navigate = useNavigate();
  const [j, setJ] = useState<Journal | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'denied'>('loading');

  useEffect(() => {
    if (!journalId) return;
    setState('loading');
    fetch(`/api/library/journal/${encodeURIComponent(journalId)}`, { headers: auth() })
      .then(async r => {
        if (r.status === 403) { setState('denied'); return; }
        if (!r.ok) { setState('missing'); return; }
        setJ(await r.json());
        setState('ok');
      })
      .catch(() => setState('missing'));
  }, [journalId]);

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-5 py-9" role="status" aria-label="Loading journal">
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
        <p className="mt-2 text-sm text-muted">This journal sits in a department your account does not cover.</p>
        <Link to="/contact" className={buttonClass('primary', 'md', 'mt-6')}>
          Request access
        </Link>
      </div>
    );
  }

  if (state === 'missing' || !j) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Helmet><meta name="robots" content="noindex, follow" /></Helmet>
        <h1 className="font-serif text-xl font-medium text-ink">Journal not found</h1>
        <button type="button" onClick={() => navigate(-1)} className={buttonClass('outline', 'md', 'mt-6')}>
          Go back
        </button>
      </div>
    );
  }

  const domainSlug = j.domain ? j.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;

  return (
    <div className="min-h-full bg-ground">
      <Helmet>
        <title>{j.title} | STM Digital Library</title>
        {j.description && <meta name="description" content={j.description.slice(0, 155)} />}
      </Helmet>

      {/* The spine */}
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-9">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            {j.domain && domainSlug && (
              <>
                <ChevronRight size={12} aria-hidden="true" />
                <Link to={`${departmentBase}/${domainSlug}`} className="hover:text-accent">{j.domain}</Link>
              </>
            )}
          </nav>

          <h1 className="font-serif text-[28px] font-medium leading-tight text-ink sm:text-[36px]">
            {j.title}
          </h1>

          <p className="tnum mt-3 flex flex-wrap items-center gap-x-2 font-mono text-[12px] text-muted">
            {j.publisherName && (
              <Link to={`${publisherBase}/${j.publisherName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                className="text-ink-2 hover:text-accent hover:underline">{j.publisherName}</Link>
            )}
            {/* A separator goes only between two parts, never at the start of the line. */}
            {j.issn && <>{j.publisherName && <span className="text-rule-2" aria-hidden="true">·</span>}<span>ISSN {j.issn}</span></>}
            {j.eissn && j.eissn !== j.issn && <>{(j.publisherName || j.issn) && <span className="text-rule-2" aria-hidden="true">·</span>}<span>eISSN {j.eissn}</span></>}
            {j.firstYear && j.lastYear && <>{(j.publisherName || j.issn || j.eissn) && <span className="text-rule-2" aria-hidden="true">·</span>}<span>{j.firstYear}–{j.lastYear}</span></>}
            {j.homepage && (
              <>
                {(j.publisherName || j.issn || j.eissn || (j.firstYear && j.lastYear)) && <span className="text-rule-2" aria-hidden="true">·</span>}
                <a href={j.homepage} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline">
                  Publisher site <ExternalLink size={12} aria-hidden="true" />
                </a>
              </>
            )}
          </p>

          <div className="mt-4"><LicenceMark licence={j.licence} isNC={j.licenceIsNC} /></div>

          {/* The publisher's own classification, which cuts across our departments. */}
          {Array.isArray(j.subjects) && j.subjects.length > 0 && (
            <div className="mt-5">
              <h2 className={LABEL}>Classed under</h2>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {j.subjects.map(sub => (
                  <li key={sub}>
                    <Link
                      to={`${subjectBase}/${sub.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                      className="text-[13px] text-ink-2 hover:text-accent hover:underline"
                    >
                      {sub}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {j.description && (
            <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">{j.description}</p>
          )}

          <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-3">
            {([['Articles', j.articleCount], ['Volumes', j.volumeCount], ['Issues', j.issueCount]] as const).map(([label, n]) => (
              <div key={label}>
                <dt className={LABEL}>{label}</dt>
                <dd className="tnum mt-0.5 font-mono text-[17px] text-ink">{typeof n === 'number' ? n.toLocaleString() : '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* The run */}
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className={LABEL}>Volumes</h2>

        {j.volumes.length === 0 ? (
          <div className="mt-3 card p-10 text-center">
            <p className="text-sm text-muted">No volumes recorded yet</p>
            <p className="mt-1 text-[13px] text-muted">Articles appear here as the collection is built.</p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-rule overflow-hidden card">
            {j.volumes.map(v => (
              <VolumeRow key={v.volume} issn={j.issn || j.id} vol={v} articleBase={articleBase} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
