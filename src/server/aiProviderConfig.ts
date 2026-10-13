import { GoogleGenAI } from '@google/genai';
import type { PrismaClient } from '@prisma/client';
import { aiConfig } from './aiAssistantConfig.js';
import { SecretsError, encryptionAvailable, open, seal, type Sealed } from './aiSecrets.js';

/**
 * Which AI provider, model and API key the server uses, and how an admin changes them.
 *
 * Precedence, always resolved on the server and never sent to a browser:
 *   1. the active Admin configuration (an encrypted key stored in AppSetting), then
 *   2. the server environment (GEMINI_API_KEY).
 * The environment key is never copied into the database. Removing the Admin key simply lets the environment key show through.
 *
 * What is stored is ciphertext only (see aiSecrets.ts). What the admin screen is told is: provider, model, whether a credential
 * exists, where it comes from, who changed it and when, and the category of the last test/error. Never the key, a fragment of it,
 * its ciphertext, IV or tag. Enabling or disabling the assistant is a separate switch (aiAssistantSwitch.ts) and is never touched here.
 */

// ── What may be chosen ──────────────────────────────────────────────────────

/** Providers the code can actually call. A provider is listed here only once it is implemented end to end. */
export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    models: ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    envKey: 'GEMINI_API_KEY',
  },
} as const;
export type ProviderId = keyof typeof PROVIDERS;
export const isProvider = (v: unknown): v is ProviderId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, v);

/** The server-maintained allowlist, plus the model the environment already names so an existing setup stays selectable. */
export function modelsFor(provider: ProviderId): string[] {
  const list: string[] = [...PROVIDERS[provider].models];
  const env = aiConfig().model;
  return list.includes(env) ? list : [env, ...list];
}

export const CONFIG_KEY = 'AI_PROVIDER_CONFIG';
export const STATUS_KEY = 'AI_PROVIDER_STATUS';
const CACHE_TTL_MS = 30_000;
const aadFor = (provider: string) => `ai-provider-key:v1:${provider}`;

// ── Safe error categories ───────────────────────────────────────────────────

export type ErrorCategory =
  | 'AUTHENTICATION_FAILED' | 'PERMISSION_DENIED' | 'QUOTA_EXCEEDED' | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND' | 'TIMEOUT' | 'PROVIDER_UNAVAILABLE' | 'UNKNOWN_PROVIDER_ERROR';

export const CATEGORY_MESSAGE: Record<ErrorCategory, string> = {
  AUTHENTICATION_FAILED: 'The provider rejected this API key.',
  PERMISSION_DENIED: 'This key is not allowed to use that model or service.',
  QUOTA_EXCEEDED: 'The provider says the quota or billing limit for this key has been reached.',
  RATE_LIMITED: 'The provider is limiting requests right now. Try again shortly.',
  MODEL_NOT_FOUND: 'The provider does not offer that model to this key.',
  TIMEOUT: 'The provider did not answer in time.',
  PROVIDER_UNAVAILABLE: 'The provider could not be reached or is having problems.',
  UNKNOWN_PROVIDER_ERROR: 'The provider returned an unexpected error.',
};
const isCategory = (v: unknown): v is ErrorCategory => typeof v === 'string' && v in CATEGORY_MESSAGE;

/**
 * Sorts a provider failure into one of the categories above. The raw error is read here and thrown away: only the category leaves,
 * so a provider's response body, a stack trace or anything echoing a credential can never reach a screen or a log through this.
 */
