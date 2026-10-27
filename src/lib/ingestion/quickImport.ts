import { ingestionDb as db } from './db.js';
import { articleMinYear } from './yearPolicy.js';
import { audit } from './audit.js';
import { INGESTION_POLICY } from './policy.js';
import { tryLockProvider, unlockProvider, providerHolder } from './providerLocks.js';
import { fetchSourceJson, sourceCooldown, sourceHealthState } from './sourceHealth.js';
import { type Candidate } from './importService.js';
import { judgeVerifyWrite } from './articlePipeline.js';
import { createRunWithStats, runColumnsFromStats, totals, bump, type DeptStats } from './departmentStats.js';
import { fetchCrossrefJournals, fetchOpenAlexSources, writeJournalCandidates, type JournalPage } from './journalSources.js';
import { rotationStatus, getProviders } from './rotation.js';
import { searchTermsFor } from '../ingestionWorker.js';
import { ensureProviders, getRoadAdapter } from './engine.js';
import {
  SourceError, articlePause, checkFiles, fetchArxiv, fetchCrossrefForJournal, fetchEuropePmc, fetchOpenAlexForJournal, type RawCandidate,
} from './articleSources.js';
import { harvestFeed, harvestDiagnostics, DOAB_OAI, OAPEN_OAI, OTL_FEED, NCBI_FEED, CROSSREF_BOOKS_FEED, NLM_FEED, PRESSBOOKS_FEED, type OaiProviderConfig, type HarvestReport } from './books/oaiHarvest.js';
import { ncbiLimits, usedToday } from './books/ncbi.js';
import { checkDoajCatalogue, importCheckedJournals, DOAJ_CSV_URL, type DoajBreakdown } from '../doajCatalogue.js';
import { saveInspection } from './doajInspection.js';
import { getState } from '../ingestionWorker.js';
import { DOMAINS } from '../../constants.js';

/**
 * Quick Import: a bounded batch from one source, started by hand.
 *
 * It is an ADDITIONAL path, not a replacement for the continuous engine. It is for the day the engine is slow,
 * paused, rate limited or simply not fetching enough, and an administrator wants fresh material now.
 *
 * What it shares with the engine, on purpose and without a second copy: every normaliser, the deduplication, the
 * department classifier, the licence and access rules, the circuit breaker and the writer. Only the scheduling
 * differs, and the one thing it must never do is move the engine:
 *
 *   · Books are harvested by the very same `harvestFeed`, in `manual` mode. It reads and writes books exactly as the
 *     engine does and touches nothing in the provider's checkpoint — not the saved token, not the last-sync time.
 *   · Articles take no cursor from a journal; they read the journal's newest records and let deduplication say what
 *     is already held. A journal's own cursor and cooldown belong to the engine and are left alone.
 *   · Where a Quick Import stopped is remembered in the audit log (QUICK_IMPORT_FINISHED), so "Import more" carries on
 *     from there. It is the manual run's own position, held beside the engine's and never mixed with it.
 *
 * Bounded three ways: by the number of records it examines, by a time budget, and by the source's own limits (the
 * breaker; NCBI's daily archive and byte caps). It takes the provider's lock, so it never works a source beside the
 * engine, and a second click on the same source is refused rather than run in parallel.
 */

export type QuickId = 'doaj' | 'road' | 'crossrefjournals' | 'openalexsources' | 'crossref' | 'openalex' | 'europepmc' | 'arxiv' | 'doab' | 'oapen' | 'otl' | 'ncbi' | 'nlm' | 'crossrefbooks' | 'pressbooks';
export type QuickGroup = 'Journals' | 'Articles' | 'Books';

export type QuickCode = 'BUSY' | 'UNAVAILABLE' | 'RATE_LIMITED' | 'INVALID_RESPONSE' | 'QUOTA' | 'FAILED';

export class QuickError extends Error {
  constructor(public code: QuickCode, message: string, public until: Date | null = null, public status = 409) { super(message); }
}

export const MSG = {
  unavailable: 'Source unavailable right now. No catalogue changes were made.',
  invalid: 'The source sent a response we could not read. No catalogue changes were made.',
  rateLimited: (until: Date | null) => `Source is temporarily rate limited. Try again after ${until ? clock(until) : 'a little while'}.`,
  quota: (until: Date | null) => `NCBI's daily download limit has been reached. Try again after ${until ? clock(until) : 'midnight UTC'}.`,
};

/** "10:45 AM", in Indian Standard Time, which is the clock this admin screen is read on. */
export function clock(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();
}

export type QuickOutcome = {
  checked: number; added: number; alreadyHeld: number; needsReview: number; skipped: number; failed: number;
  enriched?: number;
  /** Duplicates that disagreed with the held record on rights or DOI and were left alone (duplicates.ts). */
  duplicateConflicting?: number;
  /** Different books examined, by identifier (a book seen twice counts once). */
  uniqueCandidates?: number;
  /** Of `skipped`: records the provider says have not changed since our last sync, so they were not judged again. */
  unchanged?: number;
  notes: string[];
  /** Where "Import more" starts. Null when the source has been read to its end. */
  nextPosition: any;
  /** The run ended early for a reason that is not a failure of what was written. */
  partial?: string | null;
  moreAvailable: boolean;
  counters?: { accepted?: number; metadataOnly?: number; seen?: number };
  /** DOAJ journals: where every row of DOAJ's file ended, and the snapshot its rows can be opened from (doajInspection.ts). */
  doaj?: { breakdown: DoajBreakdown; previewId: string | null };
  /** The breakdown by department (books and articles): written beside the run, so a department sees what was added to it. */
  byDepartment?: DeptStats;
  /** Department-search sources: every department was resting, so nothing was asked. */
  allResting?: boolean;
};

type Ctx = {
  job: QuickJob; limit: number; admin: any; position: any;
  /** The engine only: departments to leave alone this turn (they have given nothing for several turns). Quick Import never sets it. */
  skip?: string[];
  /** The write step of an advanced book import: exactly where and how far the preview read, not where "Import more" would go. */
  fixed?: { startToken: string | null; from: string | null };
  progress: (p: Partial<QuickProgress>) => void;
};

type Def = {
  id: QuickId; label: string; group: QuickGroup; description: string; badge?: 'Recommended' | 'Fallback';
  /** Which IngestionSourceHealth row governs it. */
  healthKey: string;
  /** What the engine locks it as. */
  lock: string;
  /** Shown in the confirmation: "Import up to 250 new Crossref article candidates now?" */
  unitLabel: string;
  run: (ctx: Ctx) => Promise<QuickOutcome>;
};

export type QuickProgress = {
  stage: string;
  checked: number; limit: number | null;
  added: number; held: number; review: number; skipped: number; failed: number;
  /** True when the total is not known and the screen must not show a percentage. */
  open?: boolean;
};

export type QuickResult = QuickOutcome & { provider: QuickId; label: string; group: QuickGroup; limit: number; durationMs: number };

export type QuickJob = {
  id: string; provider: QuickId; label: string; group: QuickGroup; status: 'running' | 'done' | 'error';
  startedAt: number; finishedAt?: number; limit: number;
  progress: QuickProgress;
  result?: QuickResult;
  error?: { code: QuickCode; message: string; until: string | null; written: number };
};

