import { randomUUID } from 'node:crypto';
import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { harvestFeed, DOAB_OAI, OAPEN_OAI, OTL_FEED, OPENLIBRARY_FEED, type OaiProviderConfig, type HarvestReport } from './books/oaiHarvest.js';
import { profileOf } from './books/departmentProfiles.js';
import { bookCoverageByDepartment, belowTarget, TARGETS, type BookCoverage } from './bookCoverage.js';
import { sourceHealthState } from './sourceHealth.js';
import { tryLockProvider, unlockProvider } from './providerLocks.js';
import { bump, totals, createRunWithStats, runColumnsFromStats, type DeptStats } from './departmentStats.js';
import { canonicalDepartmentName } from '../departmentRegistry.js';
import { booksOai } from '../ingestionWorker.js';
import type { TurnCtx, TurnOutcome } from './rotation.js';

/**
 * Targeted Book coverage: bring books to the departments that hold the fewest, without weakening anything.
 *
 * WHAT TARGETING DECIDES, AND WHAT IT NEVER DECIDES
 *   Targeting decides where to LOOK: which department is worked on next, and what a searchable provider is asked for (the department's
 *   query profile). It never decides what a book IS. Every candidate, from every provider, goes through the pipeline every book goes
 *   through — dedupe (ISBN, DOI, provider id, title+author+year), rights and access (an unknown licence is Metadata Only), and the
 *   department classifier (a code AND the title or subject wording must agree). A book the classifier does not place in the targeted
 *   department is NOT published there, whatever was searched for: a run is scoped to its department, so other departments' books are
 *   left for the ordinary harvest, which reaches them in its own time.
 *
 * WHERE EACH PROVIDER CAN BE ASKED
 *   Open Library   subject search — asked for the department's query profile. Review-first, Metadata Only.
 *   DOAB, OAPEN    their search APIs refuse us; their OAI feeds can only be read in order. A targeted run reads them with its OWN position and
 *                  keeps only what the classifier places in the department.
 *   Open Textbook  the same: read in order, filtered by the classifier.
 *   Library
 *
 * ISOLATION
 *   Every position here (and every cooldown) lives in one setting row of its own. A targeted run is a MANUAL harvest: it never reads or
 *   writes BookHarvestCheckpoint, so the continuous engine resumes exactly where it was.
 *
 * FAIRNESS
 *   The department chosen is the lowest-covered one that is not resting. A department that gave nothing is rested for a while (longer each
 *   time), so one department with little to find cannot hold the whole share. Departments above the target are not starved: the other
 *   30% of Books turns are the ordinary rotation, which visits everything.
 */

const STATE_KEY = 'ingestion.books.targeting.v1';
const CONFIG_KEY = 'ingestion.books.priority.v1';

export type PriorityConfig = { enabled: boolean; /** Share of Books turns given to targeted work, 0.1–0.9. */ share: number; /** Published books a department should hold. */ target: number };
export const DEFAULT_PRIORITY: PriorityConfig = { enabled: true, share: 0.7, target: TARGETS.phase1 };

type DeptState = { zeroRuns: number; nextEligibleAt: string | null; lastRunAt: string | null; lastChecked: number; lastAdded: number; lastReview: number };
type Position = { cursor: string | null; exhaustedAt: string | null; refreshAfter: string | null; lastAt: string | null };
type TargetState = { turn: number; depts: Record<string, DeptState>; positions: Record<string, Position> };

const blankState = (): TargetState => ({ turn: 0, depts: {}, positions: {} });

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.appSetting.findUnique({ where: { key } }).catch(() => null);
  const v = row?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? ({ ...(fallback as any), ...(v as any) } as T) : fallback;
}
async function writeSetting(key: string, value: any, by = 'engine') {
  await db.appSetting.upsert({ where: { key }, create: { key, value, updatedBy: by }, update: { value, updatedBy: by } }).catch(() => {});
}

export const loadState = (): Promise<TargetState> => readSetting<TargetState>(STATE_KEY, blankState());
const saveState = (s: TargetState) => writeSetting(STATE_KEY, s);

// ── Settings ────────────────────────────────────────────────────────────────

export const loadPriorityConfig = (): Promise<PriorityConfig> => readSetting<PriorityConfig>(CONFIG_KEY, DEFAULT_PRIORITY);

