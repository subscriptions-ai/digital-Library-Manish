import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState } from '../../ui';
import { api } from './api';
import { N, ago, exactTime } from './format';
import { DepartmentSummary } from './DepartmentSummary';
import { DateRange, LIFETIME, rangeQuery, honoured, STALE_SERVER, type DateRangeValue } from './DateRange';
import { DOMAINS } from '../../../constants';

/** The existing department taxonomy, in its own order. No names are made up here. */
const DEPARTMENTS: string[] = (DOMAINS as any[]).map(d => d.name).slice().sort((a, b) => a.localeCompare(b));

const RESULTS = [['all', 'All'], ['added', 'Added'], ['held', 'Held'], ['failed', 'Failed'], ['provider', 'Provider'], ['skipped', 'Skipped']] as const;
const PHASES = [['', 'All kinds'], ['articles', 'Articles'], ['books', 'Books'], ['journals', 'Journals']] as const;

/** Started by an administrator (Quick Import, a wizard import, a journal import) rather than by the engine's timer. */
const isManual = (r: any) => typeof r.note === 'string' && r.note.startsWith('Manual');

/**
 * A source that did not answer is the SOURCE having a problem, not the catalogue failing to write something — it is shown (and counted)
 * as a provider issue, in a calmer tone, so one outage retried a few times does not read as a pile of failures.
 */
const PROVIDER_WORDS = /(did not answer|answered http|fetch failed|timed? ?out|aborted|paused after repeated|rate.?limit|econn|enotfound|etimedout|socket hang up|stopped answering|is resting)/i;
const isProviderFailure = (r: any) => !!r.error && !r.skippedFailed && (/^Provider request failed/.test(r.error) || PROVIDER_WORDS.test(r.error));

/** One sentence per row, in plain words. */
function rowText(r: any): string {
  if (r.error) return isProviderFailure(r) ? `${(r.note ? `${r.note} — ` : '')}${r.error.replace(/^Provider request failed — /, '')}` : r.error;
  // Rows the rotation writes already say everything: "100 checked · 28 added · 19 enriched · 41 held …".
  if (/^\d+ checked/.test(r.note || '')) return r.note;
  if (r.hasBreakdown && r.dept !== undefined) {
    const where = r.dept === '' ? 'no confirmed department yet' : r.dept;
    const bits = [`${N(r.added)} added${r.dept === '' ? '' : ` to ${where}`}`];
    if (r.skippedHeld) bits.push(`${N(r.skippedHeld)} already held`);
    if (r.needsReview) bits.push(`${N(r.needsReview)} sent to review (${where})`);
    if (r.skippedRejected) bits.push(`${N(r.skippedRejected)} skipped`);
    if (r.skippedFailed) bits.push(`${N(r.skippedFailed)} failed to write`);
    return `${bits.join(' · ')} — part of a run that added ${N(r.runAdded)} in all`;
  }
  if (isManual(r) && r.note) return r.note.replace(/^Manual · /, '');
  if (r.phase === 'Journals') return r.note || `${N(r.journalsSeen)} journals read · ${N(r.journalsAccepted)} accepted · ${N(r.journalsRefused)} metadata only`;
  const bits = [`${N(r.added)} added`];
  if (r.skippedHeld) bits.push(`${N(r.skippedHeld)} already held`);
  if (r.skippedRejected) bits.push(`${N(r.skippedRejected)} refused by a rule`);
  if (r.needsReview) bits.push(`${N(r.needsReview)} sent to review`);
  if (r.skippedFailed) bits.push(`${N(r.skippedFailed)} failed to write`);
  return bits.join(' · ') + (r.note ? ` — ${r.note}` : '');
}

/** Presentation only: consecutive rows for the same journal and outcome are shown together. Nothing is merged or hidden in the data. */
function group(runs: any[]) {
  const out: { head: any; n: number }[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.head.phase === r.phase && last.head.journalId && last.head.journalId === r.journalId && rowText(last.head) === rowText(r)) last.n++;
    else out.push({ head: r, n: 1 });
  }
  return out;
}

