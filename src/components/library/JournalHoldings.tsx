import React, { useEffect, useRef, useState } from 'react';
import { NO_PUBLISHED_ARTICLES } from '../../lib/journalCopy';

/**
 * What the library holds of one journal, on a list row. A journal the catalogue offers may hold no published article yet; it is then
 * listed with a plain notice instead of three zeros, because "0 articles · 0 volumes · 0 issues" reads as a fault, not as a state.
 */
type Holdings = { articleCount: number; volumeCount: number; issueCount: number };

const num = (n: unknown) => (typeof n === 'number' ? n.toLocaleString() : '—');
export const holdsNothing = (j: Holdings) => j.articleCount === 0;

/** `part="mobile"` is the one-line form under the title; `part="desktop"` is the right-hand column. */
export function JournalHoldings({ j, part }: { j: Holdings; part: 'mobile' | 'desktop' }) {
  if (part === 'mobile') {
    return (
      <p className="tnum mt-2 font-mono text-[11.5px] text-muted sm:hidden">
        {holdsNothing(j) ? NO_PUBLISHED_ARTICLES : <>{num(j.articleCount)} articles · {num(j.volumeCount)} volumes · {num(j.issueCount)} issues</>}
      </p>
    );
  }
  if (holdsNothing(j)) {
    return <p className="hidden max-w-[15rem] shrink-0 self-center text-right text-[12px] leading-snug text-muted sm:block">{NO_PUBLISHED_ARTICLES}</p>;
  }
  return (
    <dl className="hidden shrink-0 gap-6 text-right sm:flex" aria-label="Holdings">
      {([['Articles', j.articleCount], ['Volumes', j.volumeCount], ['Issues', j.issueCount]] as const).map(([label, n]) => (
        <div key={label}>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</dt>
          <dd className="tnum mt-0.5 font-mono text-[14px] text-ink-2">{num(n)}</dd>
        </div>
      ))}
    </dl>
  );
}

export const PAGE = 100;

/** One response of a paged journal list (src/lib/journalPaging.ts). */
export type JournalPageData<J> = { journals: J[]; total: number; journalTotal: number; page: number; hasMore: boolean };

const useDebounced = <T,>(value: T, ms: number): T => {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
};

/**
 * The rows of a journal list, one page at a time, read from the server.
 *
 * `first` is page 1, already fetched by the page that owns the list. "Show more" asks the server for the next page and appends it;
 * a search (`q`) is answered by the server too, so a reader looking for one title among thousands is never made to load them all.
 * A search or a new list starts again from page 1, and a response that arrives after a newer request was made is dropped.
 * Key this component by the list's identity (the slug) so a different department starts clean.
 */
export function PagedJournals<J extends { id: string }>({ url, first, q = '', headers, onTotal, empty, children }: {
  url: string; first: JournalPageData<J>; q?: string; headers?: Record<string, string>;
  /** Titles matching the current search; null while a search is on its way. */
  onTotal?: (n: number | null) => void;
  empty: React.ReactNode;
  children: (j: J, i: number) => React.ReactNode;
}) {
  const [rows, setRows] = useState<J[]>(first.journals);
  const [meta, setMeta] = useState({ page: first.page, hasMore: first.hasMore, total: first.total });
  const [busy, setBusy] = useState<'search' | 'more' | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const term = useDebounced(q.trim(), 300);

  const load = (page: number, t: string) => fetch(`${url}?${new URLSearchParams({ page: String(page), limit: String(PAGE), ...(t ? { q: t } : {}) })}`, { headers })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))) as Promise<JournalPageData<J>>;

  useEffect(() => {
    const mine = ++seq.current;
    if (term === '') { setRows(first.journals); setMeta({ page: first.page, hasMore: first.hasMore, total: first.total }); setBusy(null); setFailed(false); return; }
    setBusy('search'); setFailed(false);
    load(1, term).then(d => {
      if (mine !== seq.current) return;
      setRows(d.journals); setMeta({ page: d.page, hasMore: d.hasMore, total: d.total }); setBusy(null);
    }).catch(() => { if (mine === seq.current) { setBusy(null); setFailed(true); } });
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onTotal?.(busy === 'search' ? null : meta.total); }, [busy, meta.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => {
    const mine = ++seq.current; setBusy('more'); setFailed(false);
    load(meta.page + 1, term).then(d => {
      if (mine !== seq.current) return;
      setRows(prev => { const seen = new Set(prev.map(r => r.id)); return [...prev, ...d.journals.filter(r => !seen.has(r.id))]; });
      setMeta({ page: d.page, hasMore: d.hasMore, total: d.total }); setBusy(null);
    }).catch(() => { if (mine === seq.current) { setBusy(null); setFailed(true); } });
  };

  if (rows.length === 0 && busy !== 'search') return <>{failed ? <p role="alert" className="mt-3 card p-10 text-center text-sm text-muted">These journals could not be loaded. Please try again.</p> : empty}</>;
  const remaining = Math.max(0, meta.total - rows.length);
  return (
    <div className="mt-3 divide-y divide-rule overflow-hidden card" aria-busy={busy === 'search'} style={busy === 'search' ? { opacity: 0.6 } : undefined}>
      {rows.map((j, i) => children(j, i))}
      {failed && <p role="alert" className="p-4 text-center text-[13px] text-muted">That did not load. <button type="button" onClick={more} className="font-semibold text-accent underline">Try again</button></p>}
      {meta.hasMore && !failed && (
        <div className="border-t border-rule p-4 text-center">
          <button type="button" onClick={more} disabled={busy !== null}
            className="rounded-lg border border-rule px-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface disabled:opacity-60">
            {busy === 'more' ? 'Loading…' : <>Show {Math.min(PAGE, remaining).toLocaleString()} more <span className="font-normal text-muted">({remaining.toLocaleString()} left)</span></>}
          </button>
        </div>
      )}
    </div>
  );
}
