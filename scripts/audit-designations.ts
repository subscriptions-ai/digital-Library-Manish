/**
 * READ-ONLY audit: every user's account type and professional designation, and how the pair reads.
 *
 *   npx tsx scripts/audit-designations.ts                 # summary, against DATABASE_URL (locally .env, or Coolify's environment)
 *   npx tsx scripts/audit-designations.ts --list          # also one line per user whose pair is not Standard
 *   npx tsx scripts/audit-designations.ts --csv out.csv   # every user, as a file (User, Email, Account Type, Professional Designation, Classification)
 *
 * Writes nothing to the database: it reads inside one READ ONLY transaction, so Postgres itself would refuse a write. `--csv` writes a file on this
 * machine and nothing else. No record is changed, corrected or deleted by this script or because of what it reports.
 *
 * Account type is `User.memberRole` (Faculty, Researcher, Student), or Institution Admin for an institution's own account. It is never read off the
 * designation. The classes:
 *   Standard                  the title is suggested for this account type
 *   Cross-category but valid  a standard title from another list (a Researcher whose title is Associate Professor): real, and left alone
 *   Custom                    written in; not in any list
 *   Missing designation       none on record
 *   Needs review              no account type on record, or text that would not be accepted today (markup, over 100 characters)
 * Staff accounts and accounts that belong to no institution (individuals) have no account type; they are reported under "No account type".
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { classifyDesignation, effectiveAccessRole, type DesignationClass } from '../src/lib/memberRoles';

const prisma = new PrismaClient();
const url = new URL(process.env.DATABASE_URL || 'postgres://unset/unset');
const args = process.argv.slice(2);
const list = args.includes('--list');
const csvAt = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null;
const STAFF = new Set(['SuperAdmin', 'Admin', 'ContentManager', 'SubscriptionManager', 'SalesExecutive', 'SalesManager', 'Publisher']);
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
const q = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

(async () => {
  console.log(`Database: ${url.hostname}:${url.port || '5432'}/${url.pathname.slice(1)}   (read-only)`);
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const col = await tx.$queryRawUnsafe(`SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='memberRole'`);
    const hasMemberRole = col.length > 0;
    const users: any[] = await tx.user.findMany({
      select: { id: true, displayName: true, email: true, role: true, designation: true, institutionId: true, registrantType: true, ...(hasMemberRole ? { memberRole: true } : {}) },
      orderBy: { createdAt: 'asc' },
    });

    const byClass = new Map<DesignationClass | 'No account type', number>();
    const crossPairs = new Map<string, number>(), customTitles = new Map<string, number>();
    const rows: { name: string; email: string; accountType: string; designation: string; cls: string }[] = [];
    for (const u of users) {
      const staff = STAFF.has(u.role);
      const accountType = staff ? '' : (effectiveAccessRole(u).role || '');
      // Staff and individuals (no institution) have no account type to compare against: they are counted, and left out of the classification.
      const cls = staff || (!u.institutionId && !accountType) ? 'No account type' : classifyDesignation(accountType, u.designation);
      bump(byClass, cls as any);
      if (cls === 'Cross-category but valid') bump(crossPairs, `${accountType} + ${u.designation}`);
      if (cls === 'Custom') bump(customTitles, String(u.designation));
      rows.push({ name: u.displayName || '', email: u.email, accountType, designation: u.designation || '', cls });
    }

    console.log(`\nUsers: ${users.length}${hasMemberRole ? '' : '   (the memberRole column does not exist in this database yet: every account type below reads as none)'}`);
    console.log('\nBy classification');
    for (const [k, v] of [...byClass.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(7)}  ${k}`);
    const top = (title: string, m: Map<string, number>, n = 15) => {
      console.log(`\n${title}`);
      const e = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
      for (const [k, v] of e) console.log(`  ${String(v).padStart(7)}  ${k}`);
      if (!e.length) console.log('  (none)');
    };
    top('Cross-category pairs (valid; nothing is changed)', crossPairs);
    top('Most common written-in titles', customTitles);

    if (list) {
      console.log('\nNot Standard');
      for (const r of rows.filter(r => r.cls !== 'Standard' && r.cls !== 'No account type')) console.log(`  ${r.cls.padEnd(26)} ${r.email}  [${r.accountType || '—'}]  ${r.designation || '(none)'}`);
    }
    if (csvAt) {
      writeFileSync(csvAt, '﻿' + ['User', 'Email', 'Account Type', 'Professional Designation', 'Classification'].join(',') + '\n'
        + rows.map(r => [r.name, r.email, r.accountType, r.designation, r.cls].map(q).join(',')).join('\n') + '\n');
      console.log(`\nWrote ${rows.length} rows to ${csvAt}`);
    }
    console.log('\nNothing was changed.');
  });
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
