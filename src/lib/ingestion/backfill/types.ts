/**
 * The vocabulary of the historical backfill: what kinds of content it can be asked for, how a job moves, and the small contract every provider adapter meets.
 * Nothing in this file (or in the chunk and worker code that uses it) knows about books, articles or journals: a new kind of content is an adapter and one line here.
 */

/**
 * Content a backfill can be asked for. A string in the database, so a new kind needs no migration.
 *   JOURNAL                       → the Journal model. Periodicals ARE Journals: there is deliberately no PERIODICAL type, table or pipeline.
 *   ARTICLE                       → Article ("Periodicals" content type, i.e. journal articles)
 *   BOOK                          → Book
 *   CASE_REPORT … MAGAZINE        → Article rows carrying the matching existing contentType label (Case Reports, Theses, Conference Proceedings, Educational Videos, Newsletters, Magazines)
 */
export const BACKFILL_TYPES = ['JOURNAL', 'ARTICLE', 'BOOK', 'CASE_REPORT', 'THESIS', 'CONFERENCE_PROCEEDING', 'EDUCATIONAL_VIDEO', 'NEWSLETTER', 'MAGAZINE'] as const;
export type BackfillType = typeof BACKFILL_TYPES[number];
export const TYPE_LABEL: Record<BackfillType, string> = {
  JOURNAL: 'Journals', ARTICLE: 'Articles', BOOK: 'Books', CASE_REPORT: 'Case reports', THESIS: 'Theses', CONFERENCE_PROCEEDING: 'Conference proceedings',
  EDUCATIONAL_VIDEO: 'Educational videos', NEWSLETTER: 'Newsletters', MAGAZINE: 'Magazines',
};
export const isBackfillType = (v: unknown): v is BackfillType => typeof v === 'string' && (BACKFILL_TYPES as readonly string[]).includes(v);

export const JOB_STATUSES = ['Pending', 'Running', 'Paused', 'Completed', 'Failed', 'Cancelled'] as const;
export type JobStatus = typeof JOB_STATUSES[number];
export const TERMINAL: JobStatus[] = ['Completed', 'Failed', 'Cancelled'];
export const ACTIVE: JobStatus[] = ['Pending', 'Running', 'Paused'];
export const ACCESS_PREFERENCES = ['OAFirst', 'MetadataOnlyAllowed'] as const;
export type AccessPreference = typeof ACCESS_PREFERENCES[number];

/** What the judge decides for one record. `held` = a new record kept back for a person without being published (books); `duplicate` = already in the catalogue. */
export type Outcome = 'publish' | 'review' | 'held' | 'duplicate' | 'refused';
export type DupKind = 'unchanged' | 'enriched' | 'conflicting';

/** The job as an adapter sees it: the request, never the counters or the checkpoint machinery. */
export type JobView = {
  id: string; provider: string; contentType: BackfillType; dryRun: boolean;
  windowStart: Date | null; windowEnd: Date | null; departments: string[]; accessPreference: AccessPreference; maxRecords: number;
  /** The adapter's own parameters (config.adapter). */
  adapter: Record<string, any>;
};

export type Page<R = any> = { records: R[]; nextCursor: string | null; bytes: number };
export type Judged<N = any> = {
  id: string; outcome: Outcome; dup?: DupKind; reason?: string | null; item: N;
  /** Adapter-private: whatever apply() needs to write this record without judging it again. */
  extra?: any;
};
export type WriteResult = 'written' | 'present' | 'failed';

export interface BackfillAdapter<R = any, N = any> {
  id: string; label: string; contentTypes: readonly BackfillType[];
  /** A test stand-in: listed only where BACKFILL_FIXTURE=1 and never in production. */
  fixture?: boolean;
  /** The provider lock this adapter takes, one chunk at a time. A real adapter uses the SAME key as the continuous engine for that provider. */
  lock: string;
  /** True, or the reason this adapter cannot run here. */
  available(): true | string;
  /** The record's identity at the source, stable across fetches. Never a position in the page. */
  stableId(raw: R): string;
  /** Read-only and repeatable: the same cursor must give the same page (the retry check depends on it). `cursor` is null at the start. */
  fetchPage(job: JobView, cursor: string | null, limit: number): Promise<Page<R>>;
  normalize(raw: R, job: JobView): N | { error: string };
  /** Read-only: decide, against the catalogue as it is now, what each record is. */
  judge(items: { id: string; item: N }[], job: JobView): Promise<Judged<N>[]>;
  /**
   * The writes. `write` = new records to add (published / review / held); `enrich` = duplicates whose empty fields may be filled. Idempotent: writing a
   * record that is already there is "present", not a second record. Never touches licence, DOI, file, access or status of a record that already exists.
   */
  apply(write: Judged<N>[], enrich: Judged<N>[], job: JobView): Promise<Map<string, WriteResult>>;
}

/** The one-letter plan code kept per record in the in-flight chunk. */
export type PlanCode = 'P' | 'R' | 'H' | 'U' | 'E' | 'C' | 'X' | 'F';
export type Counts = {
  fetched: number; normalized: number; unique: number; duplicate: number; enriched: number; conflicting: number;
  held: number; review: number; published: number; refused: number; failed: number; bytes: number;
};
export const zeroCounts = (): Counts => ({ fetched: 0, normalized: 0, unique: 0, duplicate: 0, enriched: 0, conflicting: 0, held: 0, review: 0, published: 0, refused: 0, failed: 0, bytes: 0 });

/** The bounded identity of a planned chunk (BackfillJob.inflight). Never holds a record. */
export type Inflight = {
  v: 1; chunkNumber: number; cursorBefore: string | null; expectedCursorAfter: string | null; limit: number;
  pageHash: string; planned: [string, PlanCode][]; counts: Counts; bytes: number; plannedAt: string; attempts: number;
};

export class BackfillError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
