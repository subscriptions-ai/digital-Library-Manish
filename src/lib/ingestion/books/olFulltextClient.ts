import { matchFromEdition, matchFromWork, parseIa, type IaItem, type Match } from './olFulltext.js';

/**
 * The two public, read-only APIs the full-text eligibility audit asks — Open Library and the Internet Archive — through ONE polite client:
 *
 *   · bounded: a hard request budget; keys are asked for in batches of at most 20; nothing is downloaded but small JSON (never a book file);
 *   · rate-limited: at least `gapMs` (default 1.1 s) between the start of any two requests; a 429 or a Retry-After is waited out (capped), never hammered;
 *   · retried with backoff on timeouts, network errors and 5xx — a few times — and then given up on for THAT request, which is reported (never guessed at);
 *   · stopped: after `breakAfter` failures in a row the source is treated as down and the remaining requests are not made (the run reports itself incomplete);
 *   · named: the User-Agent says who we are and how to reach us, as both services ask.
 *
 * It deliberately does NOT use the engine's source-health bookkeeping (sourceHealth.ts): an audit must not pause, resume, count against or otherwise change a provider the
 * continuous engine depends on. The transport and the sleeper are injectable so the tests never touch the network and never really wait.
 */

export type Reply = { status: number; headers: { get(name: string): string | null }; json(): Promise<any> };
export type Transport = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Reply>;
export type ClientOpts = {
  transport?: Transport; sleep?: (ms: number) => Promise<void>; now?: () => number;
  gapMs?: number; maxRequests?: number; maxAttempts?: number; maxWaitMs?: number; timeoutMs?: number; breakAfter?: number; contact?: string;
};
export type Got = { ok: boolean; data?: any; kind?: 'notFound' | 'unavailable' | 'budget' | 'stopped'; status?: number };
export type Counters = { requests: number; retries: number; rateLimited: number; failures: number; notFound: number; waitedMs: number; budgetHit: boolean; stopped: boolean };

const OL = 'https://openlibrary.org', IA = 'https://archive.org';
export const BATCH = 20;

const defaultTransport: Transport = (url, init) => fetch(url, init) as any;

export class OlClient {
  readonly c: Counters = { requests: 0, retries: 0, rateLimited: 0, failures: 0, notFound: 0, waitedMs: 0, budgetHit: false, stopped: false };
  private o: Required<Omit<ClientOpts, 'contact'>> & { contact: string };
  private last = -Infinity; private consecutive = 0;
  constructor(o: ClientOpts = {}) {
    this.o = {
      transport: o.transport ?? defaultTransport, sleep: o.sleep ?? (ms => new Promise(r => setTimeout(r, ms))), now: o.now ?? Date.now,
      gapMs: Math.max(0, o.gapMs ?? 1100), maxRequests: Math.max(1, o.maxRequests ?? 400), maxAttempts: Math.max(1, o.maxAttempts ?? 3), maxWaitMs: o.maxWaitMs ?? 60_000,
      timeoutMs: o.timeoutMs ?? 30_000, breakAfter: Math.max(1, o.breakAfter ?? 5), contact: o.contact ?? process.env.OPENALEX_CONTACT ?? 'info@celnet.in',
    };
  }
  get remaining() { return Math.max(0, this.o.maxRequests - this.c.requests); }
  get limits() { return { gapMs: this.o.gapMs, maxRequests: this.o.maxRequests, maxAttempts: this.o.maxAttempts, batch: BATCH }; }

  private async pace() {
    const wait = this.last + this.o.gapMs - this.o.now();
    if (wait > 0) { this.c.waitedMs += wait; await this.o.sleep(wait); }
    this.last = this.o.now();
  }
  private retryAfterMs(r: Reply): number | null {
    const h = r.headers.get('retry-after'); if (!h) return null;
    if (/^\d+$/.test(h.trim())) return Number(h) * 1000;
    const t = Date.parse(h); return Number.isFinite(t) ? Math.max(0, t - this.o.now()) : null;
  }

