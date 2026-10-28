/**
 * Fetch OpenAlex journal sources (type:journal, is_oa:true, has_issn:true) by CURSOR with the authenticated client in
 * src/lib/ingestion/openAlexJournals.ts, and save the candidates — with their topic/subfield evidence — to a file. READ-ONLY: nothing is written to any database, and the
 * source-health table is not touched (the client is handed a plain fetcher). The API key is read from OPENALEX_API_KEY, goes only into the request, and is never printed.
 *
 *   npx tsx scripts/openalex-journal-fetch.ts --out cands.json [--max-pages 800] [--min-credits 2000]
 *
 * Resumable: the cursor and everything read so far are saved after every page to <out>.progress.json. Every request is counted and the credits OpenAlex reports are
 * tracked from its rate-limit headers; the run stops by itself if the credits left today fall below --min-credits, and it waits out a 429's Retry-After.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'cands.json')!; const progressFile = `${out}.progress.json`;
const MAX_PAGES = Number(arg('max-pages', '800')); const MIN_CREDITS = Number(arg('min-credits', '2000'));
if (!process.env.OPENALEX_API_KEY) { console.error('OPENALEX_API_KEY is not set; nothing was requested.'); process.exit(2); }

const O = await import('../src/lib/ingestion/openAlexJournals.js');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const stats = { requests: 0, credits: 0, retries: 0, remaining: null as number | null, limit: null as number | null };
/** A plain fetcher in the shape the client expects. It never logs the URL (the key is in it). */
const fetcher: any = async (url: string, opts: any) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    stats.requests++;
    try {
      const r = await fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(60_000) });
      const cost = Number(r.headers.get('x-ratelimit-credits-used')); if (Number.isFinite(cost)) stats.credits += cost; else stats.credits += 1;
      const rem = Number(r.headers.get('x-ratelimit-remaining')); if (Number.isFinite(rem)) stats.remaining = rem;
      const lim = Number(r.headers.get('x-ratelimit-limit')); if (Number.isFinite(lim)) stats.limit = lim;
      if (r.ok) return { ok: true, status: r.status, json: await r.json() };
      if (r.status === 429) { const wait = Math.min(120, Number(r.headers.get('retry-after')) || 10); stats.retries++; await sleep(wait * 1000); continue; }
      if (r.status >= 500) { stats.retries++; await sleep(2000 * attempt); continue; }
      return { ok: false, status: r.status, json: null, error: `OpenAlex answered HTTP ${r.status}` };
    } catch (e: any) { stats.retries++; await sleep(2000 * attempt); if (attempt === 5) return { ok: false, status: null, json: null, error: `OpenAlex request failed (${e?.name || 'error'})` }; }
  }
  return { ok: false, status: 429, json: null, error: 'OpenAlex kept rate-limiting' };
};

type Progress = { cursor: string | null; page: number; total: number | null; fetched: number; skips: any; items: any[]; stats: typeof stats };
let st: Progress = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, 'utf8')) : { cursor: null, page: 0, total: null, fetched: 0, skips: { notJournal: 0, notOa: 0, noIssn: 0, noTitle: 0 }, items: [], stats };
if (existsSync(progressFile)) Object.assign(stats, st.stats);

let done = false;
for (let i = 0; i < MAX_PAGES; i++) {
  if (stats.remaining != null && stats.remaining < MIN_CREDITS) { console.log(`stopping: ${stats.remaining} credits left today (floor ${MIN_CREDITS})`); break; }
  const pg = await O.fetchJournalSourcesPage(st.cursor, 100, fetcher);
  st.page++; st.fetched += pg.fetched; st.total = pg.total ?? st.total; st.items.push(...pg.candidates);
  for (const k of Object.keys(pg.skips)) st.skips[k] += (pg.skips as any)[k];
  st.cursor = pg.next; st.stats = stats;
  writeFileSync(progressFile, JSON.stringify(st));
  if (st.page % 50 === 0) console.log(`page ${st.page}: ${st.fetched} sources read, ${st.items.length} candidates, ${stats.requests} requests, ${stats.credits} credits, ${stats.remaining} credits left`);
  if (!pg.next) { done = true; break; }
  await sleep(150);
}
writeFileSync(out, JSON.stringify({ source: 'OpenAlex Sources', fetchedAt: new Date().toISOString(), complete: done, total: st.total, fetched: st.fetched, skips: st.skips, stats, items: st.items }));
console.log(JSON.stringify({ complete: done, pages: st.page, sourcesRead: st.fetched, candidates: st.items.length, skips: st.skips, requests: stats.requests, credits: stats.credits, retries: stats.retries, creditsRemainingToday: stats.remaining, creditsLimit: stats.limit }, null, 1));
