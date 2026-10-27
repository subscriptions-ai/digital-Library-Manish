import { ingestionDb as db } from './db.js';
import { acquireReviewJob, releaseReviewJob } from './reviewJobLock.js';
import { classifyJournal, subjectsOf, JOURNAL_CLASSIFIER_VERSION, CURRENT_JOURNAL_THRESHOLDS, type JournalThresholds, type JournalTier, type Family } from './journalClassification.js';

/**
 * Journal review analysis (Review Automation R3B): which journals have no department, what the journal classifier suggests for each, and how sure it is.
 *
 * It is the journal counterpart of the Book classification analysis, and like it, reading only. It never writes a Journal: the only things stored are a
 * small summary (AppSetting) and, from the route that starts it, one audit row. The per-journal result is held in this process so a person can filter and
 * page through it; a restart needs a fresh run.
 *
 * "Needs a department" for a journal means: no department, not Rejected, not linked to a partner publisher, and not one an administrator verified by hand.
 * Those last three are somebody's decision already; they are not in the queue and are never offered for assignment.
 */

const SETTING_KEY = 'REVIEW_JOURNAL_ANALYSIS';
const CHUNK = 500;
const SAMPLE = 25;
const ROW_CAP = 150_000;

/** SQL: a journal in the queue. Also the condition the assignment's conditional UPDATE repeats. */
export const JOURNAL_QUEUE = `("domain" is null or "domain" = '') and status <> 'Rejected' and "publisherId" is null and ("rightsVerifiedBy" is null or "rightsVerifiedBy" = 'ingestion')`;
export const JOURNAL_COLUMNS = `id, title, issn, eissn, "publisherName", subject, subjects, status, licence, "rightsBasis"`;

export type JournalRow = {
  id: string; title: string; issn: string | null; eissn: string | null; publisher: string | null; status: string; origin: string; licence: string | null; subjects: string[];
  dept: string | null; score: number; margin: number; next: string | null; nextScore: number; families: Family[]; tier: JournalTier; legacy: string | null;
};

/** Which listing a journal came from, read from the basis the import recorded. Used for grouping only. */
export const originOf = (rightsBasis: string | null | undefined): string => {
  const b = String(rightsBasis || '');
  return /doaj/i.test(b) ? 'DOAJ' : /crossref/i.test(b) ? 'Crossref' : /openalex/i.test(b) ? 'OpenAlex' : /road/i.test(b) ? 'ROAD' : 'Other';
};

export function rowOf(j: any, t: JournalThresholds = CURRENT_JOURNAL_THRESHOLDS): JournalRow {
  const r = classifyJournal(j, t);
  return {
    id: j.id, title: String(j.title || '').slice(0, 160), issn: j.issn ?? null, eissn: j.eissn ?? null, publisher: j.publisherName ? String(j.publisherName).slice(0, 80) : null,
    status: j.status, origin: originOf(j.rightsBasis), licence: j.licence ?? null, subjects: subjectsOf(j).slice(0, 4),
    dept: r.dept, score: r.score, margin: r.margin, next: r.next, nextScore: r.nextScore, families: r.families, tier: r.tier, legacy: r.legacy,
  };
}

// ── The result held in this process ─────────────────────────────────────────

let cache: { rows: JournalRow[]; builtAt: string } | null = null;
export const forgetJournalRows = (ids: string[]) => { if (!cache || !ids.length) return; const gone = new Set(ids); cache.rows = cache.rows.filter(r => !gone.has(r.id)); };
export const __resetJournalAnalysis = () => { cache = null; job = idleJob(); };

export type JournalSummary = {
  finishedAt: string; classifierVersion: number; thresholds: JournalThresholds; analysed: number; queueTotal: number; truncated: boolean;
  tiers: Record<JournalTier, number>;
  byDepartment: { department: string; high: number; medium: number; low: number }[];
  byOrigin: Record<string, Record<JournalTier, number>>;
  /** The suggestion matches what the engine's own import-time journal rule says, differs from it, or the engine's rule has no answer. */
  againstEngineRule: { same: number; different: number; engineHasNoAnswer: number };
  samples: Record<JournalTier, { id: string; title: string; issn: string | null; origin: string; suggested: string | null; score: number; margin: number; evidence: string[] }[]>;
  note: string;
};

type Job = { status: 'idle' | 'running' | 'done' | 'failed'; startedAt: string | null; finishedAt: string | null; processed: number; total: number; phase: string; error: string | null };
const idleJob = (): Job => ({ status: 'idle', startedAt: null, finishedAt: null, processed: 0, total: 0, phase: '', error: null });
let job: Job = idleJob();
export const journalJobState = (): Job => ({ ...job });
const blankTiers = (): Record<JournalTier, number> => ({ high: 0, medium: 0, low: 0, unclassifiable: 0 });

export async function loadJournalSummary(): Promise<JournalSummary | null> {
  const r = await db.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  return (r?.value as unknown as JournalSummary) ?? null;
}
/** Is a result held in this process (so records can be browsed)? */
export const journalRowsAvailable = () => !!cache;

