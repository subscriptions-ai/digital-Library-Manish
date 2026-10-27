import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { History, Pause, Play, RotateCcw, XCircle } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Field, type BadgeTone } from '../../ui';
import { api } from './api';
import { N, ago } from './format';
import { ALL_DEPARTMENTS } from './ScopePanel';

/**
 * Historical backfill (Phase 2A: the framework). A SuperAdmin chooses what to bring in, PREVIEWS it (a dry run that writes nothing), reads what would happen, and only then
 * starts it. The screen never offers a provider the server does not have: in production, until real providers arrive, it says so and the form is not shown.
 */

const TYPE_HELP: Record<string, string> = { JOURNAL: 'Journals (periodicals are journals)', ARTICLE: 'Articles' };
const PRESETS = [['last1', 'Latest 1 year'], ['last5', 'Latest 5 years'], ['since2000', '2000 – present'], ['custom', 'Custom dates'], ['full', 'Full available history']] as const;
const STATUS_TONE: Record<string, BadgeTone> = { Pending: 'neutral', Running: 'accent', Paused: 'caution', Completed: 'success', Failed: 'alarm', Cancelled: 'neutral' };
const day = (d: Date) => d.toISOString().slice(0, 10);

function windowFor(preset: string, from: string, to: string): { windowStart: string | null; windowEnd: string | null } {
  const now = new Date(), y = (n: number) => new Date(Date.UTC(now.getUTCFullYear() - n, now.getUTCMonth(), now.getUTCDate()));
  if (preset === 'last1') return { windowStart: day(y(1)), windowEnd: day(now) };
  if (preset === 'last5') return { windowStart: day(y(5)), windowEnd: day(now) };
  if (preset === 'since2000') return { windowStart: '2000-01-01', windowEnd: day(now) };
  if (preset === 'custom') return { windowStart: from || null, windowEnd: to || null };
  return { windowStart: null, windowEnd: null };
}

