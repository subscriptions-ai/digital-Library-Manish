import { createHash } from 'node:crypto';
import { fetchRaw, parseRetryAfter, sourceHealthState } from '../sourceHealth.js';
import { parseOaiPage, type OaiPage, type OaiRecord } from '../books/oaiXml.js';
import { OAPEN_OAI } from '../books/oaiHarvest.js';
import { BackfillError, BackfillStop, BackfillWait, type JobView, type Page } from './types.js';

/**
 * Reading OAPEN's OAI-PMH feed for a historical backfill. Read docs/oapen-backfill-audit-2026-10.md.
 *
 * This is the backfill's OWN reader. It does not go through fetchSourceJson and it never writes the provider's health row (IngestionSourceHealth): a backfill is a guest of the
 * continuous engine's circuit breaker. It READS that row before every request and, if OAPEN is resting or the engine is about to re-test it, waits (BackfillWait) instead of asking.
 * It never touches BookHarvestCheckpoint, whose `cursor` is the continuous harvest's resumption token.
 *
 * The checkpoint is the job's own: {"v":2,"id":<source identity>,"t":<resumption token of the page that holds the NEWEST record read, '' for the first page>,"p":<token of the page before it, or null>,
 * "a":[the handles of the last three records read, newest first]}. OAPEN's token is stateless (xoai/<from>/<until>/<set>/<offset>) so it can be requested again at any time.
 *
 * NO RECORD IS SKIPPED, even when OAPEN changes under a running job. A token is only an OFFSET, and a record that changes at OAPEN after the job's closing time leaves the closed list, which
 * moves every later record one place towards the front: resuming by offset would then jump over the one that moved into the gap. So the position is never an offset; it is a RECORD:
 *   · a chunk resumes by re-reading the page that holds the last record it read and continuing AFTER that record, found by its handle (not by its index). If it has moved onto the page before
 *     (`p`) it is found there. If none of the last three records can be found on either page, the job STOPS (OAPEN_FEED_CHANGED, checkpoint kept) — it never guesses;
 *   · when a chunk moves from page k to page k+1 it then re-reads page k and compares the records on it with what it read. If they differ, something left the list in between and a record may have
 *     moved from k+1 into k's tail: it takes the fresh page k, continues after its last record from the anchor, and tries again;
 *   · the read is therefore AT-LEAST-ONCE (a record may be looked at twice — judged again, and found held, so counted as a duplicate) and the write is idempotent. A record that left the list before it
 *     was read is not in the closed list any more; the continuous harvest will see it as changed.
 *   BACKFILL_OAPEN_ENABLED                   must be "true"/"1" for the adapter to be available at all (deployment-time). Default off.
 *   BACKFILL_OAPEN_REQUEST_GAP_MS            least time between two requests to OAPEN. Default 1000.
 *   BACKFILL_OAPEN_MAX_PAGES_PER_CHUNK       OAI pages one chunk may move forward through (a window that matches few records would otherwise scan the feed). Default 5.
 *   BACKFILL_OAPEN_TIMEOUT_MS                one request's deadline. Default 60000.
 */

export const oapenBackfillEnabled = () => ['true', '1'].includes(String(process.env.BACKFILL_OAPEN_ENABLED ?? '').toLowerCase());
const envInt = (key: string, fallback: number, min: number, max: number) => { const raw = process.env[key]; const v = raw === undefined || raw === '' ? NaN : Number(raw); return Number.isInteger(v) && v >= min && v <= max ? v : fallback; };
const gapMs = () => envInt('BACKFILL_OAPEN_REQUEST_GAP_MS', 1000, 0, 60_000);
const maxPages = () => envInt('BACKFILL_OAPEN_MAX_PAGES_PER_CHUNK', 5, 1, 50);
const MAX_RESTARTS = 5;
const timeoutMs = () => envInt('BACKFILL_OAPEN_TIMEOUT_MS', 60_000, 1000, 600_000);
const MAX_BODY = 30 * 1024 * 1024;          // a real page of 100 records is about 1 MB

export const OAPEN_HEALTH_KEY = OAPEN_OAI.provider;       // 'OAPEN': the continuous engine's key, READ here, never written

