import { Clock3, Repeat } from 'lucide-react';
import { clock, N } from './format';

/**
 * Where the rotation is, in a few lines: per kind of content, which source is working or last worked, which is next, and how many
 * candidates a turn checks. If a kind has no source it can ask, it says it is waiting for one to recover — and that the others carry on.
 */
const ORDER = ['Journals', 'Articles', 'Books'] as const;

export function RotationStatus({ state }: { state: any }) {
  const rot = state.status?.rotation;
  if (!rot?.enabled) return null;
  const running = rot.running;
  return (
    <section className="card card-pad" aria-labelledby="rotation-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="rotation-heading" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><Repeat size={13} aria-hidden="true" /> Rotation status</h2>
        <p className="text-[11.5px] text-muted">
          {running ? `Working now: ${running.label}` : 'Between turns'} · batch size {N(rot.batchSize)} · a source rests after {N(rot.failuresBeforeFallback)} failed requests, or at once when rate limited
        </p>
      </div>
      <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3">
        {ORDER.map(g => {
          const r = rot.groups[g];
          return (
            <div key={g} className="bg-surface px-3.5 py-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{g}</p>
              {r.waiting ? (
                <>
                  <p className="mt-1 text-[13.5px] font-semibold text-ink">Waiting for source recovery</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{r.retryAt ? <><Clock3 size={11} className="mr-1 inline" aria-hidden="true" />next try {clock(r.retryAt)} · </> : null}Articles and Books keep running.</p>
                </>
              ) : (
                <dl className="mt-1 space-y-0.5 text-[13px]">
                  <div className="flex gap-2"><dt className="w-14 text-muted">Current</dt><dd className="font-medium text-ink">{r.current || '—'}</dd></div>
                  <div className="flex gap-2"><dt className="w-14 text-muted">Next</dt><dd className="font-medium text-ink">{r.next || '—'}</dd></div>
                  <div className="flex gap-2"><dt className="w-14 text-muted">Batch</dt><dd className="tabular-nums text-ink">{N(r.batchSize)}</dd></div>
                </dl>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
