// Turns our own content into a browsable catalogue: real Journal records, real
// Author records, and the rights fields filled in for material we own.
//
// We are the rights holder for everything with source='Admin', so the licence
// gate does not apply — these are marked Accepted and keep their full text.
//
// Authors arrive as one comma-separated string, so they are grouped by
// normalised name. That occasionally splits one person or merges two, which is
// why identitySource records how the identity was arrived at. Every name
// becomes clickable regardless: half-interactive reads as broken software.
//
// Reports by default. Only writes with --apply. Safe to re-run.
//
//   node scripts/build-own-catalogue.cjs
//   node scripts/build-own-catalogue.cjs --apply
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const OUR_RIGHTS = {
  licence: 'Publisher terms (our own)',
  licenceIsNC: false,
  rightsBasis: 'our own',
  status: 'Accepted',
};

const norm = (s) => String(s || '').trim().toLowerCase()
  .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

/** "Neetu Gupta, Munish Vashishath" → ["Neetu Gupta", "Munish Vashishath"] */
function splitAuthors(raw) {
  return String(raw || '')
    .split(/[,;]/)
    .map(a => a.trim())
    .filter(a => a.length > 1 && a.length < 120);
}

(async () => {
  const mode = APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written';
  console.log(`${mode}\n`);

  // ── 1. Journals that exist only as a name on their articles ──────────────
  const orphanNames = await prisma.$queryRawUnsafe(`
    select a."journalName" as name,
           max(a.domain) as domain,
           max(a."publisherName") as publisher,
           count(*)::int as articles,
           min(a.year) as first_year,
           max(a.year) as last_year
    from "Article" a
    where a."journalId" is null and a."journalName" is not null and a."journalName" <> ''
    group by a."journalName" order by 4 desc`);

  console.log(`Journals missing a record: ${orphanNames.length}`);
  for (const j of orphanNames.slice(0, 5)) {
    console.log(`   ${String(j.articles).padStart(5)}  ${j.name}`);
  }
  if (orphanNames.length > 5) console.log(`   … and ${orphanNames.length - 5} more`);

  let created = 0, linked = 0;
  if (APPLY) {
    for (const j of orphanNames) {
      const existing = await prisma.journal.findFirst({ where: { title: j.name } });
      const journal = existing || await prisma.journal.create({
        data: {
          title: j.name, domain: j.domain, publisherName: j.publisher,
          firstYear: j.first_year, lastYear: j.last_year, ...OUR_RIGHTS,
          rightsVerifiedAt: new Date(), rightsVerifiedBy: 'build-own-catalogue',
        },
      });
      if (!existing) created++;
      const r = await prisma.article.updateMany({
        where: { journalId: null, journalName: j.name },
        data: { journalId: journal.id },
      });
      linked += r.count;
    }
  }
  console.log(`${APPLY ? `Created ${created} journals, linked ${linked} articles` : 'Would create these and link their articles'}\n`);

  // ── 2. Rights and access status on everything we own ─────────────────────
  const ownArticles = await prisma.article.count({ where: { source: 'Admin' } });
  const withPdf = await prisma.article.count({
    where: { source: 'Admin', pdfUrl: { not: null } },
  });
  console.log(`Our own articles: ${ownArticles}   with a file: ${withPdf}`);

  if (APPLY) {
    await prisma.article.updateMany({
      where: { source: 'Admin', pdfUrl: { not: null } },
      data: { accessStatus: 'ViewableHere', licence: OUR_RIGHTS.licence, licenceIsNC: false, parentKind: 'Journal' },
    });
    await prisma.article.updateMany({
      where: { source: 'Admin', pdfUrl: null },
      data: { accessStatus: 'MetadataOnly', licence: OUR_RIGHTS.licence, licenceIsNC: false, parentKind: 'Journal' },
    });
    await prisma.journal.updateMany({
      where: { status: 'MetadataOnly' },
      data: { ...OUR_RIGHTS, rightsVerifiedAt: new Date(), rightsVerifiedBy: 'build-own-catalogue' },
    });
    console.log('Marked accepted, full text preserved for everything with a file\n');
  } else {
    console.log(`Would mark ${withPdf} ViewableHere and ${ownArticles - withPdf} MetadataOnly\n`);
  }

  // ── 3. Authors ───────────────────────────────────────────────────────────
  const rows = await prisma.article.findMany({
    where: { authors: { not: null } },
    select: { id: true, authors: true },
  });
  const names = new Map();            // normalised → display name
  let links = 0;
  for (const r of rows) {
    for (const a of splitAuthors(r.authors)) {
      const k = norm(a);
      if (k && !names.has(k)) names.set(k, a);
      if (k) links++;
    }
  }
  console.log(`Distinct authors: ${names.size}   author credits to record: ${links}`);

  if (APPLY) {
    // Load what already exists, create only what is missing, then link.
    // findFirst per author would be 43k round trips; this is two passes.
    const existing = await prisma.author.findMany({ select: { id: true, nameNormalised: true } });
    const ids = new Map(existing.map(a => [a.nameNormalised, a.id]));

    const missing = [...names.entries()]
      .filter(([k]) => !ids.has(k))
      .map(([k, display]) => ({ name: display, nameNormalised: k, identitySource: 'NameMatch' }));

    for (let i = 0; i < missing.length; i += 1000) {
      await prisma.author.createMany({ data: missing.slice(i, i + 1000), skipDuplicates: true });
      console.log(`   authors  ${Math.min(i + 1000, missing.length)}/${missing.length}`);
    }
    for (const a of await prisma.author.findMany({ select: { id: true, nameNormalised: true } })) {
      ids.set(a.nameNormalised, a.id);
    }
    console.log(`Created ${missing.length} authors`);

    let made = 0, i = 0;
    for (const r of rows) {
      const list = splitAuthors(r.authors);
      const data = list.map((a, pos) => ({ articleId: r.id, authorId: ids.get(norm(a)), position: pos }))
                       .filter(x => x.authorId);
      if (data.length) {
        await prisma.articleAuthor.createMany({ data, skipDuplicates: true });
        made += data.length;
      }
      if (++i % 5000 === 0) console.log(`   linking  ${i}/${rows.length}`);
    }
    console.log(`Recorded ${made} author credits`);

    const counts = await prisma.$queryRawUnsafe(
      `select "authorId" id, count(*)::int c from "ArticleAuthor" group by 1`);
    for (const c of counts) {
      await prisma.author.update({ where: { id: c.id }, data: { articleCount: c.c } }).catch(() => {});
    }
    console.log('Author counts refreshed\n');
  } else {
    console.log('Would create these authors and their credits\n');
  }

  // ── 4. Roll coverage up onto each journal ────────────────────────────────
  if (APPLY) {
    const stats = await prisma.$queryRawUnsafe(`
      select "journalId" id, count(*)::int articles,
             count(distinct volume)::int volumes, count(distinct issue)::int issues,
             min(year) first_year, max(year) last_year
      from "Article" where "journalId" is not null group by 1`);
    for (const s of stats) {
      await prisma.journal.update({
        where: { id: s.id },
        data: {
          articleCount: s.articles, volumeCount: s.volumes, issueCount: s.issues,
          firstYear: s.first_year, lastYear: s.last_year, lastIngestedAt: new Date(),
        },
      }).catch(() => {});
    }
    console.log(`Coverage rolled up onto ${stats.length} journals`);
  }

  if (!APPLY) console.log('Re-run with --apply to write all of the above.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
