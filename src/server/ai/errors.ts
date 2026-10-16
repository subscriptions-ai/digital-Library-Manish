/**
 * Safe failure categories for AI providers, and how a raw failure is sorted into one.
 *
 * Only the category ever leaves this file. A provider's response body, a stack trace, request headers or anything echoing a credential are
 * read here to decide the category and then thrown away, so none of it can reach a screen, a log, an audit row or the public.
 */
export type ErrorCategory =
  | 'AUTHENTICATION_FAILED' | 'PERMISSION_DENIED' | 'QUOTA_EXCEEDED' | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND' | 'MODEL_UNAVAILABLE' | 'TIMEOUT' | 'NETWORK_ERROR' | 'PROVIDER_5XX'
  | 'PROVIDER_UNAVAILABLE' | 'INVALID_REQUEST' | 'CIRCUIT_OPEN' | 'UNKNOWN_PROVIDER_ERROR';

export const CATEGORY_MESSAGE: Record<ErrorCategory, string> = {
  AUTHENTICATION_FAILED: 'The provider rejected this API key.',
  PERMISSION_DENIED: 'This key is not allowed to use that model or service.',
  QUOTA_EXCEEDED: 'The provider says the quota, credit or billing limit for this key has been reached.',
  RATE_LIMITED: 'The provider is limiting requests right now (HTTP 429). Try again shortly.',
  MODEL_NOT_FOUND: 'The API key is valid, but this model is not available for this credential. Choose another model.',
  MODEL_UNAVAILABLE: 'The model is temporarily unavailable or overloaded.',
  TIMEOUT: 'The provider did not answer in time.',
  NETWORK_ERROR: 'The provider could not be reached (connection failed or was reset).',
  PROVIDER_5XX: 'The provider reported a server error (HTTP 5xx).',
  PROVIDER_UNAVAILABLE: 'The provider could not be reached or is having problems.',
  INVALID_REQUEST: 'The provider rejected the request (HTTP 400): check the model and settings.',
  CIRCUIT_OPEN: 'The provider is resting after repeated failures and was not asked.',
  UNKNOWN_PROVIDER_ERROR: 'The provider returned an unexpected error.',
};
/**
 * What an admin is told, in the words of the provider concerned. A category means the same thing for every provider, but what to DO about
 * it does not: for xAI a 403 is a key-permission (ACL) problem, a 404 may be the model or the endpoint, and a 429 may be billing as well as rate.
 * 401, 403 and 404 are different problems and never share one label.
 */
const XAI_MESSAGE: Partial<Record<ErrorCategory, string>> = {
  AUTHENTICATION_FAILED: 'Invalid or missing xAI API key.',
  PERMISSION_DENIED: 'The API key/team does not have permission. Check the key\'s ACL in the xAI console.',
  MODEL_NOT_FOUND: 'Selected model or endpoint is unavailable.',
  RATE_LIMITED: 'xAI rate or billing limit reached.',
  QUOTA_EXCEEDED: 'xAI rate or billing limit reached.',
  PROVIDER_5XX: 'xAI provider is temporarily unavailable.',
  MODEL_UNAVAILABLE: 'xAI provider is temporarily unavailable.',
  PROVIDER_UNAVAILABLE: 'xAI provider is temporarily unavailable.',
  INVALID_REQUEST: 'xAI rejected the request. Check request format or API key.',
};
export function messageFor(provider: string | null | undefined, category: ErrorCategory): string {
  return (provider === 'grok' ? XAI_MESSAGE[category] : undefined) ?? CATEGORY_MESSAGE[category];
}
export const isCategory = (v: unknown): v is ErrorCategory => typeof v === 'string' && v in CATEGORY_MESSAGE;

/**
 * Failures that mean the CONFIGURATION is wrong (a rejected key, a missing model, a bad request, no credit) rather than the provider having a
 * bad moment. Asking again with the same configuration gives the same answer, so such a provider rests at once and the screen says
 * "Unavailable", not "Degraded".
 */
export const CONFIG_CATEGORIES: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>(['AUTHENTICATION_FAILED', 'PERMISSION_DENIED', 'MODEL_NOT_FOUND', 'INVALID_REQUEST', 'QUOTA_EXCEEDED']);
export const isConfigFailure = (c: ErrorCategory) => CONFIG_CATEGORIES.has(c);
export const isRateLimitFailure = (c: ErrorCategory) => c === 'RATE_LIMITED' || c === 'QUOTA_EXCEEDED';

/** A provider call that failed: the safe category, the HTTP status, and the provider's own short error code/message once scrubbed. */
export class ProviderError extends Error {
  constructor(public category: ErrorCategory, public status?: number, public detail?: ProviderDetail) {
    super(CATEGORY_MESSAGE[category]);
    this.name = 'ProviderError';
  }
}

