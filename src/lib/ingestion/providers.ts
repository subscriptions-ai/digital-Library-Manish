import { ingestionDb as db } from './db.js';
import { setProviders, setTargetedPolicy, type ProviderDef, type TurnCtx, type TurnOutcome } from './rotation.js';
import { targetedTurn, loadPriorityConfig, nextBooksTurn, isTargetedTurn } from './targetedBooks.js';
import { totals } from './departmentStats.js';
import { harvestFeed, harvestDue, DOAB_OAI, OAPEN_OAI, OTL_FEED, NCBI_FEED, type OaiProviderConfig, type HarvestReport } from './books/oaiHarvest.js';
import { ncbiLimits, usedToday } from './books/ncbi.js';
import { crossrefTurn, openAlexTurn, searchTurn } from './articleTurns.js';
import { fetchCrossrefJournals, fetchOpenAlexSources, writeJournalCandidates, type JournalPage } from './journalSources.js';
import { SourceError } from './articleSources.js';
import { recordSourceFailure, classifyFailure } from './sourceHealth.js';
import { claimSweep, closeSweep, discoverJournalsPage, discoverBooksPage, booksOai } from '../ingestionWorker.js';
import { releaseClaim } from './claims.js';

/**
 * The providers, as the rotation scheduler sees them: who they are, what they are for, how to tell whether they can be asked,
 * and how to take one turn. Nothing here is a second implementation of anything — each turn calls the code the engine and Quick
 * Import already share (the DOAJ sweeps, harvestFeed, the article pipeline) and reports what happened in one common shape.
 *
 * Roles (the approved architecture):
 *   JOURNALS  DOAJ (primary) → ROAD/ISSN → Crossref Journals → OpenAlex Sources   (the last three are fallbacks)
 *   ARTICLES  Crossref (primary) → OpenAlex (fallback) → Europe PMC → arXiv
 *   BOOKS     DOAB → OAPEN → Open Textbook Library → NCBI Bookshelf                (all rotate; NCBI review-first and quota-bound)
 */

const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d; };

// ── Journals ────────────────────────────────────────────────────────────────

const doajTurn = async (ctx: TurnCtx): Promise<TurnOutcome> => {
  const sweep = await claimSweep('DOAJ', ctx.wanted);
  if (!sweep) return { kind: 'nothing-due', note: 'Every DOAJ search has been walked out; they reopen within 30 days' };
  const r: any = await discoverJournalsPage(sweep);
  if (r.failed) return { kind: 'request-failed', error: r.error || 'DOAJ did not answer', status: r.status ?? null, rateLimited: !!r.rateLimited };
  if (r.refused) {
    // Answered, and said no to this search: not the source being down. The sweep went to the back of the queue.
    return { kind: 'ran', checked: 0, added: 0, held: 0, enriched: 0, sentToReview: 0, skipped: 0, recordFailures: 0, useful: 0, more: false,
      note: `"${sweep.term}": DOAJ refused this search (HTTP ${r.status}) — moved on to another`, journal: { department: sweep.department } };
  }
  return {
    kind: 'ran', checked: r.seen, added: r.created, held: Math.max(0, r.seen - r.created), enriched: r.enriched, sentToReview: 0, skipped: 0, recordFailures: 0,
    useful: r.created + r.enriched, more: r.more,
    note: r.seen ? `"${sweep.term}" page ${sweep.position + 1}: ${r.accepted} accepted, ${r.rejected} refused on licence` : `"${sweep.term}" has no more to give`,
    columns: { journalsSeen: r.seen, journalsAccepted: r.accepted, journalsRefused: r.rejected },
    ledger: { journalsSeen: r.seen, journalsAccepted: r.accepted, journalsRejected: r.rejected },
    journal: { department: sweep.department },
  };
};

type JournalFetch = (term: string, position: number, size: number) => Promise<JournalPage>;

