import type { PrismaClient } from '@prisma/client';
import { aiConfig } from './aiAssistantConfig.js';
import { SecretsError, encryptionAvailable, open, seal, type Sealed } from './aiSecrets.js';
import { CATEGORY_MESSAGE, categorizeProviderError, isCategory, messageFor, type ErrorCategory } from './ai/errors.js';
import { GeminiProvider } from './ai/geminiProvider.js';
import { GrokProvider } from './ai/grokProvider.js';
import { healthOf, loadRuntime, recentRuntimeEvents, routingStats } from './ai/runtime.js';
import { PROVIDER_IDS, PROVIDER_LABEL, isProviderId, type AIProvider, type ProviderId } from './ai/types.js';

export { CATEGORY_MESSAGE, categorizeProviderError, messageFor, type ErrorCategory };
export type { ProviderId };

/**
 * Which AI providers, models and API keys the server uses, and how a Super Admin changes them.
 *
 * TWO providers: a PRIMARY and an optional FALLBACK (Gemini and Grok; either can hold either role). For each one, independently:
 *   1. the active Admin configuration (an encrypted key stored in AppSetting), then
 *   2. the server environment (GEMINI_API_KEY; GROK_API_KEY or XAI_API_KEY).
 * An environment key is never copied into the database. Removing an Admin key simply lets the environment key show through.
 *
 * What is stored is ciphertext only (aiSecrets.ts: AES-256-GCM, a stable master key from the environment). The normal state this file hands to
 * the admin screen is: provider, model, whether a credential exists, where it comes from, its last four characters, who changed it and when,
 * and the safe category of the last test/error. NEVER the key. The one way a key leaves is `revealProviderKey`, which a Super Admin asks for
 * by name, one provider at a time, and which writes an audit row each time. Turning the assistant on or off is a separate switch
 * (aiAssistantSwitch.ts) and nothing here touches it.
 */

// ── What may be chosen ──────────────────────────────────────────────────────

const csv = (v: string | undefined) => (v || '').split(',').map(s => s.trim()).filter(s => /^[A-Za-z0-9._:-]{2,80}$/.test(s));

export const PROVIDERS = {
  gemini: {
    label: PROVIDER_LABEL.gemini,
    models: ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'] as string[],
    envKeys: ['GEMINI_API_KEY'],
  },
  grok: {
    label: PROVIDER_LABEL.grok,
    // The models xAI lists for its Responses API. The first is the default: non-reasoning, because the public assistant is latency-sensitive
    // and a reasoning model spends output tokens on thinking. AI_GROK_MODELS (comma-separated) adds to the list without a deploy of code;
    // it can only ADD names to this allowlist, never replace the host or accept free text from a browser.
    models: ['grok-4.20-0309-non-reasoning', 'grok-4.3', 'grok-4.5', 'grok-4.20-0309-reasoning'] as string[],
    envKeys: ['GROK_API_KEY', 'XAI_API_KEY'],
  },
} as const;
export const isProvider = isProviderId;

const DEFAULT_ROLES = { primary: 'gemini' as ProviderId, fallback: 'grok' as ProviderId };
const otherOf = (p: ProviderId): ProviderId => (p === 'gemini' ? 'grok' : 'gemini');

/** The server-maintained allowlist, plus the model the environment already names so an existing setup stays selectable. */
export function modelsFor(provider: ProviderId): string[] {
  const list: string[] = [...PROVIDERS[provider].models];
  const extra = provider === 'grok' ? [...csv(process.env.AI_GROK_MODELS), ...csv(process.env.AI_GROK_MODEL)] : [];
  for (const m of [...extra, ...(provider === 'gemini' ? [aiConfig().model] : [])]) if (!list.includes(m)) list.unshift(m);
  return list;
}
/** The model used when an admin has not chosen one. Gemini follows AI_ASSISTANT_MODEL (read at call time, as it always has). */
export const defaultModel = (provider: ProviderId): string =>
  provider === 'gemini' ? aiConfig().model : (csv(process.env.AI_GROK_MODEL)[0] || PROVIDERS.grok.models[0]);

