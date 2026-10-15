import { randomUUID } from 'node:crypto';
import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { harvestFeed, DOAB_OAI, OAPEN_OAI, OTL_FEED, type OaiProviderConfig, type HarvestReport } from './books/oaiHarvest.js';
import { fetchOpenAlexSourcesCursor, fetchCrossrefJournals, writeJournalCandidates } from './journalSources.js';
import { SourceError } from './articleSources.js';
import { sourceHealthState } from './sourceHealth.js';
import { tryLockProvider, unlockProvider } from './providerLocks.js';
import { totals, createRunWithStats, runColumnsFromStats } from './departmentStats.js';

/**
 * Bulk Catalogue Expansion — reading a whole source, in large steps, to grow the catalogue.
 *
 * It is a separate workflow from the continuous engine, and the separation is the point:
 *
 *   · Its places are its own. Every cursor lives in one setting row (`ingestion.bulk.v1`). It never reads, writes or advances a
 *     BookHarvestCheckpoint, a DepartmentSweep or a Journal cursor — the harvests run as MANUAL ones, which the harvester guarantees
 *     touch no checkpoint — so the continuous engine resumes exactly where it was, and a bulk run that is stopped, repeated or
 *     abandoned changes nothing it depends on.
 *   · The flow for every record is the one every record goes through:
 *       source page  →  normalise identifiers  →  dedupe (ISBN-13 → ISBN-10 → DOI/provider id → title+author+year; for journals
 *       ISSN-L → ISSN/eISSN → title+publisher)  →  rights and access (an unknown licence is Metadata Only, never Open Access)  →
 *       department classification (a code AND the title or subject wording must agree)  →  publish · review · metadata-only · skip.
 *     The "staging" between the source and the catalogue is the page in hand: it is read, normalised and judged completely before a
 *     single row is written, and a cursor moves only after the page it follows has been written. A repeat is therefore harmless,
 *     because the second sighting is a duplicate.
 *   · It is bounded: each run reads at most a stated number of records, at the source's polite pace, and refuses to ask a source that is
 *     resting (the same breaker as everything else). It grows the catalogue by what is VALID, never by what is merely found.
 *
 * Journals found by Crossref or OpenAlex are not open-access verified. They are written the one safe way (see journalSources.ts):
 * NeedsReview, "OA unverified", no licence — counted as Discovered and New, never as Published, until a person decides.
 */

export type BulkKind = 'books' | 'journals';
export type BulkSourceId = 'doab' | 'oapen' | 'otl' | 'openalex-sources' | 'crossref-journals';

type Def = { id: BulkSourceId; kind: BulkKind; label: string; healthKey: string; lock: string; cfg?: OaiProviderConfig; defaultRecords: number; maxRecords: number; note: string };
export const BULK_SOURCES: Def[] = [
  { id: 'doab', kind: 'books', label: 'DOAB — all books', healthKey: 'DOAB', lock: DOAB_OAI.provider, cfg: DOAB_OAI, defaultRecords: 2000, maxRecords: 10_000, note: 'Reads the whole DOAB book set, in order, with a position of its own.' },
  { id: 'oapen', kind: 'books', label: 'OAPEN — all books', healthKey: 'OAPEN', lock: OAPEN_OAI.provider, cfg: OAPEN_OAI, defaultRecords: 2000, maxRecords: 10_000, note: 'Matches what DOAB gave and adds titles nothing else holds.' },
  { id: 'otl', kind: 'books', label: 'Open Textbook Library — all textbooks', healthKey: 'open.umn.edu', lock: OTL_FEED.provider, cfg: OTL_FEED, defaultRecords: 500, maxRecords: 2500, note: 'About two thousand textbooks, ten to a page.' },
  { id: 'openalex-sources', kind: 'journals', label: 'OpenAlex — open-access-flagged journals', healthKey: 'OpenAlex', lock: 'OpenAlexSources', defaultRecords: 1000, maxRecords: 5000, note: 'Listed for review with open access UNVERIFIED. Nothing is published.' },
  { id: 'crossref-journals', kind: 'journals', label: 'Crossref — journal titles', healthKey: 'Crossref', lock: 'CrossrefJournals', defaultRecords: 1000, maxRecords: 5000, note: 'Listed for review with open access UNVERIFIED. Nothing is published.' },
];
export const isBulkSource = (v: unknown): v is BulkSourceId => BULK_SOURCES.some(s => s.id === v);

