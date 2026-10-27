import { ingestionDb as db } from './db.js';
import { classifyDepartment, CLASSIFIER_RULES_VERSION, ANALYSIS_CLASSIFIER_V2, STRONG_MIN, STRONG_MARGIN, REVIEW_MIN, type ClassifierVariant } from './books/classifier.js';
import { ddcEvidence } from './ddc.js';
import { acquireReviewJob, releaseReviewJob, __resetReviewJobLock } from './reviewJobLock.js';

/**
 * Review automation, phases R1 / R1.5: an analysis of the "Needs a department" queue that does not modify catalogue or content records.
 *
 * It reads the Drafts the harvest set aside (status 'Draft', ownershipSource 'Ingested', no department yet), judges each one with the existing
 * classifier under its current rules (there is no second classifier), groups the answer into four confidence tiers, and keeps a compact result
 * the Admin screen can filter and page through. It never writes a Book, a Journal, a checkpoint or a setting the engine reads. The only things it
 * stores are its own summaries (AppSetting rows) and one audit row per run — analysis metadata, not content.
 *
 * R1.5 adds a second, ANALYSIS-ONLY classifier (v2: Dewey numbers as code evidence, and "rehabilitation" no longer meaning Physiotherapy by itself) and a
 * comparison of v1 against v2 over the same queue. The ingestion engine keeps calling v1; nothing here changes what it does.
 *
 * Scores are not stored on the book. The harvest keeps the verdict it reached at the time (metadata.harvest.department: band, score, runner-up), but
 * not which evidence families agreed, and under rules that may since have changed. So the analysis re-judges from the evidence the harvest did keep
 * (codes, keywords, title, abstract, LCC, NLM), exactly as the engine's own held-book job does, and reports how often that differs from what was stored.
 *
 * Tiers (the thresholds below are RECOMMENDATIONS made visible, not switches: nothing in R1 acts on them):
 *   high          the classifier's own "strong" rule — top score ≥ STRONG_MIN, ahead of the next by ≥ STRONG_MARGIN, a controlled code AND title/subject agree
 *   medium        a clear leader (top ≥ STRONG_MIN, ahead by ≥ 1) that is not "high": words only, or a narrow lead — a person should glance at it
 *   low           some evidence (top ≥ REVIEW_MIN) but weak, or tied with another department
 *   unclassifiable  below REVIEW_MIN, or no evidence at all
 */

export type Tier = 'high' | 'medium' | 'low' | 'unclassifiable';
export const TIERS: Tier[] = ['high', 'medium', 'low', 'unclassifiable'];

export type Thresholds = {
  /** Same numbers the classifier already uses; shown so nobody has to guess what "high" means. */
  highMinScore: number; highMinMargin: number; highRequiresCode: boolean;
  mediumMinScore: number; mediumMinMargin: number;
  lowMinScore: number;
};
export const CURRENT_THRESHOLDS: Thresholds = {
  highMinScore: STRONG_MIN, highMinMargin: STRONG_MARGIN, highRequiresCode: true,
  mediumMinScore: STRONG_MIN, mediumMinMargin: 1,
  lowMinScore: REVIEW_MIN,
};

// Evidence families as a bit mask, so a result row stays a handful of numbers.
const FAM = { code: 1, title: 2, subject: 4, abstract: 8 } as const;
const famMask = (f: string[]) => f.reduce((m, x) => m | ((FAM as any)[x] || 0), 0);
export const famNames = (m: number) => (Object.keys(FAM) as (keyof typeof FAM)[]).filter(k => m & FAM[k]);

export type LicenceState = 'Open licence' | 'Non-commercial' | 'No licence declared';
export const licenceState = (licence: string | null, nc: boolean | null): LicenceState =>
  !licence?.trim() ? 'No licence declared' : nc ? 'Non-commercial' : 'Open licence';

/** The tier of one judgement. `corroborated` = a controlled code AND the title or subject agree on the leading department. */
export function tierOf(score: number, margin: number, fam: number, t: Thresholds = CURRENT_THRESHOLDS): Tier {
  const corroborated = !!(fam & FAM.code) && !!(fam & (FAM.title | FAM.subject));
  if (score >= t.highMinScore && margin >= t.highMinMargin && (!t.highRequiresCode || corroborated)) return 'high';
  if (score >= t.mediumMinScore && margin >= t.mediumMinMargin) return 'medium';
  if (score >= t.lowMinScore) return 'low';
  return 'unclassifiable';
}

/** One analysed book, kept small: the queue is tens of thousands of these. */
export type Row = {
  id: string; dept: string | null; score: number; margin: number; next: string | null; nextScore: number;
  fam: number; tier: Tier; /** DDC contributed to the leading department's score (classifier v2 only). */ ddcUsed: boolean; source: string; year: number | null; licence: LicenceState; lang: string; storedDept: string | null; storedScore: number | null;
};

// ── Reading the queue ───────────────────────────────────────────────────────

