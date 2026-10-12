import { ingestionDb as db } from './db.js';
import { DOMAINS } from '../../constants.js';
import { runConditions, eachDay, FAILED_RUN_SQL, RUN_FROM, type RunFilter, type ResolvedRange } from './runFilter.js';

/**
 * Department-wise numbers for the ingestion screen. Two kinds, kept apart on purpose:
 *
 *   CATALOGUE  — what is in the library right now. Counted from the catalogue tables with the same status rules the
 *                public site uses (Book and Article: status 'Published'; Journal: status 'Accepted'). It does not move
 *                when the time filter does.
 *   INGESTION  — what the engine and the administrators' imports did, summed from the run log for a period.
 *
 * Which department a run belongs to, in order: the department written on the run (journal discovery and DOAB sweeps);
 * otherwise the department of the journal the run visited (every article run names its journal). A run that has
 * neither — book harvests, Quick Import, catalogue imports — spans several departments and is reported as
 * "unattributed" rather than guessed at.
 */

export const DEPARTMENT_NAMES: string[] = (DOMAINS as any[]).map(d => d.name);

const HOUR = 3600_000;
const FAILURE_WINDOW_DAYS = 7;

// ── Catalogue (current) ─────────────────────────────────────────────────────

export type CatalogueRow = { books: number; articles: number; journals: number; needsReview: number };
type CatalogueSnapshot = { byDepartment: Map<string, CatalogueRow>; noDepartment: CatalogueRow; unplacedReview: number; at: number };

const zero = (): CatalogueRow => ({ books: 0, articles: 0, journals: 0, needsReview: 0 });

/**
 * One grouped count per table, on the existing `domain` and `status` indexes. Kept for a short while because the
 * screen refreshes itself; a figure that is thirty seconds old is still the current catalogue, and a fresh count
 * over every article on each refresh would be work for no reader. Concurrent callers share one load.
 */
const CATALOGUE_TTL_MS = Number(process.env.INGEST_CATALOGUE_CACHE_MS ?? 30_000);   // the override is for tests, which must see their own writes
let catalogueCache: CatalogueSnapshot | null = null;
let catalogueLoading: Promise<CatalogueSnapshot> | null = null;

async function loadCatalogue(): Promise<CatalogueSnapshot> {
  const [books, articles, journals, bookReview, articleReview] = await Promise.all([
    db.$queryRawUnsafe(`select domain, count(*)::int n from "Book" where status = 'Published' group by 1`),
    db.$queryRawUnsafe(`select domain, count(*)::int n from "Article" where status = 'Published' group by 1`),
    db.$queryRawUnsafe(`select domain, count(*)::int n from "Journal" where status = 'Accepted' group by 1`),
    // A harvested book awaiting review has no department yet; the harvest's best suggestion is what places it here.
    db.$queryRawUnsafe(`select coalesce(domain, metadata->'harvest'->'department'->>'suggested') domain, count(*)::int n from "Book" where status = 'Draft' group by 1`),
    db.$queryRawUnsafe(`select domain, count(*)::int n from "Article" where status = 'Draft' group by 1`),
  ]) as any[][];

  // Every taxonomy department is present, empty or not. A domain the catalogue holds that is NOT in the taxonomy (an older
  // name such as "Engineering") gets its own row too, so its content is neither hidden nor folded into another department.
  const byDepartment = new Map<string, CatalogueRow>(DEPARTMENT_NAMES.map(n => [n, zero()]));
  const noDepartment = zero();         // rows with no department at all
  let unplacedReview = 0;
  const add = (rows: any[], key: keyof CatalogueRow) => {
    for (const r of rows) {
      const name = typeof r.domain === 'string' ? r.domain.trim() : '';
      if (name && !byDepartment.has(name)) byDepartment.set(name, zero());
      const target = (name && byDepartment.get(name)) || noDepartment;
      target[key] += r.n;
      if (!name && key === 'needsReview') unplacedReview += r.n;
    }
  };
  add(books, 'books'); add(articles, 'articles'); add(journals, 'journals');
  add(bookReview, 'needsReview'); add(articleReview, 'needsReview');
  return { byDepartment, noDepartment, unplacedReview, at: Date.now() };
}

