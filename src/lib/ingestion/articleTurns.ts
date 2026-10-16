import { releaseClaim } from './claims.js';
import { articleMinYear } from './yearPolicy.js';
import { INGESTION_POLICY, days, schedulerV2 } from './policy.js';
import { SourceError, fetchCrossrefForJournal } from './articleSources.js';
import { judgeVerifyWrite } from './articlePipeline.js';
import { readCursor, writeCursor } from './journalCursor.js';
import { recordSourceFailure } from './sourceHealth.js';
import { pickJournal, visitJournal, finishJournalVisit, ingestionDb } from '../ingestionWorker.js';
import { runSearchProvider } from './quickImport.js';
import { totals } from './departmentStats.js';
import type { TurnCtx, TurnOutcome, TurnRan } from './rotation.js';

/**
 * The continuous engine's article turns.
 *
 * Crossref and OpenAlex go journal by journal, taking the journals most due first (with the engine's own claims, cooldowns and
 * per-journal limit), so ten thousand journals each get their turn and no single one is walked to its end first. Europe PMC and
 * arXiv are searched by department, exactly as Quick Import does it. Every source's records go through the same judging and the same
 * writer; only where to ask differs.
 *
 * A turn looks at up to INGESTION_BATCH_SIZE candidates, pauses between requests, and stops at once when the source says it is
 * resting — the scheduler then hands the turn to the next source. A source that was unreachable is reported as that, never as
 * "nothing new".
 */

const p = ingestionDb;
const pauseMs = (kind: 'openalex' | 'crossref') => {
  const v = Number(process.env[`INGESTION_PAUSE_MS_${kind.toUpperCase()}`] ?? process.env.INGESTION_ARTICLE_PAUSE_MS);
  return Number.isFinite(v) && v >= 0 ? v : kind === 'crossref' ? 150 : 250;
};
const sleep = (ms: number) => (ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());
const MAX_JOURNALS_PER_TURN = 40;
const TURN_BUDGET_MS = 3 * 60_000;

type Visit = {
  journal: string | null; journalId?: string; department?: string | null;
  checked: number; added: number; skippedHeld: number; skippedFailed: number; skippedRejected: number; needsReview: number;
  more?: boolean; error?: string | null; note?: string;
  providerFailure?: { paused: boolean; rateLimited: boolean; status: number | null; error: string };
};

const sourceLabel = { openalex: 'OpenAlex', crossref: 'Crossref' } as const;

/** Crossref, one journal: its articles by ISSN, judged and written by the shared pipeline, the journal's row kept as the engine keeps it. */
export async function visitJournalCrossref(journal: any, state: any, cap: number, v2: boolean, recovered: boolean, rowsBudget: number): Promise<Visit> {
  const fromYear = articleMinYear(state);                // the article policy year: Crossref is asked for nothing older
  const remaining = cap > 0 ? Math.max(0, cap - (journal.articleCount || 0)) : Number.POSITIVE_INFINITY;
  const rows = Math.max(10, Math.min(INGESTION_POLICY.articles.pageMax, cap > 0 ? Math.max(remaining, INGESTION_POLICY.articles.pageMin) : state.batchSize, rowsBudget));
  const offset = Number(readCursor(journal.fetchCursor, 'crossref')) || 0;
  const base = { journal: journal.title as string, journalId: journal.id as string, department: journal.domain as string | null };

  let got;
  try {
    got = await fetchCrossrefForJournal(journal, fromYear, rows, offset);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // A response we could not read is the source failing to be usable: count it once, the way a failed request is counted.
    if (e instanceof SourceError && e.kind === 'invalid') await recordSourceFailure('Crossref', msg).catch(() => {});
    return {
      ...base, checked: 0, added: 0, skippedHeld: 0, skippedFailed: 0, skippedRejected: 0, needsReview: 0, error: msg,
      providerFailure: { paused: e instanceof SourceError && e.kind === 'rate_limited' && e.status !== 429, rateLimited: e instanceof SourceError && e.status === 429, status: e?.status ?? null, error: msg },
    };
  }

  // Nothing in the window: look again next week, never sooner. Only Crossref's own place is cleared.
  if (!got.fetched) {
    await p.journal.update({
      where: { id: journal.id },
      data: {
        lastIngestedAt: new Date(), fetchCursor: writeCursor(journal.fetchCursor, 'crossref', null), exhaustedAt: new Date(),
        nextEligibleAt: new Date(Date.now() + days(INGESTION_POLICY.cooldown.exhaustedDays)),
        noChangeCount: (journal.noChangeCount || 0) + 1, failureCount: 0, lastIngestionStatus: 'exhausted', claimedAt: null, claimedBy: null,
      },
    });
    return { ...base, checked: 0, added: 0, skippedHeld: 0, skippedFailed: 0, skippedRejected: 0, needsReview: 0, note: 'nothing new in this journal' };
  }

  const cands = got.items.map(i => ({ ...i, department: journal.domain || '' as any, extra: i.extra ?? null }));
  const pipe = await judgeVerifyWrite(cands, null, { maxWrites: v2 ? remaining : undefined, skippedAtFetch: got.skipped });
  const next = got.fetched >= rows ? String(offset + got.fetched) : null;     // a short page is the end of what Crossref holds for this window
  const fin = await finishJournalVisit(journal, cap, v2, { added: pipe.sum.added, needsReview: pipe.sum.reviewWritten, next, provider: 'crossref' });
  return {
    ...base, checked: got.fetched, added: pipe.sum.added, skippedHeld: pipe.heldAlready + pipe.sum.held, skippedFailed: pipe.sum.failed,
    skippedRejected: got.skipped + pipe.rejected + pipe.sum.rejected, needsReview: pipe.sum.reviewWritten,
    more: Boolean(next) && !fin.full, error: pipe.sum.failed ? pipe.sum.firstError ?? null : null,
    note: [recovered ? 'took over an abandoned claim' : null, fin.full ? `holds ${fin.articles} articles, the limit set` : next ? undefined : 'reached the end of this journal'].filter(Boolean).join(' · ') || undefined,
  };
}