/** The queue the review screen calls "Needs a department". One definition, shared with reviewQueue.ts' Books count. */
export const QUEUE = `status = 'Draft' and "ownershipSource" = 'Ingested' and domain is null and "rejectionNote" is null`;

const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : []);
const CHUNK = 500;

/** The next `limit` books of the queue after `afterId` (by id), with the evidence each classifier reads. */
export async function readChunk(afterId: string, extraWhere = QUEUE, limit = CHUNK): Promise<any[]> {
  return db.$queryRawUnsafe(
    `select id, title, left(description, 1200) description, year, source, language, licence, "licenceIsNC",
            metadata->'harvest'->'classifications' codes, metadata->'harvest'->'keywords' keywords,
            metadata->'harvest'->'provider'->'lcc' lcc, metadata->'harvest'->'provider'->'nlmClass' nlm, metadata->'harvest'->'provider'->'ddc' ddc,
            metadata->'harvest'->'department'->>'suggested' "storedDept", metadata->'harvest'->'department'->>'score' "storedScore"
       from "Book" where ${extraWhere} and id > $1 order by id limit ${limit}`, afterId).catch(() => []);
}

export function judge(b: any, variant: ClassifierVariant = 'v1'): Row {
  const v = classifyDepartment({
    classifications: arr(b.codes), subjects: arr(b.keywords), title: b.title, description: b.description,
    lcc: b.lcc ? arr(b.lcc) : undefined, nlm: b.nlm ? arr(b.nlm) : undefined, ddc: b.ddc ? arr(b.ddc) : undefined,
  }, { variant });
  const next = v.runnerUp;
  const margin = v.score - (next?.score ?? 0);
  const fam = famMask(v.families);
  return {
    id: b.id, dept: v.suggested, score: v.score, margin, next: next?.department ?? null, nextScore: next?.score ?? 0, fam,
    tier: v.suggested ? tierOf(v.score, margin, fam) : 'unclassifiable', ddcUsed: v.reasons.some(r => r.startsWith('DDC ')),
    source: b.source || 'Unknown', year: Number.isFinite(b.year) ? b.year : null,
    licence: licenceState(b.licence, b.licenceIsNC), lang: (b.language || '').trim().toLowerCase() || 'unknown',
    storedDept: b.storedDept ?? null, storedScore: b.storedScore != null && b.storedScore !== '' ? Number(b.storedScore) : null,
  };
}

// ── Aggregation ─────────────────────────────────────────────────────────────

const bump = (m: Record<string, number>, k: string | number, by = 1) => { m[String(k)] = (m[String(k)] || 0) + by; };
const yearBucket = (y: number | null) => y == null ? 'Unknown' : y < 2000 ? 'Before 2000' : y < 2010 ? '2000–2009' : y < 2020 ? '2010–2019' : '2020 or later';

export type Calibration = { sampleSize: number; byTier: Record<Tier, { n: number; agreed: number }>; note: string };
export type GridCell = { minScore: number; minMargin: number; requireCode: boolean; queue: number; reviewed: number; agreed: number; precision: number | null };
export type Recommendation = {
  basis: 'calibrated' | 'classifier-defaults';
  highMinScore: number; highMinMargin: number; highRequiresCode: boolean;
  /** Plain-language reason, written from the numbers. */
  reason: string; coverage: number; precision: number | null; calibrationSamples: number;
};

export type Summary = {
  asOf: string; startedAt: string; finishedAt: string; /** Which classifier judged the queue. Absent in summaries written before R2: that was v1. */ classifier?: ClassifierVariant; rulesVersion: number; thresholds: Thresholds;
  /** Drafts in the queue when the analysis started, and the ones left out of it (already placed / carrying a rejection note). */
  queueTotal: number; analysed: number; alreadyPlaced: number; withRejectionNote: number;
  tiers: Record<Tier, number>;
  /** Share of the analysed queue, as a percentage with one decimal. */
  share: { autoResolvable: number; batchReview: number; manual: number };
  scoreDistribution: Record<string, number>; marginDistribution: Record<string, number>;
  bySource: Record<string, Record<Tier, number>>; byDepartment: { department: string; high: number; medium: number; low: number; total: number }[];
  byYear: Record<string, number>; byLicence: Record<string, number>; byLanguage: Record<string, number>;
  evidence: { withCode: number; codeAndWords: number; wordsOnly: number; abstractOnly: number; noEvidence: number };
  /** How the stored harvest verdict compares with the current rules, where the harvest stored one. */
  versusStored: { compared: number; sameDepartment: number; differentDepartment: number; noStoredVerdict: number };
  calibration: Calibration; grid: GridCell[]; recommendation: Recommendation;
};

