import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { Badge } from '../../ui';
import { api } from './api';
import { N, dayLabel } from './format';
import { InfoTip } from './InfoTip';

/**
 * Daily ingestion summary — what NEW content the catalogue gained in one reporting cycle (previous day 5:01 PM → this day 5:00 PM IST).
 *
 * Every number is counted on the server from the catalogue rows themselves, and the list behind a number is read from the same rows, so
 * what you click is what was counted. The cycle is a window over timestamps: nothing is reset at 5:01 PM. This is a separate question from
 * "Ingestion activity" above (what the engine did, including records it saw again) and from the catalogue totals (what is held now).
 *
 * The selection lives in the URL (reportDate, department, type, page), so Back, refresh and a copied link all return to the same place.
 */

const UNASSIGNED = '(unassigned)';
const IST = 'Asia/Kolkata';
const KINDS = [['journal', 'Journals', 'journals'], ['article', 'Articles', 'articles'], ['book', 'Books', 'books']] as const;
type Kind = typeof KINDS[number][0];
const SINGULAR: Record<Kind, string> = { journal: 'journal', article: 'article', book: 'book' };

/** "25 Oct 2026, 5:01 PM" in India time. */
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST })}`;
};
const clockOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
const addedAt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: IST })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST })}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${N(n)} ${n === 1 ? one : many}`;
const deptLabel = (d: string) => (d === UNASSIGNED ? 'Unassigned' : d);

const ACCESS: Record<string, string> = { ViewableHere: 'Readable here', LinkOnly: 'Link to publisher', MetadataOnly: 'Metadata only', Accepted: 'Full text allowed' };

/** A number that can be opened. A zero is plain text and never looks like a link. */
function Count({ n, label, onOpen, bold }: { n: number; label: string; onOpen: () => void; bold?: boolean }) {
  if (!n) return <span className="text-muted">0</span>;
  return (
    <button type="button" onClick={onOpen} title={label} aria-label={label}
      className={`tabular-nums text-accent underline-offset-2 hover:underline focus-visible:underline ${bold ? 'font-semibold' : ''}`}>
      {N(n)}
    </button>
  );
}