// ── Limits ─────────────────────────────────────────────────────────────────

export function quickLimit(id: QuickId): number {
  const q = INGESTION_POLICY.quick;
  const env = Number(process.env[`QUICK_IMPORT_LIMIT_${id.toUpperCase()}`]);
  const want = Number.isInteger(env) && env > 0 ? env : q.defaults[id];
  return Math.max(1, Math.min(want, q.ceiling[id]));
}

// ── Positions: the manual run's own, kept in the audit log ─────────────────

async function readPosition(id: QuickId): Promise<any | null> {
  const row = await db.ingestionAudit.findFirst({
    where: { action: 'QUICK_IMPORT_FINISHED', meta: { path: ['provider'], equals: id } }, orderBy: { at: 'desc' },
  }).catch(() => null);
  return (row?.meta as any)?.position ?? null;
}

// ── Small helpers ──────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const thisYear = () => new Date().getFullYear();
const ALL_DEPARTMENTS: string[] = (DOMAINS as any[]).map(d => d.name);
const HEALTH_DEPARTMENTS = ['Medical Sciences', 'Life Sciences', 'Bio Technology', 'Pharmacy', 'Nursing', 'Dental', 'Physiotherapy', 'Ayurveda'];
const ARXIV_DEPARTMENTS = [
  'Computer / IT', 'Electrical Engineering', 'Electronics & Telecommunication Engineering', 'Mechanical Engineering', 'Civil / Construction Engineering',
  'Chemical Engineering', 'Chemistry', 'Nano Technology', 'Material Science', 'Applied Mechanics', 'Applied Sciences', 'Science', 'Energy',
  'Bio Technology', 'Life Sciences', 'Multidisciplinary',
];

/** A source's own refusal becomes the plain-language outcome the screen shows. */
export async function asQuickError(e: any, healthKey: string): Promise<QuickError> {
  if (e instanceof QuickError) return e;
  if (e instanceof SourceError) {
    if (e.kind === 'invalid') return new QuickError('INVALID_RESPONSE', MSG.invalid, null, 502);
    if (e.kind === 'rate_limited') {
      const cd = await sourceCooldown(healthKey);
      return new QuickError('RATE_LIMITED', MSG.rateLimited(cd.until), cd.until, 429);
    }
    return new QuickError('UNAVAILABLE', MSG.unavailable, null, 503);
  }
  return new QuickError('FAILED', `The import stopped unexpectedly: ${String(e?.message || e).slice(0, 160)}`, null, 500);
}

const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d; };

// ── Journals: DOAJ ─────────────────────────────────────────────────────────

let doajCsvCache: { at: number; text: string } | null = null;

/** DOAJ's whole journal list, read once through the source breaker and kept for ten minutes. */
export async function loadDoajCsv(): Promise<string> {
  if (doajCsvCache && Date.now() - doajCsvCache.at < 10 * 60_000) return doajCsvCache.text;
  const r = await fetchSourceJson(DOAJ_CSV_URL, { source: 'DOAJ', text: true, timeoutMs: 240_000, attempts: 2, headers: { 'User-Agent': 'STM Digital Library (mailto:info@celnet.in)' } });
  if (!r.ok) throw new SourceError('DOAJ', r.error || 'DOAJ did not answer', r.paused || r.status === 429 ? 'rate_limited' : 'unavailable', r.status);
  const text = String(r.json || '');
  // The file must look like DOAJ's journal list before a single journal is read from it.
  if (!/^﻿?"?Journal title"?,/.test(text.slice(0, 400)) || !/Journal ISSN \(print version\)/.test(text.slice(0, 2000))) {
    throw new SourceError('DOAJ', 'DOAJ sent a journal list in a shape we do not recognise', 'invalid');
  }
  doajCsvCache = { at: Date.now(), text };
  return text;
}
export function __resetDoajCacheForTests() { doajCsvCache = null; }

async function runDoaj(ctx: Ctx): Promise<QuickOutcome> {
  ctx.progress({ stage: 'Reading the DOAJ journal list…', open: true });
  const text = await loadDoajCsv();
  ctx.progress({ stage: 'Working out which journals are new…' });
  const check = await checkDoajCatalogue({ csvText: text });
  const bd = check.breakdown;
  const previewId = await saveInspection(check, ctx.admin);
  const heldTotal = bd.heldPublic + bd.heldNoArticles + bd.heldReview + bd.heldRejected;
  const batch = check.newIssns.slice(0, ctx.limit);
  ctx.progress({ stage: `Adding ${batch.length} journals…`, checked: batch.length, limit: ctx.limit, open: false });
  // "Held" is not "public": say how the journals DOAJ lists that we already hold are placed, so a run that adds nothing is never read as a run that found nothing.
  const heldNote = `Of ${bd.checked.toLocaleString('en-IN')} journals in DOAJ's list, ${heldTotal.toLocaleString('en-IN')} are already held: ${bd.heldPublic.toLocaleString('en-IN')} public with published articles, ${bd.heldNoArticles.toLocaleString('en-IN')} public with no published article yet, ${bd.heldReview.toLocaleString('en-IN')} draft or in review, ${bd.heldRejected.toLocaleString('en-IN')} rejected.`;
  const skippedNote = bd.skippedConflicting ? `${bd.skippedConflicting.toLocaleString('en-IN')} were skipped or in conflict: ${[bd.skipped.sameTitle && `${bd.skipped.sameTitle} share a title with a held journal under other ISSNs`, bd.skipped.unusable && `${bd.skipped.unusable} have no usable ISSN or title`, bd.skipped.ambiguous && `${bd.skipped.ambiguous} match two held journals`, bd.skipped.listedTwice && `${bd.skipped.listedTwice} are listed twice in the file`].filter(Boolean).join('; ')}.` : null;
  const doaj = { breakdown: bd, previewId };
  if (!batch.length) {
    return { checked: bd.checked, added: 0, alreadyHeld: heldTotal, needsReview: bd.skipped.sameTitle, skipped: bd.skipped.unusable + bd.skipped.ambiguous + bd.skipped.listedTwice, failed: 0,
      notes: ['No new journals to add.', heldNote, ...(skippedNote ? [skippedNote] : [])], nextPosition: null, moreAvailable: false, doaj };
  }
  const r = await importCheckedJournals(batch, { csvText: text });
  const notes = [`${r.accepted} cleared for full text, ${r.metadataOnly} catalogued as metadata only.`, heldNote];
  if (skippedNote) notes.push(skippedNote);
  return {
    checked: bd.checked, added: r.added, alreadyHeld: heldTotal + r.alreadyHeldNow, needsReview: bd.skipped.sameTitle,
    skipped: bd.skipped.unusable + bd.skipped.ambiguous + bd.skipped.listedTwice + Math.max(0, check.newIssns.length - batch.length) + Math.max(0, batch.length - r.added - r.alreadyHeldNow), failed: 0, notes, nextPosition: null,
    // What is still new is simply what is not held yet: the catalogue itself is the position.
    moreAvailable: check.newIssns.length > batch.length,
    counters: { accepted: r.accepted, metadataOnly: r.metadataOnly }, doaj,
  };
}

// ── Journals: sources that list journals by search term (Crossref Journals, OpenAlex Sources, ROAD) ─────