const emptyTiers = (): Record<Tier, number> => ({ high: 0, medium: 0, low: 0, unclassifiable: 0 });
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
/** Percentages that add up to 100: the last one is what is left, so three rounded thirds never read 99.9. */
const shares = (t: Record<Tier, number>, d: number) => {
  if (!d) return { autoResolvable: 0, batchReview: 0, manual: 0 };
  const autoResolvable = pct(t.high, d), batchReview = pct(t.medium, d);
  return { autoResolvable, batchReview, manual: Math.round((100 - autoResolvable - batchReview) * 10) / 10 };
};

/**
 * Where a person has already decided: books the harvest held and a person then approved (so their department was chosen by a human, not promoted by the
 * engine). Their stored harvest evidence is re-judged under the current rules and compared with the department the person chose. That is real,
 * human-labelled data about how often each tier is right — the only honest basis for recommending a threshold.
 */
const REVIEWED = `status = 'Published' and "ownershipSource" = 'Ingested' and domain is not null
                  and metadata->'harvest'->'department' is not null and metadata->'harvest'->'promoted' is null
                  and coalesce(metadata->'harvest'->'department'->>'band', '') <> 'strong'`;

async function calibrationRows(variant: ClassifierVariant = 'v1'): Promise<{ row: Row; chosen: string }[]> {
  const out: { row: Row; chosen: string }[] = [];
  let last = '';
  for (;;) {
    const rows: any[] = await db.$queryRawUnsafe(
      `select id, title, left(description, 1200) description, year, source, language, licence, "licenceIsNC", domain chosen,
              metadata->'harvest'->'classifications' codes, metadata->'harvest'->'keywords' keywords,
              metadata->'harvest'->'provider'->'lcc' lcc, metadata->'harvest'->'provider'->'nlmClass' nlm, metadata->'harvest'->'provider'->'ddc' ddc
         from "Book" where ${REVIEWED} and id > $1 order by id limit ${CHUNK}`, last).catch(() => []);
    if (!rows.length) break;
    for (const b of rows) out.push({ row: judge(b, variant), chosen: b.chosen });
    last = rows[rows.length - 1].id;
    await new Promise(r => setImmediate(r));
    if (out.length >= 20_000) break;
  }
  return out;
}

const MIN_SCORES = [4, 5, 6, 7, 8, 9, 10];
const MIN_MARGINS = [0, 1, 2, 3, 4, 5];
/** The bar a department assignment has to clear, taken from the classifier's own comment: code-plus-words was right 97% of the time in review. */
const TARGET_PRECISION = 0.97;
const MIN_CALIBRATION_N = 30;

function buildGrid(rows: Row[], reviewed: { row: Row; chosen: string }[]): GridCell[] {
  const cells: GridCell[] = [];
  for (const requireCode of [true, false]) for (const minScore of MIN_SCORES) for (const minMargin of MIN_MARGINS) {
    const ok = (r: Row) => !!r.dept && r.score >= minScore && r.margin >= minMargin && (!requireCode || (!!(r.fam & FAM.code) && !!(r.fam & (FAM.title | FAM.subject))));
    let reviewedN = 0, agreed = 0;
    for (const { row, chosen } of reviewed) if (ok(row)) { reviewedN++; if (row.dept === chosen) agreed++; }
    cells.push({ minScore, minMargin, requireCode, queue: rows.reduce((n, r) => n + (ok(r) ? 1 : 0), 0), reviewed: reviewedN, agreed, precision: reviewedN ? Math.round((agreed / reviewedN) * 1000) / 10 : null });
  }
  return cells;
}

/**
 * Recommend a "high confidence" rule from the evidence, never from a guess: among the rules whose human-confirmed precision meets the bar on enough
 * samples, the one that covers the most of the queue. With too few human decisions to judge, fall back to the classifier's own rule and say so.
 */
export function recommend(grid: GridCell[], queueTotal: number, reviewedTotal: number): Recommendation {
  const trusted = grid.filter(c => c.reviewed >= MIN_CALIBRATION_N && c.precision != null && c.precision >= TARGET_PRECISION * 100);
  if (trusted.length) {
    const best = [...trusted].sort((a, b) => b.queue - a.queue || b.minScore - a.minScore || b.minMargin - a.minMargin)[0];
    return {
      basis: 'calibrated', highMinScore: best.minScore, highMinMargin: best.minMargin, highRequiresCode: best.requireCode,
      reason: `Of ${best.reviewed} books a person has already placed that this rule would have called high, ${best.agreed} (${best.precision}%) matched the department the person chose. It is the widest rule that meets the ${TARGET_PRECISION * 100}% bar on at least ${MIN_CALIBRATION_N} human decisions.`,
      coverage: pct(best.queue, queueTotal), precision: best.precision, calibrationSamples: best.reviewed,
    };
  }
  const base = grid.find(c => c.minScore === STRONG_MIN && c.minMargin === STRONG_MARGIN && c.requireCode)!;
  return {
    basis: 'classifier-defaults', highMinScore: STRONG_MIN, highMinMargin: STRONG_MARGIN, highRequiresCode: true,
    reason: reviewedTotal < MIN_CALIBRATION_N
      ? `Only ${reviewedTotal} books in this database were placed by a person, too few to measure how often each rule is right. The classifier's own rule is kept (score ≥ ${STRONG_MIN}, ahead by ≥ ${STRONG_MARGIN}, a controlled code and title/subject agree); it was measured at 97% in earlier review. Run this where reviewers have worked to calibrate it.`
      : `No rule met ${TARGET_PRECISION * 100}% on at least ${MIN_CALIBRATION_N} human decisions. The classifier's own rule is kept until more books are placed by hand.`,
    coverage: pct(base.queue, queueTotal), precision: base.precision, calibrationSamples: base.reviewed,
  };
}

