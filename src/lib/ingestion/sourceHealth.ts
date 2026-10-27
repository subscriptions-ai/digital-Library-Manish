import { ingestionDb as db } from './db.js';
import { INGESTION_POLICY, rotationConfig, minutes } from './policy.js';
import { audit } from './audit.js';
import https from 'node:https';
import { Readable } from 'node:stream';

/**
 * How each upstream source is behaving, and a request helper that respects it.
 *
 * Three behaviours the engine did not have:
 *  - A transient failure (network error, 429, 5xx) is retried a couple of times with backoff and
 *    honours Retry-After, rather than being treated as the end of the road.
 *  - A source that keeps failing is paused for a while ("circuit open"); the rest of the engine
 *    keeps working on the sources that are fine.
 *  - A permanent answer (a 4xx that is not rate limiting) is not a source failure, so one bad
 *    cursor does not take a whole source offline.
 */

/**
 * What kind of failure a failed request was. A category only: it is what the admin screen shows ("Connection timeout"), and what
 * tells an operator whether the fault is ours (DNS, TLS), the network's (timeout, reset) or the provider's (5xx, a refusal, a bad body).
 * No response body and no URL query is ever stored with it.
 */
export type ErrorKind =
  | 'dns' | 'timeout' | 'connection_refused' | 'connection_reset' | 'tls'
  | 'http_4xx' | 'http_429' | 'http_5xx'
  | 'oai_protocol' | 'invalid_xml' | 'invalid_response'
  | 'invalid_resumption_token' | 'source_changed' | 'network_unreachable'
  | 'provider_unavailable' | 'unknown';

export const ERROR_KIND_LABEL: Record<ErrorKind, string> = {
  dns: 'DNS lookup failed', timeout: 'Connection timeout', connection_refused: 'Connection refused', connection_reset: 'Connection reset',
  tls: 'TLS / certificate error', http_4xx: 'HTTP 4xx (request refused)', http_429: 'HTTP 429 (rate limited)', http_5xx: 'HTTP 5xx (server error)',
  oai_protocol: 'OAI protocol error', invalid_xml: 'Invalid XML', invalid_response: 'Unrecognised response',
  invalid_resumption_token: 'Resumption token rejected', source_changed: 'Source changed (set or format gone)', network_unreachable: 'Network unreachable',
  provider_unavailable: 'Provider unavailable', unknown: 'Unknown error',
};
const KINDS = new Set(Object.keys(ERROR_KIND_LABEL));
export const isErrorKind = (v: unknown): v is ErrorKind => typeof v === 'string' && KINDS.has(v);

/** A reply that arrived but cannot be used. Thrown by a caller's `parse`, so it is counted as the source failing, not as success. */
export class SourceParseError extends Error {
  constructor(public kind: 'oai_protocol' | 'invalid_xml' | 'invalid_response' | 'source_changed', message: string) { super(message); this.name = 'SourceParseError'; }
}

/** The error's own code, wherever Node or undici put it (`fetch failed` carries the real one on `cause`). */
const codeOf = (e: any): string => String(e?.code || e?.cause?.code || e?.cause?.cause?.code || '');

/** Which kind of failure a thrown error was. `unknown` means it did not come from a request at all (a bug, the database). */
export function classifyFailure(e: any): ErrorKind {
  if (e instanceof SourceParseError) return e.kind;
  const code = codeOf(e);
  const text = String(e?.message || e || '');
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /TIMEDOUT|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT/i.test(code)) return 'timeout';
  if (/^(ENOTFOUND|EAI_AGAIN|EAI_NODATA|EAI_NONAME|EAI_FAIL)$/.test(code)) return 'dns';
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (/^(ECONNRESET|EPIPE|UND_ERR_SOCKET|UND_ERR_CLOSED|ECONNABORTED)$/.test(code)) return 'connection_reset';
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|HOSTNAME_MISMATCH/i.test(code) || /certificate|tls|ssl/i.test(text)) return 'tls';
  if (/^(ENETUNREACH|EHOSTUNREACH|ENETDOWN|EHOSTDOWN)$/.test(code)) return 'network_unreachable';
  if (e?.name === 'SyntaxError') return 'invalid_response';
  if (typeof e?.status === 'number') return kindForStatus(e.status);
  return 'unknown';
}
export const kindForStatus = (status: number): ErrorKind => status === 429 ? 'http_429' : status >= 500 ? 'http_5xx' : status >= 400 ? 'http_4xx' : 'provider_unavailable';