/**
 * A bounded manual run over a journal source: the departments' search terms in turn, each from the manual run's own saved place
 * (kept in the audit log, like every Quick Import's), never from the continuous engine's sweeps. Everything found is written the
 * review-first way — not accepted, open access unverified — by the same writer the engine uses.
 */
async function runJournalSource(ctx: Ctx, label: 'Crossref Journals' | 'OpenAlex Sources' | 'ROAD', fetchPage: (term: string, position: number, size: number) => Promise<JournalPage>): Promise<QuickOutcome> {
  const targets: { department: string; term: string }[] = [];
  for (const dep of ALL_DEPARTMENTS) for (const term of searchTermsFor(dep)) targets.push({ department: dep, term });
  const places: Record<string, number> = { ...(ctx.position?.places || {}) };
  let turn: number = Number.isInteger(ctx.position?.turn) ? ctx.position.turn % targets.length : 0;
  const started = Date.now();
  const out = { checked: 0, created: 0, held: 0, enriched: 0, skipped: 0, failed: 0, firstError: null as string | null };
  const stats: DeptStats = {};
  const spent = new Set<number>();
  for (let n = 0; n < targets.length && out.checked < ctx.limit && spent.size < targets.length && Date.now() - started < INGESTION_POLICY.quick.runBudgetMs; n++) {
    const t = targets[turn];
    const key = `${t.department}|${t.term}`;
    const size = Math.min(100, ctx.limit - out.checked);
    let page: JournalPage;
    try {
      page = await fetchPage(t.term, places[key] ?? 0, size);
    } catch (e: any) {
      if (e instanceof SourceError && e.kind === 'invalid') throw e;
      if (out.checked > 0) { ctx.progress({ stage: `${label} stopped answering part-way` }); break; }
      throw e;
    }
    const w = await writeJournalCandidates(label, t.department, page.items, page.fetched, page.skipped);
    out.checked += w.checked; out.created += w.created; out.held += w.held; out.enriched += w.enriched; out.skipped += w.skipped; out.failed += w.failed; out.firstError ||= w.firstError;
    bump(stats, t.department, 'sentToReview', w.created); bump(stats, t.department, 'held', w.held); bump(stats, t.department, 'skipped', w.skipped); bump(stats, t.department, 'failed', w.failed);
    places[key] = page.fetched >= size ? (places[key] ?? 0) + 1 : 0;
    if (page.fetched < size) spent.add(turn);
    turn = (turn + 1) % targets.length;
    ctx.progress({ stage: `Reading ${label}… ${t.department}`, checked: out.checked, limit: ctx.limit, open: false, review: out.created, held: out.held });
  }
  return {
    checked: out.checked, added: 0, alreadyHeld: out.held, needsReview: out.created, skipped: out.skipped, failed: out.failed, enriched: out.enriched,
    notes: [`${out.created} new journals were held for review: ${label} does not say whether a journal is open access, so none was accepted.`, ...(out.firstError ? [`First write error: ${out.firstError}`] : [])],
    nextPosition: { turn, places }, moreAvailable: spent.size < targets.length, byDepartment: stats, counters: { seen: out.checked },
  };
}

const runCrossrefJournals = (ctx: Ctx) => runJournalSource(ctx, 'Crossref Journals', (t, pos, n) => fetchCrossrefJournals(t, pos * n, n));
const runOpenAlexSources = (ctx: Ctx) => runJournalSource(ctx, 'OpenAlex Sources', (t, pos, n) => fetchOpenAlexSources(t, pos + 1, n));
const runRoad = async (ctx: Ctx) => {
  const adapter = getRoadAdapter();
  if (!adapter) throw new QuickError('UNAVAILABLE', 'ROAD is not connected: it has no public data interface this engine can use yet. No catalogue changes were made.', null, 503);
  return runJournalSource(ctx, 'ROAD', adapter);
};

// ── Articles ───────────────────────────────────────────────────────────────

type Gathered = { items: (RawCandidate & { department: string | null })[]; fetched: number; skipped: number; partial: string | null; nextPosition: any; moreAvailable: boolean; allResting?: boolean };

/** Journals the engine would fetch articles for, taken in id order from where the last manual run stopped. */
async function gatherByJournal(ctx: Ctx, def: Def, fetchOne: (j: any, fromYear: number, rows: number) => Promise<{ items: RawCandidate[]; fetched: number; skipped: number }>, gapMs: number): Promise<Gathered> {
  const state = await getState();
  const fromYear = articleMinYear(state);                // Quick Import uses the same article policy year as the engine
  const cap = Math.max(0, state.articlesPerJournal ?? 0);
  const rowsPer = Math.min(50, Math.max(10, Math.ceil(ctx.limit / 10)));
  const policy = INGESTION_POLICY.quick;
  const started = Date.now();

  let afterId: string | null = ctx.position?.afterId ?? null;
  let wrapped = false, visited = 0;
  const out: Gathered = { items: [], fetched: 0, skipped: 0, partial: null, nextPosition: null, moreAvailable: true };

  outer:
  while (out.fetched < ctx.limit && visited < policy.maxJournalsPerRun && Date.now() - started < policy.runBudgetMs) {
    const batch: any[] = await db.journal.findMany({
      where: {
        status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration',
        ...(cap > 0 ? { articleCount: { lt: cap } } : {}),
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: 'asc' }, take: 10,
    });
    if (!batch.length) {
      if (wrapped || !afterId) break;                 // went right round and found nothing more to ask
      afterId = null; wrapped = true; continue;
    }
    for (const j of batch) {
      if (out.fetched >= ctx.limit || visited >= policy.maxJournalsPerRun || Date.now() - started >= policy.runBudgetMs) break outer;
      let got;
      try {
        got = await fetchOne(j, fromYear, Math.min(rowsPer, ctx.limit - out.fetched));
      } catch (e: any) {
        // A response we cannot read poisons the run: nothing has been written yet, and nothing will be.
        if (e instanceof SourceError && e.kind === 'invalid') throw e;
        // The source went away part-way. What was already read is sound; use it, and say where it stopped.
        if (out.fetched > 0) { out.partial = `${def.label} stopped answering part-way (${e?.message || 'no answer'}); the records already read were still imported.`; break outer; }
        throw e;
      }
      visited++;
      out.fetched += got.fetched; out.skipped += got.skipped;
      out.items.push(...got.items.map(i => ({ ...i, department: j.domain || null })));
      afterId = j.id;
      ctx.progress({ stage: `Reading ${def.label}… ${visited} journal${visited === 1 ? '' : 's'}`, checked: out.fetched, limit: ctx.limit, open: false });
      await articlePause(gapMs);
    }
  }
  out.nextPosition = { afterId };
  return out;
}

