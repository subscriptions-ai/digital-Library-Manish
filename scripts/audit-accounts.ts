/**
 * Read-only account inventory: counts by role and status, whether each account has a password credential, and the staff accounts by email.
 *
 * It never prints a password, a hash, a token or any part of one. Credential presence is decided in SQL (`password ~ '^\$2[aby]\$'`) and only the
 * counts come back. It writes nothing.
 *
 *   npx tsx scripts/audit-accounts.ts            # summary + staff table
 *   npx tsx scripts/audit-accounts.ts --all      # also every account (email, role, status), no secrets
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const STAFF = ['SuperAdmin', 'Admin', 'ContentManager', 'SubscriptionManager', 'SalesExecutive', 'SalesManager', 'Publisher'];
const prisma = new PrismaClient();
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

async function main() {
  const total = await prisma.user.count();
  const byRole = await prisma.user.groupBy({ by: ['role'], _count: { _all: true }, orderBy: { role: 'asc' } });
  const byStatus = await prisma.user.groupBy({ by: ['status'], _count: { _all: true } });
  const blocked = await prisma.user.count({ where: { isBlocked: true } });
  const verified = await prisma.user.count({ where: { emailVerifiedAt: { not: null } } });
  const [cred] = await prisma.$queryRaw<{ bcrypt: number; empty: number; demo: number; other: number }[]>`
    SELECT count(*) FILTER (WHERE password ~ '^\\$2[aby]\\$[0-9]{2}\\$')::int AS bcrypt,
           count(*) FILTER (WHERE password IS NULL OR password = '')::int AS empty,
           count(*) FILTER (WHERE password = 'demo-account-not-for-sign-in')::int AS demo,
           count(*) FILTER (WHERE password IS NOT NULL AND password <> '' AND password <> 'demo-account-not-for-sign-in' AND password !~ '^\\$2[aby]\\$[0-9]{2}\\$')::int AS other
    FROM "User"`;
  const [{ n: notNormalised }] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "User" WHERE email <> lower(trim(email))`;
  const [{ n: caseDuplicates }] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM (SELECT lower(trim(email)) FROM "User" GROUP BY 1 HAVING count(*) > 1) x`;

  console.log(`\nACCOUNTS  total ${total} · active ${total - blocked - (byStatus.find(s => s.status !== 'Active') ? byStatus.filter(s => s.status !== 'Active').reduce((a, s) => a + s._count._all, 0) : 0)} · blocked ${blocked} · verified ${verified} · unverified ${total - verified}`);
  console.log('STATUS    ' + byStatus.map(s => `${s.status}: ${s._count._all}`).join(' · '));
  console.log('ROLES     ' + byRole.map(r => `${r.role}: ${r._count._all}`).join(' · '));
  console.log(`PASSWORD  bcrypt hash: ${cred.bcrypt} · none: ${cred.empty} · demo marker (cannot sign in): ${cred.demo} · other non-hash: ${cred.other}${cred.other ? '  <-- CRITICAL: possible plaintext' : ''}`);
  console.log(`EMAILS    not lower-case/trimmed: ${notNormalised} · addresses that collide when lower-cased: ${caseDuplicates}`);

  const staff = await prisma.user.findMany({
    where: { role: { in: STAFF } },
    select: { email: true, displayName: true, role: true, status: true, isBlocked: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  console.log(`\nSTAFF ACCOUNTS (${staff.length})`);
  console.table(staff.map(u => ({ email: u.email, name: u.displayName ?? '', role: u.role, status: u.isBlocked ? 'Blocked' : u.status, verified: !!u.emailVerifiedAt, created: day(u.createdAt), lastLogin: day(u.lastLoginAt) })));

  if (process.argv.includes('--all')) {
    const all = await prisma.user.findMany({
      select: { email: true, displayName: true, role: true, status: true, isBlocked: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true, institution: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    console.table(all.map(u => ({ email: u.email, name: u.displayName ?? '', role: u.role, status: u.isBlocked ? 'Blocked' : u.status, verified: !!u.emailVerifiedAt, created: day(u.createdAt), lastLogin: day(u.lastLoginAt), institution: u.institution?.name ?? '' })));
  }
}

main().catch(e => { console.error(e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
