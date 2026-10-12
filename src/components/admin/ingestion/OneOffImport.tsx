import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download } from 'lucide-react';
import { Button, ConfirmDialog } from '../../ui';
import { api, download, pollJob } from './api';
import { N } from './format';
import { DepartmentPicker } from './ScopePanel';
import { SourceCards, type Kind, type SourceCard } from './SourceCards';
import { QuickImportPanel, type QuickJobView } from './QuickImportPanel';

/**
 * Bringing material in by hand.
 *
 * Two ways in, side by side on every source: Quick Import (a bounded batch, one confirmation, straight away) and Configure
 * (the five-step wizard: choose, check first, then import exactly what the check found). Neither replaces the continuous
 * engine, and neither moves where it is up to.
 */

type Group = SourceCard['group'];

const STEPS: Record<Group, string[]> = {
  Articles: ['Source', 'Departments', 'Import limits', 'Access policy', 'Preview & ingest'],
  Journals: ['Source', 'Departments', 'Import limits', 'Licence rules', 'Preview & ingest'],
  Books: ['Source', 'Scope', 'Import limits', 'Rights', 'Preview & ingest'],
};

/** The wizard and the server call DOAJ-the-journal-directory by its own id; the cards call it "doaj". */
const apiSource = (id: string) => (id === 'doaj' ? 'doaj-journals' : id);
const maxFor = (g: Group, id: string) => (g === 'Articles' ? 300 : g === 'Journals' ? 2000 : id === 'ncbi' ? 25 : 500);
const defaultFor = (c: SourceCard) => (c.group === 'Articles' ? '25' : String(c.limit));

const normaliseQuick = (j: any): QuickJobView => ({
  ...j,
  error: j?.error == null ? null : typeof j.error === 'string' ? { code: 'FAILED', message: j.error, until: null, written: 0 } : j.error,
});