/** Best effort from a message alone, for failures recorded by code that only has the text. */
export function kindFromMessage(msg: string): ErrorKind {
  const m = String(msg || '');
  if (/\b429\b/.test(m)) return 'http_429';
  if (/\bHTTP 5\d\d\b/.test(m)) return 'http_5xx';
  if (/\bHTTP 4\d\d\b/.test(m)) return 'http_4xx';
  if (/timed? ?out|TimeoutError|ETIMEDOUT/i.test(m)) return 'timeout';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return 'dns';
  if (/ENETUNREACH|EHOSTUNREACH|ENETDOWN|EHOSTDOWN/i.test(m)) return 'network_unreachable';
  if (/ECONNREFUSED/i.test(m)) return 'connection_refused';
  if (/ECONNRESET|socket hang up/i.test(m)) return 'connection_reset';
  if (/certificate|TLS|SSL/i.test(m)) return 'tls';
  if (/resumption token/i.test(m)) return 'invalid_resumption_token';
  if (/OAI error (cannotDisseminateFormat|noSetHierarchy)/i.test(m)) return 'source_changed';
  if (/OAI error/i.test(m)) return 'oai_protocol';
  if (/xml/i.test(m)) return 'invalid_xml';
  return 'unknown';
}

/** What is kept of an error: one short line, with no URL query (those can carry keys or tokens) and no body. */
export function safeError(raw: unknown): string {
  return String(raw ?? '').replace(/(https?:\/\/[^\s?#]+)[?#][^\s"')]*/gi, '$1').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** The error plus the code it carried, so "fetch failed" says why. */
function describeError(e: any): string {
  const code = codeOf(e);
  const msg = String(e?.message || e);
  return safeError(code && !msg.includes(code) ? `${msg} [${code}]` : msg);
}

export type SourceResult = {
  errorKind?: ErrorKind;
  ok: boolean;
  status: number | null;
  json: any | null;
  /** The source is paused; no request was made. */
  paused?: boolean;
  /** A failure worth retrying later (network, 429, 5xx), as opposed to a permanent refusal. */
  transient?: boolean;
  /** HTTP 429: the source asked us to slow down. Not retried; the source is set aside until `retryAt`. */
  rateLimited?: boolean;
  /** When a paused or rate-limited source may be asked again. */
  retryAt?: Date | null;
  error?: string;
};

/**
 * A request that names its own connection timeout. Node tries IPv6 and IPv4 in turn and gives each address
 * only 250 ms; on a network where that is too short for one host (NCBI's from here, where every connection
 * then fails with ETIMEDOUT while curl works) that source can ask for longer, and every other source keeps the
 * default. The global `fetch` has no such option, so this one request goes through `https`; the answer comes
 * back as an ordinary `Response`, and only the connect step differs. Redirects are followed a few hops.
 */
function fetchWithConnectTimeout(url: string, init: RequestInit | undefined, connectTimeoutMs: number, hops = 0): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== 'https:') return resolve(fetch(url, init));
    const req = https.request(u, {
      method: 'GET', headers: (init?.headers as Record<string, string>) || {}, signal: init?.signal ?? undefined,
      autoSelectFamily: true, autoSelectFamilyAttemptTimeout: connectTimeoutMs,
    } as https.RequestOptions, res => {
      const status = res.statusCode || 0;
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && loc && hops < 3) {
        res.resume();
        return fetchWithConnectTimeout(new URL(loc, u).toString(), init, connectTimeoutMs, hops + 1).then(resolve, reject);
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
      const bodyless = status === 204 || status === 205 || status === 304;
      resolve(new Response(bodyless ? null : (Readable.toWeb(res) as any), { status, statusText: res.statusMessage, headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

type Transport = (url: string, init?: RequestInit, connectTimeoutMs?: number) => Promise<Response>;

/** Replaceable so the engine can be exercised against a fake source. */
const realFetch: Transport = (url, init, connectTimeoutMs) => connectTimeoutMs ? fetchWithConnectTimeout(url, init, connectTimeoutMs) : fetch(url, init);
let httpFetch: Transport = realFetch;
export function __useFetchForTests(f: Transport | null) { httpFetch = f ?? realFetch; }
let sleeper = (ms: number) => new Promise(r => setTimeout(r, ms));
export function __useSleepForTests(f: ((ms: number) => Promise<any>) | null) { sleeper = f ?? ((ms: number) => new Promise(r => setTimeout(r, ms))); }

/** One raw request through the same (replaceable) transport, with no health bookkeeping — for probes that must not count against a source's breaker. */
export const fetchRaw = (url: string, init?: RequestInit, connectTimeoutMs?: number) => httpFetch(url, init, connectTimeoutMs);

export function sourceFor(url: string): string {
  try {
    const h = new URL(url).hostname;
    if (h.endsWith('openalex.org')) return 'OpenAlex';
    if (h.endsWith('doaj.org')) return 'DOAJ';
    if (h.endsWith('doabooks.org')) return 'DOAB';
    if (h.endsWith('oapen.org')) return 'OAPEN';
    if (h.endsWith('crossref.org')) return 'Crossref';
    if (h.endsWith('ebi.ac.uk')) return 'EuropePMC';
    if (h.endsWith('arxiv.org')) return 'arXiv';
    if (h.endsWith('issn.org')) return 'ROAD';
    if (h.endsWith('openlibrary.org')) return 'OpenLibrary';
    return h;
  } catch { return 'unknown'; }
}

export async function sourceStatus(source: string): Promise<{ paused: boolean; until: Date | null; failures: number }> {
  const row = await db.ingestionSourceHealth.findUnique({ where: { source } }).catch(() => null);
  const until: Date | null = row?.pausedUntil ?? null;
  return { paused: !!until && until.getTime() > Date.now(), until, failures: row?.consecutiveFailures ?? 0 };
}

/**
 * Is a source resting, and why? "Rate limited" when the last failure was HTTP 429, "cooling down" when it
 * was paused for any other repeated failure. Read from the same row the engine's breaker writes, so a
 * manual import can never be more eager than the engine is allowed to be.
 */
export async function sourceCooldown(source: string): Promise<{ state: 'ok' | 'rate_limited' | 'cooling' | 'failing'; until: Date | null; lastError: string | null; failures: number }> {
  const h = await sourceHealthState(source);
  if (h.until) return { state: h.health === 'rate_limited' ? 'rate_limited' : 'cooling', until: h.until, lastError: h.lastError, failures: h.failures };
  return { state: h.failures >= h.threshold ? 'failing' : 'ok', until: null, lastError: h.lastError, failures: h.failures };
}

export async function recordSourceOk(source: string) {
  await db.ingestionSourceHealth.upsert({
    where: { source }, create: { source, lastOkAt: new Date() },
    update: { consecutiveFailures: 0, pausedUntil: null, lastOkAt: new Date() },
  }).catch(() => {});
}

/**
 * One failed request, counted once. `consecutiveFailures` is the run since the last request that worked (reset by it); `lifetimeFailures`
 * is every failure there has ever been and is never reset — two numbers, because one says how the source is doing and the other what it has cost.
 *
 * From the threshold on the source rests, one level longer each time it fails again (policy.breaker.pauseMinutes): the first rest ends, the
 * next request is a single test, and if that fails the rest is extended and the engine goes on to another source. `kind` is the category the
 * screen shows; without it, it is worked out from the message.
 */
export async function recordSourceFailure(source: string, error: string, kind?: ErrorKind) {
  const cfg = INGESTION_POLICY.breaker;
  const threshold = rotationConfig().failuresBeforeFallback;
  const message = safeError(error).slice(0, 500) || 'failed';
  const k: ErrorKind = kind ?? kindFromMessage(message);
  const row = await db.ingestionSourceHealth.upsert({
    where: { source },
    create: { source, consecutiveFailures: 1, lifetimeFailures: 1, lastFailureAt: new Date(), lastError: message, lastErrorKind: k },
    update: { consecutiveFailures: { increment: 1 }, lifetimeFailures: { increment: 1 }, lastFailureAt: new Date(), lastError: message, lastErrorKind: k },
  }).catch(() => null);
  const n = row?.consecutiveFailures ?? 0;
  if (n >= threshold) {
    const level = Math.min(cfg.pauseMinutes.length - 1, n - threshold);
    const until = new Date(Date.now() + minutes(cfg.pauseMinutes[level]));
    await db.ingestionSourceHealth.update({ where: { source }, data: { pausedUntil: until } }).catch(() => {});
    await audit(null, 'SOURCE_PAUSED', { source, consecutiveFailures: n, pausedUntil: until, kind: k, lastError: message.slice(0, 200) });
    return { opened: true, until };
  }
  return { opened: false, until: null as Date | null };
}

/** `Retry-After` is either a number of seconds or an HTTP date. */
export function parseRetryAfter(v: string | null | undefined, now = Date.now()): number | null {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/**
 * HTTP 429. Not a fault of the source and not a reason to ask again: the source is set aside until the time it asked for
 * (bounded; a few minutes when it did not say), the engine hands the turn to the next source, and the failure count is
 * left alone — being busy is not being broken.
 */
export async function recordRateLimited(source: string, retryAfterMs: number | null, error?: string): Promise<Date> {
  const cfg = INGESTION_POLICY.breaker;
  const ms = Math.min(minutes(cfg.rateLimitMaxMinutes), Math.max(minutes(cfg.rateLimitMinMinutes), retryAfterMs ?? minutes(cfg.rateLimitDefaultMinutes)));
  const until = new Date(Date.now() + ms);
  const msg = (error || `${source} answered HTTP 429 (rate limited)`).slice(0, 500);
  await db.ingestionSourceHealth.upsert({
    where: { source }, create: { source, pausedUntil: until, lastFailureAt: new Date(), lastError: msg, lastErrorKind: 'http_429', lifetimeFailures: 1 },
    // A refused request is a failed request, so it joins the lifetime count — but not the consecutive one: being busy is not being broken.
    update: { pausedUntil: until, lastFailureAt: new Date(), lastError: msg, lastErrorKind: 'http_429', lifetimeFailures: { increment: 1 } },
  }).catch(() => {});
  await audit(null, 'SOURCE_RATE_LIMITED', { source, retryAfterMs: retryAfterMs ?? null, pausedUntil: until });
  return until;
}

export type Health = 'healthy' | 'degraded' | 'rate_limited' | 'cooling' | 'unavailable';

/**
 * How a source is behaving, from the one row everything writes (IngestionSourceHealth) — so a card, the engine and Quick
 * Import cannot disagree.
 *
 *   healthy       no recent failure
 *   degraded      failing, but not enough in a row to rest it yet (or resting is over and the next request is the test)
 *   rate_limited  answered HTTP 429; resting until the time it gave
 *   cooling       rested after repeated failures; retry is scheduled
 *   unavailable   rested again and again: it has been down for a while
 */
export async function sourceHealthState(source: string) {
  const row = await db.ingestionSourceHealth.findUnique({ where: { source } }).catch(() => null);
  const threshold = rotationConfig().failuresBeforeFallback;
  const failures: number = row?.consecutiveFailures ?? 0;
  const until: Date | null = row?.pausedUntil && row.pausedUntil.getTime() > Date.now() ? row.pausedUntil : null;
  const lastError: string | null = row?.lastError ?? null;
  const lastErrorKind: ErrorKind | null = isErrorKind(row?.lastErrorKind) ? row.lastErrorKind : null;
  let health: Health = 'healthy';
  // The last thing the source said decides how it reads: a 429 is "rate limited" whatever the count (older rows carry both), a long run of other failures is "unavailable".
  if (until) health = lastErrorKind === 'http_429' || /\b429\b/.test(lastError || '') ? 'rate_limited' : failures >= threshold * 2 ? 'unavailable' : 'cooling';
  else if (failures > 0) health = 'degraded';
  // Why it is not healthy, in words — only while it is not. After it recovers the old reason is history, not a state.
  const reason = failures > 0 || until ? (lastErrorKind ? ERROR_KIND_LABEL[lastErrorKind] : lastError ? safeError(lastError).slice(0, 120) : null) : null;
  return {
    health, until, failures, threshold, lastError, lastErrorKind, reason,
    lifetimeFailures: (row?.lifetimeFailures as number | undefined) ?? 0,
    /** The rest is over and the next request is the single test. */
    probeDue: failures >= threshold && !until,
    lastOkAt: (row?.lastOkAt as Date | null) ?? null, lastFailureAt: (row?.lastFailureAt as Date | null) ?? null,
  };
}

/**
 * GET a JSON document from a source (or, with `text`, the body as a string — OAI-PMH answers in XML; it comes back in `json`). Never throws. `source` defaults from the host.
 *
 * `timeoutMs` is not a nicety: a request with no deadline holds the whole pass open for ever.
 *
 * What it promises about a source that is failing:
 *   · while the source rests (`pausedUntil` in the future) NO request is made at all — it answers "paused" from the health row;
 *   · when the rest is over, ONE request is made (no retries) as the test, and only one caller at a time may make it: the test takes a short
 *     lease on the pause first, so two workers, or a Quick Import beside the engine, cannot both probe;
 *   · a probe that works clears the failures; one that fails extends the rest.
 *
 * `parse` runs on the body before the request is counted as a success, so a reply that arrived but is not usable (invalid XML, an OAI error,
 * a shape we do not know) is a failure of the source, not a success followed by an exception. `countClientErrors` is for a provider's own
 * feed address, where a 4xx means the feed is refusing us (blocked, moved), not that one record is missing.
 */
export async function fetchSourceJson(
  url: string, opts: {
    source?: string; timeoutMs?: number; headers?: Record<string, string>; attempts?: number; text?: boolean; encoding?: string; connectTimeoutMs?: number;
    parse?: (body: any) => any; countClientErrors?: boolean;
  } = {},
): Promise<SourceResult> {
  const source = opts.source || sourceFor(url);
  const row = await db.ingestionSourceHealth.findUnique({ where: { source } }).catch(() => null);
  const restingUntil: Date | null = row?.pausedUntil && row.pausedUntil.getTime() > Date.now() ? row.pausedUntil : null;
  const pausedAnswer = (until: Date | null): SourceResult => ({ ok: false, status: null, json: null, paused: true, transient: true, retryAt: until, errorKind: 'provider_unavailable', error: `${source} is paused after repeated failures; it will be tried again automatically` });
  if (restingUntil) return pausedAnswer(restingUntil);

  // The rest is over. A source that has been failing is asked ONCE, by one caller, before it is trusted with a full call again.
  const threshold = rotationConfig().failuresBeforeFallback;
  const probing = (row?.consecutiveFailures ?? 0) >= threshold;
  if (probing) {
    const lease = new Date(Date.now() + (opts.timeoutMs ?? 120_000) + 30_000);
    const took: { count: number } = await db.ingestionSourceHealth.updateMany({
      where: { source, consecutiveFailures: { gte: threshold }, OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }] },
      data: { pausedUntil: lease },
    }).catch(() => ({ count: 0 }));
    if (!took.count) return pausedAnswer(lease);                     // another caller is testing it right now
  }

  const attempts = probing ? 1 : Math.max(1, opts.attempts ?? 3);
  let last: SourceResult = { ok: false, status: null, json: null, transient: true, errorKind: 'unknown', error: 'no attempt made' };
  for (let i = 1; i <= attempts; i++) {
    // Where a dropped connection dropped: before the provider sent anything (a refused or filtered connection — usually the network path or
    // the provider turning this address away) or part-way through an answer it had begun (a slow or overloaded provider). Said in the error
    // so the screen can tell an operator which, without anyone having to reproduce it.
    let stage: 'before any response' | 'while reading the response' = 'before any response';
    try {
      const r = await httpFetch(url, { headers: opts.headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000) }, opts.connectTimeoutMs);
      stage = 'while reading the response';
      if (r.ok) {
        let body: any = opts.encoding ? new TextDecoder(opts.encoding).decode(await r.arrayBuffer()) : opts.text ? await r.text() : await r.json();
        if (opts.parse) body = opts.parse(body);
        await recordSourceOk(source);
        return { ok: true, status: r.status, json: body };
      }
      // HTTP 429 is answered once, here and now: read what the source asked for, set it aside until then, and hand back.
      // Asking again two more times only to reach a failure count is what kept an already-limited source limited.
      if (r.status === 429) {
        const retryMs = parseRetryAfter(r.headers?.get?.('retry-after'));
        const retryAt = await recordRateLimited(source, retryMs);
        return { ok: false, status: 429, json: null, transient: true, rateLimited: true, retryAt, errorKind: 'http_429', error: `${source} answered HTTP 429 (rate limited)` };
      }
      const transient = r.status >= 500;
      last = { ok: false, status: r.status, json: null, transient, errorKind: kindForStatus(r.status), error: `${source} answered HTTP ${r.status}` };
      if (!transient) {
        // A permanent answer. Usually one record's problem, not the source's — except at a provider's own feed address.
        if (opts.countClientErrors) { await recordSourceFailure(source, last.error!, 'http_4xx'); return last; }
        if (probing) await recordSourceOk(source);                  // it answered, so it is up
        return last;
      }
      if (i < attempts) await sleeper(1000 * 3 ** (i - 1));
    } catch (e: any) {
      const kind = classifyFailure(e);
      last = { ok: false, status: null, json: null, transient: true, errorKind: kind, error: describeError(e) + (kind === 'connection_reset' || kind === 'timeout' ? ` (${stage})` : '') };
      // A request that has already waited out its whole deadline is not worth repeating three times over, and a body that is not usable will not be better a second later.
      if (kind === 'timeout' || e instanceof SourceParseError) break;
      if (i < attempts) await sleeper(1000 * 3 ** (i - 1));
    }
  }
  await recordSourceFailure(source, last.error || 'failed', last.errorKind);
  return last;
}