export function DailySummary({ refreshKey }: { refreshKey: unknown }) {
  const [sp, setSp] = useSearchParams();
  const reportDate = sp.get('reportDate') || '';
  const department = sp.get('department') || '';
  const rawType = sp.get('type') || '';
  const type: Kind | 'all' | '' = rawType === 'all' || KINDS.some(k => k[0] === rawType) ? (rawType as Kind | 'all') : '';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const drilling = !!department || !!type;

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<'total' | 'name'>('total');

  /** Change the selection, keeping every other query parameter the page may have. */
  const go = useCallback((patch: Record<string, string | null>) => {
    setSp(prev => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
      if (n.get('department') || n.get('type') || n.get('reportDate')) n.set('report', 'daily'); else n.delete('report');
      return n;
    });
  }, [setSp]);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    const r = await api(`/api/admin/ingest/daily-summary?${new URLSearchParams({ ...(reportDate ? { reportDate } : {}), ...(fresh ? { fresh: '1' } : {}) })}`);
    setLoading(false);
    if (r.ok) { setData(r.data); setError(null); } else setError(r.data?.error || 'The daily summary could not be loaded.');
  }, [reportDate]);

  // Live cycle: follow it. A finished cycle does not move, so it is read once.
  useEffect(() => {
    setData(null); load();
    const t = reportDate ? null : setInterval(() => load(), 60_000);
    return () => { if (t) clearInterval(t); };
  }, [load, refreshKey, reportDate]);

  const live = !!data?.isCurrentCycle;
  const rows: any[] = data ? [...data.departments].sort((a, b) => (order === 'name'
    ? (a.department === UNASSIGNED ? 1 : b.department === UNASSIGNED ? -1 : a.department.localeCompare(b.department))
    : b.total - a.total || a.department.localeCompare(b.department))) : [];
  const row = rows.find(r => r.department === department);

  // What the summary says the clicked number is, to compare with what the list returns.
  const expected: number | null = !data ? null
    : department && type && type !== 'all' ? (row ? row[`${type}s`] : 0)
    : department ? (row ? row.total : 0)
    : type === 'all' ? data.totalAdded
    : type ? data[`${type}sAdded`] : null;

  return (
    <section className="card card-pad" aria-labelledby="daily-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="daily-heading" className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Daily ingestion summary
            <InfoTip label="the daily summary">
              New catalogue content only: records the engine created in this cycle that are public now. Records waiting for review, refused ones, records already held and enrichments of old records are not counted here. A cycle runs from 5:01 PM to 5:00 PM India time and is worked out from timestamps — nothing is reset or deleted at 5:01 PM.
            </InfoTip>
          </h2>
          {data ? (
            <div className="mt-1.5">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-ink">
                <Badge tone={live ? 'success' : 'neutral'}>{live ? 'Current cycle · live' : 'Finalized'}</Badge>
                <span>Report of {dayLabel(data.reportDate)}</span>
              </p>
              <p className="mt-1 text-[12.5px] text-muted">
                {stamp(data.windowStart)} → {stamp(data.lastMinute)} IST
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {live ? <>Closes today at {clockOf(data.lastMinute)} IST · next cycle starts {stamp(data.nextCycleStart)}</> : <>Finalized {stamp(data.lastMinute)} IST</>}
              </p>
            </div>
          ) : <span aria-hidden="true" className="skeleton mt-2 block h-9 w-72 max-w-full" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented" role="group" aria-label="Report">
            <button type="button" aria-pressed={!reportDate || live} onClick={() => go({ reportDate: null, department: null, type: null, page: null })}>Current cycle</button>
          </div>
          <select className="input h-9 w-auto max-w-[13rem] py-0 text-[13px]" aria-label="Previous reports" value={reportDate && !live ? reportDate : ''}
            onChange={e => go({ reportDate: e.target.value || null, department: null, type: null, page: null })}>
            <option value="">Previous reports</option>
            {(data?.reports || []).slice(1).map((d: string) => <option key={d} value={d}>{dayLabel(d)}</option>)}
            {reportDate && !live && data && !(data.reports || []).includes(reportDate) && <option value={reportDate}>{dayLabel(reportDate)}</option>}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => load(true)} disabled={loading} aria-label="Refresh the daily summary">
            <RefreshCw size={13} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && !data && <p role="alert" className="mt-3 rounded-xl border border-alarm/40 bg-alarm-soft px-3.5 py-2.5 text-[12.5px] text-ink">{error} Nothing is shown rather than a zero that would mean nothing.</p>}

      {data && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-5">
            <Tile wide label="Total added" n={data.totalAdded} onOpen={() => go({ type: 'all', department: null, page: null })} openLabel={`View all ${plural(data.totalAdded, 'record')} added in this report`} />
            {KINDS.map(([k, label, key]) => (
              <Tile key={k} label={label} n={data[`${key}Added`]} onOpen={() => go({ type: k, department: null, page: null })} openLabel={`View ${plural(data[`${key}Added`], 'added ' + SINGULAR[k])} in this report`} />
            ))}
            <Tile label="Departments" n={data.departmentsWithActivity} />
          </div>

          {data.totalAdded === 0 ? (
            <div className="mt-3 rounded-xl border border-rule bg-surface-2 px-4 py-5 text-center">
              <p className="text-[13.5px] font-medium text-ink">
                {live ? 'No new catalogue records have been added during this reporting cycle yet.' : 'No new catalogue records were added during this reporting cycle.'}
              </p>
              <p className="mt-1 text-[12.5px] text-muted">{live ? 'Current cycle' : 'Cycle'}: {stamp(data.windowStart)} → {stamp(data.lastMinute)} IST</p>
            </div>
          ) : (
            <>
            <ul className="mt-3 divide-y divide-rule rounded-xl border border-rule bg-surface sm:hidden" aria-label="New catalogue records added in this cycle, by department">
              {rows.map(r => {
                const name = deptLabel(r.department);
                return (
                  <li key={r.department} className={`px-3.5 py-2.5 ${department === r.department ? 'bg-accent-soft/40' : ''}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <button type="button" aria-pressed={department === r.department} aria-label={`View the ${plural(r.total, 'record')} added to ${name} during this report`}
                        onClick={() => go({ department: r.department, type: null, page: null })}
                        className={`min-w-0 text-left text-[13.5px] font-medium underline-offset-2 hover:underline ${r.department === UNASSIGNED ? 'italic text-ink-2' : 'text-accent'}`}>{name}</button>
                      <span className="shrink-0 text-[13px] text-muted"><Count bold n={r.total} label={`View all ${plural(r.total, 'record')} added to ${name} during this report`} onOpen={() => go({ department: r.department, type: null, page: null })} /> total</span>
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-4 text-[12.5px] text-muted">
                      {KINDS.map(([k, label, key]) => (
                        <span key={k}>{label} <Count n={r[key]} label={`View ${plural(r[key], SINGULAR[k])} added to ${name} during this report`} onOpen={() => go({ department: r.department, type: k, page: null })} /></span>
                      ))}
                    </p>
                  </li>
                );
              })}
              <li className="flex justify-between bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-ink"><span>All departments</span><span className="tabular-nums">{N(data.totalAdded)}</span></li>
            </ul>
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-rule bg-surface sm:block">
              <table className="w-full min-w-[460px] text-left text-[13px]">
                <caption className="sr-only">New catalogue records added in this cycle, by department</caption>
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Department
                      <button type="button" className="ml-2 text-[11px] font-medium normal-case tracking-normal text-accent hover:underline" title="Change the order of the departments" onClick={() => setOrder(o => (o === 'total' ? 'name' : 'total'))}>
                        {order === 'total' ? 'Sort: total ↓' : 'Sort: A–Z'}
                      </button>
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Journals</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Articles</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Books</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {rows.map(r => {
                    const name = deptLabel(r.department);
                    const sel = department === r.department;
                    return (
                      <tr key={r.department} className={sel ? 'bg-accent-soft/40' : ''}>
                        <th scope="row" className="px-4 py-2 text-left font-medium">
                          <button type="button" aria-pressed={sel} title={`View everything added to ${name}`} aria-label={`View the ${plural(r.total, 'record')} added to ${name} during this report`}
                            onClick={() => go({ department: r.department, type: null, page: null })}
                            className={`text-left underline-offset-2 hover:underline focus-visible:underline ${r.department === UNASSIGNED ? 'italic text-ink-2' : 'text-accent'}`}>{name}</button>
                        </th>
                        {KINDS.map(([k, , key]) => (
                          <td key={k} className="px-3 py-2 text-right">
                            <Count n={r[key]} label={`View ${plural(r[key], SINGULAR[k])} added to ${name} during this report`} onOpen={() => go({ department: r.department, type: k, page: null })} />
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right"><Count bold n={r.total} label={`View all ${plural(r.total, 'record')} added to ${name} during this report`} onOpen={() => go({ department: r.department, type: null, page: null })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-surface-2 font-semibold text-ink">
                  <tr>
                    <th scope="row" className="px-4 py-2 text-left">All departments</th>
                    <td className="px-3 py-2 text-right tabular-nums">{N(data.journalsAdded)}</td><td className="px-3 py-2 text-right tabular-nums">{N(data.articlesAdded)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{N(data.booksAdded)}</td><td className="px-4 py-2 text-right tabular-nums">{N(data.totalAdded)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}

          {drilling && <Records reportDate={data.reportDate} department={department} type={type || 'all'} page={page} expected={expected} finalized={!!data.isFinalized} summary={row}
            onType={t => go({ type: t === 'all' ? null : t, page: null })} onPage={p => go({ page: p > 1 ? String(p) : null })} onClose={() => go({ department: null, type: null, page: null })} />}

          <div className="mt-3 border-t border-rule/60 pt-2.5">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Processing activity
              <InfoTip label="processing activity">What the run log recorded for runs that started in this cycle. These are events — a record seen again is counted again — and are never part of “added” above.</InfoTip>
            </p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-4 lg:grid-cols-7">
              {([['Already held', data.processing.alreadyHeld], ['Sent to review', data.processing.sentToReview], ['Enriched', data.processing.enriched], ['Refused by rule', data.processing.refused],
                ['Journals metadata-only', data.journalsMetadataOnly], ['Source failures', data.processing.providerFailures], ['Failed writes', data.processing.failedWrites]] as const).map(([l, v]) => (
                <div key={l} className="flex items-baseline justify-between gap-2 border-b border-rule/50 py-0.5"><dt className="text-muted">{l}</dt><dd className="tabular-nums text-ink-2">{N(v)}</dd></div>
              ))}
            </dl>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            Counted from the catalogue: ingested records that were created in this cycle and are public now (journals: accepted). The department is the record’s department as it stands today, and a record approved from review later is counted in the cycle it was created in.
          </p>
        </>
      )}
    </section>
  );
}

function Tile({ label, n, onOpen, openLabel, wide }: { label: string; n: number; onOpen?: () => void; openLabel?: string; wide?: boolean }) {
  return (
    <div className={`bg-surface px-3.5 py-3 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <p className="text-xl font-semibold tabular-nums text-ink">
        {onOpen ? <Count bold n={n} label={openLabel || label} onOpen={onOpen} /> : N(n)}
      </p>
      <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

const TYPE_WORD: Record<Kind, string> = { journal: 'Journal', article: 'Article', book: 'Book' };

function Records({ reportDate, department, type, page, expected, finalized, summary, onType, onPage, onClose }: {
  reportDate: string; department: string; type: Kind | 'all'; page: number; expected: number | null; finalized: boolean; summary?: any;
  onType: (t: Kind | 'all') => void; onPage: (p: number) => void; onClose: () => void;
}) {
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const PAGE = 50;

  useEffect(() => {
    let alive = true; setError(null);
    (async () => {
      const q = new URLSearchParams({ reportDate, type, page: String(page), pageSize: String(PAGE), ...(department ? { department } : {}) });
      const r = await api(`/api/admin/ingest/daily-summary/content?${q}`);
      if (!alive) return;
      if (r.ok) setRes(r.data); else { setRes(null); setError(r.data?.error || 'The records could not be loaded.'); }
    })();
    return () => { alive = false; };
  }, [reportDate, department, type, page]);

  // Bring the list into view when it opens, including from a copied link.
  useEffect(() => { box.current?.scrollIntoView({ block: 'start' }); }, [department, type]);

  const title = department ? deptLabel(department) : 'All departments';
  const total = res?.total ?? expected;
  const mismatch = res && expected != null && res.total !== expected;
  const rows: any[] = res?.rows || [];
  const pages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;
  const single = type !== 'all' ? type : null;

  return (
    <div ref={box} className="mt-3 rounded-xl border border-rule bg-surface" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}{single ? ` · ${TYPE_WORD[single]}s` : ''}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">{total != null ? `${plural(total, 'record')} added during this reporting cycle` : 'Loading…'}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close the record list"><X size={14} aria-hidden="true" /> Close</button>
      </div>

      {department && summary && (
        <div className="segmented m-3 mb-0" role="group" aria-label="Kind of record">
          <button type="button" aria-pressed={type === 'all'} onClick={() => onType('all')}>All {N(summary.total)}</button>
          {KINDS.map(([k, label, key]) => (
            <button key={k} type="button" aria-pressed={type === k} disabled={!summary[key]} onClick={() => onType(k)} className="disabled:opacity-40">{label} {N(summary[key])}</button>
          ))}
        </div>
      )}

      {mismatch && (
        <p role={finalized ? 'alert' : 'status'} className={`mx-3 mt-3 rounded-lg border px-3 py-2 text-[12px] ${finalized ? 'border-alarm/40 bg-alarm-soft text-ink' : 'border-rule bg-surface-2 text-muted'}`}>
          {finalized
            ? `The summary counted ${N(expected)} but the list holds ${N(res.total)}. This should not happen for a finished cycle — please report it.`
            : `The summary counted ${N(expected)}; the list now holds ${N(res.total)} because records were added since it loaded. Refresh the summary to bring them together.`}
        </p>
      )}
      {error && <p role="alert" className="m-3 rounded-lg border border-alarm/40 bg-alarm-soft px-3 py-2 text-[12.5px] text-ink">{error}</p>}
      {!res && !error && <span aria-hidden="true" className="skeleton m-3 block h-24" />}

      {res && (rows.length === 0 ? <p className="px-4 py-5 text-center text-[13px] text-muted">No records match this selection.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr className="border-b border-rule">
                {!single && <th className="px-4 py-2 font-semibold">Type</th>}
                <th className={`${single ? 'px-4' : 'px-3'} py-2 font-semibold`}>{single === 'journal' ? 'Journal title' : single === 'book' ? 'Book title' : single === 'article' ? 'Title' : 'Title'}</th>
                <th className="px-3 py-2 font-semibold">{single === 'journal' ? 'Publisher' : 'Author(s)'}</th>
                <th className="px-3 py-2 font-semibold">{single === 'journal' ? 'ISSN / eISSN' : single === 'book' ? 'ISBN / DOI' : single === 'article' ? 'DOI' : 'Identifier'}</th>
                <th className="px-3 py-2 font-semibold">{single === 'journal' ? 'Source' : 'Provider'}</th>
                {!department && <th className="px-3 py-2 font-semibold">Department</th>}
                <th className="px-3 py-2 font-semibold">Added at</th>
                {single !== 'article' && <th className="px-3 py-2 font-semibold">{single === 'journal' ? 'Licence' : 'Access'}</th>}
                <th className="px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/70">
              {rows.map(r => {
                const ident = r.type === 'journal' ? [r.issn, r.eissn].filter(Boolean).join(' / ') : r.type === 'book' ? [r.isbn, r.doi].filter(Boolean).join(' · ') : r.doi;
                const who = r.type === 'journal' ? r.publisher : r.authors;
                return (
                  <tr key={`${r.type}-${r.id}`} className="align-top">
                    {!single && <td className="px-4 py-2 text-muted">{TYPE_WORD[r.type as Kind]}</td>}
                    <td className={`${single ? 'px-4' : 'px-3'} py-2 font-medium text-ink`}>
                      <span className="line-clamp-2">{r.title}</span>
                      {r.journal && <span className="block truncate text-[11.5px] font-normal text-muted">{r.journal}</span>}
                    </td>
                    <td className="max-w-[16rem] px-3 py-2 text-ink-2"><span className="line-clamp-2">{who || '—'}</span></td>
                    <td className="px-3 py-2 tabular-nums text-ink-2 [overflow-wrap:anywhere]">{ident || '—'}</td>
                    <td className="px-3 py-2 text-ink-2">{r.provider || '—'}</td>
                    {!department && <td className="px-3 py-2 text-ink-2">{deptLabel(r.department)}</td>}
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{addedAt(r.addedAt)}</td>
                    {single !== 'article' && <td className="px-3 py-2 text-ink-2">{(r.access && (ACCESS[r.access] || r.access)) || '—'}</td>}
                    <td className="px-4 py-2"><Badge tone="success">Added</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {res && res.total > res.pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-2 text-[12.5px] text-muted">
          <span>Showing {N((page - 1) * res.pageSize + 1)}–{N(Math.min(page * res.pageSize, res.total))} of {N(res.total)}</span>
          <span className="flex items-center gap-1">
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} aria-hidden="true" /></button>
            <span className="px-1 tabular-nums">Page {N(page)} of {N(pages)}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={14} aria-hidden="true" /></button>
          </span>
        </div>
      )}
    </div>
  );
}
