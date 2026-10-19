import { ingestionDb as db } from './db.js';
import { rotationConfig } from './policy.js';
import { sourceHealthState, recordSourceFailure, classifyFailure, type ErrorKind } from './sourceHealth.js';
import { providerHolder, tryLockProvider, unlockProvider } from './providerLocks.js';
import { createRunWithStats, runColumnsFromStats, type DeptStats } from './departmentStats.js';
import {
  GROUPS, loadRotationState, saveRotationState, runtimeOf, type Group, type RotationState, type BatchSummary, type IdleState, type Decision,
} from './rotationState.js';
import type { LocalJob } from './localWork.js';

/**
 * The fair, self-healing scheduler for Everything mode.
 *
 * One TURN per timer tick. Everything mode takes the content types in turn — Journals, Articles, Books, and round again — so
 * no one of them can monopolise the engine. Inside a content type the providers take turns too, each with its own cursor and
 * its own checkpoint (never shared, never reset by another provider running). A turn checks up to INGESTION_BATCH_SIZE
 * candidates; that is a budget on what is LOOKED AT, not a quota of what must be inserted.
 *
 * A provider that cannot be asked is stepped over, not waited for:
 *   · HTTP 429             → set aside until the time it gave (sourceHealth did that); the turn goes to the next provider at once.
 *   · 3rd failed request   → rests (the breaker opened); the same turn goes to the next provider at once. Failures 1 and 2 retry
 *                            the same provider on its next turn, after a short soft backoff.
 *   · a daily quota (NCBI) → cooling, not failing; skipped until it resets.
 *   · its lock is held     → busy (a Quick Import is on it); skipped.
 *   · 3 batches with nothing useful → "exhausted for now"; left out for a few hours. Healthy, just not productive.
 * If no provider of a content type can be asked — every one is down, rate limited, over its quota, busy, switched off or resting as
 * exhausted — that type WAITS FOR SOURCE RECOVERY and the turn goes to the next type in the same tick. One dead source family never
 * pauses Everything, and a source is never asked before its rest is over (an exhausted one included).
 *
 * Which content type takes a tick's FIRST turn follows weights (rotationConfig().weights; Books 3, Journals 2, Articles 1 by default: Books,
 * Journals, Books, Articles, Books, Journals …). A weight is priority, never a quota — the tick still falls through to every other type.
 *
 * Only when no source of ANY type could work does the engine turn to its LOCAL backlog (localWork.ts: held books judged again under the
 * current rules, departments for unplaced journals, licences already declared elsewhere). Only when that is empty too does it wait.
 *
 * Providers are plugged in (see providers.ts), so this file knows nothing about any one of them and the rules above can be
 * exercised with stand-ins.
 */

export type Tier = 'primary' | 'supplementary' | 'fallback';

export type TurnCtx = {
  /** Candidates to CHECK this turn (INGESTION_BATCH_SIZE, or less where the source's own safety limit is smaller). */
  batch: number;
  state: any;
  wanted: string[]; narrowed: boolean;
  /** The engine's own place in a source with no checkpoint of its own; never shared with Quick Import. */
  position: any;
  savePosition: (p: any) => void;
};

export type TurnRan = {
  kind: 'ran';
  checked: number; added: number; held: number; enriched: number; sentToReview: number; skipped: number;
  /** Records the catalogue could not write. Not the same thing as the source not answering. */
  recordFailures: number;
  /** Useful: new content, valid enrichment, or a Draft that is the expected workflow. A held duplicate alone is not. */
  useful: number;
  /** Distinct candidate identifiers the turn examined (checked counts a repeat as many times as it was seen). */
  uniqueCandidates?: number;
  /** Provider requests that failed during this turn (a source that stopped answering part-way). Not records, and not counted in any record figure. */
  requestFailures?: number;
  more: boolean;
  note?: string | null;
  error?: string | null;
  /** Books: the breakdown by department, written beside the run. */
  departmentStats?: DeptStats;
  /** Columns that only some kinds of run have (journalsSeen…), and the cumulative counters to bump. */
  columns?: Record<string, any>;
  /**
   * One row per journal visited, for the article sources that go journal by journal. A journal belongs to one department, so a row
   * that names it is attributed exactly; the aggregate is what the turn reports to the scheduler.
   */
  rows?: Record<string, any>[];
  ledger?: Record<string, number>;
  journal?: { id?: string | null; title?: string | null; department?: string | null };
  /** The quota (NCBI) stopped it early: not a failure; the source rests until then. */
  quotaUntil?: Date | null;
};
export type TurnOutcome =
  | TurnRan
  | { kind: 'nothing-due'; note?: string }
  | { kind: 'busy' }
  | { kind: 'request-failed'; error: string; status?: number | null; rateLimited?: boolean;
      /** Something broke on our side (the database, a bug) rather than the provider not answering. The provider's health is not touched. */
      internal?: boolean }
  | { kind: 'quota'; until: Date; note?: string };

export type ProviderDef = {
  id: string; label: string; group: Group; role: string;
  tier: Tier;
  /** Used only when every one of these is unavailable, exhausted for now, or has just had nothing to give. */
  fallbackFor?: string[];
  healthKey: string; lock: string;
  /** True, or the reason this provider cannot run at all (not wired to a data source, switched off). */
  configured?: () => true | string;
  /**
   * Not a source but a coverage engine (targeted Books, journal coverage): it chooses which department goes first and reads sources that have their
   * own health rows. It never makes the engine "wait for source recovery" and never sets when the engine next looks.
   */
  virtual?: boolean;
  /**
   * Left out of the CONTINUOUS rotation, with the reason — while still available to Quick Import and Bulk expansion, which an administrator starts
   * deliberately. (`configured` is for a source that cannot run at all.)
   */
  rotationOff?: () => string | null;
  /** A rest that is not a failure, e.g. a daily quota. */
  restingNow?: () => Promise<null | { until: Date | null; reason: string }>;
  turn: (ctx: TurnCtx) => Promise<TurnOutcome>;
};

// ── The registry ────────────────────────────────────────────────────────────

