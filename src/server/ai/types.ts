import type { ErrorCategory } from './errors.js';

/** The providers the code can call end to end. Add one here only when its adapter, test and models are implemented. */
export type ProviderId = 'gemini' | 'grok';
export const PROVIDER_IDS: ProviderId[] = ['gemini', 'grok'];
export const isProviderId = (v: unknown): v is ProviderId => v === 'gemini' || v === 'grok';
export const PROVIDER_LABEL: Record<ProviderId, string> = { gemini: 'Google Gemini', grok: 'xAI Grok' };

/** A grounding tool, described once in plain JSON Schema. Each provider adapter translates it into its own wire format. */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
export type ToolCall = { name: string; args: Record<string, unknown>; id?: string };

/**
 * The conversation, in a form that belongs to no provider. The shared assistant logic builds these; an adapter turns them into whatever
 * its provider wants. `raw` on a tool-call turn carries the provider's own representation back to the SAME provider unchanged (Gemini needs
 * its function-call parts returned as it sent them); another provider ignores it.
 */
export type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'assistant_calls'; calls: ToolCall[]; raw?: unknown }
  | { role: 'tool_results'; results: { call: ToolCall; output: Record<string, unknown> }[] };

export type StepRequest = {
  system: string; turns: Turn[];
  tools: ToolSpec[];
  /** False forces a plain answer from what is already in the turns. */
  allowTools: boolean;
  maxOutputTokens: number; temperature: number;
  /** Gemini thinking models only; other providers ignore it. */
  thinkingBudget?: number | null;
  signal: AbortSignal;
};
/** One model step: either text, or a request for tools. */
export type StepResult = { text: string; calls: ToolCall[]; raw?: unknown };

/** `httpStatus` is the provider's HTTP status when it answered with one (a number, never a body); `endpoint` is what was actually asked. */
export type TestOutcome = { ok: boolean; category?: ErrorCategory; latencyMs: number; httpStatus?: number; endpoint?: string; providerCode?: string; providerMessage?: string };

export type ProviderHealthState = 'healthy' | 'degraded' | 'rate_limited' | 'cooling_down' | 'unavailable' | 'not_configured';

/**
 * What every provider is. The assistant's business logic (prompt, grounding, history, quota, PII masking, leads) lives elsewhere and is the
 * same for all of them; a provider only knows how to take one step and how to say why it failed.
 */
export interface AIProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly model: string;
  /** One minimal request: fixed prompt, smallest budget, no visitor text. Used by the admin "Test connection". */
  testConnection(signal?: AbortSignal): Promise<TestOutcome>;
  /** One step of a conversation. Throws ProviderError (safe category only) on any failure. */
  generate(req: StepRequest): Promise<StepResult>;
  /** Sorts a raw failure into a safe category. */
  classifyError(err: unknown, timedOut?: boolean): ErrorCategory;
}
