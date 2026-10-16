import { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, Pause } from 'lucide-react';
import { Button, ConfirmDialog } from '../../ui';
import { api } from './api';
import { N, ago, clock } from './format';

/**
 * Bulk Catalogue Expansion: read a whole source in large, bounded steps. Separate from the continuous engine — it keeps its own position for
 * every source and never moves a continuous checkpoint — and held to the same rules: duplicates are recognised, an unknown licence is never
 * Open Access, a book only goes where the classifier puts it, and journals from sources that do not verify open access wait for review.
 */

type Src = {
  id: string; kind: 'books' | 'journals'; label: string; note: string; defaultRecords: number; maxRecords: number;
  position: string | null; startedAt: string | null; lastRunAt: string | null; completedAt: string | null; lastError: string | null;
  counters: { runs: number; discovered: number; newRecords: number; duplicates: number; review: number; published: number; failures: number };
  health: { state: string; until: string | null; reason: string | null }; canRun: boolean;
};

export function BulkExpansion({ onChanged }: { onChanged: () => void }) {
  const [sources, setSources] = useState<Src[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState<Src | null>(null);
  const [records, setRecords] = useState(0);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [pausing, setPausing] = useState(false);
  const [dump, setDump] = useState<{ kind: 'file' | 'url'; location: string } | null>(null);
  const [dumpEdit, setDumpEdit] = useState<{ kind: 'file' | 'url'; location: string } | null>(null);
  const [dumpMsg, setDumpMsg] = useState<string | null>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async () => { const r = await api('/api/admin/ingest/bulk'); if (r.ok) { setSources(r.data.sources); setFailed(false); } else setFailed(true); }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { api('/api/admin/ingest/openlibrary-dump').then(r => { if (r.ok) setDump(r.data); }); }, []);
  const saveDump = async () => {
    if (!dumpEdit) return;
    const r = await api('/api/admin/ingest/openlibrary-dump', { method: 'PUT', body: dumpEdit });
    if (r.ok) { setDump(r.data); setDumpEdit(null); setDumpMsg('Saved. The next run reads from this source; a position taken from a different file is not reused.'); } else setDumpMsg(r.data?.error || 'Could not save.');
  };
  const pause = async () => {
    if (!job?.jobId) return;
    setPausing(true);
    const r = await api(`/api/admin/ingest/bulk/${job.jobId}/pause`, { method: 'POST', body: {} });
    if (!r.ok) setPausing(false);
  };
  useEffect(() => () => clearInterval(timer.current), []);

  const begin = async () => {
    if (!ask) return;
    setStarting(true);
    const r = await api('/api/admin/ingest/bulk', { method: 'POST', body: { source: ask.id, records, confirm: true } });
    setStarting(false);
    const src = ask; setAsk(null);
    if (!r.ok) { setJob({ source: src.label, status: 'error', error: r.data?.error || 'The bulk run could not start.' }); return; }
    setPausing(false);
    setJob({ source: src.label, status: 'running', jobId: r.data.jobId });
    timer.current = setInterval(async () => {
      const s = await api(`/api/admin/ingest/bulk/${r.data.jobId}`);
      if (!s.ok) { clearInterval(timer.current); setJob({ source: src.label, status: 'error', error: s.data?.error || 'Lost track of the run.' }); return; }
      if (s.data.status !== 'running') { clearInterval(timer.current); setPausing(false); setJob({ source: src.label, ...s.data }); load(); onChanged(); }
      else setJob((j: any) => ({ ...j, progress: s.data.progress, pauseRequested: s.data.pauseRequested }));
    }, 2000);
  };

  return (
    <section className="space-y-4" aria-labelledby="bulk-heading">
      <div>
        <h2 id="bulk-heading" className="flex items-center gap-2 text-base font-semibold text-ink"><Layers size={16} aria-hidden="true" /> Bulk Catalogue Expansion</h2>
        <p className="mt-0.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          Each source is read in order with a position of its own, a bounded number of records at a time. Nothing here moves the continuous engine's checkpoints, and a record already held is recognised and never counted as growth.
          A source that is resting is never asked.
        </p>
      </div>

      {job && (
        <div className="rounded-xl border border-rule bg-surface-2 p-4" role="status" aria-live="polite">
          <h3 className="text-[14px] font-semibold text-ink">{job.source}</h3>
          {job.status === 'running' && (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-ink-2">
                {job.pauseRequested || pausing ? 'Pausing after the batch in hand…' : 'Reading… this can take a few minutes. You can leave the page; the run appears in Run activity.'}
                {job.progress ? ` ${N(job.progress.discovered)} read · ${N(job.progress.newRecords)} new · ${N(job.progress.duplicates)} already held · ${N(job.progress.review)} to review.` : ''}
              </p>
              <Button size="sm" variant="outline" onClick={pause} disabled={pausing || job.pauseRequested}><Pause size={14} aria-hidden="true" /> Pause</Button>
            </div>
          )}
          {job.status === 'paused' && <p className="mt-1 text-[13px] text-ink-2">Paused. The position is kept; run the same source again to carry on from where it stopped.</p>}
          {job.status === 'error' && <p role="alert" className="mt-1 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{job.error}</p>}
          {(job.status === 'done' || job.status === 'paused') && job.result && (
            <>
              <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-5">
                {([['Read', job.result.discovered], ['New', job.result.newRecords], ['Already held', job.result.duplicates], ['Review', job.result.review], ['Published', job.result.published]] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="bg-surface px-3.5 py-2.5"><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
                ))}
              </dl>
              <p className="mt-2 text-[12.5px] text-ink-2">{job.status === 'paused' ? 'Stopped by an administrator.' : job.result.completed ? 'Read to the end of the source.' : 'Stopped at its limit; the next run carries on from the same place.'}{job.result.stoppedBecause ? ` Stopped early: ${job.result.stoppedBecause}.` : ''}</p>
            </>
          )}
        </div>
      )}

      {failed && !sources && <p role="alert" className="rounded-xl border border-alarm/40 bg-alarm-soft px-4 py-3 text-sm text-ink">The bulk sources could not be loaded. Nothing has been changed.</p>}
      {!sources && !failed && <span className="skeleton block h-40 w-full" aria-busy="true" />}
      {sources && (['books', 'journals'] as const).map(kind => (
        <div key={kind} className="card">
          <div className="border-b border-rule px-5 py-3"><h3 className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">{kind === 'books' ? 'Books' : 'Journals'}</h3></div>
          <ul>
            {sources.filter(s => s.kind === kind).map(s => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-rule px-5 py-3 first:border-t-0">
                <div className="min-w-0 max-w-2xl">
                  <p className="text-[14px] font-semibold text-ink">{s.label}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{s.note}</p>
                  <p className="mt-1.5 text-[12px] text-muted">
                    {s.completedAt ? `Read to the end ${ago(s.completedAt)}` : s.position ? `Position kept (${s.lastRunAt ? `last run ${ago(s.lastRunAt)}` : 'not yet run'})` : s.lastRunAt ? `Last run ${ago(s.lastRunAt)}` : 'Not started'}
                    {' · '}{N(s.counters.runs)} run{s.counters.runs === 1 ? '' : 's'} · {N(s.counters.discovered)} read · {N(s.counters.newRecords)} new · {N(s.counters.duplicates)} already held · {N(s.counters.review)} to review
                  </p>
                  {s.lastError && <p className="mt-1 text-[12px] text-ink-2">Last stopped: {s.lastError}</p>}
                  {s.id === 'openlibrary-dump' && dump && (
                    <div className="mt-2 rounded-lg border border-rule bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                      {!dumpEdit ? (
                        <p>Reads from {dump.kind === 'file' ? 'a file on this server' : 'a download'}: <code className="break-all">{dump.location}</code>{' '}
                          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => { setDumpEdit(dump); setDumpMsg(null); }}>Change</button>
                          <span className="block text-muted">The dump is about 10 GB compressed. Downloading it to the server first and pointing this at the file is the safe way to run it.</span></p>
                      ) : (
                        <div className="space-y-2">
                          <label className="block">Source
                            <select className="input ml-2 h-8 w-auto py-0" value={dumpEdit.kind} onChange={e => setDumpEdit({ ...dumpEdit, kind: e.target.value as 'file' | 'url' })}><option value="file">File on this server</option><option value="url">Download address</option></select>
                          </label>
                          <input className="input w-full" value={dumpEdit.location} onChange={e => setDumpEdit({ ...dumpEdit, location: e.target.value })} aria-label="Dump file path or address" placeholder={dumpEdit.kind === 'file' ? '/data/ol_dump_editions_2026-10-01.txt.gz' : 'https://openlibrary.org/data/ol_dump_editions_latest.txt.gz'} />
                          <div className="flex gap-2"><Button size="sm" onClick={saveDump}>Save</Button><Button size="sm" variant="outline" onClick={() => setDumpEdit(null)}>Cancel</Button></div>
                        </div>
                      )}
                      {dumpMsg && <p role="status" className="mt-1 text-ink">{dumpMsg}</p>}
                    </div>
                  )}
                  {!s.canRun && <p className="mt-1 text-[12px] text-ink-2">Resting{s.health.reason ? ` (${s.health.reason})` : ''}{s.health.until ? ` — retry ${clock(s.health.until)}` : ''}. A bulk run does not ask a resting source.</p>}
                </div>
                <Button size="sm" variant="outline" disabled={!s.canRun || job?.status === 'running'} onClick={() => { setAsk(s); setRecords(s.defaultRecords); }} aria-label={`${s.position && !s.completedAt ? 'Resume' : 'Run'} bulk sync for ${s.label}`}>{s.position && !s.completedAt ? 'Resume bulk sync' : 'Run bulk sync'}</Button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} onConfirm={begin} loading={starting} title={ask ? `Bulk sync — ${ask.label}` : ''} confirmLabel="Start bulk sync"
        description={ask && (
          <>
            <span className="block">{ask.note} Records already held are recognised and left as they are.</span>
            <label className="mt-3 block text-[13px] text-ink">Records to read in this run
              <input type="number" className="input mt-1 w-40" min={10} max={ask.maxRecords} value={records} onChange={e => setRecords(Number(e.target.value))} />
              <span className="ml-2 text-[12px] text-muted">10 – {N(ask.maxRecords)}</span>
            </label>
          </>
        )} />
    </section>
  );
}
