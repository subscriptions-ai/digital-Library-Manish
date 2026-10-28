import { canonicalOrSelf } from '../departmentRegistry.js';
import { ingestionDb } from './db.js';
import { runConditions, RUN_LEVEL, PROVIDER_FAILURE_SQL, EARLIEST_DAY } from './runFilter.js';
import { publishedGroups, notRecordedCount, foldPublished, publishedContent, type PubGroups, type PublishedSummary, type PubType } from './dailyPublished.js';

/**
 * Daily Ingestion Summary — what NEW content the catalogue gained in one reporting cycle. Read-only.
 *
 * A cycle is not a calendar day. The cycle labelled with report date D runs
 *
 *     (D − 1) 5:01 PM IST   through   D 5:00 PM IST
 *
 * and is a pure function of timestamps: nothing is stored, reset or zeroed at 5:01 PM, so a report for any past day can be
 * rebuilt at any time and a missed job can lose nothing.
 *
 * THE BOUNDARY, exactly. Timestamps are millisecond-precise (`timestamp(3)`), so "through 5:00 PM" has to mean the whole
 * minute 5:00 PM — 17:00:00.000 to 17:00:59.999 — or a record stamped 17:00:30 would belong to no report. Every cycle is therefore
 * the half-open interval  [ (D−1) 17:01:00.000 , D 17:01:00.000 )  IST: the end of one report IS the start of the next, with no gap
 * and no overlap. The screen shows it in the words the business uses ("5:01 PM → 5:00 PM"), and the instants are returned as well.
 *
 *     16:59:59 → report D    17:00:00 → report D    17:00:59.999 → report D
 *     17:01:00 → report D+1  17:01:01 → report D+1
 *
 * WHAT "ADDED" MEANS. A row in the catalogue that the engine created in the cycle (`createdAt`) and that is public now:
 *     Article / Book  status = 'Published', ownershipSource = 'Ingested'
 *     Journal         status = 'Accepted'
 * Held-back records (Draft / NeedsReview), refused ones, duplicates and enrichments of records already held are not "added":
 * a duplicate writes no row, an enrichment edits an old one (its createdAt does not move), and the rest are not public.
 * The department is the record's own, folded to the official name by the department registry; a record with none is reported
 * as Unassigned rather than dropped, so the table always adds up to the total.
 *
 * The totals, the department table and the clicked record lists are all read from the SAME predicate (ADDED below), so they cannot disagree.
 *
 * "Added" is about CREATION. A record that is approved from review days later is "added" in the cycle it was created in; the cycle it BECAME PUBLIC in is a
 * different question, answered separately by `published` (dailyPublished.ts: the real transition into public status, from the publication event, Review
 * Automation's own stamp, or `createdAt` for a record the engine created public). The two never mix: a record created today and still a Draft is in neither,
 * one created last week and published today is in `published` only, and one created and published today is in both.
 *
 * Known limits, shown rather than hidden: the department is the record's department NOW (a record moved later is reported where it
 * is); a deleted record is gone. Nothing here is estimated from run totals.
 */

// ── The reporting window ────────────────────────────────────────────────────

const IST_OFFSET_MS = 330 * 60_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** 5:01 PM, as minutes after midnight. The cycle cut-over. */
export const CUT_MINUTE = 17 * 60 + 1;

const validDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** The instant that is `minute` minutes after midnight IST on `day`. */
const istInstant = (day: string, minute: number) => new Date(Date.parse(`${day}T00:00:00Z`) + minute * MINUTE_MS - IST_OFFSET_MS);

export type DailyWindow = {
  /** The date the cycle ENDS on, YYYY-MM-DD (IST). The report's name. */
  reportDate: string;
  /** Inclusive. (reportDate − 1) 17:01:00.000 IST. */
  start: Date;
  /** Exclusive. reportDate 17:01:00.000 IST — also the start of the next report. */
  end: Date;
  /** The last minute the cycle covers, as the business states it: reportDate 5:00 PM IST. (end − 1 minute.) */
  lastMinute: Date;
};

