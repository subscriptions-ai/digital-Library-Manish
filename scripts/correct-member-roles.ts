/**
 * Give existing institution members the role their designation settles. DRY RUN unless told otherwise.
 *
 *   npx tsx scripts/correct-member-roles.ts                                  # dry run: prints the proposal, writes nothing
 *   npx tsx scripts/correct-member-roles.ts --apply --confirm-db=<database>  # writes `memberRole` for the proposed rows
 *   npx tsx scripts/correct-member-roles.ts --rollback=<file>                # clears `memberRole` on the rows a run wrote
 *
 * What it will and will not do:
 *  - It writes ONE column, `User.memberRole`, and only where it is empty. It never touches `role` (the technical access
 *    class), the designation, the institution, subscriptions, sessions, reading history or the password.
 *  - It proposes a role only when the designation settles it (Professor, Associate Professor, Assistant Professor,
 *    Lecturer, Senior Lecturer, Faculty → Faculty; Research Scholar/Associate/Fellow, Researcher → Researcher;
 *    Student → Student; Librarian → Librarian). Everything else is listed as NEEDS REVIEW and left alone.
 *  - Institution accounts are skipped: they are shown as Institution Admin from their technical role.
 *  - --apply needs the database name typed back, prints it first, and saves a rollback file beside this script's output.
 *    Take `npm run backup` first on production.
 */
import 'dotenv/config';
import { writeFileSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { roleFromDesignation } from '../src/lib/memberRoles';

const prisma = new PrismaClient();
const url = new URL(process.env.DATABASE_URL || 'postgres://unset/unset');
const dbName = url.pathname.slice(1);
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const flag = (n: string) => process.argv.includes(`--${n}`);

(async () => {
  console.log(`Database: ${url.hostname}:${url.port || '5432'}/${dbName}`);
  const col = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='memberRole'`);
  if (!col.length) { console.error('The memberRole column is not in this database. Push the schema first (prisma db push).'); process.exitCode = 1; return; }

  const rollback = arg('rollback');
  if (rollback) {
    const ids: string[] = JSON.parse(readFileSync(rollback, 'utf8')).ids;
    const r = await prisma.$executeRawUnsafe(`UPDATE "User" SET "memberRole" = NULL WHERE id = ANY($1::text[])`, ids);
    console.log(`Rolled back: memberRole cleared on ${r} of ${ids.length} rows.`);
    return;
  }

  const rows = await prisma.$queryRawUnsafe<{ id: string; email: string; role: string; designation: string | null; memberRole: string | null }[]>(
    `SELECT id, email, role, designation, "memberRole" FROM "User" WHERE "institutionId" IS NOT NULL AND role <> 'Institution' ORDER BY email`);

  const proposals: { id: string; email: string; role: string; designation: string; proposed: string; reason: string }[] = [];
  const review: { id: string; email: string; designation: string | null }[] = [];
  let alreadySet = 0;
  for (const u of rows) {
    if (u.memberRole) { alreadySet++; continue; }
    const mapped = roleFromDesignation(u.designation);
    if (mapped) proposals.push({ id: u.id, email: u.email, role: u.role, designation: u.designation!, proposed: mapped,
      reason: mapped === 'Librarian' ? `designation "${u.designation}" settles Librarian (this is a member, not the institution account)` : `designation "${u.designation}" settles ${mapped}` });
    else review.push({ id: u.id, email: u.email, designation: u.designation });
  }

  console.log(`\nMembers considered (institution members, not the institution account): ${rows.length}`);
  console.log(`  already have a memberRole (left alone): ${alreadySet}`);
  console.log(`  proposed: ${proposals.length}`);
  console.log(`  needs review, NOT changed: ${review.length}\n`);
  console.log('User ID\tEmail\tCurrent role\tDesignation\tProposed role\tReason');
  for (const p of proposals) console.log([p.id, p.email, p.role, p.designation, p.proposed, p.reason].join('\t'));
  if (review.length) {
    console.log('\nNeeds review (no safe mapping):');
    const by = new Map<string, number>();
    for (const r of review) by.set(r.designation?.trim() || '(blank)', (by.get(r.designation?.trim() || '(blank)') || 0) + 1);
    for (const [k, v] of [...by.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);
  }

  if (!flag('apply')) { console.log('\nDRY RUN: nothing was written. To apply: --apply --confirm-db=' + dbName); return; }
  if (arg('confirm-db') !== dbName) { console.error(`\nRefusing to apply: type the database name back with --confirm-db=${dbName}`); process.exitCode = 1; return; }
  if (!proposals.length) { console.log('\nNothing to apply.'); return; }

  const file = `member-roles-applied-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ database: dbName, appliedAt: new Date().toISOString(), ids: proposals.map(p => p.id), rows: proposals }, null, 2));
  let written = 0;
  await prisma.$transaction(async (tx: any) => {
    for (const p of proposals) {
      written += await tx.$executeRawUnsafe(`UPDATE "User" SET "memberRole" = $1 WHERE id = $2 AND "memberRole" IS NULL`, p.proposed, p.id);
    }
  });
  console.log(`\nApplied: memberRole written on ${written} rows. Rollback file: ${file}  (npx tsx scripts/correct-member-roles.ts --rollback=${file})`);
})().catch(e => { console.error('Failed:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