export function categorizeProviderError(err: any, timedOut = false): ErrorCategory {
  if (timedOut) return 'TIMEOUT';
  const text = `${err?.message ?? ''} ${err?.cause?.code ?? ''} ${err?.code ?? ''}`;
  const embedded = /"code"\s*:\s*(\d{3})/.exec(text)?.[1];
  const status = Number(err?.status ?? err?.error?.code ?? embedded) || (typeof err?.code === 'number' ? err.code : 0);
  if (err?.name === 'AbortError' || /aborted|timed? ?out|ETIMEDOUT/i.test(text) && !status) return 'TIMEOUT';
  if (status === 401 || /API_KEY_INVALID|api key not valid|invalid api key|UNAUTHENTICATED|incorrect api key/i.test(text)) return 'AUTHENTICATION_FAILED';
  if (status === 403 || /PERMISSION_DENIED/i.test(text)) return 'PERMISSION_DENIED';
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(text)) return /quota|billing|exceeded your current/i.test(text) ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED';
  if (status === 404 || /model.*(not found|not supported)|NOT_FOUND/i.test(text)) return 'MODEL_NOT_FOUND';
  if (status >= 500 || status === 408 || /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|socket hang up|UNAVAILABLE/i.test(text)) return 'PROVIDER_UNAVAILABLE';
  return 'UNKNOWN_PROVIDER_ERROR';
}

// ── Stored shape ────────────────────────────────────────────────────────────

type StoredConfig = {
  provider: ProviderId; model: string;
  key?: Sealed | null;
  /** When the key (not the model) last changed, and by whom. */
  keyUpdatedAt?: string | null; keyUpdatedBy?: string | null;
};
type StoredStatus = {
  lastTest?: { ok: boolean; category: ErrorCategory | null; at: string; by: string | null } | null;
  lastError?: { category: ErrorCategory; at: string } | null;
};