  /** One GET of JSON, politely. Never throws. */
  async getJson(url: string): Promise<Got> {
    if (this.c.stopped) return { ok: false, kind: 'stopped' };
    for (let attempt = 1; attempt <= this.o.maxAttempts; attempt++) {
      if (this.c.stopped) return { ok: false, kind: 'stopped' };
      if (this.c.requests >= this.o.maxRequests) { this.c.budgetHit = true; return { ok: false, kind: 'budget' }; }
      await this.pace(); this.c.requests++;
      let reply: Reply | null = null; let why = '';
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), this.o.timeoutMs);
      try { reply = await this.o.transport(url, { headers: { 'User-Agent': `STM Digital Library (mailto:${this.o.contact})`, Accept: 'application/json' }, signal: ac.signal }); } catch (e: any) { why = e?.name === 'AbortError' ? 'timeout' : 'network'; this.note(); } finally { clearTimeout(timer); }
      if (reply) {
        if (reply.status === 404) { this.c.notFound++; this.consecutive = 0; return { ok: false, kind: 'notFound', status: 404 }; }
        if (reply.status === 429) {
          this.c.rateLimited++; const w = Math.min(this.retryAfterMs(reply) ?? 5000 * attempt, this.o.maxWaitMs); this.note();
          if (attempt < this.o.maxAttempts && !this.c.stopped) { this.c.retries++; this.c.waitedMs += w; await this.o.sleep(w); this.last = this.o.now(); continue; }
          why = '429';
        } else if (reply.status >= 500) { why = `http ${reply.status}`; this.note(); }
        else if (reply.status >= 400) { this.fail(); return { ok: false, kind: 'unavailable', status: reply.status }; }
        else {
          try { const data = await reply.json(); this.consecutive = 0; return { ok: true, data }; } catch { why = 'unreadable'; this.note(); }
        }
      }
      if (attempt < this.o.maxAttempts && !this.c.stopped) { this.c.retries++; const w = Math.min(1000 * 2 ** (attempt - 1), this.o.maxWaitMs); this.c.waitedMs += w; await this.o.sleep(w); this.last = this.o.now(); continue; }
      this.fail(); return { ok: false, kind: 'unavailable', status: reply?.status };
    }
    this.fail(); return { ok: false, kind: 'unavailable' };
  }
  /** One failed attempt; `breakAfter` of them in a row and the source is treated as down. */
  private note() { if (++this.consecutive >= this.o.breakAfter) this.c.stopped = true; }
  private fail() { this.c.failures++; }

  /**
   * Editions by `OLID:OL…M` or `ISBN:…` keys, at most BATCH to a request. Returns key → match (absent: Open Library does not know it) and the keys whose request failed.
   */
  async editions(keys: string[]): Promise<{ found: Map<string, Match>; failed: Set<string> }> {
    const found = new Map<string, Match>(); const failed = new Set<string>();
    for (let i = 0; i < keys.length; i += BATCH) {
      const part = keys.slice(i, i + BATCH);
      const r = await this.getJson(`${OL}/api/books?bibkeys=${encodeURIComponent(part.join(','))}&format=json&jscmd=data`);
      if (!r.ok) { if (r.kind !== 'notFound') part.forEach(k => failed.add(k)); continue; }
      for (const k of part) { const e = r.data?.[k]; if (e && typeof e === 'object') found.set(k, matchFromEdition(e, k.startsWith('OLID:') ? 'edition' : 'isbn')); }
    }
    return { found, failed };
  }
  /** Works by key (`OL…W`), at most BATCH to a request. */
  async works(keys: string[]): Promise<{ found: Map<string, Match>; failed: Set<string> }> {
    const found = new Map<string, Match>(); const failed = new Set<string>();
    for (let i = 0; i < keys.length; i += BATCH) {
      const part = keys.slice(i, i + BATCH);
      const q = `key:(${part.map(k => `"/works/${k}"`).join(' OR ')})`;
      const r = await this.getJson(`${OL}/search.json?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('key,ebook_access,ia,public_scan_b,isbn')}&limit=${BATCH}`);
      if (!r.ok) { if (r.kind !== 'notFound') part.forEach(k => failed.add(k)); continue; }
      for (const d of Array.isArray(r.data?.docs) ? r.data.docs : []) { const k = /(OL\d+W)/.exec(String(d?.key ?? ''))?.[1]; if (k && part.includes(k)) found.set(k, matchFromWork(d)); }
    }
    return { found, failed };
  }
  /** One Internet Archive item's metadata: the item, null if the Archive has no such item, 'error' if it could not be read. */
  async archiveItem(ocaid: string): Promise<IaItem | null | 'error'> {
    const r = await this.getJson(`${IA}/metadata/${encodeURIComponent(ocaid)}`);
    if (r.ok) { const ia = parseIa(r.data); return ia ?? null; }       // the Archive answers {} for an unknown identifier
    return r.kind === 'notFound' ? null : 'error';
  }
}
