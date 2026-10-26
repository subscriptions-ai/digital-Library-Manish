import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Play, ShieldCheck } from 'lucide-react';
import { Badge, type BadgeTone } from '../../ui';
import { api } from '../ingestion/api';
import { N, exactTime } from '../ingestion/format';
import { ClassifierComparison } from './ClassifierComparison';

/**
 * Review automation R1 — Auto Classification. An analysis of the "Needs a department" queue that does not modify catalogue or content records: how many books the existing department classifier
 * could place with high, medium or low confidence, which thresholds that means, and which books sit in each group. Nothing here assigns, approves,
 * rejects or publishes anything; the numbers come from the server's own analysis of the queue, and nothing is shown that it did not measure.
 */

const TIERS = [
  { key: 'high', label: 'High confidence', tone: 'success' as BadgeTone, hint: 'A controlled subject code and the title or subject wording agree, with a clear lead.' },
  { key: 'medium', label: 'Medium confidence', tone: 'accent' as BadgeTone, hint: 'A clear leader, but on wording alone or with a narrow lead. A person should glance at it.' },
  { key: 'low', label: 'Low confidence', tone: 'caution' as BadgeTone, hint: 'Some evidence, but weak or tied with another department.' },
  { key: 'unclassifiable', label: 'Unclassifiable', tone: 'neutral' as BadgeTone, hint: 'Too little evidence to suggest a department.' },
] as const;
type TierKey = typeof TIERS[number]['key'];
const tierMeta = (k: string) => TIERS.find(t => t.key === k)!;

type Filters = { source: string; department: string; tier: string; minScore: string; maxScore: string; minMargin: string; maxMargin: string; yearFrom: string; yearTo: string; licence: string; language: string };
const NO_FILTERS: Filters = { source: '', department: '', tier: '', minScore: '', maxScore: '', minMargin: '', maxMargin: '', yearFrom: '', yearTo: '', licence: '', language: '' };
const LICENCES = ['Open licence', 'Non-commercial', 'No licence declared'];
const TAKE = 25;

const sumTiers = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);

function Bars({ data, order, onPick }: { data: Record<string, number>; order?: string[]; onPick?: (k: string) => void }) {
  const keys = order ? order.filter(k => data[k] != null) : Object.keys(data).sort((a, b) => data[b] - data[a]);
  const max = Math.max(1, ...keys.map(k => data[k]));
  return (
    <ul className="space-y-1">
      {keys.slice(0, 14).map(k => (
        <li key={k} className="flex items-center gap-2 text-[12px]">
          {onPick ? <button type="button" onClick={() => onPick(k)} className="w-36 shrink-0 truncate text-left text-ink-2 hover:text-accent hover:underline">{k}</button> : <span className="w-36 shrink-0 truncate text-ink-2">{k}</span>}
          <span className="h-2 flex-1 overflow-hidden rounded bg-surface-2"><span className="block h-full rounded bg-accent" style={{ width: `${(data[k] / max) * 100}%` }} /></span>
          <span className="w-14 shrink-0 text-right tabular-nums text-ink">{N(data[k])}</span>
        </li>
      ))}
    </ul>
  );
}

