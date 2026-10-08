import { INGESTION_POLICY } from './policy.js';

/**
 * What an administrator may change on the engine, validated on the server.
 *
 * The screen used to turn an empty box into a default — `parseInt(x) || 7`, `|| 50`, and for "articles per
 * journal" `|| 0`, which means "no limit" — and save it on every keystroke. Clearing a box therefore changed
 * the saved configuration. Nothing is defaulted here: a value that is not a whole number inside its range is
 * refused with the reason, and the saved value is left exactly as it was.
 */

export type SettingsResult =
  | { ok: true; data: Record<string, any>; changes: Record<string, { from: any; to: any }>; scope?: { from: string[]; to: string[] }; enabledChange?: boolean }
  | { ok: false; status: number; errors: string[]; needsConfirmation?: 'SCOPE_CHANGE' };

const TUNING = ['yearsBack', 'batchSize', 'articlesPerJournal', 'discoverEvery'] as const;
const FOCUS = ['auto', 'journals', 'books', 'articles'];

const same = (a: any[], b: any[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

export function validateSettings(body: any, current: any, allDepartments: string[]): SettingsResult {
  const errors: string[] = [];
  const data: Record<string, any> = {};
  const changes: Record<string, { from: any; to: any }> = {};
  const b = body && typeof body === 'object' ? body : {};
  const limits = INGESTION_POLICY.settings;

  const note = (k: string, to: any) => { if (current[k] !== to) { data[k] = to; changes[k] = { from: current[k], to }; } };

  if ('enabled' in b) {
    if (typeof b.enabled !== 'boolean') errors.push('enabled must be true or false.');
    else note('enabled', b.enabled);
  }
  if ('focus' in b) {
    if (!FOCUS.includes(b.focus)) errors.push(`focus must be one of: ${FOCUS.join(', ')}.`);
    else note('focus', b.focus);
  }

  const labels: Record<string, string> = {
    yearsBack: 'Years to collect', batchSize: 'Articles per pass', articlesPerJournal: 'Articles per journal', discoverEvery: 'Look for more every',
  };
  const touchingTuning: string[] = [];
  for (const k of TUNING) {
    if (!(k in b)) continue;
    const v = b[k]; const { min, max } = (limits as any)[k];
    if (typeof v !== 'number' || !Number.isInteger(v)) { errors.push(`${labels[k]} must be a whole number.`); continue; }
    if (v < min || v > max) { errors.push(`${labels[k]} must be between ${min} and ${max}.`); continue; }
    if (v !== current[k]) touchingTuning.push(k);
    note(k, v);
  }

  let scope: { from: string[]; to: string[] } | undefined;
  if ('departments' in b) {
    if (!Array.isArray(b.departments) || b.departments.some((d: any) => typeof d !== 'string')) errors.push('departments must be a list of department names.');
    else {
      const unknown = b.departments.filter((d: string) => !allDepartments.includes(d));
      if (unknown.length) errors.push(`Unknown department: ${unknown.slice(0, 3).join(', ')}.`);
      else {
        const to = [...new Set<string>(b.departments)];
        const from: string[] = Array.isArray(current.departments) ? current.departments : [];
        if (!same(from, to)) { data.departments = to; changes.departments = { from, to }; scope = { from, to }; }
      }
    }
  }

  if (errors.length) return { ok: false, status: 400, errors };

  // While the engine runs, its tuning is read-only: a value changed under a running pass is a value the pass
  // may be half way through using. Pausing and resuming in one request is allowed.
  const stayingOn = current.enabled && !(data.enabled === false);
  if (stayingOn && touchingTuning.length) {
    return { ok: false, status: 409, errors: ['Pause the engine to edit ingestion settings.'] };
  }

  // Changing which departments are worked on while the engine is running is a major change: it must be confirmed.
  if (stayingOn && scope && b.confirmScopeChange !== true) {
    return { ok: false, status: 409, errors: ['Changing the active scope while the engine is running needs confirmation.'], needsConfirmation: 'SCOPE_CHANGE' };
  }

  return { ok: true, data, changes, scope, enabledChange: 'enabled' in changes };
}
