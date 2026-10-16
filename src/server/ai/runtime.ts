import type { PrismaClient } from '@prisma/client';
import { isCategory, isConfigFailure, isRateLimitFailure, type ErrorCategory } from './errors.js';
import { PROVIDER_IDS, type ProviderHealthState, type ProviderId } from './types.js';

/**
 * What the providers are actually doing for real visitors — kept apart from "Test connection".
 *
 * A connection test is one admin request with a fixed prompt. Runtime health is the record of real questions: how many were asked, how many
 * were answered, how many failed and why, how long they took, and whether the provider is currently being asked at all. The two can disagree
 * (a key that passes a two-word test and then times out on a real, tool-using question), and when they do the screen must show both. So
 * a passing test never clears a runtime failure, and a runtime failure never marks a test failed.
 *
 * Circuit breaker, per provider and independent of the other:
 *   closed      asked normally
 *   open        `failuresToOpen` failures in a row (a transient problem), or ONE failure that means the configuration is wrong (a rejected key,
 *               a missing model, no credit): not asked until the rest ends. Each failed return doubles the rest, up to a ceiling.
 *   half-open   the rest is over: ONE request is let through as the probe (a lease, so two requests cannot both probe). It answers → closed,
 *               failure counter back to zero; it fails → open again, longer.
 *
 * State is held in this process and written to AppSetting (AI_PROVIDER_RUNTIME) a few seconds after each change, so a restart or a redeploy
 * keeps the counters and a provider that was resting. It holds categories, counts and times only: no key, no text, no visitor data.
 * One server process is assumed, as for the rest of the assistant's rate limits.
 */
export const RUNTIME_KEY = 'AI_PROVIDER_RUNTIME';

const num = (k: string, d: number, min: number, max: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
export const breakerConfig = () => ({
  failuresToOpen: num('AI_CIRCUIT_FAILURES', 3, 1, 20),
  cooldownMs: num('AI_CIRCUIT_COOLDOWN_SECONDS', 120, 1, 3600) * 1000,
  configCooldownMs: num('AI_CIRCUIT_CONFIG_COOLDOWN_SECONDS', 600, 1, 3600) * 1000,
  maxCooldownMs: num('AI_CIRCUIT_MAX_COOLDOWN_SECONDS', 900, 1, 7200) * 1000,
  probeLeaseMs: 30_000,
});

type Bucket = { n: number; ok: number; err: number; ms: number; msN: number };
type PState = {
  consecutiveFailures: number; level: number;
  openUntil: number | null; probingUntil: number | null;
  lastSuccessAt: number | null; lastError: { category: ErrorCategory; at: number; status?: number } | null;
  /** The category that opened the circuit, so the screen can say "rate limited" or "unavailable" rather than a bare "cooling". */
  openedBy: ErrorCategory | null;
  hours: Record<string, Bucket>;
};
type Route = { requests: number; primaryOk: number; fallbackTried: number; fallbackOk: number; bothFailed: number };
export type RuntimeEvent = { at: number; type: 'circuit_opened' | 'circuit_closed' | 'fallback_used' | 'both_failed'; provider?: ProviderId; category?: ErrorCategory };
type Runtime = { providers: Record<ProviderId, PState>; routes: Record<string, Route>; events: RuntimeEvent[] };

const blankP = (): PState => ({ consecutiveFailures: 0, level: 0, openUntil: null, probingUntil: null, lastSuccessAt: null, lastError: null, openedBy: null, hours: {} });
const blank = (): Runtime => ({ providers: { gemini: blankP(), grok: blankP() }, routes: {}, events: [] });

let rt: Runtime = blank();
let loaded = false;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let db: PrismaClient | null = null;

const hourKey = (now: number) => new Date(now - (now % 3_600_000)).toISOString();
const prune = (now: number) => {
  const cutoff = now - 26 * 3_600_000;
  for (const p of PROVIDER_IDS) for (const k of Object.keys(rt.providers[p].hours)) if (Date.parse(k) < cutoff) delete rt.providers[p].hours[k];
  for (const k of Object.keys(rt.routes)) if (Date.parse(k) < cutoff) delete rt.routes[k];
  if (rt.events.length > 40) rt.events = rt.events.slice(-40);
};

/** Loads what was saved, once per process. A failed read starts from empty: the counters are advice, never a reason to refuse an answer. */
export async function loadRuntime(prisma: PrismaClient) {
  db = prisma;
  if (loaded) return;
  loaded = true;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: RUNTIME_KEY } });
    const v = row?.value as Partial<Runtime> | null;
    if (v && typeof v === 'object') {
      const base = blank();
      for (const p of PROVIDER_IDS) {
        const s = (v.providers as any)?.[p];
        if (s && typeof s === 'object') base.providers[p] = { ...blankP(), ...s, lastError: s.lastError && isCategory(s.lastError.category) ? s.lastError : null, hours: s.hours && typeof s.hours === 'object' ? s.hours : {} };
      }
      rt = { providers: base.providers, routes: v.routes && typeof v.routes === 'object' ? (v.routes as any) : {}, events: Array.isArray(v.events) ? v.events.slice(-40) : [] };
    }
  } catch { /* start empty */ }
}

