// READ-ONLY. Are the journals of a run visible where a reader looks? Run through `docker exec -i -w /app <app> node -` with __ISSNS__ filled in.
// Checks (all against the running production app on localhost, anonymous requests): the DB rows; the department listing API swept page by page (default sort and ?sort=title) for every ISSN;
// the search (?q=) by ISSN and by title; the department/domain counts; response cache headers; and the running environment (NODE_ENV, no secrets printed).
const { PrismaClient } = require('@prisma/client');
const issns = __ISSNS__, titles = __TITLES__;
const base = 'http://localhost:' + (process.env.PORT || 3000);
(async () => {
  const p = new PrismaClient(); const out = { env: { NODE_ENV: process.env.NODE_ENV || null, port: process.env.PORT || 3000 } };
  const db = await p.$transaction(async tx => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); return tx.$queryRawUnsafe('select issn, status::text st, domain, title from "Journal" where issn = any($1::text[])', issns); });
  const nursing = await p.$queryRawUnsafe(`select status::text st, count(*)::int n from "Journal" where domain='Nursing' group by 1`); await p.$disconnect();
  out.db = { found: db.length, expected: issns.length, wrongStatusOrDepartment: db.filter(x => x.st !== 'MetadataOnly' || x.domain !== 'Nursing').length, nursingByStatus: Object.fromEntries(nursing.map(x => [x.st, x.n])) };
  const get = async (path) => { const r = await fetch(base + path); const j = await r.json().catch(() => null); return { status: r.status, cache: r.headers.get('cache-control'), etag: !!r.headers.get('etag'), json: j }; };
  const sweep = async (sort) => { const seen = new Set(); let page = 1, total = null, pages = null, info = null;
    for (;;) { const r = await get(`/api/library/department/nursing?page=${page}&limit=200${sort ? '&sort=' + sort : ''}`); if (r.status !== 200 || !r.json) return { error: r.status, page }; total = r.json.total; pages = r.json.pages; info = { cache: r.cache, etag: r.etag }; for (const j of r.json.journals) seen.add(j.issn); if (!r.json.hasMore) break; page++; if (page > 50) break; }
    return { total, pages, collected: seen.size, missing: issns.filter(i => !seen.has(i)), info }; };
  out.departmentSweepDefaultSort = await sweep(null); out.departmentSweepTitleSort = await sweep('title');
  const first = await get('/api/library/department/nursing?page=1&limit=100'); out.firstPage = { status: first.status, journalTotal: first.json && first.json.journalTotal, total: first.json && first.json.total, pages: first.json && first.json.pages, sort: first.json && first.json.sort, firstPageHolds: first.json ? first.json.journals.filter(j => issns.includes(j.issn)).length : null };
  let byIssn = 0, byTitle = 0; const sample = issns.slice(0, 12);
  for (const i of sample) { const r = await get('/api/library/department/nursing?q=' + encodeURIComponent(i)); if (r.json && r.json.journals.some(j => j.issn === i)) byIssn++; const t = titles[i]; if (t) { const r2 = await get('/api/library/department/nursing?q=' + encodeURIComponent(t.slice(0, 40))); if (r2.json && r2.json.journals.some(j => j.issn === i)) byTitle++; } }
  out.search = { sampled: sample.length, foundByIssn: byIssn, foundByTitle: byTitle };
  const dc = await get('/api/public/domain-counts'); const rows = dc.json && (dc.json.domains || dc.json); out.domainCounts = { status: dc.status, cache: dc.cache, nursing: Array.isArray(rows) ? rows.find(x => /nursing/i.test(x.domain || x.name || '')) : null };
  const one = await get('/api/library/journal/' + issns[0]); out.detailPage = { status: one.status, cache: one.cache };
  console.log(JSON.stringify(out));
})();
