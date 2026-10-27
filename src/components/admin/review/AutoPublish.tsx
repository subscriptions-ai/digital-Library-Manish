import { useCallback, useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { Badge, Button, Dialog } from '../../ui';
import { api } from '../ingestion/api';
import { N, exactTime } from '../ingestion/format';
import { useAssignmentConfig, Tally, PublishWillWont } from './shared';

/**
 * Publish Eligible High / Medium Confidence. Confidence is only confidence in the DEPARTMENT: the server also checks, book by book and again at the
 * moment of writing, that each book passes the publication rules. The eligible count shown here is the server's own, from a preview that reads the queue
 * and changes nothing; the browser never counts. High and Medium are separate actions; Low and Unclassifiable are not offered. Off unless the deployment
 * enables publication, which is a switch of its own.
 */

const TIER_TEXT = { high: 'High confidence', medium: 'Medium confidence' } as const;
type Tier = keyof typeof TIER_TEXT;

function Reasons({ reasons }: { reasons: Record<string, number> }) {
  const list = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  if (!list.length) return null;
  return <ul className="mt-1 space-y-0.5 text-[12.5px] text-ink-2">{list.map(([l, n]) => <li key={l} className="flex justify-between gap-3"><span>{l}</span><b className="tabular-nums text-ink">{N(n)}</b></li>)}</ul>;
}

export function AutoPublish({ summary }: { summary: any }) {
  const config = useAssignmentConfig();
  const [classifier, setClassifier] = useState<'' | 'v1' | 'v2'>('');
  const [source, setSource] = useState('');
  const [department, setDepartment] = useState('');
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState<Tier | null>(null);
  const [sample, setSample] = useState(false);
  const [sampleSeen, setSampleSeen] = useState(false);
  const [ack, setAck] = useState(false);

  const load = useCallback(async () => { const r = await api('/api/admin/review/publish/job'); if (r.ok) setState(r.data); }, []);
  useEffect(() => { load(); }, [load]);
  const job = state?.job, preview = state?.preview;
  const live = job?.status === 'running' || preview?.status === 'running';
  useEffect(() => { if (!live) return; const t = setInterval(load, 1500); return () => clearInterval(t); }, [live, load]);

  const scope = { ...(source ? { source } : {}), ...(department ? { department } : {}) };
  const gate = config?.publish;
  const th = config?.thresholds;
  const previewFor = (tier: Tier) => preview?.status === 'done' && preview.tier === tier && preview.classifier === classifier && JSON.stringify(preview.scope || {}) === JSON.stringify(scope) ? preview : null;
  const running = (t: Tier) => preview?.status === 'running' && preview.tier === t;
  const jobBusy = job?.status === 'running' || job?.status === 'interrupted';

  const blocker = (tier: Tier): string | null =>
    !config ? 'Loading…' : !gate?.enabled ? (gate?.message || 'Publication through Review Automation is disabled by configuration.') : !th ? (config.thresholdsProblem || 'No thresholds have been approved.')
    : !classifier ? 'Choose the classifier first.' : !previewFor(tier) ? 'Preview the publication first.' : jobBusy ? 'A publication job is already in progress.'
    : tier === 'medium' && !sampleSeen ? 'Review a sample first.' : previewFor(tier).eligible === 0 ? 'Nothing is eligible.' : null;

  const post = async (path: string, body: any) => { setWorking(true); setError(null); const r = await api(path, { method: 'POST', body }); setWorking(false); if (!r.ok) setError(r.data?.error || 'That did not work.'); await load(); return r; };
  const runPreview = (tier: Tier) => { setSampleSeen(false); setAck(false); return post('/api/admin/review/publish/preview', { classifier, tier, scope }); };
  const start = async () => { const tier = confirm!; setConfirm(null); await post('/api/admin/review/publish/start', { classifier, tier, scope, sampleReviewed: tier === 'medium' ? ack : undefined }); setAck(false); };

  const sources: string[] = summary ? Object.keys(summary.bySource) : [];
  const departments: string[] = summary ? summary.byDepartment.map((d: any) => d.department).sort() : [];
  const cp = confirm ? previewFor(confirm) : null;
  const done = job && ['done', 'cancelled', 'failed'].includes(job.status);

  const card = (tier: Tier) => {
    const p = previewFor(tier); const b = blocker(tier);
    return (
      <div className="rounded-lg border border-rule p-3" key={tier}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[13px] font-semibold text-ink">Publish Eligible {TIER_TEXT[tier]}</h4>
          <Badge tone={tier === 'high' ? 'success' : 'accent'}>{TIER_TEXT[tier]}</Badge>
        </div>
        {tier === 'medium' && <p className="mt-1 text-[12px] text-muted">Meets the publication rules, but the department classification is less certain. Review a sample before publishing in bulk.</p>}
        {running(tier) ? <p role="status" className="mt-2 text-[12.5px] text-muted">Checking {N(preview.processed)} / {N(preview.total)} books…</p>
          : p ? (
            <div className="mt-2 text-[12.5px]">
              <div className="grid grid-cols-3 gap-2"><div><div className="text-[11px] text-muted">{TIER_TEXT[tier]} books</div><div className="text-lg font-semibold tabular-nums text-ink">{N(p.candidates)}</div></div>
                <div><div className="text-[11px] text-muted">Eligible to publish</div><div className="text-lg font-semibold tabular-nums text-ink">{N(p.eligible)}</div></div>
                <div><div className="text-[11px] text-muted">Not eligible</div><div className="text-lg font-semibold tabular-nums text-ink">{N(p.ineligible)}</div></div></div>
              {p.ineligible > 0 && <div className="mt-2"><div className="text-[11px] font-semibold text-muted">Reasons</div><Reasons reasons={p.reasons} /></div>}
              <p className="mt-1 text-[11.5px] text-muted">{N(p.departmentsToAssign)} of the eligible books have no department yet and would be given their suggested one · {p.thresholdsApproved ? 'approved thresholds' : 'provisional thresholds (none approved)'} · {exactTime(p.asOf)}</p>
            </div>
          ) : <p className="mt-2 text-[12.5px] text-muted">Eligible now: —  (preview first)</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => runPreview(tier)} disabled={!classifier || !!live || working}>Preview Publication</Button>
          {tier === 'medium' && <Button variant="outline" size="sm" onClick={() => { setSample(true); setSampleSeen(true); }} disabled={!p}>Review Sample</Button>}
          <Button variant="highlight" size="sm" onClick={() => { setAck(false); setConfirm(tier); }} disabled={!!b || working} title={b || undefined}>Publish {p ? N(p.eligible) : ''} Eligible Books</Button>
        </div>
        {b && classifier !== '' && <p className="mt-1 text-[11.5px] text-muted">Publishing is unavailable: {b}</p>}
      </div>
    );
  };

  return (
    <section className="card card-pad" aria-label="Publish eligible books">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Globe size={15} aria-hidden="true" /> Publish eligible books <Badge tone={gate?.enabled ? 'caution' : 'neutral'}>{gate?.enabled ? 'Enabled' : 'Disabled'}</Badge></h3>
      <p className="mt-0.5 max-w-2xl text-[12.5px] text-ink-2">Makes books public. Confidence in a department is not a right to publish: every book also has to pass the publication rules (year, licence, rights, access, source scope, duplicates), checked again just before it is written. Previews change nothing.</p>
      {config && gate && !gate.enabled && <p role="status" className="mt-3 rounded-lg border border-rule bg-surface-2 p-2.5 text-[12.5px] text-ink-2">{gate.message} You can still preview what would be eligible.</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="field"><span className="field-label">Classifier</span>
          <select className="input" value={classifier} onChange={e => { setClassifier(e.target.value as any); setSampleSeen(false); }}><option value="">Choose…</option><option value="v1">v1 (the engine’s classifier)</option><option value="v2">v2 (Dewey + rehabilitation fix)</option></select></label>
        <label className="field"><span className="field-label">Provider scope</span><select className="input" value={source} onChange={e => setSource(e.target.value)}><option value="">All providers</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span className="field-label">Department scope</span><select className="input" value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
      </div>
      <p className="mt-1 text-[11.5px] text-muted">Threshold: {th ? `High — score ≥ ${th.highMinScore}, margin ≥ ${th.highMinMargin}${th.highRequiresCode ? ', controlled code + title/subject' : ''}; Medium — a clear leader that is not High` : 'none approved yet'}. Low and Unclassifiable books are never published in bulk.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{(['high', 'medium'] as Tier[]).map(card)}</div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-alarm">{error}</p>}

      {job && (job.status === 'running' || job.status === 'interrupted') && (
        <div role="status" className="mt-4 rounded-lg border border-rule p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{job.status === 'interrupted' ? 'Publication interrupted' : 'Publication in progress'} · {TIER_TEXT[job.tier as Tier]}</h4><span className="text-[11.5px] text-muted">classifier {job.classifier} · started {exactTime(job.startedAt)}</span></div>
          <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{([['Processed', `${N(job.requested)}${job.candidatesAtPreview ? ` / ${N(job.candidatesAtPreview)}` : ''}`], ['Published', N(job.published)], ['Skipped', N(job.skipped)], ['Failed', N(job.failed)]] as const).map(([l, v]) => <div key={l}><dt className="text-[11px] text-muted">{l}</dt><dd className="text-lg font-semibold tabular-nums text-ink">{v}</dd></div>)}</dl>
          {job.candidatesAtPreview ? <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface-2"><div className="h-full rounded bg-accent transition-all" style={{ width: `${Math.min(100, (job.requested / Math.max(1, job.candidatesAtPreview)) * 100)}%` }} /></div> : null}
          <p className="mt-1 text-[11.5px] text-muted">Cancelling finishes the chunk in hand and stops. Books already published stay published; nothing is rolled back.</p>
          <div className="mt-2 flex gap-2">{job.status === 'interrupted' && <Button size="sm" onClick={() => post('/api/admin/review/publish/resume', {})} disabled={working}>Resume</Button>}
            <Button variant="outline" size="sm" onClick={() => post('/api/admin/review/publish/cancel', {})} disabled={working || job.cancelRequested}>{job.cancelRequested ? 'Cancelling…' : job.status === 'interrupted' ? 'Cancel job' : 'Cancel remaining'}</Button></div>
        </div>
      )}
      {done && (
        <div className="mt-4 rounded-lg border border-rule p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Last publication · {TIER_TEXT[job.tier as Tier]}</h4>
            <span className="text-[11.5px] text-muted"><Badge tone={job.status === 'done' ? 'success' : job.status === 'cancelled' ? 'caution' : 'alarm'}>{job.status}</Badge> · classifier {job.classifier} · {exactTime(job.finishedAt)} · {job.by || 'unknown'}</span></div>
          <Tally t={{ ...job, assigned: job.published }} assignedLabel="Published" />
          {job.status === 'cancelled' && job.candidatesAtPreview != null && <p className="mt-1 text-[12px] text-muted">About {N(Math.max(0, job.candidatesAtPreview - job.requested))} books were not reached.</p>}
          {job.error && <p className="mt-1 text-[12px] text-alarm">{job.error}</p>}
        </div>
      )}

      <Dialog open={sample} onClose={() => setSample(false)} size="lg" title="Review a sample" description={preview?.tier === 'medium' ? `A representative sample of ${preview.sample.length} of the ${N(preview.candidates)} Medium-confidence books, each with whether it is eligible.` : undefined}
        footer={<Button onClick={() => setSample(false)}>Close</Button>}>
        <ul className="divide-y divide-rule/60">
          {(preview?.sample || []).map((s: any) => (
            <li key={s.id} className="py-2 text-[12.5px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold text-ink">{s.title}</span><Badge tone={s.eligible ? 'success' : 'neutral'}>{s.eligible ? 'Eligible' : s.reason}</Badge></div>
              <div className="text-[11.5px] text-muted">{s.source}{s.year ? ` · ${s.year}` : ''} · {s.licenceState} · Suggested {s.suggested} · score {s.score}, margin {s.margin} · evidence {s.evidence.join(' + ') || 'none'}</div>
            </li>))}
        </ul>
      </Dialog>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} size="lg" title={confirm === 'medium' ? 'Medium confidence publication' : 'High confidence publication'}
        description={<>Classifier <b>{classifier}</b> · {th ? (confirm === 'medium' ? `Medium: a clear leader (score ≥ ${th.mediumMinScore}, ahead by ≥ ${th.mediumMinMargin}) that is not High (score ≥ ${th.highMinScore}, margin ≥ ${th.highMinMargin}${th.highRequiresCode ? ', controlled code + title/subject' : ''})` : `High: score ≥ ${th.highMinScore}, margin ≥ ${th.highMinMargin}${th.highRequiresCode ? ', controlled code + title/subject' : ''}`) : ''} · Scope: {source || 'all providers'}, {department || 'all departments'}</>}
        footer={<><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="highlight" onClick={start} loading={working} disabled={confirm === 'medium' && !ack}>Publish {N(cp?.eligible)} Eligible Books</Button></>}>
        {cp && (
          <div className="mb-3 text-[13px] text-ink-2">
            <p>{TIER_TEXT[confirm!]} books: <b className="text-ink">{N(cp.candidates)}</b> · Eligible to publish: <b className="text-ink">{N(cp.eligible)}</b> · Not eligible: <b className="text-ink">{N(cp.ineligible)}</b></p>
            <Reasons reasons={cp.reasons} />
          </div>
        )}
        <PublishWillWont medium={confirm === 'medium'} />
        {confirm === 'medium' && (
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-rule p-2.5 text-[12.5px] text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={ack} onChange={e => setAck(e.target.checked)} /> I have reviewed a sample of these Medium-confidence books and want to publish the eligible ones.</label>
        )}
      </Dialog>
    </section>
  );
}
