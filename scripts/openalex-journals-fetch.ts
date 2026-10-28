/**
 * Read every open-access journal SOURCE from OpenAlex by cursor and keep what a department decision needs. Reads only; streams a NDJSON file (one source a line), no database.
 *
 *   npx tsx scripts/openalex-journals-fetch.ts --out sources.ndjson [--max-pages N]   (re-run the same command to resume after an interruption)
 *
 * The key comes from OPENALEX_API_KEY (the environment or .env) and goes only into the request: it is never printed or written. One test request first (status and rate-limit
 * headers only), then ~200 sources a page. Each source keeps its ids, ISSNs, publisher, country, homepage and its top ten TOPICS with their subfield and field: the department evidence.
 * The file is written a page at a time and the cursor is saved beside it, so nothing is lost if the run stops (a single JSON document of all 75,000 sources exceeds the string limit).
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const envFile = (() => { try { return readFileSync(new URL('../.env', import.meta.url), 'utf8'); } catch { return ''; } })();
const key = process.env.OPENALEX_API_KEY || (/^OPENALEX_API_KEY=(.*)$/m.exec(envFile) || [])[1]?.trim();
if (!key) { console.log('OpenAlex key usable: no (OPENALEX_API_KEY is not set)'); process.exit(0); }
const SELECT = 'id,display_name,type,issn_l,issn,host_organization_name,country_code,homepage_url,is_oa,is_in_doaj,works_count,topics';
const FILTER = arg('filter', 'type:journal,is_oa:true,has_issn:true')!;   // --filter 'type:journal,is_oa:false,has_issn:true' reads the journals that are not open access
const url = (cursor: string, per = 200) => `https://api.openalex.org/sources?filter=${encodeURIComponent(FILTER)}&select=${SELECT}&per-page=${per}&cursor=${encodeURIComponent(cursor)}&mailto=info@celnet.in&api_key=${encodeURIComponent(key)}`;
const hide = (s: string) => s.split(key).join('<hidden>');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get(cursor: string) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(url(cursor), { headers: { 'User-Agent': 'STM Digital Library (mailto:info@celnet.in)' } });
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(30_000, 1500 * attempt * attempt)); continue; }
      return { r, body: await r.json().catch(() => ({})) };
    } catch (e: any) { await sleep(1500 * attempt); }
  }
  throw new Error('OpenAlex did not answer after 5 attempts');
}

const out = arg('out', 'sources.ndjson')!; const ckpt = out + '.cursor';
const slim = (s: any) => ({ id: s.id, display_name: s.display_name, type: s.type, issn_l: s.issn_l, issn: s.issn, host_organization_name: s.host_organization_name, country_code: s.country_code, homepage_url: s.homepage_url, is_oa: s.is_oa, is_in_doaj: s.is_in_doaj, works_count: s.works_count,
  topics: (Array.isArray(s.topics) ? s.topics : []).slice(0, 10).map((t: any) => ({ display_name: t.display_name, count: t.count, subfield: { display_name: t.subfield?.display_name }, field: { display_name: t.field?.display_name } })) });

let cursor: string | null = '*'; let pages = 0; let count = 0; let total: number | null = null;
if (existsSync(ckpt) && existsSync(out)) { const c = JSON.parse(readFileSync(ckpt, 'utf8')); cursor = c.cursor; pages = c.pages; count = c.count; total = c.total; console.log(`resuming at page ${pages + 1} (${count.toLocaleString()} sources already saved)`); }
else writeFileSync(out, '');
const max = parseInt(arg('max-pages', '1000')!, 10);
while (cursor && pages < max) {
  const { r, body } = await get(cursor);
  if (pages === 0 && cursor === '*') {
    const h: Record<string, string> = {}; for (const [k, v] of r.headers) if (/ratelimit/i.test(k)) h[k] = v;
    console.log(JSON.stringify({ authenticated: r.status === 200 && !!body?.meta?.next_cursor, httpStatus: r.status, total: body?.meta?.count ?? null, remaining: h['x-ratelimit-remaining'] ?? null, limit: h['x-ratelimit-limit'] ?? null, reset: h['x-ratelimit-reset'] ?? null }));
  }
  if (r.status !== 200) { console.log(`stopped at page ${pages + 1}: HTTP ${r.status} ${hide(String(body?.message || body?.error || '')).slice(0, 160)}`); process.exit(1); }
  total = body?.meta?.count ?? total;
  appendFileSync(out, body.results.map((s: any) => JSON.stringify(slim(s))).join('\n') + (body.results.length ? '\n' : ''));
  count += body.results.length; pages++;
  cursor = body?.meta?.next_cursor && body.results.length ? body.meta.next_cursor : null;
  writeFileSync(ckpt, JSON.stringify({ cursor, pages, count, total }));
  if (pages % 25 === 0) console.log(`  ${pages} pages, ${count.toLocaleString()} sources, remaining credits ${r.headers.get('x-ratelimit-remaining') ?? '?'}`);
  await sleep(120);
}
writeFileSync(out + '.meta.json', JSON.stringify({ fetchedAt: new Date().toISOString(), filter: FILTER, total, complete: !cursor, pages, count }));
console.log(`done: ${count.toLocaleString()} sources in ${pages} pages, complete=${!cursor} → ${out}`);