const KEY = 'ingestion.bulk.v1';
export type BulkCounters = { runs: number; discovered: number; checked: number; newRecords: number; duplicates: number; review: number; published: number; metadataOnly: number; rejected: number; failures: number };
type SourceState = { cursor: string | null; startedAt: string | null; lastRunAt: string | null; completedAt: string | null; counters: BulkCounters; lastError: string | null };
const zero = (): BulkCounters => ({ runs: 0, discovered: 0, checked: 0, newRecords: 0, duplicates: 0, review: 0, published: 0, metadataOnly: 0, rejected: 0, failures: 0 });
const blank = (): SourceState => ({ cursor: null, startedAt: null, lastRunAt: null, completedAt: null, counters: zero(), lastError: null });

async function load(): Promise<Record<string, SourceState>> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = row?.value as any;
  return v && typeof v === 'object' && v.sources ? v.sources : {};
}
async function save(sources: Record<string, SourceState>) {
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: { sources } as any, updatedBy: 'bulk' }, update: { value: { sources } as any, updatedBy: 'bulk' } }).catch(() => {});
}

let delayOverride: number | undefined;
/** Tests only: the pause between pages. */
export function __useBulkDelayForTests(ms: number | undefined) { delayOverride = ms; }

export type BulkResult = {
  source: BulkSourceId; label: string; kind: BulkKind;
  discovered: number; checked: number; newRecords: number; duplicates: number; review: number; published: number; metadataOnly: number; rejected: number; failures: number;
  completed: boolean; cursor: string | null; notes: string[]; stoppedBecause: string | null;
};

const resultOf = (d: Def): BulkResult => ({ source: d.id, label: d.label, kind: d.kind, discovered: 0, checked: 0, newRecords: 0, duplicates: 0, review: 0, published: 0, metadataOnly: 0, rejected: 0, failures: 0, completed: false, cursor: null, notes: [], stoppedBecause: null });
const dupTotal = (r: HarvestReport) => Object.values(r.duplicates).reduce((a, b) => a + b, 0);