let registry: ProviderDef[] = [];
export const setProviders = (list: ProviderDef[]) => { registry = list; };
export const getProviders = () => registry;
export const providersOf = (g: Group) => registry.filter(p => p.group === g);

/**
 * Whether this Books turn is a targeted one (the low-coverage engine's 70%), decided by whoever installs it. The scheduler asks once per
 * Books turn and knows nothing about departments: it only puts the `targeted` provider first when told to, and last otherwise, so the
 * other 30% of Books turns are the ordinary rotation and no department is ever starved.
 */
let targetedPolicy: (() => Promise<boolean>) | null = null;
export const setTargetedPolicy = (f: (() => Promise<boolean>) | null) => { targetedPolicy = f; };

/** The local backlog jobs (localWork.ts), plugged in like the providers so the scheduler can be tested with stand-ins. */
let localJobs: LocalJob[] = [];
let localPicker: ((jobs: LocalJob[], allow: (g: Group) => boolean) => Promise<{ job: LocalJob; pending: number } | null>) | null = null;
export const setLocalJobs = (jobs: LocalJob[], picker: typeof localPicker) => { localJobs = jobs; localPicker = picker; };
export const getLocalJobs = () => localJobs;

/**
 * The order content types take the first turn of a tick, from their weights: a smooth weighted round robin, so 3 / 2 / 1 interleaves as
 * Books, Journals, Books, Articles, Books, Journals rather than three Books in a row. A type with weight 0 never leads, but still runs whenever
 * the types ahead of it cannot (see orderForTick).
 */
const allEqual = (w: Record<Group, number>) => GROUPS.every(g => (w[g] ?? 0) === (w[GROUPS[0]] ?? 0));

export function typeSequence(weights: Record<Group, number>): Group[] {
  // Equal weights are the original fair rotation, in its original order. Otherwise ties go to Books, then Journals, then Articles.
  const order: Group[] = allEqual(weights) ? [...GROUPS] : ['Books', 'Journals', 'Articles'];
  const live = order.filter(g => (weights[g] ?? 0) > 0);
  if (!live.length) return [...GROUPS];
  const total = live.reduce((a, g) => a + weights[g], 0);
  const cur: Record<string, number> = Object.fromEntries(live.map(g => [g, 0]));
  const seq: Group[] = [];
  for (let i = 0; i < total; i++) {
    for (const g of live) cur[g] += weights[g];
    const pick = live.reduce((best, g) => (cur[g] > cur[best] ? g : best), live[0]);
    cur[pick] -= total;
    seq.push(pick);
  }
  return seq;
}

/** This tick's content types: the one whose slot it is first, then the rest by weight (heaviest first), so a dead type costs no time. */
export function orderForTick(seq: Group[], slot: number, weights: Record<Group, number>): Group[] {
  const lead = seq[((slot % seq.length) + seq.length) % seq.length];
  // Equal weights: the rest follow round from the lead, as the original rotation did. Otherwise the heaviest go next.
  if (allEqual(weights)) { const i = GROUPS.indexOf(lead); return GROUPS.map((_, k) => GROUPS[(i + k) % GROUPS.length]); }
  const rest = (['Books', 'Journals', 'Articles'] as Group[]).filter(g => g !== lead).sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
  return [lead, ...rest];
}

// ── Availability ────────────────────────────────────────────────────────────

export type Availability = { state: 'ok' | 'exhausted' | 'unavailable'; kind?: 'not-configured' | 'busy' | 'rate_limited' | 'cooling' | 'unavailable' | 'degraded-backoff' | 'quota'; until: Date | null; reason: string | null };

const fmtClock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();

export async function availability(p: ProviderDef, s: RotationState, now = Date.now()): Promise<Availability> {
  const cfg = p.configured?.();
  if (cfg !== undefined && cfg !== true) return { state: 'unavailable', kind: 'not-configured', until: null, reason: cfg };
  const off = p.rotationOff?.();
  if (off) return { state: 'unavailable', kind: 'not-configured', until: null, reason: off };
  if (providerHolder(p.lock)) return { state: 'unavailable', kind: 'busy', until: null, reason: 'being worked on right now' };
  const h = await sourceHealthState(p.healthKey);
  if (h.until) {
    const kind = h.health === 'rate_limited' ? 'rate_limited' : h.health === 'unavailable' ? 'unavailable' : 'cooling';
    return { state: 'unavailable', kind, until: h.until, reason: kind === 'rate_limited' ? `rate limited until ${fmtClock(h.until)}` : `${kind === 'unavailable' ? 'unavailable' : 'cooling down'} until ${fmtClock(h.until)}` };
  }
  const rest = p.restingNow ? await p.restingNow() : null;
  if (rest) return { state: 'unavailable', kind: 'quota', until: rest.until, reason: rest.reason };
  const rt = runtimeOf(s, p.id);
  const soft = rt.softBackoffUntil ? new Date(rt.softBackoffUntil) : null;
  if (soft && soft.getTime() > now) return { state: 'unavailable', kind: 'degraded-backoff', until: soft, reason: `retrying after a short pause (${h.failures}/${h.threshold} failures)` };
  const ex = rt.exhaustedUntil ? new Date(rt.exhaustedUntil) : null;
  if (ex && ex.getTime() > now) return { state: 'exhausted', until: ex, reason: `nothing new for now — eligible again ${fmtClock(ex)}` };
  return { state: 'ok', until: null, reason: null };
}

/** For the screen: yield from what has been seen, kept apart from health. */
export function yieldState(s: RotationState, id: string, now = Date.now()): 'productive' | 'low' | 'exhausted' | null {
  const rt = s.providers[id];
  if (!rt) return null;
  if (rt.exhaustedUntil && new Date(rt.exhaustedUntil).getTime() > now) return 'exhausted';
  if (rt.zeroYield > 0) return 'low';
  return rt.lastBatch && rt.lastBatch.outcome === 'ok' && rt.lastBatch.useful > 0 ? 'productive' : null;
}

// ── The turn ────────────────────────────────────────────────────────────────

