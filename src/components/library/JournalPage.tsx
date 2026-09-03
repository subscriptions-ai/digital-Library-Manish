import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, ChevronDown, ExternalLink, Loader2, Lock } from 'lucide-react';

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
  status?: string; firstYear?: number | null; lastYear?: number | null;
  articleCount?: number; volumeCount?: number; issueCount?: number;
  volumes: Volume[];
};

const auth = (): Record<string, string> | undefined => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : undefined;
};

const LABEL = 'font-mono text-[10.5px] uppercase tracking-wider text-faint';

/** Access follows from the licence, so it is stated plainly rather than implied. */
function LicenceMark({ licence, isNC }: { licence?: string | null; isNC?: boolean | null }) {
  if (!licence) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-rule-2 px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-muted">
        <Lock size={10} /> Licence not recorded
      </span>
    );
  }
  const ok = !isNC;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-wide ${
      ok ? 'border-accent bg-accent-soft text-accent' : 'border-caution bg-caution-soft text-caution'}`}>
      {licence}{!ok && ' · read at publisher'}
    </span>
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
      <button onClick={toggle}
        className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-surface-2">
        {open ? <ChevronDown size={14} className="shrink-0 text-faint" />
              : <ChevronRight size={14} className="shrink-0 text-faint" />}
        <span className="tnum w-24 shrink-0 font-mono text-[13px] text-ink">Vol {vol.volume}</span>
        <span className="tnum w-14 shrink-0 font-mono text-[12px] text-muted">{vol.year ?? '—'}</span>
        <span className="tnum font-mono text-[12px] text-muted">
          {vol.issues} {vol.issues === 1 ? 'issue' : 'issues'} · {vol.articles} articles
        </span>
      </button>

      {open && (
        <div className="border-t border-rule bg-surface-2/60 px-5 pb-4 pl-14">
          {loading && <p className="py-3 font-mono text-[12px] text-faint">Loading…</p>}
          {issues?.length === 0 && !loading && (
            <p className="py-3 font-mono text-[12px] text-faint">Nothing recorded in this volume yet.</p>
          )}
          {issues?.map(iss => (
            <div key={iss.issue} className="py-3">
              <p className={LABEL}>Issue {iss.issue} — {iss.articles.length} articles</p>
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
}: { viewerBase?: string; articleBase?: string; departmentBase?: string; publisherBase?: string } = {}) {
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
        <p className="mt-2 text-sm text-muted">This journal sits in a department your account does not cover.</p>
        <Link to="/contact" className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:bg-accent-hover">
          Request access
        </Link>
      </div>
    );
  }

  if (state === 'missing' || !j) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Journal not found</h1>
        <button onClick={() => navigate(-1)} className="mt-6 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
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
          <nav className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-faint">
            <Link to="/digital-library" className="hover:text-accent">Library</Link>
            {j.domain && domainSlug && (
              <>
                <ChevronRight size={11} />
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
            {j.issn && <><span className="text-rule-2">·</span><span>ISSN {j.issn}</span></>}
            {j.firstYear && j.lastYear && <><span className="text-rule-2">·</span><span>{j.firstYear}–{j.lastYear}</span></>}
            {j.homepage && (
              <>
                <span className="text-rule-2">·</span>
                <a href={j.homepage} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline">
                  Publisher site <ExternalLink size={10} />
                </a>
              </>
            )}
          </p>

          <div className="mt-4"><LicenceMark licence={j.licence} isNC={j.licenceIsNC} /></div>

          {j.description && (
            <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">{j.description}</p>
          )}

          <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-3">
            {([['Articles', j.articleCount], ['Volumes', j.volumeCount], ['Issues', j.issueCount]] as const).map(([label, n]) => (
              <div key={label}>
                <dt className={LABEL}>{label}</dt>
                <dd className="tnum mt-0.5 font-mono text-[17px] text-ink">{Number(n ?? 0).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* The run */}
      <section className="mx-auto max-w-5xl px-5 py-8">
        <p className={LABEL}>Volumes</p>

        {j.volumes.length === 0 ? (
          <div className="mt-3 rounded-md border border-rule bg-surface p-10 text-center">
            <p className="text-sm text-muted">No volumes recorded yet</p>
            <p className="mt-1 font-mono text-[11px] text-faint">Articles appear here as the collection is built.</p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-rule overflow-hidden rounded-md border border-rule bg-surface">
            {j.volumes.map(v => (
              <VolumeRow key={v.volume} issn={j.issn || j.id} vol={v} articleBase={articleBase} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