export function OneOffImport({ engineRunning, onDone }: { engineRunning: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [sources, setSources] = useState<SourceCard[] | null>(null);
  const [filter, setFilter] = useState<Kind>('all');
  const [sourcesError, setSourcesError] = useState(false);
  const [source, setSource] = useState('crossref');
  // Nothing is highlighted on the Source step until a source has actually been chosen with Configure.
  const [chosen, setChosen] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [perDept, setPerDept] = useState('25');
  const [policy, setPolicy] = useState<'verifiable' | 'any'>('verifiable');
  const [dry, setDry] = useState<any>(null);          // the dry-run job as the server reports it
  const [write, setWrite] = useState<any>(null);      // the write job
  const [starting, setStarting] = useState<null | 'dry' | 'write' | string>(null);
  const [confirm, setConfirm] = useState(false);
  const [quickAsk, setQuickAsk] = useState<SourceCard | null>(null);
  const [quick, setQuick] = useState<QuickJobView | null>(null);
  const stop = useRef<null | (() => void)>(null);
  const stopQuick = useRef<null | (() => void)>(null);

  const card = sources?.find(s => s.id === source) || null;
  const group: Group = card?.group ?? 'Articles';
  const steps = STEPS[group];
  const max = maxFor(group, source);

  const perNum = /^\d+$/.test(perDept.trim()) ? Number(perDept) : NaN;
  const perError = Number.isInteger(perNum) && perNum >= 1 && perNum <= max ? null : `Enter a whole number from 1 to ${N(max)}.`;
  const total = Number.isInteger(perNum) ? perNum * Math.max(1, departments.length) : 0;

  const loadSources = useCallback(async () => {
    const r = await api('/api/admin/ingest/sources');
    // Only a real list counts: a server that does not know this route can answer with a web page, which must not look like success.
    if (r.ok && Array.isArray(r.data?.sources)) { setSources(r.data.sources); setSourcesError(false); }
    else setSourcesError(true);
  }, []);
  useEffect(() => { loadSources(); const t = setInterval(loadSources, 10_000); return () => clearInterval(t); }, [loadSources]);

  const follow = (jobId: string) => {
    stopQuick.current?.();
    stopQuick.current = pollJob(jobId, (j) => {
      setQuick(normaliseQuick(j));
      if (j.status && j.status !== 'running') { onDone(); loadSources(); }
    }, 1500, '/api/admin/ingest/quick');
  };

  // A refreshed page picks up whatever is still running rather than offering to start it again.
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api('/api/admin/ingest/jobs/active');
      if (!alive || !r.ok) return;
      const q = r.data.quick?.[0];
      if (q) { follow(q.jobId); return; }
      const j = r.data.jobs?.find((x: any) => x.kind === 'dry-run' || x.kind === 'write');
      if (!j) return;
      setStep(4);
      const set = j.kind === 'write' ? setWrite : setDry;
      stop.current = pollJob(j.jobId, set);
    })();
    return () => { alive = false; stop.current?.(); stopQuick.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Quick Import ──
  const startQuick = async (c: SourceCard) => {
    setQuickAsk(null); setStarting(c.id);
    const r = await api('/api/admin/ingest/quick', { method: 'POST', body: { provider: c.id, confirm: true } });
    setStarting(null);
    if (!r.ok) { toast.error(r.data?.error || 'The Quick Import could not start.'); loadSources(); return; }
    setQuick({ jobId: r.data.jobId, provider: c.id, label: c.label, group: c.group, status: 'running', limit: r.data.limit, result: null, error: null,
      progress: { stage: 'Checking the source…', checked: 0, limit: r.data.limit, added: 0, held: 0, review: 0, skipped: 0, failed: 0, open: true } });
    follow(r.data.jobId);
    loadSources();
  };
  const closeQuick = () => { stopQuick.current?.(); setQuick(null); loadSources(); };
  const toActivity = () => document.getElementById('activity-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── The wizard ──
  const configure = (c: SourceCard) => { setSource(c.id); setChosen(true); setPerDept(defaultFor(c)); setDry(null); setWrite(null); setStep(1); };

  const startDry = async () => {
    setStarting('dry'); setDry(null); setWrite(null);
    const r = await api('/api/admin/ingest/dry-run', { method: 'POST', body: { source: apiSource(source), departments: group === 'Books' ? [] : departments, perDept: perNum, accessPolicy: policy } });
    setStarting(null);
    if (!r.ok) { toast.error(r.data?.error || 'The dry run could not start.'); loadSources(); return; }
    setStep(4); setDry({ status: 'running', progress: { done: 0, total: group === 'Articles' ? departments.length : 1 } });
    stop.current?.(); stop.current = pollJob(r.data.jobId, setDry);
  };

  const startWrite = async (retryFailed = false) => {
    setStarting('write'); setConfirm(false);
    const r = await api('/api/admin/ingest/run', { method: 'POST', body: { previewId: dry.previewId, retryFailed } });
    setStarting(null);
    if (!r.ok) { toast.error(r.data?.error || 'The import did not start.'); return; }
    setWrite({ status: 'running', progress: { done: 0, total: dry?.summary?.eligible || 0 } });
    stop.current?.();
    stop.current = pollJob(r.data.jobId, (j) => { setWrite(j); if (j.status === 'done') { onDone(); loadSources(); } });
  };

  const exportCsv = async () => { if (!(await download(`/api/admin/ingest/preview/${dry.previewId}/csv`, `ingest_preview_${source}.csv`))) toast.error('The export failed.'); };
  const reset = () => { stop.current?.(); setStep(0); setDry(null); setWrite(null); };

  const s = dry?.summary;
  const dryRunning = dry?.status === 'running';
  const writing = write?.status === 'running';
  const canNext = step === 1 ? (group === 'Articles' ? departments.length > 0 : true) : step === 2 ? !perError : true;

  const tiles: [string, any][] = group === 'Journals'
    ? [['In DOAJ’s list', s?.found], ['New to add', s?.eligible], ['Already held', s?.alreadyHeld], ['Needs review', s?.needsReview], ['Rejected', s?.rejected], ['Failed', s?.errors]]
    : group === 'Books'
      ? [[source === 'ncbi' ? 'Shortlisted' : 'Records read', s?.found], ['Would import', s?.eligible], ['Already held', s?.alreadyHeld], ['For review', s?.needsReview], ['No department', s?.rejected], ['Failed', s?.errors]]
      : [['Found', s?.found], ['Eligible', s?.eligible], ['Already held', s?.alreadyHeld], ['Needs review', s?.needsReview], ['Rejected', s?.rejected], ['Failed', s?.errors]];
  const writeLabel = group === 'Journals' ? `Add ${N(s?.eligible)} Journals` : group === 'Books' ? `Import ${N(s?.eligible)} Books` : `Ingest ${N(s?.eligible)} Eligible Records`;

  return (
    <section className="card card-pad" aria-labelledby="oneoff-heading">
      <h2 id="oneoff-heading" className="text-base font-semibold text-ink">One-off import</h2>
      <p className="mt-1 text-[13px] text-muted">
        Bring in a bounded batch by hand — useful when the continuous engine is slow, paused or rate limited. The engine keeps running, and nothing here moves where it is up to.
      </p>

      <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]" aria-label="Steps">
        {steps.map((l, i) => (
          <li key={l} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold text-ink' : i < step ? 'text-ink-2' : 'text-muted'}>
            <span className="tabular-nums">{i + 1}.</span> {l}
          </li>
        ))}
      </ol>

      <div className="mt-5">
        {step === 0 && (
          <>
            {quick && <QuickImportPanel job={quick} onMore={() => { const c = sources?.find(x => x.id === quick.provider); if (c) startQuick(c); }} onDone={closeQuick} onActivity={toActivity} />}
            <SourceCards sources={sources} failed={sourcesError} onRetry={loadSources} filter={filter} onFilter={setFilter} selected={chosen ? source : null}
              onQuick={setQuickAsk} onConfigure={configure} starting={starting && starting !== 'dry' && starting !== 'write' ? starting : null} />
          </>
        )}

        {step === 1 && (
          group === 'Books' ? (
            <p className="max-w-2xl rounded-lg border border-rule bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              {card?.label || 'This source'} is read as a whole and each book is placed in a department from its own subject codes and keywords, so there is no department to choose.
              A book that does not clearly belong to one is sent to Content Review as a draft rather than given a guess.
            </p>
          ) : (
            <>
              <DepartmentPicker value={departments} onChange={setDepartments} />
              {group === 'Articles' && departments.length === 0 && <p role="note" className="mt-2 text-[13px] text-muted">Select at least one department to continue.</p>}
              {group === 'Journals' && <p role="note" className="mt-2 text-[13px] text-muted">{departments.length ? '' : 'Leave empty to look at every department.'} Journals are placed by DOAJ’s own subject classes.</p>}
            </>
          )
        )}

        {step === 2 && (
          <div className="max-w-sm">
            <label htmlFor="per-dept" className="field-label">{group === 'Articles' ? 'Items per department' : group === 'Journals' ? 'Journals to add' : source === 'ncbi' ? 'Archives to read' : 'Records to examine'}</label>
            <input id="per-dept" className="input tabular-nums" inputMode="numeric" value={perDept} onChange={e => setPerDept(e.target.value)} aria-invalid={!!perError} />
            {perError ? <p className="field-error">{perError}</p>
              : group === 'Articles' ? <p className="field-help">Up to {N(total)} records across {departments.length} department{departments.length === 1 ? '' : 's'} will be looked at (a ceiling of 300 per department).</p>
                : group === 'Journals' ? <p className="field-help">At most {N(perNum)} new journals are listed in the check; the rest wait for another time.</p>
                  : source === 'ncbi' ? <p className="field-help">At most {N(perNum)} archives are downloaded, and NCBI’s daily archive and size limits still apply.</p>
                    : <p className="field-help">About {N(perNum)} records are read, starting where the last manual import stopped.</p>}
          </div>
        )}

        {step === 3 && group === 'Articles' && (
          <div role="radiogroup" aria-label="Access policy" className="grid gap-2">
            {([
              ['verifiable', 'Only records with verifiable open-access full text', 'Prioritizes accessible open-access content from supported academic sources. The file is opened to confirm it works before a record is marked eligible.'],
              ['any', 'Include records without full text', source === 'arxiv'
                ? 'Preprints are catalogued as preprints, with a link to arXiv; no file is served for one without a verifiable licence.'
                : 'Records with no verifiable file are catalogued as metadata only, linking to the publisher.'],
            ] as const).map(([id, label, hint]) => (
              <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${policy === id ? 'border-accent bg-accent-soft' : 'border-rule hover:bg-surface-2'}`}>
                <input type="radio" name="policy" className="mt-1 accent-[var(--accent-solid)]" checked={policy === id} onChange={() => setPolicy(id)} />
                <span><span className="block text-[14px] font-semibold text-ink">{label}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">{hint}</span></span>
              </label>
            ))}
          </div>
        )}
        {step === 3 && group === 'Journals' && (
          <p className="max-w-2xl rounded-lg border border-rule bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            A journal is cleared for full text only when every licence DOAJ lists for it allows commercial use; the rest are catalogued as metadata only. Journals already held are never changed, and nothing is removed.
          </p>
        )}
        {step === 3 && group === 'Books' && (
          <p className="max-w-2xl rounded-lg border border-rule bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            Rights follow what the provider declares for each title. Books are catalogued with a link to their source; full text stays held back until the book reader supports PDFs.
            {source === 'ncbi' ? ' NCBI Bookshelf is review-first: nothing it finds is published automatically.' : ''}
          </p>
        )}

        {step === 4 && (
          <div>
            {dryRunning && (
              <p role="status" className="text-[13px] text-ink-2">
                Running dry run…{group === 'Articles' ? <> {dry.progress?.department ? `${dry.progress.department} — ` : ''}{N(dry.progress?.done)} of {N(dry.progress?.total)} departments.</> : ' reading the source.'} Nothing is being written.
              </p>
            )}
            {dry?.status === 'error' && <p role="alert" className="rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{dry.error}</p>}
            {dry?.status === 'done' && s && (
              <>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
                  {tiles.map(([l, v]) => (
                    <div key={l} className="bg-surface px-3.5 py-3"><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
                  ))}
                </dl>
                <p className="mt-2 text-[12.5px] text-muted">
                  {group === 'Articles' && <>Of the {N(s.eligible)} eligible, {N(s.viewable)} would open in the viewer and {N(s.metadataOnly)} would link to the publisher. </>}
                  {group === 'Journals' && <>Of the {N(s.eligible)} new journals, {N(s.viewable)} are cleared for full text and {N(s.metadataOnly)} would be metadata only{s.noDepartment ? `; ${N(s.noDepartment)} have no department yet` : ''}. </>}
                  {group === 'Books' && <>Of the {N(s.eligible)}, {N(s.books?.publish)} would be catalogued and {N(s.books?.review)} sent to Content Review{s.books?.enriched ? `; ${N(s.books.enriched)} books already held would be enriched` : ''}. {source === 'ncbi' ? 'This preview is the shortlist only — no archive was downloaded. ' : ''}</>}
                  The dry run wrote nothing to the catalogue. This preview expires {dry.expiresAt ? new Date(dry.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'in an hour'}.
                </p>
                {s.errors > 0 && group === 'Articles' && <p role="status" className="mt-2 text-[12.5px] text-ink-2">{N(s.errors)} department{s.errors === 1 ? '' : 's'} could not be fetched; the rest are shown.</p>}
                {s.books?.sourceError && <p role="status" className="mt-2 text-[12.5px] text-ink-2">The source stopped part-way: {s.books.sourceError}</p>}

                {writing && <p role="status" className="mt-4 text-[13px] text-ink-2">Ingesting… {N(write.progress?.done)} of {N(write.progress?.total)}{group === 'Books' ? ' checked' : ' records'}.</p>}
                {write?.status === 'error' && <p role="alert" className="mt-4 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{write.error}</p>}
                {write?.status === 'done' && write.result && (
                  <p role="status" className="mt-4 rounded-lg border border-success/40 bg-success-soft px-3.5 py-3 text-[13px] text-ink">
                    {group === 'Journals' ? 'Import finished' : 'Ingest finished'}: <b>{N(write.result.added)}</b> {group === 'Journals' ? 'journals added' : 'added'}, {N(write.result.held)} already held
                    {group === 'Books' ? <>, {N(write.result.enriched)} enriched, {N(write.result.review)} sent to review</> : ''}
                    {group !== 'Journals' ? <>, {N(write.result.failed)} failed</> : ''}
                    {group === 'Articles' && write.result.skippedNeedsReview ? `, ${N(write.result.skippedNeedsReview)} left for review` : ''}.
                    {write.result.partial && <> {write.result.partial}</>}
                    {group === 'Articles' && write.result.failed > 0 && <> <button type="button" className="font-semibold underline" onClick={() => startWrite(true)}>Retry the {N(write.result.failed)} that failed</button></>}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {group === 'Articles' && <Button variant="outline" onClick={exportCsv}><Download size={15} aria-hidden="true" /> Export CSV</Button>}
                  {!write && (
                    <Button onClick={() => setConfirm(true)} loading={starting === 'write'} disabled={s.eligible === 0 || starting !== null}>
                      {starting === 'write' ? 'Starting…' : writeLabel}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {step > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
          <Button variant="outline" onClick={() => (step === 4 && (dry || write) ? reset() : setStep(step - 1))} disabled={dryRunning || writing || starting !== null}>
            {step === 4 && (dry || write) ? 'Start over' : 'Back'}
          </Button>
          {step < 3 && <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue</Button>}
          {step === 3 && <Button onClick={startDry} loading={starting === 'dry'} disabled={group === 'Articles' && departments.length === 0}>{starting === 'dry' ? 'Starting…' : 'Run Dry Run'}</Button>}
        </div>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => startWrite(false)} loading={starting === 'write'}
        confirmLabel={group === 'Journals' ? `Add ${N(s?.eligible)} Journals` : `Ingest ${N(s?.eligible)} Records`} title={group === 'Journals' ? 'Add these journals?' : 'Ingest these records?'}
        description={`${N(s?.eligible)} ${group === 'Journals' ? 'new journals' : 'eligible records'} from the dry run will be added to the catalogue. ${group === 'Articles' ? 'Each is checked again just before it is written, and existing records are never overwritten.' : 'Anything already held is left exactly as it is.'}${engineRunning ? ' The continuous engine is running; both can work safely side by side.' : ''}`} />

      <ConfirmDialog open={!!quickAsk} onClose={() => setQuickAsk(null)} onConfirm={() => quickAsk && startQuick(quickAsk)}
        confirmLabel="Import now" title={quickAsk ? `Quick Import — ${quickAsk.label}` : ''} description={quickAsk?.confirm} />
    </section>
  );
}