type AttemptEvent = {
  provider: ProviderDef; outcome: TurnOutcome | { kind: 'skipped' };
  durationMs: number; note: string[]; failureN?: number; coolingUntil?: Date | null;
};

export type TurnResult =
  | { ran: true; group: Group; provider: string; label: string; outcome: TurnRan; attempts: { provider: string; result: string }[]; switchedFrom: string[];
      /** For the "why this job" note: the provider's standing, and every one passed over before it with its reason. */
      why: string[]; virtual: boolean }
  | { ran: false; group: Group; waiting: boolean; failed: boolean; reason: string; retryAt: Date | null; attempts: { provider: string; result: string }[] };

const rotate = <T,>(a: T[], from: number) => a.map((_, i) => a[(from + i) % a.length]);

function checkedLine(o: TurnRan): string {
  const bits = [`${o.checked} checked`, `${o.added} added`];
  if (o.enriched) bits.push(`${o.enriched} enriched`);
  bits.push(`${o.held} held`);
  if (o.sentToReview) bits.push(`${o.sentToReview} sent to review`);
  if (o.skipped) bits.push(`${o.skipped} skipped`);
  if (o.recordFailures) bits.push(`${o.recordFailures} failed to write`);
  return bits.join(' · ');
}

export const PROVIDER_ERROR = 'Provider request failed';

