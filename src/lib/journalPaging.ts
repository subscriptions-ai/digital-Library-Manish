import { publicJournalStatusSql } from './publicJournals';

/**
 * Paging for the public journal lists (a department's shelf, a publisher's, a subject's).
 *
 * Why: once every Accepted and MetadataOnly journal is public (publicJournals.ts) the largest department holds 4,551 titles, and a
 * list that answers with all of them is a megabyte of JSON for a screen that shows a hundred. The server now answers one page, and
 * says how many there are in total, so the client asks for the next page only when the reader does.
 *
 *   ?page=1        1-based; anything else is page 1
 *   ?limit=100     the default; capped at JOURNAL_PAGE_MAX
 *   ?q=text        case-insensitive, in the title, the publisher, the ISSN or the e-ISSN; LITERAL (a % or _ is just a character)
 *   ?sort=articles the default: journals holding the most published articles first. ?sort=title is A to Z.
 *
 * Order is total: every sort ends on the journal's id, so two journals with the same title, or the same number of articles, always
 * sit in the same place and a page boundary can never repeat a journal or skip one.
 */
export const JOURNAL_PAGE_DEFAULT = 100;
export const JOURNAL_PAGE_MAX = 200;
export const JOURNAL_SEARCH_MAX = 100;

export type JournalSort = 'articles' | 'title';
export type JournalPaging = { page: number; limit: number; offset: number; q: string; sort: JournalSort };

const int = (v: unknown) => { const n = Number.parseInt(String(Array.isArray(v) ? v[0] : v ?? ''), 10); return Number.isFinite(n) ? n : NaN; };

export function parseJournalPaging(query: Record<string, any> = {}, defaults: { limit?: number } = {}): JournalPaging {
  const asked = int(query.limit);
  const fallback = Math.min(JOURNAL_PAGE_MAX, Math.max(1, defaults.limit ?? JOURNAL_PAGE_DEFAULT));
  const limit = Number.isNaN(asked) || asked < 1 ? fallback : Math.min(asked, JOURNAL_PAGE_MAX);
  const p = int(query.page);
  const page = Number.isNaN(p) || p < 1 ? 1 : Math.min(p, 1_000_000);
  const raw = Array.isArray(query.q) ? query.q[0] : query.q;
  const q = typeof raw === 'string' ? raw.trim().slice(0, JOURNAL_SEARCH_MAX) : '';
  const sort: JournalSort = query.sort === 'title' ? 'title' : 'articles';
  return { page, limit, offset: (page - 1) * limit, q, sort };
}

/** `order by` for the list query. Ends on j.id so the order is total. */
export const journalOrderSql = (sort: JournalSort) =>
  sort === 'title' ? `order by j.title asc, j.id asc` : `order by "articleCount" desc, j.title asc, j.id asc`;

/**
 * The search test, for the parameter `$n`. strpos on lower() rather than ILIKE, so a % or _ typed by the reader is a character and
 * not a wildcard (and nothing needs escaping).
 */
export const journalSearchSql = (n: number) =>
  `(strpos(lower(j.title), lower($${n})) > 0 or strpos(lower(coalesce(j."publisherName", '')), lower($${n})) > 0
    or strpos(lower(coalesce(j.issn, '')), lower($${n})) > 0 or strpos(lower(coalesce(j.eissn, '')), lower($${n})) > 0)`;

export type JournalPage = {
  /** Public titles in this scope, whatever was searched. This is the figure the page's header shows. */
  journalTotal: number;
  /** Titles that match the search (equal to journalTotal when nothing was searched). */
  total: number;
  page: number; limit: number; pages: number; hasMore: boolean; sort: JournalSort; q: string;
};

export const pageMeta = (journalTotal: number, total: number, p: JournalPaging): JournalPage => {
  const pages = Math.max(1, Math.ceil(total / p.limit));
  return { journalTotal, total, page: p.page, limit: p.limit, pages, hasMore: p.page * p.limit < total, sort: p.sort, q: p.q };
};

/** The columns every public journal row carries, with holdings counted from the articles themselves (not the lagging Journal.articleCount). */
export const JOURNAL_ROW_SQL = `
  j.id, j.title, j.issn, j.domain, j."publisherName", j.licence, j."licenceIsNC",
  count(a.id)::int as "articleCount",
  count(distinct nullif(a."volume",''))::int as "volumeCount",
  count(distinct nullif(a."volume",'') || '|' || coalesce(nullif(a."issue",''),''))::int as "issueCount",
  min(a."year")::int as "firstYear",
  max(a."year")::int as "lastYear"`;

/**
 * One page of public journals plus the counts around it.
 *
 * `where` is the scope (it always includes the public-status test); its `$1..$k` are `params`. The search and the page are appended
 * here, so every list answers the same way.
 */
export async function queryJournalPage(
  db: any, where: string, params: any[], paging: JournalPaging,
): Promise<{ rows: any[]; meta: JournalPage }> {
  const k = params.length;
  const searched = paging.q ? ` and ${journalSearchSql(k + 1)}` : '';
  const searchParams = paging.q ? [paging.q] : [];
  const [rows, counted, all] = await Promise.all([
    db.$queryRawUnsafe(
      `select ${JOURNAL_ROW_SQL}
         from "Journal" j
         left join "Article" a on a."journalId" = j.id and a.status = 'Published'
        where ${where}${searched}
        group by j.id
        ${journalOrderSql(paging.sort)}
        limit $${k + searchParams.length + 1} offset $${k + searchParams.length + 2}`,
      ...params, ...searchParams, paging.limit, paging.offset) as Promise<any[]>,
    db.$queryRawUnsafe(`select count(*)::int as n from "Journal" j where ${where}${searched}`, ...params, ...searchParams) as Promise<any[]>,
    paging.q ? db.$queryRawUnsafe(`select count(*)::int as n from "Journal" j where ${where}`, ...params) as Promise<any[]> : Promise.resolve(null),
  ]);
  const total = Number(counted?.[0]?.n || 0);
  const journalTotal = all ? Number(all?.[0]?.n || 0) : total;
  return { rows, meta: pageMeta(journalTotal, total, paging) };
}

/** `publicJournalStatusSql('j') and <extra>`. */
export const publicScope = (extra = '') => `${publicJournalStatusSql('j')}${extra ? ` and ${extra}` : ''}`;

/**
 * SQL: a journal is filed under the subject whose SLUG is `$n`. The same fold as the app's departmentSlug (lower-case, every run of
 * characters outside a-z and 0-9 becomes one hyphen, hyphens trimmed from the ends), applied to each name in the journal's subjects.
 */
export const subjectSlugSql = (n: number) =>
  `exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(j.subjects) = 'array' then j.subjects else '[]'::jsonb end) as s(v)
            where trim(both '-' from regexp_replace(lower(s.v), '[^a-z0-9]+', '-', 'g')) = $${n})`;
