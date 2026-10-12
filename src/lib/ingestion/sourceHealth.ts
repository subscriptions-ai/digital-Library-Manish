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

export type SourceResult = {
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

export async function recordSourceFailure(source: string, error: string) {
  const cfg = INGESTION_POLICY.breaker;
  // The third consecutive failure (INGESTION_FAILURES_BEFORE_FALLBACK) opens the breaker, not the fifth: the engine
  // moves to the next source at that point instead of asking a failing one two more times.
  const threshold = rotationConfig().failuresBeforeFallback;
  const row = await db.ingestionSourceHealth.upsert({
    where: { source }, create: { source, consecutiveFailures: 1, lastFailureAt: new Date(), lastError: error.slice(0, 500) },
    update: { consecutiveFailures: { increment: 1 }, lastFailureAt: new Date(), lastError: error.slice(0, 500) },
  }).catch(() => null);
  const n = row?.consecutiveFailures ?? 0;
  // From the threshold on, every failed request rests the source again, one level longer each time: the first rest ends, the
  // next request is the test, and if that fails too the source does not get two more free tries.
  if (n >= threshold) {
    const level = Math.min(cfg.pauseMinutes.length - 1, n - threshold);
    const until = new Date(Date.now() + minutes(cfg.pauseMinutes[level]));
    await db.ingestionSourceHealth.update({ where: { source }, data: { pausedUntil: until } }).catch(() => {});
    await audit(null, 'SOURCE_PAUSED', { source, consecutiveFailures: n, pausedUntil: until, lastError: error.slice(0, 200) });
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
    where: { source }, create: { source, pausedUntil: until, lastFailureAt: new Date(), lastError: msg },
    update: { pausedUntil: until, lastFailureAt: new Date(), lastError: msg },
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
  let health: Health = 'healthy';
  // The last thing the source said decides how it reads: a 429 is "rate limited" whatever the count (older rows carry both), a long run of other failures is "unavailable".
  if (until) health = /\b429\b/.test(lastError || '') ? 'rate_limited' : failures >= threshold * 2 ? 'unavailable' : 'cooling';
  else if (failures > 0) health = 'degraded';
  return { health, until, failures, threshold, lastError, lastOkAt: (row?.lastOkAt as Date | null) ?? null, lastFailureAt: (row?.lastFailureAt as Date | null) ?? null };
}

/**
 * GET a JSON document from a source (or, with `text`, the body as a string — OAI-PMH answers in XML; it comes back in `json`). Never throws. `source` defaults from the host.
 *
 * `timeoutMs` is not a nicety: a request with no deadline holds the whole pass open for ever.
 */
export async function fetchSourceJson(
  url: string, opts: { source?: string; timeoutMs?: number; headers?: Record<string, string>; attempts?: number; text?: boolean; encoding?: string; connectTimeoutMs?: number } = {},
): Promise<SourceResult> {
  const source = opts.source || sourceFor(url);
  const st = await sourceStatus(source);
  if (st.paused) return { ok: false, status: null, json: null, paused: true, transient: true, retryAt: st.until, error: `${source} is paused after repeated failures; it will be tried again automatically` };

  const attempts = Math.max(1, opts.attempts ?? 3);
  let last: SourceResult = { ok: false, status: null, json: null, transient: true, error: 'no attempt made' };
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await httpFetch(url, { headers: opts.headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000) }, opts.connectTimeoutMs);
      if (r.ok) { const json = opts.encoding ? new TextDecoder(opts.encoding).decode(await r.arrayBuffer()) : opts.text ? await r.text() : await r.json(); await recordSourceOk(source); return { ok: true, status: r.status, json }; }
      // HTTP 429 is answered once, here and now: read what the source asked for, set it aside until then, and hand back.
      // Asking again two more times only to reach a failure count is what kept an already-limited source limited.
      if (r.status === 429) {
        const retryMs = parseRetryAfter(r.headers?.get?.('retry-after'));
        const retryAt = await recordRateLimited(source, retryMs);
        return { ok: false, status: 429, json: null, transient: true, rateLimited: true, retryAt, error: `${source} answered HTTP 429 (rate limited)` };
      }
      const transient = r.status >= 500;
      last = { ok: false, status: r.status, json: null, transient, error: `${source} answered HTTP ${r.status}` };
      if (!transient) return last;                                  // a permanent refusal: not the source's fault, not retried
      if (i < attempts) await sleeper(1000 * 3 ** (i - 1));
    } catch (e: any) {
      last = { ok: false, status: null, json: null, transient: true, error: String(e?.message || e) };
      // A request that has already waited out its whole deadline is not worth repeating three times over.
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') break;
      if (i < attempts) await sleeper(1000 * 3 ** (i - 1));
    }
  }
  await recordSourceFailure(source, last.error || 'failed');
  return last;
}