async function runTypeTurn(group: Group, s: RotationState, base: Omit<TurnCtx, 'position' | 'savePosition' | 'batch'>): Promise<TurnResult> {
  const cfg = rotationConfig();
  const full = providersOf(group);
  // The targeted provider (Books only) is not part of the round robin: it goes first on its share of turns and last on the rest.
  const targeted = group === 'Books' ? full.find(p => p.id === 'targeted') ?? null : null;
  const chain = targeted ? full.filter(p => p !== targeted) : full;
  const attempts: { provider: string; result: string }[] = [];
  const events: AttemptEvent[] = [];
  if (!full.length) return { ran: false, group, waiting: true, failed: false, reason: 'no source is wired for this', retryAt: null, attempts };

  const start = chain.length ? (s.cursors[group] ?? 0) % chain.length : 0;
  let ordered = rotate(chain, start);
  if (targeted) {
    const first = targetedPolicy ? await targetedPolicy().catch(() => false) : false;
    ordered = first ? [targeted, ...ordered] : [...ordered, targeted];
  }
  const avail = new Map<string, Availability>();
  for (const p of ordered) avail.set(p.id, await availability(p, s));
  // How things stood before this turn touched anything: "waiting for source recovery" is about the sources, not about what this turn did to them.
  const before = new Map(avail);

  const tried = new Set<string>();
  const noWork = new Set<string>();              // tried this turn and gave nothing to build on
  const okNow = (id: string) => avail.get(id)?.state === 'ok' && !noWork.has(id);
  const fallbackEligible = (p: ProviderDef) => !p.fallbackFor || p.fallbackFor.every(id => !okNow(id));

  let ran: { provider: ProviderDef; outcome: TurnRan; durationMs: number } | null = null;
  let stoppedByFailure = false;

  while (!ran && !stoppedByFailure) {
    // Only a source that can be asked right now. One resting as exhausted is NOT asked again early: its rest is a time, it comes back by itself
    // at the end of it, and in the meantime the turn goes to the next content type instead of knocking on a door that has just said "nothing".
    const next = ordered.find(p => !tried.has(p.id) && avail.get(p.id)!.state === 'ok' && fallbackEligible(p));
    if (!next) break;
    tried.add(next.id);

    if (!tryLockProvider(next.lock, 'continuous')) { avail.set(next.id, { state: 'unavailable', kind: 'busy', until: null, reason: 'being worked on right now' }); noWork.add(next.id); continue; }
    const rt = runtimeOf(s, next.id);
    s.running = { group, provider: next.id, since: new Date().toISOString() };
    s.current[group] = next.id;
    await saveRotationState(s);
    const t0 = Date.now();
    let outcome: TurnOutcome;
    try {
      const batchSizeForGroup = group === 'Journals' ? (base.state?.journalsPerPass ?? 200) : group === 'Articles' ? (base.state?.articlesPerPass ?? base.state?.batchSize ?? 100) : group === 'Books' ? (base.state?.booksPerPass ?? 200) : cfg.batchSize;
      outcome = await next.turn({ ...base, batch: batchSizeForGroup, position: rt.position ?? null, savePosition: p => { rt.position = p; } });
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0, 300);
      // A request that threw (no answer, a bad body) is a failed request and is counted, once, like any other. Anything else that threw —
      // the database, a bug in our own code — is not the provider's fault: its health is left alone, so a fault of ours can never show as
      // "289 consecutive failures" on a source that was never even asked.
      const kind = classifyFailure(e);
      if (kind !== 'unknown') { await recordSourceFailure(next.healthKey, msg, kind).catch(() => {}); outcome = { kind: 'request-failed', error: msg }; }
      else outcome = { kind: 'request-failed', error: msg, internal: true };
    } finally { unlockProvider(next.lock, 'continuous'); s.running = null; }
    const durationMs = Date.now() - t0;

    switch (outcome.kind) {
      case 'busy':
        avail.set(next.id, { state: 'unavailable', kind: 'busy', until: null, reason: 'being worked on right now' }); noWork.add(next.id);
        attempts.push({ provider: next.id, result: 'busy' });
        break;

      case 'quota': {
        // A daily limit is an expected rest, never a failure: health is not touched.
        avail.set(next.id, { state: 'unavailable', kind: 'quota', until: outcome.until, reason: outcome.note || 'daily limit reached' }); noWork.add(next.id);
        attempts.push({ provider: next.id, result: 'quota' });
        break;
      }

      case 'request-failed': {
        if (outcome.internal) {
          // Our own fault. Step over this source for a few minutes so a broken turn cannot repeat every tick; its health row is untouched.
          runtimeOf(s, next.id).softBackoffUntil = new Date(Date.now() + 5 * 60_000).toISOString();
          avail.set(next.id, { state: 'unavailable', kind: 'degraded-backoff', until: new Date(Date.now() + 5 * 60_000), reason: 'an internal error stopped the last turn; trying again shortly' }); noWork.add(next.id);
          events.push({ provider: next, outcome, durationMs, note: ['Internal error (not the provider) — its failure count is unchanged'] });
          attempts.push({ provider: next.id, result: 'internal-error' });
          break;
        }
        const h = await sourceHealthState(next.healthKey);
        const resting = !!h.until;                                   // 429 sets this at once; the third failure opens the breaker
        const note: string[] = [];
        if (outcome.rateLimited || h.health === 'rate_limited') note.push(`Rate limited${h.until ? ` until ${fmtClock(h.until)}` : ''}`);
        else { note.push(`Failure ${Math.min(h.failures, h.threshold)}/${h.threshold}`); if (resting) note.push('Cooling down'); }
        if (!resting && h.failures > 0 && h.failures < h.threshold) {
          const secs = cfg.softBackoffSeconds[Math.min(cfg.softBackoffSeconds.length - 1, Math.max(0, h.failures - 1))];
          runtimeOf(s, next.id).softBackoffUntil = new Date(Date.now() + secs * 1000).toISOString();
          stoppedByFailure = true;                                   // failures 1 and 2: the same source tries again on its next turn
        } else {
          avail.set(next.id, { state: 'unavailable', kind: h.health === 'rate_limited' ? 'rate_limited' : 'cooling', until: h.until, reason: 'resting' });
          noWork.add(next.id);                                       // rate limited or the third failure: on to the next source now
        }
        events.push({ provider: next, outcome, durationMs, note, failureN: h.failures, coolingUntil: h.until });
        attempts.push({ provider: next.id, result: outcome.rateLimited ? 'rate_limited' : resting ? 'cooling' : `failed ${h.failures}/${h.threshold}` });
        break;
      }

      case 'nothing-due': {
        const z = noteZeroYield(s, next.id, cfg);
        noWork.add(next.id);
        events.push({ provider: next, outcome, durationMs, note: [outcome.note || 'Nothing due — up to date', z.text].filter(Boolean) as string[] });
        attempts.push({ provider: next.id, result: 'nothing-due' });
        break;
      }

      case 'ran': {
        ran = { provider: next, outcome, durationMs };
        break;
      }
    }
  }

  if (!ran) {
    // Nothing worked. Either the sources are down, or they are all caught up — and those are different things to say.
    // Waiting for source recovery = at the start of this turn not one source could be asked: each was down, rate limited, over its quota,
    // busy, switched off, or resting as exhausted. (A source that WAS asked and found nothing to do is not waiting — it is caught up.)
    // A coverage engine (targeted Books, journal coverage) is not a source: it is always "available" and says nothing about whether any source is.
    const sources = ordered.filter(p => !p.virtual);
    const waiting = sources.length > 0 && sources.every(p => before.get(p.id)!.state !== 'ok');
    const untils = sources.map(p => avail.get(p.id)!.until).filter(Boolean) as Date[];
    const retryAt = untils.length ? new Date(Math.min(...untils.map(d => d.getTime()))) : null;
    const reason = waiting
      ? sources.map(p => `${p.label}: ${avail.get(p.id)!.reason || 'unavailable'}`).join('; ')
      : 'every source is up to date for now';
    if (waiting) s.waiting[group] = { since: s.waiting[group]?.since || new Date().toISOString(), reason, retryAt: retryAt ? retryAt.toISOString() : null };
    else delete s.waiting[group];
    await writeEvents(group, events, null);
    await saveRotationState(s);
    return { ran: false, group, waiting, failed: stoppedByFailure, reason, retryAt, attempts };
  }

  // A source worked.
  delete s.waiting[group];
  const { provider, outcome, durationMs } = ran;
  const rt = runtimeOf(s, provider.id);
  rt.softBackoffUntil = null;
  const z = outcome.useful > 0 ? (rt.zeroYield = 0, rt.exhaustedUntil = null, rt.exhaustedAt = null, rt.refreshAfter = null, { text: null as string | null, exhausted: false }) : noteZeroYield(s, provider.id, cfg);
  const summary: BatchSummary = {
    at: new Date().toISOString(), outcome: 'ok', checked: outcome.checked, added: outcome.added, held: outcome.held, enriched: outcome.enriched,
    sentToReview: outcome.sentToReview, skipped: outcome.skipped, recordFailures: outcome.recordFailures, requestFailures: outcome.requestFailures ?? 0, useful: outcome.useful, note: outcome.note ?? null,
  };
  rt.lastBatch = summary;
  // What the source last GAVE, kept when later batches give nothing: "exhausted for now" is a state, not an erasure of what it did before.
  if (outcome.useful > 0) rt.lastProductiveBatch = summary;
  const idx = chain.findIndex(p => p.id === provider.id);
  if (idx >= 0) s.cursors[group] = (idx + 1) % chain.length;           // a targeted turn does not move the round robin
  s.current[group] = provider.id;

  const switchedFrom = events.map(e => e.provider.label);
  const rowNote = [checkedLine(outcome), outcome.note, z.text, switchedFrom.length ? `Took over from ${switchedFrom.join(', ')}` : null].filter(Boolean).join(' · ');
  await writeEvents(group, events, provider.label);
  await writeRan(group, provider, outcome, durationMs, rowNote);
  await applyLedger(group, outcome);
  await saveRotationState(s);
  attempts.push({ provider: provider.id, result: 'ran' });
  const why: string[] = [];
  const h = await sourceHealthState(provider.healthKey).catch(() => null);
  why.push(provider.virtual ? `${provider.label}: ${outcome.journal?.department ? `${outcome.journal.department} has the lowest coverage among eligible departments` : 'coverage work available'}`
    : `${provider.label}: ${provider.tier} source, ${h?.health === 'healthy' ? 'healthy' : h?.health || 'answering'}, eligible now${rt.lastProductiveBatch ? `, last productive batch added ${rt.lastProductiveBatch.added}` : ''}`);
  for (const p of ordered) {
    if (p === provider) break;
    const a = before.get(p.id);
    const e = events.find(x => x.provider === p);
    if (e) why.push(`${p.label} passed over: ${e.note.join(', ') || e.outcome.kind}`);
    else if (a && a.state !== 'ok') why.push(`${p.label} passed over: ${a.reason || a.state}`);
    else if (p.fallbackFor && !fallbackEligible(p)) why.push(`${p.label} passed over: fallback, only used when ${p.fallbackFor.join('/')} cannot work`);
  }
  return { ran: true, group, provider: provider.id, label: provider.label, outcome, attempts, switchedFrom: events.map(e => e.provider.id), why, virtual: !!provider.virtual };
}

