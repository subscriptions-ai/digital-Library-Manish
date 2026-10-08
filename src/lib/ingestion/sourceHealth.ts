import { ingestionDb as db } from './db.js';
import { INGESTION_POLICY, minutes } from './policy.js';
import { audit } from './audit.js';

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
  error?: string;
};

/** Replaceable so the engine can be exercised against a fake source. */
const realFetch = (url: string, init?: RequestInit) => fetch(url, init);
let httpFetch: (url: string, init?: RequestInit) => Promise<Response> = realFetch;
export function __useFetchForTests(f: ((url: string, init?: RequestInit) => Promise<Response>) | null) { httpFetch = f ?? realFetch; }
let sleeper = (ms: number) => new Promise(r => setTimeout(r, ms));
export function __useSleepForTests(f: ((ms: number) => Promise<any>) | null) { sleeper = f ?? ((ms: number) => new Promise(r => setTimeout(r, ms))); }

export function sourceFor(url: string): string {
  try {
    const h = new URL(url).hostname;
    if (h.endsWith('openalex.org')) return 'OpenAlex';
    if (h.endsWith('doaj.org')) return 'DOAJ';
    if (h.endsWith('doabooks.org')) return 'DOAB';
    if (h.endsWith('oapen.org')) return 'OAPEN';
    return h;
  } catch { return 'unknown'; }
}

export async function sourceStatus(source: string): Promise<{ paused: boolean; until: Date | null; failures: number }> {
  const row = await db.ingestionSourceHealth.findUnique({ where: { source } }).catch(() => null);
  const until: Date | null = row?.pausedUntil ?? null;
  return { paused: !!until && until.getTime() > Date.now(), until, failures: row?.consecutiveFailures ?? 0 };
}

export async function recordSourceOk(source: string) {
  await db.ingestionSourceHealth.upsert({
    where: { source }, create: { source, lastOkAt: new Date() },
    update: { consecutiveFailures: 0, pausedUntil: null, lastOkAt: new Date() },
  }).catch(() => {});
}

export async function recordSourceFailure(source: string, error: string) {
  const cfg = INGESTION_POLICY.breaker;
  const row = await db.ingestionSourceHealth.upsert({
    where: { source }, create: { source, consecutiveFailures: 1, lastFailureAt: new Date(), lastError: error.slice(0, 500) },
    update: { consecutiveFailures: { increment: 1 }, lastFailureAt: new Date(), lastError: error.slice(0, 500) },
  }).catch(() => null);
  const n = row?.consecutiveFailures ?? 0;
  if (n > 0 && n % cfg.failuresToOpen === 0) {
    const level = Math.min(cfg.pauseMinutes.length - 1, n / cfg.failuresToOpen - 1);
    const until = new Date(Date.now() + minutes(cfg.pauseMinutes[level]));
    await db.ingestionSourceHealth.update({ where: { source }, data: { pausedUntil: until } }).catch(() => {});
    await audit(null, 'SOURCE_PAUSED', { source, consecutiveFailures: n, pausedUntil: until, lastError: error.slice(0, 200) });
    return { opened: true, until };
  }
  return { opened: false, until: null as Date | null };
}

/**
 * GET a JSON document from a source. Never throws. `source` defaults from the host.
 *
 * `timeoutMs` is not a nicety: a request with no deadline holds the whole pass open for ever.
 */
export async function fetchSourceJson(
  url: string, opts: { source?: string; timeoutMs?: number; headers?: Record<string, string>; attempts?: number } = {},
): Promise<SourceResult> {
  const source = opts.source || sourceFor(url);
  const st = await sourceStatus(source);
  if (st.paused) return { ok: false, status: null, json: null, paused: true, transient: true, error: `${source} is paused after repeated failures; it will be tried again automatically` };

  const attempts = Math.max(1, opts.attempts ?? 3);
  let last: SourceResult = { ok: false, status: null, json: null, transient: true, error: 'no attempt made' };
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await httpFetch(url, { headers: opts.headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000) });
      if (r.ok) { const json = await r.json(); await recordSourceOk(source); return { ok: true, status: r.status, json }; }
      const transient = r.status === 429 || r.status >= 500;
      last = { ok: false, status: r.status, json: null, transient, error: `${source} answered HTTP ${r.status}` };
      if (!transient) return last;                                  // a permanent refusal: not the source's fault, not retried
      const ra = Number(r.headers?.get?.('retry-after'));
      if (i < attempts) await sleeper(Number.isFinite(ra) && ra > 0 ? Math.min(30_000, ra * 1000) : 1000 * 3 ** (i - 1));
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