/** The window of the report named `reportDate`. */
export function dailyIngestionWindow(reportDate: string): DailyWindow {
  if (!validDay(reportDate)) throw new Error(`reportDate must be YYYY-MM-DD, got "${reportDate}"`);
  const start = istInstant(shiftDay(reportDate, -1), CUT_MINUTE);
  const end = istInstant(reportDate, CUT_MINUTE);
  return { reportDate, start, end, lastMinute: new Date(end.getTime() - MINUTE_MS) };
}

/** The report whose window contains `at` — the one that is live at that moment. */
export function reportDateAt(at: Date | number): string {
  const t = Number(at) + IST_OFFSET_MS;
  const day = new Date(t).toISOString().slice(0, 10);
  const minute = Math.floor((t % DAY_MS) / MINUTE_MS);
  return minute < CUT_MINUTE ? day : shiftDay(day, 1);
}

export type CycleState = 'live' | 'finalized';
export const cycleState = (w: DailyWindow, now: Date): CycleState => (now.getTime() < w.end.getTime() ? 'live' : 'finalized');

/** Newest first, starting with the live cycle. */
export function previousReportDates(now: Date = new Date(), count = 30): string[] {
  const out: string[] = []; let d = reportDateAt(now);
  for (let i = 0; i < count && d >= EARLIEST_DAY; i++, d = shiftDay(d, -1)) out.push(d);
  return out;
}

export type DateResult = { ok: true; reportDate: string } | { ok: false; error: string };
/** A requested report date: absent means the live cycle; it must be a real date, not before records began and not in the future. */
export function resolveReportDate(v: unknown, now: Date = new Date()): DateResult {
  if (v === undefined || v === null || v === '') return { ok: true, reportDate: reportDateAt(now) };
  if (!validDay(v)) return { ok: false, error: 'reportDate must be a date in the form YYYY-MM-DD.' };
  if (v < EARLIEST_DAY) return { ok: false, error: `Reports before ${EARLIEST_DAY} are not available.` };
  if (dailyIngestionWindow(v).start.getTime() > now.getTime()) return { ok: false, error: 'That report cycle has not started yet.' };
  return { ok: true, reportDate: v };
}

// ── What counts as added ────────────────────────────────────────────────────

export const CONTENT_TYPES = ['journal', 'article', 'book'] as const;
export type ContentType = typeof CONTENT_TYPES[number];
export const isContentType = (v: unknown): v is ContentType => typeof v === 'string' && (CONTENT_TYPES as readonly string[]).includes(v);

/** The one definition of "added", per table. Totals, the department table and the record lists all use it. */
const ADDED: Record<ContentType, { table: string; where: string }> = {
  journal: { table: 'Journal', where: `status = 'Accepted'` },
  article: { table: 'Article', where: `status = 'Published' and "ownershipSource" = 'Ingested'` },
  book: { table: 'Book', where: `status = 'Published' and "ownershipSource" = 'Ingested'` },
};
const PLURAL: Record<ContentType, 'journals' | 'articles' | 'books'> = { journal: 'journals', article: 'articles', book: 'books' };

/** The token standing for "no department" in the API and the URL. */
export const UNASSIGNED = '(unassigned)';

/**
 * `createdAt` is a UTC wall-clock `timestamp(3)` with no zone. An instant is sent as an ISO string with its Z and converted
 * explicitly, so the comparison means the same thing whatever zone the database session is set to (runFilter does the same).
 */
const utc = (n: number) => `((($${n})::text)::timestamptz at time zone 'UTC')`;
const IN_WINDOW = `"createdAt" >= ${utc(1)} and "createdAt" < ${utc(2)}`;
const windowParams = (w: DailyWindow) => [w.start.toISOString(), w.end.toISOString()];

// ── The summary ─────────────────────────────────────────────────────────────