/** Count a batch (or a pass) that gave nothing useful, and set the source aside once it has done so enough times in a row. */
function noteZeroYield(s: RotationState, id: string, cfg: ReturnType<typeof rotationConfig>): { text: string | null; exhausted: boolean } {
  const rt = runtimeOf(s, id);
  rt.zeroYield = (rt.zeroYield || 0) + 1;
  const n = rt.zeroYield;
  if (n >= cfg.zeroYieldBatches) {
    rt.exhaustedUntil = new Date(Date.now() + cfg.exhaustedHours * 3600_000).toISOString();
    rt.exhaustedAt = new Date().toISOString();
    rt.refreshAfter = rt.exhaustedUntil;
    // The next empty batch after the rest sets it aside again straight away; any useful one resets the count.
    rt.zeroYield = Math.max(0, cfg.zeroYieldBatches - 1);
    return { text: `Zero-yield batch ${cfg.zeroYieldBatches}/${cfg.zeroYieldBatches} · Exhausted for now`, exhausted: true };
  }
  return { text: `Zero-yield batch ${n}/${cfg.zeroYieldBatches}`, exhausted: false };
}

// ── The run log ─────────────────────────────────────────────────────────────

async function writeEvents(group: Group, events: AttemptEvent[], tookOverLabel: string | null) {
  for (const e of events) {
    const note = [...e.note, tookOverLabel ? `Switched to ${tookOverLabel}` : null].filter(Boolean).join(' · ');
    if (e.outcome.kind === 'request-failed') {
      await createRunWithStats({ phase: group, source: e.provider.label, error: `${PROVIDER_ERROR} — ${e.outcome.error}`.slice(0, 500), more: true, note: note.slice(0, 900), durationMs: e.durationMs }, null);
    } else if (e.outcome.kind === 'nothing-due') {
      await createRunWithStats({ phase: group, source: e.provider.label, more: false, note: note.slice(0, 900), durationMs: e.durationMs }, null);
    }
  }
}

async function writeRan(group: Group, p: ProviderDef, o: TurnRan, durationMs: number, note: string) {
  if (o.rows?.length) {
    for (const r of o.rows) await createRunWithStats({ phase: group, source: p.label, ...r, durationMs: r.durationMs ?? Math.round(durationMs / o.rows.length) }, null);
    return;
  }
  const row: Record<string, any> = {
    phase: group, source: p.label, more: o.more, note: note.slice(0, 900), error: o.error ?? null, durationMs,
    journalId: o.journal?.id ?? null, journalTitle: o.journal?.title ?? null, department: o.journal?.department ?? null,
  };
  if (o.departmentStats) Object.assign(row, runColumnsFromStats(o.departmentStats));
  else Object.assign(row, { added: o.added, skippedHeld: o.held, skippedFailed: o.recordFailures, skippedRejected: o.skipped, needsReview: o.sentToReview });
  // Enrichment is counted on its own: completing a record already held is never a "new record added".
  if (o.enriched) row.enriched = o.enriched;
  if (o.columns) Object.assign(row, o.columns);
  if (group === 'Books') row.checked = o.checked;     // a Book run must account for every candidate it examined (accounting.ts)
  await createRunWithStats(row, o.departmentStats ?? null);
}

async function applyLedger(group: Group, o: TurnRan) {
  const inc: Record<string, any> = {};
  for (const [k, v] of Object.entries(o.ledger || {})) if (v) inc[k] = { increment: v };
  await db.ingestionState.update({
    where: { id: 'singleton' },
    data: { ...inc, phase: group, lastRunAt: new Date(), lastError: null, lastSuccessAt: new Date(), consecutiveFailures: 0 },
  }).catch(() => {});
}

// ── The pass ────────────────────────────────────────────────────────────────

export type PassOptions = {
  only?: 'journals' | 'articles' | 'books'; wanted: string[]; narrowed: boolean; state: any;
  /** "Run extra pass now": look at once, whatever the engine is sleeping on. */
  force?: boolean;
  /** Counts the pass in the engine's own counter. Called only when the engine actually looked — a pass that slept through is not one. */
  countPass?: () => Promise<unknown>;
};

/** Changes whenever something that could make a sleeping engine's picture wrong changes: how it is set, which sources are switched on, a restart. */
const BOOT = Date.now();
function fingerprintOf(opts: PassOptions): string {
  const st = opts.state || {};
  const wired = registry.map(p => `${p.id}:${p.configured?.() === true ? 1 : 0}${p.rotationOff?.() ? 0 : 1}`).join(',');
  return JSON.stringify([opts.only ?? null, opts.wanted, opts.narrowed, st.journalsPerPass ?? null, st.articlesPerPass ?? null, st.booksPerPass ?? null, st.batchSize ?? null, st.bookMinYear ?? null, wired, BOOT]);
}

/**
 * When the first source that cannot be asked now can be asked again, worked out the way a turn decides (availability), asking nothing.
 *
 *   `next`   the soonest known time, and whose it is. Sources that never come back by themselves (not connected, switched off, left out of the
 *            rotation) and the targeted-coverage engine (not a source) are not candidates.
 *   `open`   something blocks a source with no end time — a Quick Import is on it, its books are waiting for review — or a source is available
 *            and simply had nothing: not a thing to sleep through; the engine looks again at the next tick.
 */
