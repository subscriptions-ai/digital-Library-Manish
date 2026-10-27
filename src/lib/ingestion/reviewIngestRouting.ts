import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { approvedThresholds } from './reviewBatch.js';
import { assignDepartmentStayDraft } from './reviewAssignment.js';
import { judge, readOneForJudging, tierOf, type Thresholds, type Tier } from './reviewClassification.js';
import { CLASSIFIER_RULES_VERSION, ANALYSIS_CLASSIFIER_V2, type ClassifierVariant } from './books/classifier.js';

/**
 * Future-ingestion routing (Review Automation R3A).
 *
 * A Book the live harvest has just written as a Draft is classified once, by the same classifier and the same approved thresholds Review Automation
 * already uses. If the classification is HIGH, the suggested department is assigned and the Book stays a Draft; Medium, Low and Unclassifiable books
 * are left in the review queue exactly as the harvest wrote them. Nothing is published, and no licence, access, rights, file or source address is read
 * for writing: the one thing this can change is the department (and the short note saying so, metadata.reviewAssignment).
 *
 * It reuses, and does not re-implement, the pieces R2 is built from: `judge`/`tierOf` for the classification and `assignDepartmentStayDraft` for the
 * write. That function reads the book again, checks it is still an undecided ingested Draft with no department, judges it again under the approved rule,
 * and only then makes one conditional UPDATE; anything that moved in between leaves the book for a person.
 *
 * It applies only to books written by a harvest that is running now: the harvest hands over the id of the row it has just created. It never walks the
 * existing queue (that is Auto-assign High Confidence, a separate and separately gated action).
 *
 * Coverage (audited 2026-10-27; scripts/test-review-routing.ts fails if a new place that creates Books appears, so the audit is repeated):
 *   routed      the live harvest, `harvestFeed` in books/oaiHarvest.ts: DOAB, OAPEN, Open Textbook Library, NCBI, NLM, Crossref Books, Pressbooks, Open Library
 *               (and its dump) and Quick Import. This is the one place continuous ingestion writes Books.
 *   excluded    historical backfill (backfill/bookCommon.ts): old books are not "future" books, and a backfill never runs this.
 *   excluded    the legacy DOAB REST sweep (ingestionWorker.ts, `discoverBooksPage`). It is a rollback path, not a live one: it runs only when BOOKS_OAI=0
 *               (rotation) or INGESTION_ROTATION=0, both off by default and set nowhere in the repository. With BOOKS_OAI on, even the legacy pass harvests through
 *               `harvestFeed`. It writes only year-policy Drafts, which would simply stay in the review queue; it is left untouched on purpose.
 *   not ingestion  server.ts: a publisher's or an administrator's own entry.
 *
 * A gate of its own, REVIEW_INGEST_ROUTING_ENABLED (default off), and independent of REVIEW_AUTO_ASSIGN_ENABLED: enabling historical assignment does not
 * switch this on, and this does not switch that on. It also needs an approved rule (REVIEW_AUTO_ASSIGN_THRESHOLDS) and a chosen classifier
 * (REVIEW_INGEST_ROUTING_CLASSIFIER = v1 | v2); without either it does nothing and says why.
 */

export const ROUTING_GATE_ENV = 'REVIEW_INGEST_ROUTING_ENABLED';
export const ROUTING_CLASSIFIER_ENV = 'REVIEW_INGEST_ROUTING_CLASSIFIER';
export const ROUTING_SOURCE = 'future-ingestion-routing';
const ROUTING_ACTOR = { uid: 'system:ingestion-routing' };
const STATS_KEY = 'REVIEW_INGEST_ROUTING_STATS';
const DAYS_KEPT = 14;

export type RoutingConfig = {
  /** The gate itself. */
  enabled: boolean;
  classifier: ClassifierVariant | null;
  thresholds: Thresholds | null;
  /** Gate on, classifier chosen and rule approved: the only state in which anything is routed. */
  ready: boolean;
  /** Why it is not routing, in words; null when it is. */
  message: string | null;
};

export function routingConfig(): RoutingConfig {
  const enabled = process.env[ROUTING_GATE_ENV] === 'true';
  const c = process.env[ROUTING_CLASSIFIER_ENV]?.trim();
  const classifier: ClassifierVariant | null = c === 'v1' || c === 'v2' ? c : null;
  const t = approvedThresholds();
  const message = !enabled ? 'Future-ingestion routing is disabled by configuration.'
    : !classifier ? `No classifier has been chosen (${ROUTING_CLASSIFIER_ENV} must be v1 or v2).`
    : !t.thresholds ? (t.problem || 'No thresholds have been approved.') : null;
  return { enabled, classifier, thresholds: t.thresholds, ready: !message, message };
}