async function readStored(prisma: PrismaClient) {
  const row = await prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
  const v = row?.value as Partial<StoredConfig> | null | undefined;
  const stored: StoredConfig | null = v && isProvider(v.provider) && typeof v.model === 'string'
    ? { provider: v.provider, model: v.model, key: (v.key as Sealed | null) ?? null, keyUpdatedAt: v.keyUpdatedAt ?? null, keyUpdatedBy: v.keyUpdatedBy ?? null }
    : null;
  return { stored, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
}
async function readStatus(prisma: PrismaClient): Promise<StoredStatus> {
  const row = await prisma.appSetting.findUnique({ where: { key: STATUS_KEY } });
  return ((row?.value as StoredStatus | null) ?? {}) || {};
}

const envKey = (provider: ProviderId) => (process.env[PROVIDERS[provider].envKey] || '').trim() || null;

// ── Resolving what to call ──────────────────────────────────────────────────

export type CredentialSource = 'admin' | 'environment' | 'none';

/** What a server-side AI call uses. Holds the key in memory only; serialising it yields no secret. */
export class ActiveAI {
  constructor(
    public readonly provider: ProviderId,
    /** The model an admin chose, or null to follow AI_ASSISTANT_MODEL from the environment (read at call time, as it always was). */
    private readonly chosenModel: string | null,
    public readonly source: CredentialSource,
    private readonly apiKey: string | null,
    /** The Admin key exists but could not be opened (the master key changed): the environment key, if any, is used instead. */
    public readonly adminKeyUnreadable = false,
  ) {}
  get model(): string { return this.chosenModel ?? aiConfig().model; }
  private memo: GoogleGenAI | null = null;
  /** The provider client, or null when no credential exists anywhere. Built once per resolved configuration. */
  client(): GoogleGenAI | null {
    if (!this.apiKey) return null;
    return (this.memo ??= new GoogleGenAI({ apiKey: this.apiKey }));
  }
  toJSON() { return { provider: this.provider, model: this.model, source: this.source }; }
  toString() { return `ActiveAI(${this.provider}, ${this.model}, ${this.source})`; }
  [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

let cache: { value: ActiveAI; until: number } | null = null;
/** Called after every change, so the next request builds a client from the new settings. Other processes catch up within the TTL. */
export const invalidateAIConfig = () => { cache = null; };

async function resolveUncached(prisma: PrismaClient): Promise<ActiveAI> {
  const { stored } = await readStored(prisma);
  const provider: ProviderId = stored?.provider ?? 'gemini';
  const model = stored && modelsFor(provider).includes(stored.model) ? stored.model : null;
  let unreadable = false;
  if (stored?.key) {
    try { return new ActiveAI(provider, model, 'admin', open(stored.key, aadFor(provider))); }
    catch (e) { if (!(e instanceof SecretsError)) throw e; unreadable = true; }
  }
  const fromEnv = envKey(provider);
  return new ActiveAI(provider, model, fromEnv ? 'environment' : 'none', fromEnv, unreadable);
}

/**
 * The one place the server asks "which key, which model?". Cached briefly; invalidated on every change. If the database cannot be
 * read, the environment credential keeps the assistant answering rather than failing on a settings read.
 */
export async function resolveActiveAIConfig(prisma: PrismaClient, now = Date.now()): Promise<ActiveAI> {
  if (cache && cache.until > now) return cache.value;
  try {
    const value = await resolveUncached(prisma);
    cache = { value, until: now + CACHE_TTL_MS };
    return value;
  } catch (e: any) {
    console.error('AI provider settings could not be read (using the server environment):', e?.name || 'error');
    const fromEnv = envKey('gemini');
    const value = new ActiveAI('gemini', null, fromEnv ? 'environment' : 'none', fromEnv);
    cache = { value, until: now + 5_000 };
    return value;
  }
}

// ── Testing a key ───────────────────────────────────────────────────────────

// Loose on purpose (this project compiles without strictNullChecks, which turns off narrowing on `ok`): `category` is set when `ok` is false.
export type TestResult = { ok: boolean; category?: ErrorCategory };

/**
 * One minimal request to the provider: a fixed two-word prompt, the smallest output budget, no catalogue data, no history, no visitor
 * text. It is an admin operation: it touches no visitor allowance and writes no conversation, event or lead row.
 */
export async function testProviderKey(provider: ProviderId, model: string, apiKey: string): Promise<TestResult> {
  const ms = Number(process.env.AI_PROVIDER_TEST_TIMEOUT_MS) >= 200 ? Number(process.env.AI_PROVIDER_TEST_TIMEOUT_MS) : 10_000;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), ms);
  try {
    if (provider !== 'gemini') return { ok: false, category: 'UNKNOWN_PROVIDER_ERROR' };
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model, contents: 'Reply OK.',
      config: { maxOutputTokens: 16, temperature: 0, abortSignal: deadline.signal },
    });
    return { ok: true };
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

/** What the admin screen may see. Nothing here is, or is derived from, the key. */
export async function providerState(prisma: PrismaClient) {
  const [{ stored, updatedAt, updatedBy }, status] = await Promise.all([readStored(prisma), readStatus(prisma)]);
  const active = await resolveUncached(prisma);
  const provider = active.provider;
  return {
    providers: (Object.keys(PROVIDERS) as ProviderId[]).map(id => ({ id, label: PROVIDERS[id].label, models: modelsFor(id) })),
    provider, providerLabel: PROVIDERS[provider].label, model: active.model,
    keyConfigured: active.source !== 'none',
    adminKeyConfigured: !!stored?.key,
    credentialSource: active.source,
    /** The Admin key is stored but cannot be opened (the server's encryption key changed). */
    adminKeyUnreadable: active.adminKeyUnreadable,
    /** Whether this server can encrypt a new key at all. A yes/no only. */
    canStoreKey: encryptionAvailable(),
    updatedAt: stored?.keyUpdatedAt ?? updatedAt?.toISOString() ?? null,
    updatedBy: stored?.keyUpdatedBy ?? updatedBy ?? null,
    lastTest: status.lastTest ? { ...status.lastTest, message: status.lastTest.category ? CATEGORY_MESSAGE[status.lastTest.category] : null } : null,
    lastError: status.lastError && isCategory(status.lastError.category)
      ? { ...status.lastError, message: CATEGORY_MESSAGE[status.lastError.category] } : null,
  };
}

async function writeStatus(prisma: PrismaClient, patch: Partial<StoredStatus>, by: string | null) {
  const cur = await readStatus(prisma);
  const value = { ...cur, ...patch } as any;
  await prisma.appSetting.upsert({ where: { key: STATUS_KEY }, create: { key: STATUS_KEY, value, updatedBy: by }, update: { value, updatedBy: by } });
}

export type Input = { provider: unknown; model: unknown; apiKey?: unknown };
export type Failure = { ok: false; status: number; code: string; category?: ErrorCategory; message: string };
/** Outcome of an admin operation: `ok`, or the failure to send. Fields beyond `ok` are present only when it is false. */
export type Outcome<T = {}> = { ok: boolean; status?: number; code?: string; category?: ErrorCategory; message?: string } & Partial<T>;

/** Checks the request shape. A blank key means "keep what is there". Returns the clean values or the 400 to send. */
export function validateInput(input: Input): Outcome<{ provider: ProviderId; model: string; apiKey: string | null }> {
  if (!isProvider(input.provider)) return { ok: false, status: 400, code: 'BAD_PROVIDER', message: 'Choose one of the listed providers.' };
  const provider = input.provider;
  if (typeof input.model !== 'string' || !modelsFor(provider).includes(input.model)) return { ok: false, status: 400, code: 'BAD_MODEL', message: 'Choose one of the listed models.' };
  let apiKey: string | null = null;
  if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey !== '') {
    if (typeof input.apiKey !== 'string') return { ok: false, status: 400, code: 'BAD_KEY', message: 'The API key is not valid.' };
    const k = input.apiKey.trim();
    if (k !== '' && (k.length < 8 || k.length > 512 || /[\s\u0000-\u001f"'\\]/.test(k))) return { ok: false, status: 400, code: 'BAD_KEY', message: 'That does not look like an API key.' };
    apiKey = k === '' ? null : k;
  }
  return { ok: true, provider, model: input.model, apiKey };
}

/** The key a test should use: the one just typed, else the credential currently in force. */
async function keyToTest(prisma: PrismaClient, provider: ProviderId, typed: string | null) {
  if (typed) return typed;
  const { stored } = await readStored(prisma);
  if (stored?.key) { try { return open(stored.key, aadFor(provider)); } catch { /* fall through to the environment */ } }
  return envKey(provider);
}

/** "Test connection": tries the key, records the outcome and audits it. Changes nothing else. */
export async function testConnection(prisma: PrismaClient, admin: Admin, input: Input): Promise<Outcome> {
  const v = validateInput(input);
  if (!v.ok) return v as Failure;
  const key = await keyToTest(prisma, v.provider, v.apiKey);
  if (!key) return { ok: false, status: 400, code: 'NO_KEY', message: 'Enter an API key to test.' };
  const r = await testProviderKey(v.provider, v.model, key);
  await recordTest(prisma, admin, v.provider, v.model, r);
  return r.ok ? { ok: true } : { ok: false, status: 200, code: r.category, category: r.category, message: CATEGORY_MESSAGE[r.category!] };
}

async function recordTest(prisma: PrismaClient, admin: Admin, provider: ProviderId, model: string, r: TestResult) {
  const at = new Date().toISOString();
  try {
    await writeStatus(prisma, { lastTest: { ok: r.ok, category: r.ok ? null : r.category!, at, by: who(admin) } }, who(admin));
    await audit(prisma, admin, 'AI_PROVIDER_CONNECTION_TESTED', { provider, model, result: r.ok ? 'SUCCESS' : r.category! });
  } catch (e: any) { console.error('AI provider test result could not be recorded:', e?.name || 'error'); }
}

/**
 * "Save & activate". The server tests first (it never trusts that the browser did), and only a passing test changes anything: a failed
 * one leaves the current key, model and cache exactly as they were. The key is encrypted, saved and audited in one transaction.
 * Does not enable or disable the assistant.
 */
export async function activateConfig(prisma: PrismaClient, admin: Admin, input: Input): Promise<Outcome<{ changed: { key: boolean; model: boolean } }>> {
  const v = validateInput(input);
  if (!v.ok) return v as Failure;
  if (v.apiKey && !encryptionAvailable()) {
    return { ok: false, status: 503, code: 'ENCRYPTION_UNAVAILABLE', message: 'This server has no encryption key configured, so a key cannot be stored. Ask whoever manages the server to set AI_SECRET_ENCRYPTION_KEY.' };
  }
  const { stored } = await readStored(prisma);
  const before = await resolveUncached(prisma);
  const key = await keyToTest(prisma, v.provider, v.apiKey);
  if (!key) return { ok: false, status: 400, code: 'NO_KEY', message: 'Enter an API key to activate.' };

  const r = await testProviderKey(v.provider, v.model, key);
  await recordTest(prisma, admin, v.provider, v.model, r);
  if (!r.ok) return { ok: false, status: 422, code: r.category, category: r.category, message: `${CATEGORY_MESSAGE[r.category!]} Nothing was changed.` };

  const by = who(admin);
  const now = new Date().toISOString();
  const keyChanged = !!v.apiKey;
  const modelChanged = v.model !== before.model;
  if (!keyChanged && !modelChanged) return { ok: true, changed: { key: false, model: false } };

  const value: StoredConfig = {
    provider: v.provider, model: v.model,
    key: keyChanged ? seal(v.apiKey!, aadFor(v.provider)) : stored?.key ?? null,
    keyUpdatedAt: keyChanged ? now : stored?.keyUpdatedAt ?? null,
    keyUpdatedBy: keyChanged ? by : stored?.keyUpdatedBy ?? null,
  };
  const ops: any[] = [
    prisma.appSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value: value as any, updatedBy: by }, update: { value: value as any, updatedBy: by } }),
  ];
  if (keyChanged) ops.push(audit(prisma, admin, stored?.key ? 'AI_PROVIDER_KEY_REPLACED' : 'AI_PROVIDER_KEY_ADDED', { provider: v.provider, model: v.model, result: 'SUCCESS' }));
  if (modelChanged) ops.push(audit(prisma, admin, 'AI_PROVIDER_MODEL_CHANGED', { provider: v.provider, from: before.model, to: v.model, result: 'SUCCESS' }));
  await prisma.$transaction(ops);
  invalidateAIConfig();
  return { ok: true, changed: { key: keyChanged, model: modelChanged } };
}