/** Department-search sources (Europe PMC, arXiv): one page per department in turn, each with its own place. */
async function gatherBySearch(ctx: Ctx, def: Def, departments: string[], fetchPage: (dept: string, size: number, at: number, fromYear: number) => Promise<{ items: RawCandidate[]; fetched: number; skipped: number }>, first: number, pageSize: number, gapMs: number): Promise<Gathered> {
  const state = await getState();
  const fromYear = articleMinYear(state);                // Quick Import uses the same article policy year as the engine
  const policy = INGESTION_POLICY.quick;
  const started = Date.now();
  const places: Record<string, number> = { ...(ctx.position?.places || {}) };
  let turn: number = Number.isInteger(ctx.position?.turn) ? ctx.position.turn % departments.length : 0;
  const out: Gathered = { items: [], fetched: 0, skipped: 0, partial: null, nextPosition: null, moreAvailable: true };

  // A department whose results ran out is finished for this run; it starts again from the beginning next time. A department the engine is leaving
  // alone for now is finished for this run from the start (the position is kept as it was, so it is picked up where it was when its rest is over).
  const spent = new Set<string>(departments.filter(d => ctx.skip?.includes(d)));
  if (spent.size >= departments.length) { out.nextPosition = ctx.position ?? { turn, places }; out.moreAvailable = false; out.allResting = true; return out; }
  for (let n = 0; n < departments.length * 6 && out.fetched < ctx.limit && spent.size < departments.length && Date.now() - started < policy.runBudgetMs; n++) {
    const dept = departments[turn];
    if (spent.has(dept)) { turn = (turn + 1) % departments.length; continue; }
    const size = Math.min(pageSize, ctx.limit - out.fetched);
    const at = places[dept] ?? first;
    let got;
    try {
      got = await fetchPage(dept, size, at, fromYear);
    } catch (e: any) {
      if (e instanceof SourceError && e.kind === 'invalid') throw e;
      if (out.fetched > 0) { out.partial = `${def.label} stopped answering part-way (${e?.message || 'no answer'}); the records already read were still imported.`; break; }
      throw e;
    }
    out.fetched += got.fetched; out.skipped += got.skipped;
    out.items.push(...got.items.map(i => ({ ...i, department: dept })));
    if (got.fetched < size) { spent.add(dept); places[dept] = first; }
    else places[dept] = first === 1 ? at + 1 : at + got.fetched;
    turn = (turn + 1) % departments.length;
    ctx.progress({ stage: `Reading ${def.label}… ${dept}`, checked: out.fetched, limit: ctx.limit, open: false });
    await articlePause(gapMs);
  }
  out.nextPosition = { turn, places };
  return out;
}

/** Judge, check the files, write — the shared pipeline (articlePipeline.ts) — and report. */
async function finishArticles(ctx: Ctx, def: Def, g: Gathered): Promise<QuickOutcome> {
  if (g.allResting) return { checked: 0, added: 0, alreadyHeld: 0, needsReview: 0, skipped: 0, failed: 0, notes: [], nextPosition: g.nextPosition, moreAvailable: false, allResting: true };
  const cands: Candidate[] = g.items.map(i => ({ ...i, department: i.department as any, extra: i.extra ?? null }));
  ctx.progress({ checked: g.fetched, limit: ctx.limit, open: false });
  const { sum, heldAlready, rejected, viewable, byDepartment, dup } = await judgeVerifyWrite(cands, ctx.admin, { skippedAtFetch: g.skipped, progress: p => ctx.progress(p as any) });

  const notes: string[] = [];
  if (dup.enriched) notes.push(`${dup.enriched} articles already held were completed with details they were missing.`);
  if (dup.conflicting) notes.push(`${dup.conflicting} duplicates disagreed with the held record on licence or DOI and were left as they are.`);
  if (sum.added) notes.push(`${viewable} of the ${sum.added} added open in the viewer; the rest link to the publisher.`);
  if (sum.failed && sum.firstError) notes.push(`First write error: ${sum.firstError}`);
  return {
    checked: g.fetched, added: sum.added, alreadyHeld: heldAlready + sum.held, needsReview: sum.reviewWritten,
    skipped: g.skipped + rejected + sum.rejected, failed: sum.failed, notes, enriched: dup.enriched, duplicateConflicting: dup.conflicting,
    nextPosition: g.nextPosition, partial: g.partial, moreAvailable: g.moreAvailable,
    byDepartment,
  };
}

const runCrossref = async (ctx: Ctx) => { const d = DEFS.crossref; return finishArticles(ctx, d, await gatherByJournal(ctx, d, fetchCrossrefForJournal, 120)); };
const runOpenAlex = async (ctx: Ctx) => { const d = DEFS.openalex; return finishArticles(ctx, d, await gatherByJournal(ctx, d, fetchOpenAlexForJournal, 150)); };
const runEuropePmc = async (ctx: Ctx) => {
  const d = DEFS.europepmc;
  return finishArticles(ctx, d, await gatherBySearch(ctx, d, HEALTH_DEPARTMENTS, (dept, size, at, fromYear) => fetchEuropePmc(dept, size, { page: at, fromYear }), 1, 25, 200));
};
const runArxiv = async (ctx: Ctx) => {
  const d = DEFS.arxiv;
  // arXiv asks for no more than one request every three seconds.
  return finishArticles(ctx, d, await gatherBySearch(ctx, d, ARXIV_DEPARTMENTS, (dept, size, at, fromYear) => fetchArxiv(dept, size, { start: at, fromYear }), 0, 25, 3000));
};

/**
 * The continuous engine's turn on a department-search source (Europe PMC, arXiv): this very gather and this very write, started
 * from the ENGINE'S own saved place and never from Quick Import's, so neither can move the other.
 */
export async function runSearchProvider(id: 'europepmc' | 'arxiv', limit: number, position: any, opts: { skip?: string[] } = {}): Promise<QuickOutcome> {
  const ctx: Ctx = { job: null as any, limit, admin: null, position, skip: opts.skip, progress: () => {} };
  return id === 'europepmc' ? runEuropePmc(ctx) : runArxiv(ctx);
}

/** The cursor keys of a department-search source are its departments; this is the part of the scheduler's resting list that applies to it. */
export const restingForSearch = (id: 'europepmc' | 'arxiv', resting: string[]): string[] => resting.filter(d => (id === 'europepmc' ? HEALTH_DEPARTMENTS : ARXIV_DEPARTMENTS).includes(d));

/** The department the next turn of a department-search source would ask about, from the engine's saved place, skipping resting ones. For the screen only. */
export function peekSearchDepartment(id: 'europepmc' | 'arxiv', position: any, resting: string[]): string | null {
  const list = id === 'europepmc' ? HEALTH_DEPARTMENTS : ARXIV_DEPARTMENTS;
  const start = Number.isInteger(position?.turn) ? position.turn % list.length : 0;
  for (let i = 0; i < list.length; i++) { const d = list[(start + i) % list.length]; if (!resting.includes(d)) return d; }
  return null;
}

// ── Books ──────────────────────────────────────────────────────────────────

/** Tests only: how long a manual book harvest waits between pages. Real runs use the harvester's own politeness delay. */
let pageDelayOverride: number | undefined;
export function __useQuickPageDelayForTests(ms: number | undefined) { pageDelayOverride = ms; }
const BOOK_CFG = { doab: DOAB_OAI, oapen: OAPEN_OAI, otl: OTL_FEED, ncbi: NCBI_FEED, nlm: NLM_FEED, crossrefbooks: CROSSREF_BOOKS_FEED, pressbooks: PRESSBOOKS_FEED } as const;
const dupTotal = (r: HarvestReport) => Object.values(r.duplicates).reduce((a, b) => a + b, 0);

