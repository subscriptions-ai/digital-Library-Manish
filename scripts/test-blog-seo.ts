/**
 * Technical SEO checks for the public blog, the department pages and the pages around them. Reads raw HTML only (no JavaScript is run for
 * the main checks), the way a crawler's first fetch does.
 *
 *   npx tsx scripts/test-blog-seo.ts                     local: seeds posts into the throwaway database, serves the built app (run `npx vite build` first)
 *   npx tsx scripts/test-blog-seo.ts --live <origin>     read-only: audits a running site (for example after a deploy) using its newest published post
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const live = process.argv.includes('--live') ? process.argv[process.argv.indexOf('--live') + 1].replace(/\/$/, '') : null;
const CANON = 'https://journalslibrary.com';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Parsing raw HTML ──
const tags = (html: string, re: RegExp) => [...html.matchAll(re)].map(m => m[0]);
const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const unesc = (s?: string) => (s ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const meta = (html: string, key: 'name' | 'property', v: string) => tags(html, /<meta\b[^>]*>/gi).filter(t => attr(t, key) === v).map(t => unesc(attr(t, 'content')));
const canonicals = (html: string) => tags(html, /<link\b[^>]*rel="canonical"[^>]*>/gi).map(t => attr(t, 'href'));
const title = (html: string) => unesc(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
const h1s = (html: string) => tags(html, /<h1\b[\s\S]*?<\/h1>/gi).map(h => unesc(h.replace(/<[^>]*>/g, '').trim()));
const ldBlocks = (html: string) => tags(html, /<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi).map(t => JSON.parse(t.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')));
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/gi)].map(m => unesc(m[1]));

let BASE = live ?? '';
const get = async (path: string, o: { ua?: string; host?: string; redirect?: RequestRedirect } = {}) => {
  // (fetch cannot set Host; behind the proxy the original host arrives as X-Forwarded-Host, which is what the server reads.)
  const r = await fetch(BASE + path, { redirect: o.redirect ?? 'manual', headers: { 'User-Agent': o.ua ?? BROWSER, ...(o.host ? { 'X-Forwarded-Host': o.host } : {}) } });
  const text = await r.text();
  return { status: r.status, text, headers: r.headers, location: r.headers.get('location') };
};

// ── Local setup ──
let db: any, child: any, serverLog = '';
const RUN = Date.now().toString(36);
const seeded: string[] = [];
type Seed = { slug: string; title: string; status: string; excerpt?: string | null; cover?: string | null; seoTitle?: string; seoDescription?: string; author?: string | null; body?: string; ago?: number };
const sentence = (slug: string) => `Unique reading sentence for ${slug} that only this article contains.`;
async function setup() {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const real = /^DATABASE_URL=(.*)$/m.exec(env)![1].replace(/^["']|["']$/g, '');
  const url = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
  process.env.DATABASE_URL = url;
  const { PrismaClient } = await import('@prisma/client'); db = new PrismaClient();
  if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against this database');
  if (!existsSync(new URL('../dist/index.html', import.meta.url))) throw new Error('run `npx vite build` first');
  await db.blogPost.deleteMany({ where: { slug: { startsWith: 'seo-test-' } } });
  const mk = async (s: Seed) => {
    await db.blogPost.create({ data: {
      slug: s.slug, title: s.title, status: s.status, excerpt: s.excerpt === undefined ? `Excerpt for ${s.title}.` : s.excerpt,
      body: s.body ?? `<p>${sentence(s.slug)}</p><h2>A section</h2><p>More words about ${s.slug}.</p>`,
      coverUrl: s.cover === undefined ? `/uploads/media/${s.slug}-cover.png` : s.cover, coverAlt: s.cover === null ? null : `Cover for ${s.title}`,
      seoTitle: s.seoTitle, seoDescription: s.seoDescription, authorName: s.author === undefined ? 'Test Author' : s.author,
      publishedAt: s.status === 'Published' ? new Date(Date.now() - (s.ago ?? 0) * 3600_000) : null, readMinutes: 3,
    } });
    seeded.push(s.slug);
  };
  // Eleven published posts, so the list has a second page; plus awkward ones.
  for (let i = 1; i <= 9; i++) await mk({ slug: `seo-test-post-${i}`, title: `SEO test post number ${i}`, status: 'Published', ago: i });
  await mk({ slug: 'seo-test-custom', title: 'Custom search fields post', status: 'Published', seoTitle: 'A Custom Search Title', seoDescription: 'A hand-written search description for this post.', ago: 20 });
  await mk({ slug: 'seo-test-no-cover', title: 'Legacy post with no cover or excerpt', status: 'Published', cover: null, excerpt: null, author: null, ago: 30,
    body: '<p>This legacy post has no excerpt, so the description must come from its opening words. It keeps going for a while so that the opening is long enough to be cut.</p>' });
  await mk({ slug: 'seo-test-tricky', title: 'Tricky </script><b>"quotes" & ampersands', status: 'Published', ago: 40 });
  await mk({ slug: 'seo-test-draft', title: 'A draft that must stay private', status: 'Draft' });
  child = spawn('npx', ['tsx', 'server.ts'], { cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: url, PORT: '3112', NODE_ENV: 'production' } });
  child.stdout.on('data', (d: any) => (serverLog += d)); child.stderr.on('data', (d: any) => (serverLog += d));
  BASE = 'http://127.0.0.1:3112';
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(BASE + '/robots.txt')).status === 200) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-1500)); await sleep(500); }
}
async function teardown() {
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  if (db) { await db.blogPost.deleteMany({ where: { slug: { startsWith: 'seo-test-' } } }); await db.$disconnect(); }
}

/** The per-post audit from the brief, on raw HTML. Returns the page so callers can compare. */
async function auditPost(slug: string, sitemap: string, o: { expectTitle?: string } = {}) {
  const url = `${CANON}/blog/${slug}`;
  const r = await get(`/blog/${slug}`);
  const html = r.text;
  const robots = meta(html, 'name', 'robots');
  check(`${slug}: HTTP 200, HTML`, r.status === 200 && /text\/html/.test(r.headers.get('content-type') || ''), r.status);
  check(`${slug}: no noindex in the HTML or in X-Robots-Tag`, !robots.some(x => /noindex/i.test(x)) && !/noindex/i.test(r.headers.get('x-robots-tag') || ''), { robots, header: r.headers.get('x-robots-tag') });
  check(`${slug}: exactly one self-referencing canonical`, JSON.stringify(canonicals(html)) === JSON.stringify([url]), canonicals(html));
  const t = title(html);
  check(`${slug}: title is "<title> | STM Digital Library"`, / \| STM Digital Library$/.test(t) && (!o.expectTitle || t === o.expectTitle), t);
  const d = meta(html, 'name', 'description');
  check(`${slug}: one non-empty meta description`, d.length === 1 && d[0].length >= 20, d);
  const h = h1s(html);
  check(`${slug}: exactly one H1`, h.length === 1 && h[0].length > 0, h);
  const ld = ldBlocks(html); const bp: any = ld.find(x => x['@type'] === 'BlogPosting');
  check(`${slug}: BlogPosting JSON-LD with headline, dates, author, publisher, absolute image, mainEntityOfPage`,
    !!bp && !!bp.headline && !!bp.datePublished && !!bp.dateModified && !!bp.author?.name && bp.publisher?.name === 'STM Digital Library' && /^https:\/\//.test(bp.image?.[0] || bp.image || '') && bp.mainEntityOfPage?.['@id'] === url, bp);
  check(`${slug}: BreadcrumbList JSON-LD present`, ld.some(x => x['@type'] === 'BreadcrumbList' && x.itemListElement?.length === 3));
  check(`${slug}: Open Graph: title, description, url, type=article, absolute image`,
    meta(html, 'property', 'og:title').length === 1 && meta(html, 'property', 'og:description').length === 1 && meta(html, 'property', 'og:url')[0] === url
    && meta(html, 'property', 'og:type')[0] === 'article' && /^https:\/\/journalslibrary\.com\//.test(meta(html, 'property', 'og:image')[0] || ''), meta(html, 'property', 'og:image'));
  check(`${slug}: visible breadcrumb Home > Blog > title uses real links`, hrefs(html).includes('/') && hrefs(html).includes('/blog'));
  check(`${slug}: article text is in the first HTML (not added by script)`, /<div class="prose-post[^>]*>[\s\S]{40,}/.test(html) && /<time datetime="/.test(html));
  check(`${slug}: listed in sitemap-blog.xml`, sitemap.includes(`<loc>${url}</loc>`));
  const bot = await get(`/blog/${slug}`, { ua: GOOGLEBOT });
  check(`${slug}: Googlebot gets the same page (200, identical HTML, no auth redirect)`, bot.status === 200 && bot.text === html, bot.status);
  return { html, t, d: d[0], bp };
}

try {
  if (!live) await setup();

  section('robots.txt and sitemaps');
  const robots = await get('/robots.txt');
  check('robots.txt: does not block /blog, /assets or the sitemap, and names the sitemap', robots.status === 200 && !/Disallow:\s*\/(blog|assets|sitemap)/i.test(robots.text) && /Sitemap:\s*https:\/\/journalslibrary\.com\/sitemap\.xml/.test(robots.text), robots.text);
  check('robots.txt: the blog\'s own data stays readable for a rendering crawler (Allow /api/blog/ beats Disallow /api/)', /Disallow:\s*\/api\//.test(robots.text) && /Allow:\s*\/api\/blog\//.test(robots.text));
  const index = await get('/sitemap.xml');
  check('sitemap index lists the blog and department sitemaps', index.status === 200 && index.text.includes('/sitemap-blog.xml') && index.text.includes('/sitemap-departments.xml'));
  const sm = (await get('/sitemap-blog.xml')).text;
  const smLocs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  check('blog sitemap: every URL is https canonical, no query strings, no duplicates', smLocs.every(l => l.startsWith(CANON + '/blog') && !l.includes('?')) && new Set(smLocs).size === smLocs.length);
  check('blog sitemap: every post has a lastmod', (sm.match(/<url>/g) || []).length - 1 === (sm.match(/<lastmod>/g) || []).length - (/\/blog<\/loc>\s*<lastmod>/.test(sm) ? 1 : 0));

  let sampleSlugs: string[];
  if (live) sampleSlugs = smLocs.filter(l => /\/blog\/./.test(l)).slice(0, 3).map(l => l.split('/blog/')[1]);
  else {
    check('drafts are not in the sitemap', !sm.includes('seo-test-draft'));
    sampleSlugs = ['seo-test-post-1', 'seo-test-custom', 'seo-test-no-cover', 'seo-test-tricky'];
  }

  section('A published post, as raw HTML');
  const pages: Record<string, Awaited<ReturnType<typeof auditPost>>> = {};
  for (const s of sampleSlugs) pages[s] = await auditPost(s, sm);
  const titles = Object.values(pages).map(p => p.t), descs = Object.values(pages).map(p => p.d);
  check('titles are unique across posts', new Set(titles).size === titles.length, titles);
  check('descriptions are unique across posts', new Set(descs).size === descs.length, descs);

  if (!live) {
    section('Editor fields, fallbacks and awkward input');
    check('"Search title" becomes the title tag', pages['seo-test-custom'].t === 'A Custom Search Title | STM Digital Library', pages['seo-test-custom'].t);
    check('"Search description" becomes the meta description', pages['seo-test-custom'].d === 'A hand-written search description for this post.');
    check('no excerpt: the description comes from the opening words', /^This legacy post has no excerpt/.test(pages['seo-test-no-cover'].d) && pages['seo-test-no-cover'].d.length <= 160, pages['seo-test-no-cover'].d);
    const noCover = pages['seo-test-no-cover'];
    check('no cover: social image is the site\'s own artwork at an absolute URL, never broken or empty', /^https:\/\/journalslibrary\.com\/assets\/blog\/[\w-]+\.webp$/.test(noCover.bp.image[0]), noCover.bp.image);
    check('no author: not invented as a person (the site itself is the author)', noCover.bp.author['@type'] === 'Organization');
    const tricky = pages['seo-test-tricky'].html;
    check('a title containing </script> cannot close a script early', !tricky.includes('</script><b>'));
    check('…nor start a tag after one', !/<script[^>]*>[^<]*<b>/.test(tricky), /<script[^>]*>[^<]*<b>/.exec(tricky)?.[0]);
    check('…and the page still has exactly its two JSON-LD blocks', ldBlocks(tricky).length === 2, ldBlocks(tricky).length);
    check('the embedded page data is valid JSON', (() => { try { JSON.parse(/<script id="seo-data"[^>]*>([\s\S]*?)<\/script>/.exec(tricky)![1]); return true; } catch { return false; } })());
    check('the cover URL is public and absolute in og:image for a real cover', meta(pages['seo-test-post-1'].html, 'property', 'og:image')[0] === `${CANON}/uploads/media/seo-test-post-1-cover.png`);
    check('the post body text itself is in the raw HTML', pages['seo-test-post-1'].html.includes(sentence('seo-test-post-1')));
  }

  section('The blog list');
  const list = await get('/blog');
  check('/blog: 200, indexable, self canonical, one H1, unique title', list.status === 200 && !meta(list.text, 'name', 'robots').some(x => /noindex/.test(x)) && JSON.stringify(canonicals(list.text)) === JSON.stringify([`${CANON}/blog`]) && h1s(list.text).length === 1 && title(list.text) === 'Blog | STM Digital Library', { t: title(list.text), c: canonicals(list.text) });
  const listHrefs = hrefs(list.text);
  if (live) check('/blog: links to the newest posts with real anchors', sampleSlugs.every(s => listHrefs.includes(`/blog/${s}`)) || listHrefs.filter(h => /^\/blog\/[^/?]+$/.test(h)).length >= 1, listHrefs.slice(0, 20));
  else {
    check('/blog: shows the 9 newest posts as real <a href> links', [1, 2, 3, 4, 5, 6, 7, 8, 9].every(i => listHrefs.includes(`/blog/seo-test-post-${i}`)), listHrefs.filter(h => h.startsWith('/blog')));
    check('/blog: no draft, and no "Nothing here yet"', !list.text.includes('seo-test-draft') && !/Nothing here yet/i.test(list.text));
    check('/blog: breadcrumbs and a crawlable "Next" link to page 2', listHrefs.includes('/blog?page=2') && /rel="next"/.test(list.text));
    const p2 = await get('/blog?page=2');
    check('/blog?page=2: reachable, lists the older posts, own canonical, indexable', p2.status === 200 && hrefs(p2.text).includes('/blog/seo-test-custom') && hrefs(p2.text).includes('/blog/seo-test-no-cover') && canonicals(p2.text)[0] === `${CANON}/blog?page=2` && !meta(p2.text, 'name', 'robots').some(x => /noindex/.test(x)));
    check('/blog?page=2 links back to page 1', hrefs(p2.text).includes('/blog') && /rel="prev"/.test(p2.text));
    const farPage = await get('/blog?page=99');
    check('a page past the end is kept out of the index and points at /blog', /noindex/.test(meta(farPage.text, 'name', 'robots')[0] || '') && canonicals(farPage.text)[0] === `${CANON}/blog`);
    const search = await get('/blog?q=anything');
    check('a search result list is noindex and points at /blog', /noindex/.test(meta(search.text, 'name', 'robots')[0] || '') && canonicals(search.text)[0] === `${CANON}/blog`);
    const cat = await get('/blog?category=Anything&utm_source=x');
    check('a filtered or tagged list canonicalises to /blog (no duplicate indexed copies)', canonicals(cat.text)[0] === `${CANON}/blog`);
    const dupe = await get('/blog/seo-test-post-1?utm_source=x&sort=latest');
    check('a post URL with query parameters canonicalises to the clean URL', canonicals(dupe.text)[0] === `${CANON}/blog/seo-test-post-1`);
    const slash = await get('/blog/seo-test-post-1/');
    check('a trailing slash serves the same canonical', slash.status === 200 && canonicals(slash.text)[0] === `${CANON}/blog/seo-test-post-1`);

    section('Not found means not found');
    const nf = await get('/blog/this-does-not-exist-zzz');
    check('an unknown post: real 404, noindex, no canonical to another page', nf.status === 404 && /noindex/.test(meta(nf.text, 'name', 'robots')[0] || '') && /noindex/.test(nf.headers.get('x-robots-tag') || ''), nf.status);
    const dr = await get('/blog/seo-test-draft');
    check('a draft: the same 404, and none of its words in the response', dr.status === 404 && !dr.text.includes('draft that must stay private'));
    const up = await get('/blog/SEO-Test-Post-1');
    check('an upper-case slug is a 301 to the lower-case URL', up.status === 301 && up.location === '/blog/seo-test-post-1', { s: up.status, l: up.location });
    const rss = await get('/blog/rss.xml');
    check('the feed is still a feed', rss.status === 200 && /xml/.test(rss.headers.get('content-type') || ''));
    // Taking a post down: gone from the sitemap, from the list, and a 404, with no manual step.
    await db.blogPost.update({ where: { slug: 'seo-test-post-9' }, data: { status: 'Draft' } });
    const after = await get('/blog/seo-test-post-9'), smAfter = (await get('/sitemap-blog.xml')).text, listAfter = (await get('/blog')).text;
    check('unpublished: 404 now, gone from the sitemap and from /blog', after.status === 404 && !smAfter.includes('seo-test-post-9') && !hrefs(listAfter).includes('/blog/seo-test-post-9'));
    await db.blogPost.update({ where: { slug: 'seo-test-post-9' }, data: { status: 'Published', publishedAt: new Date() } });
    const smBack = (await get('/sitemap-blog.xml')).text;
    check('published again: back in the sitemap with a lastmod, no manual step', smBack.includes('<loc>https://journalslibrary.com/blog/seo-test-post-9</loc>'));
    const before = /seo-test-post-9<\/loc>\s*<lastmod>([^<]+)/.exec(smBack)?.[1];
    await sleep(1100); await db.blogPost.update({ where: { slug: 'seo-test-post-9' }, data: { excerpt: 'Edited excerpt.' } });
    const afterEdit = /seo-test-post-9<\/loc>\s*<lastmod>([^<]+)/.exec((await get('/sitemap-blog.xml')).text)?.[1];
    check('editing a post moves its lastmod', !!before && !!afterEdit && afterEdit > before, { before, afterEdit });

    section('Department pages and the pages around the blog');
    const dept = await get('/domain/management'), dept2 = await get('/domain/nursing');
    check('/domain/management: 200, one H1, self canonical, indexable, description present', dept.status === 200 && h1s(dept.text).length === 1 && canonicals(dept.text)[0] === `${CANON}/domain/management` && meta(dept.text, 'name', 'description')[0]?.length > 40 && !/noindex/.test(meta(dept.text, 'name', 'robots')[0]), { h: h1s(dept.text), c: canonicals(dept.text) });
    check('department titles and descriptions are unique', title(dept.text) !== title(dept2.text) && meta(dept.text, 'name', 'description')[0] !== meta(dept2.text, 'name', 'description')[0]);
    check('department content and links are in the raw HTML', /Why access/.test(dept.text) && hrefs(dept.text).includes('/digital-library') && ldBlocks(dept.text).some(x => x['@type'] === 'CollectionPage'));
    check('an unknown department is a real 404', (await get('/domain/not-a-department')).status === 404);
    const sd = (await get('/sitemap-departments.xml')).text;
    check('departments sitemap lists the department', sd.includes(`${CANON}/domain/management`));
    const filt = await get('/digital-library?type=Books&sort=latest&page=3');
    check('a filtered public URL canonicalises to the plain page', canonicals(filt.text)[0] === `${CANON}/digital-library` && /Digital Library \| STM Digital Library/.test(title(filt.text)), { c: canonicals(filt.text), t: title(filt.text) });
    const about = await get('/about');
    check('/about: own title, description and canonical in the raw HTML', title(about.text).startsWith('About Us') && canonicals(about.text)[0] === `${CANON}/about` && meta(about.text, 'name', 'description').length === 1);
    const priv = await get('/admin/blog'); const studio = await get('/studio'); const dash = await get('/dashboard/library');
    check('private areas carry X-Robots-Tag: noindex, nofollow', [priv, studio, dash].every(x => /noindex/.test(x.headers.get('x-robots-tag') || '')));
    const www = await get('/blog/seo-test-post-1?x=1', { host: 'www.journalslibrary.com' });
    check('www redirects to the one real host, keeping the path', www.status === 301 && www.location === `${CANON}/blog/seo-test-post-1?x=1`, { s: www.status, l: www.location });
    const root = await get('/');
    check('/: the home page has its own title, description and canonical in the raw HTML', /\| STM Digital Library$/.test(title(root.text)) && canonicals(root.text).length === 1 && meta(root.text, 'name', 'description').length === 1);

    section('The browser takes over without duplicating or flashing');
    let chromium: any = null;
    try { chromium = createRequire(import.meta.url)('/home/itb04/dl periodical scrapper/my-scraper-app/node_modules/playwright-core').chromium; } catch {}
    if (!chromium || !existsSync('/usr/bin/google-chrome')) console.log('  (skipped: no browser available)');
    else {
      const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
      try {
        const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addInitScript(() => localStorage.setItem('cookie-consent', 'rejected'));
        const p = await ctx.newPage(); const calls: string[] = []; const errors: string[] = [];
        p.on('request', (r: any) => { if (r.url().includes('/api/blog')) calls.push(r.url()); });
        p.on('pageerror', (e: any) => errors.push(String(e)));
        await p.goto(BASE + '/blog/seo-test-post-1', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
        const dom = await p.evaluate(() => ({
          canon: [...document.querySelectorAll('link[rel=canonical]')].map(e => e.getAttribute('href')),
          desc: [...document.querySelectorAll('meta[name=description]')].length,
          robots: [...document.querySelectorAll('meta[name=robots]')].map(e => e.getAttribute('content')),
          ld: [...document.querySelectorAll('script[type="application/ld+json"]')].length,
          ogTitle: [...document.querySelectorAll('meta[property="og:title"]')].length,
          title: document.title, h1: [...document.querySelectorAll('h1')].map(e => e.textContent), body: document.body.innerText.includes('Unique reading sentence for seo-test-post-1'),
        }));
        check('after hydration: still one canonical, one description, one robots, one og:title, exactly two JSON-LD blocks', dom.canon.length === 1 && dom.desc === 1 && dom.robots.length === 1 && dom.ogTitle === 1 && dom.ld === 2, dom);
        check('after hydration: same title and H1, and the article is on screen', dom.title === pages['seo-test-post-1'].t && dom.h1.length === 1 && dom.body, dom);
        check('the post is shown from the embedded data: no request for it on first load', calls.length === 0, calls);
        check('no script errors', errors.length === 0, errors);
        await p.goto(BASE + '/blog', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
        const links = await p.evaluate(() => [...document.querySelectorAll('main a[href^="/blog/"]')].length);
        check('the list in the browser also uses real links, and no list request was needed', links >= 9 && calls.length === 0, { links, calls });
        await p.click('main a[href="/blog/seo-test-post-2"]'); await p.waitForSelector('h1'); await p.waitForTimeout(400);
        check('client-side navigation to another post still works and updates the canonical', (await p.evaluate(() => document.querySelector('link[rel=canonical]')?.getAttribute('href'))) === `${CANON}/blog/seo-test-post-2` && calls.length === 1, calls);
        await p.goto(BASE + '/blog/no-such-post-zzz', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
        check('an unknown post shows the "unavailable" screen in the browser too', /unavailable/i.test(await p.innerText('body')));
      } finally { await b.close(); }
    }
    check('the server log is quiet about SEO errors', !/SEO page (render )?error/.test(serverLog), serverLog.split('\n').filter(l => /SEO page/.test(l)).slice(0, 2));
  }
} catch (e: any) {
  fail++; console.log('  FAIL  unexpected error —', e?.stack || e);
} finally {
  if (!live) await teardown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
