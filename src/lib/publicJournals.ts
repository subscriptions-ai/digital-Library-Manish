import type { PrismaClient } from '@prisma/client';

/**
 * What counts as a journal the public catalogue offers. One definition, used by every figure and list that says "journals" to a visitor
 * or a member (the Digital Library headline, department pages, the journal filter, subjects, the AI assistant).
 *
 * A journal is PUBLIC when BOTH are true:
 *   1. its status is one the catalogue offers: Accepted (full text may be served) or MetadataOnly (a catalogue entry and a link to the
 *      publisher). NeedsReview (a candidate waiting for a person to decide) and Rejected are never shown; any status not named here is
 *      not shown either, so a new one cannot leak in by default;
 *   2. it holds at least one PUBLISHED article. A journal with nothing to open is not an entry a reader can use, and counting it would
 *      advertise empty shelves. This is read from the articles themselves, never from `Journal.articleCount`, which is a denormalised
 *      counter that lags the real rows.
 *
 * A department is NOT required: a journal with no department is still a journal we hold (it is simply not on any department's shelf).
 * Duplicates: a journal's identity is its row (ISSN is unique), and a journal with many articles is one title however many it holds.
 *
 * The admin figure "journal records in database" is a different thing on purpose: every row, whatever its status, for operations.
 * Anything here counts the CURRENT catalogue. Cumulative ingestion counters are never a source for it.
 */
export const PUBLIC_JOURNAL_STATUSES = ['Accepted', 'MetadataOnly'] as const;

/** SQL: the status test, for a journal aliased `alias`. */
export const publicJournalStatusSql = (alias = 'j') => `${alias}.status in ('Accepted', 'MetadataOnly')`;

/** Prisma: the same test, for `prisma.journal.findMany({ where })`. */
export const publicJournalStatusWhere = { status: { in: [...PUBLIC_JOURNAL_STATUSES] } };

/**
 * How many journal titles the public catalogue offers; with `articleDomains`, how many of them hold a published article filed under one of those
 * department spellings (what a member entitled to those departments can open).
 */
export async function publicJournalCount(db: PrismaClient | any, o: { articleDomains?: string[] } = {}): Promise<number> {
  const scoped = !!o.articleDomains?.length;
  const rows = await db.$queryRawUnsafe(
    `select count(distinct a."journalId")::int as n
       from "Article" a
       join "Journal" j on j.id = a."journalId"
      where a.status = 'Published' and ${publicJournalStatusSql('j')}
        ${scoped ? 'and a.domain = any($1)' : ''}`,
    ...(scoped ? [o.articleDomains] : []));
  return Number(rows?.[0]?.n || 0);
}