export function summarise(rows: Row[], meta: { startedAt: Date; queueTotal: number; alreadyPlaced: number; withRejectionNote: number; classifier?: ClassifierVariant }, reviewed: { row: Row; chosen: string }[]): Summary {
  const tiers = emptyTiers();
  const scoreDistribution: Record<string, number> = {}, marginDistribution: Record<string, number> = {}, byYear: Record<string, number> = {}, byLicence: Record<string, number> = {}, byLanguage: Record<string, number> = {};
  const bySource: Record<string, Record<Tier, number>> = {}, dept: Record<string, { high: number; medium: number; low: number }> = {};
  const evidence = { withCode: 0, codeAndWords: 0, wordsOnly: 0, abstractOnly: 0, noEvidence: 0 };
  const versus = { compared: 0, sameDepartment: 0, differentDepartment: 0, noStoredVerdict: 0 };

  for (const r of rows) {
    tiers[r.tier]++;
    bump(scoreDistribution, r.score >= 12 ? '12+' : r.score);
    bump(marginDistribution, r.margin >= 8 ? '8+' : r.margin);
    (bySource[r.source] ||= emptyTiers())[r.tier]++;
    bump(byYear, yearBucket(r.year)); bump(byLicence, r.licence); bump(byLanguage, r.lang);
    if (r.dept && r.tier !== 'unclassifiable') (dept[r.dept] ||= { high: 0, medium: 0, low: 0 })[r.tier]++;
    const code = !!(r.fam & FAM.code), words = !!(r.fam & (FAM.title | FAM.subject));
    if (code) evidence.withCode++;
    if (code && words) evidence.codeAndWords++; else if (words) evidence.wordsOnly++; else if (r.fam & FAM.abstract) evidence.abstractOnly++; else if (!code) evidence.noEvidence++;
    if (r.storedDept == null) versus.noStoredVerdict++;
    else { versus.compared++; r.storedDept === r.dept ? versus.sameDepartment++ : versus.differentDepartment++; }
  }

  const cal: Calibration = {
    sampleSize: reviewed.length, byTier: { high: { n: 0, agreed: 0 }, medium: { n: 0, agreed: 0 }, low: { n: 0, agreed: 0 }, unclassifiable: { n: 0, agreed: 0 } },
    note: reviewed.length
      ? 'Books a person approved after the harvest held them, re-judged under the current rules and compared with the department the person chose.'
      : 'No book in this database has yet been placed by a person, so there is nothing to measure the tiers against.',
  };
  for (const { row, chosen } of reviewed) { cal.byTier[row.tier].n++; if (row.dept === chosen) cal.byTier[row.tier].agreed++; }

  const grid = buildGrid(rows, reviewed);
  const analysed = rows.length;
  return {
    asOf: new Date().toISOString(), startedAt: meta.startedAt.toISOString(), finishedAt: new Date().toISOString(),
    classifier: meta.classifier ?? 'v1', rulesVersion: meta.classifier === 'v2' ? ANALYSIS_CLASSIFIER_V2 : CLASSIFIER_RULES_VERSION, thresholds: CURRENT_THRESHOLDS,
    queueTotal: meta.queueTotal, analysed, alreadyPlaced: meta.alreadyPlaced, withRejectionNote: meta.withRejectionNote,
    tiers,
    share: shares(tiers, analysed),
    scoreDistribution, marginDistribution, bySource,
    byDepartment: Object.entries(dept).map(([department, c]) => ({ department, ...c, total: c.high + c.medium + c.low })).sort((a, b) => b.total - a.total),
    byYear, byLicence, byLanguage, evidence, versusStored: versus, calibration: cal, grid, recommendation: recommend(grid, analysed, reviewed.length),
  };
}

// ── The job: bounded, yielding, single-flight ───────────────────────────────

const SETTING_KEY = 'REVIEW_CLASSIFICATION_ANALYSIS';

