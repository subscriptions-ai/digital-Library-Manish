import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Building2, Calendar, ChevronRight, ChevronDown, ExternalLink,
  Layers, Loader2, ShieldCheck, Lock, FileText,
} from 'lucide-react';

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

/** Access follows from the licence, so it is stated plainly rather than implied. */
function LicenceBadge({ licence, isNC }: { licence?: string | null; isNC?: boolean | null }) {
  if (!licence) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500">
        <Lock size={11} /> Licence not recorded
      </span>
    );
  }
  const ok = !isNC;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
      ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
         : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
      <ShieldCheck size={11} />
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
    <div className="border-b border-slate-100 last:border-0">
      <button onClick={toggle}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-slate-50">
        {open ? <ChevronDown size={16} className="shrink-0 text-slate-400" />
              : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
        <span className="w-24 shrink-0 font-bold text-slate-900">Volume {vol.volume}</span>
        <span className="w-16 shrink-0 text-sm tabular-nums text-slate-500">{vol.year ?? '—'}</span>
        <span className="text-sm text-slate-500">
          {vol.issues} {vol.issues === 1 ? 'issue' : 'issues'} · {vol.articles} articles
        </span>
      </button>

      {open && (
        <div className="bg-slate-50/70 px-5 pb-4 pl-14">
          {loading && <p className="py-3 text-sm text-slate-400">Loading…</p>}
          {issues?.length === 0 && !loading && (
            <p className="py-3 text-sm text-slate-400">Nothing recorded in this volume yet.</p>
          )}
          {issues?.map(iss => (
            <div key={iss.issue} className="py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Issue {iss.issue} — {iss.articles.length} articles
              </p>
              <ul className="space-y-2.5">
                {iss.articles.map((a: any) => (
                  <li key={a.id} className="group">
                    <Link to={`${articleBase}/${a.id}`}
                      className="block text-sm font-medium leading-snug text-slate-800 group-hover:text-blue-600">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.authors || 'Author unrecorded'}
                      {a.pages && <> · pp {a.pages}</>}
                      {a.accessStatus === 'LinkOnly' && a.originalUrl && (
                        <> · <a href={a.originalUrl} target="_blank" rel="noopener noreferrer"
                              className="font-semibold text-blue-600 hover:underline">read at publisher</a></>
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
}: { viewerBase?: string; articleBase?: string } = {}) {
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
        <Loader2 className="animate-spin text-slate-300" size={28} />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Lock className="mx-auto mb-4 text-slate-300" size={36} />
        <h1 className="text-xl font-bold text-slate-900">Not in your subscription</h1>
        <p className="mt-2 text-sm text-slate-500">
          This journal sits in a department your account does not cover.
        </p>
        <Link to="/contact"
          className="mt-6 inline-block rounded-full bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          Request access
        </Link>
      </div>
    );
  }

  if (state === 'missing' || !j) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-xl font-bold text-slate-900">Journal not found</h1>
        <button onClick={() => navigate(-1)} className="mt-6 text-sm font-bold text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const coverage = j.firstYear && j.lastYear ? `${j.firstYear}–${j.lastYear}` : null;
  const domainSlug = j.domain ? j.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <Helmet>
        <title>{j.title} | STM Digital Library</title>
        {j.description && <meta name="description" content={j.description.slice(0, 155)} />}
      </Helmet>

      {/* The spine */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-400">
            <Link to="/digital-library" className="hover:text-slate-700">Library</Link>
            {j.domain && domainSlug && (
              <>
                <ChevronRight size={12} />
                <Link to={`/domain/${domainSlug}`} className="hover:text-slate-700">{j.domain}</Link>
              </>
            )}
          </nav>

          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
            {j.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            {j.publisherName && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={14} className="text-slate-400" />{j.publisherName}
              </span>
            )}
            {j.issn && <span className="font-mono text-xs">ISSN {j.issn}</span>}
            {coverage && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-400" />{coverage}
              </span>
            )}
            {j.homepage && (
              <a href={j.homepage} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:underline">
                Publisher site <ExternalLink size={12} />
              </a>
            )}
          </div>

          <div className="mt-4"><LicenceBadge licence={j.licence} isNC={j.licenceIsNC} /></div>

          {j.description && (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600">{j.description}</p>
          )}

          <div className="mt-7 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {([['Articles', j.articleCount], ['Volumes', j.volumeCount], ['Issues', j.issueCount]] as const).map(([label, n]) => (
              <div key={label} className="bg-white px-4 py-3">
                <p className="text-xl font-bold tabular-nums text-slate-900">{Number(n ?? 0).toLocaleString()}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The run */}
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
          <Layers size={18} className="text-blue-600" /> Volumes
        </h2>

        {j.volumes.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <FileText className="mx-auto mb-3 text-slate-300" size={30} />
            <p className="text-sm font-semibold text-slate-500">No volumes recorded yet</p>
            <p className="mt-1 text-xs text-slate-400">Articles appear here as the collection is built.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {j.volumes.map(v => (
              <VolumeRow key={v.volume} issn={j.issn || j.id} vol={v} articleBase={articleBase} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