export function AutoClassification() {
  const [summary, setSummary] = useState<any>(null);
  const [cmp, setCmp] = useState<any>(null);
    const [job, setJob] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback(async () => {
    const r = await api('/api/admin/review/classification/summary');
    if (!r.ok) { setError(r.data?.error || 'Could not read the classification analysis.'); setLoaded(true); return null; }
    setSummary(r.data.summary); setJob(r.data.job); setError(null); setLoaded(true);
    return r.data;
  }, []);
  const loadComparison = useCallback(async () => { const r = await api('/api/admin/review/classification/comparison'); if (r.ok) setCmp(r.data.comparison); }, []);
  useEffect(() => { loadSummary(); loadComparison(); }, [loadSummary, loadComparison]);

  // While an analysis runs, keep up with it; when it ends, take the new summary.
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setInterval(async () => { const d = await loadSummary(); if (d && d.job.status !== 'running') loadComparison(); }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const run = async () => {
    const r = await api('/api/admin/review/classification/run', { method: 'POST', body: {} });
    if (r.ok || r.status === 409) { setJob(r.data.job); setError(null); } else setError(r.data?.error || 'Could not start the analysis.');
  };

  const compare = async () => {
    const r = await api('/api/admin/review/classification/compare', { method: 'POST', body: {} });
    if (r.ok || r.status === 409) { setJob(r.data.job); setError(null); } else setError(r.data?.error || 'Could not start the comparison.');
  };

  const loadRows = useCallback(async (p: number, f: Filters) => {
    setLoadingRows(true);
    const qs = new URLSearchParams({ page: String(p), limit: String(TAKE) });
    (Object.keys(f) as (keyof Filters)[]).forEach(k => { if (f[k] !== '') qs.set(k, f[k]); });
    const r = await api(`/api/admin/review/classification/records?${qs}`);
    setLoadingRows(false);
    if (r.ok) setResult(r.data); else setError(r.data?.error || 'Could not read the result.');
  }, []);
  useEffect(() => { if (summary) loadRows(page, filters); }, [summary?.finishedAt, page, filters, loadRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (patch: Partial<Filters>, scroll = false) => { setFilters(f => ({ ...f, ...patch })); setPage(1); if (scroll) setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const filtered = Object.values(filters).some(v => v !== '');
  const running = job?.status === 'running';

  if (!loaded) return <span aria-hidden="true" className="skeleton block h-40 w-full" />;
  const S = summary;
  const sources = S ? Object.keys(S.bySource).sort((a, b) => sumTiers(S.bySource[b]) - sumTiers(S.bySource[a])) : [];
  const languages = S ? Object.keys(S.byLanguage).sort((a, b) => S.byLanguage[b] - S.byLanguage[a]).slice(0, 20) : [];
  const departments = S ? S.byDepartment.map((d: any) => d.department).sort() : [];
  const rec = S?.recommendation;
  const th = S?.thresholds;

  return (
    <div className="space-y-4">
      <section className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><ShieldCheck size={13} aria-hidden="true" /> Auto classification</h2>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
              How well the existing department classifier can place the books waiting for a department. Classification analysis does not modify catalogue or content records; only analysis summaries and audit metadata are stored.
              It assigns nothing, approves nothing and publishes nothing. Assigning a department and publishing a book are separate decisions, and only a person publishes.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={running}><Play size={13} aria-hidden="true" /> {running && job.mode !== 'comparison' ? 'Analysing…' : S ? 'Run again' : 'Run Classification Analysis'}</button>
        </div>
        {running && (
          <div role="status" className="mt-3">
            <div className="flex justify-between text-[12px] text-muted"><span>{job.mode === 'comparison' ? 'Comparing classifier v1 and v2 · ' : ''}{job.phase}</span><span className="tabular-nums">{N(job.processed)} / {N(job.total)}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-surface-2"><div className="h-full rounded bg-accent transition-all" style={{ width: `${job.total ? Math.min(100, (job.processed / job.total) * 100) : 5}%` }} /></div>
          </div>
        )}
        {job?.status === 'failed' && <p role="alert" className="mt-3 text-[12.5px] text-alarm">The last analysis failed: {job.error}. Nothing was changed.</p>}
        {error && <p role="alert" className="mt-3 text-[12.5px] text-alarm">{error}</p>}
        {!S && !running && <p className="mt-3 text-[13px] text-ink-2">The queue has not been analysed yet. Running it reads every waiting book once and takes a short while; no figure below is shown until it has been measured.</p>}
      </section>

      <ClassifierComparison cmp={cmp} busy={!loaded} running={running} onRun={compare} />

      {S && (
        <>
          <section className="card card-pad" aria-label="Classification analysis">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-ink">{N(S.analysed)} books analysed</h3>
              <span className="text-[12px] text-muted">Analysed {exactTime(S.finishedAt)} · classifier rules v{S.rulesVersion}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted">
              {N(S.queueTotal)} waiting for a department when it started.{S.alreadyPlaced ? ` ${N(S.alreadyPlaced)} more already have a department and were left alone.` : ''}{S.withRejectionNote ? ` ${N(S.withRejectionNote)} carry a rejection note and were left out.` : ''}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {TIERS.map(t => (
                <button key={t.key} type="button" onClick={() => setFilter({ tier: t.key, department: '' }, true)} title={t.hint}
                  className={`rounded-lg border p-3 text-left transition hover:border-accent ${filters.tier === t.key ? 'border-accent bg-surface-2' : 'border-rule'}`}>
                  <Badge tone={t.tone}>{t.label}</Badge>
                  <div className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{N(S.tiers[t.key])}</div>
                  <div className="text-[11.5px] text-muted">{S.analysed ? `${Math.round((S.tiers[t.key] / S.analysed) * 1000) / 10}%` : '—'} · {t.hint}</div>
                </button>
              ))}
            </div>
            <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
              <div><dt className="text-[11px] text-muted">Could be placed without a person (High)</dt><dd className="text-lg font-semibold tabular-nums text-ink">{S.share.autoResolvable}%</dd></div>
              <div><dt className="text-[11px] text-muted">Batch review (Medium)</dt><dd className="text-lg font-semibold tabular-nums text-ink">{S.share.batchReview}%</dd></div>
              <div><dt className="text-[11px] text-muted">Needs a person, one by one (Low + Unclassifiable)</dt><dd className="text-lg font-semibold tabular-nums text-ink">{S.share.manual}%</dd></div>
            </dl>
            <p className="mt-2 text-[11.5px] text-muted">“Could be placed” means a department could be assigned. It does not mean the book would be published: rights, licence and access are decided separately and are never inferred from a department.</p>
          </section>

          <section className="card card-pad" aria-label="Confidence thresholds">
            <h3 className="text-[15px] font-semibold text-ink">Confidence thresholds <Badge tone="caution" className="ml-1">Provisional</Badge></h3>
            <p className="mt-0.5 text-[12px] text-muted">Nothing acts on these yet, and they are not final until the real production queue has been analysed; they are what this analysis used, and what the data suggests.</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="text-[12px] font-semibold text-ink">Used in this analysis (the classifier’s own rules)</h4>
                <ul className="mt-1 space-y-1 text-[12.5px] text-ink-2">
                  <li><b className="text-ink">High</b> — top score ≥ {th.highMinScore}, ahead of the next department by ≥ {th.highMinMargin}, and {th.highRequiresCode ? 'a controlled subject code and the title or subject wording both agree' : 'any evidence'}.</li>
                  <li><b className="text-ink">Medium</b> — top score ≥ {th.mediumMinScore} and ahead by ≥ {th.mediumMinMargin}, but not High (wording only, or a narrow lead).</li>
                  <li><b className="text-ink">Low</b> — top score ≥ {th.lowMinScore}, or tied with another department.</li>
                  <li><b className="text-ink">Unclassifiable</b> — below {th.lowMinScore}, or no evidence.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-[12px] font-semibold text-ink">Recommended for “High”</h4>
                <p className="mt-1 text-[12.5px] text-ink-2">
                  Top score ≥ <b className="text-ink">{rec.highMinScore}</b>, margin ≥ <b className="text-ink">{rec.highMinMargin}</b>, {rec.highRequiresCode ? 'a controlled code required' : 'no code required'} — covers <b className="text-ink">{rec.coverage}%</b> of the queue
                  {rec.precision != null && <> at <b className="text-ink">{rec.precision}%</b> agreement with people ({N(rec.calibrationSamples)} decisions)</>}.
                </p>
                <p className="mt-1 text-[12px] text-muted">{rec.reason}</p>
                {rec.basis === 'classifier-defaults' && <p className="mt-1 text-[12px] text-caution">Not yet calibrated: too few department decisions by people exist in this database to measure it.</p>}
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-ink hover:text-accent">How the tiers hold up against decisions people made ({N(S.calibration.sampleSize)})</summary>
              <p className="mt-1 text-[12px] text-muted">{S.calibration.note}</p>
              <table className="mt-2 w-full text-[12.5px]"><thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Tier</th><th className="font-medium">Decisions</th><th className="font-medium">Matched the person</th></tr></thead>
                <tbody>{TIERS.map(t => { const c = S.calibration.byTier[t.key]; return <tr key={t.key} className="border-t border-rule/60"><td className="py-1">{t.label}</td><td className="tabular-nums">{N(c.n)}</td><td className="tabular-nums">{c.n ? `${N(c.agreed)} (${Math.round((c.agreed / c.n) * 1000) / 10}%)` : '—'}</td></tr>; })}</tbody></table>
            </details>
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-ink hover:text-accent">What each possible rule would cover</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12px]"><thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Code required</th><th className="font-medium">Min score</th><th className="font-medium">Min margin</th><th className="font-medium">Books in queue</th><th className="font-medium">Matched people</th></tr></thead>
                  <tbody>{S.grid.filter((c: any) => [6, 7, 8, 10].includes(c.minScore) && [1, 2, 3, 4].includes(c.minMargin)).map((c: any) => (
                    <tr key={`${c.requireCode}-${c.minScore}-${c.minMargin}`} className="border-t border-rule/60"><td className="py-0.5">{c.requireCode ? 'Yes' : 'No'}</td><td>{c.minScore}</td><td>{c.minMargin}</td><td className="tabular-nums">{N(c.queue)}</td><td className="tabular-nums">{c.precision != null ? `${c.precision}% of ${N(c.reviewed)}` : 'no decisions'}</td></tr>))}</tbody></table>
              </div>
            </details>
          </section>

          <section className="card card-pad" aria-label="Suggested departments">
            <h3 className="text-[15px] font-semibold text-ink">By suggested department</h3>
            <p className="mt-0.5 text-[12px] text-muted">Click a department or a number to list those books below.</p>
            <div className="mt-2 max-h-96 overflow-auto">
              <table className="w-full min-w-[480px] text-[12.5px]">
                <thead className="sticky top-0 bg-surface"><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Department</th><th className="text-right font-medium">High</th><th className="text-right font-medium">Medium</th><th className="text-right font-medium">Low</th><th className="text-right font-medium">Total</th></tr></thead>
                <tbody>{S.byDepartment.map((d: any) => (
                  <tr key={d.department} className="border-t border-rule/60">
                    <td className="py-1"><button type="button" className="text-left font-medium text-ink hover:text-accent hover:underline" onClick={() => setFilter({ department: d.department, tier: '' }, true)}>{d.department}</button></td>
                    {(['high', 'medium', 'low'] as const).map(k => <td key={k} className="text-right tabular-nums">{d[k] ? <button type="button" className="hover:text-accent hover:underline" onClick={() => setFilter({ department: d.department, tier: k }, true)}>{N(d[k])}</button> : <span className="text-muted">0</span>}</td>)}
                    <td className="text-right font-semibold tabular-nums">{N(d.total)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </section>

          <section className="card card-pad" aria-label="Distributions">
            <h3 className="text-[15px] font-semibold text-ink">Distributions</h3>
            <div className="mt-3 grid gap-x-8 gap-y-5 lg:grid-cols-2">
              <div><h4 className="mb-1 text-[12px] font-semibold text-ink">Top score</h4><Bars data={S.scoreDistribution} order={Object.keys(S.scoreDistribution).sort((a, b) => parseInt(a) - parseInt(b))} /></div>
              <div><h4 className="mb-1 text-[12px] font-semibold text-ink">Lead over the next department (margin)</h4><Bars data={S.marginDistribution} order={Object.keys(S.marginDistribution).sort((a, b) => parseInt(a) - parseInt(b))} /></div>
              <div><h4 className="mb-1 text-[12px] font-semibold text-ink">Provider</h4>
                <Bars data={Object.fromEntries(sources.map(s => [s, sumTiers(S.bySource[s])]))} onPick={k => setFilter({ source: k }, true)} /></div>
              <div><h4 className="mb-1 text-[12px] font-semibold text-ink">Year</h4><Bars data={S.byYear} order={['Before 2000', '2000–2009', '2010–2019', '2020 or later', 'Unknown']} /></div>
              <div><h4 className="mb-1 text-[12px] font-semibold text-ink">Licence state</h4><Bars data={S.byLicence} onPick={k => setFilter({ licence: k }, true)} /></div>
              <div><h4 className="mb-1 text-[12px] font-semibold text-ink">Evidence behind the suggestion</h4>
                <Bars data={{ 'Code and wording': S.evidence.codeAndWords, 'Wording only': S.evidence.wordsOnly, 'Abstract only': S.evidence.abstractOnly, 'No evidence': S.evidence.noEvidence }} />
                <p className="mt-1 text-[11.5px] text-muted">Of the stored harvest suggestions, {N(S.versusStored.sameDepartment)} of {N(S.versusStored.compared)} name the same department under today’s rules{S.versusStored.differentDepartment ? `; ${N(S.versusStored.differentDepartment)} differ` : ''}.</p></div>
            </div>
          </section>

          <section ref={resultsRef} className="card" aria-label="Books in the analysis">
            <div className="border-b border-rule p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-ink">Books {result?.available ? <span className="font-normal text-muted">· {N(result.total)} match</span> : null}</h3>
                {filtered && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter(NO_FILTERS)}>Clear filters</button>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <label className="field"><span className="field-label">Provider</span>
                  <select className="input" value={filters.source} onChange={e => setFilter({ source: e.target.value })}><option value="">All</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
                <label className="field"><span className="field-label">Suggested department</span>
                  <select className="input" value={filters.department} onChange={e => setFilter({ department: e.target.value })}><option value="">All</option>{departments.map((d: string) => <option key={d}>{d}</option>)}</select></label>
                <label className="field"><span className="field-label">Confidence</span>
                  <select className="input" value={filters.tier} onChange={e => setFilter({ tier: e.target.value })}><option value="">All</option>{TIERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
                <label className="field"><span className="field-label">Licence state</span>
                  <select className="input" value={filters.licence} onChange={e => setFilter({ licence: e.target.value })}><option value="">All</option>{LICENCES.map(l => <option key={l}>{l}</option>)}</select></label>
                <label className="field"><span className="field-label">Language</span>
                  <select className="input" value={filters.language} onChange={e => setFilter({ language: e.target.value })}><option value="">All</option>{languages.map((l: string) => <option key={l} value={l}>{l}</option>)}</select></label>
                <div className="field"><span className="field-label">Top score</span>
                  <span className="flex gap-1"><input className="input" inputMode="numeric" placeholder="min" aria-label="Minimum top score" value={filters.minScore} onChange={e => setFilter({ minScore: e.target.value.replace(/\D/g, '') })} /><input className="input" inputMode="numeric" placeholder="max" aria-label="Maximum top score" value={filters.maxScore} onChange={e => setFilter({ maxScore: e.target.value.replace(/\D/g, '') })} /></span></div>
                <div className="field"><span className="field-label">Score margin</span>
                  <span className="flex gap-1"><input className="input" inputMode="numeric" placeholder="min" aria-label="Minimum margin" value={filters.minMargin} onChange={e => setFilter({ minMargin: e.target.value.replace(/\D/g, '') })} /><input className="input" inputMode="numeric" placeholder="max" aria-label="Maximum margin" value={filters.maxMargin} onChange={e => setFilter({ maxMargin: e.target.value.replace(/\D/g, '') })} /></span></div>
                <div className="field"><span className="field-label">Year</span>
                  <span className="flex gap-1"><input className="input" inputMode="numeric" placeholder="from" aria-label="Year from" value={filters.yearFrom} onChange={e => setFilter({ yearFrom: e.target.value.replace(/\D/g, '').slice(0, 4) })} /><input className="input" inputMode="numeric" placeholder="to" aria-label="Year to" value={filters.yearTo} onChange={e => setFilter({ yearTo: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></span></div>
              </div>
            </div>
            {result && !result.available ? (
              <p className="p-5 text-[13px] text-ink-2">The book-by-book result is kept in memory and the server has restarted since. <button type="button" className="font-semibold text-accent hover:underline" onClick={run} disabled={running}>Run the analysis again</button> to browse the books. The totals above are unaffected.</p>
            ) : loadingRows && !result ? <span aria-hidden="true" className="skeleton m-4 block h-32" />
              : !result?.records.length ? <p className="p-5 text-[13px] text-ink-2">No book matches these filters.</p> : (
                <ul className="divide-y divide-rule/60">
                  {result.records.map((r: any) => {
                    const t = tierMeta(r.tier);
                    return (
                      <li key={r.id} className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink">{r.title}</div>
                          <div className="text-[12px] text-muted">{r.authors || 'Unknown authors'} · {r.source}{r.year ? ` · ${r.year}` : ''} · {r.licenceState}{r.language ? ` · ${r.language}` : ''}</div>
                          <div className="mt-1 text-[12.5px] text-ink-2">
                            {r.suggested ? <>Suggested <b className="text-ink">{r.suggested}</b> ({r.score})</> : <>No department suggested</>}
                            {r.next ? <>, next {r.next.department} ({r.next.score})</> : null}
                            {r.evidence.length ? <> · evidence: {r.evidence.join(', ')}</> : null}
                          </div>
                          {r.reasons.length > 0 && <div className="mt-0.5 text-[11.5px] text-muted">{r.reasons.join(' · ')}</div>}
                          {r.originalUrl && <a href={r.originalUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:underline"><ExternalLink size={11} aria-hidden="true" /> Open at source</a>}
                        </div>
                        <div className="shrink-0 sm:text-right"><Badge tone={t.tone}>{t.label}</Badge><div className="mt-1 text-[11.5px] tabular-nums text-muted">margin {r.margin}</div></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            {result?.available && result.total > TAKE && (
              <div className="flex items-center justify-between border-t border-rule px-4 py-3 text-[12px] text-muted">
                <span>Page {page} of {Math.ceil(result.total / TAKE)}</span>
                <span className="flex gap-2">
                  <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={page * TAKE >= result.total} onClick={() => setPage(page + 1)}>Next</button>
                </span>
              </div>
            )}
            {result?.dropped > 0 && <p className="border-t border-rule px-4 py-2 text-[11.5px] text-muted">{result.dropped} book{result.dropped === 1 ? '' : 's'} on this page left the queue since the analysis and {result.dropped === 1 ? 'is' : 'are'} not shown.</p>}
          </section>
        </>
      )}
    </div>
  );
}