export class BulkError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** One bounded bulk run of one source. Returns what it did; the source's own position moves only as far as it actually got. */
export async function runBulk(id: BulkSourceId, opts: { records?: number; admin?: any } = {}): Promise<BulkResult> {
  const def = BULK_SOURCES.find(s => s.id === id);
  if (!def) throw new BulkError('Unknown bulk source.');
  const records = Math.max(10, Math.min(opts.records ?? def.defaultRecords, def.maxRecords));
  const h = await sourceHealthState(def.healthKey);
  if (h.until) throw new BulkError(`${def.label.split(' — ')[0]} is resting until ${h.until.toISOString()}${h.reason ? ` (${h.reason})` : ''}. Bulk runs never ask a source that is resting.`, 429);
  if (!tryLockProvider(def.lock, 'manual')) throw new BulkError(`${def.label.split(' — ')[0]} is being worked on right now. Try again in a minute.`, 409);

  const sources = await load();
  const st = sources[id] ?? (sources[id] = blank());
  const res = resultOf(def);
  const t0 = Date.now();
  try {
    // A source that was read to its end starts again from the beginning (its cursor was cleared when it finished); one part-way carries on.
    if (!st.startedAt || st.completedAt) { st.startedAt = new Date().toISOString(); st.completedAt = null; }
    if (def.kind === 'books') await runBooks(def, st, records, res);
    else await runJournals(def, st, records, res);
    st.lastRunAt = new Date().toISOString();
    st.lastError = res.stoppedBecause;
    st.counters.runs += 1;
    for (const k of ['discovered', 'checked', 'newRecords', 'duplicates', 'review', 'published', 'metadataOnly', 'rejected', 'failures'] as const) st.counters[k] += res[k];
    await save(sources);
    // One line in the run log, like every other import, so growth can be told apart from what is simply held.
    await createRunWithStats({
      phase: def.kind === 'books' ? 'Books' : 'Journals', source: `Bulk · ${def.label.split(' — ')[0]}`, durationMs: Date.now() - t0, more: !res.completed,
      note: `Bulk expansion · ${res.discovered} read · ${res.newRecords} new · ${res.duplicates} already held · ${res.review} to review${res.stoppedBecause ? ` · stopped: ${res.stoppedBecause}` : ''}`.slice(0, 900),
      ...(def.kind === 'journals' ? { journalsSeen: res.checked, journalsAccepted: 0, journalsRefused: 0, needsReview: res.review, skippedHeld: res.duplicates } : {}),
      ...(def.kind === 'books' ? runColumnsFromStats(lastStats(res)) : {}),
    }, def.kind === 'books' ? lastStats(res) : null);
    await audit(opts.admin ?? null, 'BULK_SYNC_FINISHED', { source: id, discovered: res.discovered, newRecords: res.newRecords, duplicates: res.duplicates, review: res.review, completed: res.completed });
  } catch (e: any) {
    st.lastError = String(e?.message || e).slice(0, 300);
    await save(sources);
    await audit(opts.admin ?? null, 'BULK_SYNC_FAILED', { source: id, error: st.lastError });
    throw e;
  } finally { unlockProvider(def.lock, 'manual'); }
  return res;
}

// The department breakdown of the last books run, kept beside the result only for the run row.
const statsByResult = new WeakMap<BulkResult, any>();
const lastStats = (r: BulkResult) => statsByResult.get(r) ?? {};

async function runBooks(def: Def, st: SourceState, records: number, res: BulkResult) {
  const cfg = def.cfg!;
  // Pages in steps: the harvester reads `maxPages` pages per call, so a bulk run calls it until it has read enough or the source ends.
  let fetched = 0;
  const merged: Record<string, any> = {};
  while (fetched < records) {
    const report: HarvestReport = await harvestFeed(cfg, {
      manual: true, ignoreCheckpoint: true, startToken: st.cursor, from: null,
      maxRecords: Math.min(records - fetched, 500), maxPages: 25, pageDelayMs: delayOverride,
    });
    fetched += report.fetched;
    const t = totals(report.departmentStats);
    res.discovered += report.fetched; res.checked += report.fetched;
    res.newRecords += t.added + t.sentToReview; res.published += t.added; res.review += t.sentToReview; res.duplicates += dupTotal(report);
    res.rejected += t.skipped; res.failures += report.sourceError && !report.pages ? 1 : 0;
    res.metadataOnly += report.access.MetadataOnly;
    for (const [d, c] of Object.entries(report.departmentStats)) { const m = merged[d] ??= { added: 0, held: 0, sentToReview: 0, skipped: 0, failed: 0 }; for (const k of Object.keys(m)) m[k] += (c as any)[k]; }
    if (report.sourceError) { res.stoppedBecause = report.sourceError.slice(0, 160); if (!report.pages) break; }
    // The position moves only here, after the pages it follows were written.
    st.cursor = report.completed ? null : report.nextCursor;
    if (report.completed) { st.completedAt = new Date().toISOString(); res.completed = true; break; }
    if (!report.pages || report.fetched === 0) break;
    if (report.sourceError) break;
  }
  res.cursor = st.cursor;
  statsByResult.set(res, merged);
}