/** Where a manual run of a provider begins: its own saved place, or — with none — where the engine's next sync would. */
async function bookStart(cfg: OaiProviderConfig, position: any): Promise<{ startToken: string | null; from: string | null }> {
  const cp = await db.bookHarvestCheckpoint.findUnique({ where: { provider: cfg.provider } }).catch(() => null);
  const startToken: string | null = position?.cursor ?? null;
  const from = startToken ? null : cp?.lastSuccessfulSyncAt ? iso(new Date(cp.lastSuccessfulSyncAt.getTime() - 60_000)) : null;
  return { startToken, from };
}

type ManualParams = { limit: number; startToken: string | null; from: string | null };

/**
 * One manual harvest of a book provider: the engine's own `harvestFeed`, told not to touch the provider's checkpoint.
 * `dryRun` reads and judges and writes nothing. A source that gave nothing is reported as the reason, never as an empty success.
 */
async function harvestManual(cfg: OaiProviderConfig, healthKey: string, p: ManualParams, opts: { dryRun?: boolean; progress?: Ctx['progress'] } = {}): Promise<HarvestReport> {
  const isNcbi = cfg.kind === 'ncbi';
  opts.progress?.({ stage: `Reading ${cfg.label}…`, open: true, checked: 0, limit: isNcbi ? null : p.limit });
  const report = await harvestFeed(cfg, {
    dryRun: !!opts.dryRun, manual: true, ignoreCheckpoint: true, startToken: p.startToken, from: p.from,
    maxPages: isNcbi ? 60 : Math.ceil(p.limit / 20) + 3,
    maxRecords: isNcbi ? undefined : p.limit,
    // A preview of NCBI is its shortlist only: no archive is downloaded to answer "what would happen".
    ...(isNcbi ? (opts.dryRun ? { maxArchives: 0 } : { archiveCap: p.limit }) : {}),
    pageDelayMs: pageDelayOverride ?? (isNcbi ? 500 : undefined),
    onPage: r => opts.progress?.({
      stage: `Reading ${cfg.label}…`, checked: isNcbi ? (r.ncbi?.archives ?? 0) : r.fetched, limit: p.limit, open: false,
      added: r.added, held: dupTotal(r), review: r.queuedForReview, skipped: r.department.none + r.outsideScope + r.unusable + r.deleted, failed: r.failed,
    }),
  });
  // Nothing arrived at all: the source did not answer, and not one book was read, so not one was written.
  if (report.sourceError && !report.pages) {
    if (/\b429\b|paused after repeated/i.test(report.sourceError)) {
      const cd = await sourceCooldown(healthKey);
      throw new QuickError('RATE_LIMITED', MSG.rateLimited(cd.until), cd.until, 429);
    }
    if (/shape we do not recognise|OAI error/i.test(report.sourceError)) throw new QuickError('INVALID_RESPONSE', MSG.invalid, null, 502);
    throw new QuickError('UNAVAILABLE', MSG.unavailable, null, 503);
  }
  return report;
}

function booksRunner(cfg: OaiProviderConfig, healthKey: string) {
  return async (ctx: Ctx): Promise<QuickOutcome> => {
    const isNcbi = cfg.kind === 'ncbi';
    const start = ctx.fixed ?? await bookStart(cfg, ctx.position);
    const report = await harvestManual(cfg, healthKey, { limit: ctx.limit, startToken: start.startToken, from: start.from }, { progress: ctx.progress });

    const notes: string[] = [];
    if (report.enriched) notes.push(`${report.enriched} books already held were enriched with details they were missing.`);
    if (report.licenceFilled) notes.push(`${report.licenceFilled} empty licences were filled from a title-level declaration.`);
    if (report.unchanged) notes.push(`${report.unchanged} records are unchanged since the last sync, so they were not judged again (counted as skipped).`);
    if (report.deferred) notes.push(`Stopped early: ${report.deferred}.`);
    if (report.firstError) notes.push(`First write error: ${report.firstError}`);
    if (isNcbi && report.ncbi) notes.push(`${report.ncbi.archives} archives read (${Math.round(report.ncbi.bytes / 104857.6) / 10} MB); NCBI stays review-first, so nothing it found was published automatically.`);

    const checked = isNcbi ? (report.ncbi?.archives ?? 0) : report.fetched;
    return {
      checked, added: report.added, alreadyHeld: dupTotal(report), needsReview: report.queuedForReview,
      skipped: totals(report.departmentStats).skipped, failed: report.failed,
      enriched: report.enriched, unchanged: report.unchanged, uniqueCandidates: report.uniqueCandidates, byDepartment: report.departmentStats, notes,
      partial: report.sourceError ? `${cfg.label} stopped answering part-way (${report.sourceError}); what was read before that was still imported.` : null,
      // A finished set starts afresh from the last sync next time; an unfinished one carries on from here.
      nextPosition: report.completed ? null : { cursor: report.nextCursor },
      moreAvailable: !report.completed,
    };
  };
}

/**
 * The preview of an advanced book import: the same read, judged exactly as the write will judge it, with nothing written —
 * not a book, and not the provider's checkpoint. It takes the provider's lock while it reads, like any other manual work.
 */
export async function previewManualBooks(id: QuickId, limit: number) {
  const def = DEFS[id];
  if (def.group !== 'Books') throw new QuickError('FAILED', `${def.label} is not a book source`, null, 400);
  const cfg = BOOK_CFG[id as keyof typeof BOOK_CFG];
  const max = INGESTION_POLICY.quick.ceiling[id];
  const n = Math.max(1, Math.min(limit, max));
  if (runningInGroup('Books')) throw new QuickError('BUSY', 'A book import is already running. Wait for it to finish.');
  if (!tryLockProvider(def.lock, 'manual')) throw new QuickError('BUSY', `${def.label} is being worked on right now. Try again in a minute.`);
  try {
    const cd = await sourceCooldown(def.healthKey);
    if (cd.state === 'rate_limited' || cd.state === 'cooling') throw new QuickError('RATE_LIMITED', MSG.rateLimited(cd.until), cd.until, 429);
    const start = await bookStart(cfg, await readPosition(id));
    const params: ManualParams = { limit: n, ...start };
    const r = await harvestManual(cfg, def.healthKey, params, { dryRun: true });
    const eligible = r.added + r.queuedForReview;
    return {
      params,
      summary: {
        found: id === 'ncbi' ? (r.ncbi?.candidates ?? 0) : r.fetched, eligible, viewable: 0, metadataOnly: eligible,
        alreadyHeld: dupTotal(r) + (r.ncbi?.existing ?? 0), needsReview: r.queuedForReview, rejected: r.department.none + r.outsideScope, errors: r.sourceError ? 1 : 0,
        books: {
          publish: r.added, review: r.queuedForReview, enriched: r.enriched, noDepartment: r.department.none, byDepartment: r.department.byDepartment,
          access: r.access, ncbi: r.ncbi ? { candidates: r.ncbi.candidates, byTier: r.ncbi.byTier, byDepartment: r.ncbi.byDepartment, existing: r.ncbi.existing, rows: r.ncbi.rows } : null,
          sourceError: r.sourceError,
        },
      },
      sample: r.sample.slice(0, 40),
    };
  } finally { unlockProvider(def.lock, 'manual'); }
}

// ── The registry ───────────────────────────────────────────────────────────

