import { releaseClaim } from './claims.js';
import { articleMinYear } from './yearPolicy.js';
import { INGESTION_POLICY, days, schedulerV2, incrementalSyncEnabled } from './policy.js';
import { SourceError, fetchCrossrefForJournal } from './articleSources.js';
import { judgeVerifyWrite } from './articlePipeline.js';
import { readCursor, writeCursor } from './journalCursor.js';
import { recordSourceFailure } from './sourceHealth.js';
import { pickJournal, visitJournal, finishJournalVisit, ingestionDb } from '../ingestionWorker.js';
import { runSearchProvider } from './quickImport.js';
import { totals } from './departmentStats.js';
import type { TurnCtx, TurnOutcome, TurnRan, CursorResult } from './rotation.js';
import { restingForSearch } from './quickImport.js';

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
  /** Of the duplicates: held records completed from this source (⊂ skippedHeld), and ones that disagreed on rights or DOI and were left alone. */
  enriched?: number; conflicting?: number;
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

  // Incremental sync. A journal whose whole window has been read once is asked only for what Crossref has indexed since that walk began, not for the window
  // again (a weekly re-read of records we already hold). The baseline is valid only for the same year policy; a walk already under way keeps the baseline
  // it started with, and the day it began is remembered so a record indexed while the walk was still going is not missed.
  const today = new Date().toISOString().slice(0, 10);
  const [sinceDay, sinceYear] = String(readCursor(journal.fetchCursor, 'crossrefSince') || '').split('|');
  const indexedSince = incrementalSyncEnabled() && /^\d{4}-\d{2}-\d{2}$/.test(sinceDay || '') && Number(sinceYear) === fromYear ? sinceDay : null;
  // A walk begun before this existed has no recorded day: its true start is unknown, so it earns no baseline (the next walk reads the window once more, properly).
  const walkStart: string | null = offset > 0 ? readCursor(journal.fetchCursor, 'crossrefWalk') : today;
  const baselineAfterThisWalk: string | null = walkStart && /^\d{4}-\d{2}-\d{2}$/.test(walkStart) ? `${new Date(Date.parse(`${walkStart}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)}|${fromYear}` : null;

  let got;
  try {
    got = await fetchCrossrefForJournal(journal, fromYear, rows, offset, indexedSince);
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
    const finished = incrementalSyncEnabled() ? writeCursor(writeCursor(writeCursor(journal.fetchCursor, 'crossref', null), 'crossrefSince', baselineAfterThisWalk), 'crossrefWalk', null) : writeCursor(journal.fetchCursor, 'crossref', null);
    await p.journal.update({
      where: { id: journal.id },
      data: {
        lastIngestedAt: new Date(), fetchCursor: finished, exhaustedAt: new Date(),
        nextEligibleAt: new Date(Date.now() + days(INGESTION_POLICY.cooldown.exhaustedDays)),
        noChangeCount: (journal.noChangeCount || 0) + 1, failureCount: 0, lastIngestionStatus: 'exhausted', claimedAt: null, claimedBy: null,
      },
    });
    return { ...base, checked: 0, added: 0, skippedHeld: 0, skippedFailed: 0, skippedRejected: 0, needsReview: 0, note: 'nothing new in this journal' };
  }

  const cands = got.items.map(i => ({ ...i, department: journal.domain || '' as any, extra: i.extra ?? null }));
  const pipe = await judgeVerifyWrite(cands, null, { maxWrites: v2 ? remaining : undefined, skippedAtFetch: got.skipped });
  const next = got.fetched >= rows ? String(offset + got.fetched) : null;     // a short page is the end of what Crossref holds for this window
  const fin = await finishJournalVisit(journal, cap, v2, {
    added: pipe.sum.added, needsReview: pipe.sum.reviewWritten, next, provider: 'crossref',
    // At the end of a walk the baseline moves up; part-way through, the day the walk began is kept. A journal that ends "full" forgets both (finishJournalVisit).
    extras: incrementalSyncEnabled() ? { crossrefSince: next ? undefined : baselineAfterThisWalk, crossrefWalk: next ? walkStart : null } : undefined,
  });
  return {
    ...base, checked: got.fetched, added: pipe.sum.added, skippedHeld: pipe.heldAlready + pipe.sum.held, skippedFailed: pipe.sum.failed,
    enriched: pipe.dup.enriched, conflicting: pipe.dup.conflicting,
    skippedRejected: got.skipped + pipe.rejected + pipe.sum.rejected, needsReview: pipe.sum.reviewWritten,
    more: Boolean(next) && !fin.full, error: pipe.sum.failed ? pipe.sum.firstError ?? null : null,
    note: [recovered ? 'took over an abandoned claim' : null, fin.full ? `holds ${fin.articles} articles, the limit set` : next ? undefined : 'reached the end of this journal'].filter(Boolean).join(' · ') || undefined,
  };
}

/** When the first journal in scope is due again (cooldowns), or null when none is cooling. For the scheduler's "come back at" time when nothing is due now. */
async function nextJournalDue(departments: string[] | undefined, cap: number, exclude: string[]): Promise<Date | null> {
  const where: any = {
    status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration', nextEligibleAt: { gt: new Date() },
    ...(departments?.length ? { domain: { in: departments } } : {}),
    ...(cap > 0 ? { articleCount: { lt: cap } } : {}),
    ...(exclude.length ? { AND: [{ OR: [{ domain: null }, { domain: { notIn: exclude } }] }] } : {}),
  };
  const a = await p.journal.aggregate({ where, _min: { nextEligibleAt: true } }).catch(() => null);
  return (a?._min?.nextEligibleAt as Date | null) ?? null;
}

/** Walk due journals with one source until the turn's budget is spent, the journals run out, or the source asks us to stop. */
async function journalTurn(kind: 'openalex' | 'crossref', ctx: TurnCtx): Promise<TurnOutcome> {
  const state = ctx.state; const v2 = schedulerV2();
  const cap = Math.max(0, state.articlesPerJournal ?? 0);
  const started = Date.now();
  const rows: Record<string, any>[] = [];
  const t = { checked: 0, added: 0, held: 0, review: 0, skipped: 0, failed: 0, enriched: 0, conflicting: 0 };
  let visited = 0, stoppedBy: Visit['providerFailure'] | null = null, firstError: string | null = null;
  // Where this turn asked, by department: a department is the cursor. One that has given nothing for several turns is left alone (ctx.restingCursors)
  // while the others carry on; only when none is left does the provider as a whole rest.
  const byDept = new Map<string, CursorResult>();

  while (t.checked < ctx.batch && visited < MAX_JOURNALS_PER_TURN && Date.now() - started < TURN_BUDGET_MS) {
    const picked = await pickJournal(ctx.narrowed ? ctx.wanted : undefined, cap, v2, ctx.restingCursors);
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
    if (r.journal && r.department) {
      const c = byDept.get(r.department) ?? { key: r.department, department: r.department, checked: 0, useful: 0 };
      c.checked += r.checked || 0; c.useful += (r.added || 0) + (r.needsReview || 0) + (r.enriched || 0);
      byDept.set(r.department, c);
    }
    if (r.journal) {
      t.checked += r.checked || 0; t.added += r.added; t.held += r.skippedHeld; t.review += r.needsReview; t.skipped += r.skippedRejected; t.failed += r.skippedFailed;
      t.enriched += r.enriched || 0; t.conflicting += r.conflicting || 0;
      rows.push({
        journalId: r.journalId ?? null, journalTitle: r.journal, checked: r.checked || 0, added: r.added, skippedHeld: r.skippedHeld, skippedFailed: r.skippedFailed,
        enriched: r.enriched || 0, duplicateConflicting: r.conflicting || 0,
        skippedRejected: r.skippedRejected, needsReview: r.needsReview, more: !!r.more, error: r.providerFailure ? `Provider request failed — ${r.providerFailure.error}`.slice(0, 500) : r.error ?? null,
        note: [`${r.checked || 0} checked`, r.note].filter(Boolean).join(' · '),
      });
    }
    if (stoppedBy) break;                                  // the source is resting or failing: the next one takes the turn
    await sleep(pauseMs(kind));
  }

  if (stoppedBy && !t.checked) return { kind: 'request-failed', error: stoppedBy.error, status: stoppedBy.status, rateLimited: stoppedBy.rateLimited };
  if (!visited) {
    const resting = ctx.restingCursors.length;
    return { kind: 'nothing-due', until: await nextJournalDue(ctx.narrowed ? ctx.wanted : undefined, cap, ctx.restingCursors),
      note: resting ? `No journal is due outside the ${resting} department${resting === 1 ? '' : 's'} resting for now` : 'No journal is due for articles right now' };
  }
  const out: TurnRan = {
    kind: 'ran', checked: t.checked, added: t.added, held: t.held, enriched: t.enriched, sentToReview: t.review, skipped: t.skipped, recordFailures: t.failed,
    useful: t.added + t.review + t.enriched, more: true, rows, cursors: [...byDept.values()], duplicateConflicting: t.conflicting,
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
  const skip = restingForSearch(id, ctx.restingCursors);
  try {
    out = await runSearchProvider(id, ctx.batch, ctx.position, { skip });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (e instanceof SourceError && e.kind === 'invalid') await recordSourceFailure(id === 'europepmc' ? 'EuropePMC' : 'arXiv', msg).catch(() => {});
    return { kind: 'request-failed', error: msg, status: e?.status ?? null, rateLimited: e instanceof SourceError && e.status === 429 };
  }
  ctx.savePosition(out.nextPosition);
  const stats = out.byDepartment || {};
  const tot = totals(stats);
  // Nothing was asked because every department is resting: the provider has no cursor left.
  if (out.allResting) return { kind: 'nothing-due', note: 'Every department is resting for now' };
  // The department is the cursor: what each gave this turn (added + sent to review is useful; a department that only returned what we already hold is not).
  const cursors: CursorResult[] = Object.entries(stats).filter(([d]) => d).map(([d, v]: [string, any]) => ({
    key: d, department: d, checked: (v.added || 0) + (v.held || 0) + (v.sentToReview || 0) + (v.skipped || 0) + (v.failed || 0), useful: (v.added || 0) + (v.sentToReview || 0),
  }));
  // Duplicates completed from this source belong to the departments they were found in (the ones that saw the most duplicates take them first).
  let left = out.enriched ?? 0;
  for (const c of [...cursors].sort((a, b) => ((stats[b.key] as any)?.held || 0) - ((stats[a.key] as any)?.held || 0))) {
    if (left <= 0) break;
    const take = Math.min(left, (stats[c.key] as any)?.held || 0); c.useful += take; left -= take;
  }
  return {
    kind: 'ran', checked: out.checked, added: tot.added, held: tot.held, enriched: out.enriched ?? 0, sentToReview: tot.sentToReview, skipped: tot.skipped, recordFailures: tot.failed,
    useful: tot.added + tot.sentToReview + (out.enriched ?? 0), more: out.moreAvailable, note: out.partial || null, duplicateConflicting: out.duplicateConflicting ?? 0,
    departmentStats: stats, cursors, ledger: { articlesAdded: tot.added, articlesSkipped: tot.held + tot.failed },
  };
}
