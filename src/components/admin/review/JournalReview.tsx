import { useCallback, useEffect, useState } from 'react';
import { Library } from 'lucide-react';
import { Badge, Button, Dialog, type BadgeTone } from '../../ui';
import { api } from '../ingestion/api';
import { N, exactTime } from '../ingestion/format';
import { Tally } from './shared';

/**
 * Journals in review: journals that have no department. The analysis suggests one for each and says how sure it is; a person then assigns in batches. Assigning
 * writes the department and nothing else: the journal keeps its status, licence and rights, its ISSN and eISSN and its publisher, and nothing is published,
 * approved or rejected. Every journal is checked again on the server just before it is written, and one that has changed is skipped. Writing is switched off
 * unless the deployment enables it; looking, analysing and previewing never write.
 */

const TIER: Record<string, { label: string; tone: BadgeTone }> = {
  high: { label: 'High confidence', tone: 'success' }, medium: { label: 'Medium confidence', tone: 'accent' }, low: { label: 'Low confidence', tone: 'caution' }, unclassifiable: { label: 'Unclassifiable', tone: 'neutral' },
};
const EVIDENCE: Record<string, string> = { title: 'Title', subject: 'Subjects' };
const TAKE = 50;
type Filters = { tier: string; department: string; origin: string; status: string; q: string };
const START: Filters = { tier: 'medium', department: '', origin: '', status: '', q: '' };
const qs = (f: Filters, extra: Record<string, string>) => { const p = new URLSearchParams(extra); (Object.keys(f) as (keyof Filters)[]).forEach(k => { if (f[k] !== '') p.set(k, f[k]); }); return p.toString(); };