// ── Tally ───────────────────────────────────────────────────────────────────

export type RoutingTally = {
  /** Newly written Drafts that were classified. */
  classified: number;
  /** High confidence: the department was assigned, the Book stays a Draft. */
  routedHigh: number;
  mediumQueued: number;
  lowQueued: number;
  unclassifiableQueued: number;
  /** Not classified or not assigned because the book was not (or was no longer) an undecided ingested Draft, or its classification changed before the write. Left for manual review. */
  skipped: number;
  /** The conditional write found the book changed by someone else; their change stands. */
  races: number;
  failed: number;
  skippedReasons: Record<string, number>;
};
export const newRoutingTally = (): RoutingTally => ({ classified: 0, routedHigh: 0, mediumQueued: 0, lowQueued: 0, unclassifiableQueued: 0, skipped: 0, races: 0, failed: 0, skippedReasons: {} });
export function addRoutingTally(into: RoutingTally, t: RoutingTally) {
  for (const k of ['classified', 'routedHigh', 'mediumQueued', 'lowQueued', 'unclassifiableQueued', 'skipped', 'races', 'failed'] as const) into[k] += t[k] || 0;
  for (const [r, n] of Object.entries(t.skippedReasons || {})) into.skippedReasons[r] = (into.skippedReasons[r] || 0) + n;
  return into;
}

// ── One book ────────────────────────────────────────────────────────────────

export type RoutingPlan = { bookId: string; provider: string; classifier: ClassifierVariant; thresholds: Thresholds; tier: Tier; department: string | null; score: number; margin: number };
export type RoutingOutcome =
  | { result: 'routed'; department: string }
  | { result: 'queued'; tier: Tier }
  | { result: 'skipped'; reason: string }
  | { result: 'race' }
  | { result: 'failed' };

const skipped = (reason: string): RoutingOutcome => ({ result: 'skipped', reason });
const version = (c: ClassifierVariant) => (c === 'v2' ? ANALYSIS_CLASSIFIER_V2 : CLASSIFIER_RULES_VERSION);

/**
 * Step 1: read the new book and judge it. Writes nothing. A book that is not an undecided ingested Draft is not judged at all.
 */
export async function classifyNewDraft(bookId: string, provider: string, cfg: RoutingConfig): Promise<RoutingPlan | RoutingOutcome> {
  if (!cfg.ready || !cfg.classifier || !cfg.thresholds) return skipped('routing-off');
  const b = await readOneForJudging(bookId);
  if (!b) return skipped('not-found');
  if (b.status === 'Rejected' || b.rejectionNote) return skipped('rejected');
  if (b.status !== 'Draft') return skipped('not-a-draft');
  if (b.ownershipSource !== 'Ingested') return skipped('protected');
  if (b.domain) return skipped('already-has-department');
  const row = judge(b, cfg.classifier);
  const tier = tierOf(row.score, row.margin, row.fam, cfg.thresholds);
  return { bookId, provider, classifier: cfg.classifier, thresholds: cfg.thresholds, tier, department: row.dept, score: row.score, margin: row.margin };
}

/**
 * Step 2: act on the plan. Medium, Low and Unclassifiable change nothing. A High plan goes through the R2 single-record contract, which reads and
 * judges the book again NOW and writes only if it is still a High-confidence match for the same department and still has none.
 */
export async function applyRouting(plan: RoutingPlan): Promise<RoutingOutcome> {
  if (plan.tier !== 'high' || !plan.department) return { result: 'queued', tier: plan.tier };
  const o = await assignDepartmentStayDraft({
    bookId: plan.bookId, department: plan.department, basis: 'classifier', source: ROUTING_SOURCE, by: ROUTING_ACTOR, provider: plan.provider,
    rule: { classifier: plan.classifier, tiers: ['high'], thresholds: plan.thresholds },
  });
  if (o.result === 'assigned') return { result: 'routed', department: o.department };
  // A write that lost to someone else (or to a person who placed the book first): their change stands and nothing was overwritten.
  if (o.reason === 'changed-during-assignment' || o.reason === 'already-has-department') return { result: 'race' };
  return skipped(o.reason);
}