/** Walk due journals with one source until the turn's budget is spent, the journals run out, or the source asks us to stop. */
async function journalTurn(kind: 'openalex' | 'crossref', ctx: TurnCtx): Promise<TurnOutcome> {
  const state = ctx.state; const v2 = schedulerV2();
  const cap = Math.max(0, state.articlesPerJournal ?? 0);
  const started = Date.now();
  const rows: Record<string, any>[] = [];
  const t = { checked: 0, added: 0, held: 0, review: 0, skipped: 0, failed: 0 };
  let visited = 0, stoppedBy: Visit['providerFailure'] | null = null, firstError: string | null = null;

  while (t.checked < ctx.batch && visited < MAX_JOURNALS_PER_TURN && Date.now() - started < TURN_BUDGET_MS) {
    const picked = await pickJournal(ctx.narrowed ? ctx.wanted : undefined, cap, v2);
    if (!picked) break;
    let r: Visit;
    try {
      const budget = ctx.batch - t.checked;
      r = kind === 'crossref'
        ? await visitJournalCrossref(picked.journal, state, cap, v2, picked.recovered, budget)
        : await visitJournal(picked.journal, state, cap, v2, picked.recovered, { rowsBudget: budget }) as any;
    } finally { if (v2) await releaseClaim('journal', picked.journal.id); }
    visited++;

    if (r.providerFailure) { stoppedBy = r.providerFailure; firstError ||= r.providerFailure.error; if (!r.journalId) break; }
    if (r.journal) {
      t.checked += r.checked || 0; t.added += r.added; t.held += r.skippedHeld; t.review += r.needsReview; t.skipped += r.skippedRejected; t.failed += r.skippedFailed;
      rows.push({
        journalId: r.journalId ?? null, journalTitle: r.journal, added: r.added, skippedHeld: r.skippedHeld, skippedFailed: r.skippedFailed,
        skippedRejected: r.skippedRejected, needsReview: r.needsReview, more: !!r.more, error: r.providerFailure ? `Provider request failed — ${r.providerFailure.error}`.slice(0, 500) : r.error ?? null,
        note: [`${r.checked || 0} checked`, r.note].filter(Boolean).join(' · '),
      });
    }
    if (stoppedBy) break;                                  // the source is resting or failing: the next one takes the turn
    await sleep(pauseMs(kind));
  }

  if (stoppedBy && !t.checked) return { kind: 'request-failed', error: stoppedBy.error, status: stoppedBy.status, rateLimited: stoppedBy.rateLimited };
  if (!visited) return { kind: 'nothing-due', note: 'No journal is due for articles right now' };
  const out: TurnRan = {
    kind: 'ran', checked: t.checked, added: t.added, held: t.held, enriched: 0, sentToReview: t.review, skipped: t.skipped, recordFailures: t.failed,
    useful: t.added + t.review, more: true, rows,
    note: stoppedBy ? `${sourceLabel[kind]} stopped answering part-way (${stoppedBy.error}); what was read before that was kept` : null,
    ledger: { articlesAdded: t.added, articlesSkipped: t.held + t.failed },
  };
  return out;
}

export const openAlexTurn = (ctx: TurnCtx) => journalTurn('openalex', ctx);
export const crossrefTurn = (ctx: TurnCtx) => journalTurn('crossref', ctx);

/** Europe PMC and arXiv: searched by department, from the engine's own saved place. */
export async function searchTurn(id: 'europepmc' | 'arxiv', ctx: TurnCtx): Promise<TurnOutcome> {
  let out;
  try {
    out = await runSearchProvider(id, ctx.batch, ctx.position);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (e instanceof SourceError && e.kind === 'invalid') await recordSourceFailure(id === 'europepmc' ? 'EuropePMC' : 'arXiv', msg).catch(() => {});
    return { kind: 'request-failed', error: msg, status: e?.status ?? null, rateLimited: e instanceof SourceError && e.status === 429 };
  }
  ctx.savePosition(out.nextPosition);
  const stats = out.byDepartment || {};
  const tot = totals(stats);
  return {
    kind: 'ran', checked: out.checked, added: tot.added, held: tot.held, enriched: 0, sentToReview: tot.sentToReview, skipped: tot.skipped, recordFailures: tot.failed,
    useful: tot.added + tot.sentToReview, more: out.moreAvailable, note: out.partial || null,
    departmentStats: stats, ledger: { articlesAdded: tot.added, articlesSkipped: tot.held + tot.failed },
  };
}
