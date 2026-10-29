import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Building2, Loader2, PanelLeftClose, PanelLeftOpen, RefreshCw, X } from 'lucide-react';
import { SECTION_LABELS, NO_DEPARTMENT, type AdminSection, type Collection, type SectionOverview } from '../../../lib/adminContent';
import { useModalFocus } from '../../../lib/useModalFocus';

/**
 * The shared pieces of an admin content section: the cards above the table and the department facet. Every figure is the server's
 * (GET /api/admin/library/overview) and every section uses the same components with its own words (src/lib/adminContent.ts says what one
 * record is in each). The department counts follow the search and status filters but NOT the department chosen, so picking one never empties
 * the others; a record is filed under one department, so the departments plus Unassigned add up to the number beside "All departments".
 */

/** The viewport width from which the department list sits beside the table. The admin sidebar takes 256px of it, so below this the list is a drawer. */
export const DEPARTMENT_PANEL_MIN_WIDTH = 1400;

const n = (x: number | null | undefined) => (x === null || x === undefined ? '—' : Number(x || 0).toLocaleString('en-IN'));

export type OverviewState = { data: SectionOverview | null; loading: boolean; error: boolean; retry: () => void };

export function useSectionOverview(section: AdminSection, collection: Collection, q: string, status: string): OverviewState {
  const [data, setData] = useState<SectionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true); setError(false);
    const p = new URLSearchParams({ contentType: section, collection });
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    fetch(`/api/admin/library/overview?${p}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { setData(d); setLoading(false); })
      // A newer request replacing this one is not a failure; a failure is never shown as a zero.
      .catch(e => { if (e?.name === 'AbortError') return; setError(true); setLoading(false); });
    return () => ctl.abort();
  }, [section, collection, q, status, tick]);

  // The figures of one section must not be carried into another while the new ones load.
  const mine = data && data.section === section && data.collection === collection ? data : null;
  return { data: mine ?? (data && data.section === section ? data : null), loading, error, retry };
}

/** The four cards. They describe the WHOLE selected collection (not the filtered table); the line under them says so and gives the other collection. */
export function SectionSummary({ state, section, collection }: { state: OverviewState; section: AdminSection; collection: Collection }) {
  const s = state.data?.summary;
  const L = SECTION_LABELS[section];
  const both = state.data?.collections;
  const collName = collection === 'new' ? 'New' : 'Archived';
  const failed = state.error && !state.data;
  const cards = [
    { label: `All ${L.plural}`, value: s?.total, hint: `every record in the ${collName} collection${s?.rejected ? `, ${n(s.rejected)} rejected` : ''}` },
    { label: 'Public', value: s?.public, hint: s ? `listed on the public site${s.readable !== null ? ` · ${n(s.readable)} with full text served here` : ''}` : 'listed on the public site' },
    { label: 'Draft / needs review', value: s?.draft, hint: 'not public until reviewed and published' },
    { label: 'Unassigned', value: s?.unassigned, hint: 'no department, or one not in the department list' },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white lg:grid-cols-4 lg:divide-y-0" aria-busy={state.loading} aria-label={`${collName} collection summary`} role="group">
        {cards.map(c => (
          <div key={c.label} className="min-w-0 p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{failed ? '—' : n(c.value)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{c.hint}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-slate-500">
        {failed ? (
          <span role="alert">Could not load the summary. <button type="button" onClick={state.retry} className="font-bold underline">Retry</button></span>
        ) : (
          <>
            Cards show the whole <b>{collName}</b> collection, whatever the filters below. Each record here is one {L.unit[collection]}.
            {section === 'Periodicals' && <> Journal titles are counted in <Link to="/admin/journals" className="font-bold underline">Journals</Link>; issues are not stored as records.</>}
            {both && <> New collection {n(both.new.total)} ({n(both.new.public)} public){both.archived ? <> · Archived {n(both.archived.total)} ({n(both.archived.public)} public)</> : null}. They are two collections, not statuses: a Published archived record is listed publicly like any other.</>}
          </>
        )}
      </p>
    </div>
  );
}

type FacetProps = {
  state: OverviewState;
  domain: string;
  onPick: (domain: string) => void;
  visibility: '' | 'public';
  section: AdminSection;
  collection: Collection;
  /** Called after a choice (the drawer closes itself). */
  afterPick?: () => void;
};

/** The department list itself: All departments, every department of the registry (zero ones too), then Unassigned. One list, used by the panel and the drawer. */
export function DepartmentFacet({ state, domain, onPick, visibility, section, collection, afterPick }: FacetProps) {
  const { data, loading, error, retry } = state;
  const listRef = useRef<HTMLDivElement>(null);
  const L = SECTION_LABELS[section];
  const count = (d: { total: number; public: number }) => (visibility === 'public' ? d.public : d.total);
  const departments = data?.departments || [];
  const un = data?.unassigned;
  const allCount = data ? (visibility === 'public' ? data.filteredPublic : data.filteredTotal) : undefined;
  const max = Math.max(1, ...departments.map(count), un ? count(un) : 0);
  const pick = (d: string) => { onPick(d); afterPick?.(); };

  // Arrow keys move between the buttons; Tab still leaves the list.
  const onKey = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const els = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-dept]') || []);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : Math.min(els.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    e.preventDefault();
    els[next].focus();
  };

  const row = (key: string, label: string, value: number, opts: { italic?: boolean; title?: string } = {}) => {
    const active = domain === key;
    return (
      <button key={key} data-dept={key} type="button" aria-pressed={active} title={opts.title} onClick={() => pick(active ? '' : key)}
        className={`block w-full rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
        <span className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className={`truncate ${active ? 'font-bold text-blue-700' : opts.italic ? 'italic text-slate-500' : value === 0 ? 'text-slate-400' : 'text-slate-700'}`}>{label}</span>
          <span className={`shrink-0 tabular-nums ${active ? 'font-bold text-blue-700' : value === 0 ? 'text-slate-400' : 'text-slate-500'}`}>{n(value)}</span>
        </span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <span className="block h-full rounded-full bg-blue-400" style={{ width: `${(value / max) * 100}%` }} />
        </span>
      </button>
    );
  };

  return (
    <div ref={listRef} onKeyDown={onKey} aria-busy={loading}>
      {error && !data ? (
        <div className="flex flex-col items-start gap-2 px-3 py-4 text-sm text-slate-600" role="alert">
          <span className="flex items-center gap-2"><AlertCircle size={15} className="text-amber-600" /> Could not load the department counts.</span>
          <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><RefreshCw size={13} /> Retry</button>
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
          <button data-dept="" type="button" aria-pressed={!domain} onClick={() => pick('')}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${!domain ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>
            <span>All departments</span><span className="tabular-nums">{n(allCount)}</span>
          </button>
          {departments.map(d => row(d.name, d.name, count(d)))}
          {un && row(NO_DEPARTMENT, 'Unassigned / unclassified', count(un), {
            italic: true,
            title: un.unrecognised ? `${n(un.blank)} with no department, ${n(un.unrecognised)} filed under a name that is not in the department list` : `${L.plural} with no department`,
          })}
          {un && un.total > 0 && un.labels.length > 0 && (
            <p className="px-3 pb-1 pt-0.5 text-[10.5px] leading-snug text-slate-400">
              Includes {n(un.blank)} with no department and {n(un.unrecognised)} under other names ({un.labels.slice(0, 3).map(l => `${l.name} ${n(l.count)}`).join(', ')}{un.labels.length > 3 ? ', …' : ''}).
            </p>
          )}
          <p className="px-3 pb-1 pt-2 text-[10.5px] leading-snug text-slate-400">
            Each record is filed under one department, so the departments and Unassigned add up to {n(allCount)} ({collection === 'new' ? 'New' : 'Archived'} collection, {visibility === 'public' ? 'public only' : 'all records'}).
            {!data.reconciles && <span className="font-bold text-amber-700"> The counts changed while loading; refresh to reconcile.</span>}
          </p>
        </div>
      )}
    </div>
  );
}

