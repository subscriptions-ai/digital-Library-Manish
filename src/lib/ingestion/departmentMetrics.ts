import { canonicalOrSelf } from '../departmentRegistry.js';
import { ingestionDb as db } from './db.js';
import { DOMAINS } from '../../constants.js';
import { runConditions, eachDay, FAILED_RUN_SQL, PROVIDER_FAILURE_SQL, RUN_LEVEL, RUN_BY_DEPARTMENT, type RunFilter, type ResolvedRange } from './runFilter.js';

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
      // A spelling the registry knows is counted under the department's official name; each row has one department, so
      // nothing is counted twice. An unknown value ("Engineering") keeps its own row.
      const raw = typeof r.domain === 'string' ? r.domain.trim() : '';
      const name = raw ? canonicalOrSelf(raw) : '';
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
  const name = canonicalOrSelf(v.trim());
  return DEPARTMENT_NAMES.includes(name) || (await catalogueSnapshot()).byDepartment.has(name);
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
  /** Requests to a source that did not get an answer. Not catalogue failures; counted apart so an outage reads as one. */
  providerFailures: number;
};
const zeroIngestion = (): IngestionRow => ({ runs: 0, booksAdded: 0, articlesAdded: 0, journalsAccepted: 0, held: 0, failedRuns: 0, failedWrites: 0, sentToReview: 0, refused: 0, providerFailures: 0 });

/** One cell of the filtered run set: a department (null = none recorded, '' = unassigned / needs review) on one India day. */
type Cell = { dept: string | null; day: string; row: IngestionRow; firstAt: Date | null };

const AGGREGATES = `
            count(distinct r.id)::int runs,
            coalesce(sum(r.added) filter (where r.phase = 'Books'), 0)::int "booksAdded",
            coalesce(sum(r.added) filter (where r.phase = 'Articles'), 0)::int "articlesAdded",
            coalesce(sum(r."journalsAccepted") filter (where r.phase = 'Journals'), 0)::int "journalsAccepted",
            coalesce(sum(r."skippedHeld"), 0)::int held,
            (count(distinct r.id) filter (where ${FAILED_RUN_SQL}))::int "failedRuns",
            coalesce(sum(r."skippedFailed"), 0)::int "failedWrites",
            coalesce(sum(r."needsReview"), 0)::int "sentToReview",
            coalesce(sum(r."skippedRejected"), 0)::int refused,
            (count(distinct r.id) filter (where ${PROVIDER_FAILURE_SQL}))::int "providerFailures",
            min(r."at") first_at`;
const DAY = `to_char(r."at" + interval '330 minutes', 'YYYY-MM-DD')`;

/**
 * THE filtered run set, read once for each of the two views, from the same predicate the run list uses:
 *
 *   · `byDepartment` — per department per India day, over RUN_BY_DEPARTMENT (a run that spans departments contributes to each).
 *   · `perRun`       — per India day, over RUN_LEVEL (a run counts once). This is what "All departments" is made of, so a run that
 *                      touched many departments is never counted many times.
 *
 * The summary, the unassigned and unattributed lines, and the by-day table are all derived from these in code, never from
 * separate queries, so they cannot disagree. (`department` in the filter is ignored here: the grouping is the department.)
 */
async function filteredCells(f: RunFilter): Promise<{ byDepartment: Cell[]; perRun: Cell[] }> {
  const query = async (from: string, withDept: boolean): Promise<Cell[]> => {
    const params: any[] = []; const where = runConditions({ ...f, department: null }, params);
    const rows: any[] = await db.$queryRawUnsafe(
      `select ${withDept ? 'r.dept' : 'null::text'} dept, ${DAY} as day, ${AGGREGATES}
         from ${from} ${where.length ? `where ${where.join(' and ')}` : ''}
        group by ${withDept ? '1, 2' : '2'}`, ...params);
    return rows.map(({ dept, day, first_at, ...vals }) => ({ dept: dept ?? null, day, row: vals as IngestionRow, firstAt: first_at ?? null }));
  };
  const [byDepartment, perRun] = await Promise.all([query(RUN_BY_DEPARTMENT, true), query(RUN_LEVEL, false)]);
  return { byDepartment, perRun };
}

const sumRows = (rows: Iterable<IngestionRow>): IngestionRow => {
  const t = zeroIngestion();
  for (const r of rows) for (const k of Object.keys(t) as (keyof IngestionRow)[]) t[k] += r[k] || 0;
  return t;
};

export type DayRow = { day: string; runs: number; books: number; articles: number; journals: number; held: number; failedRuns: number; providerFailures: number; sentToReview: number };

