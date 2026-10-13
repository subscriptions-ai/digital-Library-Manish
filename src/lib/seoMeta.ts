import { blogCoverFor, isUsableCoverUrl } from './blogCover';
import { PUBLIC_PAGES } from './publicSeo';

/**
 * What search engines and link cards are told about a public page. One definition, used by the server (which writes it into the
 * HTML a crawler receives) and by the browser (which keeps it current as the reader navigates), so the two cannot drift apart.
 */
export const SITE_URL = 'https://journalslibrary.com';
export const SITE_NAME = 'STM Digital Library';

export const absoluteUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
/** The words of an HTML fragment, for descriptions. */
export function plainText(html: unknown): string {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m)
    .replace(/\s+/g, ' ').trim();
}

/** A search-snippet-sized piece of text, cut at a word. */
export function clip(text: string, max = 158): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '').replace(/[,.;:\s]+$/, '')}…`;
}

export type SeoPage = {
  title: string; description: string; canonical: string;
  /** Absent means "index, follow". */
  robots?: 'index, follow' | 'noindex, follow' | 'noindex, nofollow';
  image?: string; type?: 'website' | 'article';
  jsonLd?: object[];
};

const titled = (t: string) => (t.toLowerCase().includes(SITE_NAME.toLowerCase()) ? t : `${t} | ${SITE_NAME}`);

export type PostSeoInput = {
  slug: string; title: string; excerpt?: string | null; body?: string | null; coverUrl?: string | null; ogImage?: string | null;
  seoTitle?: string | null; seoDescription?: string | null; authorName?: string | null;
  publishedAt?: string | Date | null; updatedAt?: string | Date | null;
};

const iso = (d?: string | Date | null) => (d ? new Date(d).toISOString() : undefined);

/** "Search title" and "Search description" from the Studio, else the post's own title, excerpt, or opening words. */
export function postSeo(p: PostSeoInput): SeoPage {
  const canonical = `${SITE_URL}/blog/${p.slug}`;
  const image = absoluteUrl((isUsableCoverUrl(p.ogImage) && p.ogImage) || (isUsableCoverUrl(p.coverUrl) && p.coverUrl) || blogCoverFor(p.slug));
  const description = clip(plainText(p.seoDescription), 300)
    || clip(plainText(p.excerpt), 200)
    || clip(plainText(p.body), 158)
    || `A post from ${SITE_NAME}.`;
  const headline = (p.seoTitle || '').trim() || p.title;
  return {
    title: titled(headline), description, canonical, image, type: 'article',
    jsonLd: [
      {
        '@context': 'https://schema.org', '@type': 'BlogPosting',
        headline: p.title, description, image: [image],
        datePublished: iso(p.publishedAt), dateModified: iso(p.updatedAt) || iso(p.publishedAt),
        // Only a named author is a Person; a post without one is the site's own.
        author: p.authorName ? { '@type': 'Person', name: p.authorName } : { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      },
      breadcrumbLd([['Home', `${SITE_URL}/`], ['Blog', `${SITE_URL}/blog`], [p.title, canonical]]),
    ],
  };
}

export function breadcrumbLd(trail: [string, string][]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

export const BLOG_DESCRIPTION = 'Writing from STM Digital Library: what open-access research makes possible, how to get more from the library, and what has changed in the collection.';

/**
 * The blog list. Page 1 is /blog; later pages are their own crawlable URLs. A filtered or searched list is a view of the same posts,
 * not a page of its own: it points back to /blog, and a search is kept out of the index.
 */
export function blogListSeo(o: { page?: number; category?: string; q?: string }): SeoPage {
  const page = o.page && o.page > 1 ? Math.floor(o.page) : 1;
  const filtered = !!(o.category || o.q);
  const canonical = filtered || page === 1 ? `${SITE_URL}/blog` : `${SITE_URL}/blog?page=${page}`;
  return {
    title: page > 1 && !filtered ? `Blog, page ${page} | ${SITE_NAME}` : `Blog | ${SITE_NAME}`,
    description: BLOG_DESCRIPTION, canonical,
    robots: o.q ? 'noindex, follow' : undefined,
    jsonLd: [breadcrumbLd([['Home', `${SITE_URL}/`], ['Blog', `${SITE_URL}/blog`]])],
  };
}

type DomainLike = { id: string; name: string; description: string };
export function departmentSeo(d: DomainLike): SeoPage {
  const canonical = `${SITE_URL}/domain/${d.id}`;
  const first = plainText(d.description).split(/(?<=\.)\s/)[0] || '';
  return {
    title: `${d.name} Research Collection | ${SITE_NAME}`,
    description: clip(`Explore academic journals, articles and books in ${d.name} on ${SITE_NAME}. ${first}`),
    canonical,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${d.name} Digital Library Collection`, description: clip(plainText(d.description), 300), url: canonical,
        publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL } },
      breadcrumbLd([['Home', `${SITE_URL}/`], ['Digital Library', `${SITE_URL}/digital-library`], [d.name, canonical]]),
    ],
  };
}

/** The marketing pages (PUBLIC_PAGES). `path` has no trailing slash and no query string, so a filtered URL points at the plain page. */
export function staticPageSeo(path: string): SeoPage | null {
  const page = PUBLIC_PAGES[path];
  if (!page) return null;
  return { title: `${page[0]} | ${SITE_NAME}`, description: page[1], canonical: path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}` };
}
