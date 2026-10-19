import { ingestionDb as db } from './db.js';
import { journalCoverageByDepartment, LOW_JOURNALS } from './bookCoverage.js';
import { sourceHealthState } from './sourceHealth.js';
import { providerHolder, tryLockProvider, unlockProvider } from './providerLocks.js';
import type { TurnCtx, TurnOutcome } from './rotation.js';

/**
 * Journal coverage: Journals turns for the departments that hold the fewest DISTINCT journal titles.
 *
 * Not a source. It picks the lowest-covered department (journal titles, counted from the Journal table — never from articles, so a journal with
 * a thousand articles is one journal), and walks that department's searches on the first journal source that can be asked right now:
 * DOAJ (licence verified per title), then Crossref Journals and OpenAlex Sources (catalogued as metadata only or held for review, open access
 * NOT verified — the same rules as when they run as fallbacks). Each source keeps its own sweep rows, health and lock; this only chooses which
 * department's searches go first. A department whose run finds nothing rests (6 h, doubling to a week), so the engine moves on to the next.
 *
 * Nothing is counted twice and nothing is forced equal: departments are not given journals, they are searched in order of need.
 */

export type JournalSourceTurn = { id: string; label: string; healthKey: string; lock: string; sweepSource: string; turn: (ctx: TurnCtx) => Promise<TurnOutcome> };

type DeptState = { zeroRuns: number; nextEligibleAt: string | null; lastRunAt: string | null; lastAdded: number };
type CoverageState = { depts: Record<string, DeptState> };
const KEY = 'ingestion.journals.coverage.v1';
export const journalTarget = () => { const n = Number(process.env.INGESTION_JOURNAL_COVERAGE_TARGET); return Number.isInteger(n) && n > 0 ? n : LOW_JOURNALS; };
const restHours = (zeroRuns: number) => Math.min(24 * 7, 6 * 2 ** Math.max(0, zeroRuns - 1));

async function load(): Promise<CoverageState> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v: any = row?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? { depts: { ...(v.depts || {}) } } : { depts: {} };
}
async function save(s: CoverageState) {
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s as any, updatedBy: 'engine' }, update: { value: s as any, updatedBy: 'engine' } }).catch(() => {});
}

/** The lowest-covered department below the target, within the engine's scope, that is not resting. Fewest titles first; ties by name. */
export function pickJournalDepartment(departments: { department: string; total: number }[], state: CoverageState, scope: string[], target: number, now = Date.now()): string | null {
  const inScope = new Set(scope);
  for (const d of [...departments].sort((a, b) => a.total - b.total || a.department.localeCompare(b.department))) {
    if (d.total >= target) break;
    if (scope.length && !inScope.has(d.department)) continue;
    const rest = state.depts[d.department]?.nextEligibleAt;
    if (rest && Date.parse(rest) > now) continue;
    return d.department;
  }
  return null;
}

export function journalCoverageTurn(sources: JournalSourceTurn[]) {
  return async (ctx: TurnCtx): Promise<TurnOutcome> => {
    const target = journalTarget();
    const [cov, state] = await Promise.all([journalCoverageByDepartment(), load()]);
    const department = pickJournalDepartment(cov.departments, state, ctx.wanted, target);
    if (!department) return { kind: 'nothing-due', note: `Every department in scope holds ${target}+ journal titles or is resting after a search that found nothing` };
    const titles = cov.departments.find(d => d.department === department)?.total ?? 0;

    const skipped: string[] = [];
    for (const src of sources) {
      // Never a source that is resting or being worked on; its own breaker and lock decide, not this.
      const h = await sourceHealthState(src.healthKey);
      if (h.until) { skipped.push(`${src.label} resting`); continue; }
      if (providerHolder(src.lock) || !tryLockProvider(src.lock, 'continuous')) { skipped.push(`${src.label} busy`); continue; }
      let out: TurnOutcome;
      try { out = await src.turn({ ...ctx, wanted: [department] }); }
      catch (e: any) { out = { kind: 'request-failed', error: String(e?.message || e).slice(0, 200) }; }
      finally { unlockProvider(src.lock, 'continuous'); }
      if (out.kind === 'nothing-due') { skipped.push(`${src.label}: searches walked out`); continue; }
      if (out.kind !== 'ran') {
        // The source did not answer. Its own turn already wrote that to ITS health row (so its breaker counts it); this turn just tries the next.
        skipped.push(`${src.label} ${out.kind === 'request-failed' ? `did not answer (${out.error.slice(0, 80)})` : out.kind}`);
        continue;
      }
      const d = state.depts[department] ?? (state.depts[department] = { zeroRuns: 0, nextEligibleAt: null, lastRunAt: null, lastAdded: 0 });
      d.lastRunAt = new Date().toISOString(); d.lastAdded = out.added;
      if (out.useful > 0) { d.zeroRuns = 0; d.nextEligibleAt = null; }
      else { d.zeroRuns += 1; d.nextEligibleAt = new Date(Date.now() + restHours(d.zeroRuns) * 3_600_000).toISOString(); }
      await save(state);
      return { ...out, note: `Journal coverage · ${department} (${titles} journal titles, target ${target}) via ${src.label}: ${out.note ?? ''}${skipped.length ? ` · skipped ${skipped.join(', ')}` : ''}`, journal: { department } };
    }
    // Every source's searches for this department are walked out (or none could be asked): rest the department, try another next time.
    const d = state.depts[department] ?? (state.depts[department] = { zeroRuns: 0, nextEligibleAt: null, lastRunAt: null, lastAdded: 0 });
    d.zeroRuns += 1; d.nextEligibleAt = new Date(Date.now() + restHours(d.zeroRuns) * 3_600_000).toISOString(); d.lastRunAt = new Date().toISOString();
    await save(state);
    return { kind: 'nothing-due', note: `Journal coverage · ${department}: ${skipped.join('; ') || 'no journal source could be asked'} — resting this department` };
  };
}

export async function journalCoverageStatus() {
  const target = journalTarget();
  const [cov, state] = await Promise.all([journalCoverageByDepartment(), load()]);
  const now = Date.now();
  return {
    target,
    below: cov.departments.filter(d => d.total < target).map(d => ({ department: d.department, titles: d.total, restUntil: state.depts[d.department]?.nextEligibleAt && Date.parse(state.depts[d.department].nextEligibleAt!) > now ? state.depts[d.department].nextEligibleAt : null })),
  };
}
