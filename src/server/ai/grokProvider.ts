import { categorizeHttpFailure, categorizeProviderError, ProviderError, safeProviderDetail, type ErrorCategory } from './errors.js';
import type { AIProvider, StepRequest, StepResult, TestOutcome, ToolCall, Turn } from './types.js';

/**
 * xAI Grok, through xAI's Responses API (`POST https://api.x.ai/v1/responses`), over plain fetch: no SDK, no dependency.
 *
 * The host is fixed in code. Nothing a browser sends, and nothing in the Admin screen, can point this at another address; the only way
 * to change it is an environment variable on a non-production server, and that exists for the test suite alone.
 *
 * Stateless on purpose: every step sends the whole (short) conversation and asks the provider not to store it, so there is no second,
 * provider-side conversation to reconcile with ours. The Authorization header is built here, used for one request, and never logged;
 * error bodies are read only to tell apart causes that share an HTTP status, and are then discarded.
 */
const BASE = 'https://api.x.ai/v1';
/** The inference endpoint, which is also exactly what a connection test asks: a key is judged on the call it will actually make. */
export const GROK_ENDPOINT = 'POST /v1/responses';
const baseUrl = () => (process.env.NODE_ENV !== 'production' && process.env.AI_GROK_BASE_URL_FOR_TESTS) || BASE;

/** The keys and value types of a request body, never its values: `{ model: string, input: array[1] }`. */
const shapeOf = (b: Record<string, unknown>) => `{ ${Object.entries(b).map(([k, v]) => `${k}: ${Array.isArray(v) ? `array[${v.length}]` : typeof v}`).join(', ')} }`;
/** Development only: what was asked and what came back. Never the key, the Authorization header or the body's values. */
function devLog(model: string, body: Record<string, unknown>, status: number | string, detail?: { code?: string; message?: string }) {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[ai:grok] ${GROK_ENDPOINT} model=${model} body=${shapeOf(body)} → ${status}${detail ? ` ${detail.code ?? ''} ${detail.message ?? ''}`.trimEnd() : ''}`);
}

/** Items sent as `input`: the conversation, with tool calls and their results echoed back by call id. */
function inputOf(turns: Turn[]): any[] {
  const out: any[] = [];
  let n = 0;
  for (const t of turns) {
    if (t.role === 'user') out.push({ role: 'user', content: t.text });
    else if (t.role === 'assistant') out.push({ role: 'assistant', content: t.text });
    else if (t.role === 'assistant_calls') {
      // Grok's own output items go back as they came; a call that came from another provider is rebuilt.
      if (Array.isArray(t.raw) && t.raw.some((i: any) => i?.type === 'function_call')) out.push(...(t.raw as any[]));
      else for (const c of t.calls) out.push({ type: 'function_call', call_id: c.id ?? `call_${++n}`, name: c.name, arguments: JSON.stringify(c.args) });
    } else {
      for (const r of t.results) out.push({ type: 'function_call_output', call_id: r.call.id ?? `call_${++n}`, output: JSON.stringify(r.output) });
    }
  }
  return out;
}

/** The answer text of a Responses-API reply, wherever the provider put it. */
function textOf(body: any): string {
  if (typeof body?.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(body?.output) ? body.output : []) {
    if (item?.type !== 'message') continue;
    for (const c of Array.isArray(item.content) ? item.content : []) if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string') parts.push(c.text);
  }
  return parts.join('').trim();
}

export class GrokProvider implements AIProvider {
  readonly id = 'grok' as const;
  readonly name = 'xAI Grok';
  constructor(public readonly model: string, private readonly apiKey: string) {}
  toJSON() { return { id: this.id, model: this.model }; }
  toString() { return `GrokProvider(${this.model})`; }
  [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }

  classifyError(err: unknown, timedOut = false): ErrorCategory { return categorizeProviderError(err, timedOut); }

  private async post(body: Record<string, unknown>, signal: AbortSignal): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/responses`, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      devLog(this.model, body, signal.aborted ? 'aborted' : 'network error');
      throw new ProviderError(this.classifyError(e, signal.aborted));
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const detail = safeProviderDetail(text);
      devLog(this.model, body, res.status, detail);
      throw new ProviderError(categorizeHttpFailure(res.status, text, { grok: true }), res.status, detail);
    }
    devLog(this.model, body, res.status);
    try { return await res.json(); }
    catch (e) { throw new ProviderError(signal.aborted ? 'TIMEOUT' : 'UNKNOWN_PROVIDER_ERROR', res.status); }
  }

  async generate(req: StepRequest): Promise<StepResult> {
    const body: Record<string, unknown> = {
      model: this.model, instructions: req.system, input: inputOf(req.turns),
      temperature: req.temperature, max_output_tokens: req.maxOutputTokens, store: false,
      ...(req.allowTools && req.tools.length
        ? { tools: req.tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })), tool_choice: 'auto' }
        : {}),
    };
    const reply = await this.post(body, req.signal);
    const output: any[] = Array.isArray(reply?.output) ? reply.output : [];
    const calls: ToolCall[] = output.filter(i => i?.type === 'function_call' && typeof i.name === 'string').map(i => {
      let args: Record<string, unknown> = {};
      try { const p = JSON.parse(typeof i.arguments === 'string' ? i.arguments : '{}'); if (p && typeof p === 'object') args = p; } catch { /* a malformed argument string is an empty lookup */ }
      return { name: i.name, args, id: String(i.call_id ?? i.id ?? '') || undefined };
    });
    if (calls.length) return { text: '', calls, raw: output.filter(i => i?.type === 'function_call') };
    return { text: textOf(reply), calls: [] };
  }

  async testConnection(signal?: AbortSignal): Promise<TestOutcome> {
    const t0 = Date.now();
    const ac = new AbortController();
    const relay = () => ac.abort();
    signal?.addEventListener('abort', relay, { once: true });
    try {
      // The plain Responses-API shape (`input` items, never chat-completions `messages`), identical for reasoning and non-reasoning models.
      await this.post({ model: this.model, input: [{ role: 'user', content: 'Reply only with OK' }], store: false }, signal ?? ac.signal);
      return { ok: true, latencyMs: Date.now() - t0, endpoint: GROK_ENDPOINT };
    } catch (e) {
      const pe = e instanceof ProviderError ? e : undefined;
      return { ok: false, category: pe ? pe.category : this.classifyError(e, !!signal?.aborted), latencyMs: Date.now() - t0, httpStatus: pe?.status, endpoint: GROK_ENDPOINT, providerCode: pe?.detail?.code, providerMessage: pe?.detail?.message };
    } finally { signal?.removeEventListener('abort', relay); }
  }
}
