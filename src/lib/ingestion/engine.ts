import { ingestionDb as db } from './db.js';
import { getState, runIngestionPass } from '../ingestionWorker.js';
import { runRotationPass, wakeEngine } from './rotation.js';
import { installProviders, getRoadAdapter } from './providers.js';
export { getRoadAdapter, wakeEngine };
import { createRunWithStats } from './departmentStats.js';

/**
 * The one entry the timer and the "Run one pass" button call.
 *
 * Everything mode is the fair rotation (rotation.ts). INGESTION_ROTATION=0 puts the engine back on the previous scheduler —
 * OpenAlex-only articles, one pass in five for discovery — without touching any data: the rotation's state is one setting row
 * that is simply not read, and no provider's checkpoint was ever changed by it. That is the rollback.
 */
export const rotationEnabled = () => process.env.INGESTION_ROTATION !== '0';

let installed = false;
/** The registry is built once; safe to call from anywhere that needs the providers' details. */
export function ensureProviders() { if (!installed) { installProviders(); installed = true; } }

export async function runEnginePass(
  departments: string[],
  opts: { force?: boolean; only?: 'journals' | 'articles' | 'books'; departments?: string[] } = {},
) {
  if (!rotationEnabled()) return runIngestionPass(departments, opts);
  const state = await getState();
  if (!state.enabled && !opts.force) return { skipped: 'disabled' };
  ensureProviders();

  try {
    // Departments asked for by name beat the stored setting, the same way `force` beats the pause switch.
    const stored = (state.departments as string[]) || [];
    const wanted: string[] = opts.departments?.length ? opts.departments : stored.length ? stored : departments;
    const narrowed = Boolean(opts.departments?.length || stored.length);
    const only = opts.only ?? (state.focus && state.focus !== 'auto' ? (state.focus as 'journals' | 'articles' | 'books') : undefined);
    // The pass is counted once the engine has actually looked. A tick that finds the engine asleep (nothing can be asked until a known time)
    // is not a pass, and writes nothing — see runRotationPass.
    const countPass = () => db.ingestionState.update({ where: { id: 'singleton' }, data: { passCount: { increment: 1 } } }).catch(() => {});
    return await runRotationPass({ only, wanted, narrowed, state, force: !!opts.force, countPass });
  } catch (e: any) {
    await db.ingestionState.update({ where: { id: 'singleton' }, data: { lastError: String(e?.message || e).slice(0, 1000), lastRunAt: new Date(), consecutiveFailures: { increment: 1 } } }).catch(() => {});
    // A pass that threw is the one most worth having a record of.
    await createRunWithStats({ phase: 'Error', error: String(e?.message || e).slice(0, 1000) }, null);
    return { error: String(e?.message || e) };
  }
}
