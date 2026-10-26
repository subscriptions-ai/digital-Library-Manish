import { maintenanceStatus } from './maintenance.js';
import { reviewQueue } from './reviewQueue.js';
import { rotationStatus } from './rotation.js';
import { ensureProviders, rotationEnabled } from './engine.js';

/**
 * The pipeline at a glance, from real state only. A stage appears with a count only where something durable exists to count; the stages that happen
 * inside a single discovery turn (normalising, the rights check) have no queue and are reported as steps, never given an invented number.
 *
 *   Discovery        the providers that can be asked right now (rotation state)
 *   Normalise·Rights ─ inline in every turn: no queue
 *   Enrichment       held books waiting for their second look            (maintenance backlog `held-books`)
 *   Licence          records waiting for licence completion / spelling   (`licence-fill`, `licence-spelling`)
 *   Classification   journals waiting for a department                   (`journal-departments`)
 *   Review           Drafts awaiting a person                            (catalogue, reviewQueue.ts)
 *   Publish          not a queue — an approval publishes at once; "ready to publish" is not tracked, so none is shown
 */
export type PipelineStage = { id: string; label: string; state: 'running' | 'waiting' | 'idle' | 'inline'; count: number | null; detail: string | null };

export async function pipelineStatus(state: { enabled?: boolean } = {}): Promise<{ stages: PipelineStage[]; asOf: string }> {
  let eligible = 0, total = 0;
  if (rotationEnabled()) {
    ensureProviders();
    const rot = await rotationStatus({}).catch(() => null);
    if (rot) { const real = rot.providers.filter(p => p.availability.kind !== 'not-configured' && !p.virtual); total = real.length; eligible = real.filter(p => p.availability.state === 'ok').length; }
  }
  const [maint, review] = await Promise.all([maintenanceStatus().catch(() => null), reviewQueue().catch(() => null)]);
  const pending = (id: string) => maint?.backlog.find(b => b.id === id)?.pending ?? null;
  const sumPending = (ids: string[]) => { const v = ids.map(pending); return v.every(x => x === null) ? null : v.reduce<number>((n, x) => n + (x ?? 0), 0); };
  const stage = (id: string, label: string, count: number | null, detail: string | null, running = false): PipelineStage =>
    ({ id, label, count, detail, state: running ? 'running' : count ? 'waiting' : 'idle' });
  const mRun = maint?.running?.job ?? null;
  const enrichment = pending('held-books'), licence = sumPending(['licence-fill', 'licence-spelling']), classification = pending('journal-departments');
  return {
    asOf: new Date().toISOString(),
    stages: [
      { id: 'discovery', label: 'Discovery', state: state.enabled === false ? 'idle' : eligible > 0 ? 'running' : 'waiting', count: eligible, detail: `${eligible} of ${total} sources can be asked now` },
      { id: 'normalise', label: 'Normalise · rights check', state: 'inline', count: null, detail: 'Done inside every discovery turn; nothing queues here' },
      stage('enrichment', 'Enrichment', enrichment, 'Held books waiting for a second look', mRun === 'held-books'),
      stage('licence', 'Licence', licence, 'Records waiting for licence completion', mRun === 'licence-fill' || mRun === 'licence-spelling'),
      stage('classification', 'Classification', classification, 'Journals waiting for a department', mRun === 'journal-departments'),
      stage('review', 'Review', review?.awaiting ?? null, review ? `${review.newToday} new today` : null),
    ],
  };
}