/** A department the screen may ask about: one in the taxonomy, or one the catalogue really holds under that name. */
export async function departmentExists(v: unknown): Promise<boolean> {
  if (typeof v !== 'string' || !v) return false;
  return DEPARTMENT_NAMES.includes(v) || (await catalogueSnapshot()).byDepartment.has(v);
}

export async function catalogueSnapshot(): Promise<CatalogueSnapshot> {
  if (catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_TTL_MS) return catalogueCache;
  if (!catalogueLoading) {
    catalogueLoading = loadCatalogue().then(s => (catalogueCache = s)).finally(() => { catalogueLoading = null; });
  }
  return catalogueLoading;
}

// ── Ingestion (events in a period) ──────────────────────────────────────────

export type IngestionRow = {
  runs: number; booksAdded: number; articlesAdded: number; journalsAccepted: number;
  held: number; failedRuns: number; failedWrites: number; sentToReview: number; refused: number;
};
const zeroIngestion = (): IngestionRow => ({ runs: 0, booksAdded: 0, articlesAdded: 0, journalsAccepted: 0, held: 0, failedRuns: 0, failedWrites: 0, sentToReview: 0, refused: 0 });

/** One cell of the filtered run set: a department (null = none recorded) on one India day. */
type Cell = { dept: string | null; day: string; row: IngestionRow; firstAt: Date | null };

/**
 * THE filtered run set, read once: the runs matching `f` (department excluded — it is grouped, not filtered), summed per
 * department per India day. The summary, the unattributed block and the by-day table are all derived from these same
 * cells in code, never from separate queries, so they cannot disagree. The run list selects from the same predicate
 * (runConditions) and the tests check the rows add up to these figures.
 */
async function filteredCells(f: RunFilter): Promise<Cell[]> {
  const params: any[] = []; const where = runConditions({ ...f, department: null }, params);
  const rows: any[] = await db.$queryRawUnsafe(
    `select coalesce(r.department, j.domain) dept,
            to_char(r."at" + interval '330 minutes', 'YYYY-MM-DD') as day,
            count(*)::int runs,
            coalesce(sum(r.added) filter (where r.phase = 'Books'), 0)::int "booksAdded",
            coalesce(sum(r.added) filter (where r.phase = 'Articles'), 0)::int "articlesAdded",
            coalesce(sum(r."journalsAccepted") filter (where r.phase = 'Journals'), 0)::int "journalsAccepted",
            coalesce(sum(r."skippedHeld"), 0)::int held,
            (count(*) filter (where ${FAILED_RUN_SQL}))::int "failedRuns",
            coalesce(sum(r."skippedFailed"), 0)::int "failedWrites",
            coalesce(sum(r."needsReview"), 0)::int "sentToReview",
            coalesce(sum(r."skippedRejected"), 0)::int refused,
            min(r."at") first_at
       from ${RUN_FROM}
      ${where.length ? `where ${where.join(' and ')}` : ''}
      group by 1, 2`, ...params);
  return rows.map(({ dept, day, first_at, ...vals }) => ({ dept: dept ?? null, day, row: vals as IngestionRow, firstAt: first_at ?? null }));
}

const sumRows = (rows: Iterable<IngestionRow>): IngestionRow => {
  const t = zeroIngestion();
  for (const r of rows) for (const k of Object.keys(t) as (keyof IngestionRow)[]) t[k] += r[k] || 0;
  return t;
};

export type DayRow = { day: string; books: number; articles: number; journals: number; held: number; failedRuns: number; sentToReview: number };

/**
 * One row per India day, from the same cells as the totals. When the range names its days, every day in it gets a row — a day
 * with nothing is a 0, not a gap. With no range (Lifetime) only days that had activity appear, newest first.
 */
