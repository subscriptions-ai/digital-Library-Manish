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
import { signGoogleToken, readGoogleToken, googleClientIdProblem } from '../src/server/googleAuth';
import { initializeGoogleOnce } from '../src/lib/google';

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

section('Part 1b — the client ID, GIS initialization and the service worker');
{
  const good = '111111111111-k3j9x0q2m5n8p1r4t7v0w3y6z9a2c5e8.apps.googleusercontent.com';
  check('the real-looking ID is accepted', googleClientIdProblem(good) === null);
  const typo = good.replace('x0q2', 'xOq2');
  check('the capital-O-for-zero typo that broke production is caught, and named', /character a Google client ID never has/.test(googleClientIdProblem(typo) || ''), googleClientIdProblem(typo));
  check('a missing or empty ID is reported', /not set, or is empty/.test(googleClientIdProblem('') || ''));
  const shaped = '231482248019-31fsa96pu9qb9a2ks71eo1evj4je7b6a.apps.googleusercontent.com'.replace('231482248019', '555555555555').replace('31fsa96pu9qb9a2ks71eo1evj4je7b6a', 'q7wer1ty2ui3op4as5df6gh7jk8lz9xc');
  check('the shape of a real ID (12-digit project, 32 lower-case letters and digits) is accepted, and a stray newline or space around it is trimmed away', googleClientIdProblem(shaped) === null && googleClientIdProblem((shaped + ' \r\n').trim()) === null);
  check('an ID wrapped in quotes is named as such', /quotation marks/.test(googleClientIdProblem(`"${shaped}"`) || ''));
  check('an invisible character from pasting is named, with its code point', /U\+200B/.test(googleClientIdProblem(shaped.replace('q7w', 'q7\u200Bw')) || ''));
  check('whitespace, a wrong suffix and a missing project number are caught', !!googleClientIdProblem(good + ' ') && !!googleClientIdProblem(good.replace('.apps.googleusercontent.com', '.example.com')) && !!googleClientIdProblem('4q0oiqabika4b5m34870osftvjtg3vtj.apps.googleusercontent.com'));
  // GIS: initialize runs once however many times pages mount (sign-in, sign-up, React's double effect).
  const calls: any[] = [];
  const gsi = { initialize: (c: any) => calls.push(c), renderButton: () => {} };
  const heard: string[] = [];
  const stop1 = initializeGoogleOnce(gsi as any, good, c => heard.push('first:' + c));
  const stop2 = initializeGoogleOnce(gsi as any, good, c => heard.push('second:' + c));
  check('GIS initialize() ran exactly once for two mounts with the same ID', calls.length === 1 && calls[0].client_id === good, calls.length);
  calls[0].callback({ credential: 'abc' });
  check('a credential reaches only the page that is showing the button now', heard.length === 1 && heard[0] === 'second:abc', heard);
  stop1(); calls[0].callback({ credential: 'def' });
  check('an older page stopping does not silence the current one', heard[1] === 'second:def');
  stop2(); calls[0].callback({ credential: 'ghi' });
  check('once nobody is listening a credential is ignored, not thrown', heard.length === 2);
  check('no client secret is ever configured in the browser code (no GOCSPX in src)', !/GOCSPX/.test(readFileSync(new URL('../src/lib/google.ts', import.meta.url), 'utf8')));
  // The service worker must never answer anything but a plain GET of a static asset or a page load.
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  check('service worker: non-GET (every sign-in, sign-up and Google POST) is never intercepted', /if \(req\.method !== 'GET'\) return;/.test(sw));
  check('service worker: /api/ is never intercepted or cached', /startsWith\('\/api\/'\) \|\| url\.pathname\.startsWith\('\/uploads\/'\)\) return;/.test(sw));
  check('service worker: anything sent with credentials is never intercepted', /headers\.has\('authorization'\)\) return;/.test(sw));
  check('service worker: third parties (accounts.google.com) are not ours to touch', /url\.origin !== self\.location\.origin\) return;/.test(sw));
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
// Shaped like a real client ID (the server refuses anything that could not be one): project number, then 32 lower-case letters and digits.
const AUD = `123456789012-${crypto.randomBytes(16).toString('hex')}.apps.googleusercontent.com`;
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
const start = async (port = PORT, clientId = AUD, extraEnv: Record<string, string> = {}): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-google-auth.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(port), NODE_ENV: 'development', MEDIA_STORAGE_DRIVER: 'local-persistent', DISABLE_HMR: 'true',
      GOOGLE_CLIENT_ID: clientId, GOOGLE_TEST_CERT_FILE: certFile, API_TEST_BLOCK_DELAY_MS: '50',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', ...extraEnv },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`http://127.0.0.1:${port}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 120_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(700); }
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

  section('Runtime configuration: one client ID, from the server');
  {
    const r = await fetch(`${BASE}/api/public/google-config`);
    const body = await r.json();
    check('the page is told the server\'s client ID, and that sign-in is on', r.status === 200 && body.enabled === true && body.clientId === AUD, body);
    check('the answer carries only those two fields (no secret, nothing else)', JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['clientId', 'enabled']));
    check('and it is never cached', /no-store/.test(r.headers.get('cache-control') || ''));
    check('it does not spend the sign-in rate limit (a hundred page loads still leave room to sign in)',
      (await Promise.all(Array.from({ length: 70 }, () => fetch(`${BASE}/api/public/google-config`).then(x => x.status)))).every(c => c === 200)
      && (await google(cred({ email: `ratelimit-${RUN}@google-test.invalid` }))).status === 200);
    const plain = await mkUser('plainuser');
    const plainTok = await sessionFor(plain);
    check('the Super Admin diagnostic is refused to anyone else (403)', (await api('GET', '/api/admin/auth/google-status', { token: plainTok })).status === 403 && (await api('GET', '/api/admin/auth/google-status')).status === 401);
    const st = await api('GET', '/api/admin/auth/google-status', { token: adminTok });
    check('the Super Admin sees: enabled, no problem, a masked ID, and no full ID or secret',
      st.status === 200 && st.data?.enabled === true && st.data?.runtimeConfigured === true && st.data?.formatValid === true && st.data?.validationReason === null
        && st.data?.trimmedLength === AUD.length && /…/.test(st.data?.maskedClientId) && !JSON.stringify(st.data).includes(AUD) && !/GOCSPX|secret/i.test(JSON.stringify(st.data)), st.data);

    // A server started with the classic typo (capital O for zero) refuses to hand a browser an ID that cannot exist.
    const BAD_PORT = 3113;
    const bad = await start(BAD_PORT, `111111111111-k3j9xOq2m5n8p1r4t7v0w3y6z9a2c5e8.apps.googleusercontent.com`, { VITE_GOOGLE_CLIENT_ID: AUD });
    try {
      const cfg = await (await fetch(`http://127.0.0.1:${BAD_PORT}/api/public/google-config`)).json();
      check('with a mistyped ID Google is OFF for the page (no broken button), and no ID is offered', cfg.enabled === false && cfg.clientId === null, cfg);
      const attempt = await fetch(`http://127.0.0.1:${BAD_PORT}/api/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: cred({ email: `x-${RUN}@google-test.invalid` }) }) });
      check('and the server answers 503 "unavailable, use email", not a verification failure', attempt.status === 503 && (await attempt.json()).code === 'GOOGLE_UNAVAILABLE');
      check('the start-up log says what the process sees (exists, length, format) and names the cause', /exists=true, trimmedLength=72, formatValid=false/.test(bad.log) && /DISABLED/.test(bad.log) && /character a Google client ID never has/.test(bad.log) && /VITE_GOOGLE_CLIENT_ID is set but is no longer read/.test(bad.log) && /DIFFER/.test(bad.log), bad.log.split('\n').filter(l => /Google|VITE_/.test(l)).join(' | '));
    } finally { await stop(bad); }
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

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  section('EMAIL VERIFICATION — an address Google has confirmed is verified: in the database, in the response, after a reload');
  {
    const verifiedRows = (email: string) => db.emailVerification.findMany({ where: { email: { equals: email, mode: 'insensitive' }, isVerified: true } });
    const auditCount = (email: string) => db.adminAuditLog.count({ where: { adminEmail: email, action: 'EMAIL_VERIFIED_VIA_GOOGLE' } as any });
    const row = (id: string) => db.user.findUnique({ where: { id } }) as Promise<any>;

    // 1 + 13 — an existing, unverified password account: Google alone does not verify it (it is not even connected yet); the password proof does.
    const u1 = await mkUser('ev-pw', { emailVerified: false, role: 'Student', interested: FOUR });
    const s1 = `g-${RUN}-ev-pw`;
    const b1 = await row(u1.id);
    const first = await google(cred({ sub: s1, email: u1.email.toUpperCase() }));
    check('EV1a: Google presenting the address asks for the account\'s password first, and verifies nothing yet', first.data?.status === 'ACCOUNT_LINK_REQUIRED' && !first.data?.token && (await row(u1.id)).emailVerifiedAt === null && (await verifiedRows(u1.email)).length === 0, first.data);
    const ok1 = await api('POST', '/api/auth/google/link', { body: { linkToken: first.data.linkToken, password: PASSWORD } });
    const a1 = await row(u1.id);
    check('EV1b: after the password proof the SAME user is verified, with a timestamp, and a session exists', ok1.status === 200 && !!ok1.data?.token && !!a1.emailVerifiedAt && a1.id === u1.id && (await liveCount(u1.id)) === 1, ok1.data);
    check('EV1c: the OTP table agrees (so nothing that reads it asks again)', (await verifiedRows(u1.email)).length === 1);
    check('EV1d: the sign-in response already says verified, so the prompt never opens', ok1.data?.user?.isEmailVerified === true, ok1.data?.user?.isEmailVerified);
    const m1 = await me(ok1.data.token);
    check('EV1e: the current-user endpoint says verified, immediately and after a "reload" (a second call)', m1.data?.isEmailVerified === true && (await me(ok1.data.token)).data?.isEmailVerified === true, m1.data?.isEmailVerified);
    check('EV1f: nothing else changed: role, departments, institution, password hash', a1.role === b1.role && JSON.stringify(a1.interestedDomains) === JSON.stringify(b1.interestedDomains) && a1.institutionId === b1.institutionId && a1.password === b1.password);
    check('EV1g: one audit event records it, with no token in it', (await auditCount(u1.email)) === 1 && !JSON.stringify(await db.adminAuditLog.findMany({ where: { adminEmail: u1.email, action: 'EMAIL_VERIFIED_VIA_GOOGLE' } as any })).includes(first.data.linkToken));
    await api('POST', '/api/auth/logout', { token: ok1.data.token });

    // 2 — an account already linked, never verified: its next Google sign-in verifies it.
    const u2 = await mkUser('ev-linked', { emailVerified: false });
    await link(u2.id, `g-${RUN}-ev-linked`);
    const r2 = await google(cred({ sub: `g-${RUN}-ev-linked`, email: u2.email }));
    const a2 = await row(u2.id);
    check('EV2: a linked, unverified account becomes verified on a matching Google sign-in (database, response, /me)', r2.status === 200 && !!a2.emailVerifiedAt && r2.data?.user?.isEmailVerified === true && (await me(r2.data.token)).data?.isEmailVerified === true && (await verifiedRows(u2.email)).length === 1, r2.data?.user?.isEmailVerified);
    await api('POST', '/api/auth/logout', { token: r2.data?.token });

    // 3 — already verified: the original timestamp survives, and no second event is written.
    const u3 = await mkUser('ev-already');
    await link(u3.id, `g-${RUN}-ev-already`);
    const t0 = (await row(u3.id)).emailVerifiedAt;
    const r3 = await google(cred({ sub: `g-${RUN}-ev-already`, email: u3.email }));
    check('EV3: a verified user stays verified and the original timestamp is not overwritten', r3.status === 200 && +(await row(u3.id)).emailVerifiedAt === +t0 && (await auditCount(u3.email)) === 0, r3.data?.user?.isEmailVerified);
    check('EV3b: the response says verified (the account\'s own record counts, not only the OTP table)', r3.data?.user?.isEmailVerified === true && (await me(r3.data.token)).data?.isEmailVerified === true);
    await api('POST', '/api/auth/logout', { token: r3.data?.token });

    // 4 — a new Google user is created verified, and still has to give the registration details.
    const e4 = `ev-new-${RUN}@google-test.invalid`;
    const g4 = await google(cred({ sub: `g-${RUN}-ev-new`, email: e4, name: 'Ev New' }));
    check('EV4a: nothing is created until the registration details are given', g4.data?.status === 'PROFILE_REQUIRED' && (await countByEmail(e4)) === 0);
    const refused = await api('POST', '/api/auth/google/complete-signup', { body: { onboardingToken: g4.data.onboardingToken, ...profile({ interestedDomains: [] }), name: 'Ev New' } });
    check('EV4b: Google does not replace profile completion: missing details are still refused', refused.status === 400 && (await countByEmail(e4)) === 0, refused.data);
    const done = await api('POST', '/api/auth/google/complete-signup', { body: { onboardingToken: g4.data.onboardingToken, ...profile(), name: 'Ev New' } });
    const made = await db.user.findFirst({ where: { email: e4 } }) as any; if (made) created.users.push(made.id);
    check('EV4c: created verified (timestamp, OTP table, response and /me), as an ordinary Subscriber', done.status === 200 && !!made?.emailVerifiedAt && made?.role === 'Subscriber' && (await verifiedRows(e4)).length === 1 && done.data?.user?.isEmailVerified === true && (await me(done.data.token)).data?.isEmailVerified === true, done.data?.user?.isEmailVerified);
    await api('POST', '/api/auth/logout', { token: done.data?.token });

    // 5 — case: one account, however the address is written.
    const mixed = await db.user.create({ data: { email: `Mixed-Case-${RUN}@google-test.invalid`, password: HASH, role: 'Subscriber', displayName: 'Mixed', emailVerifiedAt: null } as any });
    created.users.push(mixed.id);
    await link(mixed.id, `g-${RUN}-ev-mixed`);
    const r5 = await google(cred({ sub: `g-${RUN}-ev-mixed`, email: `MIXED-case-${RUN}@GOOGLE-test.invalid` }));
    check('EV5: a different capitalisation reaches the same account, verifies it, and creates no second one', r5.status === 200 && !!(await row(mixed.id)).emailVerifiedAt && (await countByEmail(mixed.email)) === 1 && r5.data?.user?.isEmailVerified === true, r5.data);
    await api('POST', '/api/auth/logout', { token: r5.data?.token });

    // 6/7/8 — credentials that must leave an unverified account unverified.
    const u6 = await mkUser('ev-bad', { emailVerified: false }); await link(u6.id, `g-${RUN}-ev-bad`);
    const bads: [string, string, any][] = [
      ['wrong audience', cred({ sub: `g-${RUN}-ev-bad`, email: u6.email, aud: 'someone-elses-client.apps.googleusercontent.com' }), {}],
      ['expired', cred({ sub: `g-${RUN}-ev-bad`, email: u6.email, exp: Math.floor(Date.now() / 1000) - 3600 }), {}],
      ['bad signature', cred({ sub: `g-${RUN}-ev-bad`, email: u6.email, key: other.privateKey }), {}],
      ['email_verified false', cred({ sub: `g-${RUN}-ev-bad`, email: u6.email, verified: false }), { verified: true, isEmailVerified: true, emailVerified: true, email_verified: true, email: u6.email }],
    ];
    for (const [name, c, extra] of bads) {
      const r = await google(c, extra);
      const u = await row(u6.id);
      check(`EV6: ${name} → refused, no session, the account is still unverified`, [401, 403].includes(r.status) && !r.data?.token && u.emailVerifiedAt === null && (await verifiedRows(u6.email)).length === 0 && (await liveCount(u6.id)) === 0, r);
    }
    const g6 = await google(cred({ sub: `g-${RUN}-ev-bad`, email: `someone-else-${RUN}@google-test.invalid` }));
    check('EV6b: a valid credential whose address is NOT this account\'s own cannot verify it (the identity is the Google subject; the address must match too)', g6.status === 200 && (await row(u6.id)).emailVerifiedAt === null && (await verifiedRows(u6.email)).length === 0, g6.status);
    const un = await row(u6.id);
    check('EV6c: …it signed the linked person in, and their own address stays unverified', un.emailVerifiedAt === null, un.emailVerifiedAt);
    if (g6.data?.token) await api('POST', '/api/auth/logout', { token: g6.data.token });

    // 9/10 — blocked and pending-deletion accounts are refused before anything about them changes.
    const u9 = await mkUser('ev-blocked', { emailVerified: false, blocked: true }); await link(u9.id, `g-${RUN}-ev-blocked`);
    const r9 = await google(cred({ sub: `g-${RUN}-ev-blocked`, email: u9.email }));
    check('EV9: blocked → 403, no session, still unverified', r9.status === 403 && !r9.data?.token && (await row(u9.id)).emailVerifiedAt === null && (await verifiedRows(u9.email)).length === 0, r9.data);
    const u10 = await mkUser('ev-pending', { emailVerified: false, status: 'PENDING_DELETION' }); await link(u10.id, `g-${RUN}-ev-pending`);
    const r10 = await google(cred({ sub: `g-${RUN}-ev-pending`, email: u10.email }));
    check('EV10: pending deletion → ACCOUNT_REMOVED, still pending, still unverified', r10.status === 403 && r10.data?.code === 'ACCOUNT_REMOVED' && (await row(u10.id)).status === 'PENDING_DELETION' && (await row(u10.id)).emailVerifiedAt === null, r10.data);

    // 11 — the session limit is the ordinary one.
    const u11 = await mkUser('ev-limit', { emailVerified: false }); await link(u11.id, `g-${RUN}-ev-limit`);
    const p11 = await api('POST', '/api/auth/login', { body: { email: u11.email, password: PASSWORD } });
    const g11 = await google(cred({ sub: `g-${RUN}-ev-limit`, email: u11.email }));
    check('EV11: limit 1, a session already open → Google is refused by the same rule', p11.status === 200 && g11.status === 409 && g11.data?.code === 'ACTIVE_SESSION_EXISTS' && (await liveCount(u11.id)) === 1, g11.data);
    await api('POST', '/api/auth/logout', { token: p11.data?.token });

    // 12 — password sign-in: unverified stays unverified (the prompt shows), verified through the OTP table stays verified.
    const u12 = await mkUser('ev-password', { emailVerified: false });
    const p12 = await api('POST', '/api/auth/login', { body: { email: u12.email, password: PASSWORD } });
    check('EV12a: password sign-in of an unverified account says isEmailVerified false, in the response and in /me (the prompt shows)', p12.status === 200 && p12.data?.user?.isEmailVerified === false && (await me(p12.data.token)).data?.isEmailVerified === false, p12.data?.user?.isEmailVerified);
    await db.emailVerification.create({ data: { email: u12.email, isVerified: true } });
    check('EV12b: verified by the code (OTP table only) still counts as verified', (await me(p12.data.token)).data?.isEmailVerified === true);
    await api('POST', '/api/auth/logout', { token: p12.data?.token });

    // 14 — the send/confirm endpoints, for an account Google verified.
    const p14 = await api('POST', '/api/auth/login', { body: { email: u3.email, password: PASSWORD } });
    const send = await api('POST', '/api/verify/check-or-send', { token: p14.data?.token, body: { email: u3.email } });
    check('EV14a: asking to verify an already-verified account (signed in as it) says so, sends no code, makes no OTP row with a code', send.status === 200 && send.data?.verified === true && !send.data?.otpSent && (await db.emailVerification.count({ where: { email: u3.email, otp: { not: null } } })) === 0, send.data);
    const confirm = await api('POST', '/api/verify/confirm', { token: p14.data?.token, body: { email: u3.email, otp: '000000' } });
    check('EV14b: an old code entered afterwards is told "already verified", not an error', confirm.status === 200 && confirm.data?.alreadyVerified === true, confirm);
    const stranger = await api('POST', '/api/verify/confirm', { body: { email: u3.email, otp: '000000' } });
    check('EV14c: someone who is not that account gets the same plain refusal as ever (no way to ask which addresses are verified)', stranger.status === 400, stranger);
    await api('POST', '/api/auth/logout', { token: p14.data?.token });
  }
} finally {
  await stop(srv);
  await db.authIdentity.deleteMany({ where: { OR: [{ userId: { in: created.users } }, { providerSubject: { contains: RUN } }] } }).catch(() => {});
  const stray = await db.user.findMany({ where: { email: { contains: `-${RUN}@` } }, select: { id: true } }).catch(() => [] as any[]);
  const ids = [...new Set([...created.users, ...stray.map((u: any) => u.id)])];
  await db.lead.deleteMany({ where: { email: { contains: `-${RUN}@` } } }).catch(() => {});
  await db.emailVerification.deleteMany({ where: { email: { contains: `-${RUN}@`, mode: 'insensitive' } } }).catch(() => {});
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
