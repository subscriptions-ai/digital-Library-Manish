import { canonicalOrSelf } from '../lib/departmentRegistry.js';
import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { DOMAINS } from '../constants.js';
import { blogCoverFor, isUsableCoverUrl } from '../lib/blogCover.js';
import {
  SITE_NAME, SITE_URL, absoluteUrl, blogListSeo, breadcrumbLd, clip, departmentSeo, plainText, postSeo, staticPageSeo, type SeoPage,
} from '../lib/seoMeta.js';
import { BLOG_PAGE_SIZE, loadBlogList, loadBlogPost } from './blogData.js';

/**
 * The public pages a search engine should be able to read from the first response, without running the site's JavaScript.
 *
 * The site is a React single-page app: every address used to answer with the same empty shell, a bare title and a 200, and the blog's
 * words only existed after the script ran and called the API. Here the server writes each public page's real metadata into that shell and,
 * for the blog and the department pages, the page's own content as ordinary HTML. The reader gets the same page as the crawler: the
 * browser then takes over and renders the same content (from the data embedded beside it, so it does not flash or fetch again).
 * There is no crawler detection anywhere in this file.
 *
 * Only Published posts exist here. A draft, a taken-down post and a wrong address are all a real 404.
 */

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for an inline script: nothing in it may close the tag or break the line. */
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');
const day = (iso?: string | Date | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const isoDay = (iso?: string | Date | null) => (iso ? new Date(iso).toISOString() : '');

/** Tags carry data-rh so the browser's own metadata manager replaces them instead of adding a second copy beside them. */
export function headTags(seo: SeoPage): string {
  const rh = ' data-rh="true"';
  const out = [
    `<meta name="description" content="${esc(seo.description)}"${rh}>`,
    `<meta name="robots" content="${seo.robots ?? 'index, follow'}"${rh}>`,
    `<link rel="canonical" href="${esc(seo.canonical)}"${rh}>`,
    `<meta property="og:site_name" content="${SITE_NAME}"${rh}>`,
    `<meta property="og:type" content="${seo.type ?? 'website'}"${rh}>`,
    `<meta property="og:title" content="${esc(seo.title)}"${rh}>`,
    `<meta property="og:description" content="${esc(seo.description)}"${rh}>`,
    `<meta property="og:url" content="${esc(seo.canonical)}"${rh}>`,
  ];
  if (seo.image) out.push(`<meta property="og:image" content="${esc(seo.image)}"${rh}>`, `<meta name="twitter:card" content="summary_large_image"${rh}>`, `<meta name="twitter:image" content="${esc(seo.image)}"${rh}>`);
  else out.push(`<meta name="twitter:card" content="summary"${rh}>`);
  out.push(`<meta name="twitter:title" content="${esc(seo.title)}"${rh}>`, `<meta name="twitter:description" content="${esc(seo.description)}"${rh}>`);
  for (const ld of seo.jsonLd ?? []) out.push(`<script type="application/ld+json"${rh}>${safeJson(ld)}</script>`);
  return out.join('\n    ');
}

export function injectPage(template: string, seo: SeoPage, body = '', data?: unknown): string {
  let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(seo.title)}</title>`);
  html = html.replace('</head>', () => `    ${headTags(seo)}\n  </head>`);
  const seed = data === undefined ? '' : `<script id="seo-data" type="application/json">${safeJson(data)}</script>`;
  return html.replace('<div id="root"></div>', () => `<div id="root">${body}</div>${seed}`);
}

// ── Page bodies: the same content the React pages render, as plain HTML ─────────────────

const LABEL = 'text-xs font-semibold uppercase tracking-[0.14em] text-muted';
const crumbs = (trail: [string, string | null][]) =>
  `<nav aria-label="Breadcrumb" class="text-sm text-muted"><ol class="flex flex-wrap items-center gap-x-2 gap-y-1">${trail.map(([name, href], i) =>
    `<li>${i ? '<span aria-hidden="true">›</span> ' : ''}${href ? `<a href="${esc(href)}" class="font-semibold text-accent hover:underline">${esc(name)}</a>` : `<span aria-current="page">${esc(name)}</span>`}</li>`).join('')}</ol></nav>`;
const coverOf = (p: { coverUrl?: string | null; slug: string }) => (isUsableCoverUrl(p.coverUrl) ? p.coverUrl.trim() : blogCoverFor(p.slug));

function postBody(found: { post: any; related: any[]; fromLibrary: any[] }) {
  const { post: p, related, fromLibrary } = found;
  const cover = coverOf(p);
  return `<div class="bg-ground"><article class="container-public max-w-3xl py-12">
${crumbs([['Home', '/'], ['Blog', '/blog'], [p.title, null]])}
<p class="${LABEL} mt-8">${esc(p.category || 'Post')}</p>
<h1 class="mt-3 text-3xl font-bold leading-[1.15] text-ink sm:text-[40px]">${esc(p.title)}</h1>
${p.excerpt ? `<p class="mt-4 text-[17px] leading-relaxed text-muted">${esc(p.excerpt)}</p>` : ''}
<div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule py-3 text-xs text-muted">
<span>${esc(p.authorName || SITE_NAME)}</span> <time datetime="${isoDay(p.publishedAt)}">${esc(day(p.publishedAt))}</time> <span>${esc(p.readMinutes)} min read</span></div>
<img src="${esc(cover)}" alt="${esc(cover === p.coverUrl?.trim() ? p.coverAlt || '' : '')}" width="1600" height="900" class="object-cover mt-8 aspect-video w-full rounded-xl border border-rule" fetchpriority="high">
<div class="prose-post mt-8 max-w-[72ch] break-words">${p.body}</div>
${fromLibrary.length ? `<section class="card card-pad mt-12"><h2 class="${LABEL}">In the library on this subject</h2><ul class="mt-4 divide-y divide-rule">${fromLibrary.map((a: any) =>
    `<li class="py-3"><a href="/article/${esc(a.id)}" class="block"><span class="text-sm leading-snug text-ink-2">${esc(a.title)}</span><br><span class="text-xs text-muted">${esc([a.journalName, a.domain ? canonicalOrSelf(a.domain) : a.domain, a.year].filter(Boolean).join(' · '))}</span></a></li>`).join('')}</ul>
<a href="/digital-library" class="btn btn-brand mt-5">Browse the library</a></section>` : ''}
${related.length ? `<section class="mt-12"><h2 class="${LABEL}">More like this</h2><ul class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">${related.map((r: any) =>
    `<li><a href="/blog/${esc(r.slug)}" class="card card-interactive block p-4"><span class="text-[15px] font-semibold leading-snug text-ink">${esc(r.title)}</span><br><span class="text-xs text-muted">${esc(day(r.publishedAt))}</span></a></li>`).join('')}</ul></section>` : ''}
<section class="mt-12 rounded-xl bg-navy p-6"><h2 class="on-dark text-xl font-bold">Read the research itself</h2>
<p class="on-dark-2 mt-1 text-sm">Free to register. The whole library, in half-hour sessions. See also <a href="/for-institutions" class="underline">for institutions</a> and <a href="/for-students" class="underline">for students and researchers</a>.</p>
<a href="/signup?ref=blog" class="btn btn-highlight mt-4">Register Now</a></section>
</article></div>`;
}

function listBody(d: { posts: any[]; total: number }, page: number) {
  const pages = Math.max(1, Math.ceil(d.total / BLOG_PAGE_SIZE));
  const href = (n: number) => (n <= 1 ? '/blog' : `/blog?page=${n}`);
  const card = (p: any) => `<li><a href="/blog/${esc(p.slug)}" class="card card-interactive group flex flex-col overflow-hidden">
<img src="${esc(coverOf(p))}" alt="" width="1600" height="900" loading="lazy" class="object-cover aspect-video w-full">
<span class="flex flex-1 flex-col p-5"><span class="${LABEL}">${esc(p.category || 'Post')}</span>
<h2 class="mt-2 line-clamp-2 text-lg font-bold leading-tight text-ink">${esc(p.title)}</h2>
${p.excerpt ? `<span class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">${esc(p.excerpt)}</span>` : ''}
<span class="mt-auto pt-4 text-xs text-muted">${esc([p.authorName, day(p.publishedAt), `${p.readMinutes} min`].filter(Boolean).join(' · '))}</span></span></a></li>`;
  return `<div class="bg-ground"><section class="bg-navy"><div class="container-public py-12 text-center sm:py-16">
<h1 class="on-dark mt-4 text-3xl font-bold leading-tight sm:text-4xl">Writing from the library.</h1>
<p class="on-dark-2 mx-auto mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">What open research makes possible, how to get more out of the library, and what has changed in the collection.</p></div></section>
<main class="container-public py-12">
${crumbs([['Home', '/'], ['Blog', null]])}
${d.posts.length ? `<ul class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">${d.posts.map(card).join('')}</ul>`
    : `<div class="card mt-6 p-8"><h2 class="text-lg font-bold text-ink">Nothing here yet.</h2><p class="text-muted">Published posts will appear here when available.</p></div>`}
${pages > 1 ? `<nav aria-label="Pagination" class="mt-10 flex items-center justify-center gap-4 text-sm font-semibold">
${page > 1 ? `<a href="${href(page - 1)}" rel="prev" class="btn btn-outline btn-sm">Previous</a>` : ''}<span class="text-muted">Page ${page} of ${pages}</span>${page < pages ? `<a href="${href(page + 1)}" rel="next" class="btn btn-outline btn-sm">Next</a>` : ''}</nav>` : ''}
</main></div>`;
}

function departmentBody(d: (typeof DOMAINS)[number]) {
  const list = (items: string[]) => `<ul class="mt-3 list-disc space-y-1 pl-5 text-ink-2">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  return `<div class="bg-surface"><div class="container-public py-12">
${crumbs([['Home', '/'], ['Digital Library', '/digital-library'], [d.name, null]])}
<h1 class="mt-6 text-4xl font-bold leading-tight text-ink break-words">${esc(d.name)}</h1>
<p class="mt-5 max-w-3xl text-base leading-relaxed text-ink-2">${esc(d.description)}</p>
<p class="mt-4 max-w-3xl text-base leading-relaxed text-ink-2">${esc(d.importance)}</p>
<h2 class="mt-8 text-2xl font-bold text-ink">Why access ${esc(d.name)} here</h2><p class="mt-2 max-w-3xl leading-relaxed text-ink-2">${esc(d.whyAccess)}</p>
<h2 class="mt-8 text-2xl font-bold text-ink">Who it is for</h2>${list(d.whoShouldAccess || [])}
<h2 class="mt-8 text-2xl font-bold text-ink">What you get</h2>${list(d.features || [])}
<p class="mt-8 flex flex-wrap gap-4 text-sm font-semibold"><a class="btn btn-brand" href="/signup">Register Free</a> <a href="/digital-library" class="text-accent underline">All departments</a> <a href="/for-institutions" class="text-accent underline">For institutions</a> <a href="/blog" class="text-accent underline">Read the blog</a></p>
</div></div>`;
}

