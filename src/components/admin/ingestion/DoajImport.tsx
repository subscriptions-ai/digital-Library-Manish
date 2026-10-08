import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button, ConfirmDialog } from '../../ui';
import { api } from './api';
import { N } from './format';

/**
 * Every journal DOAJ lists: Check First, read the result, then "Import {N} Journals" behind a confirmation.
 * The import is only ever what the check reported as new, so repeating it adds nothing twice.
 */
export function DoajImport({ onDone }: { onDone: () => void }) {
  const [job, setJob] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState<null | 'check' | 'import'>(null);
  const [confirm, setConfirm] = useState(false);

  const poll = useCallback(async () => {
    const r = await api('/api/admin/ingest/doaj-catalogue');
    if (r.ok) { setJob(r.data.job); setLoaded(true); return r.data.job; }
    return null;
  }, []);

  useEffect(() => { poll(); }, [poll]);
  useEffect(() => {
    if (!job?.running) return;
    const t = setInterval(async () => { const j = await poll(); if (j && !j.running && j.kind === 'import' && !j.error) onDone(); }, 3000);
    return () => clearInterval(t);
  }, [job?.running, poll, onDone]);

  const check = async () => {
    setStarting('check');
    const r = await api('/api/admin/ingest/doaj-catalogue', { method: 'POST', body: { dryRun: true } });
    setStarting(null);
    if (!r.ok) { toast.error(r.data?.error || 'The check could not start.'); return; }
    setJob(r.data.job);
  };

  const result = job && !job.running && !job.error ? job.result : null;
  const checked = job?.kind === 'check' && result;
  const toImport: number = checked ? result.new : 0;

  const runImport = async () => {
    setStarting('import');
    const r = await api('/api/admin/ingest/doaj-catalogue', { method: 'POST', body: { previewId: job.previewId, confirm: true } });
    setStarting(null); setConfirm(false);
    if (!r.ok) { toast.error(r.data?.error || 'The import did not start.'); await poll(); return; }
    setJob(r.data.job);
  };

  return (
    <section className="card card-pad" aria-labelledby="doaj-heading">
      <h2 id="doaj-heading" className="text-base font-semibold text-ink">Import every DOAJ journal</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
        DOAJ’s search stops at 1,000 results a query, so searching by department cannot reach all of its journals. Its full list is one file.
        Check first: it reads the file and tells you what an import would add. Nothing is written until you confirm. Journals you already hold are never deleted or overwritten.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={check} loading={starting === 'check'} disabled={!!job?.running || starting !== null}>
          {starting === 'check' || (job?.running && job.kind === 'check') ? 'Checking…' : 'Check First'}
        </Button>
        {checked && toImport > 0 && (
          <Button onClick={() => setConfirm(true)} disabled={!!job?.running || starting !== null}>Import {N(toImport)} Journals</Button>
        )}
      </div>

      {job?.running && <p role="status" className="mt-4 text-[13px] text-ink-2">{job.kind === 'import' ? 'Importing… this runs on the server and can be left open or closed.' : 'Checking… reading DOAJ’s file, which takes a minute or two.'}</p>}
      {job?.error && <p role="alert" className="mt-4 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{job.error}</p>}
      {loaded && !job && <p className="mt-4 text-[12.5px] text-muted">No check has been run since the server started.</p>}

      {checked && (
        <div className="mt-5">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4">
            {[
              ['In the DOAJ file', result.inFile], ['Already held', result.alreadyHeld], ['New to add', result.new], ['Full text allowed', result.fullTextEligible],
              ['Metadata only', result.metadataOnly], ['Needs review', result.needsReview], ['Rejected', result.rejected], ['No department match', result.noDepartment],
            ].map(([l, v]: any) => (
              <div key={l} className="bg-surface px-3.5 py-3"><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
            ))}
          </dl>
          {toImport === 0 && <p className="mt-3 text-[13px] text-ink-2">Nothing new to add — every importable journal is already in the catalogue.</p>}
          {result.reviewSample?.length > 0 && (
            <details className="mt-3 text-[13px]">
              <summary className="cursor-pointer font-medium text-ink">Needs review — sample ({result.reviewSample.length})</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">{result.reviewSample.slice(0, 10).map((s: any, i: number) => <li key={i}>{typeof s === 'string' ? s : `${s.title}${s.issn ? ` (${s.issn})` : ''}${s.reason ? ` — ${s.reason}` : ''}`}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      {job?.kind === 'import' && result && (
        <p role="status" className="mt-4 rounded-lg border border-success/40 bg-success-soft px-3.5 py-3 text-[13px] text-ink">
          Import finished: <b>{N(result.added)}</b> journals added ({N(result.accepted)} with full text, {N(result.metadataOnly)} metadata only)
          {result.alreadyHeldNow ? `, ${N(result.alreadyHeldNow)} already held by then` : ''}.
        </p>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={runImport} loading={starting === 'import'} confirmLabel={`Import ${N(toImport)} Journals`}
        title="Import journals from DOAJ?"
        description={`You are about to add ${N(toImport)} new journal records. Existing journal records will not be deleted or overwritten.`} />
    </section>
  );
}