async function runJournals(def: Def, st: SourceState, records: number, res: BulkResult) {
  let seen = 0;
  while (seen < records) {
    try {
      let items; let next: string | null; let fetchedCount: number; let skipped: number;
      if (def.id === 'openalex-sources') {
        const p = await fetchOpenAlexSourcesCursor(st.cursor, 200);
        items = p.items; next = p.next; fetchedCount = p.fetched; skipped = p.skipped;
      } else {
        const offset = Number(st.cursor || 0) || 0;
        const p = await fetchCrossrefJournals('', offset, 100);
        items = p.items; fetchedCount = p.fetched; skipped = p.skipped;
        next = p.fetched >= 100 && offset + 100 < 10_000 ? String(offset + 100) : null;
      }
      const w = await writeJournalCandidates(def.id === 'openalex-sources' ? 'OpenAlex Sources' : 'Crossref Journals', null, items, fetchedCount, skipped);
      res.discovered += fetchedCount; res.checked += fetchedCount; res.newRecords += w.created; res.review += w.created; res.duplicates += w.held;
      res.rejected += w.skipped; res.failures += w.failed;
      seen += fetchedCount;
      // The position moves only after the page it follows was written.
      st.cursor = next;
      if (!next) { st.completedAt = new Date().toISOString(); res.completed = true; break; }
      if (!fetchedCount) break;
      await new Promise(r => setTimeout(r, delayOverride ?? 1000));
    } catch (e: any) {
      res.failures += 1;
      res.stoppedBecause = e instanceof SourceError ? `${e.message}`.slice(0, 160) : String(e?.message || e).slice(0, 160);
      break;
    }
  }
  res.cursor = st.cursor;
}

// ── Status and jobs ─────────────────────────────────────────────────────────

export async function bulkStatus() {
  const sources = await load();
  const out = [];
  for (const d of BULK_SOURCES) {
    const st = sources[d.id] ?? blank();
    const h = await sourceHealthState(d.healthKey);
    out.push({
      id: d.id, kind: d.kind, label: d.label, note: d.note, defaultRecords: d.defaultRecords, maxRecords: d.maxRecords,
      position: st.cursor, startedAt: st.startedAt, lastRunAt: st.lastRunAt, completedAt: st.completedAt, lastError: st.lastError, counters: st.counters,
      health: { state: h.health, until: h.until ? h.until.toISOString() : null, reason: h.reason },
      canRun: !h.until,
    });
  }
  return out;
}

export type BulkJob = { id: string; source: BulkSourceId; status: 'running' | 'done' | 'error'; startedAt: number; finishedAt?: number; result?: BulkResult; error?: string };
const jobs = new Map<string, BulkJob>();
export const getBulkJob = (id: string) => jobs.get(id) ?? null;
export const runningBulkJob = () => [...jobs.values()].find(j => j.status === 'running') ?? null;
export function __resetBulkForTests() { jobs.clear(); }

export async function beginBulk(source: BulkSourceId, records: number | undefined, admin: any): Promise<BulkJob> {
  if (runningBulkJob()) throw new BulkError('A bulk run is already in progress. Wait for it to finish.', 409);
  const def = BULK_SOURCES.find(s => s.id === source)!;
  if (records !== undefined && (!Number.isInteger(records) || records < 10 || records > def.maxRecords)) throw new BulkError(`Records must be a whole number between 10 and ${def.maxRecords}.`);
  const job: BulkJob = { id: randomUUID(), source, status: 'running', startedAt: Date.now() };
  jobs.set(job.id, job);
  await audit(admin ?? null, 'BULK_SYNC_STARTED', { source, records: records ?? def.defaultRecords });
  (async () => {
    try { Object.assign(job, { status: 'done', result: await runBulk(source, { records, admin }), finishedAt: Date.now() }); }
    catch (e: any) { Object.assign(job, { status: 'error', error: String(e?.message || e).slice(0, 300), finishedAt: Date.now() }); }
  })();
  return job;
}