/** The department index as plain links, so the whole list is in the first response. The browser's page replaces it with the same list. */
function departmentsBody() {
  const sorted = [...DOMAINS].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="bg-surface"><div class="container-public py-12">
${crumbs([['Home', '/'], ['Departments', null]])}
<h1 class="mt-6 text-4xl font-bold leading-tight text-ink">Departments</h1>
<p class="mt-5 max-w-3xl text-base leading-relaxed text-ink-2">Explore academic resources by subject area.</p>
<ul class="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">${sorted.map(d => `<li><a class="text-accent underline" href="/domain/${esc(d.id)}">${esc(d.name)}</a></li>`).join('')}</ul>
</div></div>`;
}

// ── Routing ─────────────────────────────────────────────────────────────────────

type Rendered = { status: number; seo: SeoPage; body?: string; data?: unknown; redirect?: string };

const NOT_FOUND = (what: string): SeoPage => ({
  title: `${what} not found | ${SITE_NAME}`, description: `This page is not available on ${SITE_NAME}.`,
  canonical: `${SITE_URL}/blog`, robots: 'noindex, follow',
});

/** Exported so a test (and anything else) can ask "what does the server say about this address" without HTTP. */
export async function renderPublicPage(prisma: PrismaClient, path: string, query: Record<string, unknown>, o: { countView: boolean }): Promise<Rendered | null> {
  if (path === '/blog') {
    const page = Math.max(1, parseInt(String(query.page || '1')) || 1);
    const category = typeof query.category === 'string' ? query.category : '';
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    const seo = blogListSeo({ page, category, q });
    // A search or a category is a view of the same posts: the browser fetches it. Only the plain list, and its numbered pages, are written out.
    if (category || q) return { status: 200, seo };
    const list = await loadBlogList(prisma, { page, limit: BLOG_PAGE_SIZE });
    const last = Math.max(1, Math.ceil(list.total / BLOG_PAGE_SIZE));
    if (page > last) return { status: 200, seo: { ...seo, canonical: `${SITE_URL}/blog`, robots: 'noindex, follow' } };
    return { status: 200, seo, body: listBody(list, page), data: { kind: 'list', key: String(page), list } };
  }

  const post = /^\/blog\/([^/]+)$/.exec(path);
  if (post) {
    const slug = decodeURIComponent(post[1]);
    if (/\.\w+$/.test(slug)) return null;                               // feeds and files are not posts
    if (slug !== slug.toLowerCase()) return { status: 301, seo: NOT_FOUND('Post'), redirect: `/blog/${slug.toLowerCase()}` };
    const found = await loadBlogPost(prisma, slug, { countView: o.countView });
    if (!found) return { status: 404, seo: NOT_FOUND('Post') };
    const seo = postSeo(found.post);
    return { status: 200, seo, body: postBody(found), data: { kind: 'post', key: slug, ...found, post: { ...found.post, views: undefined } } };
  }

  if (path === '/departments') {
    const seo = staticPageSeo(path);
    if (seo) return { status: 200, seo, body: departmentsBody() };
  }

  const dept = /^\/domain\/([^/]+)$/.exec(path);
  if (dept) {
    const d = DOMAINS.find(x => x.id === dept[1]);
    if (!d) return { status: 404, seo: { ...NOT_FOUND('Department'), canonical: `${SITE_URL}/digital-library` } };
    return { status: 200, seo: departmentSeo(d), body: departmentBody(d) };
  }

  const seo = staticPageSeo(path);
  return seo ? { status: 200, seo } : null;
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit/i;

/**
 * Serves the SPA shell with real metadata and content for public pages; everything else falls through to the normal shell.
 * `shell` returns index.html (in development, passed through the dev server first).
 */
export function installSeoPages(app: Express, prisma: PrismaClient, shell: (url: string) => Promise<string>) {
  app.use(async (req: Request, res: Response, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const path = req.path.replace(/\/+$/, '') || '/';
    if (path.startsWith('/api/')) return next();
    let r: Rendered | null;
    try {
      // Crawlers and link-preview bots read the page without counting as a reader; this changes the view counter and nothing the page says.
      r = await renderPublicPage(prisma, path, req.query as any, { countView: req.method === 'GET' && !BOT.test(String(req.headers['user-agent'] || '')) });
    } catch (e: any) {
      console.error('SEO page error:', e?.message);
      return next();                                                    // the plain shell still works
    }
    if (!r) return next();
    if (r.redirect) return res.redirect(r.status, r.redirect + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
    try {
      const html = injectPage(await shell(req.originalUrl), r.seo, r.body, r.data);
      if (r.seo.robots) res.setHeader('X-Robots-Tag', r.seo.robots);
      res.status(r.status).type('html').send(html);
    } catch (e: any) {
      console.error('SEO page render error:', e?.message);
      next();
    }
  });
}