async function writeNow() {
  timer = null;
  if (!db || !dirty) return;
  dirty = false;
  prune(Date.now());
  try { await db.appSetting.upsert({ where: { key: RUNTIME_KEY }, create: { key: RUNTIME_KEY, value: rt as any, updatedBy: null }, update: { value: rt as any, updatedBy: null } }); }
  catch { dirty = true; }
}
const persistSoon = () => { dirty = true; if (!timer) { timer = setTimeout(writeNow, 4000); timer.unref?.(); } };
/** Writes pending changes now (a test, or shutdown). */
export async function flushRuntime() { if (timer) { clearTimeout(timer); timer = null; } await writeNow(); }
/** Tests only: forget everything in this process and in the next load. */
export function __resetRuntimeForTests() { rt = blank(); loaded = false; dirty = false; if (timer) { clearTimeout(timer); timer = null; } }

const bucket = (p: ProviderId, now: number): Bucket => (rt.providers[p].hours[hourKey(now)] ??= { n: 0, ok: 0, err: 0, ms: 0, msN: 0 });
const route = (now: number): Route => (rt.routes[hourKey(now)] ??= { requests: 0, primaryOk: 0, fallbackTried: 0, fallbackOk: 0, bothFailed: 0 });
const note = (e: RuntimeEvent) => { rt.events.push(e); if (rt.events.length > 40) rt.events.shift(); };

// ── The breaker ─────────────────────────────────────────────────────────────

export type Gate = { allow: boolean; probe: boolean };
/** May this provider be asked now? Taking the probe lease is part of the answer, so only one caller ever probes. */
export function canAttempt(p: ProviderId, now = Date.now()): Gate {
  const s = rt.providers[p];
  if (s.openUntil === null) return { allow: true, probe: false };
  if (now < s.openUntil) return { allow: false, probe: false };
  if (s.probingUntil !== null && now < s.probingUntil) return { allow: false, probe: false };     // someone is testing it right now
  s.probingUntil = now + breakerConfig().probeLeaseMs;
  persistSoon();
  return { allow: true, probe: true };
}

export function recordSuccess(p: ProviderId, latencyMs: number, now = Date.now()) {
  const s = rt.providers[p];
  const wasOpen = s.openUntil !== null;
  s.consecutiveFailures = 0; s.level = 0; s.openUntil = null; s.probingUntil = null; s.openedBy = null; s.lastSuccessAt = now;
  const b = bucket(p, now); b.n++; b.ok++; b.ms += latencyMs; b.msN++;
  if (wasOpen) note({ at: now, type: 'circuit_closed', provider: p });
  persistSoon();
}