export type JobState = { mode: 'analysis' | 'comparison'; status: 'idle' | 'running' | 'done' | 'failed'; startedAt: string | null; finishedAt: string | null; processed: number; total: number; phase: string; error: string | null };
let job: JobState = { mode: 'analysis', status: 'idle', startedAt: null, finishedAt: null, processed: 0, total: 0, phase: '', error: null };
/** The full per-book result of the last run, in this process only. The summary survives a restart; browsing records needs a fresh run. */
let cache: { rows: Row[]; asOf: string; classifier: ClassifierVariant; gone: Set<string> } | null = null;
/**
 * A book that has left the queue since the analysis (assigned, rejected, published) is dropped from the browsable result, so a list does not keep
 * offering — or, worse, show as empty a page of — books that are no longer there. The analysis summary keeps the numbers as they were when it ran.
 */
export function forgetRows(ids: Iterable<string>) {
  if (!cache) return;
  for (const id of ids) cache.gone.add(id);
  if (cache.gone.size > 2000) { cache.rows = cache.rows.filter(r => !cache!.gone.has(r.id)); cache.gone.clear(); }
}
const liveRows = (): Row[] => (cache ? (cache.gone.size ? cache.rows.filter(r => !cache!.gone.has(r.id)) : cache.rows) : []);
export const cachedClassifier = (): ClassifierVariant | null => cache?.classifier ?? null;

export const jobState = (): JobState => ({ ...job });
export const __resetClassification = () => { __resetReviewJobLock(); job = { mode: 'analysis', status: 'idle', startedAt: null, finishedAt: null, processed: 0, total: 0, phase: '', error: null }; cache = null; };

export async function loadSummary(): Promise<Summary | null> {
  const r = await db.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  return (r?.value as Summary) ?? null;
}

/** Start the analysis. Returns false if one is already running. The work continues in the background; poll jobState(). */
export function startAnalysis(admin: { uid?: string; email?: string } | null, onDone?: (s: Summary | null, err?: string) => void, variant: ClassifierVariant = 'v1'): boolean {
  if (job.status === 'running' || !acquireReviewJob('analysis')) return false;
  const startedAt = new Date();
  job = { mode: 'analysis', status: 'running', startedAt: startedAt.toISOString(), finishedAt: null, processed: 0, total: 0, phase: 'Counting the queue', error: null };
  (async () => {
    try {
      const [c] = await (db.$queryRawUnsafe(
        `select count(*) filter (where ${QUEUE})::int queue,
                count(*) filter (where status = 'Draft' and "ownershipSource" = 'Ingested' and domain is not null)::int placed,
                count(*) filter (where status = 'Draft' and "ownershipSource" = 'Ingested' and domain is null and "rejectionNote" is not null)::int noted
           from "Book" where status = 'Draft' and "ownershipSource" = 'Ingested'`) as Promise<any[]>);
      job.total = Number(c?.queue ?? 0); job.phase = 'Judging the queue';
      const rows: Row[] = [];
      let last = '';
      for (;;) {
        const chunk = await readChunk(last);
        if (!chunk.length) break;
        for (const b of chunk) rows.push(judge(b, variant));
        last = chunk[chunk.length - 1].id;
        job.processed = rows.length;
        // Give the event loop back between chunks: the ingestion engine and the admin screens share this process.
        await new Promise(r => setTimeout(r, 5));
      }
      job.phase = 'Measuring against human decisions';
      const reviewed = await calibrationRows(variant);
      job.phase = 'Summarising';
      const summary = summarise(rows, { startedAt, queueTotal: Number(c?.queue ?? 0), alreadyPlaced: Number(c?.placed ?? 0), withRejectionNote: Number(c?.noted ?? 0), classifier: variant }, reviewed);
      await db.appSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: summary as any, updatedBy: admin?.email || 'review-classification' }, update: { value: summary as any, updatedBy: admin?.email || 'review-classification' } });
      cache = { rows, asOf: summary.asOf, classifier: variant, gone: new Set() };
      job = { ...job, status: 'done', finishedAt: new Date().toISOString(), processed: rows.length, phase: 'Done' };
      releaseReviewJob('analysis');
      onDone?.(summary);
    } catch (e: any) {
      job = { ...job, status: 'failed', finishedAt: new Date().toISOString(), error: String(e?.message || e).slice(0, 300), phase: 'Failed' };
      releaseReviewJob('analysis');
      onDone?.(null, job.error!);
    }
  })();
  return true;
}

// ── Classifier v1 vs v2 ─────────────────────────────────────────────────────