export type DepartmentRow = { department: string; journals: number; articles: number; books: number; total: number };
export type Processing = { runs: number; alreadyHeld: number; sentToReview: number; enriched: number; refused: number; providerFailures: number; failedWrites: number };

export type DailySummary = {
  reportDate: string; timezone: 'Asia/Kolkata';
  windowStart: string; windowEnd: string; lastMinute: string; nextCycleStart: string;
  state: CycleState; isCurrentCycle: boolean; isFinalized: boolean;
  totalAdded: number; journalsAdded: number; articlesAdded: number; booksAdded: number; departmentsWithActivity: number;
  departments: DepartmentRow[];
  /** New journals catalogued as metadata-only (non-commercial licence): in the catalogue, nowhere to read — not counted as added. */
  journalsMetadataOnly: number;
  /** What became PUBLIC in this cycle (the real transition), apart from what was created in it. */
  published: PublishedSummary;
  /** What the run log recorded for runs that started in the same window. Events, not catalogue rows — never added to the figures above. */
  processing: Processing;
  generatedAt: string;
};

type Group = { domain: string | null; n: number };
export type WindowGroups = Record<ContentType, Group[]>;

/** Group a window's added records by their stored department string, one pass per table. */
async function groupsFor(q: any, w: DailyWindow): Promise<WindowGroups> {
  const run = async (t: ContentType): Promise<Group[]> =>
    q.$queryRawUnsafe(`select domain, count(*)::int n from "${ADDED[t].table}" where ${ADDED[t].where} and ${IN_WINDOW} group by 1`, ...windowParams(w));
  const journal = await run('journal'); const article = await run('article'); const book = await run('book');
  return { journal, article, book };
}

/** A stored department string → the name it is reported under. */
const reportedAs = (domain: string | null): string => { const raw = (domain ?? '').trim(); return raw ? canonicalOrSelf(raw) : UNASSIGNED; };

export function foldDepartments(g: WindowGroups): { rows: DepartmentRow[]; totals: Record<'journals' | 'articles' | 'books', number> } {
  const byName = new Map<string, DepartmentRow>();
  const totals = { journals: 0, articles: 0, books: 0 };
  for (const t of CONTENT_TYPES) {
    const k = PLURAL[t];
    for (const r of g[t]) {
      if (!r.n) continue;
      const name = reportedAs(r.domain);
      const row = byName.get(name) ?? { department: name, journals: 0, articles: 0, books: 0, total: 0 };
      row[k] += r.n; row.total += r.n; totals[k] += r.n;
      byName.set(name, row);
    }
  }
  // Total, high to low; ties by name, with Unassigned last so it never reads as a department.
  const rows = [...byName.values()].sort((a, b) => b.total - a.total || (a.department === UNASSIGNED ? 1 : b.department === UNASSIGNED ? -1 : a.department.localeCompare(b.department)));
  return { rows, totals };
}

async function processing(q: any, w: DailyWindow): Promise<Processing> {
  const params: any[] = [];
  const where = runConditions({ start: w.start, end: w.end }, params);
  const [r] = await q.$queryRawUnsafe(
    `select count(*)::int runs,
            coalesce(sum(r."skippedHeld"), 0)::int "alreadyHeld", coalesce(sum(r."needsReview"), 0)::int "sentToReview",
            coalesce(sum(r.enriched), 0)::int enriched, coalesce(sum(r."skippedRejected"), 0)::int refused,
            (count(*) filter (where ${PROVIDER_FAILURE_SQL}))::int "providerFailures", coalesce(sum(r."skippedFailed"), 0)::int "failedWrites"
       from ${RUN_LEVEL} where ${where.join(' and ')}`, ...params);
  return r;
}

