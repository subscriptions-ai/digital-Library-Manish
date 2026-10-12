import { ingestionDb as db } from './db.js';
import { rotationConfig } from './policy.js';
import { sourceHealthState, recordSourceFailure } from './sourceHealth.js';
import { providerHolder, tryLockProvider, unlockProvider } from './providerLocks.js';
import { createRunWithStats, runColumnsFromStats, type DeptStats } from './departmentStats.js';
import {
  GROUPS, loadRotationState, saveRotationState, runtimeOf, type Group, type RotationState, type BatchSummary,
} from './rotationState.js';

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
 * If no provider of a content type can be asked, that type WAITS FOR SOURCE RECOVERY and the turn goes to the next type in the
 * same tick — one dead source family never pauses Everything.
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
  | { kind: 'request-failed'; error: string; status?: number | null; rateLimited?: boolean }
  | { kind: 'quota'; until: Date; note?: string };

export type ProviderDef = {
  id: string; label: string; group: Group; role: string;
  tier: Tier;
  /** Used only when every one of these is unavailable, exhausted for now, or has just had nothing to give. */
  fallbackFor?: string[];
  healthKey: string; lock: string;
  /** True, or the reason this provider cannot run at all (not wired to a data source, switched off). */
  configured?: () => true | string;
  /** A rest that is not a failure, e.g. a daily quota. */
  restingNow?: () => Promise<null | { until: Date | null; reason: string }>;
  turn: (ctx: TurnCtx) => Promise<TurnOutcome>;
};

// ── The registry ────────────────────────────────────────────────────────────

let registry: ProviderDef[] = [];
export const setProviders = (list: ProviderDef[]) => { registry = list; };
export const getProviders = () => registry;
export const providersOf = (g: Group) => registry.filter(p => p.group === g);

// ── Availability ────────────────────────────────────────────────────────────

export type Availability = { state: 'ok' | 'exhausted' | 'unavailable'; kind?: 'not-configured' | 'busy' | 'rate_limited' | 'cooling' | 'unavailable' | 'degraded-backoff' | 'quota'; until: Date | null; reason: string | null };

const fmtClock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();

