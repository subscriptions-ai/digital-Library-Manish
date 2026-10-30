/**
 * Import this FIRST in any test that touches the AI assistant.
 *
 * `.env` holds real provider keys and the assistant's modules load it themselves, so a test that forgot to mock a provider spent real
 * credits (and, with no credit left, failed for a reason that had nothing to do with the code). This makes that impossible by default:
 *   - every provider key is set to an empty string before any module can read `.env` (dotenv never overwrites a key that is already set);
 *   - any request to a host that is not this machine is refused with an error that says so.
 * A test that needs a provider points it at a local mock (a loopback URL), which is allowed. LIVE_AI_TESTS=1 switches both guards off
 * for a deliberate manual run against the real services.
 */
if (process.env.LIVE_AI_TESTS !== '1') {
  for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GROK_API_KEY', 'XAI_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) process.env[k] = '';
  const realFetch = globalThis.fetch.bind(globalThis);
  const local = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  globalThis.fetch = ((input: any, init?: any) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    let host = '';
    try { host = new URL(raw).hostname; } catch { /* a relative URL cannot leave this machine */ return realFetch(input, init); }
    if (!local.has(host)) return Promise.reject(new Error(`noRealAi: refused a request to ${host}. Mock the provider, or set LIVE_AI_TESTS=1 for a deliberate live run.`));
    return realFetch(input, init);
  }) as typeof fetch;
}
export {};
