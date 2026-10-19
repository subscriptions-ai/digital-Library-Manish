import { ingestionDb as db } from './db.js';

/**
 * Where the rotation has got to, kept in the existing AppSetting table (one JSON row) so it survives a restart and needs no new
 * schema. It holds only scheduling facts — never catalogue data and never a provider's own checkpoint (those stay where they
 * always were: BookHarvestCheckpoint, DepartmentSweep, Journal.fetchCursor), so nothing here can reset a provider.
 */

export type Group = 'Journals' | 'Articles' | 'Books';
export const GROUPS: Group[] = ['Journals', 'Articles', 'Books'];

export type BatchSummary = {
  at: string; outcome: 'ok' | 'idle' | 'failed' | 'rate_limited' | 'quota' | 'skipped';
  checked: number; added: number; held: number; enriched: number; sentToReview: number; skipped: number; recordFailures: number; requestFailures: number;
  useful: number; note?: string | null;
};

export type ProviderRuntime = {
  /** Consecutive batches that gave nothing useful. Reset by any useful batch. */
  zeroYield: number;
  /** A healthy source that gave nothing for the set number of batches is left out of the rotation until then. A time, not a verdict. */
  exhaustedUntil?: string | null;
  /** When it was set aside as exhausted, and when it becomes eligible for discovery again. "Exhausted for now" is never forever. */
  exhaustedAt?: string | null;
  refreshAfter?: string | null;
  /** After a failed request below the threshold the same source is not asked again before this. */
  softBackoffUntil?: string | null;
  lastBatch?: BatchSummary | null;
  /** The last batch that gave something useful. `lastBatch` is overwritten by an empty one; this is not. */
  lastProductiveBatch?: BatchSummary | null;
  /** The engine's own place in a source that has no checkpoint of its own (department-search sources). Never shared with Quick Import. */
  position?: any;
};

export type RotationState = {
  /** The content type whose turn is next in Everything mode. */
  typeCursor: number;
  /** Per content type, the index in its chain the next turn starts from. */
  cursors: Partial<Record<Group, number>>;
  providers: Record<string, ProviderRuntime>;
  /** The provider working right now, and the one that last worked, per content type. */
  running: { group: Group; provider: string; since: string } | null;
  current: Partial<Record<Group, string>>;
  /** A content type none of whose sources could be asked, since when and why. Cleared when one works. */
  waiting: Partial<Record<Group, { since: string; reason: string; retryAt: string | null }>>;
  /**
   * The engine has nothing it can ask right now, and is sleeping until `nextAt`. One record for the whole stretch: the run log gets one row when it begins
   * (and another only if the picture changes), not one per timer tick. Cleared the moment any source runs, or an administrator changes how the engine is set.
   */
  idle?: IdleState | null;
  /** Why the engine chose its last job: content priority, coverage, source health, what was skipped. Shown collapsed on the screen. */
  lastDecision?: Decision | null;
  /** A local backlog job working right now (re-judging held books, filling departments). Null when none is. */
  localRunning?: { job: string; label: string; group: Group; since: string } | null;
  updatedAt: string | null;
};

export type Decision = {
  at: string; group: Group; label: string;
  kind: 'source' | 'coverage' | 'local';
  reasons: string[];
};

export type IdleState = {
  since: string;
  /** What the picture is (which sources, resting why, until when). The same signature again means nothing new to say. */
  signature: string;
  /** When the soonest source can be asked again; null when nothing has a time (then the engine looks again at every tick, cheaply, without logging). */
  nextAt: string | null;
  /** The source that comes back first. */
  next: { group: Group; provider: string; label: string; at: string; reason: string | null } | null;
  /** True when a source is blocked by something with no end time (a Quick Import on it, a review backlog): not a thing to sleep through. */
  open: boolean;
  /** The engine settings the picture was judged under; a different set wakes the engine at once. */
  fingerprint: string;
  /** Whether it is waiting on sources that are down/resting, or every source is simply up to date. */
  cause: 'recovery' | 'caught-up';
  /** What the run log said when this began; a sleeping tick answers with the same words. */
  note: string;
};

const KEY = 'ingestion.rotation.v1';
export const blankState = (): RotationState => ({ typeCursor: 0, cursors: {}, providers: {}, running: null, current: {}, waiting: {}, idle: null, updatedAt: null });

export async function loadRotationState(): Promise<RotationState> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = row?.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return blankState();
  return { ...blankState(), ...(v as any), providers: { ...((v as any).providers || {}) } };
}

export async function saveRotationState(s: RotationState): Promise<void> {
  s.updatedAt = new Date().toISOString();
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s as any, updatedBy: 'engine' }, update: { value: s as any, updatedBy: 'engine' } }).catch(() => {});
}

export const runtimeOf = (s: RotationState, id: string): ProviderRuntime => (s.providers[id] ||= { zeroYield: 0 });

/** Tests only: forget where the rotation was. (A scheduling row; no catalogue data and no provider checkpoint is touched.) */
export async function __resetRotationState() { await db.appSetting.deleteMany({ where: { key: KEY } }).catch(() => {}); }
