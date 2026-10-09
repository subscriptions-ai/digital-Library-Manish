import type { PrismaClient } from '@prisma/client';

export type CatalogueSearchParams = {
  q: string;
  domain?: string;
  contentType?: string;
  page?: number;
  limit?: number;
};

/**
 * The catalogue search every public surface reads — the search page and the
 * AI assistant. One implementation, so the assistant can never disagree
 * with the results a visitor sees on /search.
 */
export async function searchContent(prisma: PrismaClient, params: CatalogueSearchParams) {
  const q = params.q.trim();
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const page = Math.max(1, Number(params.page) || 1);

  if (q.length < 2) {
    return { data: [], total: 0, query: params.q, page, limit };
  }

  const where: any = {
    status: 'Published',
    OR: [
      { title:       { contains: q, mode: 'insensitive' } },
      { authors:     { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { domain:      { contains: q, mode: 'insensitive' } },
      { contentType: { contains: q, mode: 'insensitive' } },
      { subjectArea: { contains: q, mode: 'insensitive' } },
    ],
  };
  if (params.domain)      where.domain      = params.domain;
  if (params.contentType) where.contentType = params.contentType;

  const [data, total] = await Promise.all([
    prisma.content.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true, title: true, authors: true, domain: true,
        contentType: true, description: true, subjectArea: true,
        thumbnailUrl: true, accessType: true, price: true,
        publishedAt: true,
      },
    }),
    prisma.content.count({ where }),
  ]);

  return { data, total, query: params.q, page, limit };
}