export const CONFIG_KEY = 'AI_PROVIDER_CONFIG';
export const STATUS_KEY = 'AI_PROVIDER_STATUS';
const CACHE_TTL_MS = 30_000;
/** Bound to the provider, unchanged since the first version: ciphertext written then still opens now. */
const aadFor = (provider: string) => `ai-provider-key:v1:${provider}`;

// ── Stored shape (v2), and reading the older single-provider shape ──────────

type StoredProvider = { model?: string | null; key?: Sealed | null; lastFour?: string | null; keyUpdatedAt?: string | null; keyUpdatedBy?: string | null };
type StoredConfig = {
  v: 2; primary: ProviderId; fallbackEnabled: boolean;
  providers: Partial<Record<ProviderId, StoredProvider>>;
  changedAt?: string | null; changedBy?: string | null;
};
type TestRecord = { ok: boolean; category: ErrorCategory | null; at: string; by: string | null; latencyMs?: number | null; model?: string | null; httpStatus?: number | null; endpoint?: string | null };
type StoredStatus = { tests?: Partial<Record<ProviderId, TestRecord>>; lastTest?: TestRecord | null; lastError?: { category: ErrorCategory; at: string } | null };

const blankConfig = (): StoredConfig => ({ v: 2, primary: DEFAULT_ROLES.primary, fallbackEnabled: true, providers: {} });