/** A journal source that lists journals by search term: walk a department's term one page at a time, from the engine's own sweep. */
async function journalSourceTurn(sweepSource: string, label: 'Crossref Journals' | 'OpenAlex Sources' | 'ROAD', healthKey: string, fetchPage: JournalFetch, ctx: TurnCtx): Promise<TurnOutcome> {
  const sweep = await claimSweep(sweepSource, ctx.wanted);
  if (!sweep) return { kind: 'nothing-due', note: `Every ${label} search has been walked out; they reopen within 30 days` };
  let page: JournalPage;
  try {
    page = await fetchPage(sweep.term, sweep.position, ctx.batch);
  } catch (e: any) {
    await releaseClaim('departmentSweep', sweep.id);                    // left exactly where it was
    const msg = String(e?.message || e);
    // A request that went through the source breaker has recorded its own failure; anything else that threw is counted here, once.
    if (!(e instanceof SourceError) || e.kind === 'invalid') await recordSourceFailure(healthKey, msg).catch(() => {});
    return { kind: 'request-failed', error: msg, status: e?.status ?? null, rateLimited: e instanceof SourceError && e.status === 429 };
  }
  const w = await writeJournalCandidates(label, sweep.department, page.items, page.fetched, page.skipped);
  const full = page.fetched >= ctx.batch;
  await closeSweep(sweep, { seen: page.fetched, accepted: 0, rejected: 0 }, sweep.position + 1, full);
  return {
    kind: 'ran', checked: w.checked, added: 0, held: w.held, enriched: w.enriched,
    // New journals from these sources are never accepted: they wait for a person, with their open-access status unverified.
    sentToReview: w.created, skipped: w.skipped, recordFailures: w.failed,
    useful: w.created + w.enriched, more: full, error: w.firstError,
    note: `"${sweep.term}" page ${sweep.position + 1}: ${w.created} new journals held for review (open access unverified)`,
    columns: { journalsSeen: w.checked },
    ledger: { journalsSeen: w.checked },
    journal: { department: sweep.department },
  };
}

/**
 * ROAD, the ISSN Centre's directory of open-access resources, has no public machine interface this engine can rely on (its
 * records are an HTML site and a bulk dump, and the ISSN portal's fuller data is behind a subscription), so there is nothing
 * honest to call. The slot is real — it sits in the chain, is skipped with a reason, and a connector registered here is picked up
 * with no scheduler change — but until one exists ROAD says "not connected" rather than pretending.
 */
export type RoadAdapter = (term: string, position: number, size: number) => Promise<JournalPage>;
let roadAdapter: RoadAdapter | null = null;
export const registerRoadAdapter = (a: RoadAdapter | null) => { roadAdapter = a; };
export const getRoadAdapter = () => roadAdapter;

// ── Books ───────────────────────────────────────────────────────────────────

