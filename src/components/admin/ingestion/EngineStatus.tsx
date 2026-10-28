import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Clock, Database, Layers, Play, Pause, RefreshCw, Radio } from 'lucide-react';
import { Badge, Button, type BadgeTone } from '../../ui';
import { api } from './api';
import { N, ago, clock, inFuture, scopeLabel } from './format';

const HEALTH_TONE: Record<string, BadgeTone> = { running: 'success', waiting: 'neutral', paused: 'neutral', attention: 'alarm' };
const HEALTH_BADGE: Record<string, string> = { running: 'Healthy', waiting: 'Resumes by itself', paused: 'Switched off', attention: 'Action needed' };
const CONTINUING_BADGE = 'Other sources carry on';
const MODE_LABEL: Record<string, string> = { auto: 'Everything', books: 'Books', journals: 'Journals', articles: 'Articles' };

/** What the screen says after a manual pass: what actually happened, never a blanket "done". */
function describePass(d: any): { kind: 'success' | 'error' | 'info'; text: string } {
  if (d.error) return { kind: 'error', text: d.error };
  if (d.skipped === 'disabled') return { kind: 'info', text: 'The engine is paused — resume it to let it run on its own.' };
  // The rotation: one turn, by one source — say which, and what it did.
  if (d.ran === true && d.turns?.length > 1) return { kind: d.useful > 0 ? 'success' : 'info', text: `${d.turns.length} sources tried this pass (${d.turns.map((t: any) => `${t.label}: ${t.added} added`).join(' → ')})` };
  if (d.ran === true) return { kind: 'success', text: `${d.label}: ${d.checked} checked · ${d.added} added${d.enriched ? ` · ${d.enriched} enriched` : ''} · ${d.held} held${d.sentToReview ? ` · ${d.sentToReview} sent to review` : ''}${d.switchedFrom?.length ? ` — took over from ${d.switchedFrom.length === 1 ? 'a source that was not answering' : 'sources that were not answering'}` : ''}` };
  if (d.ran === false) return { kind: d.failed?.length ? 'error' : 'info', text: d.note || 'Nothing to fetch right now.' };
  if (d.failed) return { kind: 'error', text: `${d.department} · "${d.term}": the source did not answer. The sweep was left where it was.` };
  if (d.phase === 'Journals') return { kind: 'success', text: `${d.department} · "${d.term}": ${d.accepted} accepted, ${d.rejected} catalogued as metadata only` };
  if (d.phase === 'Books') return { kind: 'success', text: `${d.department} · "${d.term}": ${d.added} books added${d.skippedHeld ? `, ${d.skippedHeld} already held` : ''}` };
  if (d.phase === 'Articles' && d.journal) return { kind: d.error ? 'error' : 'success', text: `${d.journal}: ${d.added} added${d.skippedHeld ? `, ${d.skippedHeld} already held` : ''}${d.note ? ` — ${d.note}` : ''}` };
  return { kind: 'info', text: d.note || 'Nothing to fetch right now.' };
}