export function HistoricalBackfill({ refreshKey }: { refreshKey: unknown }) {
  const [ov, setOv] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [type, setType] = useState('ARTICLE');
  const [provider, setProvider] = useState('');
  const [preset, setPreset] = useState<string>('last5');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [depts, setDepts] = useState<string[]>([]);
  const [access, setAccess] = useState<'OAFirst' | 'MetadataOnlyAllowed'>('OAFirst');
  const [maxRecords, setMax] = useState(300);
  const [adapterVals, setAdapterVals] = useState<Record<string, any>>({});
  const [desc, setDesc] = useState<{ summary: string } | { error: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; snapshot: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { const r = await api('/api/admin/ingest/backfill'); if (r.ok) { setOv(r.data); setFailed(false); } else setFailed(true); }, []);
  const active = !!ov?.jobs?.some((j: any) => ['Pending', 'Running'].includes(j.status) || j.pauseRequested || j.cancelRequested);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { const t = setInterval(load, active ? 2000 : 15_000); return () => clearInterval(t); }, [load, active]);

  // Open on a content type that something can actually be brought in for (with only OAPEN connected that is Books, not "Articles — no provider yet"), unless the person has chosen.
  const typeChosen = useRef(false);
  useEffect(() => {
    if (!ov?.types || typeChosen.current) return;
    if (!ov.types.find((t: any) => t.id === type)?.providers?.length) { const first = ov.types.find((t: any) => t.providers?.length); if (first) setType(first.id); }
  }, [ov]);       // eslint-disable-line react-hooks/exhaustive-deps

  const gate = ov?.enabled === true;
  const adapters: any[] = (ov?.adapters || []).filter((a: any) => a.available && a.contentTypes.includes(type));
  useEffect(() => { if (!adapters.find(a => a.id === provider)) setProvider(adapters[0]?.id || ''); }, [type, ov]);       // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = adapters.find(a => a.id === provider);

  const body = useMemo(() => ({
    provider, contentType: type, ...windowFor(preset, from, to), departments: depts, accessPreference: access, maxRecords, preset,
    adapter: Object.fromEntries((chosen?.params || []).map((p: any) => [p.key, adapterVals[`${provider}.${p.key}`] ?? p.default ?? (p.type === 'boolean' ? false : p.type === 'number' ? 0 : '')]).filter(([, v]: any) => v !== '')),
  }), [provider, type, preset, from, to, depts, access, maxRecords, chosen, adapterVals]);
  const snapshot = JSON.stringify(body);
  const adapterKey = JSON.stringify(body.adapter);
  // What the chosen source looks like (a snapshot's release and size), asked of the server when its settings change. Reads nothing into the catalogue.
  useEffect(() => {
    setDesc(null);
    if (!chosen?.describes || !gate) return;
    const t = setTimeout(async () => { const r = await api('/api/admin/ingest/backfill/describe', { method: 'POST', body: { provider, adapter: body.adapter } }); setDesc(r.ok ? { summary: r.data.summary } : { error: r.data?.error || 'That source cannot be read.' }); }, 400);
    return () => clearTimeout(t);
  }, [provider, adapterKey, chosen?.describes, gate]);       // eslint-disable-line react-hooks/exhaustive-deps

  const previewJob = ov?.jobs?.find((j: any) => j.id === preview?.id) ?? null;
  const previewValid = !!preview && preview.snapshot === snapshot && previewJob?.status === 'Completed';
  const previewRunning = !!previewJob && ['Pending', 'Running'].includes(previewJob.status);
  const maxCeil = ov?.limits?.maxRecordsPerJob ?? 5000;

  const doPreview = async () => {
    setBusy('preview'); setErr(null);
    const r = await api('/api/admin/ingest/backfill', { method: 'POST', body: { ...body, dryRun: true } });
    setBusy(null);
    if (!r.ok) { setErr(r.data?.error || 'Could not start the preview.'); return; }
    setPreview({ id: r.data.id, snapshot }); load();
  };
  const doStart = async () => {
    if (!preview) return;
    setBusy('start'); setErr(null);
    const r = await api('/api/admin/ingest/backfill', { method: 'POST', body: { ...JSON.parse(preview.snapshot), dryRun: false, previewJobId: preview.id } });
    setBusy(null); setConfirm(false);
    if (!r.ok) { setErr(r.data?.error || 'Could not start the backfill.'); return; }
    toast.success('Backfill started'); setPreview(null); load();
  };
  const control = async (id: string, action: 'pause' | 'resume' | 'cancel' | 'replan') => {
    const r = await api(`/api/admin/ingest/backfill/${id}/${action}`, { method: 'POST' });
    if (!r.ok) toast.error(r.data?.error || `Could not ${action} the job.`); else toast.success(action === 'pause' ? 'Pausing at the end of the current chunk' : action === 'cancel' ? 'Cancelling at the end of the current chunk' : action === 'resume' ? 'Resumed' : 'Plan dropped; resume to continue');
    load();
  };
  const noProvider = !!ov && gate && !ov.adapters?.some((a: any) => a.available);

  return (
    <section className="space-y-5" aria-labelledby="backfill-heading">
      <div className="card card-pad">
        <h2 id="backfill-heading" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><History size={13} aria-hidden="true" /> Historical backfill</h2>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">Brings in older material in small, checkpointed chunks, separately from the continuous engine: it has its own place in each source and never moves the engine's. Always preview first; a preview writes nothing.</p>
        {!ov ? (failed ? <p role="status" className="mt-3 text-[12.5px] text-muted">Backfill could not be read just now.</p> : <span aria-hidden="true" className="skeleton mt-3 block h-24 w-full" />)
          : ov.tableMissing ? <p role="status" className="mt-3 rounded-lg border border-caution/40 bg-caution-soft px-3.5 py-3 text-[13px] text-ink">This database has not had the backfill table added yet, so nothing can be shown or started. It is added when the schema is pushed.</p>
          : !gate ? <p role="status" className="mt-3 rounded-lg border border-rule bg-surface-2 px-3.5 py-3 text-[13px] text-ink"><b>Historical backfill is switched off on this server.</b> It is enabled only at deployment time (<code className="text-[12px]">INGESTION_BACKFILL_ENABLED</code>); nothing can be previewed or started until then.</p>
          : noProvider ? <p role="status" className="mt-3 rounded-lg border border-rule bg-surface-2 px-3.5 py-3 text-[13px] text-ink"><b>No backfill provider is connected on this server.</b> A provider appears here once its source is set up (for OpenAlex, a staged snapshot folder; for OAPEN, a deployment setting). Nothing is offered until one is.</p>
          : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Content type"><select className="input" value={type} onChange={e => { typeChosen.current = true; setType(e.target.value); setPreview(null); }}>
                {ov.types.map((t: any) => <option key={t.id} value={t.id} disabled={!t.providers.length}>{TYPE_HELP[t.id] || t.label}{t.reserved ? ' — reserved' : t.providers.length ? '' : ' — no provider yet'}</option>)}</select></Field>
              <Field label="Provider"><select className="input" value={provider} onChange={e => setProvider(e.target.value)} disabled={!adapters.length}>
                {adapters.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
              <Field label="Publication period"><select className="input" value={preset} onChange={e => setPreset(e.target.value)}>{PRESETS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
              {preset === 'custom' ? (
                <div className="grid grid-cols-2 gap-3"><Field label="From"><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="To"><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
              ) : <p className="self-end text-[12.5px] text-muted">{(() => { const w = windowFor(preset, from, to); return w.windowStart || w.windowEnd ? `${w.windowStart ?? 'earliest'} to ${w.windowEnd ?? 'now'}` : 'Everything the provider has'; })()}</p>}
              <Field label="Access preference" help="Open access first sends a record without a verifiable open licence to a person instead of cataloguing it as a link."><select className="input" value={access} onChange={e => setAccess(e.target.value as any)}>
                <option value="OAFirst">Open access first</option><option value="MetadataOnlyAllowed">Metadata only allowed</option></select></Field>
              <Field label="Maximum records" help={`Up to ${N(maxCeil)} per job. A preview looks at no more than ${N(ov.limits.previewMaxRecords)}.`}><input className="input" type="number" min={1} max={maxCeil} value={maxRecords} onChange={e => setMax(Math.max(1, Number(e.target.value) || 1))} /></Field>
              <div className="sm:col-span-2">
                <details><summary className="cursor-pointer select-none text-[13px] font-semibold text-ink">Departments — {depts.length ? `${depts.length} selected` : 'all'}</summary>
                  <div className="mt-2 grid max-h-52 gap-1 overflow-auto rounded-lg border border-rule p-2.5 sm:grid-cols-2">
                    {ALL_DEPARTMENTS.map(d => <label key={d} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={depts.includes(d)} onChange={e => setDepts(s => (e.target.checked ? [...s, d] : s.filter(x => x !== d)))} />{d}</label>)}
                  </div>
                  {depts.length > 0 && <button type="button" className="mt-1.5 text-[12px] font-semibold text-accent hover:underline" onClick={() => setDepts([])}>Use all departments</button>}
                </details>
              </div>
              {chosen && (chosen.params?.length > 0 || chosen.fixture) && (
                <div className={`rounded-lg border px-3.5 py-3 text-[12.5px] text-ink sm:col-span-2 ${chosen.fixture ? 'border-caution/40 bg-caution-soft' : 'border-rule bg-surface-2'}`}>
                  {chosen.fixture && <p><b>Test data.</b> This provider is a fixture used to prove the framework. It exists only on development and test servers. Starting it writes fixture articles into this database.</p>}
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {chosen.params.map((p: any) => {
                      const k = `${provider}.${p.key}`, v = adapterVals[k] ?? p.default ?? (p.type === 'boolean' ? false : '');
                      return p.type === 'boolean'
                        ? <label key={p.key} className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" className="mt-0.5" checked={!!v} onChange={e => setAdapterVals(s => ({ ...s, [k]: e.target.checked }))} /><span>{p.label}{p.help && <span className="block text-[11.5px] text-muted">{p.help}</span>}</span></label>
                        : <Field key={p.key} label={p.label} help={p.help}><input className="input" type={p.type} min={p.min} max={p.max} placeholder={p.placeholder} value={v as any} onChange={e => setAdapterVals(s => ({ ...s, [k]: p.type === 'number' ? Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, Number(e.target.value) || (p.min ?? 0))) : e.target.value }))} /></Field>;
                    })}
                  </div>
                  {chosen.describes && desc && <p role="status" className={`mt-2 ${'error' in desc ? 'text-alarm' : 'text-ink-2'}`}>{'error' in desc ? desc.error : <><b>Source:</b> {desc.summary}</>}</p>}
                </div>
              )}
              <div className="sm:col-span-2">
                <p className="text-[12px] text-muted">Limits: {N(ov.limits.maxRecordsPerJob)} records · {ov.limits.maxRuntimeMinutes} min of working time · {Math.round(Number(ov.limits.maxBytesPerJob) / 1048576)} MB · chunks of {ov.limits.chunkSize} · one job at a time. <b>Dry run: on</b> — a real start is offered only after a preview of these exact settings.</p>
                {err && <p role="alert" className="mt-2 rounded-lg bg-alarm-soft px-3 py-2 text-[12.5px] text-ink">{err}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={doPreview} loading={busy === 'preview'} disabled={!provider || previewRunning || !!busy}>Preview Backfill</Button>
                  <Button onClick={() => setConfirm(true)} disabled={!previewValid || !!busy}>Start Backfill</Button>
                  {preview && !previewValid && !previewRunning && <span className="self-center text-[12px] text-muted">{previewJob?.status === 'Completed' ? 'The settings changed since the preview — preview again.' : previewJob ? `Preview ${previewJob.status.toLowerCase()}.` : ''}</span>}
                </div>
              </div>
            </div>
          )}
      </div>

      {previewJob && <PreviewResult job={previewJob} />}

      {ov?.jobs?.length > 0 && (
        <div className="card card-pad">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Backfill jobs</h3>
          <ul className="mt-3 divide-y divide-rule/60">
            {ov.jobs.map((j: any) => <JobRow key={j.id} j={j} onControl={control} />)}
          </ul>
        </div>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={doStart} loading={busy === 'start'} confirmLabel="Start Backfill" title="Start this backfill?"
        description={<>This writes to the catalogue: up to {N(preview ? JSON.parse(preview.snapshot).maxRecords : 0)} records, in chunks you can pause or cancel. What the preview found: would publish {N(previewJob?.records?.published)}, would send {N(previewJob?.records?.review)} to review, {N(previewJob?.records?.conflicting)} conflicts left untouched. Anything already imported stays if you cancel.</>} />
    </section>
  );
}

function PreviewResult({ job }: { job: any }) {
  const r = job.records, p = job.preview;
  const running = ['Pending', 'Running'].includes(job.status);
  const tiles: [string, number, string][] = [
    ['Would publish', r.published, 'New records that pass every rule.'], ['Would review', r.review, 'New records that wait for a person.'],
    ['Already held', r.unchangedDuplicate, 'Duplicates that change nothing.'], ['Would enrich', r.enriched, 'Held records whose empty fields would be filled.'],
    ['Conflicts', r.conflicting, 'Duplicates whose licence or DOI disagrees. Never changed.'], ['Refused', r.refused, 'Refused by a rule (for example too old).'], ['Failed', r.failed, 'Records that could not be read.'],
  ];
  return (
    <div className="card card-pad" aria-live="polite">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Preview {running ? '— working…' : job.status === 'Completed' ? '— nothing was written' : `— ${job.status.toLowerCase()}`}</h3>
      <p className="mt-1 text-[12.5px] text-muted">{N(r.fetched)} records looked at{job.requestedMaxRecords > job.maxRecords ? ` (a preview looks at no more than ${N(job.maxRecords)} of the ${N(job.requestedMaxRecords)} asked for)` : ''}.</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([l, v, tip]) => <div key={l} title={tip}><dt className="text-[11px] text-muted">{l}</dt><dd className="text-xl font-semibold tabular-nums text-ink">{N(v)}</dd></div>)}
      </dl>
      {job.lastError && <p role="alert" className="mt-3 rounded-lg bg-alarm-soft px-3 py-2 text-[12.5px] text-ink">{job.lastError}</p>}
      {p && (p.samples.length > 0 || p.issues.length > 0) && (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div><p className="text-[12.5px] font-semibold text-ink">Sample records <span className="font-normal text-muted">(at most {p.caps.samples})</span></p>
            <ul className="mt-1.5 divide-y divide-rule/60 text-[12.5px]">{p.samples.map((s: any) => <li key={s.id} className="flex items-baseline justify-between gap-3 py-1"><span className="min-w-0 truncate">{s.title || s.id}</span><span className="shrink-0 text-muted">{s.outcome}{s.dup ? ` · ${s.dup}` : ''}</span></li>)}</ul></div>
          <div><p className="text-[12.5px] font-semibold text-ink">Conflicts, refusals and failures <span className="font-normal text-muted">(at most {p.caps.issues})</span></p>
            {p.issues.length ? <ul className="mt-1.5 divide-y divide-rule/60 text-[12.5px]">{p.issues.map((i: any, k: number) => <li key={`${i.id}-${k}`} className="py-1"><b className="text-ink">{i.kind}</b> <span className="text-muted">{i.id}</span> — {i.reason}</li>)}</ul> : <p className="mt-1.5 text-[12.5px] text-muted">None.</p>}</div>
        </div>
      )}
      {p?.truncated && <p className="mt-2 text-[11.5px] text-muted">Only a bounded sample is kept; the totals above are complete.</p>}
    </div>
  );
}

