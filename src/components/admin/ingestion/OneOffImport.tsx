import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download } from 'lucide-react';
import { Button, ConfirmDialog } from '../../ui';
import { api, download, pollJob } from './api';
import { N } from './format';
import { DepartmentPicker } from './ScopePanel';

const SOURCES = [
  { id: 'openalex', label: 'OpenAlex', hint: 'A broad index of scholarly works with journal, ISSN, volume and issue metadata.' },
  { id: 'doaj', label: 'DOAJ', hint: 'The Directory of Open Access Journals: articles from journals listed as open access.' },
  { id: 'europepmc', label: 'Europe PMC', hint: 'Life-science and medical literature, with open full text for part of it.' },
  { id: 'arxiv', label: 'arXiv', hint: 'Preprints with a PDF for each; no journal, ISSN or volume.' },
];
const STEPS = ['Source', 'Departments', 'Import limits', 'Access policy', 'Preview & ingest'];

export function OneOffImport({ engineRunning, onDone }: { engineRunning: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState('openalex');
  const [departments, setDepartments] = useState<string[]>([]);
  const [perDept, setPerDept] = useState('25');
  const [policy, setPolicy] = useState<'verifiable' | 'any'>('verifiable');
  const [dry, setDry] = useState<any>(null);          // the dry-run job as the server reports it
  const [write, setWrite] = useState<any>(null);      // the write job
  const [starting, setStarting] = useState<null | 'dry' | 'write'>(null);
  const [confirm, setConfirm] = useState(false);
  const stop = useRef<null | (() => void)>(null);

  const perDeptNum = /^\d+$/.test(perDept.trim()) ? Number(perDept) : NaN;
  const perDeptError = Number.isInteger(perDeptNum) && perDeptNum >= 1 && perDeptNum <= 300 ? null : 'Enter a whole number from 1 to 300.';
  const total = Number.isInteger(perDeptNum) ? perDeptNum * departments.length : 0;

  // A refreshed page picks up whatever is still running rather than offering to start it again.
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api('/api/admin/ingest/jobs/active');
      if (!alive || !r.ok) return;
      const j = r.data.jobs?.find((x: any) => x.kind === 'dry-run' || x.kind === 'write');
      if (!j) return;
      setStep(4);
      const set = j.kind === 'write' ? setWrite : setDry;
      stop.current = pollJob(j.jobId, set);
    })();
    return () => { alive = false; stop.current?.(); };
  }, []);

  const startDry = async () => {
    setStarting('dry'); setDry(null); setWrite(null);
    const r = await api('/api/admin/ingest/dry-run', { method: 'POST', body: { source, departments, perDept: perDeptNum, accessPolicy: policy } });
    setStarting(null);
    if (!r.ok) { toast.error(r.data?.error || 'The dry run could not start.'); return; }
    setStep(4); setDry({ status: 'running', progress: { done: 0, total: departments.length } });
    stop.current?.(); stop.current = pollJob(r.data.jobId, setDry);
  };

  const startWrite = async (retryFailed = false) => {
    setStarting('write'); setConfirm(false);
    const r = await api('/api/admin/ingest/run', { method: 'POST', body: { previewId: dry.previewId, retryFailed } });
    setStarting(null);
    if (!r.ok) { toast.error(r.data?.error || 'The import did not start.'); return; }
    setWrite({ status: 'running', progress: { done: 0, total: dry?.summary?.eligible || 0 } });
    stop.current?.();
    stop.current = pollJob(r.data.jobId, (j) => { setWrite(j); if (j.status === 'done') onDone(); });
  };

  const exportCsv = async () => { if (!(await download(`/api/admin/ingest/preview/${dry.previewId}/csv`, `ingest_preview_${source}.csv`))) toast.error('The export failed.'); };
  const reset = () => { stop.current?.(); setStep(0); setDry(null); setWrite(null); };

  const s = dry?.summary;
  const dryRunning = dry?.status === 'running';
  const writing = write?.status === 'running';
  const canNext = step === 1 ? departments.length > 0 : step === 2 ? !perDeptError : true;

  return (
    <section className="card card-pad" aria-labelledby="oneoff-heading">
      <h2 id="oneoff-heading" className="text-base font-semibold text-ink">One-off import</h2>
      <p className="mt-1 text-[13px] text-muted">Dry run first: it shows what would be added and writes nothing to the catalogue.</p>

      <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]" aria-label="Steps">
        {STEPS.map((l, i) => (
          <li key={l} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold text-ink' : i < step ? 'text-ink-2' : 'text-muted'}>
            <span className="tabular-nums">{i + 1}.</span> {l}
          </li>
        ))}
      </ol>

      <div className="mt-5">
        {step === 0 && (
          <div role="radiogroup" aria-label="Source" className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map(o => (
              <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${source === o.id ? 'border-accent bg-accent-soft' : 'border-rule hover:bg-surface-2'}`}>
                <input type="radio" name="source" className="mt-1 accent-[var(--accent-solid)]" checked={source === o.id} onChange={() => setSource(o.id)} />
                <span><span className="block text-[14px] font-semibold text-ink">{o.label}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">{o.hint}</span></span>
              </label>
            ))}
          </div>
        )}
        {step === 1 && (
          <>
            <DepartmentPicker value={departments} onChange={setDepartments} />
            {departments.length === 0 && <p role="note" className="mt-2 text-[13px] text-muted">Select at least one department to continue.</p>}
          </>
        )}
        {step === 2 && (
          <div className="max-w-sm">
            <label htmlFor="per-dept" className="field-label">Items per department</label>
            <input id="per-dept" className="input tabular-nums" inputMode="numeric" value={perDept} onChange={e => setPerDept(e.target.value)} aria-invalid={!!perDeptError} />
            {perDeptError ? <p className="field-error">{perDeptError}</p>
              : <p className="field-help">Up to {N(total)} records across {departments.length} department{departments.length === 1 ? '' : 's'} will be looked at (a ceiling of 300 per department).</p>}
          </div>
        )}
        {step === 3 && (
          <div role="radiogroup" aria-label="Access policy" className="grid gap-2">
            {([
              ['verifiable', 'Only records with verifiable open-access full text', 'Prioritizes accessible open-access content from supported academic sources. The file is opened to confirm it works before a record is marked eligible.'],
              ['any', 'Include records without full text', 'Records with no verifiable file are catalogued as metadata only, linking to the publisher.'],
            ] as const).map(([id, label, hint]) => (
              <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${policy === id ? 'border-accent bg-accent-soft' : 'border-rule hover:bg-surface-2'}`}>
                <input type="radio" name="policy" className="mt-1 accent-[var(--accent-solid)]" checked={policy === id} onChange={() => setPolicy(id)} />
                <span><span className="block text-[14px] font-semibold text-ink">{label}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">{hint}</span></span>
              </label>
            ))}
          </div>
        )}

        {step === 4 && (
          <div>
            {dryRunning && (
              <p role="status" className="text-[13px] text-ink-2">
                Running dry run… {dry.progress?.department ? `${dry.progress.department} — ` : ''}{N(dry.progress?.done)} of {N(dry.progress?.total)} departments. Nothing is being written.
              </p>
            )}
            {dry?.status === 'error' && <p role="alert" className="rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{dry.error}</p>}
            {dry?.status === 'done' && s && (
              <>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
                  {[['Found', s.found], ['Eligible', s.eligible], ['Already held', s.alreadyHeld], ['Needs review', s.needsReview], ['Rejected', s.rejected], ['Failed', s.errors]].map(([l, v]: any) => (
                    <div key={l} className="bg-surface px-3.5 py-3"><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
                  ))}
                </dl>
                <p className="mt-2 text-[12.5px] text-muted">
                  Of the {N(s.eligible)} eligible, {N(s.viewable)} would open in the viewer and {N(s.metadataOnly)} would link to the publisher. The dry run wrote nothing to the catalogue.
                  This preview expires {dry.expiresAt ? new Date(dry.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'in an hour'}.
                </p>
                {s.errors > 0 && <p role="status" className="mt-2 text-[12.5px] text-ink-2">{N(s.errors)} department{s.errors === 1 ? '' : 's'} could not be fetched; the rest are shown.</p>}

                {writing && <p role="status" className="mt-4 text-[13px] text-ink-2">Ingesting… {N(write.progress?.done)} of {N(write.progress?.total)} records.</p>}
                {write?.status === 'error' && <p role="alert" className="mt-4 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{write.error}</p>}
                {write?.status === 'done' && write.result && (
                  <p role="status" className="mt-4 rounded-lg border border-success/40 bg-success-soft px-3.5 py-3 text-[13px] text-ink">
                    Ingest finished: <b>{N(write.result.added)}</b> added, {N(write.result.held)} already held, {N(write.result.failed)} failed
                    {write.result.skippedNeedsReview ? `, ${N(write.result.skippedNeedsReview)} left for review` : ''}.
                    {write.result.failed > 0 && <> <button type="button" className="font-semibold underline" onClick={() => startWrite(true)}>Retry the {N(write.result.failed)} that failed</button></>}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={exportCsv}><Download size={15} aria-hidden="true" /> Export CSV</Button>
                  {!write && (
                    <Button onClick={() => setConfirm(true)} loading={starting === 'write'} disabled={s.eligible === 0 || starting !== null}>
                      {starting === 'write' ? 'Starting…' : `Ingest ${N(s.eligible)} Eligible Records`}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
        <Button variant="outline" onClick={() => (step === 4 && (dry || write) ? reset() : setStep(step - 1))} disabled={(step === 0) || dryRunning || writing || starting !== null}>
          {step === 4 && (dry || write) ? 'Start over' : 'Back'}
        </Button>
        {step < 3 && <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue</Button>}
        {step === 3 && <Button onClick={startDry} loading={starting === 'dry'} disabled={departments.length === 0}>{starting === 'dry' ? 'Starting…' : 'Run Dry Run'}</Button>}
      </div>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => startWrite(false)} loading={starting === 'write'}
        confirmLabel={`Ingest ${N(s?.eligible)} Records`} title="Ingest these records?"
        description={`${N(s?.eligible)} eligible records from the dry run will be added to the catalogue. Each is checked again just before it is written, and existing records are never overwritten.${engineRunning ? ' The continuous engine is running; both can work safely side by side.' : ''}`} />
    </section>
  );
}
