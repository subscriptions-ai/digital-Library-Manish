// Students created before the institution link was enforced were saved with no
// institutionId, which made them invisible in the institution dashboard — that
// list filters by institutionId. Their organization name was still recorded, so
// they can be matched back to an institution by name.
//
// Reports by default; only writes with --apply. Safe to re-run.
//
//   node scripts/relink-orphan-students.cjs
//   node scripts/relink-orphan-students.cjs --apply
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

(async () => {
  const orphans = await prisma.user.findMany({
    where: { role: 'Student', institutionId: null },
    select: { id: true, email: true, displayName: true, organization: true },
  });
  console.log(`Students with no institution link: ${orphans.length}`);
  if (!orphans.length) { await prisma.$disconnect(); return; }

  const institutions = await prisma.institution.findMany({ select: { id: true, name: true } });
  const byName = new Map();
  for (const i of institutions) {
    const k = norm(i.name);
    // A duplicate name is ambiguous — record it so we refuse rather than guess.
    byName.set(k, byName.has(k) ? 'AMBIGUOUS' : i.id);
  }

  let matched = 0, ambiguous = 0, unmatched = 0;
  for (const s of orphans) {
    const hit = byName.get(norm(s.organization));
    if (!hit) {
      unmatched++;
      console.log(`  no match      ${s.email}  organization="${s.organization || ''}"`);
      continue;
    }
    if (hit === 'AMBIGUOUS') {
      ambiguous++;
      console.log(`  ambiguous     ${s.email}  more than one institution named "${s.organization}" — link by hand`);
      continue;
    }
    matched++;
    console.log(`  ${APPLY ? 'linking' : 'would link'}  ${s.email}  →  ${s.organization}`);
    if (APPLY) await prisma.user.update({ where: { id: s.id }, data: { institutionId: hit } });
  }

  console.log(`\n${APPLY ? 'Linked' : 'Would link'}: ${matched}   Ambiguous: ${ambiguous}   No match: ${unmatched}`);
  if (!APPLY && matched) console.log('Re-run with --apply to write these.');
  if (ambiguous || unmatched) console.log('Anything not linked above still needs a decision — it is left untouched.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
