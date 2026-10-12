import { CheckCircle2, ListChecks, Zap } from 'lucide-react';
import { Button } from '../../ui';
import { clock, N } from './format';

/**
 * A Quick Import while it runs, and what it did when it finished.
 *
 * It shows only what the server knows. While the total is not known there is no percentage; while it is, there is a bar
 * and the same numbers in words. The counts are the run log's own, so what is said here is what Run activity will say.
 */

export type QuickJobView = {
  jobId: string; provider: string; label: string; group: string; status: 'running' | 'done' | 'error'; limit: number;
  progress: { stage: string; checked: number; limit: number | null; added: number; held: number; review: number; skipped: number; failed: number; open?: boolean };
  result: null | {
    checked: number; added: number; alreadyHeld: number; needsReview: number; skipped: number; failed: number; enriched?: number;
    notes: string[]; partial?: string | null; moreAvailable: boolean;
  };
  error: null | { code: string; message: string; until: string | null; written: number };
};

const Counts = ({ rows }: { rows: [string, number | undefined][] }) => (
  <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-5">
    {rows.map(([l, v]) => (
      <div key={l} className="bg-surface px-3.5 py-2.5"><dd className="text-lg font-semibold tabular-nums text-ink">{N(v)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt></div>
    ))}
  </dl>
);

export function QuickImportPanel({ job, onMore, onDone, onActivity }: { job: QuickJobView; onMore: () => void; onDone: () => void; onActivity: () => void }) {
  const p = job.progress;
  const isNcbi = job.provider === 'ncbi';
  const known = p.limit != null && !p.open;
  const pct = known && p.limit ? Math.min(100, Math.round((p.checked / p.limit) * 100)) : null;
  const unit = isNcbi ? 'archives read' : 'checked';

  return (
    <div className="mb-5 rounded-xl border border-rule bg-surface-2 p-4" aria-labelledby="quick-heading">
      <h3 id="quick-heading" className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        <Zap size={15} aria-hidden="true" /> {job.label} Quick Import
        {job.status === 'done' && <CheckCircle2 size={15} className="text-success" aria-hidden="true" />}
      </h3>

      {job.status === 'running' && (
        <div role="status" aria-live="polite">
          <p className="mt-2 text-[13px] text-ink-2">
            {p.stage}
            {known ? <> {N(p.checked)} / {N(p.limit)} {unit}</> : p.checked > 0 ? <> {N(p.checked)} {unit}</> : null}
          </p>
          {pct !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${job.label} Quick Import progress`}>
              <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          )}
          <Counts rows={[['Added', p.added], ['Already held', p.held], ['Review', p.review], ['Skipped', p.skipped], ['Failed', p.failed]]} />
          <p className="mt-2 text-[12px] text-muted">You can leave this page; the import carries on and appears in Run activity.</p>
        </div>
      )}

      {job.status === 'error' && job.error && (
        <div>
          <p role="alert" className="mt-2 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">
            {job.error.message}
            {job.error.until && !/after/i.test(job.error.message) ? ` Try again after ${clock(job.error.until)}.` : ''}
          </p>
          {job.error.written > 0 && <p className="mt-2 text-[12.5px] text-ink-2">{N(job.error.written)} records had already been added safely before it stopped, and stay in the catalogue.</p>}
          <div className="mt-3"><Button variant="outline" size="sm" onClick={onDone}>Done</Button></div>
        </div>
      )}

      {job.status === 'done' && job.result && (
        <div role="status">
          <p className="mt-2 text-[13px] font-semibold text-ink">Quick Import complete</p>
          <p className="text-[12.5px] text-muted">Source: {job.label}</p>
          <Counts rows={[[isNcbi ? 'Archives read' : 'Checked', job.result.checked], ['Added', job.result.added], ['Already held', job.result.alreadyHeld], ['Needs review', job.result.needsReview], ['Skipped', job.result.skipped]]} />
          {(job.result.failed > 0 || (job.result.enriched ?? 0) > 0) && (
            <p className="mt-2 text-[12.5px] text-ink-2">
              {(job.result.enriched ?? 0) > 0 && <>{N(job.result.enriched)} existing records enriched. </>}
              {job.result.failed > 0 && <>{N(job.result.failed)} could not be written; the rest are safely in the catalogue and a retry will skip what is held.</>}
            </p>
          )}
          {job.result.partial && <p role="note" className="mt-2 rounded-lg bg-caution-soft px-3 py-2 text-[12.5px] text-ink">{job.result.partial}</p>}
          {job.result.notes.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-2">{job.result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onActivity}><ListChecks size={14} aria-hidden="true" /> View Run Activity</Button>
            <Button size="sm" onClick={onMore} disabled={!job.result.moreAvailable} title={job.result.moreAvailable ? undefined : 'This source has been read to its end for now'}>Import More</Button>
            <Button variant="outline" size="sm" onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
