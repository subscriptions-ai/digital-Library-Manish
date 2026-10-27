import { canonicalOrSelf } from '../departmentRegistry.js';
import { SELF_PUBLISHING_SOURCES } from './localWork.js';
import { PUBLISHED_ACTION } from './publicationEvents.js';
import type { DailyWindow, DepartmentRow } from './dailySummary.js';

/**
 * PUBLISHED IN A CYCLE — records that actually BECAME PUBLIC between (D−1) 5:01 PM and D 5:00 PM IST. Read-only.
 *
 * "Added" (dailySummary.ts) asks when a record was CREATED. This asks when it was MADE PUBLIC, so a Draft created last week and approved
 * today appears here today and nowhere else, and a record created today that is still a Draft appears in neither. The two are kept apart.
 *
 * THE PUBLICATION TIME of a public record (Book / Article `Published`, Journal `Accepted`) is the first of these that exists:
 *
 *   1. A publication event — the `CONTENT_PUBLISHED` audit row a manual Approve (single or bulk) writes when the record moves into public status.
 *        method 'manual'.             Exact. Written once; approving an already-public record writes nothing.
 *   2. Review Automation's own stamp — `metadata.reviewPublication.performedAt`, written on the Book in the same statement that publishes it.
 *        method 'review-automation'.  Exact. Present for every Book Review Automation ever published, so history before this feature is covered.
 *   3. Created public by ingestion — the engine writes the row with its public status already set, so the publication time is `createdAt`.
 *        method 'ingestion'.          Exact. Only for records that were never held: an Article or Journal the engine created (public at birth), or a Book from a
 *                                     self-publishing source whose classification was strong and had no year-policy hold. A Book that WAS held (review-first source,
 *                                     weak classification, year hold) and is public now with neither of the above was approved by hand before events existed.
 *   4. Otherwise the time is NOT RECORDED. Such a record is counted nowhere by cycle (guessing `createdAt` or `updatedAt` would put it in the wrong report);
 *        it is reported as one separate number so nothing is hidden.
 *
 * If a record has more than one of (1) and (2), the LATEST is its publication time — the one that put it where it is today. Each record has exactly one
 * publication time, so it is counted once however often it is edited, re-saved or re-processed afterwards (none of those move any of the three sources).
 * A record that is not public now is not "published" in any report, the same rule "added" follows; the department is the record's department now.
 *
 * Totals, the department table and the clicked record lists are all read from this one definition (`relation`).
 */

export type PubType = 'journal' | 'article' | 'book';
const TYPES: PubType[] = ['journal', 'article', 'book'];
const PLURAL: Record<PubType, 'journals' | 'articles' | 'books'> = { journal: 'journals', article: 'articles', book: 'books' };
export const METHODS = ['ingestion', 'manual', 'review-automation'] as const;
export type PubMethod = typeof METHODS[number];
export const METHOD_LABEL: Record<PubMethod, string> = { ingestion: 'Ingestion', manual: 'Manual approval', 'review-automation': 'Review Automation' };
const UNASSIGNED = '(unassigned)';

const TABLE: Record<PubType, { table: string; public: string }> = {
  journal: { table: 'Journal', public: `t.status = 'Accepted'` },
  article: { table: 'Article', public: `t.status = 'Published'` },
  book: { table: 'Book', public: `t.status = 'Published'` },
};

/** `createdAt`-style columns are UTC wall-clock `timestamp(3)`; an instant is sent as ISO text with its Z and converted explicitly (as dailySummary does). */
const utc = (n: number) => `((($${n})::text)::timestamptz at time zone 'UTC')`;

/** A Book created public by ingestion, never held. SELF_PUBLISHING_SOURCES are the sources whose strong, in-policy books the harvest publishes by itself. */
const BOOK_LEGACY_INGESTION = (selfParam: string) => `t."ownershipSource" = 'Ingested' and t.source = any(${selfParam}::text[])
  and coalesce(t.metadata->'harvest'->'department'->>'band', 'strong') = 'strong' and not (coalesce(t.metadata->'harvest', '{}'::jsonb) ? 'yearPolicy')`;
const LEGACY: Record<PubType, (selfParam: string) => string> = {
  journal: () => 'true',
  article: () => `t."ownershipSource" = 'Ingested'`,
  book: BOOK_LEGACY_INGESTION,
};

