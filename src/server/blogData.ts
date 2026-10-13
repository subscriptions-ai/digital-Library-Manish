import type { PrismaClient } from '@prisma/client';

/** The public reads of the blog, shared by the JSON API and by the server-rendered pages, so both show the same posts. */
export const BLOG_PAGE_SIZE = 9;

export async function loadBlogList(prisma: PrismaClient, o: { page: number; limit: number; category?: string | null; q?: string }) {
  const where: any = {
    status: 'Published',
    ...(o.category ? { category: o.category } : {}),
    ...(o.q ? { OR: [
      { title: { contains: o.q, mode: 'insensitive' } },
      { excerpt: { contains: o.q, mode: 'insensitive' } },
    ] } : {}),
  };
  const db = prisma as any;
  const [posts, total, cats] = await Promise.all([
    db.blogPost.findMany({
      where, orderBy: { publishedAt: 'desc' }, skip: (o.page - 1) * o.limit, take: o.limit,
      select: { slug: true, title: true, excerpt: true, coverUrl: true, category: true, authorName: true, publishedAt: true, readMinutes: true },
    }),
    db.blogPost.count({ where }),
    db.blogPost.groupBy({ by: ['category'], where: { status: 'Published' }, _count: { _all: true } }),
  ]);
  return {
    posts, total, page: o.page, limit: o.limit,
    categories: cats.filter((c: any) => c.category).map((c: any) => ({ name: c.category, posts: c._count._all })),
  };
}

/** One Published post with what sits beside it, or null: a draft, a taken-down post and a wrong address are all the same "no". */
export async function loadBlogPost(prisma: PrismaClient, slug: string, o: { countView: boolean }) {
  const db = prisma as any;
  const post = await db.blogPost.findFirst({ where: { slug, status: 'Published' } });
  if (!post) return null;
  // Counting a view must not look like an edit: updatedAt feeds dateModified and the sitemap's lastmod, so it is held where it was.
  if (o.countView) db.blogPost.update({ where: { id: post.id }, data: { views: { increment: 1 }, updatedAt: post.updatedAt } }).catch(() => {});

  // What the library actually holds on the subject this post is about. A post that sends nobody into the library is a post that did half its job.
  const domains: string[] = Array.isArray(post.domains) ? post.domains as string[] : [];
  const [related, fromLibrary] = await Promise.all([
    db.blogPost.findMany({
      where: { status: 'Published', id: { not: post.id }, ...(post.category ? { category: post.category } : {}) },
      orderBy: { publishedAt: 'desc' }, take: 3,
      select: { slug: true, title: true, excerpt: true, coverUrl: true, publishedAt: true, readMinutes: true },
    }),
    domains.length
      ? db.article.findMany({
          where: { status: 'Published', domain: { in: domains } },
          orderBy: { originalDate: 'desc' }, take: 5,
          select: { id: true, title: true, journalName: true, domain: true, year: true },
        })
      : Promise.resolve([]),
  ]);
  return { post, related, fromLibrary };
}
