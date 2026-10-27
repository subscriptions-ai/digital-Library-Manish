import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Badge, Button, ConfirmDialog, type BadgeTone } from '../../ui';
import { api } from './api';
import { N } from './format';

/**
 * DOAJ Metadata Enrichment: completes journals the catalogue already holds from DOAJ's official, dated snapshot (a file staged on the server — nothing is downloaded). It fills only EMPTY
 * descriptive fields and never changes a journal's status, licence, department or e-ISSN, never overwrites a held value, never touches a protected journal, and never creates a journal.
 * Preview first (it writes nothing); the start button stays off until a completed preview shows enough to be worth doing. It is the Historical Backfill machinery (one active job, chunks,
 * pause / resume / cancel, a bounded preview); this card is the DOAJ-shaped view of it.
 */

const THRESHOLD = 500;
const TONE: Record<string, BadgeTone> = { Pending: 'neutral', Running: 'accent', Paused: 'caution', Completed: 'success', Failed: 'alarm', Cancelled: 'neutral' };
const FIELD_LABEL: Record<string, string> = { homepage: 'Homepage', language: 'Language', subject: 'Subject', country: 'Country', publisherName: 'Publisher', subjects: 'Subject list' };

export function DoajEnrichment({ onDone }: { onDone: () => void }) {
  const [ov, setOv] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [desc, setDesc] = useState<{ summary: string } | { error: string } | null>(null);
  const [busy, setBusy] = useState<null | 'preview' | 'start'>(null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { const r = await api('/api/admin/ingest/backfill'); if (r.ok) { setOv(r.data); setFailed(false); } else setFailed(true); }, []);
  const jobs: any[] = (ov?.jobs || []).filter((j: any) => j.provider === 'doaj');
  const active = jobs.some(j => ['Pending', 'Running'].includes(j.status) || j.pauseRequested || j.cancelRequested);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, active ? 2000 : 20_000); return () => clearInterval(t); }, [load, active]);

  const adapter = ov?.adapters?.find((a: any) => a.id === 'doaj');
  const ready = ov?.enabled === true && !!adapter?.available;
  useEffect(() => {
    setDesc(null);
    if (!ready) return;
    (async () => { const r = await api('/api/admin/ingest/backfill/describe', { method: 'POST', body: { provider: 'doaj', adapter: {} } }); setDesc(r.ok ? { summary: r.data.summary } : { error: r.data?.error || 'The staged snapshot cannot be read.' }); })();
  }, [ready]);

  const body = { provider: 'doaj', contentType: 'JOURNAL', adapter: {}, departments: [], accessPreference: 'OAFirst', maxRecords: Math.min(ov?.limits?.maxRecordsPerJob ?? 5000, 100_000), preset: 'full', windowStart: null, windowEnd: null };
  const pv = jobs.find(j => j.dryRun) ?? null;
  const real = jobs.find(j => !j.dryRun) ?? null;
  const st = pv?.sourceStats || {}; const t = (k: string) => Number(st[`t.${k}`] || 0);
  const enrichable = pv?.records?.enriched ?? 0;
  const done = pv?.status === 'Completed';
  const worth = done && enrichable >= THRESHOLD;

  const doPreview = async () => { setBusy('preview'); setErr(null); const r = await api('/api/admin/ingest/backfill', { method: 'POST', body: { ...body, dryRun: true } }); setBusy(null); if (!r.ok) { setErr(r.data?.error || 'Could not start the preview.'); return; } load(); };
  const doStart = async () => {
    setBusy('start'); setErr(null);
    const r = await api('/api/admin/ingest/backfill', { method: 'POST', body: { ...body, dryRun: false, previewJobId: pv.id } });
    setBusy(null); setConfirm(false);
    if (!r.ok) { setErr(r.data?.error || 'Could not start the enrichment.'); return; }
    toast.success('Enrichment started'); load(); onDone();
  };
  const control = async (id: string, action: 'pause' | 'resume' | 'cancel') => { const r = await api(`/api/admin/ingest/backfill/${id}/${action}`, { method: 'POST' }); if (!r.ok) toast.error(r.data?.error || `Could not ${action} the job.`); load(); };

  return (
    <section className="card card-pad" aria-labelledby="doaj-enrich-heading">
      <h2 id="doaj-enrich-heading" className="text-base font-semibold text-ink">DOAJ Metadata Enrichment</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
        Completes journals you already hold from DOAJ’s official snapshot. It fills only empty descriptive fields (homepage, language, subject, country, publisher). It never changes a journal’s status, licence, department or e-ISSN, never overwrites a value you hold, never touches a journal that is ours, rejected, or decided by a person, and never creates a journal. Preview first; a preview writes nothing.
      </p>

      {!ov ? (failed ? <p role="status" className="mt-3 text-[12.5px] text-muted">Enrichment could not be read just now.</p> : <span aria-hidden="true" className="skeleton mt-3 block h-16 w-full" />)
        : ov.tableMissing ? <p role="status" className="mt-3 text-[13px] text-ink">This database has not had the backfill table added yet, so nothing can be shown or started.</p>
        : !ready ? <p role="status" className="mt-3 rounded-lg border border-rule bg-surface-2 px-3.5 py-3 text-[13px] text-ink"><b>Not available on this server.</b> {ov.enabled === false ? 'Historical backfill is switched off here.' : adapter?.reason ? `${String(adapter.reason).replace(/^./, c => c.toUpperCase())}.` : 'The DOAJ snapshot source is not set up.'}</p>
        : (
          <>
            <p role="status" className={`mt-3 text-[12.5px] [overflow-wrap:anywhere] ${desc && 'error' in desc ? 'text-alarm' : 'text-ink-2'}`}><b>Source</b> {desc ? ('error' in desc ? desc.error : desc.summary) : 'reading…'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={doPreview} loading={busy === 'preview'} disabled={active || !!busy || !desc || 'error' in (desc as any)}>Preview enrichment</Button>
              <Button onClick={() => setConfirm(true)} disabled={!worth || active || !!busy}>Start enrichment</Button>
              {done && !worth && <span className="text-[12px] text-muted">Fewer than {N(THRESHOLD)} journals would gain anything, so enrichment is not worth running.</span>}
              {!done && pv && !active && <span className="text-[12px] text-muted">Preview {String(pv.status).toLowerCase()}.</span>}
            </div>
            {err && <p role="alert" className="mt-2 rounded-lg bg-alarm-soft px-3 py-2 text-[12.5px] text-ink">{err}</p>}

            {pv && (
              <div className="mt-4" aria-live="polite">
                <p className="text-[12.5px] text-muted">Preview {done ? '— nothing was written' : `— ${String(pv.status).toLowerCase()}…`} · looked at {N(pv.records.fetched)} journals in the file{pv.maxRecords && pv.requestedMaxRecords > pv.maxRecords ? ` (the limits here allow ${N(pv.maxRecords)} of the ${N(pv.requestedMaxRecords)} asked for)` : ''}.</p>
                <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4">
                  {([['Matched journals', t('matched'), 'In the DOAJ file and held, with a confident ISSN match.'], ['Enrichable', enrichable, 'Held journals with an empty field DOAJ completes.'], ['Conflicts', t('conflict'), 'A held value disagrees with DOAJ. Never changed.'], ['Protected', t('protected'), 'Ours, Rejected, decided by a person, or linked to a publisher. Never touched.'],
                    ['Ambiguous', t('ambiguous') + t('identityConflict'), 'A shared ISSN, two journals, or the same title under other ISSNs. Reported only.'], ['Unchanged', pv.records.unchangedDuplicate, 'Held, with nothing to complete — this includes the protected journals.'], ['Not held', t('notInCatalogue'), 'In DOAJ, not in the catalogue. Never created here.'], ['Same title only', t('titleOnly'), 'A held journal has the same title under other ISSNs. Reported only.']] as [string, number, string][]).map(([l, v, tip]) => (
                    <div key={l} title={tip} className="bg-surface px-3.5 py-3"><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
                  ))}
                </dl>
                {enrichable > 0 && <p className="mt-2 text-[12.5px] text-ink-2">Would fill: {Object.keys(FIELD_LABEL).map(f => [FIELD_LABEL[f], t(`fill.${f}`)] as const).filter(([, v]) => v > 0).map(([l, v]) => `${l} ${N(v)}`).join(' · ') || '—'}{t('review.eissn') > 0 ? ` · e-ISSN for review only: ${N(t('review.eissn'))} (it changes which articles attach, so it is never filled automatically)` : ''}.</p>}
                {pv.preview && (pv.preview.issues?.length > 0) && (
                  <details className="mt-2 text-[13px]"><summary className="cursor-pointer font-medium text-ink">Conflicts and journals needing a person — examples ({pv.preview.issues.length}, a bounded sample)</summary>
                    <ul className="mt-1.5 divide-y divide-rule/60 text-[12.5px]">{pv.preview.issues.slice(0, 25).map((i: any, k: number) => <li key={`${i.id}-${k}`} className="py-1"><b className="text-ink">{i.kind}</b> <span className="text-muted">{i.id}</span> — {i.reason}</li>)}</ul>
                  </details>
                )}
              </div>
            )}

            {real && (
              <div className="mt-4 border-t border-rule/60 pt-3 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-medium text-ink">Enrichment job</span> <Badge tone={TONE[real.status] || 'neutral'}>{real.pauseRequested && real.status === 'Running' ? 'Pausing' : real.cancelRequested && real.status === 'Running' ? 'Cancelling' : real.status}</Badge></div>
                  <div className="flex gap-1.5">
                    {['Pending', 'Running'].includes(real.status) && !real.pauseRequested && <Button size="sm" variant="outline" onClick={() => control(real.id, 'pause')}>Pause</Button>}
                    {real.status === 'Paused' && <Button size="sm" variant="outline" onClick={() => control(real.id, 'resume')}>Resume</Button>}
                    {['Pending', 'Running', 'Paused'].includes(real.status) && !real.cancelRequested && <Button size="sm" variant="outline" onClick={() => control(real.id, 'cancel')}>Cancel</Button>}
                  </div>
                </div>
                <p className="mt-1 text-[12px] text-muted">{N(real.records.fetched)} of {N(real.maxRecords)} journals looked at · enriched {N(real.records.enriched)} · conflicts {N(real.records.conflicting)} · not enriched {N(real.records.refused)} · chunk {N(real.chunksCompleted)}{real.finishedBecause ? ` · ${real.finishedBecause}` : ''}. Anything already written stays if you cancel.</p>
                {real.lastError && <p role="alert" className="mt-1 text-[12px] text-muted">{real.lastError}</p>}
              </div>
            )}
          </>
        )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={doStart} loading={busy === 'start'} confirmLabel={`Enrich ${N(enrichable)} journals`}
        title="Enrich journals from DOAJ?"
        description={`About ${N(enrichable)} journals will have their empty fields filled from the staged snapshot, in small chunks you can pause or cancel. Nothing that has a value is replaced; no status, licence, department or e-ISSN changes; no journal is created.`} />
    </section>
  );
}
