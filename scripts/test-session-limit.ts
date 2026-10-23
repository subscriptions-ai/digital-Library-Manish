/**
 * Simultaneous logins: one by default, more for an account a Super Admin allows, and nothing else about the account changes.
 *
 *   Part 1  the pure rules (no database)
 *   Part 2  a real server on the throwaway database `stm_ingestion_test`: real sign-ins, real sessions, the Edit User endpoint.
 *           Needs `User.maxConcurrentSessions` in that database (prisma db push). Every outbound request is blocked.
 *
 *   npx tsx scripts/test-session-limit.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { effectiveSessionLimit, parseSessionLimit, decideSignIn } from '../src/lib/sessionLimits';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

section('Part 1 — the rules');
check('no setting → 1', effectiveSessionLimit(null) === 1 && effectiveSessionLimit(undefined) === 1);
check('1, 2, 3, 10 mean themselves', [1, 2, 3, 10].every(n => effectiveSessionLimit(n) === n));
check('unusable stored values mean 1, never more', [0, -1, 2.5, 11, 99999, NaN, '3', {}].every(v => effectiveSessionLimit(v) === 1));
check('parse: whole numbers 1-10 and null (default) are accepted', [1, 3, 10].every(n => (parseSessionLimit(n) as any).value === n) && (parseSessionLimit(null) as any).value === null);
check('parse: 0, negatives, decimals, strings, NaN, Infinity, huge, objects, booleans are refused',
  [0, -1, 2.5, '3', '', 'abc', NaN, Infinity, 11, 1e9, {}, [], true].every(v => 'error' in parseSessionLimit(v)));
check('limit 1, nobody in → opens (replacing nothing)', decideSignIn({ limit: 1, live: 0 }) === 'replace-all');
check('limit 1, one in → refused as ever, and the member may choose to end it', decideSignIn({ limit: 1, live: 1 }) === 'refuse-existing' && decideSignIn({ limit: 1, live: 1, replaceExisting: true }) === 'replace-all');
check('limit 3: 0, 1, 2 in → open without ending anyone', [0, 1, 2].every(live => decideSignIn({ limit: 3, live }) === 'create'));
check('limit 3, 3 in → refused, and "replace" is not honoured: nobody is signed out for them', decideSignIn({ limit: 3, live: 3, replaceExisting: true }) === 'refuse-limit');
check('limit lowered to 1 with 3 in → refused until they are gone', decideSignIn({ limit: 1, live: 3 }) === 'refuse-existing');
check('a change of email ends every old session whatever the limit', decideSignIn({ limit: 5, live: 5, revokeAll: true }) === 'replace-all');

// ── Part 2 — a real server ─────────────────────────────────────────────────
section('Part 2 — seeding the throwaway database');
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const col = await db.$queryRawUnsafe<any[]>(`select 1 from information_schema.columns where table_name='User' and column_name='maxConcurrentSessions'`);
if (!col.length) { console.log('\nSKIPPED Part 2: stm_ingestion_test has no User.maxConcurrentSessions yet (prisma db push).'); console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed (Part 2 not run)`); await db.$disconnect(); process.exit(fail === 0 ? 0 : 2); }

const PORT = 3108, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const PASSWORD = 'Sess1on-Test-Pass!';
const HASH = await bcrypt.hash(PASSWORD, 10);
const FOUR = ['Law', 'Nursing', 'Management', 'Agriculture'];
const created = { users: [] as string[] };
const mkUser = async (tag: string, o: { role?: string; limit?: number | null; blocked?: boolean; interested?: string[] } = {}) => {
  const u = await db.user.create({ data: { email: `${tag}-${RUN}@session-test.invalid`, password: HASH, role: o.role || 'Subscriber', displayName: tag, isBlocked: !!o.blocked,
    interestedDomains: o.interested ?? [], emailVerifiedAt: new Date(), ...(o.limit !== undefined ? { maxConcurrentSessions: o.limit } : {}) } as any });
  created.users.push(u.id);
  return { id: u.id, email: u.email, role: o.role || 'Subscriber' };
};
const adminToken = async (tag: string, role = 'SuperAdmin') => {
  const u = await mkUser(tag, { role }); const sid = `sid-sl-${RUN}-${tag}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return { ...u, token: jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' }) };
};
const liveCount = (userId: string) => db.userSession.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });

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
const api = async (method: string, path: string, o: { token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const signIn = (u: { email: string }, extra: any = {}) => api('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD, ...extra } });
const me = (token: string) => api('GET', '/api/auth/me', { token });
const setLimit = (admin: { token: string }, userId: string, value: unknown) => api('PUT', `/api/admin/users/${userId}`, { token: admin.token, body: { maxConcurrentSessions: value } });
const stored = async (id: string) => (await db.user.findUnique({ where: { id }, select: { maxConcurrentSessions: true } } as any) as any)?.maxConcurrentSessions ?? null;

let srv: Srv | null = null;
try {
  const admin = await adminToken('admin');
  srv = await start();

  section('TEST 1 — a default account keeps the one-login policy');
  const a = await mkUser('default');
  {
    const first = await signIn(a);
    check('first sign-in works', first.status === 200 && !!first.data?.token, first);
    const second = await signIn(a);
    check('a second sign-in is refused with the existing code', second.status === 409 && second.data?.code === 'ACTIVE_SESSION_EXISTS', second);
    check('the first is still signed in', (await me(first.data.token)).status === 200);
    check('wrong password says nothing about sessions', (await api('POST', '/api/auth/login', { body: { email: a.email, password: 'nope' } })).status === 401);
    check('one session exists', (await liveCount(a.id)) === 1);
  }

  section('TEST 2 — allowed three');
  const b = await mkUser('multi', { interested: FOUR });
  const tokens: string[] = [];
  {
    const set = await setLimit(admin, b.id, 3);
    check('Super Admin saves 3 with the Edit User endpoint', set.status === 200 && (await stored(b.id)) === 3, set);
    for (let i = 1; i <= 3; i++) { const r = await signIn(b); check(`sign-in ${i} works`, r.status === 200, r); tokens.push(r.data?.token); }
    const fourth = await signIn(b);
    check('sign-in 4 is blocked: CONCURRENT_LOGIN_LIMIT_REACHED', fourth.status === 409 && fourth.data?.code === 'CONCURRENT_LOGIN_LIMIT_REACHED' && /sign out from another device/i.test(fourth.data?.error), fourth);
    check('"sign out the other one" is not honoured on a multi-login account', (await signIn(b, { replaceExisting: true })).status === 409);
    check('nobody was signed out to make room', (await liveCount(b.id)) === 3 && (await Promise.all(tokens.map(t => me(t)))).every(r => r.status === 200));
    const audit = await db.adminAuditLog.findFirst({ where: { action: 'USER_CONCURRENT_LOGIN_LIMIT_CHANGED', meta: { path: ['targetUserId'], equals: b.id } } as any });
    const m: any = audit?.meta;
    check('the change is audited: who, old, new', !!audit && audit.adminId === admin.id && m?.from === null && m?.to === 3 && !JSON.stringify(m).match(/token|password/i), audit);
  }

  section('TEST 3 — raised from 3 to 5');
  {
    await setLimit(admin, b.id, 5);
    const r1 = await signIn(b), r2 = await signIn(b), r3 = await signIn(b);
    check('two more sign-ins work', r1.status === 200 && r2.status === 200, [r1.status, r2.status]);
    check('the sixth is blocked', r3.status === 409 && r3.data?.code === 'CONCURRENT_LOGIN_LIMIT_REACHED', r3);
    tokens.push(r1.data?.token, r2.data?.token);
  }

  section('TEST 4 — lowered from 5 to 1 while five are signed in');
  {
    await setLimit(admin, b.id, 1);
    check('nobody is signed out by the change', (await liveCount(b.id)) === 5 && (await me(tokens[0])).status === 200);
    const r = await signIn(b);
    check('a new sign-in is blocked while they remain', r.status === 409, r);
    for (const t of tokens) await api('POST', '/api/auth/logout', { token: t });
    check('all signed out → count is 0', (await liveCount(b.id)) === 0);
    const again = await signIn(b);
    check('then one sign-in works, as for any default account', again.status === 200, again);
    check('and a second is refused', (await signIn(b)).status === 409);
  }

  section('TEST 5 — tabs of one browser are one session');
  const c = await mkUser('tabs', { limit: 3 });
  {
    const r = await signIn(c);
    const calls = await Promise.all([1, 2, 3, 4, 5].map(() => me(r.data.token)));
    check('five requests with one token, one session', calls.every(x => x.status === 200) && (await liveCount(c.id)) === 1);
    check('another browser (a separate sign-in) is the second', (await signIn(c)).status === 200 && (await liveCount(c.id)) === 2);
  }

  section('TEST 6 — expired and revoked sessions do not count');
  const d = await mkUser('expired', { limit: 2 });
  {
    await db.userSession.create({ data: { userId: d.id, sessionId: `exp-${RUN}-1`, expiresAt: new Date(Date.now() - 3600_000) } });
    await db.userSession.create({ data: { userId: d.id, sessionId: `exp-${RUN}-2`, expiresAt: new Date(Date.now() + 3600_000), revokedAt: new Date() } });
    const r1 = await signIn(d), r2 = await signIn(d), r3 = await signIn(d);
    check('an expired and a revoked session leave both slots free', r1.status === 200 && r2.status === 200 && r3.status === 409, [r1.status, r2.status, r3.status]);
  }

  section('TEST 13 — logging out of one frees one');
  {
    const e = await mkUser('logout', { limit: 3 });
    const t = [await signIn(e), await signIn(e), await signIn(e)].map(r => r.data?.token);
    check('three in, a fourth blocked', (await liveCount(e.id)) === 3 && (await signIn(e)).status === 409);
    await api('POST', '/api/auth/logout', { token: t[1] });
    check('logging out of the second ends only that one', (await liveCount(e.id)) === 2 && (await me(t[0])).status === 200 && (await me(t[1])).status === 401 && (await me(t[2])).status === 200);
    check('another sign-in is then allowed', (await signIn(e)).status === 200);
  }

  section('TEST 7 — status has priority over the limit');
  {
    const x = await mkUser('blocked', { limit: 5, blocked: true });
    const r = await signIn(x);
    check('a blocked account with limit 5 cannot sign in', r.status === 403 && !r.data?.token, r);
    check('and nothing was opened', (await liveCount(x.id)) === 0);
    const y = await mkUser('removed', { limit: 5 });
    await db.user.update({ where: { id: y.id }, data: { status: 'PENDING_DELETION' } as any });
    const ry = await signIn(y);
    check('an account pending deletion with limit 5 cannot sign in', ry.status === 403 && ry.data?.code === 'ACCOUNT_REMOVED' && (await liveCount(y.id)) === 0, ry);
  }

  section('TEST 8 — account allowances are the account’s, not each session’s');
  {
    const f = await mkUser('preview', { limit: 3, interested: FOUR });
    const t = [await signIn(f), await signIn(f), await signIn(f)].map(r => r.data?.token);
    await sleep(500);
    const rows = await db.freeSession.count({ where: { userId: f.id } });
    check('three sign-ins started ONE stretch of the free clock, not three', rows === 1, rows);
    const al = await Promise.all(t.map(x => api('GET', '/api/me/allowance', { token: x })));
    check('every session reads the same four-a-day allowance and the same clock', al.every(r => r.data?.sessionsPerDay === 4 && r.data?.timed === true) && new Set(al.map(r => r.data?.state ?? r.data?.status)).size === 1, al.map(r => r.data));
    await api('POST', '/api/auth/logout', { token: t[0] });
    const running = await db.freeSession.findFirst({ where: { userId: f.id, runningSince: { not: null } } });
    check('signing out of one of three leaves the clock running for the others', !!running);
    await api('POST', '/api/auth/logout', { token: t[1] }); await api('POST', '/api/auth/logout', { token: t[2] });
    const stopped = await db.freeSession.findFirst({ where: { userId: f.id, runningSince: { not: null } } });
    check('the last sign-out stops it', !stopped);
  }

  section('TEST 9 — every session sees exactly the same departments');
  {
    const g = await mkUser('scope', { limit: 3, interested: FOUR });
    const t = [await signIn(g), await signIn(g), await signIn(g)].map(r => r.data?.token);
    const scopes = await Promise.all(t.map(x => api('GET', '/api/user/access-scope', { token: x })));
    const lists = scopes.map(s => JSON.stringify([...(s.data?.domains || [])].sort()));
    check('the three sessions are scoped to the same four departments', scopes.every(s => s.status === 200 && s.data?.all === false) && new Set(lists).size === 1 && JSON.parse(lists[0]).length === 4, lists);
    const u = await db.user.findUnique({ where: { id: g.id }, select: { role: true, interestedDomains: true } });
    check('role and chosen departments are untouched by the limit', u?.role === 'Subscriber' && JSON.stringify(u?.interestedDomains) === JSON.stringify(FOUR));
  }

  section('Who may set it, and what is accepted');
  {
    const target = await mkUser('target');
    const mgr = await adminToken('mgr', 'SubscriptionManager');
    const own = await mkUser('own', { role: 'Institution' });
    const ownLogin = await signIn(own);
    const r = await setLimit(mgr, target.id, 4);
    check('a Subscription Manager cannot change it (403), and nothing changes', r.status === 403 && (await stored(target.id)) === null, r);
    check('a Subscription Manager sending the value it already has is not an error', (await setLimit(mgr, target.id, null)).status === 200);
    const self = await api('PUT', `/api/admin/users/${own.id}`, { token: ownLogin.data?.token, body: { maxConcurrentSessions: 9 } });
    check('an Institution Admin cannot change their own (403)', self.status === 403 && (await stored(own.id)) === null, self);
    for (const bad of [0, -1, 2.5, '3', 'abc', 11, 1e9, {}, true]) {
      const x = await setLimit(admin, target.id, bad);
      check(`refused: ${JSON.stringify(bad)}`, x.status === 400 && x.data?.code === 'INVALID_SESSION_LIMIT' && (await stored(target.id)) === null, x);
    }
    check('NaN (sent as null by JSON) means the default, not a limit', (await setLimit(admin, target.id, null)).status === 200 && (await stored(target.id)) === null);
    check('10 is accepted', (await setLimit(admin, target.id, 10)).status === 200 && (await stored(target.id)) === 10);
    check('saving with other fields still works and carries the limit', (await api('PUT', `/api/admin/users/${target.id}`, { token: admin.token, body: { displayName: 'Renamed', designation: 'Dean', maxConcurrentSessions: 2 } })).status === 200 && (await stored(target.id)) === 2);
    check('the field is only changed on the selected user', (await stored(a.id)) === null && (await stored(own.id)) === null);
    const list = await api('GET', `/api/admin/users?search=${encodeURIComponent('target-' + RUN)}`, { token: admin.token });
    const row = list.data?.data?.[0];
    check('the Users list reports the effective limit and how many are signed in', row?.sessionLimit === 2 && typeof row?.activeSessionCount === 'number', row);
  }
} finally {
  await stop(srv);
  await db.userSession.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.freeSession.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.adminAuditLog.deleteMany({ where: { action: 'USER_CONCURRENT_LOGIN_LIMIT_CHANGED', adminEmail: { contains: `@session-test.invalid` } } as any }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
