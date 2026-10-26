import { rotationConfig } from './policy.js';
import { GROUPS, runtimeOf, type Group, type ProviderRuntime, type RotationState } from './rotationState.js';

/**
 * The adaptive part of the scheduler, with no I/O of its own: given what the rotation row already knows, how productive is each provider and
 * which content type should go first. rotation.ts supplies availability (health, cooldown, rate limit, exhausted, busy); this file never decides
 * that a provider CAN run, only how much it is worth running.
 *
 *   providerScore = health × yield × freshness × (1 − review-backlog penalty)        … and 0 when the provider cannot be asked at all.
 *
 * Health and yield stay separate facts everywhere else (availability() vs yieldState()); the score is the only place they are multiplied, and it
 * is an internal ordering, not a verdict: a provider with a low score is still asked, later, and every content type is guaranteed a turn within
 * INGESTION_STARVATION_TURNS (the starvation guard), so a quiet type is never starved by a busy one.
 */

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const emaRate = (prev: number | undefined, x: number, first: boolean) => Math.round((first ? x : (prev ?? 0) * 0.6 + x * 0.4) * 1000) / 1000;

export type TurnFacts = { checked: number; added: number; sentToReview: number; held: number; enriched: number; requestFailures: number; failedRequest?: boolean };

/**
 * Fold one finished turn into the provider's running rates. A turn that looked at nothing says nothing about yield and leaves the yield rates alone
 * (the same rule as a cursor with `checked` 0), but a failed request still counts against the error rate.
 */
export function noteTurnFacts(rt: ProviderRuntime, f: TurnFacts, now = Date.now()): void {
  const first = !rt.runs;
  rt.runs = (rt.runs ?? 0) + 1;
  rt.lastAskedAt = new Date(now).toISOString();
  rt.errorEma = emaRate(rt.errorEma, f.requestFailures > 0 || f.failedRequest ? 1 : 0, rt.errorEma === undefined);
  if (f.checked <= 0) return;
  const c = f.checked;
  const seen = rt.publishRateEma !== undefined;
  rt.publishRateEma = emaRate(rt.publishRateEma, f.added / c, !seen);
  rt.newRateEma = emaRate(rt.newRateEma, (f.added + f.sentToReview) / c, !seen);
  rt.enrichRateEma = emaRate(rt.enrichRateEma, f.enriched / c, !seen);
  rt.dupRateEma = emaRate(rt.dupRateEma, f.held / c, !seen);
  void first;
}

export type ScoreInputs = {
  /** Can it be asked right now? (health, cooldown, rate limit, exhausted, busy, quota, not connected) */
  available: boolean;
  reviewOnly?: boolean;
  /** 0..1: how full the review queue is (drafts waiting ÷ the limit at which review-only sources already rest). */
  backlogPressure?: number;
  /** Failures since the last success on the provider's health row (0 when healthy). */
  healthFailures?: number;
  now?: number;
};

export function providerScore(rt: ProviderRuntime | undefined, i: ScoreInputs): number {
  if (!i.available) return 0;
  const now = i.now ?? Date.now();
  const r = rt ?? { zeroYield: 0 };
  // Yield. A provider never asked is given the benefit of the doubt, so a new or recovered source is tried rather than ignored.
  const publish = r.publishRateEma ?? 0, review = Math.max(0, (r.newRateEma ?? 0) - publish), enrich = r.enrichRateEma ?? 0;
  const yieldW = !r.runs ? 0.6 : clamp(0.1 + 2 * publish + 0.6 * review + 0.4 * enrich, 0.05, 1.5);
  const health = clamp(1 - 0.6 * (r.errorEma ?? 0), 0.4, 1) * ((i.healthFailures ?? 0) > 0 ? 0.75 : 1);
  const idleMin = r.lastAskedAt ? (now - Date.parse(r.lastAskedAt)) / 60_000 : 30;
  const freshness = 1 + 0.25 * clamp(idleMin / 30, 0, 1);
  // Backpressure: when the review queue is full, sources that mostly feed it are ranked down; sources that publish are not touched.
  const reviewShare = review > 0 ? review / (publish + review) : i.reviewOnly ? 1 : 0;
  const penalty = clamp((i.backlogPressure ?? 0) * reviewShare * 0.8, 0, 0.8);
  return Math.round(health * yieldW * freshness * (1 - penalty) * 1000) / 1000;
}