function bookProvider(cfg: OaiProviderConfig, id: string, label: string, healthKey: string, envOff: string | null): ProviderDef {
  const isNcbi = cfg.kind === 'ncbi';
  return {
    id, label, group: 'Books', tier: 'supplementary', healthKey, lock: cfg.provider,
    role: isNcbi ? 'Biomedical and health books, review-first' : id === 'doab' ? 'Scholarly open-access books' : id === 'oapen' ? 'Scholarly open-access books and enrichment' : 'Academic textbooks',
    configured: () => (envOff && process.env[envOff] === '0' ? `switched off (${envOff}=0)` : id !== 'doab' && !booksOai() ? 'switched off (BOOKS_OAI=0)' : true),
    // A daily quota is an expected rest, not a failure: it is read from the download log, never recorded as a source failure.
    restingNow: isNcbi ? async () => {
      const lim = ncbiLimits(); const used = await usedToday(db);
      if (used.archives >= lim.maxArchivesPerDay) return { until: nextUtcMidnight(), reason: `daily limit of ${lim.maxArchivesPerDay} archives reached — resumes after midnight UTC` };
      if (used.bytes >= lim.maxBytesPerDay) return { until: nextUtcMidnight(), reason: 'daily download limit reached — resumes after midnight UTC' };
      return null;
    } : undefined,
    turn: async (ctx: TurnCtx): Promise<TurnOutcome> => {
      // With the OAI path off, DOAB goes back to its keyword sweeps (one department per page); the others are off with it.
      if (id === 'doab' && !booksOai()) return legacyDoabSweepTurn(ctx);
      if (!(await harvestDue(cfg, { waitForAfter: false }))) return { kind: 'nothing-due', note: 'Caught up — nothing new since the last sync' };

      const batch = ctx.batch;
      let archiveCap: number | undefined;
      if (isNcbi) {
        // The effective NCBI batch is the smaller of the generic batch and what the daily limits still allow.
        const lim = ncbiLimits(); const used = await usedToday(db);
        archiveCap = Math.max(0, Math.min(batch, lim.maxArchivesPerDay - used.archives));
        if (archiveCap <= 0) return { kind: 'quota', until: nextUtcMidnight(), note: 'daily limit reached' };
      }
      let h: HarvestReport;
      try {
        h = await harvestFeed(cfg, {
          maxRecords: isNcbi ? undefined : batch,
          maxPages: isNcbi ? Math.ceil(archiveCap! / Math.max(1, ncbiLimits().archivesPerBatch)) + 1 : Math.max(2, Math.ceil(batch / 10)),
          ...(isNcbi ? { archiveCap } : {}),
        });
      } catch (e: any) {
        // Something threw. If it was a request, the source's own health row already says so; if it was not (the database, our code), it must
        // not be counted against the provider, and the scheduler is told so.
        return { kind: 'request-failed', error: String(e?.message || e).slice(0, 300), internal: classifyFailure(e) === 'unknown' };
      }
      // Not one page arrived: the source did not answer. (Its health row already says so.)
      if (h.sourceError && !h.pages) return { kind: 'request-failed', error: h.sourceError, rateLimited: /\b429\b/.test(h.sourceError) };
      if (h.deferred && !h.pages && !h.added) return { kind: 'quota', until: nextUtcMidnight(), note: h.deferred };

      const stats = h.departmentStats; const t = totals(stats);
      const dups = Object.values(h.duplicates).reduce((a: number, b: any) => a + b, 0);
      const checked = isNcbi ? (h.ncbi?.archives ?? 0) : h.fetched;
      return {
        kind: 'ran', checked, added: t.added, held: t.held, enriched: h.enriched, sentToReview: t.sentToReview, skipped: t.skipped, recordFailures: t.failed,
        useful: t.added + h.enriched + t.sentToReview, more: !h.completed, error: h.firstError, departmentStats: stats,
        // The source stopped answering part-way through: one failed REQUEST, reported apart from the records it did give us.
        requestFailures: h.sourceError && !/resumption token expired/.test(h.sourceError) ? 1 : 0,
        note: [
          h.completed ? 'caught up' : null,
          h.deferred ? `paused: ${h.deferred}` : null,
          h.sourceError ? `${label} stopped answering part-way (${h.sourceError}); what was read before that was kept` : null,
          isNcbi ? 'review-first: nothing is published automatically' : null,
        ].filter(Boolean).join(' · ') || null,
        ledger: { booksAdded: t.added, booksSkipped: dups + t.skipped + t.failed },
      };
    },
  };
}

/** BOOKS_OAI=0: DOAB by keyword sweep, one department per page. The department is the sweep's, so it is the department of every book added. */
async function legacyDoabSweepTurn(ctx: TurnCtx): Promise<TurnOutcome> {
  const sweep = await claimSweep('DOAB', ctx.wanted);
  if (!sweep) return { kind: 'nothing-due', note: 'Every DOAB search has been walked out; they reopen within 30 days' };
  const r: any = await discoverBooksPage(sweep).catch(async (e: any) => { await releaseClaim('departmentSweep', sweep.id); throw e; });
  return {
    kind: 'ran', checked: r.seen ?? (r.added + r.skippedHeld + r.skippedFailed), added: r.added, held: r.skippedHeld, enriched: 0, sentToReview: 0, skipped: 0,
    recordFailures: r.skippedFailed, useful: r.added, more: r.more, error: r.error ?? null,
    departmentStats: { [sweep.department]: { added: r.added, held: r.skippedHeld, sentToReview: 0, skipped: 0, failed: r.skippedFailed } },
    note: `"${sweep.term}" from ${sweep.position}: ${r.added} added, ${r.skippedHeld} already held`,
    ledger: { booksAdded: r.added, booksSkipped: r.skippedHeld + r.skippedFailed },
  };
}