export function tallyRouting(t: RoutingTally, plan: RoutingPlan | null, o: RoutingOutcome) {
  if (plan) t.classified++;
  if (o.result === 'routed') t.routedHigh++;
  else if (o.result === 'queued') { if (o.tier === 'medium') t.mediumQueued++; else if (o.tier === 'low') t.lowQueued++; else t.unclassifiableQueued++; }
  else if (o.result === 'race') t.races++;
  else if (o.result === 'failed') t.failed++;
  else if (o.result === 'skipped') { t.skipped++; t.skippedReasons[o.reason] = (t.skippedReasons[o.reason] || 0) + 1; }
}

// ── Statistics and audit ────────────────────────────────────────────────────

export type RoutingStats = { since: string; lastRunAt: string | null; totals: RoutingTally; byProvider: Record<string, RoutingTally>; daily: Record<string, RoutingTally> };
let chain: Promise<unknown> = Promise.resolve();
const dayKey = () => new Date().toISOString().slice(0, 10);

/** Adds a tally to the running statistics. Serialised, so concurrent harvests (one per provider) do not overwrite each other's counts. Never throws. */
export function recordRouting(provider: string, t: RoutingTally): Promise<unknown> {
  chain = chain.then(async () => {
    const row = await db.appSetting.findUnique({ where: { key: STATS_KEY } });
    const s: RoutingStats = (row?.value as any) ?? { since: new Date().toISOString(), lastRunAt: null, totals: newRoutingTally(), byProvider: {}, daily: {} };
    addRoutingTally(s.totals, t);
    addRoutingTally(s.byProvider[provider] ||= newRoutingTally(), t);
    addRoutingTally(s.daily[dayKey()] ||= newRoutingTally(), t);
    for (const d of Object.keys(s.daily).sort().slice(0, -DAYS_KEPT)) delete s.daily[d];
    s.lastRunAt = new Date().toISOString();
    await db.appSetting.upsert({ where: { key: STATS_KEY }, create: { key: STATS_KEY, value: s as any, updatedBy: 'ingestion-routing' }, update: { value: s as any, updatedBy: 'ingestion-routing' } });
  }).catch(() => {});
  return chain;
}

export async function routingStats(): Promise<RoutingStats | null> {
  const row = await db.appSetting.findUnique({ where: { key: STATS_KEY } }).catch(() => null);
  return (row?.value as any) ?? null;
}

/**
 * One harvest's routing. Created per harvest run; `route` is called with each Draft the harvest has just written and never throws (a failure here must
 * not fail the harvest or change what it counts). `flush` writes the page's numbers to the statistics and, when a department was assigned, one bounded
 * audit row for the page (counts only; the books' own evidence is in their metadata.reviewAssignment).
 */
export function routingSession(provider: string) {
  const total = newRoutingTally();
  let page = newRoutingTally();
  let used: RoutingConfig | null = null;
  return {
    /** What this harvest routed so far; undefined when routing never ran. */
    get tally(): RoutingTally | undefined { return used ? total : undefined; },
    async route(bookId: string): Promise<void> {
      const cfg = routingConfig();        // read each time: switching the gate off stops the next book, not the next harvest
      if (!cfg.ready) return;
      used = cfg;
      let plan: RoutingPlan | null = null, outcome: RoutingOutcome;
      try {
        const p = await classifyNewDraft(bookId, provider, cfg);
        if ('bookId' in p) { plan = p; outcome = await applyRouting(p); } else outcome = p;
      } catch { outcome = { result: 'failed' }; }
      tallyRouting(page, plan, outcome); tallyRouting(total, plan, outcome);
    },
    async flush(): Promise<void> {
      if (!used) return;
      const t = page; page = newRoutingTally();
      if (!t.classified && !t.skipped && !t.races && !t.failed) return;
      await recordRouting(provider, t);
      if (t.routedHigh) {
        await audit(null, 'REVIEW_INGEST_ROUTING', {
          action: ROUTING_SOURCE, provider, classifier: used.classifier, classifierVersion: used.classifier ? version(used.classifier) : null,
          thresholds: used.thresholds ? { highMinScore: used.thresholds.highMinScore, highMinMargin: used.thresholds.highMinMargin, highRequiresCode: used.thresholds.highRequiresCode } : null,
          classified: t.classified, routedHigh: t.routedHigh, mediumQueued: t.mediumQueued, lowQueued: t.lowQueued, unclassifiableQueued: t.unclassifiableQueued, skipped: t.skipped, races: t.races, failed: t.failed, publishes: false,
        });
      }
    },
  };
}
