/**
 * The vocabulary of the historical backfill: what kinds of content it can be asked for, how a job moves, and the small contract every provider adapter meets.
 * Nothing in this file (or in the chunk and worker code that uses it) knows about books, articles or journals: a new kind of content is an adapter and one line here.
 */

/**
 * Content a backfill can be asked for. A string in the database, so a new kind needs no migration.
 *   JOURNAL   → the Journal model. Periodicals ARE Journals: there is deliberately no PERIODICAL type, table or pipeline.
 *   ARTICLE   → Article (journal articles)
 *   BOOK      → Book
 *   CASE_REPORT, THESIS, CONFERENCE_PROCEEDING, EDUCATIONAL_VIDEO, NEWSLETTER, MAGAZINE
 *             → RESERVED (see RESERVED_TYPES). The names are recognised so that future adapters have somewhere to land, but NOTHING may be written for them until the separate
 *               content-model audit has confirmed which existing catalogue model is canonical for each. In particular they are not to be written into Article merely because
 *               an Article row could hold them.
 */
export const BACKFILL_TYPES = ['JOURNAL', 'ARTICLE', 'BOOK', 'CASE_REPORT', 'THESIS', 'CONFERENCE_PROCEEDING', 'EDUCATIONAL_VIDEO', 'NEWSLETTER', 'MAGAZINE'] as const;
export type BackfillType = typeof BACKFILL_TYPES[number];
export const TYPE_LABEL: Record<BackfillType, string> = {
  JOURNAL: 'Journals', ARTICLE: 'Articles', BOOK: 'Books', CASE_REPORT: 'Case reports', THESIS: 'Theses', CONFERENCE_PROCEEDING: 'Conference proceedings',
  EDUCATIONAL_VIDEO: 'Educational videos', NEWSLETTER: 'Newsletters', MAGAZINE: 'Magazines',
};
/** Recognised, but no job may be created for them yet: their catalogue model is not confirmed. Enforced in createJob, whatever an adapter claims, and shown as reserved on the screen. */
export const RESERVED_TYPES: readonly BackfillType[] = ['CASE_REPORT', 'THESIS', 'CONFERENCE_PROCEEDING', 'EDUCATIONAL_VIDEO', 'NEWSLETTER', 'MAGAZINE'];
export const isReservedType = (t: string) => (RESERVED_TYPES as readonly string[]).includes(t);
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
  /** When the job was created: an adapter may use it to make a page independent of what changed in the catalogue afterwards. */
  createdAt: Date;
  /** The source's identity as recorded when the job was created (see BackfillAdapter.sourceIdentity); null for a source with none. */
  identity: string | null;
  windowStart: Date | null; windowEnd: Date | null; departments: string[]; accessPreference: AccessPreference; maxRecords: number;
  /** The adapter's own parameters (config.adapter). */
  adapter: Record<string, any>;
};

/** `meta`: whole-number facts about what the page cost the source (lines scanned, records not relevant …). Kept with the chunk's plan and added to the job's `sourceStats` once, on commit. */
export type Page<R = any> = { records: R[]; nextCursor: string | null; bytes: number; meta?: Record<string, number> };

/** One adapter setting the screen may ask for. */
export type AdapterParam = { key: string; label: string; type: 'text' | 'number' | 'boolean'; help?: string; placeholder?: string; default?: string | number | boolean; min?: number; max?: number };
export type Judged<N = any> = {
  id: string; outcome: Outcome; dup?: DupKind; reason?: string | null; item: N;
  /**
   * Whole-number facts about this record an adapter wants counted ("fill.homepage", "protected", "ambiguous"). Each tag is added up over the chunk and kept in the chunk's plan, so it reaches
   * the job's `sourceStats` (as `t.<tag>`) exactly once, like every other counter. At most 64 distinct tags per chunk.
   */
  tags?: string[];
  /** The label this record's example carries in the preview's list of conflicts/refusals ("ambiguous", "identity conflict"), so each kind keeps its own share of the examples. */
  group?: string;
  /** Counted like any other record, but never listed as an example (a flood of an uninteresting kind must not hide the interesting ones). */
  quiet?: boolean;
  /** Adapter-private: whatever apply() needs to write this record without judging it again. */
  extra?: any;
};
export type WriteResult = 'written' | 'present' | 'failed';

/** How much of a dry run is kept as examples. The defaults suit every adapter; one may ask for more of each kind (still hard-bounded by the preview's byte cap). */
export type PreviewCaps = { samples: number; issues: number; perOutcome: number; perIssueKind: number };

export interface BackfillAdapter<R = any, N = any> {
  id: string; label: string; contentTypes: readonly BackfillType[];
  /** The adapter only completes records already in the catalogue and never creates one (a record not held is refused). The screen words its results accordingly. */
  enrichOnly?: boolean;
  previewCaps?: Partial<PreviewCaps>;
  /** The least wait between two chunks, for an adapter that reads only a local file and the database (no provider to be polite to). Default: BACKFILL_MIN_GAP_SECONDS. The worker still waits as long as the chunk took. */
  gapSeconds?: number;
  /** A test stand-in: listed only where BACKFILL_FIXTURE=1 and never in production. */
  fixture?: boolean;
  /** The settings this adapter takes (under config.adapter); the screen draws one input for each. */
  params?: AdapterParam[];
  /**
   * What the adapter is about to read, as a short deterministic string (a snapshot's release and file list). Recorded on the job when it is created; a real start is refused if it differs
   * from the preview's, and the adapter puts it in its own cursor so a resume against something else is noticed. Throw BackfillError for a source that cannot be used.
   */
  sourceIdentity?(adapter: Record<string, any>): Promise<string>;
  /** A short, human description of that source for the screen ("release 2026-10-14, 2 files, 1,851 records"). */
  describe?(adapter: Record<string, any>): Promise<{ summary: string; details: Record<string, string | number> }>;
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
   * The writes. `write` = new records to add (published / review / held); `enrich` = duplicates whose empty fields may be filled, and conflicting duplicates an adapter may keep bounded
   * evidence of (never a change to what the held record IS). Idempotent: writing a
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
  pageHash: string; planned: [string, PlanCode][]; counts: Counts; bytes: number; meta?: Record<string, number>; plannedAt: string; attempts: number;
};

/**
 * Thrown by an adapter when it must stop NOW and not be retried: the source is no longer what the job was started against. The job becomes Failed with `code` and `message`, its
 * cursor and any saved plan are left exactly as they were (evidence), and nothing is reset. Unlike an ordinary error it is not retried.
 */
export class BackfillStop extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/**
 * Thrown by an adapter when the source cannot be asked RIGHT NOW and that is not a fault of the job: the source is resting after errors, or has asked us to slow down (HTTP 429/503
 * with Retry-After). The chunk is not run, nothing is counted, nothing is retried-and-failed, and no error streak builds: the job stays Running, says why in `config.waiting`, and the
 * worker looks again after `untilMs` (or a short default). Unlike BackfillStop it never fails the job. An adapter that raises it must NOT write the source's health row: backfill is a
 * guest of the continuous engine's breaker, never a voice in it.
 */
export class BackfillWait extends Error {
  constructor(public reason: string, public untilMs: number | null = null) { super(reason); }
}

export class BackfillError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