function dayRows(cells: Cell[], range: ResolvedRange): DayRow[] {
  const by = new Map<string, DayRow>();
  const blank = (day: string): DayRow => ({ day, books: 0, articles: 0, journals: 0, held: 0, failedRuns: 0, sentToReview: 0 });
  for (const c of cells) {
    const d = by.get(c.day) || blank(c.day);
    d.books += c.row.booksAdded; d.articles += c.row.articlesAdded; d.journals += c.row.journalsAccepted;
    d.held += c.row.held; d.failedRuns += c.row.failedRuns; d.sentToReview += c.row.sentToReview;
    by.set(c.day, d);
  }
  if (range.fromDay && range.toDay) return eachDay(range.fromDay, range.toDay).map(day => by.get(day) || blank(day));
  return [...by.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

// ── The two answers the screen asks for ─────────────────────────────────────

/**
 * One department (or all of them) over one date range, optionally narrowed to a kind, a source or a result.
 *
 * `catalogue` ignores every filter but the department: it is what the library holds now.
 * `ingestion` is the run log, narrowed by all of them.
 * `unattributed` is only meaningful for a single department: what the same filters match in runs that could not be assigned
 * to any department, so the screen can say the department's figure is not the whole story.
 */
export async function departmentMetrics(
  department: string | null, range: ResolvedRange,
  filters: { phase?: string | null; source?: string | null; result?: string | null } = {}, opts: { byDay?: boolean } = {},
) {
  const [cat, cells] = await Promise.all([catalogueSnapshot(), filteredCells({ ...filters, start: range.start, end: range.end })]);

  const mine = department ? cells.filter(c => c.dept === department) : cells;          // All departments: every run, attributed or not
  const ingestion = sumRows(mine.map(c => c.row));
  // Runs that recorded no department are never added to a department's own figures; they are reported beside them.
  const unattributed = department ? sumRows(cells.filter(c => c.dept === null).map(c => c.row)) : null;

  let catalogue: CatalogueRow;
  if (department) catalogue = cat.byDepartment.get(department) || zero();
  else {
    const all = zero();
    for (const c of [...cat.byDepartment.values(), cat.noDepartment]) for (const k of Object.keys(all) as (keyof CatalogueRow)[]) all[k] += c[k];
    catalogue = all;
  }
  const first = cells.reduce<Date | null>((m, c) => (c.firstAt && (!m || c.firstAt < m) ? c.firstAt : m), null);
  return {
    department,
    range: { key: range.key, label: range.label, text: range.text, fromDay: range.fromDay, toDay: range.toDay, start: range.start ? range.start.toISOString() : null, end: range.end ? range.end.toISOString() : null },
    catalogue,                                  // ignores the range and every run filter
    catalogueAsOf: new Date(cat.at).toISOString(),
    ingestion,
    unattributed,
    byDay: opts.byDay ? dayRows(mine, range) : null,
    // For lifetime: when the run log begins. The engine ran before it was kept in full, so "lifetime" here means "since the log starts".
    ingestionSince: range.start ? range.start.toISOString() : (first ? first.toISOString() : null),
  };
}

/** Every department in the taxonomy, plus any other name the catalogue holds, with its current catalogue and its recent failures. Departments with nothing stay on the list. */
export async function departmentTable() {
  const since = new Date(Date.now() - FAILURE_WINDOW_DAYS * 24 * HOUR);
  const [cat, cells] = await Promise.all([catalogueSnapshot(), filteredCells({ start: since })]);
  const failures = new Map<string | null, number>();
  for (const c of cells) failures.set(c.dept, (failures.get(c.dept) || 0) + c.row.failedRuns);
  return {
    failureWindowDays: FAILURE_WINDOW_DAYS,
    unplacedReview: cat.unplacedReview,
    departments: [...cat.byDepartment.entries()].map(([name, c]) => (
      { department: name, inTaxonomy: DEPARTMENT_NAMES.includes(name), books: c.books, articles: c.articles, journals: c.journals, needsReview: c.needsReview, recentFailures: failures.get(name) || 0 }
    )),
  };
}
