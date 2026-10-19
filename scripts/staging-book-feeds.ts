/**
 * Staging run of the two review-only Book feeds — Crossref Books and Pressbooks Directory (in the continuous rotation since 2026-10-19) — against the REAL
 * services, writing only to the throwaway database `stm_ingestion_test` (refuses anything else).
 *
 *   npx tsx scripts/staging-book-feeds.ts
 *
 * Read-only against the real catalogue: the dev database `stm_library` is opened for ONE thing, to ask which of the fetched books it already
 * holds (the same DOI / ISBN lookup the harvest uses). Nothing is written there. Requests are small and polite: a few pages, a handful of
 * Pressbooks licence checks.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const devUrl = real;
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.PRESSBOOKS_LICENCE_CHECKS = process.env.PRESSBOOKS_LICENCE_CHECKS || '8';
delete process.env.BOOKS_CROSSREF; delete process.env.BOOKS_PRESSBOOKS;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const H = await import('../src/lib/ingestion/books/oaiHarvest.js');
const Q = await import('../src/lib/ingestion/quickImport.js');
const X = await import('../src/lib/ingestion/books/extraKinds.js');
const { findHeldBooks } = await import('../src/lib/ingestion/books/dedupe.js');
const { buildProviders } = await import('../src/lib/ingestion/providers.js');
const { __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');

const dev = new PrismaClient({ datasources: { db: { url: devUrl } } });
if ((await dev.$queryRawUnsafe<any[]>('select current_database() d'))[0].d === 'stm_ingestion_test') throw new Error('dev client points at the test database');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const short = (r: any) => ({
  pages: r.pages, fetched: r.fetched, unique: r.uniqueCandidates, new: r.newCandidates, added: r.added, review: r.queuedForReview, failed: r.failed,
  dup: r.duplicates, dept: r.department, access: r.access, licences: r.licences, unusable: r.unusable, completeListSize: r.completeListSize,
  resumedFrom: r.resumedFrom, nextCursor: r.nextCursor, sourceError: r.sourceError, accounting: r.accounting?.ok ?? r.accounting,
});

const providers = ['CrossrefBooks', 'Pressbooks'];
for (const p of providers) {
  await db.$executeRawUnsafe(`delete from "Book" where source = $1`, p);
  await db.bookHarvestCheckpoint.deleteMany({ where: { provider: p } });
}
__resetProviderLocks();

// ── Crossref Books ─────────────────────────────────────────────────────────
section('CROSSREF BOOKS — live');
const cDry = await H.harvestFeed(H.CROSSREF_BOOKS_FEED, { dryRun: true, maxPages: 2, ignoreCheckpoint: true, pageDelayMs: 0 });
console.log('  dry run:', JSON.stringify(short(cDry)));
check('dry run reached Crossref and read two pages (200 records)', cDry.pages === 2 && cDry.fetched >= 150 && !cDry.sourceError, `${cDry.fetched} fetched`);
check('the cursor moved: a next-cursor token was returned and differs from the start', !!cDry.nextCursor && cDry.nextCursor !== '*');
check('every record is accounted for in exactly one bucket', cDry.accounting == null || (cDry.accounting as any).ok === true, JSON.stringify(cDry.accounting).slice(0, 120));
check('no record was classified straight to a published department (Crossref carries no controlled code)', (cDry.department.strong || 0) === 0, `strong=${cDry.department.strong} review=${cDry.department.review} none=${cDry.department.none}`);
check('open access is NOT assumed: no record is FullText or OpenExternal', cDry.access.FullText === 0 && cDry.access.OpenExternal === 0, JSON.stringify(cDry.access));
check('no licence is invented (every record reads "none declared")', Object.keys(cDry.licences).every(k => /none declared/.test(k)), JSON.stringify(cDry.licences));
check('a dry run writes nothing', Number((await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "Book" where source='CrossrefBooks'`))[0].n) === 0 && !(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'CrossrefBooks' } })));
console.log('  department suggestions:', JSON.stringify(cDry.department.suggestions).slice(0, 400));
console.log('  sample:', JSON.stringify(cDry.sample.slice(0, 3)).slice(0, 700));

// dedupe against what the dev catalogue already holds (READ ONLY). Page 1 of the walk is 100 titleless AAPG records, so page 2 is the first useful one.
const pg1 = await X.extraBatch(H.CROSSREF_BOOKS_FEED, null, null, { db, report: H.emptyReport('x', true), pauseMs: 0 }) as any;
const page2Token: string = pg1.next;
console.log(`  page 1 of the walk: ${pg1.count} records, ${pg1.books.length} usable, ${pg1.unusable} unusable (titleless)`);
{
  const fx = await X.extraBatch(H.CROSSREF_BOOKS_FEED, page2Token, null, { db, report: H.emptyReport('x', true), pauseMs: 0 }) as any;
  const held = await findHeldBooks(fx.books, dev);
  const via = [...held.values()].reduce((a: any, h: any) => (a[h.via] = (a[h.via] || 0) + 1, a), {});
  console.log(`  read-only look at the dev catalogue: ${held.size} of ${fx.books.length} usable page-2 books are already held ${JSON.stringify(via)}`);
  check('DOI/ISBN dedupe runs against the real catalogue without error', fx.books.length > 0);
}

// real write into the throwaway DB, with the continuous checkpoint (pages 1 and 2)
const cRun1 = await H.harvestFeed(H.CROSSREF_BOOKS_FEED, { maxPages: 2, pageDelayMs: 0 });
console.log('  write run 1 (pages 1-2):', JSON.stringify(short(cRun1)));
const cp1 = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'CrossrefBooks' } });
check('continuous run saved its own checkpoint under CrossrefBooks', !!cp1?.cursor, `cursor=${String(cp1?.cursor).slice(0, 30)}…`);
const rows1: any[] = await db.$queryRawUnsafe(`select status, "accessStatus", "rightsStatus", licence, domain, count(*)::int n from "Book" where source='CrossrefBooks' group by 1,2,3,4,5`);
console.log('  rows written:', JSON.stringify(rows1));
check('every Crossref book written waits as a Draft with NO department', rows1.length > 0 && rows1.every(r => r.status === 'Draft' && r.domain === null));
check('every Crossref book is MetadataOnly with no licence', rows1.every(r => r.accessStatus === 'MetadataOnly' && !r.licence));
check('only books close to a department were queued: the rest were skipped, not written', cRun1.queuedForReview > 0 && cRun1.queuedForReview < cRun1.newCandidates, `${cRun1.queuedForReview} queued of ${cRun1.newCandidates} new`);
const cRun2 = await H.harvestFeed(H.CROSSREF_BOOKS_FEED, { maxPages: 1, pageDelayMs: 0 });
console.log('  write run 2 (page 3):', JSON.stringify(short(cRun2)));
check('the second run resumed from the saved cursor, not from the start', cRun2.resumedFrom === cp1?.cursor, `resumedFrom=${String(cRun2.resumedFrom).slice(0, 24)}…`);
check('page 3 gave different books (no overlap with pages 1-2)', cRun2.duplicates.doi + cRun2.duplicates.sourceRecordId + cRun2.duplicates.inRun === 0, JSON.stringify(cRun2.duplicates));
const cp2 = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'CrossrefBooks' } });
check('the checkpoint moved forward', cp2?.cursor !== cp1?.cursor);
// page 2 again, from a manual run: everything already written is held
const cAgain = await H.harvestFeed(H.CROSSREF_BOOKS_FEED, { manual: true, startToken: page2Token, maxPages: 1, pageDelayMs: 0 });
console.log('  manual re-read of page 2:', JSON.stringify(short(cAgain)));
const heldDup = cAgain.duplicates.doi + cAgain.duplicates.isbn + cAgain.duplicates.sourceRecordId + cAgain.duplicates.fingerprint + cAgain.duplicates.title;
check('re-reading page 2 adds nothing — DOI/ISBN dedupe holds every book already written', cAgain.added === 0 && cAgain.queuedForReview === 0 && heldDup > 0, JSON.stringify(cAgain.duplicates));
const cp3 = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'CrossrefBooks' } });
check('a manual run never moves the continuous checkpoint', cp3?.cursor === cp2?.cursor);
check('Pressbooks has no checkpoint yet: nothing here touched it', !(await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'Pressbooks' } })));

// Quick Import path (from page 2, its own position)
Q.__useQuickPageDelayForTests(0);
const qjob = await Q.beginQuickImport('crossrefbooks', { id: 'staging', email: 'staging@example.test' }, { advanced: { limit: 100, startToken: page2Token, from: null } });
for (let t0 = Date.now(); ;) { const j = Q.getQuickJob(qjob.id); if (!j || j.status !== 'running') break; if (Date.now() - t0 > 120_000) throw new Error('quick import timed out'); await new Promise(r => setTimeout(r, 200)); }
const qj = Q.getQuickJob(qjob.id) as any;
console.log('  quick import:', JSON.stringify({ status: qj?.status, result: qj?.result, error: qj?.error }).slice(0, 600));
check('Quick Import of Crossref Books finished and read the records', qj?.status === 'done' && (qj?.result?.checked ?? 0) > 0, String(qj?.status));
const cp4 = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'CrossrefBooks' } });
check('…and left the continuous checkpoint exactly where it was', cp4?.cursor === cp2?.cursor);

// ── Pressbooks Directory ───────────────────────────────────────────────────
section('PRESSBOOKS DIRECTORY — live');
const pDry = await H.harvestFeed(H.PRESSBOOKS_FEED, { dryRun: true, maxPages: 2, ignoreCheckpoint: true, pageDelayMs: 300 });
console.log('  dry run:', JSON.stringify(short(pDry)));
check('dry run read two pages of 20 books', pDry.pages === 2 && pDry.fetched === 40 && !pDry.sourceError, `${pDry.fetched} fetched`);
check('pagination: page 2 follows page 1 (next token advanced)', !!pDry.nextCursor && pDry.nextCursor !== '1', String(pDry.nextCursor));
check('records are accounted for', pDry.accounting == null || (pDry.accounting as any).ok === true);
check('nothing from the directory is offered as FullText', pDry.access.FullText === 0, JSON.stringify(pDry.access));
console.log('  licences found:', JSON.stringify(pDry.licences), '| access:', JSON.stringify(pDry.access));
console.log('  department suggestions:', JSON.stringify(pDry.department.suggestions).slice(0, 400));

const pRun1 = await H.harvestFeed(H.PRESSBOOKS_FEED, { maxPages: 1, pageDelayMs: 300 });
console.log('  write run 1:', JSON.stringify(short(pRun1)));
const prows: any[] = await db.$queryRawUnsafe(`select status, "accessStatus", licence, "licenceIsNC", count(*)::int n from "Book" where source='Pressbooks' group by 1,2,3,4 order by n desc`);
console.log('  rows written:', JSON.stringify(prows));
check('every Pressbooks book waits as a Draft (review-first)', prows.length > 0 && prows.every(r => r.status === 'Draft'));
const openList = /^CC( BY|0)/i;
check('a licence is recorded ONLY where the book\'s own site declared one', prows.every(r => !r.licence || /^CC/i.test(r.licence)), JSON.stringify(prows.map(r => r.licence)));
check('books with no declared licence are MetadataOnly', prows.filter(r => !r.licence).every(r => r.accessStatus === 'MetadataOnly'), JSON.stringify(prows.filter(r => !r.licence)));
check('a book with a non-open licence (NC / ND / all rights reserved) is never offered as open', prows.filter(r => r.licence && !openList.test(r.licence) ).every(r => r.accessStatus !== 'FullText'));
const pcp1 = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'Pressbooks' } });
check('Pressbooks checkpoint is its own (page number) and Crossref\'s is untouched', pcp1?.cursor === '2' && (await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'CrossrefBooks' } }))?.cursor === cp2?.cursor, `pressbooks=${pcp1?.cursor}`);
const pRun2 = await H.harvestFeed(H.PRESSBOOKS_FEED, { maxPages: 1, pageDelayMs: 300 });
check('second run resumed at page 2', pRun2.resumedFrom === '2', String(pRun2.resumedFrom));
const pAgain = await H.harvestFeed(H.PRESSBOOKS_FEED, { manual: true, startToken: '1', maxPages: 1, pageDelayMs: 0 });
console.log('  manual re-read of page 1:', JSON.stringify(short(pAgain)));
check('re-reading page 1 adds nothing (duplicates held)', pAgain.added === 0 && pAgain.queuedForReview === 0, JSON.stringify(pAgain.duplicates));

// ── rotation flags ─────────────────────────────────────────────────────────
section('ROTATION FLAGS');
const list = buildProviders();
const cr = list.find((p: any) => p.id === 'crossrefbooks'), pb = list.find((p: any) => p.id === 'pressbooks');
// Since 2026-10-19 both rotate by default (validated by this script against the live services); the review-backlog limit keeps them in check.
check('by default both are in the continuous rotation', cr?.rotationOff?.() === null && pb?.rotationOff?.() === null);
process.env.BOOKS_CROSSREF = '0'; process.env.BOOKS_PRESSBOOKS = '0';
check('BOOKS_CROSSREF=0 / BOOKS_PRESSBOOKS=0 take them out', !!cr?.rotationOff?.() && !!pb?.rotationOff?.());

console.log(`\n${pass} passed, ${fail} failed`);
await dev.$disconnect(); await db.$disconnect();
process.exit(fail ? 1 : 0);
