/**
 * Removing a person from an institution: a 48-hour soft delete, never a hard delete.
 *
 * A real server on the throwaway database `stm_ingestion_test`; every outbound request blocked. Time is moved by editing the scheduled
 * deadline and by asking the purge for a later `now` — the same function the server's worker runs, which is also exercised for real.
 *
 *   npx tsx scripts/test-account-removal.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const R = await import('../src/server/accountRemoval.js');
const { loadEntitlement } = await import('../src/server/entitlements.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const HOUR = 3_600_000;
const PORT = 3108, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const PASSWORD = 'Removal-Test-9f2a!';
const HASH = await bcrypt.hash(PASSWORD, 4);
const made = { users: [] as string[], institutions: [] as string[], contents: [] as string[], subs: [] as string[], payments: [] as string[], events: [] as string[] };

const mkInst = async (n: string) => { const i = await db.institution.create({ data: { name: `${n} ${RUN}` } }); made.institutions.push(i.id); return i; };
const mkUser = async (tag: string, o: { role?: string; institutionId?: string | null; interested?: string[]; email?: string } = {}) => {
  const role = o.role || 'Student';
  const u = await db.user.create({ data: { email: o.email || `${tag}-${RUN}@removal-test.invalid`, password: HASH, role, institutionId: o.institutionId ?? null, interestedDomains: o.interested ?? [], displayName: tag, organization: 'Org' } });
  made.users.push(u.id);
  return u;
};
const session = async (u: any) => {
  const sid = `sid-rm-${RUN}-${Math.random().toString(36).slice(2)}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role: u.role, email: u.email, institutionId: u.institutionId ?? undefined }, SECRET, { expiresIn: '1h' });
};
const mkSub = async (o: { userId?: string; institutionId?: string; domains: string[] }) => {
  const s = await db.subscription.create({ data: { userId: o.userId ?? null, institutionId: o.institutionId ?? null, planName: 'Test', planType: 'Yearly', durationMonths: 12, status: 'Active', domains: o.domains, endDate: new Date(Date.now() + 200 * 864e5) } });
  made.subs.push(s.id); return s;
};
const audits = async (action: string, userId: string) => (await db.adminAuditLog.findMany({ where: { action }, orderBy: { at: 'desc' }, take: 200 })).filter((a: any) => a.meta?.userId === userId);

type Srv = { child: any; log: string };
const start = async (extra: Record<string, string> = {}): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199', API_TEST_BLOCK_DELAY_MS: '50', DISABLE_HMR: 'true',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', ...extra },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(600); }
  await sleep(500);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const call = async (path: string, token: string | null, o: { method?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const remove = (tok: string, id: string) => call(`/api/institution/students/${id}`, tok, { method: 'DELETE' });
const row = (id: string) => db.user.findUnique({ where: { id } }) as Promise<any>;

let srv: Srv | null = null;
try {
  section('Setup');
  const A = await mkInst('College A'), B = await mkInst('College B');
  const ownerA = await mkUser('owner-a', { role: 'Institution', institutionId: A.id, interested: ['Law', 'Nursing'] });
  const ownerB = await mkUser('owner-b', { role: 'Institution', institutionId: B.id, interested: ['Law'] });
  const admin = await mkUser('admin', { role: 'SuperAdmin' });
  const tokA = await session(ownerA), tokB = await session(ownerB), tokAdmin = await session(admin);
  const content = await db.content.create({ data: { title: `Removal test ${RUN}`, authors: 'T', contentType: 'Theses', domain: 'Law', status: 'Published' } as any }); made.contents.push(content.id);
  const instPlan = await mkSub({ institutionId: A.id, domains: ['Law'] });

  // 1 ── the ordinary member whose only link is this institution
  const only = await mkUser('only', { institutionId: A.id });
  const onlyTok = await session(only);
  await db.favorite.create({ data: { userId: only.id, contentId: content.id } });
  const ev = await db.libraryEvent.create({ data: { kind: 'view', userId: only.id, institutionId: A.id, itemType: 'content', itemId: content.id, domain: 'Law' } as any }); made.events.push(ev.id);
  const pay = await db.payment.create({ data: { userId: only.id, amount: 100, items: [], status: 'Success' } as any }); made.payments.push(pay.id);
  await db.institutionMemberAccess.create({ data: { userId: only.id, institutionId: A.id } });
  srv = await start({ ACCOUNT_PURGE_FIRST_RUN_MS: '600000' });
  const before = await call('/api/user/dashboard', onlyTok);
  check('before removal the member reads through the institution (Law)', before.status === 200 && before.data?.allowedDomains?.includes('Law'), before.data?.allowedDomains);
  const listBefore = await call('/api/institution/students', tokA);
  check('…and is in the institution’s directory', listBefore.data?.some((s: any) => s.id === only.id));


  section('TEST 1 — an institution removes a member whose only entitlement is that institution');
  const t0 = Date.now();
  const r1 = await remove(tokA, only.id);
  check('the institution is told the user is removed (200), in the institution’s words', r1.status === 200 && /removed from your institution/i.test(r1.data?.message || '') && r1.data?.institutionAccessEnded === true, r1);
  check('the response does not mention deletion scheduling (that is for administrators)', !/pending|48|schedul/i.test(JSON.stringify(r1.data)), r1.data);
  const u1 = await row(only.id);
  check('the user row STILL EXISTS — an institution can never hard-delete an account', !!u1);
  check('status PENDING_DELETION, no institution link, removed-by trail recorded', u1.status === R.PENDING_DELETION && u1.institutionId === null && u1.removedBy === ownerA.id && u1.removedByInstitutionId === A.id && !!u1.removedAt, u1);
  const due = u1.deletionScheduledAt.getTime() - u1.removedAt.getTime();
  check('scheduled exactly 48 hours after removal, on the server clock', due === 48 * HOUR && Math.abs(u1.removedAt.getTime() - t0) < 15_000, due / HOUR);
  const listAfter = await call('/api/institution/students', tokA);
  check('TEST 10 — gone from the institution’s directory at once', Array.isArray(listAfter.data) && !listAfter.data.some((s: any) => s.id === only.id));
  check('the institution’s own response carries no retention record for anyone', !JSON.stringify(listAfter.data).includes('deletionScheduledAt') || !listAfter.data.some((s: any) => s.deletionScheduledAt));
  const seat = await db.institutionMemberAccess.findFirst({ where: { userId: only.id, institutionId: A.id } });
  check('the seat is revoked', !!seat?.revokedAt);
  check('TEST 9 — an already-open session no longer works', (await call('/api/user/dashboard', onlyTok)).status === 401);
  const ent = await loadEntitlement(db as any, { uid: only.id, role: 'Student', institutionId: A.id });
  check('even a token that still named the institution reaches none of its departments', !ent.all && ent.departments.length === 0, ent);
  const login = await call('/api/auth/login', null, { body: { email: only.email, password: PASSWORD } });
  check('sign-in is refused during the retention period — it is for recovery, not for reading', login.status === 403 && login.data?.code === 'ACCOUNT_REMOVED', login);
  check('it does not reveal which institution removed them', !JSON.stringify(login.data).includes(A.name));
  check('audit: INSTITUTION_USER_REMOVED and GLOBAL_DELETION_SCHEDULED, with ids and no secrets', (await audits('INSTITUTION_USER_REMOVED', only.id)).length === 1 && (await audits('GLOBAL_DELETION_SCHEDULED', only.id)).length === 1
    && !/password|token|secret/i.test(JSON.stringify((await audits('GLOBAL_DELETION_SCHEDULED', only.id))[0].meta)));

  section('Admin sees it, the institution does not');
  const adm = await call('/api/admin/users?accountStatus=pending_deletion&limit=100', tokAdmin);
  const mine = adm.data?.data?.find((u: any) => u.id === only.id);
  check('Pending deletion filter lists the account', !!mine && mine.status === 'PENDING_DELETION', adm.status);
  check('shown with who removed it, from where, when, and the deadline', mine?.removal?.removedByInstitution?.name?.startsWith('College A') && !!mine.removal.removedAt && !!mine.removal.scheduledDeletionAt && mine.removal.removedBy === 'owner-a', mine?.removal);
  check('the address is masked in the queue', /^o\*+@/.test(mine?.email || '') && !(mine?.email || '').includes('only-'), mine?.email);
  check('the removed-from-institution filter finds it too', (await call('/api/admin/users?accountStatus=removed&limit=100', tokAdmin)).data?.data?.some((u: any) => u.id === only.id));
  check('the Active filter no longer lists it', !(await call('/api/admin/users?accountStatus=active&limit=200', tokAdmin)).data?.data?.some((u: any) => u.id === only.id));
  check('an institution cannot read the admin list', (await call('/api/admin/users?accountStatus=pending_deletion', tokA)).status === 403);
  check('the admin summary counts the queue', (await call('/api/admin/accounts/summary', tokAdmin)).data?.users?.pendingDeletion >= 1);

  section('TEST 2 — at 47 hours the record is still there');
  const at47 = await R.purgeDueAccounts(db, { now: new Date(u1.removedAt.getTime() + 47 * HOUR) });
  check('nothing is due', !at47.deleted && (await row(only.id)).status === R.PENDING_DELETION, at47);

  section('Who may remove whom');
  const sibling = await mkUser('sibling-owner', { role: 'Institution', institutionId: A.id });
  check('an institution account cannot be removed through the member screen', (await remove(tokA, sibling.id)).status === 400 && !!(await row(sibling.id)));
  check('it cannot remove itself', (await remove(tokA, ownerA.id)).status === 400);
  const strangerOfA = await mkUser('stranger-a', { institutionId: A.id });
  check('another institution cannot remove A’s member', (await remove(tokB, strangerOfA.id)).status === 403 && (await row(strangerOfA.id)).institutionId === A.id);
  check('a user that does not exist is a 404', (await remove(tokA, 'no-such-id')).status === 404);

  section('TEST 5 — a member who holds a Solo subscription keeps their account');
  const solo = await mkUser('solo', { institutionId: A.id });
  await mkSub({ userId: solo.id, domains: ['Nursing'] });
  const soloTok = await session(solo);
  const rs = await remove(tokA, solo.id);
  const us = await row(solo.id);
  check('removed from the institution, but the account is NOT scheduled and NOT pending', rs.status === 200 && us.status === 'Active' && us.deletionScheduledAt === null && us.institutionId === null, us);
  check('it is now an individual account and the removal is recorded', us.role === 'Subscriber' && us.removedByInstitutionId === A.id && /ACTIVE_SUBSCRIPTION/.test(us.removalReason || ''), us.removalReason);
  const entSolo = await loadEntitlement(db as any, { uid: solo.id, role: us.role, institutionId: A.id });
  check('their access is their own plan (Nursing) and none of the institution’s (Law)', entSolo.departments.join() === 'Nursing', entSolo.departments);
  check('the old session is ended, so they sign in afresh as themselves', (await call('/api/user/dashboard', soloTok)).status === 401);
  const loginSolo = await call('/api/auth/login', null, { body: { email: solo.email, password: PASSWORD } });
  check('and they CAN sign in', loginSolo.status === 200, loginSolo);
  check('no global deletion was audited for them', (await audits('GLOBAL_DELETION_SCHEDULED', solo.id)).length === 0 && (await audits('INSTITUTION_USER_REMOVED', solo.id)).length === 1);
  const afterPurgeSolo = await R.purgeDueAccounts(db);
  check('they are not in the purge queue at all: a purge run leaves them alone', (await row(solo.id)).status === 'Active' && (await row(solo.id)).purgedAt === null, afterPurgeSolo);

  section('TEST 4 — a member with a seat at another institution keeps their account');
  const two = await mkUser('two', { institutionId: A.id });
  await db.institutionMemberAccess.create({ data: { userId: two.id, institutionId: A.id } });
  await db.institutionMemberAccess.create({ data: { userId: two.id, institutionId: B.id } });
  await remove(tokA, two.id);
  const ut = await row(two.id);
  const seats = await db.institutionMemberAccess.findMany({ where: { userId: two.id } });
  check('A’s membership is gone, B’s seat remains, the account is not scheduled', ut.status === 'Active' && ut.institutionId === null && seats.find(s => s.institutionId === A.id)?.revokedAt && !seats.find(s => s.institutionId === B.id)?.revokedAt, seats);
  check('the reason names the other institution', /OTHER_INSTITUTION/.test(ut.removalReason || ''), ut.removalReason);

  section('Pending requests, publisher and staff roles also keep an account');
  const asking = await mkUser('asking', { institutionId: A.id });
  const req = await db.subscriptionRequest.create({ data: { userId: asking.id, userName: 'x', email: asking.email, planType: 'Pro', durationMonths: 12, status: 'Pending' } as any });
  await remove(tokA, asking.id);
  check('a waiting subscription request keeps the account', (await row(asking.id)).status === 'Active');
  await db.subscriptionRequest.delete({ where: { id: req.id } });
  const blockers = await R.deletionBlockers(db, { id: admin.id, role: 'SuperAdmin', institutionId: null }, null);
  check('a staff role is never eligible', blockers.some(b => b.code === 'ROLE'), blockers);

  section('TEST 6 — Super Admin cancels the deletion');
  const c1 = await mkUser('cancel-me', { institutionId: A.id }); await remove(tokA, c1.id);
  check('an institution cannot cancel it', (await call(`/api/admin/users/${c1.id}/cancel-deletion`, tokA, { method: 'POST', body: {} })).status === 403);
  const cc = await call(`/api/admin/users/${c1.id}/cancel-deletion`, tokAdmin, { method: 'POST', body: {} });
  const uc = await row(c1.id);
  check('the Super Admin can; the account is Active again with no deadline', cc.status === 200 && uc.status === 'Active' && uc.deletionScheduledAt === null, cc);
  check('the institution membership is NOT restored', uc.institutionId === null && !(await call('/api/institution/students', tokA)).data.some((s: any) => s.id === c1.id));
  check('it can sign in again', (await call('/api/auth/login', null, { body: { email: c1.email, password: PASSWORD } })).status === 200);
  check('audit: GLOBAL_DELETION_CANCELLED', (await audits('GLOBAL_DELETION_CANCELLED', c1.id)).length === 1);
  check('cancelling an account that is not pending is refused', (await call(`/api/admin/users/${c1.id}/cancel-deletion`, tokAdmin, { method: 'POST', body: {} })).status === 409);
  const c2 = await mkUser('cancel-restore', { institutionId: A.id }); await remove(tokA, c2.id);
  const cc2 = await call(`/api/admin/users/${c2.id}/cancel-deletion`, tokAdmin, { method: 'POST', body: { restoreMembership: true } });
  check('"restore and re-add" puts them back under the institution only when asked', cc2.status === 200 && (await row(c2.id)).institutionId === A.id && (await row(c2.id)).role === 'Student');

  section('TEST 7 / duplicate protection — the same institution re-adds the same email');
  const re = await mkUser('readd', { institutionId: A.id }); await remove(tokA, re.id);
  const again = await call('/api/institution/students', tokA, { method: 'POST', body: { name: 'Re Added', email: re.email.toUpperCase(), password: 'NewPassw0rd!', memberRole: 'Student', designation: 'Student', mobile: '9999999999' } });
  const ur = await row(re.id);
  const copies = await db.user.count({ where: { email: { equals: re.email, mode: 'insensitive' } } });
  check('the existing identity is reused (same id), even when the email is typed in capitals', again.status === 200 && again.data?.id === re.id, again);
  check('there is exactly one account for that address', copies === 1, copies);
  check('it is active again under the institution, with the new details, and the deadline is cleared', ur.status === 'Active' && ur.institutionId === A.id && ur.displayName === 'Re Added' && ur.deletionScheduledAt === null && ur.role === 'Student', ur);
  check('the new password works and the old one does not', (await call('/api/auth/login', null, { body: { email: re.email, password: 'NewPassw0rd!' } })).status === 200);
  check('it is back in the directory', (await call('/api/institution/students', tokA)).data.some((s: any) => s.id === re.id));
  check('audit: the cancellation is recorded as a re-add', (await audits('GLOBAL_DELETION_CANCELLED', re.id)).some((a: any) => /re-added/.test(a.meta?.reason || '')));

  const other = await mkUser('readd-other', { institutionId: A.id }); await remove(tokA, other.id);
  const stolen = await call('/api/institution/students', tokB, { method: 'POST', body: { name: 'X', email: other.email, password: 'NewPassw0rd!', memberRole: 'Student', designation: 'Student' } });
  check('a DIFFERENT institution cannot take over a removed account', stolen.status === 409 && (await row(other.id)).status === R.PENDING_DELETION, stolen);
  const live = await mkUser('exists-live', { institutionId: A.id });
  check('an active account is still "already exists"', (await call('/api/institution/students', tokA, { method: 'POST', body: { name: 'X', email: live.email, password: 'NewPassw0rd!', memberRole: 'Student', designation: 'Student' } })).status === 409);
  const bulk = await call('/api/institution/students/bulk', tokA, { method: 'POST', body: { users: [{ name: 'Bulk Back', email: other.email.toUpperCase(), password: 'NewPassw0rd!', role: 'Student' }] } });
  check('bulk import follows the same rule: reuse, no duplicate', bulk.data?.successCount === 1 && (await db.user.count({ where: { email: { equals: other.email, mode: 'insensitive' } } })) === 1 && (await row(other.id)).status === 'Active', bulk);
  const pend2 = await mkUser('selfreg', { institutionId: A.id }); await remove(tokA, pend2.id);
  const signup = await call('/api/auth/signup', null, { method: 'POST', body: { email: pend2.email, password: 'NewPassw0rd!', name: 'Squatter' } });
  check('self-registration with a pending-deletion address is refused: no second account', signup.status === 400 && (await db.user.count({ where: { email: { equals: pend2.email, mode: 'insensitive' } } })) === 1, signup);

  section('TEST 3 / 8 — the purge, and the recheck before it');
  await db.user.update({ where: { id: only.id }, data: { deletionScheduledAt: new Date(Date.now() - 60_000) } });
  const late = await mkUser('late-plan', { institutionId: A.id }); await remove(tokA, late.id);
  await db.user.update({ where: { id: late.id }, data: { deletionScheduledAt: new Date(Date.now() - 60_000) } });
  await mkSub({ userId: late.id, domains: ['Law'] });              // bought on day two
  const readded = await mkUser('late-readd', { institutionId: A.id }); await remove(tokA, readded.id);
  await db.user.update({ where: { id: readded.id }, data: { deletionScheduledAt: new Date(Date.now() - 60_000) } });
  await db.user.update({ where: { id: readded.id }, data: { institutionId: B.id } });     // an administrator attached them elsewhere
  const untouched = await mkUser('bystander', { institutionId: A.id });
  const instEventsBefore = await db.libraryEvent.count({ where: { institutionId: A.id } });
  await stop(srv); srv = null;
  srv = await start({ ACCOUNT_PURGE_FIRST_RUN_MS: '3000' });
  await sleep(9000);                                                  // the server's own worker, not the test, does this
  const p1 = await row(only.id);
  check('TEST 3 — after 48 hours the worker anonymised the eligible account', p1.status === R.DELETED && p1.email === `deleted-${only.id}@deleted.invalid` && p1.displayName === 'Deleted user' && !!p1.purgedAt, p1);
  check('no personal details remain on the row', !p1.contact && !p1.whatsapp && p1.organization === '' && p1.password === '!deleted' && p1.isBlocked === true);
  check('the person’s own records are gone (favourites, seat, sessions)', (await db.favorite.count({ where: { userId: only.id } })) === 0 && (await db.institutionMemberAccess.count({ where: { userId: only.id } })) === 0 && (await db.userSession.count({ where: { userId: only.id } })) === 0);
  check('the institution’s analytics survive without the identity', (await db.libraryEvent.count({ where: { institutionId: A.id } })) === instEventsBefore && (await db.libraryEvent.findUnique({ where: { id: ev.id } }))?.userId === null);
  check('the payment record is untouched and still attached to the account', (await db.payment.findUnique({ where: { id: pay.id } }))?.userId === only.id);
  check('another institution, its plan and another member are untouched', (await row(untouched.id)).institutionId === A.id && (await db.subscription.findUnique({ where: { id: instPlan.id } }))?.status === 'Active' && !!(await row(ownerB.id)));
  check('audit: GLOBAL_DELETION_EXECUTED, by the system', (await audits('GLOBAL_DELETION_EXECUTED', only.id)).length === 1 && (await audits('GLOBAL_DELETION_EXECUTED', only.id))[0].adminId === null);
  const pl = await row(late.id);
  check('TEST 8 — a plan bought on day two stopped the purge', pl.status === 'Active' && pl.purgedAt === null && /ACTIVE_SUBSCRIPTION/.test(pl.removalReason || ''), pl);
  check('…and the cancellation is audited with the reason', (await audits('GLOBAL_DELETION_CANCELLED', late.id)).some((a: any) => /still has a valid relationship/.test(a.meta?.reason || '')));
  const pr = await row(readded.id);
  check('an account attached to an institution again is not purged either', pr.status === 'Active' && pr.institutionId === B.id, pr);
  check('the anonymised address is free again: it can be registered anew', !(await db.user.findFirst({ where: { email: { equals: only.email, mode: 'insensitive' } } })));
  const idem = await R.purgeDueAccounts(db);
  check('running the purge again changes nothing', idem.deleted === 0 && idem.cancelled === 0 && (await db.adminAuditLog.count({ where: { action: 'GLOBAL_DELETION_EXECUTED' } })) >= 1);

  section('The hard-delete bypass is gone from the institution');
  const src = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const route = src.slice(src.indexOf('app.delete("/api/institution/students/:id"'), src.indexOf('POST /api/admin/users/:id/cancel-deletion'));
  check('the institution delete route never calls user.delete', !/user\.delete\b/.test(route) && /removeFromInstitution\(/.test(route));
} finally {
  await stop(srv);
  const ids = made.users;
  await db.userSession.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.favorite.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.institutionMemberAccess.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.libraryEvent.deleteMany({ where: { id: { in: made.events } } }).catch(() => {});
  await db.payment.deleteMany({ where: { id: { in: made.payments } } }).catch(() => {});
  await db.subscriptionRequest.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.subscription.deleteMany({ where: { OR: [{ id: { in: made.subs } }, { userId: { in: ids } }] } }).catch(() => {});
  await db.emailSend.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.lead.deleteMany({ where: { email: { contains: '@removal-test.invalid' } } }).catch(() => {});
  await db.emailVerification.deleteMany({ where: { email: { contains: '@removal-test.invalid' } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: ids } } }).catch((e: any) => console.error('cleanup users:', e?.message?.slice(0, 120)));
  await db.institution.deleteMany({ where: { id: { in: made.institutions } } }).catch(() => {});
  await db.content.deleteMany({ where: { id: { in: made.contents } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