const CACHE_LIVE_MS = Number(process.env.INGEST_DAILY_LIVE_CACHE_MS ?? 30_000);          // the live cycle moves; half a minute is current enough
const CACHE_FINAL_MS = Number(process.env.INGEST_DAILY_FINAL_CACHE_MS ?? 300_000);       // a finished cycle changes only if a person approves something late
type Cached = { at: number; groups: WindowGroups; metadataOnly: number; processing: Processing; published: PubGroups; notRecorded: number };
const cache = new Map<string, Cached>();

/**
 * Only the DATA is cached, keyed by the report date; whether the cycle is live or finalized, and the labels, are worked out from the clock on
 * every request, so a cached figure can never carry a stale "live" across 5:01 PM. `fresh` skips the cache (the refresh button).
 */
export async function dailySummary(reportDate: string, opts: { now?: Date; fresh?: boolean; db?: any } = {}): Promise<DailySummary> {
  const now = opts.now ?? new Date(); const db = opts.db ?? ingestionDb;
  const w = dailyIngestionWindow(reportDate);
  const state = cycleState(w, now);
  const ttl = state === 'live' ? CACHE_LIVE_MS : CACHE_FINAL_MS;
  const key = `${db === ingestionDb ? '' : 'x'}${reportDate}`;

  let hit = opts.fresh || ttl <= 0 ? undefined : cache.get(key);
  if (hit && Date.now() - hit.at >= ttl) hit = undefined;
  if (!hit) {
    // One snapshot for every read, so a record written mid-request cannot make the parts disagree with each other.
    hit = await db.$transaction(async (tx: any) => {
      const groups = await groupsFor(tx, w);
      const [m] = await tx.$queryRawUnsafe(`select count(*)::int n from "Journal" where status = 'MetadataOnly' and ${IN_WINDOW}`, ...windowParams(w));
      return { at: Date.now(), groups, metadataOnly: m?.n ?? 0, processing: await processing(tx, w), published: await publishedGroups(tx, w), notRecorded: await notRecordedCount(tx) } as Cached;
    }, { isolationLevel: 'RepeatableRead' });
    if (ttl > 0) cache.set(key, hit!);
  }

  const { rows, totals } = foldDepartments(hit!.groups);
  return {
    reportDate, timezone: 'Asia/Kolkata',
    windowStart: w.start.toISOString(), windowEnd: w.end.toISOString(), lastMinute: w.lastMinute.toISOString(), nextCycleStart: w.end.toISOString(),
    state, isCurrentCycle: state === 'live', isFinalized: state === 'finalized',
    totalAdded: totals.journals + totals.articles + totals.books, journalsAdded: totals.journals, articlesAdded: totals.articles, booksAdded: totals.books,
    // Unassigned is records with no department, not a department: it is listed in the table but not counted here.
    departmentsWithActivity: rows.filter(r => r.department !== UNASSIGNED).length,
    departments: rows, journalsMetadataOnly: hit!.metadataOnly, published: foldPublished(hit!.published, hit!.notRecorded), processing: hit!.processing, generatedAt: new Date(hit!.at).toISOString(),
  };
}

// ── The records behind a number ─────────────────────────────────────────────

export type ContentRow = {
  id: string; type: ContentType; title: string; authors: string | null; publisher: string | null;
  doi: string | null; issn: string | null; eissn: string | null; isbn: string | null; journal: string | null;
  provider: string | null; department: string; addedAt: string; access: string | null; status: 'Added';
};
export type ContentPage = {
  reportDate: string; windowStart: string; windowEnd: string;
  department: string | null; type: ContentType | 'all';
  total: number; page: number; pageSize: number; rows: ContentRow[];
};

export const MAX_PAGE_SIZE = 200;