export function recordFailure(p: ProviderId, category: ErrorCategory, now = Date.now(), status?: number) {
  const s = rt.providers[p], cfg = breakerConfig();
  const wasProbe = s.openUntil !== null && now >= s.openUntil;
  s.consecutiveFailures++; s.lastError = { category, at: now, ...(Number.isInteger(status) ? { status } : {}) }; s.probingUntil = null;
  const b = bucket(p, now); b.n++; b.err++;
  const config = isConfigFailure(category);
  if (config || wasProbe || s.consecutiveFailures >= cfg.failuresToOpen) {
    const base = config ? cfg.configCooldownMs : cfg.cooldownMs;
    s.openUntil = now + Math.min(cfg.maxCooldownMs, base * 2 ** Math.min(s.level, 6));
    s.level++; s.openedBy = category;
    note({ at: now, type: 'circuit_opened', provider: p, category });
  }
  persistSoon();
}

/** A skipped provider (resting) is not a failure and is not counted as an attempt. */
export type Route_ = { primaryOk: boolean; fallbackTried: boolean; fallbackOk: boolean };
export function recordRoute(r: Route_, now = Date.now()) {
  const x = route(now);
  x.requests++;
  if (r.primaryOk) x.primaryOk++;
  if (r.fallbackTried) x.fallbackTried++;
  if (r.fallbackOk) x.fallbackOk++;
  if (!r.primaryOk && !r.fallbackOk) x.bothFailed++;
  if (r.fallbackOk) note({ at: now, type: 'fallback_used' });
  else if (!r.primaryOk) note({ at: now, type: 'both_failed' });
  persistSoon();
}

// ── What the screen reads ───────────────────────────────────────────────────

export type RuntimeHealth = {
  state: ProviderHealthState;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastSuccessAt: string | null;
  lastError: { category: ErrorCategory; at: string; status?: number } | null;
  last24h: { requests: number; answered: number; errors: number; avgLatencyMs: number | null };
};

export function healthOf(p: ProviderId, configured: boolean, now = Date.now()): RuntimeHealth {
  const s = rt.providers[p];
  const since = now - 24 * 3_600_000;
  let n = 0, ok = 0, err = 0, ms = 0, msN = 0;
  for (const [k, b] of Object.entries(s.hours)) if (Date.parse(k) + 3_600_000 > since) { n += b.n; ok += b.ok; err += b.err; ms += b.ms; msN += b.msN; }
  const open = s.openUntil !== null && now < s.openUntil;
  const halfOpen = s.openUntil !== null && now >= s.openUntil;
  let state: ProviderHealthState;
  if (!configured) state = 'not_configured';
  else if (open) state = s.openedBy && isConfigFailure(s.openedBy) && !isRateLimitFailure(s.openedBy) ? 'unavailable' : s.openedBy && isRateLimitFailure(s.openedBy) ? 'rate_limited' : 'cooling_down';
  else if (halfOpen || s.consecutiveFailures > 0) state = 'degraded';
  else state = 'healthy';
  return {
    state, consecutiveFailures: s.consecutiveFailures,
    cooldownUntil: open ? new Date(s.openUntil!).toISOString() : null,
    lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : null,
    lastError: s.lastError ? { category: s.lastError.category, at: new Date(s.lastError.at).toISOString(), ...(s.lastError.status ? { status: s.lastError.status } : {}) } : null,
    last24h: { requests: n, answered: ok, errors: err, avgLatencyMs: msN ? Math.round(ms / msN) : null },
  };
}

export function routingStats(now = Date.now()) {
  const since = now - 24 * 3_600_000;
  const t = { requests: 0, primaryAnswered: 0, fallbackActivated: 0, fallbackAnswered: 0, bothFailed: 0 };
  for (const [k, r] of Object.entries(rt.routes)) if (Date.parse(k) + 3_600_000 > since) {
    t.requests += r.requests; t.primaryAnswered += r.primaryOk; t.fallbackActivated += r.fallbackTried; t.fallbackAnswered += r.fallbackOk; t.bothFailed += r.bothFailed;
  }
  return { ...t, fallbackSuccessRate: t.fallbackActivated ? Math.round((t.fallbackAnswered / t.fallbackActivated) * 100) : null };
}

export const recentRuntimeEvents = (limit = 15) => rt.events.slice(-limit).reverse().map(e => ({ ...e, at: new Date(e.at).toISOString() }));