const DEFS: Record<QuickId, Def> = {
  doaj: {
    id: 'doaj', label: 'DOAJ', group: 'Journals', healthKey: 'DOAJ', lock: 'DOAJ', unitLabel: 'new DOAJ journal candidates',
    description: 'Directory of Open Access Journals and journal discovery.', run: runDoaj,
  },
  road: {
    id: 'road', label: 'ROAD / ISSN', group: 'Journals', healthKey: 'ROAD', lock: 'ROAD', unitLabel: 'ROAD journal candidates',
    description: 'Open-access journal fallback from the ISSN Centre’s directory.', run: runRoad,
  },
  crossrefjournals: {
    id: 'crossrefjournals', label: 'Crossref Journals', group: 'Journals', healthKey: 'Crossref', lock: 'CrossrefJournals', unitLabel: 'Crossref journal candidates',
    description: 'Journal identity and ISSN fallback. Open access is not verified, so new journals wait for review.', run: runCrossrefJournals,
  },
  openalexsources: {
    id: 'openalexsources', label: 'OpenAlex Sources', group: 'Journals', healthKey: 'OpenAlex', lock: 'OpenAlexSources', unitLabel: 'OpenAlex journal candidates',
    description: 'Supplementary journal fallback. Open access is not verified, so new journals wait for review.', run: runOpenAlexSources,
  },
  crossref: {
    id: 'crossref', label: 'Crossref', group: 'Articles', healthKey: 'Crossref', lock: 'Crossref', unitLabel: 'new Crossref article candidates', badge: 'Recommended',
    description: 'Primary scholarly article metadata source with DOI and journal information.', run: runCrossref,
  },
  openalex: {
    id: 'openalex', label: 'OpenAlex', group: 'Articles', healthKey: 'OpenAlex', lock: 'OpenAlex', unitLabel: 'new OpenAlex article candidates', badge: 'Fallback',
    description: 'Broad scholarly index used as fallback and supplementary metadata.', run: runOpenAlex,
  },
  europepmc: {
    id: 'europepmc', label: 'Europe PMC', group: 'Articles', healthKey: 'EuropePMC', lock: 'EuropePMC', unitLabel: 'new Europe PMC article candidates',
    description: 'Medical and life-science research literature.', run: runEuropePmc,
  },
  arxiv: {
    id: 'arxiv', label: 'arXiv', group: 'Articles', healthKey: 'arXiv', lock: 'arXiv', unitLabel: 'new arXiv preprints',
    description: 'Scholarly preprints with source PDFs.', run: runArxiv,
  },
  doab: {
    id: 'doab', label: 'DOAB', group: 'Books', healthKey: 'DOAB', lock: DOAB_OAI.provider, unitLabel: 'new DOAB book candidates',
    description: 'Open-access scholarly book discovery.', run: booksRunner(DOAB_OAI, 'DOAB'),
  },
  oapen: {
    id: 'oapen', label: 'OAPEN', group: 'Books', healthKey: 'OAPEN', lock: OAPEN_OAI.provider, unitLabel: 'new OAPEN book candidates',
    description: 'Open-access academic books and monographs.', run: booksRunner(OAPEN_OAI, 'OAPEN'),
  },
  otl: {
    id: 'otl', label: 'Open Textbook Library', group: 'Books', healthKey: 'open.umn.edu', lock: OTL_FEED.provider, unitLabel: 'new Open Textbook Library book candidates',
    description: 'Openly licensed academic textbooks.', run: booksRunner(OTL_FEED, 'open.umn.edu'),
  },
  ncbi: {
    id: 'ncbi', label: 'NCBI Bookshelf', group: 'Books', healthKey: 'NCBI', lock: NCBI_FEED.provider, unitLabel: 'NCBI Bookshelf archives',
    description: 'Biomedical and health-science books from the official OA collection.', run: booksRunner(NCBI_FEED, 'NCBI'),
  },
  nlm: {
    id: 'nlm', label: 'NLM Catalog', group: 'Books', healthKey: 'NLMCatalog', lock: NLM_FEED.provider, unitLabel: 'new NLM Catalog book records',
    description: 'Health-book catalogue records with the National Library of Medicine classification. Metadata only: no full text.', run: booksRunner(NLM_FEED, 'NLMCatalog'),
  },
  crossrefbooks: {
    id: 'crossrefbooks', label: 'Crossref Books', group: 'Books', healthKey: 'Crossref', lock: CROSSREF_BOOKS_FEED.provider, unitLabel: 'new Crossref book records',
    description: 'Scholarly books by DOI. Metadata only, and every new book waits for review: Crossref does not say a book can be read.', run: booksRunner(CROSSREF_BOOKS_FEED, 'Crossref'),
  },
  pressbooks: {
    id: 'pressbooks', label: 'Pressbooks Directory', group: 'Books', healthKey: 'Pressbooks', lock: PRESSBOOKS_FEED.provider, unitLabel: 'new Pressbooks Directory books',
    description: 'Openly published university textbooks. The licence is read from each book; every new book waits for review.', run: booksRunner(PRESSBOOKS_FEED, 'Pressbooks'),
  },
};
export const QUICK_IDS = Object.keys(DEFS) as QuickId[];
/** Which source-health row governs a source, by the id the wizard and Quick Import both use. */
export const healthKeyFor = (source: string): string | undefined => ({
  crossref: 'Crossref', openalex: 'OpenAlex', europepmc: 'EuropePMC', arxiv: 'arXiv', doaj: 'DOAJ', 'doaj-journals': 'DOAJ',
  road: 'ROAD', crossrefjournals: 'Crossref', openalexsources: 'OpenAlex',
  doab: 'DOAB', oapen: 'OAPEN', otl: 'open.umn.edu', ncbi: 'NCBI', nlm: 'NLMCatalog', crossrefbooks: 'Crossref', pressbooks: 'Pressbooks',
} as Record<string, string>)[source];
export const isQuickId = (x: any): x is QuickId => typeof x === 'string' && x in DEFS;
export const quickDef = (id: QuickId) => DEFS[id];

// ── Jobs ───────────────────────────────────────────────────────────────────