const COMPARISON_KEY = 'REVIEW_CLASSIFICATION_COMPARISON';
const RANK: Record<Tier, number> = { high: 3, medium: 2, low: 1, unclassifiable: 0 };
const SAMPLE_PER_KIND = 20;
export type ChangeKind = 'rehabilitation' | 'upgraded-to-high' | 'downgraded' | 'department-changed' | 'ddc-supported';
export type ChangeSample = {
  id: string; title: string; source: string; kind: ChangeKind;
  v1: { department: string | null; score: number; tier: Tier }; v2: { department: string | null; score: number; tier: Tier };
  /** The leading reasons classifier v2 gave, so a reader can see why it moved. */
  why: string[];
};
export type Comparison = {
  asOf: string; startedAt: string; finishedAt: string; v1Version: number; v2Version: number; thresholds: Thresholds;
  queueTotal: number; analysed: number;
  v1Tiers: Record<Tier, number>; v2Tiers: Record<Tier, number>;
  /** How many books moved from each v1 tier to each v2 tier: transitions[v1][v2]. */
  transitions: Record<Tier, Record<Tier, number>>;
  changedDepartment: number; upgraded: number; upgradedToHigh: number; upgradedToHighFromLowOrMedium: number; downgraded: number; unchanged: number;
  departmentMoves: { from: string; to: string; n: number }[];
  departmentNet: { department: string; v1: number; v2: number; net: number }[];
  byProvider: Record<string, { analysed: number; v1High: number; v2High: number; changedDepartment: number; upgraded: number; downgraded: number; ddcSupported: number; rehabilitationRemoved: number }>;
  ddc: { withDdc: number; malformed: number; ambiguous: number; unmapped: number; supportedClassifications: number; changedBecauseOfDdc: number };
  rehabilitation: { falsePositivesRemoved: number };
  sample: ChangeSample[]; sampleNote: string;
};

const zeroTiers = (): Record<Tier, number> => ({ high: 0, medium: 0, low: 0, unclassifiable: 0 });
const REHAB = /\brehabilitation\b/i;

/** Pure: compare two judgements of the same books. */
export function compareJudgements(pairs: { v1: Row; v2: Row; title: string; ddcValues: unknown; rehabText: string }[], meta: { startedAt: Date; queueTotal: number }): Comparison {
  const c: Comparison = {
    asOf: new Date().toISOString(), startedAt: meta.startedAt.toISOString(), finishedAt: new Date().toISOString(), v1Version: CLASSIFIER_RULES_VERSION, v2Version: ANALYSIS_CLASSIFIER_V2, thresholds: CURRENT_THRESHOLDS,
    queueTotal: meta.queueTotal, analysed: pairs.length, v1Tiers: zeroTiers(), v2Tiers: zeroTiers(),
    transitions: { high: zeroTiers(), medium: zeroTiers(), low: zeroTiers(), unclassifiable: zeroTiers() },
    changedDepartment: 0, upgraded: 0, upgradedToHigh: 0, upgradedToHighFromLowOrMedium: 0, downgraded: 0, unchanged: 0,
    departmentMoves: [], departmentNet: [], byProvider: {},
    ddc: { withDdc: 0, malformed: 0, ambiguous: 0, unmapped: 0, supportedClassifications: 0, changedBecauseOfDdc: 0 }, rehabilitation: { falsePositivesRemoved: 0 },
    sample: [], sampleNote: `Up to ${SAMPLE_PER_KIND} books of each kind, taken in id order. A book appears under the first kind that fits.`,
  };
  const moves: Record<string, number> = {}, d1: Record<string, number> = {}, d2: Record<string, number> = {};
  const taken: Record<string, number> = {};
  for (const { v1, v2, title, ddcValues, rehabText } of pairs) {
    c.v1Tiers[v1.tier]++; c.v2Tiers[v2.tier]++; c.transitions[v1.tier][v2.tier]++;
    const p = (c.byProvider[v1.source] ||= { analysed: 0, v1High: 0, v2High: 0, changedDepartment: 0, upgraded: 0, downgraded: 0, ddcSupported: 0, rehabilitationRemoved: 0 });
    p.analysed++; if (v1.tier === 'high') p.v1High++; if (v2.tier === 'high') p.v2High++;
    const deptChanged = v1.dept !== v2.dept;
    const up = RANK[v2.tier] > RANK[v1.tier], down = RANK[v2.tier] < RANK[v1.tier];
    if (deptChanged) { c.changedDepartment++; p.changedDepartment++; bump(moves, `${v1.dept ?? '(none)'}\u0000${v2.dept ?? '(none)'}`); }
    if (up) { c.upgraded++; p.upgraded++; } else if (down) { c.downgraded++; p.downgraded++; }
    if (v2.tier === 'high' && v1.tier !== 'high') { c.upgradedToHigh++; if (v1.tier === 'low' || v1.tier === 'medium') c.upgradedToHighFromLowOrMedium++; }
    if (!deptChanged && v1.tier === v2.tier && v1.score === v2.score) c.unchanged++;
    if (v1.dept && v1.tier !== 'unclassifiable') bump(d1, v1.dept); if (v2.dept && v2.tier !== 'unclassifiable') bump(d2, v2.dept);

    const e = ddcEvidence(ddcValues);
    if (e.valid || e.malformed) c.ddc.withDdc++;
    if (e.malformed) c.ddc.malformed++;
    if (e.ambiguous) c.ddc.ambiguous++;
    if (e.valid && !e.department && !e.ambiguous) c.ddc.unmapped++;
    if (v2.ddcUsed) { c.ddc.supportedClassifications++; p.ddcSupported++; if (deptChanged) c.ddc.changedBecauseOfDdc++; }
    const rehab = v1.dept === 'Physiotherapy' && v2.dept !== 'Physiotherapy' && REHAB.test(rehabText);
    if (rehab) { c.rehabilitation.falsePositivesRemoved++; p.rehabilitationRemoved++; }

    const kind: ChangeKind | null = rehab ? 'rehabilitation' : v2.tier === 'high' && v1.tier !== 'high' ? 'upgraded-to-high' : down ? 'downgraded' : deptChanged ? 'department-changed' : v2.ddcUsed ? 'ddc-supported' : null;
    if (kind && (taken[kind] || 0) < SAMPLE_PER_KIND) {
      taken[kind] = (taken[kind] || 0) + 1;
      c.sample.push({ id: v1.id, title: title.slice(0, 120), source: v1.source, kind, v1: { department: v1.dept, score: v1.score, tier: v1.tier }, v2: { department: v2.dept, score: v2.score, tier: v2.tier }, why: [] });
    }
  }
  c.departmentMoves = Object.entries(moves).map(([k, n]) => { const [from, to] = k.split('\u0000'); return { from, to, n }; }).sort((a, b) => b.n - a.n).slice(0, 15);
  const names = new Set([...Object.keys(d1), ...Object.keys(d2)]);
  c.departmentNet = [...names].map(department => ({ department, v1: d1[department] || 0, v2: d2[department] || 0, net: (d2[department] || 0) - (d1[department] || 0) })).filter(d => d.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 15);
  return c;
}