/** The content types in the order a tick should offer them, best first. Types with nothing to run go last, in the fixed order. */
export function adaptiveGroupOrder(
  scores: Record<Group, number>, weights: Record<Group, number>, passedOver: Partial<Record<Group, number>>, starvationTurns: number,
): { order: Group[]; starved: Group | null } {
  const tie: Group[] = ['Books', 'Journals', 'Articles'];
  const runnable = tie.filter(g => (scores[g] ?? 0) > 0);
  const idle = tie.filter(g => !((scores[g] ?? 0) > 0));
  const maxW = Math.max(1, ...GROUPS.map(g => weights[g] ?? 0));
  // The configured weight is only a prior (half of the rank), so a type that is currently the most productive can lead even at weight 1.
  const rank = (g: Group) => (scores[g] ?? 0) * (0.5 + 0.5 * ((weights[g] ?? 0) / maxW));
  const starvedList = runnable.filter(g => (passedOver[g] ?? 0) >= starvationTurns).sort((a, b) => (passedOver[b] ?? 0) - (passedOver[a] ?? 0));
  const starved = starvedList[0] ?? null;
  const rest = runnable.filter(g => g !== starved).sort((a, b) => rank(b) - rank(a) || tie.indexOf(a) - tie.indexOf(b));
  return { order: [...(starved ? [starved] : []), ...rest, ...idle], starved };
}

export type Quality = 'highly_productive' | 'productive' | 'low_yield' | 'caught_up' | 'unavailable';

/**
 * The simplified standing shown on a provider's card. Derived from the running rates every time it is asked, so it moves as the provider does and is never a
 * permanent ranking: "highly productive" is at least a quarter of what it looks at being added (or 40 % new in all), "productive" at least a tenth new,
 * otherwise "low yield". A provider resting for any reason that is a problem is "unavailable"; one that has nothing new for now is "caught up". A provider
 * not yet asked has no standing (null), and one that is merely busy or not connected keeps its yield standing (neither says anything about yield).
 */
export function qualityOf(a: { state: 'ok' | 'exhausted' | 'unavailable'; kind?: string | null }, rt: ProviderRuntime | undefined): Quality | null {
  if (a.state === 'unavailable' && a.kind !== 'busy' && a.kind !== 'not-configured') return 'unavailable';
  if (a.state === 'exhausted') return 'caught_up';
  if (!rt?.runs) return null;
  const nw = rt.newRateEma ?? 0, pub = rt.publishRateEma ?? 0;
  if (pub >= 0.25 || nw >= 0.4) return 'highly_productive';
  if (nw >= 0.1 || (rt.addedEma ?? 0) >= 0.5) return 'productive';
  return 'low_yield';
}

/** After a turn: the served type's wait resets, every other type that had something to run waits one more turn. */
export function notePassedOver(s: RotationState, served: Group, scores: Record<Group, number>): void {
  const p = (s.passedOver ||= {});
  for (const g of GROUPS) p[g] = g === served ? 0 : (scores[g] ?? 0) > 0 ? (p[g] ?? 0) + 1 : (p[g] ?? 0);
}

// ── Reason codes ─────────────────────────────────────────────────────────────

export type ReasonKind =
  | 'SELECTED_PRODUCTIVE' | 'SELECTED_HIGH_YIELD' | 'SELECTED_FALLBACK' | 'SELECTED_ROUND_ROBIN'
  | 'SKIPPED_COOLDOWN' | 'SKIPPED_RATE_LIMITED' | 'SKIPPED_UNAVAILABLE' | 'SKIPPED_EXHAUSTED' | 'SKIPPED_QUOTA' | 'SKIPPED_BUSY'
  | 'SKIPPED_NOT_CONFIGURED' | 'SKIPPED_FALLBACK_NOT_NEEDED' | 'SKIPPED_MIN_GAP'
  | 'RECOVERED' | 'FALLBACK_ENDED';