/**
 * One row per India day, from the same cells as the totals. When the range names its days, every day in it gets a row — a day
 * with nothing is a 0, not a gap. With no range (Lifetime) only days that had activity appear, newest first.
 */
function dayRows(cells: Cell[], range: ResolvedRange): DayRow[] {
  const by = new Map<string, DayRow>();
  const blank = (day: string): DayRow => ({ day, runs: 0, books: 0, articles: 0, journals: 0, held: 0, failedRuns: 0, providerFailures: 0, sentToReview: 0 });
  for (const c of cells) {
    const d = by.get(c.day) || blank(c.day);
    d.runs += c.row.runs;
    d.books += c.row.booksAdded; d.articles += c.row.articlesAdded; d.journals += c.row.journalsAccepted;
    d.held += c.row.held; d.failedRuns += c.row.failedRuns; d.providerFailures += c.row.providerFailures; d.sentToReview += c.row.sentToReview;
    by.set(c.day, d);
  }
  if (range.fromDay && range.toDay) return eachDay(range.fromDay, range.toDay).map(day => by.get(day) || blank(day));
  return [...by.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

// ── The two answers the screen asks for ─────────────────────────────────────

/**
 * One department (or all of them) over one date range, optionally narrowed to a kind, a source or a result.
 *
 * `catalogue` ignores the range and every run filter: it is what the library holds now.
 * `ingestion` is the run log, narrowed by all of them — for a department, what was recorded for THAT department.
 * `unassigned` (department view): what the same filters match that has no confirmed department yet — books waiting for a person.
 * `unattributed` (department view): what the same filters match in runs whose department was never recorded (historical runs,
 * and anything that genuinely names none). Neither is ever added to a department's own figures.
 */
export async function departmentMetrics(
  department: string | null, range: ResolvedRange,
  filters: { phase?: string | null; source?: string | null; result?: string | null } = {}, opts: { byDay?: boolean } = {},
) {
  const [cat, { byDepartment, perRun }] = await Promise.all([catalogueSnapshot(), filteredCells({ ...filters, start: range.start, end: range.end })]);

  const mine = department ? byDepartment.filter(c => c.dept === department) : perRun;
  const ingestion = sumRows(mine.map(c => c.row));
  const unattributed = department ? sumRows(byDepartment.filter(c => c.dept === null).map(c => c.row)) : null;
  const unassigned = department ? sumRows(byDepartment.filter(c => c.dept === '').map(c => c.row)) : null;

  let catalogue: CatalogueRow;
  if (department) catalogue = cat.byDepartment.get(department) || zero();
  else {
    const all = zero();
    for (const c of [...cat.byDepartment.values(), cat.noDepartment]) for (const k of Object.keys(all) as (keyof CatalogueRow)[]) all[k] += c[k];
    catalogue = all;
  }
  const first = (department ? byDepartment : perRun).reduce<Date | null>((m, c) => (c.firstAt && (!m || c.firstAt < m) ? c.firstAt : m), null);
  return {
    department,
    range: { key: range.key, label: range.label, text: range.text, fromDay: range.fromDay, toDay: range.toDay, start: range.start ? range.start.toISOString() : null, end: range.end ? range.end.toISOString() : null },
    catalogue,                                  // ignores the range and every run filter
    catalogueAsOf: new Date(cat.at).toISOString(),
    ingestion,
    unattributed,
    unassigned,
    byDay: opts.byDay ? dayRows(mine, range) : null,
    // For lifetime: when the run log begins. The engine ran before it was kept in full, so "lifetime" here means "since the log starts".
    ingestionSince: range.start ? range.start.toISOString() : (first ? first.toISOString() : null),
  };
}

/** Every department in the taxonomy, plus any other name the catalogue holds, with its current catalogue and its recent failures. Departments with nothing stay on the list. */
export async function departmentTable() {
  const since = new Date(Date.now() - FAILURE_WINDOW_DAYS * 24 * HOUR);
  const [cat, { byDepartment }] = await Promise.all([catalogueSnapshot(), filteredCells({ start: since })]);
  const failures = new Map<string | null, number>();
  for (const c of byDepartment) failures.set(c.dept, (failures.get(c.dept) || 0) + c.row.failedRuns);
  return {
    failureWindowDays: FAILURE_WINDOW_DAYS,
    unplacedReview: cat.unplacedReview,
    departments: [...cat.byDepartment.entries()].map(([name, c]) => (
      { department: name, inTaxonomy: DEPARTMENT_NAMES.includes(name), books: c.books, articles: c.articles, journals: c.journals, needsReview: c.needsReview, recentFailures: failures.get(name) || 0 }
    )),
  };
}