export function earliestRetry(list: ProviderDef[], avail: Map<string, Availability>): { next: NonNullable<IdleState['next']> | null; open: boolean } {
  let next: NonNullable<IdleState['next']> | null = null;
  let open = false;
  for (const p of list) {
    if (p.virtual) continue;
    const a = avail.get(p.id);
    if (!a) continue;
    if (a.state === 'ok') { open = true; continue; }
    if (a.kind === 'not-configured') continue;
    if (!a.until) { open = true; continue; }
    if (!next || a.until.getTime() < new Date(next.at).getTime()) next = { group: p.group, provider: p.id, label: p.label, at: a.until.toISOString(), reason: a.reason };
  }
  return { next, open };
}

const nextLine = (n: IdleState['next']) => (n ? `Next eligible source: ${n.group} · ${n.label} · Next attempt: ${fmtClock(new Date(n.at))}` : null);

async function availabilityMap(s: RotationState): Promise<Map<string, Availability>> {
  const m = new Map<string, Availability>();
  for (const p of registry) m.set(p.id, await availability(p, s));
  return m;
}

/** Forget that the engine was sleeping, so the next tick looks afresh. Called when an administrator changes how the engine is set or switches it on. */
export async function wakeEngine(): Promise<void> {
  const s = await loadRotationState();
  if (!s.idle) return;
  // Not forgotten, only made stale: the next tick looks afresh, and if the picture is the same as before it adds nothing to the run log.
  s.idle.fingerprint = 'woken';
  s.idle.nextAt = null;
  await saveRotationState(s);
}

/**
 * One tick. Takes the next content type in turn; if none of its sources can be asked it moves to the next type in the same
 * tick, so a dead family costs no time. Returns what ran, or why nothing did.
 *
 * When NOTHING can be asked at all, the engine does not keep announcing it. The first such tick works out when the soonest source comes back
 * and records it (one run-log row, one rotation-state record); the ticks after that, until then, do no work and write nothing — they
 * answer from that record. It wakes at the time the soonest source can be asked, when an administrator changes the settings or switches the
 * engine on, when a source is switched on, when the server restarts, or at once for "Run extra pass now".
 */
export async function runRotationPass(opts: PassOptions) {
  const s = await loadRotationState();
  const fp = fingerprintOf(opts);

  // Sleeping: nothing to do before `nextAt`, and nothing about the engine has changed since that was worked out.
  const idle = s.idle;
  if (!opts.force && idle && idle.nextAt && !idle.open && idle.fingerprint === fp && Date.now() < Date.parse(idle.nextAt)) {
    return { ran: false as const, phase: 'Idle', sleeping: true as const, note: idleNote(idle), waiting: [], idle: [], failed: [], nextAt: idle.nextAt, next: idle.next };
  }
  await opts.countPass?.();

  const cfg = rotationConfig();
  const seq = typeSequence(cfg.weights);
  const slot = s.typeCursor;
  const groups = opts.only ? GROUPS.filter(g => g.toLowerCase() === opts.only) : orderForTick(seq, slot, cfg.weights);
  const base = { state: opts.state, wanted: opts.wanted, narrowed: opts.narrowed };
  const waiting: { group: Group; reason: string }[] = [];
  const idleGroups: Group[] = [];
  const failed: Group[] = [];
  const passedTypes: string[] = [];
  // Each tick uses one slot of the weighted order, whichever type ends up working, so the priorities hold over time. (Equal weights keep the
  // original rule — the next tick starts after the type that last took a turn — set inside the loop below.)
  const equal = allEqual(cfg.weights);
  if (!opts.only && !equal) s.typeCursor = (slot + 1) % seq.length;

  for (const g of groups) {
    const r = await runTypeTurn(g, s, base);
    if (!opts.only && equal) s.typeCursor = (GROUPS.indexOf(g) + 1) % GROUPS.length;
    if ('provider' in r) {
      const lead = groups[0];
      const reasons = [
        opts.only ? `Mode: ${g} only` : g === lead ? `${g} has the turn (priority ${cfg.weights[g]} of ${cfg.weights.Books}/${cfg.weights.Journals}/${cfg.weights.Articles} Books/Journals/Articles)` : `${lead} had the turn but could not work; ${g} took it`,
        ...passedTypes,
        ...r.why,
        r.outcome.checked ? `Batch: ${r.outcome.checked} candidates checked` : null,
      ].filter(Boolean) as string[];
      s.lastDecision = { at: new Date().toISOString(), group: g, label: r.label, kind: r.virtual ? 'coverage' : 'source', reasons };
      s.idle = null; await saveRotationState(s);
      return { ...r, phase: g, source: r.label, ...r.outcome };
    }
    passedTypes.push(`${g} passed over: ${r.waiting ? `every source resting (${r.reason})` : r.failed ? 'a source did not answer and will be retried' : r.reason}`);
    if (r.failed) failed.push(g); else if (r.waiting) waiting.push({ group: g, reason: r.reason }); else idleGroups.push(g);
  }

  // No source of any type could work this tick. Before waiting, the local backlog: work on records already held, under the current rules.
  const local = localPicker ? await localPicker(localJobs, g => groups.includes(g)).catch(() => null) : null;
  if (local) {
    const { job, pending } = local;
    s.localRunning = { job: job.id, label: job.label, group: job.group, since: new Date().toISOString() };
    s.running = null;
    await saveRotationState(s);
    const t0 = Date.now();
    let o: Awaited<ReturnType<LocalJob['run']>> | null = null; let err: string | null = null;
    try { o = await job.run(cfg.localBatch); } catch (e: any) { err = String(e?.message || e).slice(0, 300); }
    s.localRunning = null;
    if (o) {
      await createRunWithStats({
        phase: job.group, source: job.label, more: pending > o.checked, durationMs: Date.now() - t0,
        added: 0, promoted: o.promoted, enriched: o.enriched, skippedHeld: o.duplicates, skippedRejected: o.refused, skippedFailed: o.failed,
        note: `Backlog · ${o.note}`.slice(0, 900),
      }, null);
      await db.ingestionState.update({ where: { id: 'singleton' }, data: { phase: job.group, lastRunAt: new Date(), lastError: null, lastSuccessAt: new Date(), consecutiveFailures: 0 } }).catch(() => {});
    } else {
      await createRunWithStats({ phase: 'Error', source: job.label, error: `Backlog job failed — ${err}`.slice(0, 500) }, null);
    }
    s.lastDecision = {
      at: new Date().toISOString(), group: job.group, label: job.label, kind: 'local',
      reasons: [`No external source of any content type could work this tick`, ...passedTypes, `${job.label}: ${pending} record${pending === 1 ? '' : 's'} to look at under the current rules`],
    };
    s.idle = null;
    await saveRotationState(s);
    return {
      ran: true as const, local: true as const, group: job.group, phase: job.group, provider: job.id, source: job.label, label: job.label,
      checked: o?.checked ?? 0, added: 0, promoted: o?.promoted ?? 0, enriched: o?.enriched ?? 0, held: o?.duplicates ?? 0, sentToReview: 0,
      note: o?.note ?? err, error: err, attempts: [], switchedFrom: [],
    };
  }

  // Nothing ran. Say so once, with when it will be worth looking again.
  const { next, open } = earliestRetry(registry, await availabilityMap(s));
  // Groups are listed in a fixed order: which type takes the turn first moves round at every tick, and the same picture must not read as a new one for that.
  const byGroup = (a: Group, b: Group) => GROUPS.indexOf(a) - GROUPS.indexOf(b);
  const cause: IdleState['cause'] = waiting.length || failed.length ? 'recovery' : 'caught-up';
  const note = [
    failed.length ? `A source did not answer for ${failed.join(', ')}; it will be tried again` : null,
    waiting.length ? `Waiting for source recovery: ${[...waiting].sort((a, b) => byGroup(a.group, b.group)).map(w => `${w.group} (${w.reason})`).join(' | ')}` : null,
    !failed.length && !waiting.length ? 'Every source is up to date for now' : null,
    nextLine(next),
  ].filter(Boolean).join(' · ');
  // What the picture IS, apart from the wording of the clock: the same sources resting for the same reasons until the same times is the same picture.
  const signature = JSON.stringify([cause, [...failed].sort(byGroup), waiting.map(w => w.group).sort(byGroup), next ? [next.provider, next.at] : null, open]);
  const changed = !s.idle || s.idle.signature !== signature;
  s.idle = { since: s.idle?.since ?? new Date().toISOString(), signature, nextAt: !open && next ? next.at : null, next, open, fingerprint: fp, cause, note: note.slice(0, 900) };
  if (changed) {
    // One row for each distinct picture, not one per tick.
    await createRunWithStats({ phase: 'Idle', note: note.slice(0, 900) }, null);
    await db.ingestionState.update({ where: { id: 'singleton' }, data: { phase: 'Idle', currentDepartment: null, currentJournal: null, lastRunAt: new Date(), lastError: null } }).catch(() => {});
    await saveRotationState(s);
  } else if (idle?.fingerprint !== fp || idle?.nextAt !== s.idle.nextAt) {
    await saveRotationState(s);       // same picture; remember only that the settings it was judged under, or its time, moved
  }
  return { ran: false as const, phase: 'Idle', sleeping: false as const, note, waiting, idle: idleGroups, failed, nextAt: s.idle.nextAt, next };
}