async function readStored(prisma: PrismaClient): Promise<{ stored: StoredConfig; exists: boolean; updatedAt: Date | null; updatedBy: string | null }> {
  const row = await prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
  const v: any = row?.value;
  if (!v || typeof v !== 'object') return { stored: blankConfig(), exists: false, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
  const out = blankConfig();
  if (v.v === 2) {
    if (isProviderId(v.primary)) out.primary = v.primary;
    out.fallbackEnabled = v.fallbackEnabled !== false;
    for (const id of PROVIDER_IDS) {
      const p = v.providers?.[id];
      if (p && typeof p === 'object') out.providers[id] = { model: typeof p.model === 'string' ? p.model : null, key: (p.key as Sealed | null) ?? null, lastFour: typeof p.lastFour === 'string' ? p.lastFour : null, keyUpdatedAt: p.keyUpdatedAt ?? null, keyUpdatedBy: p.keyUpdatedBy ?? null };
    }
    out.changedAt = v.changedAt ?? null; out.changedBy = v.changedBy ?? null;
  } else if (isProviderId(v.provider) && typeof v.model === 'string') {
    // The first version stored one provider at the top level. It is read as that provider's entry, and written back as v2 on the next change.
    out.providers[v.provider as ProviderId] = { model: v.model, key: (v.key as Sealed | null) ?? null, lastFour: null, keyUpdatedAt: v.keyUpdatedAt ?? null, keyUpdatedBy: v.keyUpdatedBy ?? null };
  }
  return { stored: out, exists: true, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
}
async function readStatus(prisma: PrismaClient): Promise<StoredStatus> {
  const row = await prisma.appSetting.findUnique({ where: { key: STATUS_KEY } });
  return ((row?.value as StoredStatus | null) ?? {}) || {};
}

const envKey = (provider: ProviderId): string | null => {
  for (const name of PROVIDERS[provider].envKeys) { const v = (process.env[name] || '').trim(); if (v) return v; }
  return null;
};
const lastFourOf = (k: string | null) => (k && k.length >= 8 ? k.slice(-4) : null);

// ── Resolving what to call ──────────────────────────────────────────────────

export type CredentialSource = 'admin' | 'environment' | 'none';

/** One provider as the server will use it right now. Holds the key in memory only; serialising it yields no secret. */
export class ResolvedProvider {
  constructor(
    public readonly id: ProviderId,
    /** The model an admin chose, or null to follow the default (for Gemini, AI_ASSISTANT_MODEL read at call time). */
    private readonly chosenModel: string | null,
    public readonly source: CredentialSource,
    private readonly apiKey: string | null,
    /** The Admin key exists but could not be opened (the master key changed): the environment key, if any, is used instead. */
    public readonly adminKeyUnreadable = false,
  ) {}
  get model(): string { return this.chosenModel ?? defaultModel(this.id); }
  get configured(): boolean { return !!this.apiKey; }
  get lastFour(): string | null { return lastFourOf(this.apiKey); }
  /** The effective key, in plain text. Called from one place only: `revealProviderKey`, which audits it. */
  revealEffectiveKey(): string | null { return this.apiKey; }
  /** The provider adapter, or null when no credential exists anywhere. Built once per resolved configuration. */
  private memo: AIProvider | null = null;
  provider(): AIProvider | null {
    if (!this.apiKey) return null;
    // Rebuilt if the model it follows has moved (AI_ASSISTANT_MODEL is read at call time), so a changed environment applies to the next question.
    if (!this.memo || this.memo.model !== this.model) this.memo = this.id === 'gemini' ? new GeminiProvider(this.model, this.apiKey) : new GrokProvider(this.model, this.apiKey);
    return this.memo;
  }
  toJSON() { return { provider: this.id, model: this.model, source: this.source }; }
  toString() { return `ResolvedProvider(${this.id}, ${this.model}, ${this.source})`; }
  [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

/** The Gemini view the content classifier has always used (`client()` is the SDK client). */
export class ActiveAI {
  constructor(private readonly r: ResolvedProvider) {}
  get provider(): ProviderId { return this.r.id; }
  get model(): string { return this.r.model; }
  get source(): CredentialSource { return this.r.source; }
  get adminKeyUnreadable(): boolean { return this.r.adminKeyUnreadable; }
  client() { const p = this.r.provider(); return p && p.id === 'gemini' ? (p as GeminiProvider).client() : null; }
  toJSON() { return this.r.toJSON(); }
  toString() { return this.r.toString(); }
  [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

export type Plan = {
  primary: ProviderId; fallback: ProviderId; fallbackEnabled: boolean;
  byId: Record<ProviderId, ResolvedProvider>;
};

let cache: { value: Plan; until: number } | null = null;
/** Called after every change, so the next request builds clients from the new settings. */
export const invalidateAIConfig = () => { cache = null; };

async function resolveOne(stored: StoredConfig, id: ProviderId): Promise<ResolvedProvider> {
  const sp = stored.providers[id];
  const model = sp?.model && modelsFor(id).includes(sp.model) ? sp.model : null;
  let unreadable = false;
  if (sp?.key) {
    try { return new ResolvedProvider(id, model, 'admin', open(sp.key, aadFor(id))); }
    catch (e) { if (!(e instanceof SecretsError)) throw e; unreadable = true; }
  }
  const fromEnv = envKey(id);
  return new ResolvedProvider(id, model, fromEnv ? 'environment' : 'none', fromEnv, unreadable);
}

async function planUncached(prisma: PrismaClient): Promise<Plan> {
  const { stored } = await readStored(prisma);
  const [gemini, grok] = await Promise.all([resolveOne(stored, 'gemini'), resolveOne(stored, 'grok')]);
  return { primary: stored.primary, fallback: otherOf(stored.primary), fallbackEnabled: stored.fallbackEnabled, byId: { gemini, grok } };
}

/**
 * The one place the server asks "which providers, which keys, which models?". Cached briefly; invalidated on every change. If the database
 * cannot be read, the environment credentials keep the assistant answering rather than failing on a settings read.
 */
export async function resolveProviders(prisma: PrismaClient, now = Date.now()): Promise<Plan> {
  if (cache && cache.until > now) return cache.value;
  try {
    const value = await planUncached(prisma);
    cache = { value, until: now + CACHE_TTL_MS };
    return value;
  } catch (e: any) {
    console.error('AI provider settings could not be read (using the server environment):', e?.name || 'error');
    const mk = (id: ProviderId) => { const k = envKey(id); return new ResolvedProvider(id, null, k ? 'environment' : 'none', k); };
    const value: Plan = { primary: 'gemini', fallback: 'grok', fallbackEnabled: true, byId: { gemini: mk('gemini'), grok: mk('grok') } };
    cache = { value, until: now + 5_000 };
    return value;
  }
}

/** The Gemini credential, for the content classifier. (The assistant itself uses `resolveProviders`.) */
export async function resolveActiveAIConfig(prisma: PrismaClient, now = Date.now()): Promise<ActiveAI> {
  return new ActiveAI((await resolveProviders(prisma, now)).byId.gemini);
}

// ── Testing a key ───────────────────────────────────────────────────────────

// Loose on purpose (this project compiles without strictNullChecks, which turns off narrowing on `ok`): `category` is set when `ok` is false.
export type TestResult = { ok: boolean; category?: ErrorCategory; latencyMs?: number; httpStatus?: number; endpoint?: string; providerCode?: string; providerMessage?: string };

/**
 * One minimal request to the provider: a fixed two-word prompt, the smallest output budget, no catalogue data, no history, no visitor
 * text. It is an admin operation: it touches no visitor allowance and writes no conversation, event or lead row, and it does not
 * touch the runtime health the real traffic is judged by.
 */
export async function testProviderKey(provider: ProviderId, model: string, apiKey: string): Promise<TestResult> {
  const ms = Number(process.env.AI_PROVIDER_TEST_TIMEOUT_MS) >= 200 ? Number(process.env.AI_PROVIDER_TEST_TIMEOUT_MS) : 10_000;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), ms);
  try {
    const adapter = provider === 'gemini' ? new GeminiProvider(model, apiKey) : new GrokProvider(model, apiKey);
    const r = await adapter.testConnection(deadline.signal);
    return r.ok ? { ok: true, latencyMs: r.latencyMs, endpoint: r.endpoint } : { ok: false, category: deadline.signal.aborted ? 'TIMEOUT' : r.category, latencyMs: r.latencyMs, httpStatus: r.httpStatus, endpoint: r.endpoint, providerCode: r.providerCode, providerMessage: r.providerMessage };
  } catch (e) {
    return { ok: false, category: categorizeProviderError(e, deadline.signal.aborted) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Admin operations ────────────────────────────────────────────────────────

type Admin = { id?: string | null; email?: string | null };
const who = (a: Admin) => a.email || a.id || null;
const audit = (prisma: PrismaClient, a: Admin, action: string, meta: Record<string, unknown>) =>
  prisma.adminAuditLog.create({ data: { adminId: a.id ?? null, adminEmail: a.email ?? null, action, meta: meta as any } });

async function writeStatus(prisma: PrismaClient, patch: Partial<StoredStatus>, by: string | null) {
  const cur = await readStatus(prisma);
  const value = { ...cur, ...patch } as any;
  await prisma.appSetting.upsert({ where: { key: STATUS_KEY }, create: { key: STATUS_KEY, value, updatedBy: by }, update: { value, updatedBy: by } });
}

const testOf = (status: StoredStatus, id: ProviderId): TestRecord | null => status.tests?.[id] ?? (id === 'gemini' ? status.lastTest ?? null : null);

/** What the admin screen may see for one provider. Nothing here is, or is derived from beyond its last four characters, the key. */
function describe(prisma: PrismaClient, id: ProviderId, role: 'primary' | 'fallback', r: ResolvedProvider, sp: StoredProvider | undefined, status: StoredStatus, now = Date.now()) {
  const t = testOf(status, id);
  const health = healthOf(id, r.configured, now);
  return {
    id, label: PROVIDERS[id].label, role,
    model: r.model, models: modelsFor(id),
    credentialConfigured: r.configured,
    credentialSource: r.source,
    adminKeyConfigured: !!sp?.key,
    /** The Admin key is stored but cannot be opened (the server's encryption key changed). */
    adminKeyUnreadable: r.adminKeyUnreadable,
    /** Only the last four characters, to recognise a key by; null when the key is too short to say anything about safely. */
    lastFour: r.lastFour,
    lastChangedAt: sp?.keyUpdatedAt ?? null, lastChangedBy: sp?.keyUpdatedBy ?? null,
    /** What the real visitor traffic says: separate from the connection test below, and never cleared by it. */
    health,
    lastTest: t ? { ...t, message: t.category ? messageFor(id, t.category) : null } : null,
    lastErrorMessage: health.lastError ? messageFor(id, health.lastError.category) : null,
  };
}

/** The whole provider picture for the admin screen. Never carries a key. */
export async function providersState(prisma: PrismaClient) {
  await loadRuntime(prisma);
  const [{ stored }, status, plan] = await Promise.all([readStored(prisma), readStatus(prisma), planUncached(prisma)]);
  const now = Date.now();
  const p = (id: ProviderId, role: 'primary' | 'fallback') => describe(prisma, id, role, plan.byId[id], stored.providers[id], status, now);
  return {
    fallbackEnabled: plan.fallbackEnabled,
    primaryProvider: plan.primary, fallbackProvider: plan.fallback,
    primary: p(plan.primary, 'primary'),
    fallback: p(plan.fallback, 'fallback'),
    /** Whether this server can encrypt a new key at all. A yes/no only. */
    canStoreKey: encryptionAvailable(),
    /** The state of the failover as a person would read it: who is answering if the primary cannot. */
    failover: {
      primaryUsable: plan.byId[plan.primary].configured,
      fallbackUsable: plan.fallbackEnabled && plan.byId[plan.fallback].configured,
    },
    routing: routingStats(now),
    events: recentRuntimeEvents(),
    changedAt: stored.changedAt ?? null, changedBy: stored.changedBy ?? null,
  };
}

export type Input = { provider?: unknown; model: unknown; apiKey?: unknown };
export type Failure = { ok: false; status: number; code: string; category?: ErrorCategory; message: string; httpStatus?: number; endpoint?: string; model?: string; providerCode?: string; providerMessage?: string };
/** Outcome of an admin operation: `ok`, or the failure to send. Fields beyond `ok` are present only when it is false. */
export type Outcome<T = {}> = { ok: boolean; status?: number; code?: string; category?: ErrorCategory; message?: string; httpStatus?: number; endpoint?: string; model?: string; providerCode?: string; providerMessage?: string } & Partial<T>;

/**
 * Checks the request shape for one provider. A blank key means "keep what is there": it is never read as "delete", "empty" or "null".
 * Returns the clean values or the 400 to send.
 */
export function validateInput(provider: ProviderId, input: Input): Outcome<{ model: string; apiKey: string | null }> {
  if (typeof input.model !== 'string' || !modelsFor(provider).includes(input.model)) return { ok: false, status: 400, code: 'BAD_MODEL', message: 'Choose one of the listed models.' };
  let apiKey: string | null = null;
  if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey !== '') {
    if (typeof input.apiKey !== 'string') return { ok: false, status: 400, code: 'BAD_KEY', message: 'The API key is not valid.' };
    const k = input.apiKey.trim();
    if (k !== '' && (k.length < 8 || k.length > 512 || /[\s\u0000-\u001f"'\\]/.test(k))) return { ok: false, status: 400, code: 'BAD_KEY', message: 'That does not look like an API key.' };
    // The xAI console shows each key's ID (a UUID) next to it, and the team ID is one too; neither is the secret, which starts with "xai-".
    if (provider === 'grok' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return { ok: false, status: 400, code: 'KEY_ID_NOT_SECRET', message: 'That is an xAI key ID or team ID, not the API key itself. Create a key in the xAI console (API Keys) and paste the secret, which starts with "xai-".' };
    apiKey = k === '' ? null : k;
  }
  return { ok: true, model: input.model, apiKey };
}

/** The key a test should use: the one just typed, else the credential currently in force. Held in memory for the one request. */
async function keyToTest(prisma: PrismaClient, provider: ProviderId, typed: string | null) {
  if (typed) return typed;
  const { stored } = await readStored(prisma);
  const sk = stored.providers[provider]?.key;
  if (sk) { try { return open(sk, aadFor(provider)); } catch { /* fall through to the environment */ } }
  return envKey(provider);
}

async function recordTest(prisma: PrismaClient, admin: Admin, provider: ProviderId, model: string, r: TestResult) {
  const at = new Date().toISOString();
  try {
    const cur = await readStatus(prisma);
    const rec: TestRecord = { ok: r.ok, category: r.ok ? null : r.category!, at, by: who(admin), latencyMs: r.latencyMs ?? null, model, httpStatus: r.httpStatus ?? null, endpoint: r.endpoint ?? null };
    await writeStatus(prisma, { tests: { ...(cur.tests || {}), [provider]: rec } }, who(admin));
    await audit(prisma, admin, 'AI_PROVIDER_CONNECTION_TESTED', { provider, model, result: r.ok ? 'SUCCESS' : r.category!, ...(r.httpStatus ? { httpStatus: r.httpStatus } : {}) });
  } catch (e: any) { console.error('AI provider test result could not be recorded:', e?.name || 'error'); }
}

/** "Test connection" for ONE provider: tries the key (a typed one, unsaved, is used in memory only), records the outcome, changes nothing else. */
export async function testProvider(prisma: PrismaClient, admin: Admin, provider: ProviderId, input: Input): Promise<Outcome<{ latencyMs: number; httpStatus: number; endpoint: string; model: string }>> {
  const v = validateInput(provider, input);
  if (!v.ok) return v as Failure;
  const key = await keyToTest(prisma, provider, v.apiKey);
  if (!key) return { ok: false, status: 400, code: 'NO_KEY', message: 'Enter an API key to test.' };
  const r = await testProviderKey(provider, v.model, key);
  await recordTest(prisma, admin, provider, v.model, r);
  return r.ok ? { ok: true, latencyMs: r.latencyMs, endpoint: r.endpoint, model: v.model } : { ok: false, status: 200, code: r.category, category: r.category, message: messageFor(provider, r.category!), latencyMs: r.latencyMs, httpStatus: r.httpStatus, endpoint: r.endpoint, model: v.model, providerCode: r.providerCode, providerMessage: r.providerMessage };
}

async function writeConfig(prisma: PrismaClient, value: StoredConfig, by: string | null, extraOps: any[] = []) {
  await prisma.$transaction([
    prisma.appSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value: value as any, updatedBy: by }, update: { value: value as any, updatedBy: by } }),
    ...extraOps,
  ]);
  invalidateAIConfig();
}

/**
 * "Save configuration" for ONE provider. The server tests first (it never trusts that the browser did), and only a passing test changes
 * anything: a failed one leaves the current key, model and cache exactly as they were. A BLANK key keeps the saved key. The new key is encrypted,
 * saved and audited in one transaction, and replaces only this provider's credential. Does not enable or disable the assistant.
 */
export async function activateProvider(prisma: PrismaClient, admin: Admin, provider: ProviderId, input: Input): Promise<Outcome<{ changed: { key: boolean; model: boolean } }>> {
  const v = validateInput(provider, input);
  if (!v.ok) return v as Failure;
  if (v.apiKey && !encryptionAvailable()) {
    return { ok: false, status: 503, code: 'ENCRYPTION_UNAVAILABLE', message: 'This server has no encryption key configured, so a key cannot be stored. Ask whoever manages the server to set AI_SECRET_ENCRYPTION_KEY.' };
  }
  const { stored } = await readStored(prisma);
  const before = (await planUncached(prisma)).byId[provider];
  const key = await keyToTest(prisma, provider, v.apiKey);
  if (!key) return { ok: false, status: 400, code: 'NO_KEY', message: 'Enter an API key to activate.' };

  const r = await testProviderKey(provider, v.model, key);
  await recordTest(prisma, admin, provider, v.model, r);
  if (!r.ok) return { ok: false, status: 422, code: r.category, category: r.category, message: `${messageFor(provider, r.category!)} Nothing was changed.`, httpStatus: r.httpStatus, endpoint: r.endpoint, model: v.model, providerCode: r.providerCode, providerMessage: r.providerMessage };

  const by = who(admin), now = new Date().toISOString();
  const keyChanged = !!v.apiKey, modelChanged = v.model !== before.model;
  if (!keyChanged && !modelChanged) return { ok: true, changed: { key: false, model: false } };

  const prev = stored.providers[provider];
  const next: StoredConfig = { ...stored, v: 2, changedAt: now, changedBy: by, providers: { ...stored.providers } };
  next.providers[provider] = {
    model: v.model,
    key: keyChanged ? seal(v.apiKey!, aadFor(provider)) : prev?.key ?? null,
    lastFour: keyChanged ? lastFourOf(v.apiKey) : prev?.lastFour ?? null,
    keyUpdatedAt: keyChanged ? now : prev?.keyUpdatedAt ?? null,
    keyUpdatedBy: keyChanged ? by : prev?.keyUpdatedBy ?? null,
  };
  const ops: any[] = [];
  if (keyChanged) ops.push(audit(prisma, admin, prev?.key ? 'AI_PROVIDER_KEY_REPLACED' : 'AI_PROVIDER_KEY_ADDED', { provider, model: v.model, result: 'SUCCESS' }));
  if (modelChanged) ops.push(audit(prisma, admin, 'AI_PROVIDER_MODEL_CHANGED', { provider, from: before.model, to: v.model, result: 'SUCCESS' }));
  await writeConfig(prisma, next, by, ops);
  return { ok: true, changed: { key: keyChanged, model: modelChanged } };
}

/** Removes ONE provider's Admin-stored key. Its environment credential, if any, takes over; the other provider and the environment are untouched. */
export async function removeProviderKey(prisma: PrismaClient, admin: Admin, provider: ProviderId): Promise<Outcome> {
  const { stored } = await readStored(prisma);
  const sp = stored.providers[provider];
  if (!sp?.key) return { ok: false, status: 404, code: 'NO_ADMIN_KEY', message: 'There is no Admin-configured key to remove.' };
  const by = who(admin), now = new Date().toISOString();
  const next: StoredConfig = { ...stored, v: 2, changedAt: now, changedBy: by, providers: { ...stored.providers, [provider]: { ...sp, key: null, lastFour: null, keyUpdatedAt: now, keyUpdatedBy: by } } };
  await writeConfig(prisma, next, by, [audit(prisma, admin, 'AI_PROVIDER_KEY_REMOVED', { provider, result: 'SUCCESS' })]);
  return { ok: true };
}

/**
 * The key this provider is using RIGHT NOW, in plain text, for a Super Admin who asked to see it. The ONLY place a key is returned for display.
 *
 * "Effective" means what the server would call the provider with: the Admin-saved key if there is one (decrypted here), otherwise the key from
 * the server environment. Either way it is the same explicit, audited action: Super Admin only (the route enforces it), one provider at a time,
 * every call recorded (who, which provider, from where — never the key), and the caller must send the answer with `Cache-Control: no-store`.
 * The normal state never carries it; this is the one way it leaves.
 */
export async function revealProviderKey(prisma: PrismaClient, admin: Admin, provider: ProviderId): Promise<Outcome<{ apiKey: string; source: CredentialSource }>> {
  const resolved = (await planUncached(prisma)).byId[provider];
  const key = resolved.revealEffectiveKey();
  if (!key) {
    const { stored } = await readStored(prisma);
    // An Admin key that exists but cannot be opened, with nothing in the environment to fall back to, is a different problem from "no key".
    if (stored.providers[provider]?.key) return { ok: false, status: 409, code: 'KEY_UNREADABLE', message: 'The saved key cannot be opened with this server’s encryption key. Enter the key again to replace it.' };
    return { ok: false, status: 404, code: 'NO_KEY', message: 'No API key is configured for this provider.' };
  }
  // Audited before the key leaves, so a reveal that cannot be recorded does not happen.
  await audit(prisma, admin, 'AI_PROVIDER_KEY_REVEALED', { provider, source: resolved.source });
  return { ok: true, apiKey: key, source: resolved.source };
}

/** Which provider is primary and whether the fallback is used. Not tested (it changes no credential) and never touches the assistant switch. */
export async function saveFailover(prisma: PrismaClient, admin: Admin, input: { primary?: unknown; fallbackEnabled?: unknown }): Promise<Outcome<{ changed: boolean }>> {
  if (input.primary !== undefined && !isProviderId(input.primary)) return { ok: false, status: 400, code: 'BAD_PROVIDER', message: 'Choose one of the listed providers.' };
  if (input.fallbackEnabled !== undefined && typeof input.fallbackEnabled !== 'boolean') return { ok: false, status: 400, code: 'BAD_VALUE', message: 'Automatic fallback must be on or off.' };
  const { stored } = await readStored(prisma);
  const primary = (input.primary as ProviderId | undefined) ?? stored.primary;
  const fallbackEnabled = (input.fallbackEnabled as boolean | undefined) ?? stored.fallbackEnabled;
  if (primary === stored.primary && fallbackEnabled === stored.fallbackEnabled) return { ok: true, changed: false };
  const by = who(admin), now = new Date().toISOString();
  const ops: any[] = [];
  if (primary !== stored.primary) ops.push(audit(prisma, admin, 'AI_PRIMARY_PROVIDER_CHANGED', { from: stored.primary, to: primary }));
  if (fallbackEnabled !== stored.fallbackEnabled) ops.push(audit(prisma, admin, fallbackEnabled ? 'AI_FALLBACK_ENABLED' : 'AI_FALLBACK_DISABLED', { primary }));
  await writeConfig(prisma, { ...stored, v: 2, primary, fallbackEnabled, changedAt: now, changedBy: by }, by, ops);
  return { ok: true, changed: true };
}

/** The recent AI configuration changes, newest first, for the admin screen. Actor, time, provider and action; never a key or ciphertext. */
export async function recentAiEvents(prisma: PrismaClient, limit = 20) {
  const rows = await prisma.adminAuditLog.findMany({ where: { action: { startsWith: 'AI_PROVIDER_' } }, orderBy: { at: 'desc' }, take: limit });
  const more = await prisma.adminAuditLog.findMany({ where: { action: { in: ['AI_PRIMARY_PROVIDER_CHANGED', 'AI_FALLBACK_ENABLED', 'AI_FALLBACK_DISABLED', 'AI_ASSISTANT_ENABLED', 'AI_ASSISTANT_DISABLED'] } }, orderBy: { at: 'desc' }, take: limit });
  return [...rows, ...more].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit).map(r => ({
    at: r.at.toISOString(), action: r.action, by: r.adminEmail ?? null,
    provider: typeof (r.meta as any)?.provider === 'string' ? (r.meta as any).provider : null,
    detail: (r.meta as any)?.result && typeof (r.meta as any).result === 'string' ? (r.meta as any).result : null,
  }));
}

// ── The first version's API, as it was (Gemini) ─────────────────────────────

/** What the single-provider admin screen read: the primary's slice in the old shape. Kept so older callers keep working. */
export async function providerState(prisma: PrismaClient) {
  const full = await providersState(prisma);
  const g = full.primaryProvider === 'gemini' ? full.primary : full.fallback;
  const status = await readStatus(prisma);
  return {
    providers: PROVIDER_IDS.map(id => ({ id, label: PROVIDERS[id].label, models: modelsFor(id) })),
    provider: 'gemini' as ProviderId, providerLabel: PROVIDERS.gemini.label, model: g.model,
    keyConfigured: g.credentialConfigured, adminKeyConfigured: g.adminKeyConfigured, credentialSource: g.credentialSource,
    adminKeyUnreadable: g.adminKeyUnreadable, canStoreKey: full.canStoreKey,
    updatedAt: g.lastChangedAt, updatedBy: g.lastChangedBy,
    lastTest: g.lastTest,
    lastError: g.health.lastError ? { ...g.health.lastError, message: CATEGORY_MESSAGE[g.health.lastError.category] }
      : status.lastError && isCategory(status.lastError.category) ? { ...status.lastError, message: CATEGORY_MESSAGE[status.lastError.category] } : null,
  };
}
const legacyProvider = (input: Input): ProviderId | null => (input.provider === undefined ? 'gemini' : isProviderId(input.provider) ? input.provider : null);
const BAD_PROVIDER: Failure = { ok: false, status: 400, code: 'BAD_PROVIDER', message: 'Choose one of the listed providers.' };
export const testConnection = async (prisma: PrismaClient, admin: Admin, input: Input): Promise<Outcome> => { const p = legacyProvider(input); return p ? testProvider(prisma, admin, p, input) : BAD_PROVIDER; };
export const activateConfig = async (prisma: PrismaClient, admin: Admin, input: Input): Promise<Outcome<{ changed: { key: boolean; model: boolean } }>> => { const p = legacyProvider(input); return p ? activateProvider(prisma, admin, p, input) : BAD_PROVIDER; };
export const removeAdminKey = (prisma: PrismaClient, admin: Admin): Promise<Outcome> => removeProviderKey(prisma, admin, 'gemini');
/** Kept for older callers; real failures are recorded by the runtime tracker (ai/runtime.ts) now. */
export async function noteProviderError(_prisma: PrismaClient, _category: unknown) { /* superseded by recordFailure() */ }