export function JournalReview() {
  const [state, setState] = useState<any>(null);
  const [filters, setFilters] = useState<Filters>(START);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState('');
  const [ask, setAsk] = useState<null | { mode: 'suggested' | 'chosen'; loading: boolean; preview: any | null }>(null);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => { const r = await api('/api/admin/review/journals/summary'); if (r.ok) setState(r.data); }, []);
  useEffect(() => { loadState(); }, [loadState]);
  const job = state?.job, summary = state?.summary, config = state?.config;
  const running = job?.status === 'running';
  useEffect(() => { if (!running) return; const t = setInterval(loadState, 1500); return () => clearInterval(t); }, [running, loadState]);

  const load = useCallback(async (p: number, f: Filters) => {
    setLoading(true);
    const r = await api(`/api/admin/review/journals/records?${qs(f, { page: String(p), take: String(TAKE) })}`);
    setLoading(false);
    if (r.ok) setResult(r.data); else setError(r.data?.error || 'Could not read the journals.');
  }, []);
  useEffect(() => { load(page, filters); }, [page, filters, load, job?.finishedAt]);

  const set = (patch: Partial<Filters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); setSelected(new Set()); };
  const rows: any[] = result?.records || [];
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const gateOff = !config?.enabled;
  const limit = config?.batchLimit ?? 250;
  const departments: string[] = config?.departments ?? [];

  const runAnalysis = async () => { setError(null); const r = await api('/api/admin/review/journals/run', { method: 'POST', body: {} }); if (!r.ok) setError(r.data?.error || 'Could not start the analysis.'); setSelected(new Set()); await loadState(); };

  const openAsk = async (mode: 'suggested' | 'chosen') => {
    setAsk({ mode, loading: true, preview: null }); setError(null);
    const r = await api('/api/admin/review/journals/batch/preview', { method: 'POST', body: { ids: [...selected], mode, ...(mode === 'chosen' ? { department: chosen } : {}) } });
    if (!r.ok) { setAsk(null); setError(r.data?.error || 'Could not preview the selection.'); return; }
    setAsk({ mode, loading: false, preview: r.data });
  };
  const confirm = async () => {
    if (!ask) return;
    setWorking(true); setError(null);
    const r = await api('/api/admin/review/journals/batch/assign', { method: 'POST', body: { ids: [...selected], mode: ask.mode, ...(ask.mode === 'chosen' ? { department: chosen } : {}) } });
    setWorking(false); setAsk(null);
    if (!r.ok) { setError(r.data?.error || 'That did not work.'); return; }
    setOutcome({ ...r.data, mode: ask.mode, when: new Date().toISOString() });
    const gone = new Set<string>(r.data.outcomes.filter((o: any) => o.result === 'assigned' || ['Department already assigned', 'Rejected', 'Record missing', 'Publisher-linked or manually verified'].includes(o.reason)).map((o: any) => o.id));
    setSelected(s => new Set([...s].filter(id => !gone.has(id))));
    load(page, filters); loadState();
  };

  const tiers = summary?.tiers;
  return (
    <div className="space-y-4">
      <section className="card card-pad" aria-label="Journal classification analysis">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><Library size={13} aria-hidden="true" /> Journals needing a department <Badge tone={gateOff ? 'neutral' : 'caution'}>{config ? (gateOff ? 'Assignment off' : 'Assignment on') : '…'}</Badge></h2>
          <Button variant="outline" size="sm" onClick={runAnalysis} disabled={running} loading={running}>{summary ? 'Run again' : 'Run Journal Analysis'}</Button>
        </div>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-2">Journals with no department, not rejected, not a partner publisher’s and not verified by hand. The analysis reads each journal’s title and subjects and suggests a department; it never changes a journal. Publisher and ISSN are shown to help you decide but are not used as evidence.</p>
        {config && gateOff && <p role="status" className="mt-2 rounded-lg border border-rule bg-surface-2 p-2.5 text-[12.5px] text-ink-2">{config.message} You can still analyse, browse and preview.</p>}
        {config && !config.approved && <p className="mt-2 text-[11.5px] text-muted">No journal thresholds are approved, so the provisional ones are in use (High — score ≥ {config.thresholds.highMinScore}, margin ≥ {config.thresholds.highMinMargin}, title and subjects agree; Medium — score ≥ {config.thresholds.mediumMinScore}, margin ≥ {config.thresholds.mediumMinMargin}).</p>}
        {running && <p role="status" className="mt-3 text-[12.5px] text-muted">{job.phase}… {N(job.processed)} / {N(job.total)} journals</p>}
        {job?.status === 'failed' && <p role="alert" className="mt-2 text-[12.5px] text-alarm">The analysis failed: {job.error}</p>}
        {!summary && !running && <p className="mt-3 text-[13px] text-ink-2">The analysis has not been run yet.</p>}
        {summary && (
          <div className="mt-3 text-[12.5px]">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([['In the queue', summary.queueTotal], ['High', tiers.high], ['Medium', tiers.medium], ['Low', tiers.low], ['Unclassifiable', tiers.unclassifiable]] as const).map(([l, v]) => (
                <div key={l}><dt className="text-[11px] text-muted">{l}</dt><dd className="text-xl font-semibold tabular-nums text-ink">{N(v)}</dd></div>
              ))}
            </dl>
            <p className="mt-1 text-[11.5px] text-muted">Analysed {exactTime(summary.finishedAt)} · classifier v{summary.classifierVersion}{summary.truncated ? ' · list capped at 150,000 journals' : ''}. Against the import-time rule: {N(summary.againstEngineRule.same)} agree, {N(summary.againstEngineRule.different)} differ, {N(summary.againstEngineRule.engineHasNoAnswer)} it had no answer for.</p>
            {summary.byDepartment.length > 0 && (
              <details className="mt-2"><summary className="cursor-pointer text-[12px] font-semibold text-ink">Suggested departments</summary>
                <div className="mt-1 max-h-64 overflow-auto"><table className="w-full text-[12px]"><thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Department</th><th className="text-right font-medium">High</th><th className="text-right font-medium">Medium</th><th className="text-right font-medium">Low</th></tr></thead>
                  <tbody>{summary.byDepartment.map((d: any) => <tr key={d.department} className="border-t border-rule/60"><td className="py-0.5"><button type="button" className="text-left text-accent hover:underline" onClick={() => set({ department: d.department, tier: '' })}>{d.department}</button></td><td className="text-right tabular-nums">{N(d.high)}</td><td className="text-right tabular-nums">{N(d.medium)}</td><td className="text-right tabular-nums">{N(d.low)}</td></tr>)}</tbody></table></div>
              </details>
            )}
            <details className="mt-2"><summary className="cursor-pointer text-[12px] font-semibold text-ink">A sample of each confidence level</summary>
              <div className="mt-1 grid gap-3 sm:grid-cols-2">{(['high', 'medium', 'low', 'unclassifiable'] as const).map(t => (
                <div key={t}><div className="mb-0.5 text-[11px] font-semibold text-muted">{TIER[t].label}</div>
                  <ul className="space-y-0.5 text-[12px] text-ink-2">{summary.samples[t].slice(0, 6).map((s: any) => <li key={s.id} className="truncate" title={s.title}>{s.title} → <b className="text-ink">{s.suggested ?? 'nothing'}</b></li>)}{!summary.samples[t].length && <li className="text-muted">None</li>}</ul></div>
              ))}</div>
            </details>
          </div>
        )}
      </section>

      <section className="card" aria-label="Journal batch review">
        <div className="border-b border-rule p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <label className="field"><span className="field-label">Confidence</span><select className="input" value={filters.tier} onChange={e => set({ tier: e.target.value })}><option value="">All</option>{Object.entries(TIER).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label className="field"><span className="field-label">Suggested department</span><select className="input" value={filters.department} onChange={e => set({ department: e.target.value })}><option value="">All</option>{(summary?.byDepartment || []).map((d: any) => d.department).sort().map((d: string) => <option key={d}>{d}</option>)}</select></label>
            <label className="field"><span className="field-label">Listing</span><select className="input" value={filters.origin} onChange={e => set({ origin: e.target.value })}><option value="">All</option>{Object.keys(summary?.byOrigin || {}).sort().map(o => <option key={o}>{o}</option>)}</select></label>
            <label className="field"><span className="field-label">Status</span><select className="input" value={filters.status} onChange={e => set({ status: e.target.value })}><option value="">All</option>{['NeedsReview', 'MetadataOnly', 'Accepted'].map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="field"><span className="field-label">Title or ISSN</span><input className="input" value={filters.q} onChange={e => set({ q: e.target.value })} placeholder="Search" /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(s => new Set([...s, ...rows.map(r => r.id)]))} disabled={!rows.length}>Select visible</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>Clear selection</Button>
            <span className="text-[12px] text-muted" aria-live="polite">{selected.size ? `${N(selected.size)} selected (up to ${limit} at a time)` : 'Nothing selected'}</span>
          </div>
        </div>

        {result && !result.available ? (
          <p className="p-5 text-[13px] text-ink-2">There is no analysis in memory. Run the journal analysis above; this list is built from it.</p>
        ) : loading && !result ? <span aria-hidden="true" className="skeleton m-4 block h-32" />
          : !rows.length ? <p className="p-5 text-[13px] text-ink-2">No journal matches these filters.</p> : (
            <>
              <div className="border-b border-rule/60 px-4 py-2 text-[12px] text-muted">{N(result.total)} match · analysed {exactTime(result.asOf)}</div>
              <ul className="divide-y divide-rule/60">
                {rows.map(r => (
                  <li key={r.id} className="flex items-start gap-3 p-4">
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2"><span className="min-w-0 font-semibold text-ink">{r.title}</span><Badge tone={TIER[r.tier].tone}>{TIER[r.tier].label}</Badge></div>
                      <div className="text-[12px] text-muted">{[r.issn && `ISSN ${r.issn}`, r.eissn && `eISSN ${r.eissn}`, r.publisher, r.origin, r.status].filter(Boolean).join(' · ')}</div>
                      <div className="mt-1 text-[12.5px] text-ink-2">Suggested <b className="text-ink">{r.dept ?? 'nothing'}</b> · Score {r.score}{r.next ? <> · Next {r.next} ({r.nextScore})</> : null} · Margin {r.margin}</div>
                      <div className="text-[12px] text-muted">Evidence: {r.families.map((f: string) => EVIDENCE[f]).join(' + ') || 'none'}{r.subjects.length ? ` · Subjects: ${r.subjects.join(', ')}` : ''}{r.legacy && r.legacy !== r.dept ? ` · Import-time rule said ${r.legacy}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {result.total > TAKE && (
                <div className="flex items-center justify-between border-t border-rule px-4 py-3 text-[12px] text-muted"><span>{N(result.total)} journals</span>
                  <span className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page * TAKE >= result.total} onClick={() => setPage(page + 1)}>Next</Button></span></div>
              )}
            </>
          )}

        <div className="sticky bottom-0 border-t border-rule bg-surface p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Button size="sm" onClick={() => openAsk('suggested')} disabled={!selected.size || working} title={gateOff ? 'You can preview; writing is disabled by configuration' : undefined}>Assign Suggested Department</Button>
            <label className="field"><span className="sr-only">Department to assign</span>
              <select className="input" value={chosen} onChange={e => setChosen(e.target.value)} aria-label="Department to assign to the selected journals"><option value="">Choose a department…</option>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
            <Button variant="outline" size="sm" onClick={() => openAsk('chosen')} disabled={!selected.size || !chosen || working}>Assign Selected Department</Button>
            <span className="text-[11.5px] text-muted">Department only. Status, licence, ISSN and publisher are never changed, and nothing is published.</span>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="text-[12.5px] text-alarm">{error}</p>}
      {outcome && (
        <section className="card card-pad" aria-label="Result of the last journal batch">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[15px] font-semibold text-ink">Last batch</h3><span className="text-[11.5px] text-muted">{outcome.mode === 'suggested' ? 'Each journal’s own suggestion' : 'One chosen department'} · {exactTime(outcome.when)}</span></div>
          <Tally t={outcome} />
          <p className="mt-2 text-[11.5px] text-muted">Journals that were skipped were left exactly as they were.</p>
        </section>
      )}

      <Dialog open={ask !== null} onClose={() => setAsk(null)} size="lg"
        title={ask?.mode === 'suggested' ? 'Assign suggested departments' : `Assign “${chosen}” to the selected journals`}
        description={<>{N(selected.size)} journal{selected.size === 1 ? '' : 's'} selected{ask?.mode === 'suggested' ? ' · each journal is assigned its own suggestion if it is still High or Medium confidence' : ''}</>}
        footer={<><Button variant="outline" onClick={() => setAsk(null)}>Cancel</Button><Button onClick={confirm} loading={working} disabled={ask?.loading || gateOff || !ask?.preview?.assigned} title={gateOff ? 'Disabled by configuration' : undefined}>Assign {ask?.preview ? N(ask.preview.assigned) : ''} Journals</Button></>}>
        {ask?.loading ? <span aria-hidden="true" className="skeleton block h-16" /> : ask?.preview && (
          <div className="mb-3 text-[13px] text-ink-2">
            <p>Selected: <b className="text-ink">{N(ask.preview.requested)}</b> · Would be assigned: <b className="text-ink">{N(ask.preview.assigned)}</b> · Would be skipped: <b className="text-ink">{N(ask.preview.skipped)}</b></p>
            {Object.keys(ask.preview.skippedReasons).length > 0 && <ul className="mt-1 space-y-0.5 text-[12.5px]">{Object.entries<number>(ask.preview.skippedReasons).sort((a, b) => b[1] - a[1]).map(([l, n]) => <li key={l} className="flex justify-between gap-3"><span>{l}</span><b className="tabular-nums text-ink">{N(n)}</b></li>)}</ul>}
            <p className="mt-1 text-[11.5px] text-muted">This is the server’s read of these journals right now; each is checked again just before it is written.{gateOff ? ' Assignment is disabled by configuration, so nothing can be written.' : ''}</p>
          </div>
        )}
        <div className="grid gap-3 text-[12.5px] sm:grid-cols-2">
          <div><div className="mb-1 font-semibold text-ink">This WILL</div><ul className="space-y-0.5 text-ink-2"><li>✓ assign the department</li><li>✓ keep each journal’s current status</li><li>✓ record who assigned it and on what evidence</li><li>✓ skip any journal that has changed</li></ul></div>
          <div><div className="mb-1 font-semibold text-ink">This WILL NOT</div><ul className="space-y-0.5 text-ink-2"><li>✕ publish, approve or reject anything</li><li>✕ change licence, rights, ISSN, eISSN or publisher</li><li>✕ overwrite a department</li><li>✕ touch rejected, partner-publisher or hand-verified journals</li></ul></div>
        </div>
      </Dialog>
    </div>
  );
}