function idleNote(i: IdleState): string {
  if (i.note) return i.note;
  return [i.cause === 'recovery' ? 'Waiting for source recovery' : 'Every source is up to date for now', nextLine(i.next)].filter(Boolean).join(' · ');
}

// ── What the screen shows ───────────────────────────────────────────────────

export type ProviderStatus = {
  id: string; label: string; group: Group; role: string; tier: Tier;
  configured: true | string;
  health: {
    state: 'healthy' | 'degraded' | 'rate_limited' | 'cooling' | 'unavailable'; failures: number; threshold: number; until: string | null; lastError: string | null; lastOkAt: string | null;
    /** The category of the last failure and its plain-language form; only while the source is not healthy. */
    lastErrorKind: ErrorKind | null; reason: string | null;
    /** Failures since the last success (what the source is doing now) and every failure there has ever been (history); never mixed. */
    lifetimeFailures: number; probeDue: boolean;
  };
  /** Kept apart from health: a source can be perfectly healthy and give nothing new. */
  yield: 'productive' | 'low' | 'exhausted' | null;
  availability: { state: Availability['state']; kind: Availability['kind'] | null; until: string | null; reason: string | null };
  running: boolean;
  /** When a source was set aside as exhausted and when it is due to be tried again (null unless it is resting as exhausted). */
  exhaustedAt: string | null; refreshAfter: string | null;
  lastBatch: BatchSummary | null;
  /** The last batch that gave something useful — kept after later, empty ones. */
  lastProductiveBatch: BatchSummary | null;
};

export type RotationStatus = {
  batchSize: number; failuresBeforeFallback: number; zeroYieldBatches: number;
  groups: Record<Group, { current: string | null; next: string | null; waiting: boolean; waitingReason: string | null; retryAt: string | null; batchSize: number }>;
  providers: ProviderStatus[];
  running: { group: Group; provider: string; label: string; since: string } | null;
  /** Set while the engine has nothing it can ask and is sleeping until `idle.nextAt`; null whenever any source is working. */
  idle: IdleState | null;
  /** The source that can be asked again soonest, worked out now, whatever the engine is doing. */
  next: IdleState['next'];
  /** What is running now — a source, a coverage engine or a backlog job — and what would run next, in the weighted order. */
  currentJob: { group: Group; label: string; kind: 'source' | 'coverage' | 'local'; since: string } | null;
  nextJobs: { group: Group; label: string; kind: 'source' | 'coverage' | 'local' }[];
  weights: Record<Group, number>;
  lastDecision: Decision | null;
  /** The local backlog: records each job still has to look at under the current rules. */
  backlog: { id: string; label: string; group: Group; pending: number }[];
  updatedAt: string | null;
};

