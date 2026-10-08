import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Clock, Database, Layers, Play, Pause, RefreshCw, Radio } from 'lucide-react';
import { Badge, Button, type BadgeTone } from '../../ui';
import { api } from './api';
import { N, ago, clock, inFuture, scopeLabel } from './format';

const HEALTH_TONE: Record<string, BadgeTone> = { running: 'success', paused: 'neutral', delayed: 'caution', attention: 'alarm' };
const MODE_LABEL: Record<string, string> = { auto: 'Everything', books: 'Books', journals: 'Journals', articles: 'Articles' };

/** What the screen says after a manual pass: what actually happened, never a blanket "done". */
function describePass(d: any): { kind: 'success' | 'error' | 'info'; text: string } {
  if (d.error) return { kind: 'error', text: d.error };
  if (d.skipped === 'disabled') return { kind: 'info', text: 'The engine is paused — resume it to let it run on its own.' };
  if (d.failed) return { kind: 'error', text: `${d.department} · "${d.term}": the source did not answer. The sweep was left where it was.` };
  if (d.phase === 'Journals') return { kind: 'success', text: `${d.department} · "${d.term}": ${d.accepted} accepted, ${d.rejected} catalogued as metadata only` };
  if (d.phase === 'Books') return { kind: 'success', text: `${d.department} · "${d.term}": ${d.added} books added${d.skippedHeld ? `, ${d.skippedHeld} already held` : ''}` };
  if (d.phase === 'Articles' && d.journal) return { kind: d.error ? 'error' : 'success', text: `${d.journal}: ${d.added} added${d.skippedHeld ? `, ${d.skippedHeld} already held` : ''}${d.note ? ` — ${d.note}` : ''}` };
  return { kind: 'info', text: d.note || 'Nothing to fetch right now.' };
}

