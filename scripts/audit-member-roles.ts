/**
 * READ-ONLY audit: what role and designation the institution members in the database hold, and where the two disagree.
 *
 *   npx tsx scripts/audit-member-roles.ts       # against DATABASE_URL (locally .env, or Coolify's environment)
 *
 * Writes nothing: it reads inside one READ ONLY transaction, so Postgres itself would refuse a write.
 *
 * "Role" here is `User.role`, the technical access class. Every member a librarian added carries 'Student' in it, whatever
 * their title, which is why the Admin Users table showed "Student" beside "Professor". Whether the newer `memberRole`
 * column exists yet is reported, and counted if it does.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { roleFromDesignation } from '../src/lib/memberRoles';

const prisma = new PrismaClient();
const url = new URL(process.env.DATABASE_URL || 'postgres://unset/unset');
const norm = (s: string | null) => String(s ?? '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
const table = (title: string, m: Map<string, number>) => {
  console.log(`\n${title}`);
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);
  if (!m.size) console.log('  (none)');
};

(async () => {
  console.log(`Database: ${url.hostname}:${url.port || '5432'}/${url.pathname.slice(1)}   (read-only)`);
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const col = await tx.$queryRawUnsafe(`SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='memberRole'`);
    const hasMemberRole = col.length > 0;
    const members: { id: string; email: string; role: string; designation: string | null; institutionId: string }[] =
      await tx.user.findMany({ where: { institutionId: { not: null } }, select: { id: true, email: true, role: true, designation: true, institutionId: true } });

    const byRole = new Map<string, number>(), studentBy = new Map<string, number>(), mismatch = new Map<string, number>();
    const instAccounts = new Map<string, number>(), instDesig = new Map<string, number>();
    let studentTotal = 0, mismatchTotal = 0, unsettled = 0, studentBlankDesig = 0;
    for (const m of members) {
      bump(byRole, m.role);
      if (m.role === 'Institution') { bump(instAccounts, m.institutionId); bump(instDesig, m.designation || '(blank)'); continue; }
      if (m.role !== 'Student') continue;
      studentTotal++;
      const d = (m.designation || '').trim();
      if (!d) { studentBlankDesig++; unsettled++; bump(studentBy, '(blank designation)'); continue; }
      const mapped = roleFromDesignation(d);
      bump(studentBy, d);
      if (mapped === 'Student') continue;
      if (mapped) {
        mismatchTotal++;
        const n = norm(d);
        bump(mismatch, n.includes('research') ? `Student + research designation ("${d}") → ${mapped}`
          : mapped === 'Librarian' ? `Student + Librarian → ${mapped}` : `Student + ${d} → ${mapped}`);
      } else { unsettled++; bump(mismatch, `Student + "${d}" → NEEDS REVIEW (no safe mapping)`); }
    }

    console.log('\n=== Institution members ===');
    console.log(`  Total institution members (institutionId set): ${members.length}`);
    table('By technical role (User.role)', byRole);
    console.log(`\n=== Members whose technical role is Student: ${studentTotal} ===`);
    table('By designation', studentBy);
    console.log(`\n=== Role/designation disagreements ===`);
    console.log(`  Student role, designation says something else, safe mapping exists: ${mismatchTotal}`);
    console.log(`  Student role, designation blank or without a safe mapping (needs review): ${unsettled} (blank: ${studentBlankDesig})`);
    table('Breakdown', mismatch);
    const multi = [...instAccounts.values()].filter(n => n > 1).length;
    console.log(`\n=== Institution accounts (technical role Institution) ===`);
    console.log(`  ${[...instAccounts.values()].reduce((a, b) => a + b, 0)} accounts across ${instAccounts.size} institutions; ${multi} institutions have more than one.`);
    table('Their designations (shown as "Institution Admin" in role; the title is unchanged)', instDesig);

    console.log(`\n=== memberRole column ===`);
    if (!hasMemberRole) console.log('  Not in this database yet (schema not pushed). Nothing is saved; roles are shown from designation where it settles them.');
    else {
      const rows: { memberRole: string | null; n: bigint }[] = await tx.$queryRawUnsafe(`SELECT "memberRole", COUNT(*)::bigint AS n FROM "User" WHERE "institutionId" IS NOT NULL GROUP BY 1`);
      for (const r of rows) console.log(`  ${String(r.n).padStart(6)}  ${r.memberRole ?? '(not set)'}`);
    }
    console.log('\nNothing was modified.');
  });
})().catch(e => { console.error('Audit failed:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