export async function loadComparison(): Promise<Comparison | null> {
  const r = await db.appSetting.findUnique({ where: { key: COMPARISON_KEY } }).catch(() => null);
  return (r?.value as Comparison) ?? null;
}

/** Start the v1-vs-v2 comparison over the same queue. Shares the single-flight guard with the analysis. Changes no Book. */
export function startComparison(admin: { uid?: string; email?: string } | null, onDone?: (c: Comparison | null, err?: string) => void): boolean {
  if (job.status === 'running' || !acquireReviewJob('comparison')) return false;
  const startedAt = new Date();
  job = { mode: 'comparison', status: 'running', startedAt: startedAt.toISOString(), finishedAt: null, processed: 0, total: 0, phase: 'Counting the queue', error: null };
  (async () => {
    try {
      const [n] = await (db.$queryRawUnsafe(`select count(*)::int n from "Book" where ${QUEUE}`) as Promise<any[]>);
      job.total = Number(n?.n ?? 0); job.phase = 'Judging the queue with classifier v1 and v2';
      const pairs: Parameters<typeof compareJudgements>[0] = [];
      let last = '';
      for (;;) {
        const chunk = await readChunk(last);
        if (!chunk.length) break;
        for (const b of chunk) pairs.push({ v1: judge(b, 'v1'), v2: judge(b, 'v2'), title: b.title || '', ddcValues: b.ddc, rehabText: `${b.title || ''} ${arr(b.keywords).join(' ')} ${b.description || ''}` });
        last = chunk[chunk.length - 1].id;
        job.processed = pairs.length;
        await new Promise(r => setTimeout(r, 5));
      }
      job.phase = 'Summarising';
      const cmp = compareJudgements(pairs, { startedAt, queueTotal: Number(n?.n ?? 0) });
      // The reasons classifier v2 gave, for the bounded sample only.
      for (const s of cmp.sample) {
        const b = (await readOneForJudging(s.id));
        if (b) s.why = classifyDepartment({ classifications: arr(b.codes), subjects: arr(b.keywords), title: b.title, description: b.description, lcc: b.lcc ? arr(b.lcc) : undefined, nlm: b.nlm ? arr(b.nlm) : undefined, ddc: b.ddc ? arr(b.ddc) : undefined }, { variant: 'v2' }).reasons.slice(0, 4);
      }
      await db.appSetting.upsert({ where: { key: COMPARISON_KEY }, create: { key: COMPARISON_KEY, value: cmp as any, updatedBy: admin?.email || 'review-classification' }, update: { value: cmp as any, updatedBy: admin?.email || 'review-classification' } });
      job = { ...job, status: 'done', finishedAt: new Date().toISOString(), processed: pairs.length, phase: 'Done' };
      releaseReviewJob('comparison');
      onDone?.(cmp);
    } catch (e: any) {
      job = { ...job, status: 'failed', finishedAt: new Date().toISOString(), error: String(e?.message || e).slice(0, 300), phase: 'Failed' };
      releaseReviewJob('comparison');
      onDone?.(null, job.error!);
    }
  })();
  return true;
}