export class PriorityError extends Error {}
export async function savePriorityConfig(patch: Partial<PriorityConfig>, admin: any): Promise<PriorityConfig> {
  const cur = await loadPriorityConfig();
  const next: PriorityConfig = { ...cur };
  if (patch.enabled !== undefined) { if (typeof patch.enabled !== 'boolean') throw new PriorityError('enabled must be true or false'); next.enabled = patch.enabled; }
  if (patch.share !== undefined) {
    if (typeof patch.share !== 'number' || !Number.isFinite(patch.share) || patch.share < 0.1 || patch.share > 0.9) throw new PriorityError('share must be between 0.1 and 0.9');
    next.share = Math.round(patch.share * 100) / 100;
  }
  if (patch.target !== undefined) {
    if (!Number.isInteger(patch.target) || patch.target < 25 || patch.target > 1000) throw new PriorityError('target must be a whole number between 25 and 1000');
    next.target = patch.target;
  }
  await writeSetting(CONFIG_KEY, next, admin?.email || 'admin');
  await audit(admin ?? null, 'BOOK_PRIORITY_CHANGED', { from: cur, to: next });
  return next;
}

// ── Choosing the department ─────────────────────────────────────────────────

/** Rest after a targeted run that gave nothing: 6 h, then 12, 24… up to a week. A time, never a verdict. */
export const restHours = (zeroRuns: number) => Math.min(24 * 7, 6 * 2 ** Math.max(0, zeroRuns - 1));

/**
 * The lowest-covered department below the target that is not resting. Zero-book departments come first because zero is lowest;
 * ties go to the alphabet. Returns null when every department is at target or resting.
 */
export function pickTargetDepartment(coverage: BookCoverage, state: TargetState, target: number, now = Date.now()): string | null {
  for (const d of belowTarget(coverage, target)) {
    const rest = state.depts[d.department]?.nextEligibleAt;
    if (rest && new Date(rest).getTime() > now) continue;
    return d.department;
  }
  return null;
}

/**
 * Is this Books turn a targeted one? Of every ten Books turns, `share × 10` are targeted and the rest are the ordinary rotation, so a
 * department that is already well covered keeps being visited and nothing is starved. Deterministic, so it can be tested and explained.
 */
export const isTargetedTurn = (turn: number, share: number) => (((turn % 10) + 10) % 10) < Math.round(share * 10);

export async function nextBooksTurn(): Promise<number> {
  const s = await loadState();
  const n = s.turn;
  s.turn = n + 1;
  await saveState(s);
  return n;
}

// ── The providers a targeted run uses ───────────────────────────────────────

type Source = { id: string; cfg: OaiProviderConfig; healthKey: string; envOff: string | null; share: number; /** The next full read is not due until this long after one reaches the end. */ refreshDays: number; searchable: boolean };
const SOURCES: Source[] = [
  { id: 'openlibrary', cfg: OPENLIBRARY_FEED, healthKey: 'OpenLibrary', envOff: 'BOOKS_OPENLIBRARY', share: 0.30, refreshDays: 30, searchable: true },
  { id: 'doab', cfg: DOAB_OAI, healthKey: 'DOAB', envOff: null, share: 0.35, refreshDays: 14, searchable: false },
  { id: 'oapen', cfg: OAPEN_OAI, healthKey: 'OAPEN', envOff: 'BOOKS_OAPEN', share: 0.20, refreshDays: 14, searchable: false },
  { id: 'otl', cfg: OTL_FEED, healthKey: 'open.umn.edu', envOff: 'BOOKS_OTL', share: 0.15, refreshDays: 14, searchable: false },
];

let delayOverride: number | undefined;
/** Tests only: how long a targeted read waits between pages. */
export function __useTargetedDelayForTests(ms: number | undefined) { delayOverride = ms; }

export type TargetedResult = {
  department: string; checked: number; added: number; addedToDepartment: number; held: number; enriched: number; sentToReview: number; skipped: number; failed: number;
  byDepartment: DeptStats; notes: string[]; providers: { id: string; label: string; outcome: string; checked: number; added: number; review: number }[];
  /** At least one provider answered. When false the run found nothing because nothing could be asked, not because nothing was there. */
  asked: boolean;
};

