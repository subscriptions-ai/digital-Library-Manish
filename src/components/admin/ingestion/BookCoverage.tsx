import { useCallback, useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { Button, ConfirmDialog } from '../../ui';
import { api } from './api';
import { N, clock } from './format';

/**
 * Book coverage by department — what each department holds NOW, lowest first, with the switch that gives the lowest ones more of the engine's
 * Books turns and a Quick Import for one department at a time.
 *
 * The figures are counted from the catalogue, never from a target: a department with no books reads 0 until a valid book is published into it.
 */

type Row = { department: string; total: number; published: number; readable: number; external: number; metadataOnly: number; review: number; state: string; label: string };
type Cov = { books: { departments: Row[]; other: { label: string; published: number; review: number }[]; totals: { books: number; published: number; review: number } };
  journals: { departments: { department: string; total: number; verifiedOa: number; oaUnverified: number; metadataOnly: number; reviewRequired: number; low: boolean }[]; total: number; other: { label: string; total: number }[] };
  targeting: { config: { enabled: boolean; share: number; target: number }; next: string | null; below: { department: string; published: number; resting: boolean; restUntil: string | null; lastRunAt: string | null }[] } };

const FILTERS = [['all', 'All'], ['zero', 'Zero Books'], ['u50', 'Under 50'], ['u100', 'Under 100'], ['u250', 'Under 250'], ['met', 'Target Met']] as const;
type Filter = typeof FILTERS[number][0];
const keep = (r: Row, f: Filter, target: number) => f === 'all' ? true : f === 'zero' ? r.published === 0 : f === 'u50' ? r.published < 50 : f === 'u100' ? r.published < 100 : f === 'u250' ? r.published < 250 : r.published >= target;
const TONE: Record<string, string> = { critical: 'badge-alarm', low: 'badge-caution', building: 'badge-neutral', 'target-met': 'badge-success' };

export function BookCoverage({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Cov | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [cfg, setCfg] = useState<{ enabled: boolean; share: number; target: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [job, setJob] = useState<any>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    const r = await api<Cov>('/api/admin/ingest/book-coverage');
    if (r.ok) { setData(r.data); setCfg(c => c ?? r.data.targeting.config); setFailed(false); } else setFailed(true);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  useEffect(() => () => clearInterval(timer.current), []);

  const poll = (jobId: string) => {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const r = await api(`/api/admin/ingest/targeted-books/${jobId}`);
      if (!r.ok) { clearInterval(timer.current); setJob((j: any) => j && { ...j, status: 'error', error: r.data?.error || 'Lost track of the import.' }); return; }
      setJob(r.data);
      if (r.data.status !== 'running') { clearInterval(timer.current); load(); onChanged(); }
    }, 1500);
  };

  const start = async (department: string) => {
    setStarting(true);
    const r = await api('/api/admin/ingest/targeted-books', { method: 'POST', body: { department, limit: 100, confirm: true } });
    setStarting(false); setAsk(null);
    if (!r.ok) { setJob({ department, status: 'error', error: r.data?.error || 'The import could not start.' }); return; }
    setJob({ jobId: r.data.jobId, department, status: 'running', progress: {}, result: null });
    poll(r.data.jobId);
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true); setNote(null);
    const r = await api('/api/admin/ingest/book-priority', { method: 'POST', body: cfg });
    setSaving(false);
    if (r.ok) { setCfg(r.data.config); setNote('Saved.'); load(); } else setNote(r.data?.error || 'Could not save.');
  };

  if (failed && !data) return <section className="card card-pad"><p role="alert" className="text-sm text-ink">The coverage could not be loaded. If the server was started before this update, restart it. Nothing has been changed.</p></section>;
  if (!data || !cfg) return <section className="card card-pad" aria-busy="true"><span className="skeleton block h-40 w-full" /></section>;

  const rows = data.books.departments.filter(r => keep(r, filter, cfg.target));
  const lowJournals = data.journals.departments.filter(d => d.low);

  return (
    <section className="space-y-5" aria-labelledby="bookcov-heading">
      <div className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="bookcov-heading" className="text-base font-semibold text-ink">Prioritize Low-Coverage Departments</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              When on, {Math.round(cfg.share * 100)}% of the engine's Books turns go to the lowest-covered department that is below its target — the other {100 - Math.round(cfg.share * 100)}% stay the ordinary rotation, so no department is starved.
              A department is only given books the classifier places in it: asking for a subject never files a book under it.
            </p>
            {data.targeting.next && <p className="mt-2 text-[12.5px] text-ink-2">Next department: <strong className="font-semibold text-ink">{data.targeting.next}</strong> · {N(data.targeting.below.length)} below {cfg.target} books · {N(data.targeting.below.filter(b => b.resting).length)} resting after a run that found nothing</p>}
          </div>
          <div className="flex flex-wrap items-end gap-3 text-[12.5px]">
            <label className="flex items-center gap-2 font-medium text-ink"><input type="checkbox" role="switch" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} /> {cfg.enabled ? 'On' : 'Off'}</label>
            <label className="text-muted">Share of Books turns
              <select className="input ml-2 h-9 w-auto py-0" value={cfg.share} onChange={e => setCfg({ ...cfg, share: Number(e.target.value) })}>{[0.5, 0.6, 0.7, 0.8].map(s => <option key={s} value={s}>{Math.round(s * 100)}%</option>)}</select></label>
            <label className="text-muted">Target
              <select className="input ml-2 h-9 w-auto py-0" value={cfg.target} onChange={e => setCfg({ ...cfg, target: Number(e.target.value) })}>{[100, 250].map(s => <option key={s} value={s}>{s} books</option>)}</select></label>
            <Button size="sm" onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
        {note && <p role="status" className="mt-2 text-[12.5px] text-ink-2">{note}</p>}
      </div>

      {job && (
        <div className="rounded-xl border border-rule bg-surface-2 p-4" role="status" aria-live="polite">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Zap size={15} aria-hidden="true" /> {job.department} · targeted Books import</h3>
          {job.status === 'running' && <p className="mt-2 text-[13px] text-ink-2">Reading providers… {job.progress?.checked ? `${N(job.progress.checked)} checked` : ''} You can leave this page; it carries on and appears in Run activity.</p>}
          {job.status === 'error' && <p role="alert" className="mt-2 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{job.error}</p>}
          {job.status === 'done' && job.result && (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-5">
                {([['Checked', job.result.checked], [`Added to ${job.department}`, job.result.addedToDepartment], ['Already held', job.result.held], ['Sent to review', job.result.sentToReview], ['Skipped', job.result.skipped]] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="bg-surface px-3.5 py-2.5"><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
                ))}
              </dl>
              <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink-2">{job.result.providers.map((p: any) => <li key={p.id}>{p.label}: {p.checked ? `${N(p.checked)} checked · ${N(p.added)} added · ${N(p.review)} to review` : p.outcome}</li>)}</ul>
              {job.result.notes?.map((n: string) => <p key={n} className="mt-1 text-[12px] text-muted">{n}</p>)}
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Book Coverage by Department</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {N(data.books.totals.published)} published · {N(data.books.totals.review)} waiting for review (not public). Lowest first. Critical 0–24 · Low 25–49 · Building 50–99 · Initial target met 100+.
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Show departments">
            {FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2 font-semibold">Department</th>
                <th className="px-3 py-2 text-right font-semibold" title="Published plus waiting for review">Total Books</th>
                <th className="px-3 py-2 text-right font-semibold" title="Offered for reading here">Readable / Open</th>
                <th className="px-3 py-2 text-right font-semibold" title="Linked to the source that holds it">External</th>
                <th className="px-3 py-2 text-right font-semibold" title="A catalogue record, nowhere to read it">Metadata Only</th>
                <th className="px-3 py-2 text-right font-semibold" title="Drafts the classifier suggested for this department; not public">Review</th>
                <th className="px-3 py-2 font-semibold">Coverage</th>
                <th className="relative px-5 py-2 text-right font-semibold"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.department} className="border-t border-rule">
                  <td className="px-5 py-2.5 font-medium text-ink">{r.department}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{N(r.total)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.readable)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.external)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.metadataOnly)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(r.review)}</td>
                  <td className="px-3 py-2.5"><span className={`badge badge-dot ${TONE[r.state] || 'badge-neutral'}`}>{r.label}</span></td>
                  <td className="px-5 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setAsk(r.department)} disabled={starting || job?.status === 'running'} aria-label={`Quick Import Books for ${r.department} (${r.published} published)`}>
                      <Zap size={13} aria-hidden="true" /> Quick Import Books
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="px-5 py-4 text-sm text-muted">No department matches this filter.</td></tr>}
            </tbody>
          </table>
        </div>
        {data.books.other.length > 0 && (
          <p className="border-t border-rule px-5 py-3 text-[12px] text-muted">
            Not counted toward any department: {data.books.other.map(o => `${o.label} — ${N(o.published)} published, ${N(o.review)} review`).join(' · ')}.
          </p>
        )}
      </div>

      <div className="card">
        <div className="border-b border-rule px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Journal coverage by department</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{N(data.journals.total)} journals held. Departments are not forced equal; those under 100 journals are listed here as thin.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-muted"><tr>
              <th className="px-5 py-2 font-semibold">Department</th><th className="px-3 py-2 text-right font-semibold">Journals</th>
              <th className="px-3 py-2 text-right font-semibold" title="Full text accepted on a declaration">Verified OA</th>
              <th className="px-3 py-2 text-right font-semibold" title="Listed by a source that does not verify open access">OA unverified</th>
              <th className="px-3 py-2 text-right font-semibold">Metadata only</th><th className="px-3 py-2 text-right font-semibold">Review required</th>
            </tr></thead>
            <tbody>
              {(lowJournals.length ? lowJournals : data.journals.departments.slice(0, 5)).map(d => (
                <tr key={d.department} className="border-t border-rule">
                  <td className="px-5 py-2.5 font-medium text-ink">{d.department}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{N(d.total)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(d.verifiedOa)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(d.oaUnverified)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(d.metadataOnly)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{N(d.reviewRequired)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!lowJournals.length && <p className="border-t border-rule px-5 py-3 text-[12px] text-muted">Every department holds 100 or more journals; the five lowest are shown.</p>}
        {data.journals.other.length > 0 && <p className="border-t border-rule px-5 py-3 text-[12px] text-muted">Not counted toward any department: {data.journals.other.map(o => `${o.label} — ${N(o.total)}`).join(' · ')}.</p>}
      </div>

      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} onConfirm={() => ask && start(ask)} loading={starting}
        title={`Quick Import Books — ${ask ?? ''}`} confirmLabel="Start import"
        description={<>Reads up to 100 candidates for <strong>{ask}</strong> using its query profile, from the providers that are healthy right now. Every candidate goes through the same duplicate check, licence rules and department classifier as any other book: only books the classifier places in {ask} are counted, uncertain ones wait for review, and Open Library results always wait for review. Nothing already held is overwritten, and the continuous engine's positions are not moved.</>} />
    </section>
  );
}
