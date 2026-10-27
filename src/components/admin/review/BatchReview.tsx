import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Layers } from 'lucide-react';
import { Badge, Button, Dialog, type BadgeTone } from '../../ui';
import { api } from '../ingestion/api';
import { N, exactTime } from '../ingestion/format';
import { useAssignmentConfig, Tally, WillWont, PublishWillWont } from './shared';

/**
 * Batch Review: the books the classifier is fairly but not fully sure about. A person filters, ticks, and assigns — the suggested department for each
 * book, or one department for all of them. Selection is a list of at most 250 ids; the server revalidates every one at the moment of writing and skips
 * any that has changed. Department only: nothing here approves, rejects or publishes.
 */

const TIER: Record<string, { label: string; tone: BadgeTone }> = {
  high: { label: 'High confidence', tone: 'success' }, medium: { label: 'Medium confidence', tone: 'accent' }, low: { label: 'Low confidence', tone: 'caution' }, unclassifiable: { label: 'Unclassifiable', tone: 'neutral' },
};
type Filters = { source: string; department: string; tier: string; minScore: string; maxScore: string; minMargin: string; maxMargin: string; yearFrom: string; yearTo: string; licence: string; language: string };
const START: Filters = { source: '', department: '', tier: 'medium', minScore: '', maxScore: '', minMargin: '', maxMargin: '', yearFrom: '', yearTo: '', licence: '', language: '' };
const LICENCES = ['Open licence', 'Non-commercial', 'No licence declared'];
const TAKE = 50;
const evidenceText = (r: any) => (r.evidence as string[]).map(e => (e === 'code' ? (r.ddc ? 'DDC' : 'Code') : e === 'title' ? 'Title' : e === 'subject' ? 'Subject' : 'Abstract')).join(' + ') || 'none';
const qs = (f: Filters, extra: Record<string, string>) => { const p = new URLSearchParams(extra); (Object.keys(f) as (keyof Filters)[]).forEach(k => { if (f[k] !== '') p.set(k, f[k]); }); return p.toString(); };