const dups = (r: HarvestReport) => Object.values(r.duplicates).reduce((a, b) => a + b, 0);

/**
 * One targeted run for one department. `scope` names whose position is read: the department itself for a manual run, '*' for the
 * engine's shared one. `accept` is the set of departments a book may land in (the department itself for a manual run; every department
 * below target for the engine, so one pass through a feed helps all of them).
 */
export async function runTargeted(opts: {
  department: string; limit: number; mode: 'continuous' | 'manual'; accept?: string[]; progress?: (r: Partial<TargetedResult>) => void; now?: () => Date;
}): Promise<TargetedResult> {
  const department = canonicalDepartmentName(opts.department);
  if (!department) throw new PriorityError(`"${opts.department}" is not a canonical department`);
  const profile = profileOf(department)!;
  const now = (opts.now ?? (() => new Date()))();
  const state = await loadState();
  const accept = (opts.accept?.length ? opts.accept : [department]).map(d => canonicalDepartmentName(d)).filter(Boolean) as string[];
  const result: TargetedResult = { department, checked: 0, added: 0, addedToDepartment: 0, held: 0, enriched: 0, sentToReview: 0, skipped: 0, failed: 0, byDepartment: {}, notes: [], providers: [], asked: false };
  const owner = opts.mode === 'manual' ? 'manual' : 'continuous';

  for (const src of SOURCES) {
    if (result.checked >= opts.limit) break;
    if (src.envOff && process.env[src.envOff] === '0') { result.providers.push({ id: src.id, label: src.cfg.label, outcome: `switched off (${src.envOff}=0)`, checked: 0, added: 0, review: 0 }); continue; }
    if (src.id !== 'doab' && !booksOai()) { result.providers.push({ id: src.id, label: src.cfg.label, outcome: 'switched off (BOOKS_OAI=0)', checked: 0, added: 0, review: 0 }); continue; }

    // Never ask a source that is resting, and never one that is being worked on right now.
    const h = await sourceHealthState(src.healthKey);
    if (h.until) { result.providers.push({ id: src.id, label: src.cfg.label, outcome: `resting until ${h.until.toISOString()}${h.reason ? ` (${h.reason})` : ''}`, checked: 0, added: 0, review: 0 }); continue; }
    const key = `${src.id}|${src.searchable || opts.mode === 'manual' ? department : '*'}`;
    const pos = state.positions[key] ?? (state.positions[key] = { cursor: null, exhaustedAt: null, refreshAfter: null, lastAt: null });
    if (pos.exhaustedAt && pos.refreshAfter && new Date(pos.refreshAfter).getTime() > now.getTime()) {
      result.providers.push({ id: src.id, label: src.cfg.label, outcome: `read to the end; read again after ${new Date(pos.refreshAfter).toISOString().slice(0, 10)}`, checked: 0, added: 0, review: 0 }); continue;
    }
    if (!tryLockProvider(src.cfg.provider, owner)) { result.providers.push({ id: src.id, label: src.cfg.label, outcome: 'busy', checked: 0, added: 0, review: 0 }); continue; }

    const budget = Math.max(10, Math.min(opts.limit - result.checked, Math.ceil(opts.limit * src.share)));
    const cfg: OaiProviderConfig = { ...src.cfg, allowedDepartments: src.searchable ? [department] : accept, ...(src.searchable ? { queries: profile.queries } : {}) };
    let report: HarvestReport | null = null;
    try {
      report = await harvestFeed(cfg, {
        manual: true, ignoreCheckpoint: true, startToken: pos.exhaustedAt ? null : pos.cursor, from: null,
        maxRecords: budget,
        // A subject search spends a request on every phrase, and most phrases return fewer than a page, so it gets more requests than records
        // alone would call for (still a handful, at one a second). The position is kept, so the next run carries on with the next phrases.
        maxPages: src.searchable ? Math.min(8, Math.ceil(budget / 20) + 4) : Math.ceil(budget / 25) + 1,
        pageDelayMs: delayOverride ?? (src.searchable ? 1100 : undefined),
      });
    } catch (e: any) {
      result.providers.push({ id: src.id, label: src.cfg.label, outcome: `stopped: ${String(e?.message || e).slice(0, 120)}`, checked: 0, added: 0, review: 0 });
      continue;
    } finally { unlockProvider(src.cfg.provider, owner); }

    // Where this source's own targeted position stands now. A source read to its end is left alone until its refresh time.
    pos.lastAt = now.toISOString();
    if (report.completed) { pos.cursor = null; pos.exhaustedAt = now.toISOString(); pos.refreshAfter = new Date(now.getTime() + src.refreshDays * 86_400_000).toISOString(); }
    else if (report.nextCursor) { pos.cursor = report.nextCursor; pos.exhaustedAt = null; pos.refreshAfter = null; }

    if (report.sourceError && !report.pages) {
      result.providers.push({ id: src.id, label: src.cfg.label, outcome: `did not answer (${report.sourceError.slice(0, 100)})`, checked: 0, added: 0, review: 0 });
      continue;
    }
    result.asked = true;
    const t = totals(report.departmentStats);
    result.checked += report.fetched;
    result.added += t.added; result.held += dups(report); result.enriched += report.enriched; result.sentToReview += t.sentToReview; result.skipped += t.skipped; result.failed += t.failed;
    for (const [d, c] of Object.entries(report.departmentStats)) for (const k of ['added', 'held', 'sentToReview', 'skipped', 'failed'] as const) if (c[k]) bump(result.byDepartment, d, k, c[k]);
    result.providers.push({ id: src.id, label: src.cfg.label, outcome: report.completed ? 'read to the end' : 'read part-way', checked: report.fetched, added: t.added, review: t.sentToReview });
    if (src.cfg.reviewFirst) result.notes.push(`${src.cfg.label}: review-first — what it found waits for a person, and nothing is Open Access unless its licence says so`);
    opts.progress?.({ checked: result.checked, added: result.added, sentToReview: result.sentToReview });
  }

  result.addedToDepartment = result.byDepartment[department]?.added ?? 0;
  await saveState(state);
  return result;
}