/** Per type, the same columns in the same order so the three can be unioned. */
const SELECT: Record<ContentType, string> = {
  article: `id, 'article' kind, title, authors, "publisherName" publisher, doi, null::text issn, null::text eissn, null::text isbn, "journalName" journal, source provider, domain, "createdAt", "accessStatus" access`,
  journal: `id, 'journal' kind, title, null::text authors, "publisherName" publisher, null::text doi, issn, eissn, null::text isbn, null::text journal, "rightsBasis" provider, domain, "createdAt", licence access`,
  book: `id, 'book' kind, title, authors, "publisherName" publisher, doi, null::text issn, null::text eissn, isbn, null::text journal, source provider, domain, "createdAt", coalesce("accessStatus", "rightsStatus") access`,
};

/**
 * The exact records one number is made of. `department` narrows to one department (UNASSIGNED for none); `type` to one kind.
 * A department's stored spellings are found from the window's own records, so a record filed under an older spelling is listed under the
 * official name it was counted under.
 */
export async function dailyContent(
  q: { reportDate: string; department?: string | null; type?: ContentType | 'all'; page?: number; pageSize?: number },
  opts: { db?: any } = {},
): Promise<ContentPage> {
  const db = opts.db ?? ingestionDb;
  const w = dailyIngestionWindow(q.reportDate);
  const type = q.type && q.type !== 'all' ? q.type : 'all';
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(q.pageSize || 50)));
  const page = Math.max(1, Math.floor(q.page || 1));
  const department = q.department ? q.department : null;

  const params: any[] = [...windowParams(w)];
  let deptSql = '';
  if (department === UNASSIGNED) deptSql = ` and (domain is null or btrim(domain) = '')`;
  else if (department) {
    const groups = await groupsFor(db, w);
    const spellings = new Set<string>();
    for (const t of CONTENT_TYPES) for (const r of groups[t]) if (r.domain != null && reportedAs(r.domain) === canonicalOrSelf(department.trim())) spellings.add(r.domain);
    if (!spellings.size) return { reportDate: q.reportDate, windowStart: w.start.toISOString(), windowEnd: w.end.toISOString(), department, type, total: 0, page, pageSize, rows: [] };
    params.push([...spellings]); deptSql = ` and domain = any($${params.length}::text[])`;
  }

  const kinds: ContentType[] = type === 'all' ? [...CONTENT_TYPES] : [type];
  const union = kinds.map(t => `select ${SELECT[t]} from "${ADDED[t].table}" where ${ADDED[t].where} and ${IN_WINDOW}${deptSql}`).join(' union all ');
  const [{ n: total }] = await db.$queryRawUnsafe(`select count(*)::int n from (${union}) u`, ...params);
  const rows: any[] = await db.$queryRawUnsafe(
    `select * from (${union}) u order by "createdAt" desc, id desc limit ${pageSize} offset ${(page - 1) * pageSize}`, ...params);

  return {
    reportDate: q.reportDate, windowStart: w.start.toISOString(), windowEnd: w.end.toISOString(), department, type, total, page, pageSize,
    rows: rows.map((r): ContentRow => ({
      id: r.id, type: r.kind, title: r.title, authors: r.authors, publisher: r.publisher, doi: r.doi, issn: r.issn, eissn: r.eissn, isbn: r.isbn,
      journal: r.journal, provider: r.provider, department: reportedAs(r.domain),
      addedAt: new Date(r.createdAt).toISOString(), access: r.access, status: 'Added',
    })),
  };
}

// ── The records behind a PUBLISHED number ───────────────────────────────────

/** The exact records that became public in the cycle (title, type, department, provider, published at, method). Same definition as `published` above. */
export async function dailyPublishedContent(
  q: { reportDate: string; department?: string | null; type?: ContentType | 'all'; page?: number; pageSize?: number },
  opts: { db?: any } = {},
) {
  const w = dailyIngestionWindow(q.reportDate);
  const r = await publishedContent(opts.db ?? ingestionDb, w, { department: q.department, type: q.type as PubType | 'all', page: q.page, pageSize: q.pageSize }, MAX_PAGE_SIZE);
  return { reportDate: q.reportDate, windowStart: w.start.toISOString(), windowEnd: w.end.toISOString(), basis: 'published' as const, ...r };
}