/** One book's evidence for judging, whatever its status. Used to explain a sampled change and to revalidate before an assignment. */
export async function readOneForJudging(id: string): Promise<any | null> {
  const rows: any[] = await db.$queryRawUnsafe(
    `select id, title, left(description, 1200) description, year, source, language, licence, "licenceIsNC", status, "ownershipSource", domain, "rejectionNote",
            metadata->'harvest'->'classifications' codes, metadata->'harvest'->'keywords' keywords,
            metadata->'harvest'->'provider'->'lcc' lcc, metadata->'harvest'->'provider'->'nlmClass' nlm, metadata->'harvest'->'provider'->'ddc' ddc
       from "Book" where id = $1`, id).catch(() => []);
  return rows[0] ?? null;
}

// ── Browsing the result ─────────────────────────────────────────────────────

export type Filters = {
  source?: string; department?: string; tier?: Tier; minScore?: number; maxScore?: number; minMargin?: number; maxMargin?: number;
  yearFrom?: number; yearTo?: number; licence?: LicenceState; language?: string;
};

export function applyFilters(rows: Row[], f: Filters): Row[] {
  return rows.filter(r =>
    (!f.source || r.source === f.source) && (!f.department || r.dept === f.department) && (!f.tier || r.tier === f.tier) &&
    (f.minScore == null || r.score >= f.minScore) && (f.maxScore == null || r.score <= f.maxScore) &&
    (f.minMargin == null || r.margin >= f.minMargin) && (f.maxMargin == null || r.margin <= f.maxMargin) &&
    (f.yearFrom == null || (r.year != null && r.year >= f.yearFrom)) && (f.yearTo == null || (r.year != null && r.year <= f.yearTo)) &&
    (!f.licence || r.licence === f.licence) && (!f.language || r.lang === f.language));
}

export type RecordPage = { available: boolean; total: number; page: number; take: number; asOf: string | null; records: any[]; dropped: number };

/** One page of the last result. Only the page's own books are read back from the database, and any that have left the queue since are dropped, not shown. */
export async function recordsPage(f: Filters, page: number, take: number): Promise<RecordPage> {
  if (!cache) return { available: false, total: 0, page, take, asOf: null, records: [], dropped: 0 };
  const hit = applyFilters(liveRows(), f).sort((a, b) => b.score - a.score || b.margin - a.margin || (a.id < b.id ? -1 : 1));
  const slice = hit.slice((page - 1) * take, page * take);
  const live: any[] = slice.length ? await db.$queryRawUnsafe(
    `select id, title, authors, "publisherName", year, source, language, licence, "licenceIsNC", "originalUrl",
            metadata->'harvest'->'classifications' codes, metadata->'harvest'->'keywords' keywords, left(description, 1200) description,
            metadata->'harvest'->'provider'->'lcc' lcc, metadata->'harvest'->'provider'->'nlmClass' nlm, metadata->'harvest'->'provider'->'ddc' ddc
       from "Book" where ${QUEUE} and id = any($1::text[])`, slice.map(r => r.id)).catch(() => []) : [];
  const byId = new Map(live.map(b => [b.id, b]));
  const records = slice.flatMap(r => {
    const b = byId.get(r.id);
    if (!b) return [];
    // Re-judged for the page only, so the reasons shown are the current rules' and cheap to produce.
    const v = classifyDepartment({ classifications: arr(b.codes), subjects: arr(b.keywords), title: b.title, description: b.description, lcc: b.lcc ? arr(b.lcc) : undefined, nlm: b.nlm ? arr(b.nlm) : undefined, ddc: b.ddc ? arr(b.ddc) : undefined }, { variant: cache!.classifier });
    return [{ id: r.id, title: b.title, authors: b.authors, publisherName: b.publisherName, year: b.year, source: r.source, language: b.language, licenceState: r.licence, licence: b.licence,
      originalUrl: b.originalUrl, suggested: r.dept, score: r.score, margin: r.margin, next: r.next ? { department: r.next, score: r.nextScore } : null, tier: r.tier,
      evidence: famNames(r.fam), ddc: r.ddcUsed, classifier: cache!.classifier, reasons: v.reasons.slice(0, 6) }];
  });
  const missing = slice.filter(r => !byId.has(r.id)).map(r => r.id);
  forgetRows(missing);   // they have left the queue; the next page of the same list will not stumble over them
  return { available: true, total: hit.length - missing.length, page, take, asOf: cache.asOf, records, dropped: missing.length };
}

/** The ids of the first `limit` books (best evidence first) matching a filter in the last analysis: the server-side meaning of "select the first 50 / 100 / 250". */
export function idsFor(f: Filters, limit: number): { ids: string[]; total: number; classifier: ClassifierVariant | null; asOf: string | null } {
  if (!cache) return { ids: [], total: 0, classifier: null, asOf: null };
  const hit = applyFilters(liveRows(), f).sort((a, b) => b.score - a.score || b.margin - a.margin || (a.id < b.id ? -1 : 1));
  return { ids: hit.slice(0, limit).map(r => r.id), total: hit.length, classifier: cache.classifier, asOf: cache.asOf };
}
