#!/usr/bin/env node
/**
 * Recompute the counters every shelf page is gated on.
 *
 *   node scripts/recount-journals.cjs            # report only
 *   node scripts/recount-journals.cjs --apply    # write them
 *
 * Journal.articleCount, volumeCount, issueCount, firstYear and lastYear are
 * denormalised from Article. Two writers maintain them — the ingestion worker
 * for journals it discovers, and build-own-catalogue for the original
 * catalogue — and where neither has run they sit at zero.
 *
 * That is not cosmetic. Five pages filter on `articleCount > 0`: the department
 * page, the publisher page, the subject page, the subject list and the library
 * statistics. Where the counter is zero those pages report that we hold nothing,
 * on a catalogue of nearly thirty thousand articles.
 *
 * Safe to run at any time and safe to run twice: it only writes journals whose
 * stored numbers differ from the ones computed from Article, and it never
 * touches an article.
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? 'Applying.\n' : 'Report only — nothing will be written. Add --apply to write.\n');

  const journals = await p.journal.findMany({
    select: { id: true, issn: true, title: true, articleCount: true, volumeCount: true, issueCount: true, firstYear: true, lastYear: true },
  });

  // One pass over the articles rather than a query per journal.
  // Keyed on journalId, not on the ISSN. Every published article carries a
  // journalId; only 81% carry an ISSN, so matching on the ISSN silently drops
  // 81 journals and 5,690 articles.
  const rows = await p.$queryRawUnsafe(`
    select "journalId" as jid,
           count(*)::int                                as articles,
           count(distinct nullif("volume",''))::int     as volumes,
           count(distinct nullif("volume",'') || '|' || coalesce(nullif("issue",''),''))::int as issues,
           min("year")::int as first_year,
           max("year")::int as last_year
    from "Article"
    where status = 'Published' and "journalId" is not null
    group by 1`);

  const byId = new Map(rows.map(r => [r.jid, r]));

  const changes = [];
  for (const j of journals) {
    const r = byId.get(j.id) || null;
    const next = {
      articleCount: r ? Number(r.articles) : 0,
      volumeCount: r ? Number(r.volumes) : 0,
      issueCount: r ? Number(r.issues) : 0,
      firstYear: r?.first_year ?? null,
      lastYear: r?.last_year ?? null,
    };
    const differs =
      j.articleCount !== next.articleCount ||
      j.volumeCount !== next.volumeCount ||
      j.issueCount !== next.issueCount ||
      (j.firstYear ?? null) !== (next.firstYear ?? null) ||
      (j.lastYear ?? null) !== (next.lastYear ?? null);
    if (differs) changes.push({ j, next });
  }

  const wasZero = changes.filter(c => c.j.articleCount === 0 && c.next.articleCount > 0);

  console.log('journals                     :', journals.length);
  console.log('  counters already correct   :', journals.length - changes.length);
  console.log('  need updating              :', changes.length);
  console.log('  currently reading 0 but do hold articles:', wasZero.length);
  console.log('');
  if (wasZero.length) {
    console.log('  These are the journals every shelf page is currently hiding:');
    wasZero.slice(0, 8).forEach(c =>
      console.log('     %s  ->  %d articles'.replace('%s', (c.j.title || '').slice(0, 48).padEnd(48)).replace('%d', c.next.articleCount)));
    if (wasZero.length > 8) console.log('     …and', wasZero.length - 8, 'more');
    console.log('');
  }

  const totalAfter = changes.reduce((n, c) => n + c.next.articleCount, 0) +
    journals.filter(j => !changes.find(c => c.j.id === j.id)).reduce((n, j) => n + j.articleCount, 0);
  console.log('journals holding articles after this run:',
    journals.filter(j => {
      const c = changes.find(x => x.j.id === j.id);
      return (c ? c.next.articleCount : j.articleCount) > 0;
    }).length);
  console.log('articles accounted for                  :', totalAfter);

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply.');
    await p.$disconnect();
    return;
  }

  let n = 0;
  for (const c of changes) {
    await p.journal.update({ where: { id: c.j.id }, data: c.next });
    n++;
  }
  console.log(`\nUpdated ${n} journals.`);
  await p.$disconnect();
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
