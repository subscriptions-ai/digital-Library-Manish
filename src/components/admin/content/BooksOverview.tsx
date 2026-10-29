import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { BooksOverview as Overview } from '../../../lib/adminBooks';

/**
 * The cards and the "Books by department" panel above the Books table.
 *
 * Every number is the server's (GET /api/admin/library/books/overview). The department counts follow the search and status filters but
 * NOT the department chosen, so picking one never empties the others. A book sits in exactly one department, so the departments plus
 * Unassigned add up to the total beside "All departments".
 */

export const NONE = '__none';
const n = (x: number | undefined) => (x === undefined ? '—' : Number(x || 0).toLocaleString('en-IN'));

export type OverviewState = { data: Overview | null; loading: boolean; error: boolean; retry: () => void };

export function useBooksOverview(enabled: boolean, dataset: 'new' | 'archived', q: string, status: string): OverviewState {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoading(true); setError(false);
    const p = new URLSearchParams({ dataset });
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    fetch(`/api/admin/library/books/overview?${p}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (live) setData(d); })
      .catch(() => { if (live) setError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enabled, dataset, q, status, tick]);

  return { data, loading, error, retry };
}

export function BooksSummary({ state, dataset }: { state: OverviewState; dataset: 'new' | 'archived' }) {
  const s = state.data?.summary;
  const both = state.data?.collections;
  const cards = [
    { label: 'Total books', value: s?.total, hint: `every record in the ${dataset === 'new' ? 'New' : 'Archived'} collection${s?.rejected ? `, ${n(s.rejected)} rejected` : ''}` },
    { label: 'Public books', value: s?.public, hint: s ? `listed on the public site · ${n(s.readable)} with full text served here` : 'listed on the public site' },
    { label: 'Draft / needs review', value: s?.draft, hint: 'not public until reviewed and published' },
    { label: 'Unassigned', value: s?.unassigned, hint: 'no department, or one not in the department list' },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white lg:grid-cols-4 lg:divide-y-0" aria-busy={state.loading}>
        {cards.map(c => (
          <div key={c.label} className="p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{state.error && !state.data ? '—' : n(c.value)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{c.hint}</p>
          </div>
        ))}
      </div>
      {both && (both.new || both.archived) && (
        <p className="mt-2 text-[11.5px] text-slate-500">
          New and Archived are two collections, not statuses: a Published archived book is listed publicly like any other.
          {' '}New {n(both.new?.total)} records ({n(both.new?.public)} public)
          {both.archived ? <> · Archived {n(both.archived.total)} records ({n(both.archived.public)} public)</> : null}.
        </p>
      )}
    </div>
  );
}

type PanelProps = {
  state: OverviewState;
  domain: string;
  onPick: (domain: string) => void;
  visibility: 'all' | 'public';
  onVisibility: (v: 'all' | 'public') => void;
  dataset: 'new' | 'archived';
};

export function BooksDepartmentPanel({ state, domain, onPick, visibility, onVisibility, dataset }: PanelProps) {
  const { data, loading, error, retry } = state;
  const listRef = useRef<HTMLDivElement>(null);
  const count = (d: { total: number; public: number }) => (visibility === 'public' ? d.public : d.total);

  const departments = data?.departments || [];
  const un = data?.unassigned;
  const allCount = data ? (visibility === 'public' ? data.filteredPublic : data.filteredTotal) : undefined;
  const max = Math.max(1, ...departments.map(count), un ? count(un) : 0);

  // Arrow keys move between the buttons; Tab still leaves the list.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const els = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-dept]') || []);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : Math.min(els.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    e.preventDefault();
    els[next].focus();
  };

  const row = (key: string, label: string, value: number, opts: { muted?: boolean; italic?: boolean; title?: string } = {}) => {
    const active = domain === key;
    return (
      <button key={key} data-dept={key} type="button" aria-pressed={active} title={opts.title}
        onClick={() => onPick(active ? '' : key)}
        className={`block w-full rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
        <span className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className={`truncate ${active ? 'font-bold text-blue-700' : opts.italic ? 'italic text-slate-500' : value === 0 ? 'text-slate-400' : 'text-slate-700'}`}>{label}</span>
          <span className={`shrink-0 tabular-nums ${active ? 'font-bold text-blue-700' : value === 0 ? 'text-slate-300' : 'text-slate-500'}`}>{n(value)}</span>
        </span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <span className="block h-full rounded-full bg-blue-400" style={{ width: `${(value / max) * 100}%` }} />
        </span>
      </button>
    );
  };

  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4" aria-label="Books by department">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">Books by department</p>
        <p className="text-[11px] text-slate-400">
          {visibility === 'public' ? 'public books only' : 'all records, whatever their status'} · {dataset === 'new' ? 'New' : 'Archived'} collection · click to filter
        </p>
        <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="What the counts include">
          {([['all', 'All records'], ['public', 'Public only']] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={visibility === v} onClick={() => onVisibility(v)}
              className={`rounded-md px-3 py-1 text-[11.5px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${visibility === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} onKeyDown={onKey} className="max-h-72 overflow-y-auto p-2 lg:max-h-[70vh]" aria-busy={loading}>
        {error && !data ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4 text-sm text-slate-600" role="alert">
            <span className="flex items-center gap-2"><AlertCircle size={15} className="text-amber-600" /> Could not load the department counts.</span>
            <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading departments…</div>
        ) : (
          <div className={loading ? 'opacity-50 transition-opacity' : ''}>
            {error && (
              <p className="mb-1 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-800" role="alert">
                Showing the last counts. <button type="button" onClick={retry} className="font-bold underline">Retry</button>
              </p>
            )}
            <button data-dept="" type="button" aria-pressed={!domain} onClick={() => onPick('')}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${!domain ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span>All departments</span>
              <span className="tabular-nums">{n(allCount)}</span>
            </button>
            {departments.map(d => row(d.name, d.name, count(d)))}
            {un && row(NONE, 'Unassigned / unclassified', count(un), {
              italic: true,
              title: un.unrecognised ? `${n(un.blank)} with no department, ${n(un.unrecognised)} filed under a name that is not in the department list` : 'Books with no department',
            })}
            {un && count(un) > 0 && un.labels.length > 0 && (
              <p className="px-3 pb-1 pt-0.5 text-[10.5px] leading-snug text-slate-400">
                Includes {n(un.blank)} with no department and {n(un.unrecognised)} under other names ({un.labels.slice(0, 3).map(l => `${l.name} ${n(l.count)}`).join(', ')}{un.labels.length > 3 ? ', …' : ''}).
              </p>
            )}
          </div>
        )}
      </div>
      {data && (
        <p className="border-t border-slate-100 px-4 py-2 text-[10.5px] leading-snug text-slate-400">
          Each book is filed under one department, so the departments and Unassigned add up to {n(allCount)}.
          {!data.reconciles && <span className="font-bold text-amber-700"> The counts changed while loading; refresh to reconcile.</span>}
        </p>
      )}
    </aside>
  );
}