// ── Cooldowns ───────────────────────────────────────────────────────────────

/** Record what a targeted run did for a department, and rest it if it gave nothing. */
export async function recordTargetedOutcome(department: string, r: TargetedResult, now = new Date()) {
  const s = await loadState();
  const d = s.depts[department] ?? (s.depts[department] = { zeroRuns: 0, nextEligibleAt: null, lastRunAt: null, lastChecked: 0, lastAdded: 0, lastReview: 0 });
  d.lastRunAt = now.toISOString(); d.lastChecked = r.checked; d.lastAdded = r.addedToDepartment; d.lastReview = r.sentToReview;
  const gaveSomething = r.addedToDepartment > 0 || r.sentToReview > 0;
  if (gaveSomething) { d.zeroRuns = 0; d.nextEligibleAt = null; }
  else if (r.asked) { d.zeroRuns += 1; d.nextEligibleAt = new Date(now.getTime() + restHours(d.zeroRuns) * 3_600_000).toISOString(); }
  await saveState(s);
}

/** For the screen: which departments are resting, until when, and why. */
export async function targetingStatus() {
  const [config, state, coverage] = await Promise.all([loadPriorityConfig(), loadState(), bookCoverageByDepartment()]);
  const now = Date.now();
  const below = belowTarget(coverage, config.target);
  const next = pickTargetDepartment(coverage, state, config.target, now);
  return {
    config, next,
    below: below.map(d => ({ department: d.department, published: d.published, resting: !!(state.depts[d.department]?.nextEligibleAt && new Date(state.depts[d.department].nextEligibleAt!).getTime() > now), restUntil: state.depts[d.department]?.nextEligibleAt ?? null, lastRunAt: state.depts[d.department]?.lastRunAt ?? null })),
    positions: Object.entries(state.positions).map(([k, p]) => ({ key: k, cursor: p.cursor, exhaustedAt: p.exhaustedAt, refreshAfter: p.refreshAfter })),
  };
}

// ── The engine's turn ───────────────────────────────────────────────────────


