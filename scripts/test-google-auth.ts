/**
 * Sign in with Google, end to end, on the throwaway database `stm_ingestion_test`.
 *
 *   npx tsx scripts/test-google-auth.ts
 *
 * The test signs its own "Google" credentials with a key it generates and gives the server that key's public half, so the REAL
 * verification runs (signature, issuer, audience, expiry) without reaching Google. Every outbound request is blocked.
 * Part 1 needs no database; Part 2 runs a real server.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { signGoogleToken, readGoogleToken } from '../src/server/googleAuth';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

section('Part 1 — the tokens the server hands out');
{
  const claims = { sub: 's1', email: 'a@b.in', name: 'A', picture: null };
  const ob = signGoogleToken('secret', 'onboarding', claims);
  const lk = signGoogleToken('secret', 'link', { ...claims, uid: 'u1' });
  check('an onboarding token reads back its own claims', readGoogleToken('secret', 'onboarding', ob)?.email === 'a@b.in');
  check('a link token reads back its own claims', (readGoogleToken('secret', 'link', lk) as any)?.uid === 'u1');
  check('neither can be presented as the other', readGoogleToken('secret', 'link', ob) === null && readGoogleToken('secret', 'onboarding', lk) === null);
  check('a token signed with another secret is refused', readGoogleToken('other', 'onboarding', ob) === null);
  check('the session secret itself cannot forge one', readGoogleToken('secret', 'onboarding', jwt.sign({ typ: 'google-onboarding', ...claims }, 'secret')) === null);
  check('garbage and non-strings are refused', readGoogleToken('secret', 'onboarding', 'x.y.z') === null && readGoogleToken('secret', 'onboarding', undefined) === null);
  check('a session token (no purpose) is not an onboarding token', readGoogleToken('secret', 'onboarding', jwt.sign({ uid: 'u1', sid: 'x' }, 'secret')) === null);
}

section('Part 2 — seeding the throwaway database');
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const tbl = await db.$queryRawUnsafe<any[]>(`select 1 from information_schema.tables where table_name='AuthIdentity'`);
if (!tbl.length) { console.log('\nSKIPPED Part 2: stm_ingestion_test has no AuthIdentity table yet (prisma db push).'); console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed (Part 2 not run)`); await db.$disconnect(); process.exit(fail === 0 ? 0 : 2); }

const PORT = 3111, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const AUD = `test-client-${RUN}.apps.googleusercontent.com`;
const PASSWORD = 'Goog1e-Test-Pass!';
const HASH = await bcrypt.hash(PASSWORD, 10);
const FOUR = ['Law', 'Nursing', 'Management', 'Agriculture'];

// A key pair standing in for Google's, and a signer for credentials.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const certFile = join(mkdtempSync(join(tmpdir(), 'google-auth-test-')), 'certs.json');
writeFileSync(certFile, JSON.stringify({ [KID]: publicKey.export({ type: 'spki', format: 'pem' }).toString() }));
const cred = (o: { sub?: string; email: string; name?: string | null; aud?: string; iss?: string; exp?: number; verified?: boolean; key?: any }) => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({
    iss: o.iss ?? 'https://accounts.google.com', aud: o.aud ?? AUD, sub: o.sub ?? `g-${RUN}-${crypto.randomUUID()}`, email: o.email,
    email_verified: o.verified ?? true, name: o.name === undefined ? 'Test Person' : o.name, picture: 'https://lh3.googleusercontent.com/a/test',
    iat: now - 5, exp: o.exp ?? now + 3600,
  }, o.key ?? privateKey, { algorithm: 'RS256', keyid: KID });
};

const created = { users: [] as string[], institutions: [] as string[] };
const mkUser = async (tag: string, o: { role?: string; password?: boolean; blocked?: boolean; status?: string; institutionId?: string | null; limit?: number; interested?: string[]; emailVerified?: boolean } = {}) => {
  const u = await db.user.create({ data: { email: `${tag}-${RUN}@google-test.invalid`, password: o.password === false ? null : HASH, role: o.role || 'Subscriber', displayName: tag,
    isBlocked: !!o.blocked, status: o.status || 'Active', institutionId: o.institutionId ?? null, interestedDomains: o.interested ?? [],
    emailVerifiedAt: o.emailVerified === false ? null : new Date(), ...(o.limit ? { maxConcurrentSessions: o.limit } : {}) } as any });
  created.users.push(u.id);
  return u;
};
const link = (userId: string, sub: string, email = 'x') => db.authIdentity.create({ data: { userId, provider: 'GOOGLE', providerSubject: sub, emailAtLink: email } });
const sessionFor = async (u: { id: string; email: string; role: string }) => {
  const sid = `sid-g-${RUN}-${u.id.slice(0, 6)}-${crypto.randomUUID().slice(0, 6)}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role: u.role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const liveCount = (userId: string) => db.userSession.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });
const countByEmail = (email: string) => db.user.count({ where: { email: { equals: email, mode: 'insensitive' } } });

type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-google-auth.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', MEDIA_STORAGE_DRIVER: 'local-persistent', DISABLE_HMR: 'true',
      GOOGLE_CLIENT_ID: AUD, GOOGLE_TEST_CERT_FILE: certFile, API_TEST_BLOCK_DELAY_MS: '50',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 120_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(700); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const api = async (method: string, path: string, o: { token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const google = (credential: string, extra: any = {}) => api('POST', '/api/auth/google', { body: { credential, ...extra } });
const me = (token: string) => api('GET', '/api/auth/me', { token });
const profile = (extra: Record<string, unknown> = {}) => ({
  registrantType: 'Solo', organization: '', designation: '', contact: '+91 9876543210', state: 'Delhi', country: 'India', interestedDomains: FOUR, ...extra,
});

let srv: Srv | null = null;
try {
  const admin = await mkUser('admin', { role: 'SuperAdmin' });
  const adminTok = await sessionFor(admin);
  srv = await start();

  section('TEST 1 — a new Google user (Solo, four departments)');
  const newEmail = `newcomer-${RUN}@google-test.invalid`;
  const newSub = `g-${RUN}-newcomer`;
  let newUserId = '', newToken = '';
  {
    const first = await google(cred({ sub: newSub, email: newEmail, name: 'New Comer' }));
    check('a verified credential from nobody known asks for the rest (PROFILE_REQUIRED) and returns a short-lived token',
      first.status === 200 && first.data?.status === 'PROFILE_REQUIRED' && !!first.data?.onboardingToken && first.data?.google?.email === newEmail, first);
    check('NOTHING is created yet: no user, no identity', (await countByEmail(newEmail)) === 0 && (await db.authIdentity.count({ where: { providerSubject: newSub } })) === 0);
    check('the response carries no session token', !first.data?.token);

    const forged = await api('POST', '/api/auth/google/complete-signup', { body: { onboardingToken: 'nonsense', ...profile(), name: 'X' } });
    check('completing with a made-up token is refused (401)', forged.status === 401 && forged.data?.code === 'ONBOARDING_EXPIRED', forged);
    const asSession = await api('POST', '/api/auth/google/complete-signup', { body: { onboardingToken: await sessionFor(admin), ...profile(), name: 'X' } });
    check('a session token is not an onboarding token', asSession.status === 401);
    const incomplete = await api('POST', '/api/auth/google/complete-signup', { body: { onboardingToken: first.data.onboardingToken, ...profile({ interestedDomains: [] }), name: 'New Comer' } });
    check('missing departments is refused, and still nothing is created', incomplete.status === 400 && (await countByEmail(newEmail)) === 0, incomplete);

    // The browser may send an email, a sub, a different "verified" flag: none of it is read.
    const done = await api('POST', '/api/auth/google/complete-signup', { body: { onboardingToken: first.data.onboardingToken, ...profile(), name: 'New Comer',
      email: 'attacker@evil.invalid', sub: 'someone-else', email_verified: false, role: 'SuperAdmin', providerSubject: 'x' } });
    check('the account is created', done.status === 200 && done.data?.status === 'AUTHENTICATED' && !!done.data?.token, done);
    newToken = done.data?.token; newUserId = done.data?.user?.id;
    const u: any = await db.user.findUnique({ where: { id: newUserId } });
    const ids = await db.authIdentity.findMany({ where: { userId: newUserId } });
    check('one user, one Google identity, keyed by Google’s sub', (await countByEmail(newEmail)) === 1 && ids.length === 1 && ids[0].providerSubject === newSub && ids[0].provider === 'GOOGLE', ids);
    check('the email, and being verified, come from the server’s token, not the browser', u?.email === newEmail && !!u?.emailVerifiedAt, u?.email);
    check('no password was required and none was invented', u?.password === null);
    check('a Subscriber, never a staff role, whatever the browser said', u?.role === 'Subscriber');
    check('exactly the four chosen departments are stored', JSON.stringify([...u.interestedDomains].sort()) === JSON.stringify([...FOUR].sort()), u?.interestedDomains);
    check('the session works', (await me(newToken)).status === 200);
    const scope = await api('GET', '/api/user/access-scope', { token: newToken });
    check('entitlement: four departments, NOT all', scope.data?.all === false && scope.data?.domains?.length === 4 && FOUR.every(d => scope.data.domains.includes(d)), scope.data);
    const al = await api('GET', '/api/me/allowance', { token: newToken });
    check('free preview: the same policy (timed, four stretches a day)', al.data?.timed === true && al.data?.sessionsPerDay === 4, al.data);
    check('no institution was inferred', u?.institutionId === null);
    const lead = await db.lead.findFirst({ where: { email: newEmail } });
    check('the sales lead was filed as for any signup', !!lead);
  }

  section('TEST 2 — the same Google user returns');
  {
    const again = await google(cred({ sub: newSub, email: newEmail }));
    check('already signed in elsewhere (limit 1): refused by the ordinary session rule', again.status === 409 && again.data?.code === 'ACTIVE_SESSION_EXISTS', again);
    check('the first session is untouched', (await me(newToken)).status === 200);
    const replaced = await google(cred({ sub: newSub, email: newEmail }), { replaceExisting: true });
    check('choosing to end the other session signs in directly: no registration form', replaced.status === 200 && replaced.data?.status === 'AUTHENTICATED' && !!replaced.data?.token, replaced);
    check('the old session ended; one remains', (await me(newToken)).status === 401 && (await liveCount(newUserId)) === 1);
    newToken = replaced.data?.token;
    const out = await api('POST', '/api/auth/logout', { token: newToken });
    check('logout ends the STM session (and only that)', out.status === 200 && (await me(newToken)).status === 401 && (await liveCount(newUserId)) === 0);
  }

  section('TEST 3/4 — an existing password account, same address');
  const pw = await mkUser('haspw', { interested: FOUR, role: 'Student' });
  const pwSub = `g-${RUN}-haspw`;
  {
    const before = await db.user.findUnique({ where: { id: pw.id } });
    const first = await google(cred({ sub: pwSub, email: pw.email.toUpperCase() }));
    check('the same address (any case) asks to verify the existing account, and creates nobody', first.status === 200 && first.data?.status === 'ACCOUNT_LINK_REQUIRED' && first.data?.hasPassword === true && !first.data?.token && (await countByEmail(pw.email)) === 1, first);
    const wrong = await api('POST', '/api/auth/google/link', { body: { linkToken: first.data.linkToken, password: 'not-the-password' } });
    check('a wrong password connects nothing (401)', wrong.status === 401 && (await db.authIdentity.count({ where: { userId: pw.id } })) === 0, wrong);
    const noPw = await api('POST', '/api/auth/google/link', { body: { linkToken: first.data.linkToken } });
    check('no password connects nothing', noPw.status === 401);
    const forged = await api('POST', '/api/auth/google/link', { body: { linkToken: 'x', password: PASSWORD } });
    check('a made-up link token is refused', forged.status === 401 && forged.data?.code === 'LINK_EXPIRED');
    const ok = await api('POST', '/api/auth/google/link', { body: { linkToken: first.data.linkToken, password: PASSWORD } });
    check('the right password connects Google and signs in', ok.status === 200 && ok.data?.status === 'AUTHENTICATED' && ok.data?.linked === true, ok);
    const ids = await db.authIdentity.findMany({ where: { providerSubject: pwSub } });
    check('linked to the SAME user id; still one user with that address', ids.length === 1 && ids[0].userId === pw.id && (await countByEmail(pw.email)) === 1, ids);
    const after = await db.user.findUnique({ where: { id: pw.id } });
    check('role, departments and password hash are exactly as they were', after?.role === before?.role && JSON.stringify(after?.interestedDomains) === JSON.stringify(before?.interestedDomains) && after?.password === before?.password);
    check('the address is marked verified by Google', !!after?.emailVerifiedAt);
    await api('POST', '/api/auth/logout', { token: ok.data.token });
    const viaPw = await api('POST', '/api/auth/login', { body: { email: pw.email, password: PASSWORD } });
    check('TEST 4: the linked user still signs in with the password', viaPw.status === 200 && !!viaPw.data?.token, viaPw);
    await api('POST', '/api/auth/logout', { token: viaPw.data?.token });
    const viaG = await google(cred({ sub: pwSub, email: pw.email }));
    check('TEST 5: and with Google', viaG.status === 200 && viaG.data?.status === 'AUTHENTICATED', viaG);
    await api('POST', '/api/auth/logout', { token: viaG.data?.token });
  }

  section('TEST 6/7 — credentials that must fail');
  {
    const e = `bad-${RUN}@google-test.invalid`;
    const cases: [string, string, number, string?][] = [
      ['another audience', cred({ email: e, aud: 'someone-elses-client.apps.googleusercontent.com' }), 401, 'INVALID_GOOGLE_TOKEN'],
      ['expired', cred({ email: e, exp: Math.floor(Date.now() / 1000) - 3600 }), 401, 'INVALID_GOOGLE_TOKEN'],
      ['signed with another key', cred({ email: e, key: other.privateKey }), 401, 'INVALID_GOOGLE_TOKEN'],
      ['a wrong issuer', cred({ email: e, iss: 'https://evil.example' }), 401, 'INVALID_GOOGLE_TOKEN'],
      ['an unverified Google email', cred({ email: e, verified: false }), 403, 'GOOGLE_EMAIL_NOT_VERIFIED'],
      ['not a token at all', 'x'.repeat(200), 401, 'INVALID_GOOGLE_TOKEN'],
    ];
    for (const [name, c, status, code] of cases) {
      const r = await google(c);
      check(`${name}: ${status}, no token, nothing created`, r.status === status && r.data?.code === code && !r.data?.token && (await countByEmail(e)) === 0, r);
    }
    const missing = await google('' as any);
    check('an empty credential is refused', missing.status === 401);
  }

  section('TEST 12/13 — the simultaneous-login limit, shared by password and Google');
  {
    const one = await mkUser('limit1'); const oneSub = `g-${RUN}-limit1`; await link(one.id, oneSub);
    const p1 = await api('POST', '/api/auth/login', { body: { email: one.email, password: PASSWORD } });
    check('limit 1: a password session is open', p1.status === 200);
    const g1 = await google(cred({ sub: oneSub, email: one.email }));
    check('limit 1: Google from a second browser is refused by the same rule', g1.status === 409 && g1.data?.code === 'ACTIVE_SESSION_EXISTS' && (await liveCount(one.id)) === 1, g1);

    const three = await mkUser('limit3', { limit: 3 }); const threeSub = `g-${RUN}-limit3`; await link(three.id, threeSub);
    const a = await api('POST', '/api/auth/login', { body: { email: three.email, password: PASSWORD } });
    const b = await google(cred({ sub: threeSub, email: three.email }));
    const c = await google(cred({ sub: threeSub, email: three.email }));
    check('limit 3: a password session and two Google sessions are allowed', a.status === 200 && b.status === 200 && c.status === 200 && (await liveCount(three.id)) === 3, [a.status, b.status, c.status]);
    const d = await google(cred({ sub: threeSub, email: three.email }));
    check('limit 3: the fourth, from either, is refused: CONCURRENT_LOGIN_LIMIT_REACHED', d.status === 409 && d.data?.code === 'CONCURRENT_LOGIN_LIMIT_REACHED', d);
    const e = await api('POST', '/api/auth/login', { body: { email: three.email, password: PASSWORD } });
    check('and so is a fourth by password', e.status === 409 && e.data?.code === 'CONCURRENT_LOGIN_LIMIT_REACHED', e);
    const dReplace = await google(cred({ sub: threeSub, email: three.email }), { replaceExisting: true });
    check('"sign out the other one" is not honoured on a multi-login account', dReplace.status === 409 && (await liveCount(three.id)) === 3);
  }

  section('TEST 14/15 — account status is not bypassed');
  {
    const blocked = await mkUser('blockedlinked', { blocked: true, limit: 5 }); await link(blocked.id, `g-${RUN}-blocked`);
    const r = await google(cred({ sub: `g-${RUN}-blocked`, email: blocked.email }));
    check('a blocked account with a linked Google identity is refused (403), no session', r.status === 403 && !r.data?.token && (await liveCount(blocked.id)) === 0, r);
    const pending = await mkUser('pendinglinked', { status: 'PENDING_DELETION' }); await link(pending.id, `g-${RUN}-pending`);
    const p = await google(cred({ sub: `g-${RUN}-pending`, email: pending.email }));
    check('a pending-deletion account is refused (ACCOUNT_REMOVED)', p.status === 403 && p.data?.code === 'ACCOUNT_REMOVED' && (await liveCount(pending.id)) === 0, p);
    const pendingUnlinked = await mkUser('pendingunlinked', { status: 'PENDING_DELETION' });
    const pu = await google(cred({ sub: `g-${RUN}-pendingu`, email: pendingUnlinked.email }));
    check('an unlinked pending-deletion account cannot be linked or restored through Google', pu.status === 403 && pu.data?.code === 'ACCOUNT_REMOVED' && (await db.authIdentity.count({ where: { userId: pendingUnlinked.id } })) === 0, pu);
    const blockedUnlinked = await mkUser('blockedunlinked', { blocked: true });
    const bu = await google(cred({ sub: `g-${RUN}-blockedu`, email: blockedUnlinked.email }));
    check('an unlinked blocked account is refused too', bu.status === 403);
    const st = await db.user.findUnique({ where: { id: pending.id }, select: { status: true } });
    check('Google did not change the deletion status', st?.status === 'PENDING_DELETION');
  }

  section('TEST 16/17 + staff — memberships and privileged accounts are not inferred or taken over');
  {
    const inst = await db.institution.create({ data: { name: `Inst ${RUN}` } }); created.institutions.push(inst.id);
    const member = await mkUser('instmember', { role: 'Student', institutionId: inst.id, interested: ['Law'] });
    const sub = await db.subscription.create({ data: { institutionId: inst.id, planName: 'Plan', planType: 'Yearly', durationMonths: 12, status: 'Active', domains: ['Law'], endDate: new Date(Date.now() + 100 * 864e5) } });
    const first = await google(cred({ sub: `g-${RUN}-member`, email: member.email }));
    const ok = await api('POST', '/api/auth/google/link', { body: { linkToken: first.data?.linkToken, password: PASSWORD } });
    const m: any = await db.user.findUnique({ where: { id: member.id } });
    check('an institution member links Google and keeps institution, role and departments', ok.status === 200 && m.institutionId === inst.id && m.role === 'Student' && JSON.stringify(m.interestedDomains) === JSON.stringify(['Law']));
    await api('POST', '/api/auth/logout', { token: ok.data?.token });
    await db.subscription.delete({ where: { id: sub.id } });

    const eduEmail = `prof-${RUN}@university-${RUN}.edu`;
    const f = await google(cred({ sub: `g-${RUN}-edu`, email: eduEmail }));
    const done = await api('POST', '/api/auth/google/complete-signup', { body: { onboardingToken: f.data?.onboardingToken, ...profile(), name: 'Prof' } });
    const edu: any = await db.user.findUnique({ where: { id: done.data?.user?.id } });
    check('a university address does not make the person a member of any institution', done.status === 200 && edu?.institutionId === null && edu?.role === 'Subscriber', edu);
    created.users.push(edu.id);

    const boss = await mkUser('staffboss', { role: 'SuperAdmin' });
    const s = await google(cred({ sub: `g-${RUN}-boss`, email: boss.email }));
    check('Google is never linked to a Super Admin by address (403)', s.status === 403 && s.data?.code === 'GOOGLE_NOT_ALLOWED_FOR_STAFF' && !s.data?.token && (await db.authIdentity.count({ where: { userId: boss.id } })) === 0, s);
    const mgr = await mkUser('staffmgr', { role: 'SubscriptionManager' });
    const ms = await google(cred({ sub: `g-${RUN}-mgr`, email: mgr.email }));
    check('nor to any other staff role', ms.status === 403 && ms.data?.code === 'GOOGLE_NOT_ALLOWED_FOR_STAFF');
  }

  section('TEST 18 — two requests at once make one account');
  {
    const e = `race-${RUN}@google-test.invalid`;
    const f = await google(cred({ sub: `g-${RUN}-race`, email: e }));
    const ps = { onboardingToken: f.data?.onboardingToken, ...profile(), name: 'Racer' };
    const [r1, r2] = await Promise.all([api('POST', '/api/auth/google/complete-signup', { body: ps }), api('POST', '/api/auth/google/complete-signup', { body: ps })]);
    const ok = [r1, r2].filter(r => r.status === 200).length;
    check('exactly one succeeds', ok === 1, [r1.status, r2.status]);
    check('one user, one identity', (await countByEmail(e)) === 1 && (await db.authIdentity.count({ where: { providerSubject: `g-${RUN}-race` } })) === 1);
    const who = await db.user.findFirst({ where: { email: e } }); if (who) created.users.push(who.id);
    const loser = [r1, r2].find(r => r.status !== 200);
    check('the loser is told it is already registered, and nothing leaks', loser?.status === 409 && !loser?.data?.token, loser);
  }

  section('Abandoned onboarding, and one Google account for one member');
  {
    const e = `abandon-${RUN}@google-test.invalid`;
    await google(cred({ sub: `g-${RUN}-abandon`, email: e }));
    check('verifying with Google and leaving creates no user and no identity', (await countByEmail(e)) === 0 && (await db.authIdentity.count({ where: { providerSubject: `g-${RUN}-abandon` } })) === 0);
    const x = await mkUser('dupx'); const y = await mkUser('dupy');
    await link(x.id, `g-${RUN}-shared`);
    const f = await google(cred({ sub: `g-${RUN}-shared`, email: y.email }));
    check('a Google account already linked to one member signs in as THAT member, never as the other', f.status !== 200 || f.data?.user?.id === x.id, f.data?.user?.id);
    await api('POST', '/api/auth/logout', { token: f.data?.token });
    const g2 = await google(cred({ sub: `g-${RUN}-second`, email: x.email }));
    check('a member who already has a (different) Google account cannot be linked to another', g2.status === 409 && g2.data?.code === 'GOOGLE_ALREADY_LINKED_TO_OTHER', g2);
    const dup = await db.authIdentity.create({ data: { userId: y.id, provider: 'GOOGLE', providerSubject: `g-${RUN}-shared` } }).then(() => 'created', (e: any) => e?.code);
    check('the database itself refuses one Google account on two members', dup === 'P2002', dup);
  }

  section('Admin view');
  {
    const list = await api('GET', `/api/admin/users?search=${encodeURIComponent('newcomer-' + RUN)}`, { token: adminTok });
    const row = list.data?.data?.[0];
    check('a Google-only account is a normal active account, password not set, sign-in "Google"', row?.status === 'Active' && row?.hasPassword === false && JSON.stringify(row?.signInMethods) === JSON.stringify(['Google']), row);
    const both = await api('GET', `/api/admin/users?search=${encodeURIComponent('haspw-' + RUN)}`, { token: adminTok });
    check('a linked password account shows "Password" and "Google"', JSON.stringify(both.data?.data?.[0]?.signInMethods) === JSON.stringify(['Password', 'Google']), both.data?.data?.[0]?.signInMethods);
    check('the Google identifier and tokens are never in the list', !JSON.stringify(list.data).includes(newSub) && !JSON.stringify(list.data).includes('providerSubject'));
  }

  section('Email signup and login are unchanged');
  {
    const e = `emailuser-${RUN}@google-test.invalid`;
    const s = await api('POST', '/api/auth/signup', { body: { email: e, password: PASSWORD, name: 'Email User', organization: '', contact: '+91 9876543210', designation: '', interestedDomains: FOUR, registrantType: 'Solo', state: 'Delhi', country: 'India' } });
    const u: any = s.data?.user?.id ? await db.user.findUnique({ where: { id: s.data.user.id } }) : null;
    if (u) created.users.push(u.id);
    check('email signup still works and still sets a password hash', s.status === 200 && !!s.data?.token && /^\$2[aby]\$/.test(u?.password || ''), s);
    check('with the same four departments and no Google identity', JSON.stringify([...(u?.interestedDomains || [])].sort()) === JSON.stringify([...FOUR].sort()) && (await db.authIdentity.count({ where: { userId: u?.id } })) === 0);
    await api('POST', '/api/auth/logout', { token: s.data?.token });
    const l = await api('POST', '/api/auth/login', { body: { email: e, password: PASSWORD } });
    check('email login works', l.status === 200 && !!l.data?.token, l);
    await api('POST', '/api/auth/logout', { token: l.data?.token });
    const wrong = await api('POST', '/api/auth/login', { body: { email: e, password: 'wrong' } });
    check('a wrong password is still 401', wrong.status === 401);
    const dupe = await api('POST', '/api/auth/signup', { body: { email: e.toUpperCase(), password: PASSWORD, name: 'Again', contact: '1', interestedDomains: FOUR, registrantType: 'Solo' } });
    check('the same address again (any case) is still refused', dupe.status === 400);
    const goOnly = await google(cred({ sub: `g-${RUN}-emailuser`, email: e }));
    check('and that email account is offered the link step when Google presents its address', goOnly.data?.status === 'ACCOUNT_LINK_REQUIRED');
    const noPwUser = await mkUser('nopw', { password: false });
    const np = await api('POST', '/api/auth/login', { body: { email: noPwUser.email, password: 'anything' } });
    check('an account with no password cannot be entered by password', np.status === 401);
  }
} finally {
  await stop(srv);
  await db.authIdentity.deleteMany({ where: { OR: [{ userId: { in: created.users } }, { providerSubject: { contains: RUN } }] } }).catch(() => {});
  const stray = await db.user.findMany({ where: { email: { contains: `-${RUN}@` } }, select: { id: true } }).catch(() => [] as any[]);
  const ids = [...new Set([...created.users, ...stray.map((u: any) => u.id)])];
  await db.lead.deleteMany({ where: { email: { contains: `-${RUN}@` } } }).catch(() => {});
  await db.freeSession.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.userSession.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.subscription.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.adminAuditLog.deleteMany({ where: { adminEmail: { contains: `-${RUN}@` } } as any }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await db.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