/** Removes the Admin-stored key. The environment credential, if any, takes over; nothing in the environment is touched. */
export async function removeAdminKey(prisma: PrismaClient, admin: Admin): Promise<Outcome> {
  const { stored } = await readStored(prisma);
  if (!stored?.key) return { ok: false, status: 404, code: 'NO_ADMIN_KEY', message: 'There is no Admin-configured key to remove.' };
  const by = who(admin);
  const value: StoredConfig = { ...stored, key: null, keyUpdatedAt: new Date().toISOString(), keyUpdatedBy: by };
  await prisma.$transaction([
    prisma.appSetting.update({ where: { key: CONFIG_KEY }, data: { value: value as any, updatedBy: by } }),
    audit(prisma, admin, 'AI_PROVIDER_KEY_REMOVED', { provider: stored.provider, result: 'SUCCESS' }),
  ]);
  invalidateAIConfig();
  return { ok: true };
}

// ── Real-traffic errors ─────────────────────────────────────────────────────

const lastNoted = new Map<string, number>();
/** Remembers the category of a real provider failure for the status panel. Throttled; best effort; never throws and never stores text. */
export async function noteProviderError(prisma: PrismaClient, category: unknown, now = Date.now()) {
  if (!isCategory(category)) return;
  if ((lastNoted.get(category) ?? 0) + 60_000 > now) return;
  lastNoted.set(category, now);
  try { await writeStatus(prisma, { lastError: { category, at: new Date(now).toISOString() } }, null); } catch { /* status only */ }
}