/** The department panel beside the table, at wide widths. It can be folded away to give the table the full width. */
export function DepartmentPanel(props: FacetProps & { open: boolean; onToggle: () => void }) {
  const { open, onToggle, section, collection, visibility } = props;
  const L = SECTION_LABELS[section];
  if (!open) {
    return (
      <button type="button" onClick={onToggle} aria-expanded={false} aria-label="Show the departments panel"
        className="hidden h-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 xl:inline-flex">
        <PanelLeftOpen size={15} aria-hidden="true" /> Departments
      </button>
    );
  }
  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4" aria-label={`${L.singular} departments`}>
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">By department</p>
          <p className="text-[11px] text-slate-400">{visibility === 'public' ? 'public only' : 'all records'} · {collection === 'new' ? 'New' : 'Archived'} collection · click to filter</p>
        </div>
        <button type="button" onClick={onToggle} aria-expanded={true} aria-label="Hide the departments panel" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><PanelLeftClose size={16} aria-hidden="true" /></button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-2"><DepartmentFacet {...props} /></div>
    </aside>
  );
}

/** Below the wide layout the same list opens from one button, as a drawer. */
export function DepartmentDrawer(props: FacetProps & { label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => opener.current?.focus()); }, []);
  useModalFocus(open, ref, close, DEPARTMENT_PANEL_MIN_WIDTH);
  return (
    <>
      <button type="button" ref={opener} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
        <Building2 size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate">Department: <b className="font-semibold">{props.label}</b></span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70] bg-black/50" aria-hidden="true" onClick={close} />
          <section ref={ref} role="dialog" aria-modal="true" aria-label="Departments" className="fixed inset-y-0 right-0 z-[80] flex w-[min(24rem,92vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-900">By department</p>
                <p className="text-[11px] text-slate-400">{props.visibility === 'public' ? 'public only' : 'all records'} · {props.collection === 'new' ? 'New' : 'Archived'} collection</p>
              </div>
              <button type="button" data-modal-first onClick={close} aria-label="Close departments" className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2"><DepartmentFacet {...props} afterPick={close} /></div>
          </section>
        </>
      )}
    </>
  );
}