/** Start the analysis. False if a review job is already running. Poll journalJobState(). */
export function startJournalAnalysis(admin: { uid?: string; email?: string } | null, thresholds: JournalThresholds = CURRENT_JOURNAL_THRESHOLDS, onDone?: (s: JournalSummary | null, err?: string) => void): boolean {
  if (job.status === 'running' || !acquireReviewJob('journal-analysis')) return false;
  job = { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, processed: 0, total: 0, phase: 'Counting the queue', error: null };
  (async () => {
    try {
      const [c] = await (db.$queryRawUnsafe(`select count(*)::int n from "Journal" where ${JOURNAL_QUEUE}`) as Promise<any[]>);
      job.total = Number(c?.n ?? 0); job.phase = 'Judging the queue';
      const rows: JournalRow[] = [];
      let last = '', truncated = false;
      for (;;) {
        const chunk: any[] = await db.$queryRawUnsafe(`select ${JOURNAL_COLUMNS} from "Journal" where ${JOURNAL_QUEUE} and id > $1 order by id limit ${CHUNK}`, last);
        if (!chunk.length) break;
        for (const j of chunk) { if (rows.length < ROW_CAP) rows.push(rowOf(j, thresholds)); else truncated = true; }
        last = chunk[chunk.length - 1].id; job.processed += chunk.length;
        await new Promise(r => setImmediate(r));
      }
      const tiers = blankTiers(); const dept = new Map<string, { high: number; medium: number; low: number }>(); const origin: Record<string, Record<JournalTier, number>> = {};
      const against = { same: 0, different: 0, engineHasNoAnswer: 0 };
      const seen: Record<JournalTier, number> = blankTiers(); const samples: JournalSummary['samples'] = { high: [], medium: [], low: [], unclassifiable: [] };
      for (const r of rows) {
        tiers[r.tier]++; (origin[r.origin] ||= blankTiers())[r.tier]++;
        if (r.dept && r.tier !== 'unclassifiable') { const d = dept.get(r.dept) || { high: 0, medium: 0, low: 0 }; (d as any)[r.tier]++; dept.set(r.dept, d); }
        if (r.dept) { if (!r.legacy) against.engineHasNoAnswer++; else if (r.legacy === r.dept) against.same++; else against.different++; }
        // A bounded, representative sample per tier (reservoir), never more than SAMPLE rows.
        seen[r.tier]++;
        const s = { id: r.id, title: r.title, issn: r.issn, origin: r.origin, suggested: r.dept, score: r.score, margin: r.margin, evidence: r.families };
        const list = samples[r.tier];
        if (list.length < SAMPLE) list.push(s); else { const k = Math.floor(Math.random() * seen[r.tier]); if (k < SAMPLE) list[k] = s; }
      }
      const summary: JournalSummary = {
        finishedAt: new Date().toISOString(), classifierVersion: JOURNAL_CLASSIFIER_VERSION, thresholds, analysed: rows.length, queueTotal: job.total, truncated, tiers,
        byDepartment: [...dept.entries()].map(([department, v]) => ({ department, ...v })).sort((a, b) => (b.high + b.medium + b.low) - (a.high + a.medium + a.low)).slice(0, 40),
        byOrigin: origin, againstEngineRule: against, samples,
        note: 'These numbers describe suggestions only. The analysis does not modify any journal; only this summary and an audit entry are stored.',
      };
      cache = { rows, builtAt: summary.finishedAt };
      await db.appSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: summary as any, updatedBy: admin?.email || 'journal-review' }, update: { value: summary as any, updatedBy: admin?.email || 'journal-review' } });
      job = { ...job, status: 'done', finishedAt: summary.finishedAt, phase: 'Done' };
      releaseReviewJob('journal-analysis');
      onDone?.(summary);
    } catch (e: any) {
      job = { ...job, status: 'failed', finishedAt: new Date().toISOString(), error: String(e?.message || e).slice(0, 300), phase: 'Failed' };
      releaseReviewJob('journal-analysis');
      onDone?.(null, job.error!);
    }
  })();
  return true;
}

// ── Browsing the result ─────────────────────────────────────────────────────

export type JournalFilters = { tier?: JournalTier; department?: string; origin?: string; status?: string; q?: string; minScore?: number };

export function journalRecords(f: JournalFilters, page = 1, take = 50) {
  take = Math.min(Math.max(1, take), 100); page = Math.max(1, page);
  if (!cache) return { available: false, total: 0, page, take, asOf: null as string | null, records: [] as JournalRow[] };
  const q = (f.q || '').trim().toLowerCase();
  const list = cache.rows.filter(r =>
    (!f.tier || r.tier === f.tier) && (!f.department || r.dept === f.department) && (!f.origin || r.origin === f.origin) && (!f.status || r.status === f.status)
    && (f.minScore == null || r.score >= f.minScore) && (!q || r.title.toLowerCase().includes(q) || (r.issn || '').includes(q) || (r.eissn || '').includes(q)));
  list.sort((a, b) => b.score - a.score || b.margin - a.margin || a.title.localeCompare(b.title));
  return { available: true, total: list.length, page, take, asOf: cache.builtAt, records: list.slice((page - 1) * take, page * take) };
}
