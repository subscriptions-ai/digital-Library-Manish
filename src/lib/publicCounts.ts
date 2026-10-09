import type { PrismaClient } from '@prisma/client';

/**
 * Counts by content kind, for the library's headline row and the AI
 * assistant. Journals and Articles are their own kinds because they are
 * what a college asks for; the legacy "Periodicals" bucket folds into
 * Articles — it named a storage category, not anything a librarian
 * recognises. Journals are counted as distinct titles, never added to
 * the article count: one title holds many articles, and adding both
 * would count every article twice.
 */
export async function contentTypeCounts(prisma: PrismaClient): Promise<Record<string, number>> {
  const [legacy, articles, newBooks, journalRows] = await Promise.all([
    prisma.content.groupBy({
      by: ['contentType'],
      where: { status: { not: 'Draft' } },
      _count: { id: true },
    }),
    (prisma as any).article.count({ where: { status: 'Published' } }),
    (prisma as any).book.count({ where: { status: 'Published' } }),
    (prisma as any).$queryRawUnsafe(
      `select count(distinct "journalId")::int as n from "Article"
       where status = 'Published' and "journalId" is not null`),
  ]);

  const countsMap: Record<string, number> = {};
  for (const g of legacy as any[]) {
    if (g.contentType) countsMap[g.contentType] = g._count.id;
  }

  countsMap['Journals'] = Number(journalRows?.[0]?.n || 0);
  countsMap['Articles'] = articles + (countsMap['Periodicals'] || 0);
  countsMap['Books'] = (countsMap['Books'] || 0) + newBooks;
  delete countsMap['Periodicals'];

  return countsMap;
}
