import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';
import { categorizeProviderError, ProviderError, type ErrorCategory } from './errors.js';
import type { AIProvider, StepRequest, StepResult, TestOutcome, ToolSpec, Turn } from './types.js';

/**
 * Google Gemini, through the official SDK. One step per call: text, or a request for tools. Everything else (the prompt, grounding, history,
 * masking, limits) is the shared assistant logic's, identical for every provider.
 */

/** JSON Schema → Gemini's Schema: upper-case type names, minLength as a string, everything else as given. */
function toGeminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
    else if (k === 'minLength' || k === 'maxLength') out[k] = String(v);
    else if (k === 'properties' && v && typeof v === 'object') out.properties = Object.fromEntries(Object.entries(v).map(([n, p]) => [n, toGeminiSchema(p)]));
    else out[k] = toGeminiSchema(v);
  }
  return out;
}
const declarations = (tools: ToolSpec[]) => tools.map(t => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) }));

function contentsOf(turns: Turn[]): Content[] {
  const out: Content[] = [];
  for (const t of turns) {
    if (t.role === 'user') out.push({ role: 'user', parts: [{ text: t.text }] });
    else if (t.role === 'assistant') out.push({ role: 'model', parts: [{ text: t.text }] });
    else if (t.role === 'assistant_calls') {
      // Returned exactly as the model sent it (thought signatures included) when it is Gemini's own; rebuilt otherwise.
      out.push({ role: 'model', parts: Array.isArray(t.raw) && t.raw.length ? (t.raw as any) : t.calls.map(c => ({ functionCall: { name: c.name, args: c.args } })) });
    } else out.push({ role: 'user', parts: t.results.map(r => ({ functionResponse: { name: r.call.name, response: { output: r.output } } })) });
  }
  return out;
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Google Gemini';
  private memo: GoogleGenAI | null = null;
  constructor(public readonly model: string, private readonly apiKey: string) {}
  /** The key must never leave through serialisation, logging or inspection. */
  toJSON() { return { id: this.id, model: this.model }; }
  toString() { return `GeminiProvider(${this.model})`; }
  [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }

  /** The SDK client, for the one other caller that needs it (the content classifier). Built once. */
  client(): GoogleGenAI { return (this.memo ??= new GoogleGenAI({ apiKey: this.apiKey })); }

  classifyError(err: unknown, timedOut = false): ErrorCategory { return categorizeProviderError(err, timedOut); }

  async generate(req: StepRequest): Promise<StepResult> {
    try {
      const config: any = {
        systemInstruction: req.system, temperature: req.temperature, maxOutputTokens: req.maxOutputTokens, abortSignal: req.signal,
        ...(req.thinkingBudget != null ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } } : {}),
        ...(req.allowTools ? { tools: [{ functionDeclarations: declarations(req.tools) }] } : { toolConfig: { functionCallingConfig: { mode: 'NONE' } } }),
      };
      const response = await this.client().models.generateContent({ model: this.model, contents: contentsOf(req.turns), config });
      const calls = (response.functionCalls ?? []).map(fc => ({ name: fc.name ?? '', args: (fc.args ?? {}) as Record<string, unknown> }));
      if (calls.length) return { text: '', calls, raw: response.candidates?.[0]?.content?.parts ?? [] };
      return { text: (response.text || '').trim(), calls: [] };
    } catch (e: any) {
      const status = Number(e?.status ?? e?.error?.code);
      throw new ProviderError(this.classifyError(e, req.signal.aborted), Number.isInteger(status) && status >= 100 && status < 600 ? status : undefined);
    }
  }

  async testConnection(signal?: AbortSignal): Promise<TestOutcome> {
    const t0 = Date.now();
    try {
      await this.client().models.generateContent({ model: this.model, contents: 'Reply OK.', config: { maxOutputTokens: 16, temperature: 0, ...(signal ? { abortSignal: signal } : {}) } });
      return { ok: true, latencyMs: Date.now() - t0, endpoint: `generateContent (${this.model})` };
    } catch (e: any) {
      const status = Number(e?.status ?? e?.error?.code);
      return { ok: false, category: this.classifyError(e, !!signal?.aborted), latencyMs: Date.now() - t0, httpStatus: Number.isInteger(status) && status >= 100 && status < 600 ? status : undefined, endpoint: `generateContent (${this.model})` };
    }
  }
}
