import type { PrismaClient } from '@prisma/client';

/**
 * What counts as a journal the public catalogue offers. One definition, used by every figure and list that says "journals" to a visitor
 * or a member (the Digital Library headline, department pages, the journal filter, subjects, the AI assistant).
 *
 * A journal is PUBLIC when its status is one the catalogue offers: Accepted (full text may be served) or MetadataOnly (a catalogue entry
 * and a link to the publisher). NeedsReview (a candidate waiting for a person to decide), Rejected and Draft are never shown; any status
 * not named here is not shown either, so a new one cannot leak in by default.
 *
 * Holding a published article is NOT part of the rule. It used to be (a journal with nothing to open was left off, which hid 11,741 of
 * 24,206 valid titles on production, 2026-10-27), but a catalogue entry is useful for what it says about the journal: its ISSN, publisher,
 * subject and licence. A journal with no article shows "No published articles available yet". Which ARTICLES a reader may open is a
 * separate question, answered by the article and access rules, and nothing here changes it.
 *
 * A department is NOT required either: a journal with no department is still a journal we hold (it is simply not on any department's shelf).
 * Duplicates: a journal's identity is its row (ISSN is unique), so a title is counted once however many articles it holds.
 *
 * The admin figure "journal records in database" is a different thing on purpose: every row, whatever its status, for operations.
 * Anything here counts the CURRENT catalogue. Cumulative ingestion counters are never a source for it.
 */
export const PUBLIC_JOURNAL_STATUSES = ['Accepted', 'MetadataOnly'] as const;

/** SQL: the status test, for a journal aliased `alias`. */
export const publicJournalStatusSql = (alias = 'j') => `${alias}.status in ('Accepted', 'MetadataOnly')`;

/** Prisma: the same test, for `prisma.journal.findMany({ where })`. */
export const publicJournalStatusWhere = { status: { in: [...PUBLIC_JOURNAL_STATUSES] } };

export { NO_PUBLISHED_ARTICLES } from './journalCopy';

/**
 * How many journal titles the public catalogue offers; with `domains`, how many of them are filed under one of those department
 * spellings (the journal's own department, so a member sees the titles on the shelves their plan covers).
 */
export async function publicJournalCount(db: PrismaClient | any, o: { domains?: string[] } = {}): Promise<number> {
  const scoped = !!o.domains?.length;
  const rows = await db.$queryRawUnsafe(
    `select count(*)::int as n
       from "Journal" j
      where ${publicJournalStatusSql('j')}
        ${scoped ? 'and j.domain = any($1)' : ''}`,
    ...(scoped ? [o.domains] : []));
  return Number(rows?.[0]?.n || 0);
}
