/**
 * Account credentials over HTTP: the real Express server against the throwaway database `stm_ingestion_test`. Refuses to run against
 * anything else. Every account it makes is tagged with this run and removed at the end; Super Admins that were already in the test
 * database are blocked for the "last Super Admin" checks and restored exactly afterwards.
 *
 *   npx tsx scripts/test-account-security.ts
 *
 * Covers the test matrix: counts, admin listing without secrets, email change (+ login with the new address), duplicate emails (case-
 * insensitive), admin password reset (new works, old does not), bcrypt-only storage, other sessions ended, blank/short/mismatched passwords,
 * role enforcement (403), the last Super Admin, MASTER_ADMIN bootstrap-only across a restart, seed-admin create-only; plus re-authentication,
 * self-service password/email change, block, signup, and that no password or hash reaches a response, an audit row or the server log.
 */
import { readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();
const dbName = (await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const PORT = 3109, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const DOMAIN = `acct-${RUN}.invalid`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 360) : ''}`); };

// Every password this run uses, so the leak checks can look for each of them.
const PW = { sa: `SaPass-${RUN}-1`, sa2: `SaTwo-${RUN}-2`, staff: `Staff-${RUN}-3`, reader: `Reader-${RUN}-4`, mgr: `Mgr-${RUN}-5`,
  newStaff: `NewStaff-${RUN}-6`, self: `Self-${RUN}-7`, master: `Master-${RUN}-8`, masterNew: `MasterNew-${RUN}-9` };
const everything: string[] = [];

const mkUser = async (role: string, name: string, password: string) => {
  const u = await db.user.create({ data: { email: `${name}@${DOMAIN}`, password: await bcrypt.hash(password, 10), role, displayName: name } });
  return { id: u.id, email: u.email, token: await sessionFor(u.id, role, u.email) };
};
const sessionFor = async (userId: string, role: string, email: string) => {
  const sid = `sid-acct-${RUN}-${Math.random().toString(36).slice(2)}`;
  await db.userSession.create({ data: { userId, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: userId, sid, role, email }, SECRET, { expiresIn: '1h' });
};

let child: any, serverLog = '';
const start = async (extra: Record<string, string> = {}) => {
  serverLog = '';
  const e: any = { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', MASTER_ADMIN_EMAIL: '', MASTER_ADMIN_PASSWORD: '', ...extra };
  child = spawn('npx', ['tsx', 'server.ts'], { cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: e });
  child.stdout.on('data', (d: any) => (serverLog += d)); child.stderr.on('data', (d: any) => (serverLog += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(BASE + '/api/admin/accounts/summary'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 120_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(500); }
};
const stop = async () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await sleep(1000); };

let ip = 0;
const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { 'X-Forwarded-For': `10.77.${Math.floor(++ip / 250)}.${ip % 250}`, ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  everything.push(text);
  return { status: r.status, data, text };
};
const login = (email: string, password: string) => call('/api/auth/login', { method: 'POST', body: { email, password, replaceExisting: true } });
const hashOf = async (id: string) => (await db.user.findUnique({ where: { id }, select: { password: true } }))!.password;

// Super Admins already in the test database: blocked during the last-Super-Admin checks, restored afterwards.
const others = await db.user.findMany({ where: { role: 'SuperAdmin', isBlocked: false, status: 'Active' }, select: { id: true } });

const sa = await mkUser('SuperAdmin', 'sa', PW.sa);
const sa2 = await mkUser('SuperAdmin', 'sa2', PW.sa2);
const staff = await mkUser('ContentManager', 'staff', PW.staff);
const reader = await mkUser('Subscriber', 'reader', PW.reader);
const mgr = await mkUser('SubscriptionManager', 'mgr', PW.mgr);
const S = (path: string, method?: string, body?: any) => call(path, { method, token: sa.token, body });

try {
  await start();

  console.log('\n1. Counts');
  const sum = await S('/api/admin/accounts/summary');
  check('summary total equals the database count', sum.status === 200 && sum.data.users.total === await db.user.count(), sum.data);
  check('summary counts password credentials (configured + not configured = total)', sum.data.passwords.configured + sum.data.passwords.notConfigured === sum.data.users.total);

  console.log('\n2. Admin accounts listed without secrets');
  const list = await S(`/api/admin/users?role=SuperAdmin&search=${DOMAIN}`);
  check('Super Admin accounts are listed with email and role', list.status === 200 && list.data.data.some((u: any) => u.email === sa.email && u.role === 'SuperAdmin'), list.data);
  check('no row carries a password or hash field', list.data.data.every((u: any) => !('password' in u) && !('passwordHash' in u)));
  check('no bcrypt hash anywhere in the response', !/\$2[aby]\$\d\d\$/.test(list.text));
  check('each row says only whether a password exists', list.data.data.every((u: any) => typeof u.hasPassword === 'boolean') && list.data.data.find((u: any) => u.id === sa.id)?.hasPassword === true);

  console.log('\n3. Change a staff account\'s email');
  const staffOldEmail = staff.email, staffNewEmail = `staff.renamed@${DOMAIN}`;
  await db.user.update({ where: { id: staff.id }, data: { emailVerifiedAt: new Date() } });
  const ch = await S(`/api/admin/users/${staff.id}`, 'PUT', { email: '  Staff.Renamed@' + DOMAIN.toUpperCase() + ' ' });
  check('Super Admin changes the email (trimmed and lower-cased)', ch.status === 200 && ch.data.user.email === staffNewEmail, ch.data);
  check('the new address is unverified', (await db.user.findUnique({ where: { id: staff.id } }))!.emailVerifiedAt === null);
  check('the user\'s old session ends (token carries the old email)', (await call('/api/auth/me', { token: staff.token })).status === 401);
  check('login works with the new email', (await login(staffNewEmail, PW.staff)).status === 200);
  check('login with the old email fails', (await login(staffOldEmail, PW.staff)).status === 401);
  check('login accepts the address in any case', (await login(staffNewEmail.toUpperCase(), PW.staff)).status === 200);
  check('no second account was created', (await db.user.count({ where: { email: { in: [staffOldEmail, staffNewEmail] } } })) === 1);

  console.log('\n4. Duplicate email');
  const dup = await S(`/api/admin/users/${staff.id}`, 'PUT', { email: reader.email.toUpperCase() });
  check('an address another account uses (different case) is refused', dup.status === 409, dup);
  const dupCreate = await S('/api/admin/users/create', 'POST', { name: 'x', email: sa2.email.toUpperCase(), role: 'Subscriber', sendEmail: false });
  check('creating an account with a case variant of an existing address is refused', dupCreate.status === 409, dupCreate);
  const dupSignup = await call('/api/auth/signup', { method: 'POST', body: { email: reader.email.toUpperCase(), password: 'Whatever-123', name: 'Dup' } });
  check('signing up with a case variant of an existing address is refused', dupSignup.status === 400 && /already exists/i.test(dupSignup.data?.error || ''), dupSignup);
  const bad = await S(`/api/admin/users/${staff.id}`, 'PUT', { email: 'not-an-email' });
  check('an invalid address is refused', bad.status === 400);

  console.log('\n5–7. Admin password reset');
  const staffToken2 = (await login(staffNewEmail, PW.staff)).data.token;
  const reset = await S(`/api/admin/users/${staff.id}/reset-password`, 'POST', { newPassword: PW.newStaff, confirmPassword: PW.newStaff, signOutEverywhere: true });
  check('reset succeeds and says so', reset.status === 200 && /updated successfully/i.test(reset.data.message), reset.data);
  check('the response does not contain the new password', !reset.text.includes(PW.newStaff));
  check('the new password works', (await login(staffNewEmail, PW.newStaff)).status === 200);
  check('the old password does not', (await login(staffNewEmail, PW.staff)).status === 401);
  check('stored as a bcrypt hash, never plaintext', /^\$2[aby]\$\d\d\$/.test(await hashOf(staff.id)) && (await hashOf(staff.id)) !== PW.newStaff);
  check('the user\'s other sessions were ended', (await call('/api/auth/me', { token: staffToken2 })).status === 401);
  check('the acting Super Admin is still signed in', (await S('/api/auth/me')).status === 200);
  check('an unrelated user is still signed in', (await call('/api/auth/me', { token: reader.token })).status === 200);
  const typedReset = await S(`/api/admin/users/${reader.id}/reset-password`, 'POST', { newPassword: `Rdr-${RUN}-new`, confirmPassword: `Rdr-${RUN}-new`, signOutEverywhere: false });
  check('with "sign out" unticked, the user\'s session survives', typedReset.status === 200 && (await call('/api/auth/me', { token: reader.token })).status === 200, typedReset.data);
  PW.reader = `Rdr-${RUN}-new`;

  console.log('\n8. Bad passwords');
  check('blank password refused', (await S(`/api/admin/users/${staff.id}/reset-password`, 'POST', { newPassword: '   ', confirmPassword: '   ' })).status === 400);
  check('7 characters refused', (await S(`/api/admin/users/${staff.id}/reset-password`, 'POST', { newPassword: 'Ab1!xyz', confirmPassword: 'Ab1!xyz' })).status === 400);
  check('mismatched confirmation refused', (await S(`/api/admin/users/${staff.id}/reset-password`, 'POST', { newPassword: 'LongEnough-1', confirmPassword: 'LongEnough-2' })).status === 400);
  check('a refused reset changed nothing', (await login(staffNewEmail, PW.newStaff)).status === 200);

  console.log('\n9. Only a Super Admin manages staff');
  const M = (path: string, method?: string, body?: any) => call(path, { method, token: mgr.token, body });
  check('Subscription Manager cannot reset a Super Admin\'s password', (await M(`/api/admin/users/${sa.id}/reset-password`, 'POST', { newPassword: 'Takeover-123', confirmPassword: 'Takeover-123' })).status === 403);
  check('…or change a Super Admin\'s email', (await M(`/api/admin/users/${sa.id}`, 'PUT', { email: `x@${DOMAIN}` })).status === 403);
  check('…or demote a Super Admin', (await M(`/api/admin/users/${sa.id}/role`, 'PUT', { role: 'Subscriber' })).status === 403);
  check('…or promote anyone to Super Admin', (await M(`/api/admin/users/${reader.id}/role`, 'PUT', { role: 'SuperAdmin' })).status === 403);
  check('…or create a Super Admin', (await M('/api/admin/users/create', 'POST', { name: 'x', email: `evil@${DOMAIN}`, role: 'SuperAdmin', sendEmail: false })).status === 403);
  check('…or see the account summary', (await M('/api/admin/accounts/summary')).status === 403);
  check('…or block or delete anyone', (await M(`/api/admin/users/${reader.id}/block`, 'POST', { isBlocked: true })).status === 403 && (await M(`/api/admin/users/${reader.id}`, 'DELETE')).status === 403);
  check('a reader gets 403 on the user list', (await call('/api/admin/users', { token: reader.token })).status === 403);
  check('the Super Admin\'s password is unchanged', (await login(sa.email, PW.sa)).status === 200);
  const saTokenAfterLogin = (await login(sa.email, PW.sa)).data.token; sa.token = saTokenAfterLogin;

  console.log('\nRe-authentication for another Super Admin');
  const noRe = await S(`/api/admin/users/${sa2.id}/reset-password`, 'POST', { newPassword: 'Another-123', confirmPassword: 'Another-123' });
  check('resetting another Super Admin\'s password asks for your own password', noRe.status === 403 && noRe.data.code === 'REAUTH_REQUIRED', noRe.data);
  const wrongRe = await S(`/api/admin/users/${sa2.id}`, 'PUT', { email: `sa2.new@${DOMAIN}`, actorPassword: 'wrong-password' });
  check('a wrong confirmation is refused and changes nothing', wrongRe.status === 403 && wrongRe.data.code === 'REAUTH_FAILED' && (await db.user.findUnique({ where: { id: sa2.id } }))!.email === sa2.email);
  const okRe = await S(`/api/admin/users/${sa2.id}`, 'PUT', { email: `sa2.new@${DOMAIN}`, actorPassword: PW.sa });
  check('with your password, another Super Admin\'s email changes', okRe.status === 200 && okRe.data.user.email === `sa2.new@${DOMAIN}`, okRe.data);
  sa2.email = `sa2.new@${DOMAIN}`;
  check('…and they sign in with the new address', (await login(sa2.email, PW.sa2)).status === 200);
  check('a Super Admin editing a reader needs no re-authentication', (await S(`/api/admin/users/${reader.id}`, 'PUT', { displayName: 'Reader Renamed' })).status === 200);
  const rc = await S(`/api/admin/users/${reader.id}/role`, 'PUT', { role: 'Student' });
  check('a reader\'s role changes without re-authentication', rc.status === 200 && rc.data.user.role === 'Student', rc.data);
  await S(`/api/admin/users/${reader.id}/role`, 'PUT', { role: 'Subscriber' });
  reader.token = await sessionFor(reader.id, 'Subscriber', reader.email);
  check('an unknown role is refused', (await S(`/api/admin/users/${reader.id}/role`, 'PUT', { role: 'God' })).status === 400);

  console.log('\n10. The last Super Admin');
  await db.user.updateMany({ where: { id: { in: [...others.map(o => o.id), sa2.id] } }, data: { isBlocked: true } });
  const sa2Token = await sessionFor(sa2.id, 'SuperAdmin', sa2.email);
  check('only one active Super Admin now', (await db.user.count({ where: { role: 'SuperAdmin', isBlocked: false, status: 'Active' } })) === 1);
  const demoteSelf = await S(`/api/admin/users/${sa.id}/role`, 'PUT', { role: 'ContentManager' });
  check('demoting the last Super Admin is blocked', demoteSelf.status === 409 && demoteSelf.data.code === 'LAST_SUPER_ADMIN', demoteSelf.data);
  check('…through the edit form too', (await S(`/api/admin/users/${sa.id}`, 'PUT', { role: 'Subscriber' })).status === 409);
  check('blocking yourself is refused', (await S(`/api/admin/users/${sa.id}/block`, 'POST', { isBlocked: true })).status === 400);
  const del = await call(`/api/admin/users/${sa.id}`, { method: 'DELETE', token: sa2Token, body: { actorPassword: PW.sa2 } });
  check('deleting the last active Super Admin is blocked (even by a blocked one\'s session)', del.status === 409, del);
  check('deleting your own account as the last Super Admin is blocked', (await S('/api/user/account', 'DELETE')).status === 409);
  check('the last Super Admin is still there and still a Super Admin', (await db.user.findUnique({ where: { id: sa.id } }))?.role === 'SuperAdmin');
  await db.user.update({ where: { id: sa2.id }, data: { isBlocked: false } });
  const demoteOther = await S(`/api/admin/users/${sa2.id}/role`, 'PUT', { role: 'ContentManager', actorPassword: PW.sa });
  check('with two active, one may be demoted (with re-authentication)', demoteOther.status === 200, demoteOther.data);
  check('…and the demoted account is signed out (its token carried the old role)', (await call('/api/auth/me', { token: sa2Token })).status === 401);
  await db.user.update({ where: { id: sa2.id }, data: { role: 'SuperAdmin' } });
  await db.user.updateMany({ where: { id: { in: others.map(o => o.id) } }, data: { isBlocked: false } });

  console.log('\nBlock');
  const readerTok = await sessionFor(reader.id, 'Subscriber', reader.email);
  const blk = await S(`/api/admin/users/${reader.id}/block`, 'POST', { isBlocked: true });
  check('block answers without a password or hash', blk.status === 200 && !('password' in blk.data) && !/\$2[aby]\$/.test(blk.text), blk.text);
  check('a blocked user is signed out', (await call('/api/auth/me', { token: readerTok })).status === 401);
  check('a blocked user cannot sign in', (await login(reader.email, PW.reader)).status === 403);
  await S(`/api/admin/users/${reader.id}/block`, 'POST', { isBlocked: false });
  check('unblocked, they can sign in again', (await login(reader.email, PW.reader)).status === 200);

  console.log('\nSelf-service: My Account');
  let me = (await login(staffNewEmail, PW.newStaff)).data.token;
  const otherTab = await sessionFor(staff.id, 'ContentManager', staffNewEmail);
  check('changing your password needs the current one', (await call('/api/user/profile', { method: 'PUT', token: me, body: { password: PW.self, confirmPassword: PW.self } })).status === 403);
  check('a wrong current password is refused', (await call('/api/user/profile', { method: 'PUT', token: me, body: { currentPassword: 'nope', password: PW.self, confirmPassword: PW.self } })).status === 403);
  const selfPw = await call('/api/user/profile', { method: 'PUT', token: me, body: { currentPassword: PW.newStaff, password: PW.self, confirmPassword: PW.self } });
  check('with the current password, it changes', selfPw.status === 200 && (await login(staffNewEmail, PW.self)).status === 200, selfPw.data);
  me = (await login(staffNewEmail, PW.self)).data.token;
  const third = await sessionFor(staff.id, 'ContentManager', staffNewEmail);
  await call('/api/user/profile', { method: 'PUT', token: me, body: { currentPassword: PW.self, password: PW.self + 'x', confirmPassword: PW.self + 'x' } });
  check('your other sessions end; this one stays', (await call('/api/auth/me', { token: third })).status === 401 && (await call('/api/auth/me', { token: me })).status === 200);
  PW.self += 'x';
  check('a forced first-login change needs no current password', await (async () => {
    await db.user.update({ where: { id: reader.id }, data: { isFirstLogin: true } });
    const t = await sessionFor(reader.id, 'Subscriber', reader.email);
    const r = await call('/api/user/profile', { method: 'PUT', token: t, body: { password: `First-${RUN}`, clearFirstLogin: true } });
    PW.reader = `First-${RUN}`;
    return r.status === 200 && (await db.user.findUnique({ where: { id: reader.id } }))!.isFirstLogin === false;
  })());
  const selfEmail = await call('/api/user/email', { method: 'PUT', token: me, body: { email: `staff.self@${DOMAIN}`, currentPassword: PW.self } });
  check('changing your own email needs your password and re-issues the session', selfEmail.status === 200 && !!selfEmail.data.token && (await call('/api/auth/me', { token: selfEmail.data.token })).data?.email === `staff.self@${DOMAIN}`, selfEmail.data);
  check('your own email cannot take an address in use', (await call('/api/user/email', { method: 'PUT', token: selfEmail.data.token, body: { email: sa.email.toUpperCase(), currentPassword: PW.self } })).status === 409);
  void otherTab;

  console.log('\n11–12. Restart and redeploy keep database credentials');
  const masterEmail = `master@${DOMAIN}`;
  await stop(); await start({ MASTER_ADMIN_EMAIL: masterEmail, MASTER_ADMIN_PASSWORD: PW.master });
  // The reported production bug: MASTER_ADMIN_EMAIL changed to a new address while a Super Admin already exists.
  const saCountBefore = await db.user.count({ where: { role: 'SuperAdmin' } });
  check('with a Super Admin present, new MASTER_ADMIN_* credentials do not sign in', (await login(masterEmail, PW.master)).status === 401);
  check('…and do not create a second Super Admin', (await db.user.count({ where: { role: 'SuperAdmin' } })) === saCountBefore && !(await db.user.findFirst({ where: { email: masterEmail } })));
  check('the existing Super Admin still signs in with its own password', (await login(sa.email, PW.sa)).status === 200);
  // Bootstrap proper: a database with no Super Admin at all. Every Super Admin in the test database is parked under another role and restored.
  const parked = (await db.user.findMany({ where: { role: 'SuperAdmin' }, select: { id: true } })).map(u => u.id);
  await db.user.updateMany({ where: { id: { in: parked } }, data: { role: 'ParkedByAccountTest' } });
  let boot: any;
  try { boot = await login(masterEmail, PW.master); }
  finally { await db.user.updateMany({ where: { id: { in: parked } }, data: { role: 'SuperAdmin' } }); }
  check('MASTER_ADMIN_* creates the first Super Admin when the database has none', boot.status === 200 && boot.data.user.role === 'SuperAdmin', boot.data);
  const master = await db.user.findFirst({ where: { email: masterEmail } });
  check('…stored as a bcrypt hash', !!master && /^\$2[aby]\$\d\d\$/.test(master.password));
  const masterChange = await call('/api/user/profile', { method: 'PUT', token: boot.data.token, body: { currentPassword: PW.master, password: PW.masterNew, confirmPassword: PW.masterNew } });
  check('the bootstrapped admin changes their password', masterChange.status === 200, masterChange.data);
  await stop(); await start({ MASTER_ADMIN_EMAIL: masterEmail, MASTER_ADMIN_PASSWORD: PW.master });
  check('after a restart the environment password no longer signs in', (await login(masterEmail, PW.master)).status === 401);
  check('…the password set in the app still does', (await login(masterEmail, PW.masterNew)).status === 200);
  check('…and the account is not duplicated or reset', (await db.user.count({ where: { email: masterEmail } })) === 1 && await bcrypt.compare(PW.masterNew, (await db.user.findFirst({ where: { email: masterEmail } }))!.password));
  check('staff email and password changed earlier survive the restart', (await login(`staff.self@${DOMAIN}`, PW.self)).status === 200);
  const before = await hashOf(sa.id);
  const seedOut = execFileSync('npx', ['tsx', 'seed-admin.ts'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, SEED_ADMIN_EMAIL: sa.email.toUpperCase(), SEED_ADMIN_PASSWORD: 'Overwrite-123' }, encoding: 'utf8' });
  check('seed-admin leaves an existing account untouched', /Nothing was changed/.test(seedOut) && (await hashOf(sa.id)) === before && (await login(sa.email, PW.sa)).status === 200, seedOut);
  let seedNoEnv = '';
  try { execFileSync('npx', ['tsx', 'seed-admin.ts'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, SEED_ADMIN_EMAIL: '', SEED_ADMIN_PASSWORD: '' }, encoding: 'utf8', stdio: 'pipe' }); } catch (e: any) { seedNoEnv = String(e.stderr || e.message); }
  check('seed-admin has no built-in credentials (refuses without SEED_ADMIN_*)', /SEED_ADMIN_EMAIL/.test(seedNoEnv), seedNoEnv);

  console.log('\nprivileged-accounts.cjs: keep one Super Admin, disable the obsolete one');
  const cjs = (argv: string[], input = '') => {
    try { return { code: 0, out: execFileSync('node', ['scripts/privileged-accounts.cjs', ...argv], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL }, input, encoding: 'utf8', stdio: 'pipe' }) }; }
    catch (e: any) { return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') }; }
  };
  const oldTok = (await login(sa2.email, PW.sa2)).data.token;
  const finalEmail = `final.admin@${DOMAIN}`, finalPw = `Final-${RUN}-pw`;
  (PW as any).final = finalPw;
  const inv = cjs([]);
  check('the inventory lists both Super Admins with credential YES/NO and no hash', inv.code === 0 && inv.out.includes(sa.id) && inv.out.includes(sa2.id) && !/\$2[aby]\$/.test(inv.out), inv.out.slice(-400));
  const chk = cjs(['--check'], PW.sa2 + '\n');
  check('--check says which account a password opens, and nothing else', chk.out.includes(`OPENS  ${sa2.email}`) && !chk.out.includes(`OPENS  ${sa.email}`) && !chk.out.includes(PW.sa2), chk.out);
  const hashBefore = await hashOf(sa.id);
  const dry = cjs(['--finalize', '--keep', sa.id, '--email', ' Final.Admin@' + DOMAIN.toUpperCase(), '--disable', sa2.id]);
  check('a dry run changes nothing', dry.code === 0 && /DRY RUN/.test(dry.out) && (await hashOf(sa.id)) === hashBefore && !(await db.user.findUnique({ where: { id: sa2.id } }))!.isBlocked, dry.out);
  check('it refuses to take an address another account holds', cjs(['--finalize', '--keep', sa.id, '--email', reader.email, '--disable', sa2.id, '--apply'], `${finalPw}\n${finalPw}\n`).code !== 0 && (await hashOf(sa.id)) === hashBefore);
  check('it refuses mismatched passwords', cjs(['--finalize', '--keep', sa.id, '--email', finalEmail, '--disable', sa2.id, '--apply'], `${finalPw}\nother\n`).code !== 0 && (await hashOf(sa.id)) === hashBefore);
  const fin = cjs(['--finalize', '--keep', sa.id, '--email', finalEmail, '--disable', sa2.id, '--apply'], `${finalPw}\n${finalPw}\n`);
  check('finalize applies and verifies from the database', fin.code === 0 && /new password verifies: YES/.test(fin.out) && /blocked YES, live sessions left 0/.test(fin.out) && !fin.out.includes(finalPw), fin.out);
  check('the final email + new password sign in', (await login(finalEmail, finalPw)).status === 200);
  check('the kept account\'s old password no longer works', (await login(finalEmail, PW.sa)).status === 401);
  check('the old Super Admin\'s email/password is rejected', (await login(sa2.email, PW.sa2)).status === 403);
  check('the old Super Admin\'s browser session is dead', (await call('/api/auth/me', { token: oldTok })).status === 401);
  check('the old Super Admin is blocked, not deleted, and keeps its role', (await db.user.findUnique({ where: { id: sa2.id } }))?.isBlocked === true && (await db.user.findUnique({ where: { id: sa2.id } }))?.role === 'SuperAdmin');
  check('its audit history is still there', (await db.adminAuditLog.count({ where: { action: 'ACCOUNT_DISABLED', meta: { path: ['targetUserId'], equals: sa2.id } } })) >= 1);
  await stop(); await start({ MASTER_ADMIN_EMAIL: sa2.email, MASTER_ADMIN_PASSWORD: PW.sa2 });
  check('after a restart with the OLD credentials in MASTER_ADMIN_*, the old login is still rejected', (await login(sa2.email, PW.sa2)).status !== 200);
  check('…the old account is not recreated or unblocked', (await db.user.count({ where: { email: sa2.email } })) === 1 && (await db.user.findUnique({ where: { id: sa2.id } }))!.isBlocked === true);
  check('…and the final credentials still work', (await login(finalEmail, finalPw)).status === 200);
  sa.email = finalEmail; PW.sa = finalPw;

  console.log('\nNothing secret leaks');
  const allText = everything.join('\n');
  const leaked = Object.values(PW).filter(p => allText.includes(p));
  check('no password used in this run appears in any response', leaked.length === 0, leaked);
  check('no bcrypt hash appears in any response', !/\$2[aby]\$\d\d\$[./A-Za-z0-9]{20,}/.test(allText));
  const auditRows = await db.adminAuditLog.findMany({ where: { OR: [{ adminEmail: { endsWith: DOMAIN } }, { adminId: { in: [sa.id, sa2.id, staff.id, master?.id ?? ''] } }] } });
  const auditText = JSON.stringify(auditRows);
  check('audit rows exist for the security changes', ['EMAIL_CHANGED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_CHANGED', 'SUPER_ADMIN_REMOVED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED', 'SUPER_ADMIN_CREATED'].every(a => auditRows.some(r => r.action === a)), [...new Set(auditRows.map(r => r.action))]);
  check('audit rows hold no password, hash or token', !Object.values(PW).some(p => auditText.includes(p)) && !/\$2[aby]\$/.test(auditText) && !/eyJ[A-Za-z0-9_-]{10,}\./.test(auditText));
  check('the server log holds no password used in this run', !Object.values(PW).some(p => serverLog.includes(p)));
} finally {
  await stop();
  await db.user.updateMany({ where: { id: { in: others.map(o => o.id) } }, data: { isBlocked: false } });
  const mine = await db.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = mine.map(m => m.id);
  await db.userSession.deleteMany({ where: { userId: { in: ids } } });
  await db.usageLog.deleteMany({ where: { userId: { in: ids } } });
  await db.adminAuditLog.deleteMany({ where: { OR: [{ adminId: { in: ids } }, { adminEmail: { endsWith: DOMAIN } }] } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