/** The latest publication event per record, one row each. */
const EVENTS = (type: PubType) => `(select meta->>'id' id, max(at) as ts, (array_agg(coalesce(meta->>'method', 'manual') order by at desc))[1] as method
  from "IngestionAudit" where action = '${PUBLISHED_ACTION}' and meta->>'type' = '${type}' group by 1)`;

/** Review Automation's stamp, as a UTC wall-clock timestamp; null when absent or not a timestamp. Books only. */
const RA_AT = `case when t.metadata->'reviewPublication'->>'performedAt' ~ '^\\d{4}-\\d{2}-\\d{2}T[\\d:.]+(Z|[+-]\\d{2}:?\\d{2})$'
  then ((t.metadata->'reviewPublication'->>'performedAt')::timestamptz at time zone 'UTC') end`;

/**
 * One row per PUBLIC record of the type: `pid`, `pub_at` (null = not recorded), `pub_method`. Parameter positions are the caller's:
 * `self` is the $n holding the self-publishing sources.
 */
function relation(type: PubType, self: string): string {
  const T = TABLE[type];
  const ra = type === 'book' ? RA_AT : 'null::timestamp';
  const owner = type === 'journal' ? `'Ingested'::text` : `t."ownershipSource"`;
  return `(select t.id as pid,
      case when ev.ts is not null and (ra.ts is null or ev.ts >= ra.ts) then ev.ts when ra.ts is not null then ra.ts when ${LEGACY[type](self)} then t."createdAt" end as pub_at,
      case when ev.ts is not null and (ra.ts is null or ev.ts >= ra.ts) then ev.method when ra.ts is not null then 'review-automation' when ${LEGACY[type](self)} then 'ingestion' end as pub_method,
      ${owner} as ownership
    from "${T.table}" t left join ${EVENTS(type)} ev on ev.id = t.id
    cross join lateral (select ${ra} as ts) ra
    where ${T.public}) pe`;
}

const selfSources = () => [...SELF_PUBLISHING_SOURCES];
const reportedAs = (domain: string | null): string => { const raw = (domain ?? '').trim(); return raw ? canonicalOrSelf(raw) : UNASSIGNED; };

// ── The numbers ─────────────────────────────────────────────────────────────

export type PubGroup = { domain: string | null; method: PubMethod; n: number };
export type PubGroups = Record<PubType, PubGroup[]>;
export type PublishedSummary = {
  total: number; journals: number; articles: number; books: number; departmentsWithActivity: number;
  departments: DepartmentRow[];
  byMethod: Record<PubMethod, number>;
  /** Public records whose publication time was never recorded (approved by hand before events existed). In no report; shown so nothing is hidden. */
  notRecorded: number;
};

const windowParams = (w: DailyWindow) => [w.start.toISOString(), w.end.toISOString()];

export async function publishedGroups(q: any, w: DailyWindow): Promise<PubGroups> {
  const out = { journal: [], article: [], book: [] } as PubGroups;
  for (const t of TYPES) {
    out[t] = await q.$queryRawUnsafe(
      `select b.domain, pe.pub_method method, count(*)::int n from ${relation(t, '$3')} join "${TABLE[t].table}" b on b.id = pe.pid
        where pe.pub_at >= ${utc(1)} and pe.pub_at < ${utc(2)} group by 1, 2`, ...windowParams(w), selfSources());
  }
  return out;
}

/** Public ingested records with no recoverable publication time. */
export async function notRecordedCount(q: any): Promise<number> {
  let n = 0;
  for (const t of TYPES) {
    const [r] = await q.$queryRawUnsafe(`select count(*)::int n from ${relation(t, '$1')} where pe.pub_at is null and pe.ownership = 'Ingested'`, selfSources());
    n += r?.n ?? 0;
  }
  return n;
}

export function foldPublished(g: PubGroups, notRecorded = 0): PublishedSummary {
  const byName = new Map<string, DepartmentRow>();
  const totals = { journals: 0, articles: 0, books: 0 };
  const byMethod: Record<PubMethod, number> = { ingestion: 0, manual: 0, 'review-automation': 0 };
  for (const t of TYPES) {
    const k = PLURAL[t];
    for (const r of g[t]) {
      if (!r.n) continue;
      const name = reportedAs(r.domain);
      const row = byName.get(name) ?? { department: name, journals: 0, articles: 0, books: 0, total: 0 };
      row[k] += r.n; row.total += r.n; totals[k] += r.n; byMethod[(METHODS as readonly string[]).includes(r.method) ? r.method : 'manual'] += r.n;
      byName.set(name, row);
    }
  }
  const rows = [...byName.values()].sort((a, b) => b.total - a.total || (a.department === UNASSIGNED ? 1 : b.department === UNASSIGNED ? -1 : a.department.localeCompare(b.department)));
  return {
    total: totals.journals + totals.articles + totals.books, ...totals,
    departmentsWithActivity: rows.filter(r => r.department !== UNASSIGNED).length, departments: rows, byMethod, notRecorded,
  };
}

