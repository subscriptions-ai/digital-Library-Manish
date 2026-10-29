/**
 * Isolated QA accounts for looking at the Content Library in a browser, one per reader role, on the throwaway database `stm_library_qa`
 * (a copy of the local development database). Refuses to run against anything else.
 *
 *   docker exec digital-library-manish-db-1 psql -U postgres -c "CREATE DATABASE stm_library_qa TEMPLATE stm_library"
 *   npx tsx scripts/qa-library-fixtures.ts <out.json>          # create (idempotent) and write one token per account
 *   npx tsx scripts/qa-library-fixtures.ts --remove            # delete everything this script made
 *
 * Every account is tagged @qa-library.invalid, so removal is exact. Nothing here touches the catalogue.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const QA_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_library_qa');
process.env.DATABASE_URL = QA_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_library_qa') throw new Error('refusing to run against anything but stm_library_qa');

const TAG = '@qa-library.invalid';
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const YEAR = new Date(Date.now() + 365 * 864e5);

async function remove() {
  const users = await db.user.findMany({ where: { email: { endsWith: TAG } }, select: { id: true } });
  const ids = users.map(u => u.id);
  const insts = await db.institution.findMany({ where: { name: { startsWith: 'QA Library ' } }, select: { id: true } });
  const iids = insts.map(i => i.id);
  await db.readingHistory.deleteMany({ where: { userId: { in: ids } } });
  await db.favorite.deleteMany({ where: { userId: { in: ids } } });
  await db.studentActivity.deleteMany({ where: { userId: { in: ids } } });
  await db.userSession.deleteMany({ where: { userId: { in: ids } } });
  await db.subscription.deleteMany({ where: { OR: [{ userId: { in: ids } }, { institutionId: { in: iids } }] } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.institution.deleteMany({ where: { id: { in: iids } } });
  console.log(`removed ${ids.length} accounts, ${iids.length} institutions`);
}

if (process.argv[2] === '--remove') { await remove(); process.exit(0); }
const out = process.argv[2]; if (!out) throw new Error('usage: qa-library-fixtures.ts <out.json> | --remove');
await remove();

const inst = await db.institution.create({ data: { name: 'QA Library University' } });
const other = await db.institution.create({ data: { name: 'QA Library Other College' } });
await db.subscription.create({ data: { planName: 'QA Department Plan', status: 'Active', institutionId: inst.id, endDate: YEAR, domains: ['Applied Sciences', 'Agriculture', 'Computer / IT'], contentTypes: [], domainName: 'Applied Sciences' } as any });
await db.subscription.create({ data: { planName: 'QA Other Plan', status: 'Active', institutionId: other.id, endDate: YEAR, domains: ['Law'], contentTypes: [], domainName: 'Law' } as any });

const accounts: Record<string, any> = {
  librarian:  { role: 'Institution', institutionId: inst.id, memberRole: 'Librarian', interestedDomains: ['Applied Sciences'] },
  faculty:    { role: 'Student', institutionId: inst.id, memberRole: 'Faculty' },
  student:    { role: 'Student', institutionId: inst.id, memberRole: 'Student' },
  researcher: { role: 'Student', institutionId: inst.id, memberRole: 'Researcher' },
  college:    { role: 'College', institutionId: inst.id },
  corporate:  { role: 'Corporate', institutionId: inst.id },
  other:      { role: 'Institution', institutionId: other.id, memberRole: 'Librarian', interestedDomains: ['Law'] },
  pro:        { role: 'Subscriber', interestedDomains: ['Applied Sciences'] },
  free:       { role: 'Subscriber', interestedDomains: ['Applied Sciences'] },
  nodepts:    { role: 'Subscriber', interestedDomains: [] },
  // staff, for the admin content sections
  admin:      { role: 'SuperAdmin' },
  manager:    { role: 'SubscriptionManager' },
};
const tokens: Record<string, any> = {};
let n = 0;
for (const [name, data] of Object.entries(accounts)) {
  const u = await db.user.create({ data: { email: `${name}${TAG}`, password: 'x', displayName: `QA ${name}`, ...data } as any });
  if (name === 'pro') await db.subscription.create({ data: { planName: 'QA Solo Pro', status: 'Active', userId: u.id, endDate: YEAR, domains: [], contentTypes: [], domainName: '' } as any });
  const sid = `sid-qa-library-${n++}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 8 * 3600_000) } });
  tokens[name] = { id: u.id, email: u.email, role: u.role, institutionId: u.institutionId, token: jwt.sign({ uid: u.id, sid, role: u.role, email: u.email, institutionId: u.institutionId ?? undefined }, SECRET, { expiresIn: '8h' }) };
}
writeFileSync(out, JSON.stringify(tokens, null, 2));
console.log(`created ${Object.keys(tokens).length} accounts → ${out}`);
process.exit(0);
