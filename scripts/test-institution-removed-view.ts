/**
 * Super Admin → Users → By institution keeps a removed member visible under the institution that removed them, for audit,
 * without counting them as a member and without giving anything back.
 *
 *   npx tsx scripts/test-institution-removed-view.ts
 *
 * A real server on the throwaway database `stm_ingestion_test` (needs the current schema pushed to it). Every outbound request is blocked.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const cols = await db.$queryRawUnsafe<any[]>(`select column_name from information_schema.columns where table_name='User' and column_name in ('memberRole','maxConcurrentSessions')`);
if (cols.length < 2) { console.log('SKIPPED: stm_ingestion_test does not have the current schema yet (prisma db push).'); await db.$disconnect(); process.exit(2); }
const { removeFromInstitution, purgeDueAccounts, cancelDeletion } = await import('../src/server/accountRemoval.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const PORT = 3109, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const created = { users: [] as string[], institutions: [] as string[] };
const mkInst = async (name: string) => { const i = await db.institution.create({ data: { name: `${name} ${RUN}` } }); created.institutions.push(i.id); return i; };
const mkUser = async (tag: string, o: { role?: string; institutionId?: string | null; memberRole?: string; designation?: string; org?: string } = {}) => {
  const u = await db.user.create({ data: { email: `${tag}-${RUN}@removed-view.invalid`, password: 'x', role: o.role || 'Student', displayName: tag, institutionId: o.institutionId ?? null,
    memberRole: o.memberRole ?? null, designation: o.designation ?? null, organization: o.org ?? null, emailVerifiedAt: new Date() } as any });
  created.users.push(u.id); return u;
};
const session = async (u: { id: string; email: string; role: string }) => {
  const sid = `sid-rv-${RUN}-${u.id.slice(0, 6)}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role: u.role, email: u.email }, SECRET, { expiresIn: '1h' });
};

type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199', API_TEST_BLOCK_DELAY_MS: '50', DISABLE_HMR: 'true',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(600); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const get = async (path: string, token: string) => {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const post = async (path: string, token: string, body: any) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};

let srv: Srv | null = null;
try {
  const mohan = await mkInst('Mohan university');
  const other = await mkInst('Other college');
  const admin = await mkUser('admin', { role: 'SuperAdmin' });
  const adminTok = await session(admin);
  const librarian = await mkUser('demo-mohan', { role: 'Institution', institutionId: mohan.id, designation: 'Librarian', org: mohan.name });
  const libTok = await session(librarian);
  const demo = await mkUser('active-student', { institutionId: mohan.id, memberRole: 'Student', org: mohan.name });
  const pending = await mkUser('consortium', { institutionId: mohan.id, memberRole: 'Faculty', designation: 'Associate Professor', org: mohan.name });
  const keptElsewhere = await mkUser('kept-account', { institutionId: mohan.id, memberRole: 'Researcher', designation: 'Research Fellow', org: mohan.name });
  const readded = await mkUser('readded', { institutionId: mohan.id, memberRole: 'Faculty', org: mohan.name });
  const typed = await mkUser('typed-name', { institutionId: null, org: mohan.name });
  const purged = await mkUser('purged', { institutionId: mohan.id, memberRole: 'Student', org: mohan.name });
  void demo; void typed;

  // Two removals through the real workflow: one scheduled for deletion, one whose account is kept (a plan of their own).
  const actor = { uid: librarian.id, email: librarian.email, role: 'Institution' } as any;
  const r1 = await removeFromInstitution(db, { userId: pending.id, institutionId: mohan.id, actor });
  await db.subscription.create({ data: { userId: keptElsewhere.id, planName: 'Own plan', planType: 'Yearly', durationMonths: 12, status: 'Active', domains: ['Law'], endDate: new Date(Date.now() + 100 * 864e5) } });
  const r2 = await removeFromInstitution(db, { userId: keptElsewhere.id, institutionId: mohan.id, actor });
  await removeFromInstitution(db, { userId: readded.id, institutionId: mohan.id, actor });
  await db.user.update({ where: { id: readded.id }, data: { status: 'Active', institutionId: mohan.id, deletionScheduledAt: null } });
  await removeFromInstitution(db, { userId: purged.id, institutionId: mohan.id, actor });
  await db.user.update({ where: { id: purged.id }, data: { deletionScheduledAt: new Date(Date.now() - 1000) } });
  const accessBefore = await db.institutionMemberAccess.count({ where: { userId: pending.id, revokedAt: null } });
  srv = await start();

  section('Setup');
  check('one removal scheduled, one kept the account', r1.outcome === 'scheduled' && r2.outcome === 'membership-only', [r1.outcome, r2.outcome]);

  section('Everyone');
  {
    const all = await get(`/api/admin/users?accountStatus=pending_deletion&search=${encodeURIComponent('consortium-' + RUN)}`, adminTok);
    const row = all.data?.data?.[0];
    check('the pending user is listed, pending, with where it was removed from', all.status === 200 && row?.status === 'PENDING_DELETION' && row?.removal?.removedByInstitution?.id === mohan.id, row);
  }

  section('By institution');
  {
    const board = await get('/api/admin/users/by-institution', adminTok);
    const g = board.data?.groups?.find((x: any) => x.id === mohan.id);
    check('Mohan is listed with active members counted WITHOUT the removed (librarian, student, readded = 3)', g?.members === 3, g);
    check('Pending deletion is its own count (1, not folded into members)', g?.pendingDeletion === 1, g);
    check('the person whose account was kept is a former member, not pending', g?.former === 1, g);
    check('a person added back and a purged account are not counted as removed', g?.pendingDeletion + g?.former === 2, g);
    check('the two "typed the name" people are the only unlinked ones; the removed are not among them',
      (board.data?.typed || []).find((t: any) => t.name === mohan.name)?.members === 1, board.data?.typed);

    const active = await get(`/api/admin/users?institutionId=${mohan.id}&limit=200`, adminTok);
    const former = await get(`/api/admin/users?formerOf=${mohan.id}&limit=200`, adminTok);
    const activeIds = new Set((active.data?.data || []).map((u: any) => u.id));
    const formerRows = former.data?.data || [];
    check('active list: the librarian and students, not the removed', activeIds.has(librarian.id) && !activeIds.has(pending.id) && !activeIds.has(keptElsewhere.id), [...activeIds]);
    check('removed list: the pending one and the kept one, nobody else', formerRows.length === 2 && formerRows.some((u: any) => u.id === pending.id) && formerRows.some((u: any) => u.id === keptElsewhere.id), formerRows.map((u: any) => u.id));
    check('the pending row says what it was: previous role Faculty, designation, schedule, remaining time source',
      formerRows.find((u: any) => u.id === pending.id)?.accessRole === 'Faculty' && formerRows.find((u: any) => u.id === pending.id)?.designation === 'Associate Professor' && !!formerRows.find((u: any) => u.id === pending.id)?.removal?.scheduledDeletionAt);
    check('it is shown without its address', !String(formerRows.find((u: any) => u.id === pending.id)?.email).includes(`consortium-${RUN}`));
    check('a re-added person is not in the removed list', !formerRows.some((u: any) => u.id === readded.id));
    check('an anonymised (purged-state) account is not in the removed list', !formerRows.some((u: any) => u.id === purged.id));
    const other2 = await get(`/api/admin/users?formerOf=${other.id}&limit=200`, adminTok);
    check('another institution lists none of them', (other2.data?.data || []).length === 0);

    const bySearch = await get(`/api/admin/users/by-institution?search=${encodeURIComponent('consortium-' + RUN)}`, adminTok);
    check('searching for the pending user lists only the institution it was removed from', bySearch.data?.groups?.length === 1 && bySearch.data.groups[0].id === mohan.id && (bySearch.data.typed || []).length === 0, bySearch.data?.groups?.map((x: any) => x.name));
    const byStatus = await get('/api/admin/users/by-institution?accountStatus=pending_deletion', adminTok);
    check('the Pending deletion filter works in this view', byStatus.data?.groups?.some((x: any) => x.id === mohan.id) && !byStatus.data?.groups?.some((x: any) => x.id === other.id));
    const filteredFormer = await get(`/api/admin/users?formerOf=${mohan.id}&accountStatus=pending_deletion&limit=200`, adminTok);
    check('and inside the panel only the pending one remains', filteredFormer.data?.data?.length === 1 && filteredFormer.data.data[0].id === pending.id);
  }

  section('The institution never sees them, and nothing was given back');
  {
    const mine = await get('/api/institution/students', libTok);
    const ids = new Set((mine.data || []).map((u: any) => u.id));
    check('the institution’s own member list does not show the removed', mine.status === 200 && !ids.has(pending.id) && !ids.has(keptElsewhere.id));
    const u = await db.user.findUnique({ where: { id: pending.id }, select: { institutionId: true, status: true, deletionScheduledAt: true, role: true } });
    check('still no institution, still pending, same schedule', u?.institutionId === null && u?.status === 'PENDING_DELETION' && !!u?.deletionScheduledAt);
    check('no seat came back', (await db.institutionMemberAccess.count({ where: { userId: pending.id, revokedAt: null } })) === accessBefore);
    check('the pending user cannot use the app (no live session)', (await db.userSession.count({ where: { userId: pending.id, revokedAt: null, expiresAt: { gt: new Date() } } })) === 0);
  }

  section('Cancel deletion, and the purge');
  {
    const restored = await post(`/api/admin/users/${pending.id}/cancel-deletion`, adminTok, { restoreMembership: false });
    check('the Super Admin cancels the deletion (account only)', restored.status === 200 && restored.data?.membershipRestored === false, restored);
    const u = await db.user.findUnique({ where: { id: pending.id }, select: { institutionId: true, status: true } });
    check('the account is back but is NOT put back into Mohan', u?.institutionId === null && u?.status === 'Active');
    const board = await get('/api/admin/users/by-institution', adminTok);
    const g = board.data?.groups?.find((x: any) => x.id === mohan.id);
    check('Mohan: no longer pending; the person is now a former member; active members unchanged', g?.pendingDeletion === 0 && g?.former === 2 && g?.members === 3, g);
    const res = await purgeDueAccounts(db, {});
    check('the purge anonymises only what is due', res.deleted >= 1, res);
    const afterPurge = await get(`/api/admin/users?formerOf=${mohan.id}&limit=200`, adminTok);
    check('the purged account has left the removed list', !(afterPurge.data?.data || []).some((x: any) => x.id === purged.id));
  }
  void cancelDeletion;
} finally {
  await stop(srv);
  await db.subscription.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.userSession.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.adminAuditLog.deleteMany({ where: { OR: [{ adminEmail: { contains: '@removed-view.invalid' } }] } as any }).catch(() => {});
  await db.institutionMemberAccess.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
  await db.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