// ── The records behind a number ─────────────────────────────────────────────

export type PublishedRow = {
  id: string; type: PubType; title: string; authors: string | null; publisher: string | null; doi: string | null; issn: string | null; eissn: string | null; isbn: string | null;
  journal: string | null; provider: string | null; department: string; access: string | null;
  publishedAt: string; method: PubMethod; methodLabel: string;
};
export type PublishedPage = { total: number; page: number; pageSize: number; rows: PublishedRow[] };

const SELECT: Record<PubType, string> = {
  article: `b.id, 'article' kind, b.title, b.authors, b."publisherName" publisher, b.doi, null::text issn, null::text eissn, null::text isbn, b."journalName" journal, b.source provider, b.domain, b."accessStatus" access`,
  journal: `b.id, 'journal' kind, b.title, null::text authors, b."publisherName" publisher, null::text doi, b.issn, b.eissn, null::text isbn, null::text journal, b."rightsBasis" provider, b.domain, b.licence access`,
  book: `b.id, 'book' kind, b.title, b.authors, b."publisherName" publisher, b.doi, null::text issn, null::text eissn, b.isbn, null::text journal, b.source provider, b.domain, coalesce(b."accessStatus", b."rightsStatus") access`,
};

export async function publishedContent(
  db: any, w: DailyWindow, q: { department?: string | null; type?: PubType | 'all'; page?: number; pageSize?: number }, maxPage: number,
): Promise<PublishedPage & { department: string | null; type: PubType | 'all' }> {
  const type = q.type && q.type !== 'all' ? q.type : 'all';
  const pageSize = Math.min(maxPage, Math.max(1, Math.floor(q.pageSize || 50)));
  const page = Math.max(1, Math.floor(q.page || 1));
  const department = q.department ? q.department : null;
  const params: any[] = [...windowParams(w), selfSources()];

  let deptSql = '';
  if (department === UNASSIGNED) deptSql = ` and (b.domain is null or btrim(b.domain) = '')`;
  else if (department) {
    const groups = await publishedGroups(db, w);
    const spellings = new Set<string>();
    for (const t of TYPES) for (const r of groups[t]) if (r.domain != null && reportedAs(r.domain) === canonicalOrSelf(department.trim())) spellings.add(r.domain);
    if (!spellings.size) return { department, type, total: 0, page, pageSize, rows: [] };
    params.push([...spellings]); deptSql = ` and b.domain = any($${params.length}::text[])`;
  }
  const kinds: PubType[] = type === 'all' ? TYPES : [type];
  const union = kinds.map(t => `select ${SELECT[t]}, pe.pub_at, pe.pub_method from ${relation(t, '$3')} join "${TABLE[t].table}" b on b.id = pe.pid
      where pe.pub_at >= ${utc(1)} and pe.pub_at < ${utc(2)}${deptSql}`).join(' union all ');
  const [{ n: total }] = await db.$queryRawUnsafe(`select count(*)::int n from (${union}) u`, ...params);
  const rows: any[] = await db.$queryRawUnsafe(`select * from (${union}) u order by pub_at desc, id desc limit ${pageSize} offset ${(page - 1) * pageSize}`, ...params);
  return {
    department, type, total, page, pageSize,
    rows: rows.map((r): PublishedRow => {
      const method = ((METHODS as readonly string[]).includes(r.pub_method) ? r.pub_method : 'manual') as PubMethod;
      return {
        id: r.id, type: r.kind, title: r.title, authors: r.authors, publisher: r.publisher, doi: r.doi, issn: r.issn, eissn: r.eissn, isbn: r.isbn, journal: r.journal,
        provider: r.provider, department: reportedAs(r.domain), access: r.access,
        // A UTC wall-clock timestamp from the database, made an instant.
        publishedAt: new Date(r.pub_at).toISOString(), method, methodLabel: METHOD_LABEL[method],
      };
    }),
  };
}
