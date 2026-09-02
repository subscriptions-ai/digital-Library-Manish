// ISSNs arrived in three spellings of the same identifier: with spaces around
// the hyphen, with an en-dash instead of a hyphen, and clean. That silently
// breaks every lookup, every deduplication, and every attempt to match an
// incoming journal to one we already hold — a journal page simply 404s.
//
// Rewrites them to the canonical NNNN-NNNC. Anything that is not recognisably
// an ISSN is left exactly as it is rather than guessed at.
//
//   node scripts/normalise-issns.cjs           # report
//   node scripts/normalise-issns.cjs --apply   # write
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function normalise(raw) {
  if (!raw) return null;
  const t = String(raw).replace(/[‐-―]/g, '-').replace(/\s+/g, '').toUpperCase();
  const m = t.match(/^(\d{4})-?(\d{3}[\dX])$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

(async () => {
  console.log(APPLY ? 'APPLYING\n' : 'DRY RUN — nothing will be written\n');

  // ── Journals ────────────────────────────────────────────────────────────
  const journals = await prisma.journal.findMany({
    where: { OR: [{ issn: { not: null } }, { eissn: { not: null } }] },
    select: { id: true, title: true, issn: true, eissn: true },
  });
  let jFixed = 0, jUnrecognised = 0, jCollision = 0;
  for (const j of journals) {
    const issn = normalise(j.issn), eissn = normalise(j.eissn);
    const changed = (issn && issn !== j.issn) || (eissn && eissn !== j.eissn);
    if (j.issn && !issn) { jUnrecognised++; console.log(`  unrecognised  "${j.issn}"  ${j.title.slice(0, 44)}`); }
    if (!changed) continue;

    // issn is unique — another journal may already hold the clean form.
    if (issn && issn !== j.issn) {
      const clash = await prisma.journal.findFirst({ where: { issn, NOT: { id: j.id } }, select: { id: true } });
      if (clash) { jCollision++; console.log(`  collision     "${j.issn}" → ${issn} already held  ${j.title.slice(0, 40)}`); continue; }
    }
    jFixed++;
    if (APPLY) await prisma.journal.update({ where: { id: j.id }, data: { issn: issn || j.issn, eissn: eissn || j.eissn } });
  }
  console.log(`\nJournals ${APPLY ? 'fixed' : 'to fix'}: ${jFixed}   unrecognised: ${jUnrecognised}   collisions left alone: ${jCollision}`);

  // ── Articles ────────────────────────────────────────────────────────────
  const rows = await prisma.article.findMany({
    where: { journalIssn: { not: null } },
    select: { id: true, journalIssn: true },
  });
  const byValue = new Map();
  for (const r of rows) {
    const n = normalise(r.journalIssn);
    if (n && n !== r.journalIssn) {
      if (!byValue.has(r.journalIssn)) byValue.set(r.journalIssn, { to: n, ids: [] });
      byValue.get(r.journalIssn).ids.push(r.id);
    }
  }
  let aFixed = 0;
  for (const [from, { to, ids }] of byValue) {
    console.log(`  ${String(ids.length).padStart(5)}  "${from}" → ${to}`);
    aFixed += ids.length;
    if (APPLY) {
      for (let i = 0; i < ids.length; i += 500) {
        await prisma.article.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { journalIssn: to } });
      }
    }
  }
  console.log(`\nArticles ${APPLY ? 'fixed' : 'to fix'}: ${aFixed}`);
  if (!APPLY && (jFixed || aFixed)) console.log('\nRe-run with --apply to write these.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
