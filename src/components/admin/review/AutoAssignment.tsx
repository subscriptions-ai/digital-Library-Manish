import { useCallback, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { Badge, Dialog, Button } from '../../ui';
import { api } from '../ingestion/api';
import { N, exactTime } from '../ingestion/format';
import { useAssignmentConfig, Tally, WillWont } from './shared';

/**
 * Auto-assign High Confidence: give a department to the waiting Books the chosen classifier is confident about, in bounded chunks, and nothing else.
 * It never publishes. It is off unless the deployment switches it on and an operator has approved the thresholds; until then this panel only previews.
 */
export function AutoAssignment({ summary }: { summary: any }) {
  const config = useAssignmentConfig();
  const [classifier, setClassifier] = useState<'' | 'v1' | 'v2'>('');
  const [source, setSource] = useState('');
  const [department, setDepartment] = useState('');
  const [state, setState] = useState<any>(null);          // { job, preview, busy }
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => { const r = await api('/api/admin/review/assignment/job'); if (r.ok) setState(r.data); return r.ok ? r.data : null; }, []);
  useEffect(() => { load(); }, [load]);
  const job = state?.job, preview = state?.preview;
  const jobLive = job?.status === 'running', previewLive = preview?.status === 'running';
  useEffect(() => { if (!jobLive && !previewLive) return; const t = setInterval(load, 1500); return () => clearInterval(t); }, [jobLive, previewLive, load]);

  const scope = { ...(source ? { source } : {}), ...(department ? { department } : {}) };
  const analysisClassifier: string = summary?.classifier ?? 'v1';
  const matchesAnalysis = !!classifier && classifier === analysisClassifier;
  const previewFits = preview?.status === 'done' && preview.classifier === classifier && JSON.stringify(preview.scope || {}) === JSON.stringify(scope);
  const th = config?.thresholds;
  const blocker =
    !config ? 'Loading…' : !config.enabled ? config.gateMessage || 'Historical auto-assignment is disabled by configuration.'
    : !th ? (config.thresholdsProblem || 'No thresholds have been approved.')
    : !classifier ? 'Choose the classifier first.'
    : !matchesAnalysis ? `The last analysis used classifier ${analysisClassifier}. Run the analysis with ${classifier} first.`
    : !previewFits ? 'Preview the assignment first.' : jobLive || job?.status === 'interrupted' ? 'An assignment job is already in progress.' : null;

  const post = async (path: string, body: any) => {
    setWorking(true); setError(null);
    const r = await api(path, { method: 'POST', body });
    setWorking(false);
    if (!r.ok) setError(r.data?.error || 'That did not work.');
    await load();
    return r;
  };
  const runPreview = () => classifier && post('/api/admin/review/assignment/preview', { classifier, scope });
  const start = async () => { setConfirm(false); await post('/api/admin/review/assignment/start', { classifier, scope, eligibleAtStart: preview?.eligible }); };

  const sources: string[] = summary ? Object.keys(summary.bySource) : [];
  const departments: string[] = summary ? summary.byDepartment.map((d: any) => d.department).sort() : [];
  const jobDone = job && ['done', 'cancelled', 'failed'].includes(job.status);

  return (
    <section className="card card-pad" aria-label="Auto assignment">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Bot size={15} aria-hidden="true" /> Auto assignment <Badge tone={config?.enabled ? 'caution' : 'neutral'}>{config?.enabled ? 'Enabled' : 'Disabled'}</Badge></h3>
          <p className="mt-0.5 max-w-2xl text-[12.5px] text-ink-2">Assigns a department to the books the classifier is highly confident about, in chunks, revalidating each book at the moment it is written. A book stays a Draft: nothing is published.</p>
        </div>
      </div>

      {config && !config.enabled && <p role="status" className="mt-3 rounded-lg border border-rule bg-surface-2 p-2.5 text-[12.5px] text-ink-2">{config.gateMessage || 'Historical auto-assignment is disabled by configuration.'} You can still preview what would qualify.</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="field"><span className="field-label">Classifier</span>
          <select className="input" value={classifier} onChange={e => setClassifier(e.target.value as any)}><option value="">Choose…</option><option value="v1">v1 (the engine’s classifier)</option><option value="v2">v2 (Dewey + rehabilitation fix)</option></select></label>
        <div className="field"><span className="field-label">Threshold</span>
          <div className="input flex items-center text-[12.5px]" aria-label="Approved High-confidence threshold">{th ? `High: score ≥ ${th.highMinScore}, margin ≥ ${th.highMinMargin}${th.highRequiresCode ? ', code + wording' : ''}` : 'None approved'}</div></div>
        <label className="field"><span className="field-label">Provider scope</span>
          <select className="input" value={source} onChange={e => setSource(e.target.value)}><option value="">All providers</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span className="field-label">Department scope</span>
          <select className="input" value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
      </div>
      {config && !th && <p className="mt-2 text-[12px] text-caution">{config.thresholdsProblem}</p>}
      {summary && classifier && !matchesAnalysis && <p className="mt-2 text-[12px] text-caution">The last analysis used classifier {analysisClassifier}; run the analysis with {classifier} to use it here.</p>}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-muted">Eligible now</div>
          <div className="text-2xl font-semibold tabular-nums text-ink">{previewLive ? '…' : previewFits ? N(preview.eligible) : '—'}</div>
          {previewLive && <div className="text-[11.5px] text-muted">{N(preview.processed)} / {N(preview.total)} books read</div>}
          {previewFits && <div className="text-[11.5px] text-muted">{preview.thresholdsApproved ? 'under the approved thresholds' : 'under the provisional thresholds (none approved yet)'} · {exactTime(preview.asOf)}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={runPreview} disabled={!classifier || previewLive || working || jobLive}>Preview Assignment</Button>
          <Button size="sm" onClick={() => setConfirm(true)} disabled={!!blocker || working} title={blocker || undefined}>Start Assignment</Button>
        </div>
      </div>
      {blocker && classifier !== '' && <p className="mt-1.5 text-[11.5px] text-muted">Start is unavailable: {blocker}</p>}
      {previewFits && preview.byDepartment.length > 0 && (
        <details className="mt-2"><summary className="cursor-pointer select-none text-[12.5px] font-semibold text-ink hover:text-accent">Where they would go</summary>
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-[12.5px] text-ink-2 sm:grid-cols-2">{preview.byDepartment.map((d: any) => <li key={d.department} className="flex justify-between gap-3"><span className="truncate">{d.department}</span><b className="tabular-nums text-ink">{N(d.n)}</b></li>)}</ul></details>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-alarm">{error}</p>}

      {job && (jobLive || job.status === 'interrupted') && (
        <div role="status" className="mt-4 rounded-lg border border-rule p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{job.status === 'interrupted' ? 'Auto-assignment interrupted' : 'Auto-assignment in progress'}</h4>
            <span className="text-[11.5px] text-muted">classifier {job.classifier} · started {exactTime(job.startedAt)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['Processed', `${N(job.requested)}${job.eligibleAtStart ? ` / ${N(job.eligibleAtStart)}` : ''}`], ['Assigned', N(job.assigned)], ['Skipped', N(job.skipped)], ['Failed', N(job.failed)]] as const).map(([l, v]) => <div key={l}><dt className="text-[11px] text-muted">{l}</dt><dd className="text-lg font-semibold tabular-nums text-ink">{v}</dd></div>)}
          </dl>
          {job.eligibleAtStart ? <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface-2"><div className="h-full rounded bg-accent transition-all" style={{ width: `${Math.min(100, (job.requested / Math.max(1, job.eligibleAtStart)) * 100)}%` }} /></div> : null}
          <p className="mt-1 text-[11.5px] text-muted">{N(job.scanned)} books read so far. Cancelling finishes the chunk in hand and stops; departments already assigned stay assigned.</p>
          <div className="mt-2 flex gap-2">
            {job.status === 'interrupted' && <Button size="sm" onClick={() => post('/api/admin/review/assignment/resume', {})} disabled={working}>Resume</Button>}
            <Button variant="outline" size="sm" onClick={() => post('/api/admin/review/assignment/cancel', {})} disabled={working || job.cancelRequested}>{job.cancelRequested ? 'Cancelling…' : job.status === 'interrupted' ? 'Cancel job' : 'Cancel remaining'}</Button>
          </div>
        </div>
      )}
      {jobDone && (
        <div className="mt-4 rounded-lg border border-rule p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Last assignment</h4>
            <span className="text-[11.5px] text-muted"><Badge tone={job.status === 'done' ? 'success' : job.status === 'cancelled' ? 'caution' : 'alarm'}>{job.status}</Badge> · classifier {job.classifier} · {exactTime(job.finishedAt)} · {job.by || 'unknown'}</span></div>
          <Tally t={job} />
          {job.error && <p className="mt-1 text-[12px] text-alarm">{job.error}</p>}
        </div>
      )}

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Auto-assign High Confidence" size="lg"
        description={<>Classifier <b>{classifier}</b> · {th ? `Top score ≥ ${th.highMinScore}, margin ≥ ${th.highMinMargin}${th.highRequiresCode ? ', controlled code + title/subject agreement' : ''}` : ''} · Scope: {source || 'all providers'}, {department || 'all departments'}</>}
        footer={<><Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button><Button onClick={start} loading={working}>Start assignment</Button></>}>
        <p className="mb-3 text-[13px] text-ink-2">Eligible now: <b className="text-ink">{N(preview?.eligible)}</b> books. Each is read again just before it is written; any that has changed is skipped, not forced.</p>
        <WillWont />
      </Dialog>
    </section>
  );
}