const jobs = new Map<string, QuickJob>();
const newId = () => `quick_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
export const getQuickJob = (id: string) => jobs.get(id) ?? null;
export const activeQuickJobs = () => [...jobs.values()].filter(j => j.status === 'running');
const runningInGroup = (g: QuickGroup) => activeQuickJobs().find(j => j.group === g) ?? null;
export function __resetQuickJobsForTests() { jobs.clear(); }

const blank = (limit: number | null): QuickProgress => ({ stage: 'Checking the source…', checked: 0, limit, added: 0, held: 0, review: 0, skipped: 0, failed: 0, open: true });

/**
 * The state of one source, as its card shows it — from the same health row the engine's scheduler reads, so a card, the engine and
 * the Quick Import button can never disagree.
 *
 *   healthy       no recent failure
 *   degraded      failing, but not yet resting — OR resting is over and the next request is the test. Quick Import stays available:
 *                 a manual run is then the only probe if the engine is off, and refusing it would leave the source stuck for ever.
 *   running       the engine, or another import, is on it now
 *   rate_limited / cooling / unavailable   resting until a time; Quick Import is refused
 *   not_connected no data interface behind it (ROAD), or switched off
 */
export async function sourceState(id: QuickId) {
  const def = DEFS[id];
  ensureProviders();
  const provider = getProviders().find(p => p.id === id);
  const holder = providerHolder(def.lock);
  const h = await sourceHealthState(def.healthKey);
  let state: 'healthy' | 'degraded' | 'running' | 'cooling' | 'rate_limited' | 'unavailable' | 'not_connected' = 'healthy';
  let until: Date | null = null;
  let detail: string | null = null;
  const configured = provider?.configured?.() ?? true;
  if (configured !== true) { state = 'not_connected'; detail = String(configured).replace(/^not connected — /, ''); }
  else if (holder) { state = 'running'; detail = holder.owner === 'continuous' ? 'The Continuous Engine is working on it' : 'A Quick Import is running'; }
  else if (h.until) { state = h.health === 'rate_limited' ? 'rate_limited' : h.health === 'unavailable' ? 'unavailable' : 'cooling'; until = h.until; detail = state === 'unavailable' ? 'Unavailable — retry scheduled' : null; }
  else if (h.failures > 0) { state = 'degraded'; detail = `${h.failures} of ${h.threshold} failures in a row`; }
  let quota: any = null;
  // A daily quota is an expected rest, not ill health: `state` stays 'cooling' so a manual import is refused until it resets, but the source's
  // HEALTH is untouched (it is read from the failure record alone) and `quotaReached` lets the screen say so in its own line.
  let quotaReached = false;
  if (id === 'ncbi') {
    const lim = ncbiLimits(); const used = await usedToday(db);
    quota = { archivesLeft: Math.max(0, lim.maxArchivesPerDay - used.archives), archivesPerDay: lim.maxArchivesPerDay };
    if (!holder && (used.archives >= lim.maxArchivesPerDay || used.bytes >= lim.maxBytesPerDay)) { state = 'cooling'; until = nextUtcMidnight(); detail = 'Daily limit reached'; quotaReached = true; }
  }
  return { state, until, detail, quota, health: h, quotaReached };
}

export type CardAvailability = { kind: 'available' | 'probe' | 'running' | 'quota' | 'exhausted' | 'cooling' | 'rate_limited' | 'unavailable' | 'not_connected'; label: string; until: string | null; detail: string | null };

/**
 * Whether the source can be asked right now, kept apart from how healthy it is. A source over its daily quota, or resting because it has
 * nothing new, is perfectly healthy; one that keeps failing is not, and says why.
 */
function availabilityOf(st: Awaited<ReturnType<typeof sourceState>>, rp: { availability: { state: string; until: string | null } } | null): CardAvailability {
  const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
  if (st.state === 'not_connected') return { kind: 'not_connected', label: 'Not connected', until: null, detail: st.detail };
  if (st.state === 'running') return { kind: 'running', label: 'Running now', until: null, detail: st.detail };
  if (st.quotaReached) return { kind: 'quota', label: 'Daily quota reached', until: iso(st.until), detail: null };
  if (st.health.until) {
    const kind = st.state === 'rate_limited' ? 'rate_limited' : st.state === 'unavailable' ? 'unavailable' : 'cooling';
    return { kind, label: kind === 'rate_limited' ? 'Rate limited' : kind === 'unavailable' ? 'Unavailable' : 'Cooling down', until: iso(st.health.until), detail: st.health.reason };
  }
  if (rp?.availability.state === 'exhausted') return { kind: 'exhausted', label: 'Exhausted for now', until: rp.availability.until, detail: 'Nothing new for now; eligible again after the rest' };
  if (st.health.probeDue) return { kind: 'probe', label: 'Test request due', until: null, detail: 'One request will be made to see whether it has recovered' };
  return { kind: 'available', label: 'Available', until: null, detail: null };
}

export async function listQuickSources() {
  ensureProviders();
  const recent: any[] = await db.ingestionAudit.findMany({ where: { action: 'QUICK_IMPORT_FINISHED' }, orderBy: { at: 'desc' }, take: 60 }).catch(() => []);
  const rot = await rotationStatus();
  const out = [];
  for (const id of QUICK_IDS) {
    const def = DEFS[id];
    const st = await sourceState(id);
    const groupJob = runningInGroup(def.group);
    const mine = activeQuickJobs().find(j => j.provider === id) ?? null;
    const last = recent.find(r => (r.meta as any)?.provider === id);
    const limit = quickLimit(id);
    const rp = rot.providers.find(p => p.id === id) || null;
    // Books read through a checkpoint: where the harvest stands, last page vs last attempt, and whether a second route is in use.
    const harvest = id in BOOK_CFG ? await harvestDiagnostics((BOOK_CFG as any)[id]).catch(() => null) : null;
    out.push({
      id, label: def.label, group: def.group, description: def.description, badge: def.badge ?? null,
      role: rp?.role ?? null, tier: rp?.tier ?? null,
      limit, unitLabel: def.unitLabel,
      confirm: id === 'ncbi'
        ? `Read up to ${limit} NCBI Bookshelf archives now? Existing records will not be overwritten, and NCBI's daily limits still apply.`
        : `Import up to ${limit} ${def.unitLabel} now? Existing records will not be overwritten.`,
      state: st.state, until: st.until ? st.until.toISOString() : null, detail: st.detail, quota: st.quota,
      // Three different questions, three different answers: how is the source (health), can it be asked now (availability), and what has it been
      // giving (yield). A daily quota or an exhausted rest changes the second and third and never the first.
      healthState: st.state === 'not_connected' ? 'not_connected' : st.health.health,
      availability: availabilityOf(st, rp),
      health: {
        state: st.health.health, failures: st.health.failures, threshold: st.health.threshold, until: st.health.until ? st.health.until.toISOString() : null, lastError: st.health.lastError,
        reason: st.health.reason, lastErrorKind: st.health.lastErrorKind, lifetimeFailures: st.health.lifetimeFailures,
      },
      harvest,
      yield: rp?.yield ?? null,
      // What a productive source is productive FOR, the departments / searches it is leaving alone, the one-sentence reading, and review-only.
      yieldFor: rp?.yieldFor ?? null, reviewOnly: rp?.reviewOnly ?? false, plain: rp?.plain ?? null, cursors: rp?.cursors ?? null,
      lastBatch: rp?.lastBatch ?? null,
      lastProductiveBatch: rp?.lastProductiveBatch ?? null,
      exhaustedAt: rp?.exhaustedAt ?? null, refreshAfter: rp?.refreshAfter ?? null,
      inRotation: rp ? rp.availability.state !== 'unavailable' || rp.availability.kind === 'busy' : false,
      runningJobId: mine?.id ?? null,
      canQuickImport: (st.state === 'healthy' || st.state === 'degraded') && !groupJob,
      blockedBy: groupJob && groupJob.provider !== id ? `${groupJob.label} Quick Import is running` : null,
      last: last ? { at: last.at, ...(last.meta as any)?.summary } : null,
    });
  }
  return out;
}

/**
 * Start a Quick Import. The checks that can refuse it run first, and the lock is taken before the first await, so two
 * fast clicks cannot both get through. Returns the job, or throws a QuickError for the screen to show.
 */