export type ProviderDetail = { code?: string; message?: string };
/**
 * The provider's own error code and message from a JSON error body (xAI sends `{"code":"invalid-argument","error":"Incorrect API key provided…"}`),
 * cut short and scrubbed of anything shaped like a credential, so an admin sees the provider's words rather than only our label.
 */
export function safeProviderDetail(body: string): ProviderDetail | undefined {
  let j: any;
  try { j = JSON.parse(body); } catch { return undefined; }
  const scrub = (v: unknown, max: number) => typeof v !== 'string' ? undefined : v
    .replace(/xai-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]+|Bearer\s+\S+|\b[A-Za-z0-9_-]{32,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[redacted]')
    .replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
  const err = typeof j?.error === 'object' ? j.error : j;
  const code = scrub(err?.code ?? j?.code ?? err?.status, 40);
  const message = scrub(typeof j?.error === 'string' ? j.error : err?.message, 200);
  return code || message ? { code, message } : undefined;
}

const NETWORK_TEXT = /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|socket hang up|UND_ERR|network|EPIPE/i;

/** An HTTP failure from a provider whose body we can read (Grok). The body is only used to tell apart causes that share a status. */
export function categorizeHttpFailure(status: number, body = '', opts: { grok?: boolean } = {}): ErrorCategory {
  const t = body.slice(0, 600);
  if (status === 401 || /invalid api key|incorrect api key|api key not valid|invalid[_ ]?token|unauthenticated/i.test(t) && status < 500) return 'AUTHENTICATION_FAILED';
  // xAI: a 403 is reported as a permission problem (the key's ACL), as xAI's own errors describe it; other providers' 403 text can mean billing.
  if (status === 403) return !opts.grok && /credit|billing|quota|spending limit/i.test(t) ? 'QUOTA_EXCEEDED' : 'PERMISSION_DENIED';
  if (status === 402) return 'QUOTA_EXCEEDED';
  if (status === 429) return /quota|credit|billing|exceeded your current|spending limit/i.test(t) ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 400) return /model/i.test(t) && /not found|does not exist|not supported|unknown|invalid model|no access/i.test(t) ? 'MODEL_NOT_FOUND' : 'INVALID_REQUEST';
  if (status === 408) return 'TIMEOUT';
  if (status >= 500) return /overloaded|model.*(unavailable|busy)|capacity/i.test(t) ? 'MODEL_UNAVAILABLE' : 'PROVIDER_5XX';
  if (status >= 400) return 'INVALID_REQUEST';
  return 'UNKNOWN_PROVIDER_ERROR';
}

/**
 * Sorts a thrown error (an SDK error, a fetch failure, an abort) into a category. The raw error is read here and discarded.
 */
export function categorizeProviderError(err: any, timedOut = false): ErrorCategory {
  if (err instanceof ProviderError) return err.category;
  if (timedOut) return 'TIMEOUT';
  const text = `${err?.message ?? ''} ${err?.cause?.code ?? ''} ${err?.code ?? ''}`;
  const embedded = /"code"\s*:\s*(\d{3})/.exec(text)?.[1];
  const status = Number(err?.status ?? err?.error?.code ?? embedded) || (typeof err?.code === 'number' ? err.code : 0);
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || (/aborted|timed? ?out|ETIMEDOUT/i.test(text) && !status)) return 'TIMEOUT';
  if (status === 401 || /API_KEY_INVALID|api key not valid|invalid api key|UNAUTHENTICATED|incorrect api key/i.test(text)) return 'AUTHENTICATION_FAILED';
  if (status === 403 || /PERMISSION_DENIED/i.test(text)) return 'PERMISSION_DENIED';
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(text)) return /quota|billing|exceeded your current/i.test(text) ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED';
  if (status === 404 || /model.*(not found|not supported)|NOT_FOUND/i.test(text)) return 'MODEL_NOT_FOUND';
  if (status === 400 || /INVALID_ARGUMENT/i.test(text)) return 'INVALID_REQUEST';
  if (status === 408) return 'TIMEOUT';
  if (status >= 500) return /overloaded|model.*(unavailable|busy)|capacity/i.test(text) ? 'MODEL_UNAVAILABLE' : 'PROVIDER_5XX';
  if (NETWORK_TEXT.test(text)) return 'NETWORK_ERROR';
  if (/UNAVAILABLE/i.test(text)) return 'PROVIDER_UNAVAILABLE';
  return 'UNKNOWN_PROVIDER_ERROR';
}