/** The settings that decide what a job reads from the feed, validated. `from` / `until` are OAI datestamps (when a record last CHANGED at OAPEN), not publication dates. */
export function oapenParams(a: Record<string, any> | undefined): { from: string | null; until: string | null } {
  const stamp = (v: unknown, name: string, end: boolean) => {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const d = new Date(`${s}T00:00:00Z`); if (!isNaN(d.getTime()) && d.toISOString().startsWith(s)) return `${s}T${end ? '23:59:59' : '00:00:00'}Z`; }
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s) && !isNaN(new Date(s).getTime())) return s;
    throw new BackfillError('BAD_ADAPTER_CONFIG', `${name} must be a date (YYYY-MM-DD) or a UTC time (YYYY-MM-DDThh:mm:ssZ).`);
  };
  const from = stamp(a?.modifiedFrom, 'Changed since', false), until = stamp(a?.modifiedUntil, 'Changed until', true);
  if (from && until && from > until) throw new BackfillError('BAD_ADAPTER_CONFIG', '"Changed since" must be on or before "Changed until".');
  return { from, until };
}

/** What the job reads, as a short deterministic string: the same for a preview and the job started from it, and for every page of one job. No network, no clock. */
export function oapenIdentity(a: Record<string, any> | undefined): string {
  const p = oapenParams(a);
  return createHash('sha256').update(JSON.stringify(['oapen-oai', OAPEN_OAI.baseUrl, OAPEN_OAI.set, OAPEN_OAI.metadataPrefix, p.from, p.until])).digest('hex').slice(0, 24);
}

type Cursor = { v: 2; id: string; t: string; p: string | null; a: string[] };
const cursorOf = (c: Cursor) => JSON.stringify(c);
function parseCursor(s: string): Cursor {
  try {
    const c = JSON.parse(s);
    const tok = (x: unknown) => typeof x === 'string' && x.length <= 500;
    if (c?.v === 2 && typeof c.id === 'string' && tok(c.t) && (c.p === null || tok(c.p)) && Array.isArray(c.a) && c.a.length <= 3 && c.a.every((h: unknown) => typeof h === 'string' && h.length > 0 && h.length <= 200)) return c;
  } catch { /* below */ }
  throw new BackfillStop('OAPEN_BAD_CURSOR', 'The saved checkpoint is not an OAPEN checkpoint.');
}