export async function beginQuickImport(id: QuickId, admin: any, opts: { advanced?: { limit: number; startToken: string | null; from: string | null } } = {}): Promise<QuickJob> {
  const def = DEFS[id];
  const limit = opts.advanced ? Math.max(1, Math.min(opts.advanced.limit, INGESTION_POLICY.quick.ceiling[id])) : quickLimit(id);

  const groupJob = runningInGroup(def.group);
  if (groupJob) {
    throw new QuickError('BUSY', groupJob.provider === id
      ? `A Quick Import for ${def.label} is already running.`
      : `${groupJob.label} Quick Import is running. Wait for it to finish before starting another ${def.group.toLowerCase()} import.`);
  }
  if (!tryLockProvider(def.lock, 'manual')) {
    const h = providerHolder(def.lock);
    throw new QuickError('BUSY', h?.owner === 'continuous'
      ? `The Continuous Engine is working on ${def.label} right now. Try again in a minute.`
      : `A Quick Import for ${def.label} is already running.`);
  }

  const job: QuickJob = { id: newId(), provider: id, label: def.label, group: def.group, status: 'running', startedAt: Date.now(), limit, progress: blank(limit) };
  jobs.set(job.id, job);
  try {
    const cd = await sourceCooldown(def.healthKey);
    if (cd.state === 'rate_limited' || cd.state === 'cooling') throw new QuickError('RATE_LIMITED', MSG.rateLimited(cd.until), cd.until, 429);
    if (id === 'ncbi') {
      const lim = ncbiLimits(); const used = await usedToday(db);
      if (used.archives >= lim.maxArchivesPerDay || used.bytes >= lim.maxBytesPerDay) throw new QuickError('QUOTA', MSG.quota(nextUtcMidnight()), nextUtcMidnight(), 429);
    }
  } catch (e) {
    jobs.delete(job.id); unlockProvider(def.lock, 'manual');
    throw e;
  }

  void (async () => {
    const started = Date.now();
    try {
      const position = opts.advanced ? null : await readPosition(id);
      await audit(admin, 'QUICK_IMPORT_STARTED', { provider: id, limit, mode: opts.advanced ? 'advanced' : 'quick', resumedFrom: opts.advanced ? { cursor: opts.advanced.startToken, from: opts.advanced.from } : position });
      const ctx: Ctx = {
        job, limit, admin, position, fixed: opts.advanced ? { startToken: opts.advanced.startToken, from: opts.advanced.from } : undefined,
        progress: p => { job.progress = { ...job.progress, ...p }; },
      };
      const out = await def.run(ctx);
      const result: QuickResult = { ...out, provider: id, label: def.label, group: def.group, limit, durationMs: Date.now() - started };
      await record(def, result, admin, opts.advanced ? 'Advanced import' : 'Quick Import');
      Object.assign(job, { status: 'done', result, finishedAt: Date.now() });
      job.progress = { ...job.progress, stage: 'Done', open: false, checked: result.checked, added: result.added, held: result.alreadyHeld, review: result.needsReview, skipped: result.skipped, failed: result.failed };
    } catch (e: any) {
      const qe = await asQuickError(e, def.healthKey);
      await audit(admin, 'QUICK_IMPORT_FAILED', { provider: id, code: qe.code, message: qe.message }).catch(() => {});
      await db.ingestionRun.create({ data: { phase: def.group, source: def.label, error: qe.message.slice(0, 500), note: `Manual · Quick Import · ${def.label} — ${qe.code === 'RATE_LIMITED' || qe.code === 'QUOTA' ? 'rate limited' : 'did not run'}`, durationMs: Date.now() - started } }).catch(() => {});
      Object.assign(job, { status: 'error', finishedAt: Date.now(), error: { code: qe.code, message: qe.message, until: qe.until ? qe.until.toISOString() : null, written: job.progress.added } });
    } finally {
      unlockProvider(def.lock, 'manual');
      setTimeout(() => jobs.delete(job.id), 30 * 60_000).unref?.();
    }
  })();

  return job;
}

/** The run log row, the lifetime counters and the audit entry that holds the position — nothing the engine's checkpoints depend on. */
async function record(def: Def, r: QuickResult, admin: any, how: string) {
  const bits = [`${r.checked} ${def.id === 'ncbi' ? 'archives' : 'checked'}`, `${r.added} added`];
  if (r.enriched) bits.push(`${r.enriched} enriched`);
  if (r.alreadyHeld) bits.push(`${r.alreadyHeld} already held`);
  if (r.needsReview) bits.push(`${r.needsReview} sent to review`);
  if (r.skipped) bits.push(`${r.skipped} skipped${r.unchanged ? ` (${r.unchanged} unchanged since the last sync)` : ''}`);
  if (r.failed) bits.push(`${r.failed} failed to write`);
  const note = `Manual · ${how} · ${bits.join(' · ')}${r.partial ? ` — ${r.partial}` : ''}`;

  const row: any = { phase: def.group, source: def.label, durationMs: r.durationMs, more: r.moreAvailable, note: note.slice(0, 900) };
  if (def.group === 'Journals') Object.assign(row, { journalsSeen: r.counters?.seen ?? r.added, journalsAccepted: r.counters?.accepted ?? 0, journalsRefused: r.counters?.metadataOnly ?? 0, needsReview: r.needsReview || 0, skippedHeld: def.id === 'doaj' ? 0 : r.alreadyHeld });
  else if (r.byDepartment) Object.assign(row, runColumnsFromStats(r.byDepartment));      // the run's totals ARE the sums of its breakdown
  else Object.assign(row, { added: r.added, skippedHeld: r.alreadyHeld, skippedFailed: r.failed, skippedRejected: r.skipped, needsReview: r.needsReview });
  if (def.group === 'Books') { row.checked = r.checked; if (r.uniqueCandidates != null) row.uniqueCandidates = r.uniqueCandidates; }   // a Book run must account for every candidate it examined (accounting.ts)
  else row.checked = r.checked;                               // the other kinds are not reconciled, but unique yield is measured against it
  if (def.group !== 'Journals' && r.enriched) row.enriched = r.enriched;
  if (r.duplicateConflicting) row.duplicateConflicting = r.duplicateConflicting;
  // The same writer the continuous engine uses: the run and its department breakdown, together or not at all.
  await createRunWithStats(row, def.group === 'Journals' ? null : r.byDepartment, def.group === 'Books' ? 'Books' : 'Articles');

  const inc: any = {};
  if (def.group === 'Journals') Object.assign(inc, { journalsSeen: { increment: r.counters?.seen ?? r.added }, journalsAccepted: { increment: r.counters?.accepted ?? 0 }, journalsRejected: { increment: r.counters?.metadataOnly ?? 0 } });
  else if (def.group === 'Articles') Object.assign(inc, { articlesAdded: { increment: r.added }, articlesSkipped: { increment: r.alreadyHeld + r.failed } });
  else Object.assign(inc, { booksAdded: { increment: r.added }, booksSkipped: { increment: r.alreadyHeld + r.failed + r.skipped } });
  await db.ingestionState.update({ where: { id: 'singleton' }, data: inc }).catch(() => {});

  await audit(admin, 'QUICK_IMPORT_FINISHED', {
    provider: def.id, position: r.nextPosition,
    summary: { checked: r.checked, added: r.added, alreadyHeld: r.alreadyHeld, needsReview: r.needsReview, skipped: r.skipped, failed: r.failed, enriched: r.enriched ?? 0, partial: r.partial ?? null },
  });
}