/** `OPENALEX_SELECTED_PRODUCTIVE`, `DOAB_SKIPPED_COOLDOWN`, `EUROPE_PMC_SELECTED_HIGH_YIELD` … */
export const reasonCode = (providerId: string, kind: ReasonKind): string => {
  const names: Record<string, string> = { europepmc: 'EUROPE_PMC', crossrefjournals: 'CROSSREF_JOURNALS', openalexsources: 'OPENALEX_SOURCES', crossrefbooks: 'CROSSREF_BOOKS', otl: 'OTL' };
  return `${names[providerId] ?? providerId.toUpperCase()}_${kind}`;
};

/** The state a provider is in, as one reason kind; null for things that are not worth a durable record (busy, not connected, not needed, min gap). */
export function stateKindOf(a: { state: 'ok' | 'exhausted' | 'unavailable'; kind?: string | null }): ReasonKind | null {
  if (a.state === 'exhausted') return 'SKIPPED_EXHAUSTED';
  if (a.state === 'ok') return null;
  switch (a.kind) {
    case 'rate_limited': return 'SKIPPED_RATE_LIMITED';
    case 'cooling': case 'degraded-backoff': return 'SKIPPED_COOLDOWN';
    case 'unavailable': return 'SKIPPED_UNAVAILABLE';
    case 'quota': return 'SKIPPED_QUOTA';
    case 'busy': return 'SKIPPED_BUSY';
    case 'not-configured': return 'SKIPPED_NOT_CONFIGURED';
    default: return null;
  }
}

const DURABLE: ReasonKind[] = ['SKIPPED_COOLDOWN', 'SKIPPED_RATE_LIMITED', 'SKIPPED_UNAVAILABLE', 'SKIPPED_EXHAUSTED', 'SKIPPED_QUOTA', 'SELECTED_FALLBACK'];

/**
 * Which of this turn's observations are CHANGES worth a row in the audit log. A provider that starts resting, a fallback taking over, a rested provider
 * answering again, a fallback ending: each is written once, when it happens. A provider that stays rate limited for an hour, or is selected as
 * productive a thousand times, writes nothing further. `s.codes` remembers the last one written.
 */
export function transitionsToLog(s: RotationState, observed: { id: string; kind: ReasonKind | null; selected: boolean; reason?: string | null; until?: Date | null }[]) {
  const codes = (s.codes ||= {});
  const out: { id: string; code: string; reason: string | null; until: string | null }[] = [];
  for (const o of observed) {
    const prior = codes[o.id] as ReasonKind | undefined;
    let next: ReasonKind | undefined;
    if (o.kind && DURABLE.includes(o.kind)) next = o.kind;
    // Asked, or free to be asked (not resting, not busy-with-no-end): whatever it was resting for has ended.
    else if ((o.selected || o.kind === null || o.kind === 'SKIPPED_FALLBACK_NOT_NEEDED' || o.kind === 'SKIPPED_MIN_GAP') && prior) next = prior === 'SELECTED_FALLBACK' ? 'FALLBACK_ENDED' : 'RECOVERED';
    if (!next || next === prior) continue;
    if (next === 'RECOVERED' || next === 'FALLBACK_ENDED') delete codes[o.id]; else codes[o.id] = next;
    out.push({ id: o.id, code: reasonCode(o.id, next), reason: o.reason ?? null, until: o.until ? o.until.toISOString() : null });
  }
  return out;
}

/** Is the review queue backing up? 0 at an empty queue, 1 at `limit` drafts waiting. */
export const backlogPressure = (draftsWaiting: number, limit = 250) => clamp(limit > 0 ? draftsWaiting / limit : 0, 0, 1);

export { runtimeOf, rotationConfig };