export function BatchReview() {
  const config = useAssignmentConfig();
  const [summary, setSummary] = useState<any>(null);
  const [filters, setFilters] = useState<Filters>(START);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState('');
  const [ask, setAsk] = useState<null | 'suggested' | 'chosen'>(null);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pub, setPub] = useState<null | { loading: boolean; preview: any | null }>(null);

  useEffect(() => { api('/api/admin/review/classification/summary').then(r => { if (r.ok) setSummary(r.data.summary); }); }, []);
  const load = useCallback(async (p: number, f: Filters) => {
    setLoading(true);
    const r = await api(`/api/admin/review/classification/records?${qs(f, { page: String(p), limit: String(TAKE) })}`);
    setLoading(false);
    if (r.ok) setResult(r.data); else setError(r.data?.error || 'Could not read the books.');
  }, []);
  useEffect(() => { load(page, filters); }, [page, filters, load]);

  // Changing a filter clears the selection: what is ticked should always be what is on screen or was chosen with "Select first N" for the filter in force.
  const set = (patch: Partial<Filters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); setSelected(new Set()); };
  const classifier: 'v1' | 'v2' = result?.records?.[0]?.classifier ?? summary?.classifier ?? 'v1';
  const rows: any[] = result?.records || [];
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectFirst = async (n: number) => {
    const r = await api(`/api/admin/review/classification/records?${qs(filters, { idsOnly: '1', limit: String(n) })}`);
    if (r.ok) setSelected(new Set<string>(r.data.ids));
  };
  const gateOff = !config?.enabled;
  const limit = config?.batchLimit ?? 250;

  const run = async (mode: 'suggested' | 'chosen') => {
    setWorking(true); setError(null);
    const r = await api('/api/admin/review/batch/assign', { method: 'POST', body: { ids: [...selected], mode, classifier, ...(mode === 'chosen' ? { department: chosen } : {}) } });
    setWorking(false); setAsk(null);
    if (!r.ok) { setError(r.data?.error || 'That did not work.'); return; }
    setOutcome({ ...r.data, mode, when: new Date().toISOString() });
    const gone = new Set<string>(r.data.outcomes.filter((o: any) => o.result === 'assigned' || o.reason === 'Department already assigned' || o.reason === 'Rejected' || o.reason === 'No longer a Draft' || o.reason === 'Record missing').map((o: any) => o.id));
    setSelected(s => new Set([...s].filter(id => !gone.has(id))));
    load(page, filters);
  };

  // Publish Selected Eligible: the server previews what would happen to exactly these books, then publishes only those that pass every rule right now.
  const publishOff = !config?.publish?.enabled;
  const openPublish = async () => {
    setPub({ loading: true, preview: null }); setError(null);
    const r = await api('/api/admin/review/publish/selected/preview', { method: 'POST', body: { ids: [...selected], classifier } });
    if (!r.ok) { setPub(null); setError(r.data?.error || 'Could not preview the publication.'); return; }
    setPub({ loading: false, preview: r.data });
  };
  const runPublish = async () => {
    setWorking(true); setError(null);
    const r = await api('/api/admin/review/publish/selected', { method: 'POST', body: { ids: [...selected], classifier } });
    setWorking(false); setPub(null);
    if (!r.ok) { setError(r.data?.error || 'That did not work.'); return; }
    setOutcome({ ...r.data, assigned: r.data.published, mode: 'publish', when: new Date().toISOString() });
    const gone = new Set<string>(r.data.outcomes.filter((o: any) => o.result === 'published' || ['already_published', 'rejected', 'no_longer_draft', 'record_missing'].includes(o.reason)).map((o: any) => o.id));
    setSelected(s => new Set([...s].filter(id => !gone.has(id))));
    load(page, filters);
  };

  const sources: string[] = summary ? Object.keys(summary.bySource) : [];
  const depts: string[] = summary ? summary.byDepartment.map((d: any) => d.department).sort() : [];
  const languages: string[] = summary ? Object.keys(summary.byLanguage).sort((a, b) => summary.byLanguage[b] - summary.byLanguage[a]).slice(0, 20) : [];

  return (
    <div className="space-y-4">
      <section className="card card-pad">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><Layers size={13} aria-hidden="true" /> Batch review</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-2">Review books the classifier is fairly sure about, a batch at a time. Assigning a department keeps each book a Draft and publishes nothing. Every book is checked again just before it is written, and any that has changed is skipped.</p>
        {config && gateOff && <p role="status" className="mt-2 rounded-lg border border-rule bg-surface-2 p-2.5 text-[12.5px] text-ink-2">{config.gateMessage || 'Historical auto-assignment is disabled by configuration.'} You can review and filter books, but assigning is switched off.</p>}
      </section>

      <section className="card" aria-label="Batch review">
        <div className="border-b border-rule p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <label className="field"><span className="field-label">Provider</span><select className="input" value={filters.source} onChange={e => set({ source: e.target.value })}><option value="">All</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="field"><span className="field-label">Suggested department</span><select className="input" value={filters.department} onChange={e => set({ department: e.target.value })}><option value="">All</option>{depts.map(d => <option key={d}>{d}</option>)}</select></label>
            <label className="field"><span className="field-label">Confidence</span><select className="input" value={filters.tier} onChange={e => set({ tier: e.target.value })}><option value="">All</option>{Object.entries(TIER).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label className="field"><span className="field-label">Licence state</span><select className="input" value={filters.licence} onChange={e => set({ licence: e.target.value })}><option value="">All</option>{LICENCES.map(l => <option key={l}>{l}</option>)}</select></label>
            <label className="field"><span className="field-label">Language</span><select className="input" value={filters.language} onChange={e => set({ language: e.target.value })}><option value="">All</option>{languages.map(l => <option key={l}>{l}</option>)}</select></label>
            <div className="field"><span className="field-label">Top score</span><span className="flex gap-1"><input className="input" inputMode="numeric" placeholder="min" aria-label="Minimum top score" value={filters.minScore} onChange={e => set({ minScore: e.target.value.replace(/\D/g, '') })} /><input className="input" inputMode="numeric" placeholder="max" aria-label="Maximum top score" value={filters.maxScore} onChange={e => set({ maxScore: e.target.value.replace(/\D/g, '') })} /></span></div>
            <div className="field"><span className="field-label">Score margin</span><span className="flex gap-1"><input className="input" inputMode="numeric" placeholder="min" aria-label="Minimum margin" value={filters.minMargin} onChange={e => set({ minMargin: e.target.value.replace(/\D/g, '') })} /><input className="input" inputMode="numeric" placeholder="max" aria-label="Maximum margin" value={filters.maxMargin} onChange={e => set({ maxMargin: e.target.value.replace(/\D/g, '') })} /></span></div>
            <div className="field"><span className="field-label">Year</span><span className="flex gap-1"><input className="input" inputMode="numeric" placeholder="from" aria-label="Year from" value={filters.yearFrom} onChange={e => set({ yearFrom: e.target.value.replace(/\D/g, '').slice(0, 4) })} /><input className="input" inputMode="numeric" placeholder="to" aria-label="Year to" value={filters.yearTo} onChange={e => set({ yearTo: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></span></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(s => new Set([...s, ...rows.map(r => r.id)]))} disabled={!rows.length}>Select visible</Button>
            {[50, 100, 250].filter(n => n <= limit).map(n => <Button key={n} variant="outline" size="sm" onClick={() => selectFirst(n)} disabled={!result?.total}>Select first {n}</Button>)}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>Clear selection</Button>
            <span className="text-[12px] text-muted" aria-live="polite">{selected.size ? `${N(selected.size)} selected (up to ${limit} at a time)` : 'Nothing selected'}</span>
          </div>
        </div>

        {result && !result.available ? (
          <p className="p-5 text-[13px] text-ink-2">There is no analysis in memory. Open <b>Auto Classification</b> and run the classification analysis; Batch Review lists the books from it.</p>
        ) : loading && !result ? <span aria-hidden="true" className="skeleton m-4 block h-32" />
          : !rows.length ? <p className="p-5 text-[13px] text-ink-2">No book matches these filters.</p> : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/60 px-4 py-2 text-[12px] text-muted"><span>{N(result.total)} match · classifier {classifier} · analysed {exactTime(result.asOf)}</span><span>Page {page} of {Math.max(1, Math.ceil(result.total / TAKE))}</span></div>
              <ul className="divide-y divide-rule/60">
                {rows.map(r => (
                  <li key={r.id} className="flex items-start gap-3 p-4">
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 font-semibold text-ink">{r.title}</span>
                        <Badge tone={TIER[r.tier].tone}>{TIER[r.tier].label}</Badge>
                      </div>
                      <div className="text-[12px] text-muted">{r.authors || 'Unknown authors'} · {r.source}{r.year ? ` · ${r.year}` : ''} · {r.licenceState} · classifier {r.classifier}</div>
                      <div className="mt-1 text-[12.5px] text-ink-2">Suggested <b className="text-ink">{r.suggested ?? 'nothing'}</b> · Score {r.score}{r.next ? <> · Next {r.next.department} ({r.next.score})</> : null} · Margin {r.margin}</div>
                      <div className="text-[12px] text-muted">Evidence: {evidenceText(r)}</div>
                      {r.originalUrl && <a href={r.originalUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:underline"><ExternalLink size={11} aria-hidden="true" /> Open at source</a>}
                    </div>
                  </li>
                ))}
              </ul>
              {result.total > TAKE && (
                <div className="flex items-center justify-between border-t border-rule px-4 py-3 text-[12px] text-muted"><span>{N(result.total)} books</span>
                  <span className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page * TAKE >= result.total} onClick={() => setPage(page + 1)}>Next</Button></span></div>
              )}
            </>
          )}

        <div className="sticky bottom-0 border-t border-rule bg-surface p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Button size="sm" onClick={() => setAsk('suggested')} disabled={gateOff || !selected.size || working} title={gateOff ? 'Assignment is disabled by configuration' : undefined}>Assign Suggested Departments</Button>
            <label className="field"><span className="sr-only">Department to assign</span>
              <select className="input" value={chosen} onChange={e => setChosen(e.target.value)} aria-label="Department to assign to the selected books"><option value="">Choose a department…</option>{(config?.departments || []).map(d => <option key={d}>{d}</option>)}</select></label>
            <Button variant="outline" size="sm" onClick={() => setAsk('chosen')} disabled={gateOff || !selected.size || !chosen || working}>Assign Selected Department</Button>
            <Button variant="highlight" size="sm" onClick={openPublish} disabled={publishOff || !selected.size || working} title={publishOff ? (config?.publish?.message || 'Publication is disabled by configuration') : 'Previews, then publishes only the selected books that pass every publication rule'}>Publish Selected Eligible</Button>
            <span className="text-[11.5px] text-muted">{publishOff ? 'Publishing is off. ' : ''}Approving and rejecting stay on the “Needs a department” tab, one book at a time.</span>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="text-[12.5px] text-alarm">{error}</p>}
      {outcome && (
        <section className="card card-pad" aria-label="Result of the last batch">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[15px] font-semibold text-ink">Last batch</h3><span className="text-[11.5px] text-muted">{outcome.mode === 'suggested' ? 'Each book’s own suggestion' : outcome.mode === 'publish' ? 'Publish selected eligible' : `Chosen department: ${chosen || '—'}`} · {exactTime(outcome.when)}</span></div>
          <Tally t={outcome} assignedLabel={outcome.mode === 'publish' ? 'Published' : 'Assigned'} />
          <p className="mt-2 text-[11.5px] text-muted">{outcome.mode === 'publish' ? 'Published books are now on the public catalogue; the rest were skipped for the reasons shown, and nothing about them was changed.' : 'Assigned books stay Drafts with their department set; they are not published.'}</p>
        </section>
      )}

      <Dialog open={pub !== null} onClose={() => setPub(null)} size="lg" title="Publish selected eligible books"
        description={<>{N(selected.size)} book{selected.size === 1 ? '' : 's'} selected · classifier {classifier} · only High or Medium confidence books are considered</>}
        footer={<><Button variant="outline" onClick={() => setPub(null)}>Cancel</Button><Button variant="highlight" onClick={runPublish} loading={working} disabled={pub?.loading || !pub?.preview?.published}>Publish {N(pub?.preview?.published)} Eligible Books</Button></>}>
        {pub?.loading ? <span aria-hidden="true" className="skeleton block h-16" /> : pub?.preview && (
          <div className="mb-3 text-[13px] text-ink-2">
            <p>Selected: <b className="text-ink">{N(pub.preview.requested)}</b> · Eligible to publish: <b className="text-ink">{N(pub.preview.published)}</b> · Not eligible: <b className="text-ink">{N(pub.preview.skipped)}</b></p>
            {Object.keys(pub.preview.skippedReasons).length > 0 && <ul className="mt-1 space-y-0.5 text-[12.5px]">{Object.entries<number>(pub.preview.skippedReasons).sort((a, b) => b[1] - a[1]).map(([l, n]) => <li key={l} className="flex justify-between gap-3"><span>{l}</span><b className="tabular-nums text-ink">{N(n)}</b></li>)}</ul>}
            <p className="mt-1 text-[11.5px] text-muted">This is the server’s read of these books right now; each is checked again just before it is written.</p>
          </div>
        )}
        <PublishWillWont />
      </Dialog>

      <Dialog open={ask !== null} onClose={() => setAsk(null)} size="lg"
        title={ask === 'suggested' ? 'Assign suggested departments' : `Assign “${chosen}” to the selected books`}
        description={<>{N(selected.size)} book{selected.size === 1 ? '' : 's'} selected · classifier {classifier}{ask === 'suggested' ? ' · each book is assigned its own suggestion if it is still High or Medium confidence' : ''}</>}
        footer={<><Button variant="outline" onClick={() => setAsk(null)}>Cancel</Button><Button onClick={() => ask && run(ask)} loading={working}>Assign</Button></>}>
        <WillWont />
      </Dialog>
    </div>
  );
}