// ── The list ────────────────────────────────────────────────────────────────


export function buildProviders(): ProviderDef[] {
  return [
    // Journals
    { id: 'doaj', label: 'DOAJ', group: 'Journals', tier: 'primary', role: 'Primary open-access journal source', healthKey: 'DOAJ', lock: 'DOAJ', turn: doajTurn },
    {
      id: 'road', label: 'ROAD / ISSN', group: 'Journals', tier: 'fallback', fallbackFor: ['doaj'], role: 'Open-access journal fallback', healthKey: 'ROAD', lock: 'ROAD',
      configured: () => (roadAdapter ? true : 'not connected — ROAD has no public data interface this engine can use yet'),
      turn: ctx => journalSourceTurn('ROAD', 'ROAD', 'ROAD', (t, pos, n) => roadAdapter!(t, pos, n), ctx),
    },
    {
      id: 'crossrefjournals', label: 'Crossref Journals', group: 'Journals', tier: 'fallback', fallbackFor: ['doaj', 'road'], role: 'Journal identity and ISSN fallback (open access unverified)', healthKey: 'Crossref', lock: 'CrossrefJournals',
      turn: ctx => journalSourceTurn('CrossrefJournals', 'Crossref Journals', 'Crossref', (t, pos, n) => fetchCrossrefJournals(t, pos * n, n), ctx),
    },
    {
      id: 'openalexsources', label: 'OpenAlex Sources', group: 'Journals', tier: 'fallback', fallbackFor: ['doaj', 'road', 'crossrefjournals'], role: 'Supplementary journal fallback (open access unverified)', healthKey: 'OpenAlex', lock: 'OpenAlexSources',
      turn: ctx => journalSourceTurn('OpenAlexSources', 'OpenAlex Sources', 'OpenAlex', (t, pos, n) => fetchOpenAlexSources(t, pos + 1, n), ctx),
    },
    // Articles
    { id: 'crossref', label: 'Crossref', group: 'Articles', tier: 'primary', role: 'Primary article source', healthKey: 'Crossref', lock: 'Crossref', turn: crossrefTurn },
    { id: 'openalex', label: 'OpenAlex', group: 'Articles', tier: 'fallback', fallbackFor: ['crossref'], role: 'Article fallback', healthKey: 'OpenAlex', lock: 'OpenAlex', turn: openAlexTurn },
    { id: 'europepmc', label: 'Europe PMC', group: 'Articles', tier: 'supplementary', role: 'Medical and life-science articles', healthKey: 'EuropePMC', lock: 'EuropePMC', turn: ctx => searchTurn('europepmc', ctx) },
    { id: 'arxiv', label: 'arXiv', group: 'Articles', tier: 'supplementary', role: 'Preprints', healthKey: 'arXiv', lock: 'arXiv', turn: ctx => searchTurn('arxiv', ctx) },
    // Books
    bookProvider(DOAB_OAI, 'doab', 'DOAB', 'DOAB', null),
    bookProvider(OAPEN_OAI, 'oapen', 'OAPEN', 'OAPEN', 'BOOKS_OAPEN'),
    bookProvider(OTL_FEED, 'otl', 'Open Textbook Library', 'open.umn.edu', 'BOOKS_OTL'),
    bookProvider(NCBI_FEED, 'ncbi', 'NCBI Bookshelf', 'NCBI', 'BOOKS_NCBI'),
    // Not a source: the low-coverage engine. Each of the sources it reads keeps its own health row, so this one never has a failure of its own.
    {
      id: 'targeted', label: 'Targeted coverage', group: 'Books', tier: 'supplementary', role: 'Books for the departments that hold the fewest',
      healthKey: 'Targeted', lock: 'Targeted', turn: targetedTurn,
    },
  ];
}

/** Register the real providers with the scheduler. Safe to call more than once. */
export function installProviders() {
  setProviders(buildProviders());
  // Of every ten Books turns, the configured share go to the lowest-covered department first (see targetedBooks.ts).
  setTargetedPolicy(async () => { const c = await loadPriorityConfig(); return c.enabled && isTargetedTurn(await nextBooksTurn(), c.share); });
}
