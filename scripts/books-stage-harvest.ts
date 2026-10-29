/**
 * Stage a full book harvest into a SCRATCH database, never the live one.
 *
 *   DATABASE_URL=…/stm_books_stage npx tsx scripts/books-stage-harvest.ts DOAB [--delay 500] [--pages 5000] [--start <token>]
 *   DATABASE_URL=…/stm_books_stage npx tsx scripts/books-stage-harvest.ts OAPEN
 *
 * The scratch database holds the application's schema and a copy of every production book identity (all statuses) and every legacy Books row,
 * so the harvest's own duplicate check (DOI, ISBN-10/13, provider id, fingerprint, title+author) judges each record against what production
 * really holds. The run is MANUAL (src/lib/ingestion/books/oaiHarvest.ts): it does everything a harvest does and moves no checkpoint. Refuses any
 * database not named stm_books_stage. What it produces is a candidate set to be validated and frozen (scripts/books-freeze.ts); nothing here
 * reaches production.
 */
import { harvestFeed, DOAB_OAI, OAPEN_OAI } from '../src/lib/ingestion/books/oaiHarvest.js';
import { ingestionDb as db } from '../src/lib/ingestion/db.js';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const provider = (process.argv[2] || '').toUpperCase();
const cfg = provider === 'DOAB' ? DOAB_OAI : provider === 'OAPEN' ? OAPEN_OAI : null;
if (!cfg) { console.error('usage: books-stage-harvest.ts DOAB|OAPEN [--delay ms] [--pages n] [--start token]'); process.exit(2); }
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_books_stage') { console.error('refusing to run against anything but stm_books_stage'); process.exit(2); }

const before = Number((await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "Book" where source = $1 and "createdAt" > now() - interval '1 day'`, cfg.provider))[0].n);
const t0 = Date.now();
let lastPrint = 0;
const r = await harvestFeed(cfg, {
  manual: true,
  maxPages: Number(arg('--pages') || 5000),
  pageDelayMs: Number(arg('--delay') || 500),
  startToken: arg('--start') || null,
  onPage: (rep) => {
    if (Date.now() - lastPrint < 20_000) return;
    lastPrint = Date.now();
    console.log(`[${Math.round((Date.now() - t0) / 1000)}s] pages ${rep.pages} fetched ${rep.fetched} new ${rep.newCandidates} added ${rep.added} review ${rep.queuedForReview} dup ${JSON.stringify(rep.duplicates)} next ${String(rep.nextCursor || '').slice(0, 40)}`);
  },
});
console.log('DONE', JSON.stringify({ provider: cfg.provider, pages: r.pages, fetched: r.fetched, unique: r.uniqueCandidates, new: r.newCandidates, added: r.added, review: r.queuedForReview, failed: r.failed, duplicates: r.duplicates, department: r.department, access: r.access, licences: r.licences, unusable: r.unusable, sourceError: r.sourceError, nextCursor: r.nextCursor, accounting: (r as any).accounting?.ok, newInWindow: before }));
await db.$disconnect();