export function RunActivity({ refreshKey, department, onDepartment }: { refreshKey: number; department: string; onDepartment: (d: string) => void }) {
  const [result, setResult] = useState<string>('all');
  const [phase, setPhase] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [range, setRange] = useState<DateRangeValue>(LIFETIME);     // lifetime: what this screen showed before it had dates
  const [sources, setSources] = useState<string[]>([]);
  const [runs, setRuns] = useState<any[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const query = (before?: string | null) => `/api/admin/ingest/history?result=${result}${phase ? `&phase=${phase}` : ''}${department ? `&department=${encodeURIComponent(department)}` : ''}${source ? `&source=${encodeURIComponent(source)}` : ''}&${rangeQuery(range)}&limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`;

  // Every request carries a number; only the newest one may touch the list. Without it a slow answer for the old date
  // could arrive after the new one and put the old rows back, and "Load older" could append old-range rows to a new range.
  const latest = useRef(0);
  const olderLoaded = useRef(false);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    const r = await api(query());
    if (mine !== latest.current) return;
    if (!r.ok) { setError('The run log could not be loaded. Nothing is shown rather than an empty list.'); return; }
    if (!honoured(range, r.data?.range)) { setRuns(null); setError(STALE_SERVER); return; }
    setError(null); setRuns(r.data.runs); setNext(r.data.nextBefore);
  }, [result, phase, department, source, range]);

  // Any change of filter or date starts again from the first page: the old rows and the old cursor are dropped.
  useEffect(() => { olderLoaded.current = false; setRuns(null); setNext(null); setMore(false); load(); }, [load, refreshKey]);
  useEffect(() => { api('/api/admin/ingest/run-sources').then(r => { if (r.ok) setSources(r.data.sources || []); }); }, [refreshKey]);
  // The list refreshes itself, but never collapses pages the reader has chosen to load.
  useEffect(() => { const t = setInterval(() => { if (!olderLoaded.current) load(); }, 20_000); return () => clearInterval(t); }, [load]);

  const loadMore = async () => {
    const mine = latest.current;
    olderLoaded.current = true;                          // from here the self-refresh leaves the list alone
    setMore(true);
    const r = await api(query(next));
    setMore(false);
    if (mine !== latest.current) return;                 // the filters changed while this was loading: these rows belong to the old ones
    if (r.ok && honoured(range, r.data?.range)) { setRuns(prev => [...(prev || []), ...r.data.runs]); setNext(r.data.nextBefore); }
  };

  const grouped = runs ? group(runs) : [];
  const narrowedBy = [PHASES.find(([id]) => id === phase && id)?.[1], source || null, result !== 'all' ? RESULTS.find(([id]) => id === result)?.[1] : null].filter(Boolean) as string[];

  return (
    <section className="card" aria-labelledby="activity-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4">
        <div>
          <h2 id="activity-heading" className="text-base font-semibold text-ink">Run activity</h2>
          <p className="text-[11.5px] text-muted">Times and days are India time (IST).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRange value={range} onChange={setRange} />
          <select className="input h-9 w-auto max-w-[14rem] py-0 text-[13px]" aria-label="Filter by department" value={department} onChange={e => onDepartment(e.target.value)}>
            <option value="">All departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            {department && !DEPARTMENTS.includes(department) && <option value={department}>{department}</option>}
          </select>
          <select className="input h-9 w-auto max-w-[12rem] py-0 text-[13px]" aria-label="Filter by source" value={source} onChange={e => setSource(e.target.value)}>
            <option value="">All sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
            {source && !sources.includes(source) && <option value={source}>{source}</option>}
          </select>
          <div className="segmented" role="group" aria-label="Filter by result">
            {RESULTS.map(([id, label]) => <button key={id} type="button" aria-pressed={result === id} onClick={() => setResult(id)}>{label}</button>)}
          </div>
          <select className="input h-9 w-auto py-0 text-[13px]" aria-label="Filter by kind" value={phase} onChange={e => setPhase(e.target.value)}>
            {PHASES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      </div>

      <DepartmentSummary department={department} range={range} filters={{ phase, source, result }} narrowedBy={narrowedBy} refreshKey={refreshKey} />

      {error && <p role="alert" className="px-5 py-4 text-sm text-alarm">{error}</p>}
      {!error && runs === null && <div className="space-y-2 p-5" aria-busy="true"><span className="skeleton block h-5 w-full" /><span className="skeleton block h-5 w-5/6" /><span className="skeleton block h-5 w-2/3" /></div>}
      {!error && runs && !grouped.length && (narrowedBy.length
        ? <EmptyState title="No runs match these filters" description="Try a different result, kind or source, or a wider date range." />
        : <EmptyState title="No ingestion activity was recorded for this department and date range." description={department ? 'Runs that span several departments are not listed under one.' : undefined} />)}

      {!error && runs && grouped.length > 0 && (
        <ul className="divide-y divide-rule">
          {grouped.map(({ head: r, n }) => {
            const provider = isProviderFailure(r);
            const failed = !provider && (!!r.error || r.phase === 'Error' || r.skippedFailed > 0);
            return (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-[13px]">
                <span className="w-[10.5rem] shrink-0 text-[12px] tabular-nums text-ink-2" title={`${exactTime(r.at)} IST`}>
                  {exactTime(r.at)}
                  <span className="block text-[11px] text-muted">{ago(r.at)}</span>
                </span>
                <span className={`badge ${failed ? 'badge-alarm' : provider ? 'badge-caution' : 'badge-neutral'}`}>{r.phase}</span>
                {provider && <span className="badge badge-caution" title="The source did not answer. Nothing was lost; the engine moves to another source.">Source issue</span>}
                {isManual(r) && <span className="badge badge-accent" title="Started by an administrator, not by the continuous engine">Manual</span>}
                {r.accounting === 'ACCOUNTING_ERROR' && <span className="badge badge-alarm" title={`${N(r.checked)} candidates were checked but the outcomes add up to ${N(r.checked - r.unaccounted)}. ${r.unaccounted > 0 ? `${N(r.unaccounted)} appear in no bucket.` : `${N(-r.unaccounted)} more outcomes than candidates.`}`}>Accounting error</span>}
                <span className="min-w-0 flex-1 text-ink-2">
                  <b className="font-semibold text-ink">{r.journalTitle || (r.hasBreakdown && r.dept ? r.dept : r.department ? r.department : r.source) || '—'}</b>
                  <span className="text-muted"> · </span>{rowText(r)}
                  {n > 1 && <span className="ml-2 text-muted">(×{n} in a row)</span>}
                </span>
                {r.source && <span className="text-[11.5px] text-muted">{r.source}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {next && <div className="border-t border-rule p-3 text-center"><Button variant="outline" size="sm" onClick={loadMore} loading={more}>{more ? 'Loading…' : 'Load older runs'}</Button></div>}
    </section>
  );
}