/** The OAI request for a page: the first page by query (set, format, the job's change window), every later one by the resumption token the previous page returned. */
export function oapenUrl(job: Pick<JobView, 'createdAt' | 'adapter'>, token: string | null): string {      // '' or null = the first page
  if (token) return `${OAPEN_OAI.baseUrl}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
  const p = oapenParams(job.adapter);
  // The list is closed at the moment the job was created (or earlier, if the person asked), so what changes at OAPEN later cannot grow it under a running job.
  const created = job.createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const until = p.until && p.until < created ? p.until : created;
  return `${OAPEN_OAI.baseUrl}?verb=ListRecords&metadataPrefix=${OAPEN_OAI.metadataPrefix}&set=${encodeURIComponent(OAPEN_OAI.set)}${p.from ? `&from=${encodeURIComponent(p.from)}` : ''}&until=${encodeURIComponent(until)}`;
}

let lastRequestAt = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One OAI request. Reads OAPEN's health row first; never writes it. */
async function oaiGet(url: string): Promise<{ page: OaiPage; bytes: number }> {
  const h = await sourceHealthState(OAPEN_HEALTH_KEY);
  if (h.until) throw new BackfillWait(`OAPEN is resting after errors (${h.reason || h.health}); the backfill waits for it to recover.`, h.until.getTime());
  // The engine re-tests a source with ONE request when its rest is over. A backfill is never that request.
  if (h.probeDue) throw new BackfillWait('OAPEN is about to be re-tested by the continuous engine; the backfill waits for that result.', Date.now() + 60_000);

  const wait = lastRequestAt + gapMs() - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  let res: Response;
  try {
    res = await fetchRaw(url, { headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})`, Accept: 'text/xml,application/xml' }, signal: AbortSignal.timeout(timeoutMs()) });
  } catch (e: any) { throw new Error(`OAPEN did not answer: ${e?.name === 'TimeoutError' ? 'timed out' : String(e?.message || e).slice(0, 160)}`); }
  if (res.status === 429 || res.status === 503) {
    const ra = parseRetryAfter(res.headers?.get?.('retry-after'));
    // Exactly as long as it asked (bounded), or five minutes when it did not say.
    throw new BackfillWait(`OAPEN answered HTTP ${res.status}${ra != null ? ` and asked for ${Math.ceil(ra / 1000)} s` : ''}; the backfill waits.`, Date.now() + (ra != null ? Math.min(15 * 60_000, Math.max(1000, ra)) : 5 * 60_000));
  }
  if (!res.ok) throw new Error(`OAPEN answered HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_BODY) throw new Error('OAPEN sent a page larger than the safety limit');
  let page: OaiPage;
  try { page = parseOaiPage(body); } catch { throw new Error('OAPEN sent a reply that is not valid OAI-PMH XML'); }
  if (!page.error && !page.records.length && !/<OAI-PMH[\s>]/.test(body.slice(0, 2000))) throw new Error('OAPEN sent a reply that is not an OAI-PMH document');
  return { page, bytes: Buffer.byteLength(body) };
}

const dc = (r: OaiRecord, key: string) => r.meta.get(key)?.[0] ?? null;
/** The earliest and latest day a "published" value can mean: a year is the whole year, a month the whole month. */
export function publicationRange(v: string | null): [string, string] | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(v ?? '').trim());
  if (!m) return null;
  const y = m[1], mo = m[2], d = m[3];
  if (d && mo) return [`${y}-${mo}-${d}`, `${y}-${mo}-${d}`];
  if (mo) { const last = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate(); return [`${y}-${mo}-01`, `${y}-${mo}-${String(last).padStart(2, '0')}`]; }
  return [`${y}-01-01`, `${y}-12-31`];
}

const handleOf = (r: OaiRecord) => r.handle || r.identifier;
/** What a page holds, as the framework identifies it: the handles in order. Two reads of the same page of an unchanged list are equal. */
const fingerprint = (p: OaiPage) => p.records.map(handleOf).join('|');
/** Where the newest of `anchors` (newest first) is on this page, or -1. A newer anchor that has left the list is passed over for an older one. */
const anchorIndex = (p: OaiPage, anchors: string[]): number => { for (const a of anchors) { const i = p.records.findIndex(r => handleOf(r) === a); if (i >= 0) return i; } return -1; };

/**
 * Read from `cursor` until `limit` relevant records are found, the feed ends, or the page allowance is used. Not relevant — counted, never returned — are deletion notices, records with no
 * title, and records outside the job's publication period. See the header for why the position is a record and never an offset.
 */
export async function readOapen(job: JobView, cursor: string | null, limit: number): Promise<Page<OaiRecord>> {
  const id = oapenIdentity(job.adapter);
  if (!cursor && job.identity && job.identity !== id) throw new BackfillStop('OAPEN_SOURCE_CHANGED', 'The OAPEN source settings are not the ones this job was created with.');
  const cur: Cursor = cursor ? parseCursor(cursor) : { v: 2, id, t: '', p: null, a: [] };
  if (cur.id !== id) throw new BackfillStop('OAPEN_SOURCE_CHANGED', 'The OAPEN source settings are not the ones this job\'s checkpoint was taken with. The checkpoint was kept; start a new job (with a new preview).');

  const from = job.windowStart ? job.windowStart.toISOString().slice(0, 10) : null, to = job.windowEnd ? job.windowEnd.toISOString().slice(0, 10) : null;
  const records: OaiRecord[] = [];
  const meta = { requests: 0, pages: 0, scanned: 0, deleted: 0, unusable: 0, outsideWindow: 0, noDate: 0, rewound: 0, reread: 0 };
  let bytes = 0;

  /** One page by its token ('' = the first). An empty list is an empty page; a token OAPEN refuses stops the job. */
  const get = async (tok: string): Promise<OaiPage> => {
    const got = await oaiGet(oapenUrl(job, tok || null)); meta.requests++; bytes += got.bytes;
    const e = got.page.error;
    if (e) {
      if (e.code === 'noRecordsMatch') return { records: [], resumptionToken: null, completeListSize: null, error: null };
      if (e.code === 'badResumptionToken') throw new BackfillStop('OAPEN_TOKEN_REJECTED', 'OAPEN no longer accepts this job\'s resumption token. The checkpoint was kept; start a new job (with a new preview).');
      throw new Error(`OAPEN OAI error ${e.code}${e.message ? `: ${e.message}` : ''}`);
    }
    return got.page;
  };

  // The last records read, newest first. At the start there are none.
  const anchors: string[] = [...cur.a];
  let tokNow = cur.t, tokPrev = cur.p, page: OaiPage, start = 0;

  /** Put the read position AFTER the newest anchor, on `tok`'s page or — if it has moved there — on the page before. Uses `preloaded` instead of asking again. Stops when it cannot be found. */
  const settle = async (tok: string, prev: string | null, preloaded?: OaiPage) => {
    const pg = preloaded ?? await get(tok);
    if (!anchors.length) { tokNow = tok; tokPrev = prev; page = pg; start = 0; return; }
    const k = anchorIndex(pg, anchors);
    if (k >= 0) { tokNow = tok; tokPrev = prev; page = pg; start = k + 1; return; }
    if (prev !== null) {
      const pp = await get(prev); const k2 = anchorIndex(pp, anchors);
      if (k2 >= 0) { meta.rewound++; tokNow = prev; tokPrev = null; page = pp; start = k2 + 1; return; }
    }
    throw new BackfillStop('OAPEN_FEED_CHANGED', `OAPEN\'s list changed under this job: none of the last ${anchors.length} records read could be found again on the page they were on or the one before. Nothing was skipped or written for it; the checkpoint was kept. Start a new job (with a new preview) — it is idempotent.`);
  };

  await settle(tokNow, tokPrev);
  let advanced = 0, restarts = 0, next: string | null;
  meta.pages = 1;
  for (;;) {
    let i = start;
    for (; i < page!.records.length && records.length < limit; i++) {
      const r = page!.records[i]; meta.scanned++;
      anchors.unshift(handleOf(r)); if (anchors.length > 3) anchors.pop();
      if (r.deleted) { meta.deleted++; continue; }
      if (!dc(r, 'dc.title')?.trim()) { meta.unusable++; continue; }
      if (from || to) {
        const range = publicationRange(dc(r, 'dc.date.issued'));
        if (!range) { meta.noDate++; continue; }
        if ((to && range[0] > to) || (from && range[1] < from)) { meta.outsideWindow++; continue; }
      }
      records.push(r);
    }
    const here: Cursor = { v: 2, id, t: tokNow, p: tokPrev, a: [...anchors] };
    if (i < page!.records.length) { next = cursorOf(here); break; }                      // ended inside the page: the next chunk resumes after the last record read
    const nextTok = page!.resumptionToken;
    if (!nextTok) { next = null; break; }                                                // that was the last page
    if (records.length >= limit || advanced >= maxPages()) { next = cursorOf(here); break; }
    // Move to the next page — and prove nothing left the list in between: read this page again and compare.
    const np = await get(nextTok); advanced++;
    const again = await get(tokNow);
    if (fingerprint(again) !== fingerprint(page!)) {
      if (++restarts > MAX_RESTARTS) throw new Error('OAPEN\'s list kept changing while it was being read; trying again later');
      meta.reread++; advanced--;
      await settle(tokNow, tokPrev, again);                                              // the fresh page: continue after the last record read, which picks up whatever moved into its tail
      continue;
    }
    tokPrev = tokNow; tokNow = nextTok; page = np; start = 0; meta.pages++;
  }
  return { records, nextCursor: next, bytes, meta };
}

/** What the screen shows for this source: one Identify request, never part of creating a job. */
export async function describeOapen(): Promise<{ summary: string; details: Record<string, string | number> }> {
  const h = await sourceHealthState(OAPEN_HEALTH_KEY);
  let name = 'OAPEN Library', granularity = '';
  try {
    const res = await fetchRaw(`${OAPEN_OAI.baseUrl}?verb=Identify`, { headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` }, signal: AbortSignal.timeout(20_000) });
    if (res.ok) { const x = await res.text(); name = /<repositoryName>([^<]*)</.exec(x)?.[1] || name; granularity = /<granularity>([^<]*)</.exec(x)?.[1] || ''; }
    else name = `${name} (HTTP ${res.status})`;
  } catch (e: any) { name = `${name} (did not answer: ${String(e?.message || e).slice(0, 80)})`; }
  return {
    summary: `${name} · OAI-PMH, set Books, ${OAPEN_OAI.metadataPrefix} format · provider ${h.health}`,
    details: { endpoint: OAPEN_OAI.baseUrl, set: OAPEN_OAI.set, format: OAPEN_OAI.metadataPrefix, granularity, health: h.health },
  };
}

export const __resetOapenThrottle = () => { lastRequestAt = 0; };