/** What the engine does, in words that match what the backend does: the connected fallbacks are named, an unconnected one is said to be unconnected. */
function EngineCopy({ rotation }: { rotation: any }) {
  const label = (id: string) => rotation.providers.find((p: any) => p.id === id)?.label || id;
  const connected = (id: string) => rotation.providers.find((p: any) => p.id === id)?.configured === true;
  const fallbacks = ['road', 'crossrefjournals', 'openalexsources'].filter(connected).map(label);
  const list = (a: string[]) => a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
  return (
    <>
      Journals are discovered through DOAJ, with {list(fallbacks)} available as fallbacks{connected('road') ? '' : ' (ROAD / ISSN is in the chain but not connected yet: it has no public data interface)'}.
      {' '}Articles are collected primarily through Crossref, with OpenAlex, Europe PMC and arXiv used where appropriate.
      {' '}Books are collected through DOAB, OAPEN, Open Textbook Library, NCBI Bookshelf and NLM Catalog, with Crossref Books and Pressbooks adding books for review only; no book file is hosted here, so each book is catalogued with a link to its source, or as a record with no Read button when no licence is known.
      {' '}{rotation.adaptive
        ? <>Content types are offered in order of how productive their best available source is right now (the set priorities, {rotation.weights ? `Books ${rotation.weights.Books} · Journals ${rotation.weights.Journals} · Articles ${rotation.weights.Articles}` : 'Books first'}, only break ties, and no type waits for ever), and a pass keeps working through sources until its time budget is spent instead of stopping at the first that adds something.</>
        : <>Content types take turns by priority ({rotation.weights ? `Books ${rotation.weights.Books} · Journals ${rotation.weights.Journals} · Articles ${rotation.weights.Articles}` : 'Books first'}).</>} A source that has nothing new in one department rests only for that department and is still asked about the others; the engine waits only when no source of any kind can be asked. Maintenance (licence completion, held-candidate review, department classification) runs in its own lane beside discovery and never takes a discovery turn.
    </>
  );
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
  const waiting = running && st.health === 'waiting';
  // While every source is resting the timer still ticks, but nothing happens at a tick: what matters is when a source comes back.
  const next = running ? (st.passRunning ? 'a pass is running now' : waiting ? (st.next ? `${st.next.group} — ${clock(st.next.at)}` : 'when a source is free') : st.nextPassAt ? `~${clock(st.nextPassAt)}` : '—') : '—';
  // What runs next, in the weighted order, worked out the way a tick decides. While waiting, the time the first source comes back matters more.
  const jobLine = (j: any) => `${j.group} · ${j.label}${j.cursor ? ` · ${j.cursor}` : ''}`;
  const nextJob = running && !waiting && st.nextJobs?.length ? jobLine(st.nextJobs[0]) : null;
  const maint = st.maintenance;
  const pendingBacklog = (maint?.backlog || []).filter((b: any) => b.pending > 0);
  const continuing = running && st.discovery?.state === 'continuing';
  // What discovery is doing (or last did), and what maintenance is doing: two lanes, shown apart.
  const discoveryNow = st.discovery?.current ? `${st.discovery.current.group} · ${st.discovery.current.label}` : (running && st.activity) || st.currentSource || '—';
  const maintenanceNow = maint?.running ? `${maint.running.label} (running)` : maint?.last ? `${maint.last.label} · ${ago(maint.last.at)}` : maint?.enabled === false ? 'Switched off' : 'Nothing run yet';

  return (
    <section className="card card-pad" aria-labelledby="engine-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Continuous engine</p>
          <h2 id="engine-heading" className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xl font-semibold text-ink">
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${st.health === 'running' ? 'animate-pulse bg-success' : st.health === 'attention' ? 'bg-alarm' : st.health === 'waiting' ? 'bg-caution' : 'bg-faint'}`} />
            {st.label || (running ? 'Running' : 'Paused')}
            <Badge tone={HEALTH_TONE[st.health] || 'neutral'}>{continuing ? CONTINUING_BADGE : HEALTH_BADGE[st.health] || 'Action needed'}</Badge>
          </h2>
          {running && st.summary && <p className="mt-1.5 text-[14px] font-medium text-ink-2" data-testid="engine-summary">{st.summary}</p>}
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            {st.rotation?.enabled ? <EngineCopy rotation={st.rotation} /> : (
              <>Journals come from DOAJ, where their licence is decided once per title. Articles follow from OpenAlex. Books come from DOAB, OAPEN, Open Textbook Library, NCBI Bookshelf and NLM Catalog;
              no book file is hosted here, so each book is catalogued with a link to its source.</>
            )}
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
          [Database, 'Discovery', discoveryNow],
          [Radio, 'Active scope', scope.short],
          [RefreshCw, 'Maintenance', maintenanceNow],
          [Clock, 'Last pass', state.lastRunAt ? `${clock(state.lastRunAt)} · ${ago(state.lastRunAt)}` : 'No pass yet'],
          nextJob ? [Clock, 'Next discovery', `${nextJob}${st.nextPassAt && !st.passRunning ? ` · ~${clock(st.nextPassAt)}` : ''}`] : [Clock, waiting ? 'Next attempt' : 'Next pass', next],
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

      {running && !waiting && (st.nextJobs?.length > 1 || st.lastDecision || pendingBacklog.length > 0) && (
        <div className="mt-4 space-y-1.5 text-[13px] text-ink-2">
          {st.nextJobs?.length > 1 && (
            <p><span className="font-semibold text-ink">Then:</span> {st.nextJobs.slice(1).map(jobLine).join(' → ')}</p>
          )}
          {pendingBacklog.length > 0 && (
            <p><span className="font-semibold text-ink">Maintenance backlog:</span> {pendingBacklog.map((b: any) => `${b.label} · ${N(b.pending)} to look at`).join(' · ')} <span className="text-muted">(its own lane: it runs about every {Math.round((maint?.intervalSeconds || 120) / 60)} min beside discovery and never takes a discovery turn)</span></p>
          )}
          {maint?.heldRecheck?.checked > 0 && (
            <p><span className="font-semibold text-ink">Held candidates, second pass:</span> {N(maint.heldRecheck.checked)} checked · {N(maint.heldRecheck.newEvidence)} with new evidence · <b className="tabular-nums text-ink">{N(maint.heldRecheck.promoted)}</b> promoted to published · {N(maint.heldRecheck.sentToReview)} waiting for review · {N(maint.heldRecheck.stillHeld)} still held <span className="text-muted">(a book is published only if it passes every publishing rule again)</span></p>
          )}
          {st.lastDecision && (
            <details className="group">
              <summary className="cursor-pointer select-none font-semibold text-ink hover:text-accent">
                Why the engine chose {st.lastDecision.group} · {st.lastDecision.label} <span className="font-normal text-muted">· {ago(st.lastDecision.at)}</span>
              </summary>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {st.lastDecision.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {waiting && (
        <div role="status" className="mt-5 rounded-lg border border-rule bg-surface-2 px-3.5 py-3 text-[13px]">
          <p className="font-semibold text-ink">Waiting for source recovery</p>
          <dl className="mt-1.5 space-y-0.5 text-ink-2">
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-muted">Next eligible source</dt><dd className="font-medium text-ink">{st.waiting?.next ? `${st.waiting.next.group} · ${st.waiting.next.label}` : 'none has a time yet'}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-muted">Next attempt</dt><dd className="font-medium tabular-nums text-ink">{st.waiting?.nextAttemptAt ? `${clock(st.waiting.nextAttemptAt)} · ${inFuture(st.waiting.nextAttemptAt)}` : 'checked again at every tick, until a source is free'}</dd></div>
            {st.waiting?.since && <div className="flex gap-2"><dt className="w-40 shrink-0 text-muted">Waiting since</dt><dd className="tabular-nums text-ink">{clock(st.waiting.since)} · {ago(st.waiting.since)}</dd></div>}
          </dl>
          <p className="mt-1.5 text-[12px] text-muted">Nothing is wrong with the engine: every department and search of every source is resting, rate limited, unreachable or caught up, so there is nothing to ask until one comes back. It asks each one again by itself, and does not log a row for every minute it waits. Maintenance carries on in its own lane meanwhile.</p>
        </div>
      )}

      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Last 24 hours (rolling) <span className="font-normal normal-case tracking-normal">· {N(day.passes)} runs · ingestion events, not catalogue totals · not the daily cycle</span></p>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ['Checked', day.checked, 'Candidates looked at by runs that recorded it. Older article and journal runs did not, so this can be lower than the real figure.'],
            ['New published', day.newPublished ?? day.added, 'Records added to the published catalogue. Review candidates are never counted here.'],
            ['New review candidates', day.newReview ?? day.needsReview, 'Records sent to a person to review. Not published.'],
            ['Duplicates', day.duplicates ?? day.held, 'Already in the catalogue (all kinds). Split below.'],
            ['Duplicate enriched', day.duplicateEnriched, 'Duplicates that completed a held record\'s empty fields (never licence, file, access or status).'],
            ['Duplicate conflicting', day.duplicateConflicting, 'Duplicates that disagreed with the held record on licence or DOI. Left unchanged for a person to look at.'],
            ['Unique yield', day.uniqueYieldPct == null ? null : `${day.uniqueYieldPct}%`, 'New records (published or for review) as a share of the candidates looked at.'],
            ['Held promoted', day.heldPromoted ?? day.promoted, 'Held candidates published after passing every rule again.'],
            ['Enriched (all)', day.enriched, 'Existing records completed, including by the maintenance lane (a licence, a department).'],
            ['Source requests failed', day.providerFailures, 'Requests a source did not answer. Counted apart from records.'],
            ['Failed writes', day.failedWrites ?? ((day.failed || 0) + (day.errors || 0)), 'Records the catalogue could not write.'],
          ].map(([label, v, tip]: any) => (
            <div key={label} title={tip}>
              <dt className="text-[11px] text-muted">{label}</dt>
              <dd className={`text-[17px] font-semibold tabular-nums ${label === 'Failed writes' && v ? 'text-alarm' : 'text-ink'}`}>{typeof v === 'string' ? v : v == null && (label === 'Checked' || label.startsWith('Duplicate ')) ? '—' : N(v || 0)}</dd>
            </div>
          ))}
        </dl>
        {day.rejected > 0 && <p className="mt-1.5 text-[12px] text-muted">{N(day.refusedByRule ?? day.rejected)} refused by a rule.</p>}
        {day.publishedByProvider?.length > 0 && (
          <details className="mt-2.5 group" open>
            <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-ink hover:text-accent">Published additions by provider</summary>
            <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-[12.5px] text-ink-2 sm:grid-cols-2 lg:grid-cols-3">
              {day.publishedByProvider.map((p: any) => (
                <li key={`${p.group}-${p.source}`} className="flex items-baseline justify-between gap-3 border-b border-rule/60 py-0.5">
                  <span className="min-w-0 truncate"><span className="text-muted">{p.group} · </span>{p.source}</span>
                  <span className="shrink-0 tabular-nums"><b className="text-ink">{N(p.added)}</b> added{p.review > 0 ? <span className="text-muted"> · {N(p.review)} for review</span> : null}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {st.coolingDown?.journals > 0 && (
        <p className="mt-2 text-[12.5px] text-muted">
          {N(st.coolingDown.journals)} journal{st.coolingDown.journals === 1 ? '' : 's'} checked recently and resting; the next is due {inFuture(st.coolingDown.nextDueAt)}.
        </p>
      )}

      {(st.reasons?.length > 0 || (!st.rotation?.enabled && st.sources?.some((s: any) => s.status !== 'ok'))) && (
        <div role="status" className={`mt-4 rounded-lg border px-3.5 py-3 text-[13px] ${st.health === 'attention' ? 'border-alarm/40 bg-alarm-soft text-ink' : st.health === 'waiting' ? 'border-rule bg-surface-2 text-ink' : 'border-caution/40 bg-caution-soft text-ink'}`}>
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} aria-hidden="true" className={st.health === 'attention' ? 'text-alarm' : st.health === 'waiting' ? 'text-muted' : 'text-caution'} /> {st.health === 'attention' ? 'Needs attention' : st.health === 'waiting' ? 'Which sources, and why' : 'Worth knowing'}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink-2">
            {st.reasons?.map((r: string) => <li key={r}>{r}</li>)}
            {!st.rotation?.enabled && st.sources?.filter((s: any) => s.status === 'delayed').map((s: any) => <li key={s.source}>{s.source}: source temporarily delayed{s.pausedUntil ? ` until ${clock(s.pausedUntil)}` : ''}. The rest of the engine carries on.</li>)}
            {!st.rotation?.enabled && st.sources?.filter((s: any) => s.status === 'failing').map((s: any) => <li key={s.source}>{s.source} is failing — it will pause itself if that continues.</li>)}
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