function JobRow({ j, onControl }: { j: any; onControl: (id: string, a: 'pause' | 'resume' | 'cancel' | 'replan') => void }) {
  const r = j.records; const pct = j.maxRecords ? Math.min(100, Math.round((r.fetched / j.maxRecords) * 100)) : 0;
  const live = ['Pending', 'Running'].includes(j.status);
  const mismatch = j.status === 'Failed' && String(j.lastError || '').startsWith('BACKFILL_PAGE_CHANGED_DURING_RETRY');
  return (
    <li className="py-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><span className="font-medium text-ink">{j.provider} · {j.contentType}</span> <Badge tone={STATUS_TONE[j.status] || 'neutral'}>{j.pauseRequested && j.status === 'Running' ? 'Pausing' : j.cancelRequested && j.status === 'Running' ? 'Cancelling' : j.status}</Badge> {j.dryRun && <Badge>Preview</Badge>} <span className="text-muted">· {ago(j.createdAt)}</span></div>
        <div className="flex gap-1.5">
          {(live || j.status === 'Paused') && !j.pauseRequested && j.status !== 'Paused' && <Button size="sm" variant="outline" onClick={() => onControl(j.id, 'pause')}><Pause size={13} aria-hidden="true" /> Pause</Button>}
          {j.status === 'Paused' && <Button size="sm" variant="outline" onClick={() => onControl(j.id, 'resume')}><Play size={13} aria-hidden="true" /> Resume</Button>}
          {mismatch && <Button size="sm" variant="outline" onClick={() => onControl(j.id, 'replan')}><RotateCcw size={13} aria-hidden="true" /> Re-plan</Button>}
          {(live || j.status === 'Paused') && !j.cancelRequested && <Button size="sm" variant="outline" onClick={() => onControl(j.id, 'cancel')}><XCircle size={13} aria-hidden="true" /> Cancel</Button>}
        </div>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Records looked at"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-[12px] text-muted">{N(r.fetched)} of {N(j.maxRecords)} · {j.dryRun ? 'would publish' : 'published'} {N(r.published)} · review {N(r.review)} · duplicates {N(r.duplicate)} (enriched {N(r.enriched)}, conflicting {N(r.conflicting)}) · refused {N(r.refused)} · failed {N(r.failed)} · chunk {N(j.chunksCompleted)}{j.finishedBecause ? ` · ${j.finishedBecause}` : ''}</p>
      {j.waiting && live && <p role="status" className="mt-1 text-[12px] text-muted">Waiting for the source{j.waiting.until ? ` until ${new Date(j.waiting.until).toLocaleTimeString()}` : ''}: {j.waiting.reason} Nothing is lost; it carries on by itself.</p>}
      {j.lastError && <p className={`mt-1 text-[12px] ${mismatch ? 'font-medium text-ink' : 'text-muted'}`}>{mismatch ? 'The source returned a different page when this chunk was retried, so nothing was applied. Re-plan to start that chunk afresh. ' : ''}<span className="text-muted">{j.lastError}</span></p>}
      {j.replans?.length > 0 && <p className="mt-1 text-[12px] text-muted">Re-planned {j.replans.length}×: totals for the chunk{j.replans.length > 1 ? 's' : ''} re-planned may count a few already-written records as duplicates.</p>}
    </li>
  );
}