/** One targeted Books turn: pick the department, run it, rest it if it gave nothing. */
export async function targetedTurn(ctx: TurnCtx): Promise<TurnOutcome> {
  const config = await loadPriorityConfig();
  if (!config.enabled) return { kind: 'nothing-due', note: 'Prioritising low-coverage departments is switched off' };
  const [coverage, state] = await Promise.all([bookCoverageByDepartment(), loadState()]);
  const department = pickTargetDepartment(coverage, state, config.target);
  if (!department) return { kind: 'nothing-due', note: `Every department is at ${config.target}+ books or resting after a run that found nothing` };

  const r = await runTargeted({ department, limit: ctx.batch, mode: 'continuous', accept: belowTarget(coverage, config.target).map(d => d.department) });
  await recordTargetedOutcome(department, r);
  if (!r.asked) return { kind: 'nothing-due', note: `${department}: no provider could be asked right now (${r.providers.map(p => `${p.label}: ${p.outcome}`).join('; ')})` };

  return {
    kind: 'ran', checked: r.checked, added: r.added, held: r.held, enriched: r.enriched, sentToReview: r.sentToReview, skipped: r.skipped, recordFailures: r.failed,
    useful: r.added + r.sentToReview + r.enriched, more: true, departmentStats: r.byDepartment,
    note: `Targeted ${department} (${coverage.departments.find(d => d.department === department)?.published ?? 0} published): ${r.providers.map(p => `${p.label} ${p.checked ? `${p.checked} checked` : p.outcome}`).join(' · ')}`,
    ledger: { booksAdded: r.added, booksSkipped: r.held + r.skipped + r.failed },
    journal: { department },
  };
}

// ── Quick Import for one department ─────────────────────────────────────────

export type TargetedJob = { id: string; department: string; status: 'running' | 'done' | 'error'; startedAt: number; finishedAt?: number; limit: number; result?: TargetedResult; error?: string; progress: Partial<TargetedResult> };
const jobs = new Map<string, TargetedJob>();
export const getTargetedJob = (id: string) => jobs.get(id) ?? null;
export const runningTargetedJob = () => [...jobs.values()].find(j => j.status === 'running') ?? null;
export function __resetTargetedJobsForTests() { jobs.clear(); }

export class TargetedError extends Error { constructor(message: string, public status = 400) { super(message); } }

/**
 * A bounded targeted import for ONE department, started by hand. Uses the department's query profile, the healthy providers, the same dedupe,
 * rights and classifier, the provider locks and cooldowns, and positions of its own: the continuous checkpoints are not read or moved.
 */
export async function beginTargetedImport(department: string, limit: number, admin: any): Promise<TargetedJob> {
  const name = canonicalDepartmentName(department);
  if (!name) throw new TargetedError('That is not a canonical department.');
  if (!Number.isInteger(limit) || limit < 10 || limit > 500) throw new TargetedError('The limit must be a whole number between 10 and 500.');
  if (runningTargetedJob()) throw new TargetedError('A targeted import is already running. Wait for it to finish.', 409);
  const job: TargetedJob = { id: randomUUID(), department: name, status: 'running', startedAt: Date.now(), limit, progress: {} };
  jobs.set(job.id, job);
  await audit(admin ?? null, 'TARGETED_BOOKS_STARTED', { department: name, limit });
  const t0 = Date.now();
  (async () => {
    try {
      const r = await runTargeted({ department: name, limit, mode: 'manual', progress: p => { job.progress = p; } });
      await recordTargetedOutcome(name, r);
      // The same run log every other import leaves, with the department breakdown beside it.
      await createRunWithStats({
        phase: 'Books', source: `Targeted · ${name}`, durationMs: Date.now() - t0, more: false,
        note: `Manual targeted import · ${r.providers.map(p => `${p.label}: ${p.checked ? `${p.checked} checked, ${p.added} added, ${p.review} to review` : p.outcome}`).join(' | ')}`.slice(0, 900),
        ...runColumnsFromStats(r.byDepartment), checked: r.checked, department: name,
      }, r.byDepartment);
      await audit(admin ?? null, 'TARGETED_BOOKS_FINISHED', { department: name, checked: r.checked, added: r.added, addedToDepartment: r.addedToDepartment, sentToReview: r.sentToReview });
      Object.assign(job, { status: 'done', result: r, finishedAt: Date.now() });
    } catch (e: any) {
      Object.assign(job, { status: 'error', error: String(e?.message || e).slice(0, 300), finishedAt: Date.now() });
    }
  })();
  return job;
}
