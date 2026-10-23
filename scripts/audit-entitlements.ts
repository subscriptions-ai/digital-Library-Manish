/**
 * READ-ONLY. Shows what the department-entitlement rules (src/server/entitlements.ts) mean for the accounts in a database, before
 * they are deployed against it: who keeps access, who is narrowed to their chosen departments, and who would have NO department.
 * Writes nothing.
 *
 *   npx tsx scripts/audit-entitlements.ts                       # the database in .env
 *   DATABASE_URL=postgres://… npx tsx scripts/audit-entitlements.ts   # another one (production: run it from a machine that can reach it)
 */
import { readFileSync } from 'node:fs';

if (!process.env.DATABASE_URL) {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  process.env.DATABASE_URL = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
}
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const { loadEntitlement, STAFF_FULL_ACCESS_ROLES } = await import('../src/server/entitlements.js');

console.log('database:', String(process.env.DATABASE_URL).replace(/:\/\/[^@]*@/, '://***@'));
const users: any[] = await db.user.findMany({ select: { id: true, email: true, role: true, institutionId: true, interestedDomains: true } });
const instNames = new Map((await db.institution.findMany({ select: { id: true, name: true } })).map((i: any) => [i.id, i.name]));

const tally: Record<string, number> = { staff: 0, explicitAll: 0, byPlan: 0, byChoice: 0, noAccess: 0 };
const noAccessByRole: Record<string, number> = {};
const noAccessByInstitution = new Map<string, number>();
const noAccessIndividuals: string[] = [];
for (const u of users) {
  if (STAFF_FULL_ACCESS_ROLES.includes(u.role)) { tally.staff++; continue; }
  const e = await loadEntitlement(db as any, { uid: u.id, role: u.role, institutionId: u.institutionId });
  if (e.all) tally.explicitAll++;
  else if (!e.departments.length) {
    tally.noAccess++; noAccessByRole[u.role] = (noAccessByRole[u.role] || 0) + 1;
    if (u.institutionId) noAccessByInstitution.set(u.institutionId, (noAccessByInstitution.get(u.institutionId) || 0) + 1);
    else if (['Subscriber', 'Student', 'Institution'].includes(u.role)) noAccessIndividuals.push(`${u.email} (${u.role})`);
  } else if (e.source === 'subscription' || e.source === 'institution-subscription') tally.byPlan++;
  else tally.byChoice++;
}
console.log('\naccounts:', users.length);
console.log({ staffSeeEverything: tally.staff, explicitAllDepartmentsPlan: tally.explicitAll, scopedByPlan: tally.byPlan, scopedByChosenDepartments: tally.byChoice, wouldHaveNoDepartment: tally.noAccess });
console.log('\nwould have NO department, by role:', noAccessByRole);
if (noAccessByInstitution.size) {
  console.log('\n…of which belong to an institution that has neither a plan nor any chosen departments:');
  for (const [id, n] of [...noAccessByInstitution].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(4)}  ${instNames.get(id) || id}`);
}
if (noAccessIndividuals.length) console.log('\nindividual accounts with no department chosen and no plan (first 25):\n  ' + noAccessIndividuals.slice(0, 25).join('\n  '));
const emptyPlans: any[] = await db.subscription.findMany({ where: { status: 'Active', endDate: { gt: new Date() } }, select: { id: true, domains: true, domainName: true, userId: true, institutionId: true } });
const unlisted = emptyPlans.filter(s => !(Array.isArray(s.domains) ? s.domains.length : 0) && !String(s.domainName || '').trim());
const allDomains = emptyPlans.filter(s => !(Array.isArray(s.domains) ? s.domains.length : 0) && /^all domains?$/i.test(String(s.domainName || '').trim()));
console.log(`\nactive plans: ${emptyPlans.length} · naming "All Domains": ${allDomains.length} · naming no department at all (applies to the account's chosen departments): ${unlisted.length}`);
await db.$disconnect();