export function EngineStatus({ state, onChanged }: { state: any; onChanged: () => void }) {
  const [pending, setPending] = useState<null | 'toggle' | 'pass'>(null);
  const st = state.status || {};
  const running = !!state.enabled;
  const scope = scopeLabel(state.departments);
  const day = state.last24h || {};

  const toggle = async () => {
    setPending('toggle');
    const r = await api('/api/admin/ingest/state', { method: 'POST', body: { enabled: !running } });
    setPending(null);
    if (!r.ok) { toast.error(r.data?.error || 'Could not change the engine.'); return; }
    toast.success(running ? 'Engine paused' : 'Engine resumed');
    onChanged();
  };

  const runPass = async () => {
    setPending('pass');
    const r = await api('/api/admin/ingest/tick', { method: 'POST' });
    setPending(null);
    if (r.status === 409) toast('A pass is already running. It will finish on its own.', { icon: '⏳' });
    else if (!r.ok) toast.error(r.data?.error || 'The pass could not run.');
    else { const m = describePass(r.data); m.kind === 'success' ? toast.success(m.text) : m.kind === 'error' ? toast.error(m.text) : toast(m.text); }
    onChanged();
  };

  const busy = pending !== null || !!st.passRunning;
  const next = running ? (st.passRunning ? 'a pass is running now' : st.nextPassAt ? `~${clock(st.nextPassAt)}` : '—') : '—';

  return (
    <section className="card card-pad" aria-labelledby="engine-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Continuous engine</p>
          <h2 id="engine-heading" className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xl font-semibold text-ink">
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${st.health === 'running' ? 'animate-pulse bg-success' : st.health === 'attention' ? 'bg-alarm' : st.health === 'delayed' ? 'bg-caution' : 'bg-faint'}`} />
            {st.label || (running ? 'Running' : 'Paused')}
            <Badge tone={HEALTH_TONE[st.health] || 'neutral'}>{st.health === 'running' ? 'Healthy' : st.health === 'paused' ? 'Switched off' : st.health === 'delayed' ? 'Behind schedule' : 'Action needed'}</Badge>
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Journals come from DOAJ, where their licence is decided once per title. Articles follow from OpenAlex. Books come from DOAB, which holds no book file,
            so each book is catalogued with a link to its publisher.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={runPass} loading={pending === 'pass'} disabled={busy && pending !== 'pass'}>
            <RefreshCw size={15} aria-hidden="true" /> {pending === 'pass' ? 'Starting…' : running ? 'Run Extra Pass Now' : 'Run One Pass'}
          </Button>
          <Button variant={running ? 'secondary' : 'primary'} onClick={toggle} loading={pending === 'toggle'} disabled={busy && pending !== 'toggle'}>
            {running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            {pending === 'toggle' ? (running ? 'Pausing…' : 'Resuming…') : running ? 'Pause Engine' : 'Resume Engine'}
          </Button>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          [Layers, 'Mode', MODE_LABEL[st.mode || state.focus] || '—'],
          [Database, 'Current source', st.currentSource || '—'],
          [Radio, 'Active scope', scope.short],
          [Clock, 'Currently processing', st.currentlyProcessing || '—'],
          [Clock, 'Last pass', state.lastRunAt ? `${clock(state.lastRunAt)} · ${ago(state.lastRunAt)}` : 'No pass yet'],
          [Clock, 'Next pass', next],
        ].map(([Icon, label, value]: any) => (
          <div key={label} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted"><Icon size={15} /></span>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
              <dd className="mt-0.5 break-words text-[14px] font-medium text-ink">{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-[13px] text-ink-2">
        <span className="font-semibold text-ink">Last 24 hours:</span>{' '}
        <b className="tabular-nums text-ink">{N(day.added)}</b> added · <b className="tabular-nums text-ink">{N(day.held)}</b> held ·{' '}
        <b className={`tabular-nums ${day.failed || day.errors ? 'text-alarm' : 'text-ink'}`}>{N((day.failed || 0) + (day.errors || 0))}</b> failed
        {day.needsReview ? <> · <b className="tabular-nums text-ink">{N(day.needsReview)}</b> sent to review</> : null}
        {day.rejected ? <> · <b className="tabular-nums text-ink">{N(day.rejected)}</b> refused by a rule</> : null}
        <span className="text-muted"> · {N(day.passes)} runs</span>
      </p>

      {st.coolingDown?.journals > 0 && (
        <p className="mt-2 text-[12.5px] text-muted">
          {N(st.coolingDown.journals)} journal{st.coolingDown.journals === 1 ? '' : 's'} checked recently and resting; the next is due {inFuture(st.coolingDown.nextDueAt)}.
        </p>
      )}

      {(st.reasons?.length > 0 || st.sources?.some((s: any) => s.status !== 'ok')) && (
        <div role="status" className={`mt-4 rounded-lg border px-3.5 py-3 text-[13px] ${st.health === 'attention' ? 'border-alarm/40 bg-alarm-soft text-ink' : 'border-caution/40 bg-caution-soft text-ink'}`}>
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} aria-hidden="true" className={st.health === 'attention' ? 'text-alarm' : 'text-caution'} /> {st.health === 'attention' ? 'Needs attention' : 'Worth knowing'}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink-2">
            {st.reasons?.map((r: string) => <li key={r}>{r}</li>)}
            {st.sources?.filter((s: any) => s.status === 'delayed').map((s: any) => <li key={s.source}>{s.source}: source temporarily delayed{s.pausedUntil ? ` until ${clock(s.pausedUntil)}` : ''}. The rest of the engine carries on.</li>)}
            {st.sources?.filter((s: any) => s.status === 'failing').map((s: any) => <li key={s.source}>{s.source} is failing — it will pause itself if that continues.</li>)}
          </ul>
        </div>
      )}

      {state.alerts?.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Warnings">
          {state.alerts.slice(0, 3).map((a: any) => (
            <li key={a.journalId} className="flex items-start gap-2 rounded-lg border border-caution/40 bg-caution-soft px-3.5 py-2.5 text-[13px] text-ink">
              <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-caution" />
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}

      {state.lastError && <p role="alert" className="mt-3 rounded-lg bg-alarm-soft px-3 py-2 text-[12.5px] text-ink">{state.lastError}</p>}
    </section>
  );
}