export async function availability(p: ProviderDef, s: RotationState, now = Date.now()): Promise<Availability> {
  const cfg = p.configured?.();
  if (cfg !== undefined && cfg !== true) return { state: 'unavailable', kind: 'not-configured', until: null, reason: cfg };
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
  if (ex && ex.getTime() > now) return { state: 'exhausted', until: ex, reason: 'nothing new for now' };
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
  | { ran: true; group: Group; provider: string; label: string; outcome: TurnRan; attempts: { provider: string; result: string }[]; switchedFrom: string[] }
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
  const chain = providersOf(group);
  const attempts: { provider: string; result: string }[] = [];
  const events: AttemptEvent[] = [];
  if (!chain.length) return { ran: false, group, waiting: true, failed: false, reason: 'no source is wired for this', retryAt: null, attempts };

  const start = (s.cursors[group] ?? 0) % chain.length;
  const ordered = rotate(chain, start);
  const avail = new Map<string, Availability>();
  for (const p of ordered) avail.set(p.id, await availability(p, s));

  const tried = new Set<string>();
  const noWork = new Set<string>();              // tried this turn and gave nothing to build on
  const okNow = (id: string) => avail.get(id)?.state === 'ok' && !noWork.has(id);
  const fallbackEligible = (p: ProviderDef) => !p.fallbackFor || p.fallbackFor.every(id => !okNow(id));

  let ran: { provider: ProviderDef; outcome: TurnRan; durationMs: number } | null = null;
  let stoppedByFailure = false;

  while (!ran && !stoppedByFailure) {
    let next = ordered.find(p => !tried.has(p.id) && avail.get(p.id)!.state === 'ok' && fallbackEligible(p));
    // Last resort: a healthy source that has been unproductive is still better than doing nothing.
    if (!next) next = ordered.find(p => !tried.has(p.id) && avail.get(p.id)!.state === 'exhausted' && fallbackEligible(p));
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
      outcome = await next.turn({ ...base, batch: cfg.batchSize, position: rt.position ?? null, savePosition: p => { rt.position = p; } });
    } catch (e: any) {
      // A provider that throws has failed to answer, whatever it threw. Counted once, like any other failed request.
      const msg = String(e?.message || e).slice(0, 300);
      await recordSourceFailure(next.healthKey, msg).catch(() => {});
      outcome = { kind: 'request-failed', error: msg };
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
    const down = ordered.filter(p => { const a = avail.get(p.id)!; return a.state === 'unavailable'; });
    const waiting = down.length === ordered.length;
    const untils = ordered.map(p => avail.get(p.id)!.until).filter(Boolean) as Date[];
    const retryAt = untils.length ? new Date(Math.min(...untils.map(d => d.getTime()))) : null;
    const reason = waiting
      ? ordered.map(p => `${p.label}: ${avail.get(p.id)!.reason || 'unavailable'}`).join('; ')
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
  const z = outcome.useful > 0 ? (rt.zeroYield = 0, rt.exhaustedUntil = null, { text: null as string | null, exhausted: false }) : noteZeroYield(s, provider.id, cfg);
  const summary: BatchSummary = {
    at: new Date().toISOString(), outcome: 'ok', checked: outcome.checked, added: outcome.added, held: outcome.held, enriched: outcome.enriched,
    sentToReview: outcome.sentToReview, skipped: outcome.skipped, recordFailures: outcome.recordFailures, requestFailures: 0, useful: outcome.useful, note: outcome.note ?? null,
  };
  rt.lastBatch = summary;
  const idx = chain.findIndex(p => p.id === provider.id);
  s.cursors[group] = (idx + 1) % chain.length;
  s.current[group] = provider.id;

  const switchedFrom = events.map(e => e.provider.label);
  const rowNote = [checkedLine(outcome), outcome.note, z.text, switchedFrom.length ? `Took over from ${switchedFrom.join(', ')}` : null].filter(Boolean).join(' · ');
  await writeEvents(group, events, provider.label);
  await writeRan(group, provider, outcome, durationMs, rowNote);
  await applyLedger(group, outcome);
  await saveRotationState(s);
  attempts.push({ provider: provider.id, result: 'ran' });
  return { ran: true, group, provider: provider.id, label: provider.label, outcome, attempts, switchedFrom: events.map(e => e.provider.id) };
}

/** Count a batch (or a pass) that gave nothing useful, and set the source aside once it has done so enough times in a row. */
function noteZeroYield(s: RotationState, id: string, cfg: ReturnType<typeof rotationConfig>): { text: string | null; exhausted: boolean } {
  const rt = runtimeOf(s, id);
  rt.zeroYield = (rt.zeroYield || 0) + 1;
  const n = rt.zeroYield;
  if (n >= cfg.zeroYieldBatches) {
    rt.exhaustedUntil = new Date(Date.now() + cfg.exhaustedHours * 3600_000).toISOString();
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
  if (o.columns) Object.assign(row, o.columns);
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

export type PassOptions = { only?: 'journals' | 'articles' | 'books'; wanted: string[]; narrowed: boolean; state: any };

/**
 * One tick. Takes the next content type in turn; if none of its sources can be asked it moves to the next type in the same
 * tick, so a dead family costs no time. Returns what ran, or why nothing did.
 */
export async function runRotationPass(opts: PassOptions) {
  const s = await loadRotationState();
  const groups = opts.only ? GROUPS.filter(g => g.toLowerCase() === opts.only) : GROUPS;
  const base = { state: opts.state, wanted: opts.wanted, narrowed: opts.narrowed };
  const waiting: { group: Group; reason: string }[] = [];
  const idle: Group[] = [];
  const failed: Group[] = [];
  const first = opts.only ? 0 : s.typeCursor % groups.length;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[(first + i) % groups.length];
    const r = await runTypeTurn(g, s, base);
    if (!opts.only) s.typeCursor = (GROUPS.indexOf(g) + 1) % GROUPS.length;
    if ('provider' in r) { await saveRotationState(s); return { ...r, phase: g, source: r.label, ...r.outcome }; }
    if (r.failed) failed.push(g); else if (r.waiting) waiting.push({ group: g, reason: r.reason }); else idle.push(g);
  }
  await saveRotationState(s);
  // A pass that decided to do nothing is still a pass, and leaves the same trace as any other.
  const note = [
    failed.length ? `A source did not answer for ${failed.join(', ')}; it will be tried again` : null,
    waiting.length ? `Waiting for source recovery: ${waiting.map(w => `${w.group} (${w.reason})`).join(' | ')}` : null,
    !failed.length && !waiting.length ? 'Every source is up to date for now' : null,
  ].filter(Boolean).join(' · ');
  await createRunWithStats({ phase: 'Idle', note: note.slice(0, 900) }, null);
  await db.ingestionState.update({ where: { id: 'singleton' }, data: { phase: 'Idle', currentDepartment: null, currentJournal: null, lastRunAt: new Date(), lastError: null } }).catch(() => {});
  return { ran: false as const, phase: 'Idle', note, waiting, idle, failed };
}

// ── What the screen shows ───────────────────────────────────────────────────

export type ProviderStatus = {
  id: string; label: string; group: Group; role: string; tier: Tier;
  configured: true | string;
  health: { state: 'healthy' | 'degraded' | 'rate_limited' | 'cooling' | 'unavailable'; failures: number; threshold: number; until: string | null; lastError: string | null; lastOkAt: string | null };
  /** Kept apart from health: a source can be perfectly healthy and give nothing new. */
  yield: 'productive' | 'low' | 'exhausted' | null;
  availability: { state: Availability['state']; kind: Availability['kind'] | null; until: string | null; reason: string | null };
  running: boolean;
  lastBatch: BatchSummary | null;
};

export type RotationStatus = {
  batchSize: number; failuresBeforeFallback: number; zeroYieldBatches: number;
  groups: Record<Group, { current: string | null; next: string | null; waiting: boolean; waitingReason: string | null; retryAt: string | null; batchSize: number }>;
  providers: ProviderStatus[];
  running: { group: Group; provider: string; label: string; since: string } | null;
  updatedAt: string | null;
};

/** The next provider a turn of this type would take, worked out the way a turn does it but without running anything. */
function peekNext(chain: ProviderDef[], cursor: number, avail: Map<string, Availability>): ProviderDef | null {
  const ordered = rotate(chain, cursor % Math.max(1, chain.length));
  const okNow = (id: string) => avail.get(id)?.state === 'ok';
  const eligible = (p: ProviderDef) => !p.fallbackFor || p.fallbackFor.every(id => !okNow(id));
  return ordered.find(p => avail.get(p.id)?.state === 'ok' && eligible(p)) ?? ordered.find(p => avail.get(p.id)?.state === 'exhausted' && eligible(p)) ?? null;
}

export async function rotationStatus(): Promise<RotationStatus> {
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
      health: { state: h.health, failures: h.failures, threshold: h.threshold, until: h.until ? h.until.toISOString() : null, lastError: h.lastError, lastOkAt: h.lastOkAt ? h.lastOkAt.toISOString() : null },
      yield: yieldState(s, p.id),
      availability: { state: a.state, kind: a.kind ?? null, until: a.until ? a.until.toISOString() : null, reason: a.reason },
      running: s.running?.provider === p.id || !!providerHolder(p.lock),
      lastBatch: s.providers[p.id]?.lastBatch ?? null,
    });
  }
  const groups = {} as RotationStatus['groups'];
  for (const g of GROUPS) {
    const chain = providersOf(g);
    const cur = s.current[g] ? chain.find(p => p.id === s.current[g]) : null;
    const next = peekNext(chain, s.cursors[g] ?? 0, avail);
    const w = s.waiting[g];
    groups[g] = { current: cur?.label ?? null, next: next?.label ?? null, waiting: !!w, waitingReason: w?.reason ?? null, retryAt: w?.retryAt ?? null, batchSize: cfg.batchSize };
  }
  const run = s.running ? registry.find(p => p.id === s.running!.provider) : null;
  return {
    batchSize: cfg.batchSize, failuresBeforeFallback: cfg.failuresBeforeFallback, zeroYieldBatches: cfg.zeroYieldBatches, groups, providers,
    running: s.running && run ? { group: s.running.group, provider: run.id, label: run.label, since: s.running.since } : null,
    updatedAt: s.updatedAt,
  };
}