/** The next provider a turn of this type would take, worked out the way a turn does it but without running anything. */
function peekNext(chain: ProviderDef[], cursor: number, avail: Map<string, Availability>): ProviderDef | null {
  const ordered = rotate(chain, cursor % Math.max(1, chain.length));
  const okNow = (id: string) => avail.get(id)?.state === 'ok';
  const eligible = (p: ProviderDef) => !p.fallbackFor || p.fallbackFor.every(id => !okNow(id));
  return ordered.find(p => avail.get(p.id)?.state === 'ok' && eligible(p)) ?? ordered.find(p => avail.get(p.id)?.state === 'exhausted' && eligible(p)) ?? null;
}

export async function rotationStatus(opts: { state?: any } = {}): Promise<RotationStatus> {
  const s = await loadRotationState();
  const cfg = rotationConfig();
  const providers: ProviderStatus[] = [];
  const avail = new Map<string, Availability>();
  for (const p of registry) {
    const a = await availability(p, s);
    avail.set(p.id, a);
    const h = await sourceHealthState(p.healthKey);
    const cfgState = p.configured?.() ?? true;
    providers.push({
      id: p.id, label: p.label, group: p.group, role: p.role, tier: p.tier, configured: cfgState,
      health: {
        state: h.health, failures: h.failures, threshold: h.threshold, until: h.until ? h.until.toISOString() : null, lastError: h.lastError, lastOkAt: h.lastOkAt ? h.lastOkAt.toISOString() : null,
        lastErrorKind: h.lastErrorKind, reason: h.reason, lifetimeFailures: h.lifetimeFailures, probeDue: h.probeDue,
      },
      yield: yieldState(s, p.id),
      availability: { state: a.state, kind: a.kind ?? null, until: a.until ? a.until.toISOString() : null, reason: a.reason },
      running: s.running?.provider === p.id || !!providerHolder(p.lock),
      exhaustedAt: a.state === 'exhausted' ? (s.providers[p.id]?.exhaustedAt ?? null) : null,
      refreshAfter: a.state === 'exhausted' ? (s.providers[p.id]?.refreshAfter ?? s.providers[p.id]?.exhaustedUntil ?? null) : null,
      lastBatch: s.providers[p.id]?.lastBatch ?? null,
      lastProductiveBatch: s.providers[p.id]?.lastProductiveBatch ?? null,
    });
  }
  const groups = {} as RotationStatus['groups'];
  for (const g of GROUPS) {
    const chain = providersOf(g);
    const cur = s.current[g] ? chain.find(p => p.id === s.current[g]) : null;
    const next = peekNext(chain, s.cursors[g] ?? 0, avail);
    const w = s.waiting[g];
    const batchSizeForGroup = g === 'Journals' ? (opts?.state?.journalsPerPass ?? 200) : g === 'Articles' ? (opts?.state?.articlesPerPass ?? opts?.state?.batchSize ?? 100) : g === 'Books' ? (opts?.state?.booksPerPass ?? 200) : cfg.batchSize;
    groups[g] = { current: cur?.label ?? null, next: next?.label ?? null, waiting: !!w, waitingReason: w?.reason ?? null, retryAt: w?.retryAt ?? null, batchSize: batchSizeForGroup };
  }
  const run = s.running ? registry.find(p => p.id === s.running!.provider) : null;
  // Next jobs: walk the coming slots of the weighted order the way a tick would (first type with an eligible provider), without running anything.
  const seq = typeSequence(cfg.weights);
  const backlog = localJobs.length ? await Promise.all(localJobs.map(async j => ({ id: j.id, label: j.label, group: j.group, pending: await j.pending().catch(() => 0) }))) : [];
  const nextJobs: RotationStatus['nextJobs'] = [];
  const cursorsPeek: Partial<Record<Group, number>> = { ...s.cursors };
  for (let k = 0; k < seq.length * 2 && nextJobs.length < 3; k++) {
    let found: RotationStatus['nextJobs'][number] | null = null;
    for (const g of orderForTick(seq, s.typeCursor + k, cfg.weights)) {
      // A coverage engine reads this type's sources; it is a likely next job only while one of them can be asked.
      const sourceOk = providersOf(g).some(x => !x.virtual && avail.get(x.id)?.state === 'ok');
      const chain = providersOf(g).filter(x => !x.virtual || sourceOk);
      const pk = peekNext(chain, cursorsPeek[g] ?? 0, avail);
      if (pk && avail.get(pk.id)?.state === 'ok') {
        found = { group: g, label: pk.label, kind: pk.virtual ? 'coverage' : 'source' };
        cursorsPeek[g] = (chain.indexOf(pk) + 1) % Math.max(1, chain.length);
        break;
      }
    }
    if (!found) { const b = backlog.find(x => x.pending > 0); if (b) found = { group: b.group, label: `${b.label} (${b.pending} to look at)`, kind: 'local' }; }
    if (!found) break;
    const last = nextJobs[nextJobs.length - 1];
    if (!last || last.label !== found.label || last.group !== found.group) nextJobs.push(found);
    if (found.kind === 'local') break;
  }
  const currentJob: RotationStatus['currentJob'] = s.running && run
    ? { group: s.running.group, label: run.label, kind: run.virtual ? 'coverage' : 'source', since: s.running.since }
    : s.localRunning ? { group: s.localRunning.group, label: s.localRunning.label, kind: 'local', since: s.localRunning.since } : null;
  return {
    currentJob, nextJobs, weights: cfg.weights, lastDecision: s.lastDecision ?? null, backlog,
    batchSize: cfg.batchSize, failuresBeforeFallback: cfg.failuresBeforeFallback, zeroYieldBatches: cfg.zeroYieldBatches, groups, providers,
    running: s.running && run ? { group: s.running.group, provider: run.id, label: run.label, since: s.running.since } : null,
    idle: s.idle ?? null,
    next: earliestRetry(registry, avail).next,
    updatedAt: s.updatedAt,
  };
}
