/**
 * Bounded, READ-ONLY dry run of OpenAlex journal discovery against the database named in .env.
 *
 *   npx tsx scripts/openalex-journals-bounded.ts 100            # first 100 sources
 *   npx tsx scripts/openalex-journals-bounded.ts 1000 [cache-dir]
 *
 * It reads pages from OpenAlex (`type:journal,is_oa:true,has_issn:true`, by cursor, 100 a page), plans every candidate against the held
 * catalogue and asks DOAJ about new tier-A candidates — and writes NOTHING: the database handle it hands the planner can only read. The limit is
 * capped at 5,000. Pages are cached in the cache directory, so a repeat run costs no OpenAlex credits.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const limit = Math.min(5000, Math.max(100, Number(process.argv[2]) || 100));
const cache = process.argv[3] || '';
if (cache) mkdirSync(cache, { recursive: true });

const { ingestionDb } = await import('../src/lib/ingestion/db.js');
const O = await import('../src/lib/ingestion/openAlexJournals.js');

// The planner only ever reads. Anything else is refused here, not trusted to be unused.
const readOnly: any = {
  journal: { findMany: (a: any) => ingestionDb.journal.findMany(a) },
  $queryRawUnsafe: (sql: string, ...p: any[]) => { if (!/^\s*select\b/i.test(sql)) throw new Error('read-only run refused a non-select'); return ingestionDb.$queryRawUnsafe(sql, ...p); },
};
const heldBefore = await ingestionDb.journal.count();
const heldByStatus = await ingestionDb.journal.groupBy({ by: ['status'], _count: true });

const doajCache = new Map<string, any>();
const verify: any = async (issns: string[]) => {
  const k = issns.join('|');
  if (!doajCache.has(k)) doajCache.set(k, await O.verifyWithDoaj(issns));
  return doajCache.get(k);
};

let cursor: string | null = null; let page = 0; let total: number | null = null;
const all = O.zeroCounters(); const samples: Record<string, string[]> = { newStrong: [], newReview: [], conflict: [], unassigned: [] };
const per100: any[] = [];
const decisionsAll: any[] = [];
while (all.checked < limit) {
  const file = cache ? `${cache}/page-${page}.json` : '';
  let pg: any;
  if (file && existsSync(file)) pg = JSON.parse(readFileSync(file, 'utf8'));
  else {
    // No key needed for the first 10,000 by basic page number; the walk itself uses the cursor and does need one.
    pg = await O.fetchJournalSourcesBasicPage(page + 1, 100);
    if (file) writeFileSync(file, JSON.stringify(pg));
    await new Promise(r => setTimeout(r, 400));
  }
  total = pg.total ?? total;
  const decisions = await O.planPage(pg.candidates, { db: readOnly, verify });
  const c = O.summarise(decisions, pg);
  O.addCounters(all, c); decisionsAll.push(...decisions);
  per100.push({ page: page + 1, checked: c.checked, existing: c.existing, newStrong: c.newStrong, newReview: c.newReview, conflicts: c.conflicts });
  for (const d of decisions) {
    if (d.kind === 'new' && d.cand.tier === 'A' && samples.newStrong.length < 8) samples.newStrong.push(`${d.cand.title} [${d.cand.issnL}] → ${d.row.status}${d.doajConfirmed ? ' (DOAJ confirmed)' : ' (DOAJ did not confirm)'} · ${d.department ?? 'no department'}`);
    if (d.kind === 'new' && d.cand.tier === 'B' && samples.newReview.length < 8) samples.newReview.push(`${d.cand.title} [${d.cand.issnL}] → ${d.row.status} · ${d.department ?? 'no department'} · ${d.cand.publisherName ?? 'no publisher'}`);
    if (d.kind === 'new' && !d.department && samples.unassigned.length < 6) samples.unassigned.push(`${d.cand.title} (${d.cand.subjects.slice(0, 2).join('; ')})`);
  }
  cursor = pg.next; page++;
  if (!cursor) break;
}

const tiers = { A: 0, B: 0 } as Record<string, number>;
for (const d of decisionsAll) if (d.kind !== 'skip') tiers[d.cand.tier] = (tiers[d.cand.tier] || 0) + 1;
const dupBy = { issn: 0, title: 0 }; for (const d of decisionsAll) if (d.kind === 'duplicate') dupBy[d.by as 'issn' | 'title']++;
const enrichFields: Record<string, number> = {}; for (const d of decisionsAll) if (d.kind === 'duplicate' && !d.conflict) for (const k of Object.keys(d.enrich)) enrichFields[k] = (enrichFields[k] || 0) + 1;
const heldAfter = await ingestionDb.journal.count();
console.log(JSON.stringify({
  query: `/sources?filter=${O.OA_FILTER}&per-page=100&cursor=*`, totalInOpenAlex: total, requested: limit, pagesRead: page,
  journalsHeldBefore: heldBefore, heldByStatus: Object.fromEntries(heldByStatus.map((g: any) => [g.status, g._count])),
  checked: all.checked, skipped: all.skipped, skippedReasons: all.skippedReasons,
  tiers, existing: all.existing, existingByIssn: dupBy.issn, existingByTitleOnly: dupBy.title,
  newStrongCandidates: all.newStrong, newStrongDoajConfirmed: all.newStrongConfirmed, newReviewCandidates: all.newReview,
  wouldCreate: { accepted: all.createdAccepted, metadataOnly: all.createdMetadataOnly, needsReview: all.createdNeedsReview },
  wouldEnrich: all.enriched, wouldEnrichFields: enrichFields, conflicts: all.conflicts, unassigned: all.unassigned,
  departmentDistributionOfNew: Object.fromEntries(Object.entries(all.byDepartment).sort((a, b) => b[1] - a[1])),
  samples: { ...samples, conflict: all.conflictSamples.slice(0, 8) },
  perPage: per100.length <= 12 ? per100 : undefined,
  journalsHeldAfter: heldAfter, wroteAnything: heldAfter !== heldBefore,
}, null, 2));
await ingestionDb.$disconnect();
