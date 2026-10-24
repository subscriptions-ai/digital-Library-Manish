/**
 * Account type and professional designation, through the real routes: the institution Add / Edit User and bulk import, the Admin edit, and public signup.
 *
 *   npx tsx scripts/test-designation-api.ts
 *
 * A real server on the throwaway database `stm_ingestion_test` (needs the current schema pushed to it). Every outbound request is blocked.
 * Cases 1–10 of the brief are marked.
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

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const PORT = 3112, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const DOMAIN = '@designation-api.invalid';
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const created = { users: [] as string[], institutions: [] as string[] };
const mkInst = async (name: string) => { const i = await db.institution.create({ data: { name: `${name} ${RUN}` } }); created.institutions.push(i.id); return i; };
const mkUser = async (tag: string, o: { role?: string; institutionId?: string | null; memberRole?: string | null; designation?: string | null; org?: string } = {}) => {
  const u = await db.user.create({ data: { email: `${tag}-${RUN}${DOMAIN}`, password: 'x', role: o.role || 'Student', displayName: tag, institutionId: o.institutionId ?? null,
    memberRole: o.memberRole ?? null, designation: o.designation ?? null, organization: o.org ?? null, emailVerifiedAt: new Date() } as any });
  created.users.push(u.id); return u;
};
const session = async (u: { id: string; email: string; role: string }) => {
  const sid = `sid-da-${RUN}-${u.id.slice(0, 6)}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role: u.role, email: u.email }, SECRET, { expiresIn: '1h' });
};

type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', DISABLE_HMR: 'true' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 120_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(700); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const call = async (method: string, path: string, token: string | null, body?: any) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const row = (id: string) => db.user.findUnique({ where: { id } }) as Promise<any>;
const byEmail = (tag: string) => db.user.findFirst({ where: { email: `${tag}-${RUN}${DOMAIN}` } }) as Promise<any>;
const add = (tok: string, tag: string, o: any) => call('POST', '/api/institution/students', tok, { name: tag, email: `${tag}-${RUN}${DOMAIN}`, password: 'Temp-Pass-123', mobile: '9876543210', branch: 'CSE', department: 'Eng', ...o });

let srv: Srv | null = null;
try {
  const inst = await mkInst('Designation college');
  const admin = await mkUser('admin', { role: 'SuperAdmin' });
  const adminTok = await session(admin);
  const librarian = await mkUser('librarian', { role: 'Institution', institutionId: inst.id, designation: 'Librarian', org: inst.name });
  const libTok = await session(librarian);
  // A running subscription: Pro features (Student) open, and no seat limit applies (none records `seatsIncluded`).
  await db.subscription.create({ data: { userId: librarian.id, institutionId: inst.id, planName: 'Plan', planType: 'Yearly', durationMonths: 12, status: 'Active', domains: ['Law'], endDate: new Date(Date.now() + 100 * 864e5) } as any });
  srv = await start();

  section('1. Faculty + Associate Professor');
  {
    const r = await add(libTok, 'faculty', { memberRole: 'Faculty', designation: 'Associate Professor' });
    const u = await byEmail('faculty');
    check('added', r.status === 200 && !!u, r);
    check('account type and designation are stored separately: memberRole Faculty, designation Associate Professor', u?.memberRole === 'Faculty' && u?.designation === 'Associate Professor', u && { m: u.memberRole, d: u.designation });
    check('the technical access role is untouched (the institution\'s member class)', u?.role === 'Student' && u?.institutionId === inst.id);
    const list = await call('GET', '/api/institution/students', libTok);
    const li = (list.data || []).find((x: any) => x.email === u?.email);
    check('the directory shows Account Type Faculty beside the designation Associate Professor', li?.accessRole === 'Faculty' && li?.designation === 'Associate Professor', li && { a: li.accessRole, d: li.designation });
    const admList = await call('GET', `/api/admin/users?search=${encodeURIComponent('faculty-' + RUN)}`, adminTok);
    const ai = admList.data?.data?.[0];
    check('Admin → Users shows both: account type Faculty and designation Associate Professor', ai?.accessRole === 'Faculty' && ai?.designation === 'Associate Professor', ai && { a: ai.accessRole, d: ai.designation });
  }

  section('2. Researcher + Research Scientist');
  {
    const r = await add(libTok, 'researcher', { memberRole: 'Researcher', designation: 'Research Scientist' });
    const u = await byEmail('researcher');
    check('saved as Researcher / Research Scientist', r.status === 200 && u?.memberRole === 'Researcher' && u?.designation === 'Research Scientist', u && { m: u.memberRole, d: u.designation });
  }

  section('3. Student + PhD Scholar');
  {
    const r = await add(libTok, 'student', { memberRole: 'Student', designation: 'PhD Scholar' });
    const u = await byEmail('student');
    check('saved as Student / PhD Scholar', r.status === 200 && u?.memberRole === 'Student' && u?.designation === 'PhD Scholar', r);
  }

  section('5. Researcher → Other: the title is stored, not the word "Other"');
  {
    const r = await add(libTok, 'custom', { memberRole: 'Researcher', designation: 'Clinical Research Coordinator' });
    const u = await byEmail('custom');
    check('role = Researcher, designation = Clinical Research Coordinator', r.status === 200 && u?.memberRole === 'Researcher' && u?.designation === 'Clinical Research Coordinator', u && { m: u.memberRole, d: u.designation });
    const extra = await add(libTok, 'spaced', { memberRole: 'Researcher', designation: '  Clinical   Research   Coordinator  ' });
    check('whitespace is trimmed and squeezed', (await byEmail('spaced'))?.designation === 'Clinical Research Coordinator', extra);
    const literal = await add(libTok, 'literalother', { memberRole: 'Researcher', designation: 'Other' });
    check('the literal word "Other" is refused, and nothing is created', literal.status === 400 && literal.data?.code === 'INVALID_DESIGNATION' && !(await byEmail('literalother')), literal);
  }

  section('A real-world cross-category title is accepted, not rejected');
  {
    const r = await add(libTok, 'cross', { memberRole: 'Researcher', designation: 'Associate Professor' });
    const u = await byEmail('cross');
    check('Researcher + Associate Professor is stored exactly as given', r.status === 200 && u?.memberRole === 'Researcher' && u?.designation === 'Associate Professor', r);
    const intern = await add(libTok, 'crossb', { memberRole: 'Faculty', designation: 'Intern' });
    check('even a title from another list is accepted (suggestions are guidance, not a rule)', intern.status === 200 && (await byEmail('crossb'))?.designation === 'Intern', intern);
  }

  section('7. Invalid account type is refused');
  {
    for (const bad of ['Professor', 'Godmode', 'SuperAdmin', 'Institution Admin', 'Librarian', '']) {
      const r = await add(libTok, 'badrole', { memberRole: bad, designation: 'Professor' });
      check(`memberRole ${JSON.stringify(bad)} → 400`, r.status === 400 && r.data?.code === 'MEMBER_ROLE' && !(await byEmail('badrole')), r);
    }
    const none = await add(libTok, 'norole', { designation: 'Professor' });
    check('no account type, only a title → refused: the title never decides it', none.status === 400 && !(await byEmail('norole')), none);
  }

  section('8. Markup, script, length');
  {
    for (const bad of ['<script>alert(1)</script>', 'Professor<img src=x onerror=alert(1)>', '<b>Dean</b>', 'javascript:alert(1)', 'x'.repeat(101)]) {
      const r = await add(libTok, 'evil', { memberRole: 'Faculty', designation: bad });
      check(`${JSON.stringify(bad.slice(0, 34))} → 400, nothing created`, r.status === 400 && r.data?.code === 'INVALID_DESIGNATION' && !(await byEmail('evil')), r);
    }
    check('a non-text designation is refused', (await add(libTok, 'evil', { memberRole: 'Faculty', designation: { x: 1 } })).status === 400);
    const missing = await add(libTok, 'nodesig', { memberRole: 'Faculty' });
    check('a missing designation is refused on Add (it is required)', missing.status === 400 && missing.data?.code === 'INVALID_DESIGNATION' && !(await byEmail('nodesig')), missing);
    const ok100 = await add(libTok, 'long100', { memberRole: 'Faculty', designation: 'y'.repeat(100) });
    check('exactly 100 characters is fine', ok100.status === 200 && (await byEmail('long100'))?.designation?.length === 100, ok100);
  }

  section('6. A legacy user is neither erased nor mutated by an edit');
  const legacy = await mkUser('legacy', { institutionId: inst.id, memberRole: 'Researcher', designation: 'Associate Professor', org: inst.name });
  const old = await mkUser('oldmember', { institutionId: inst.id, designation: 'Professor', org: inst.name });       // no account type on record
  const bare = await mkUser('bare', { institutionId: inst.id, memberRole: 'Faculty', designation: null, org: inst.name });   // no title on record
  {
    const r = await call('PUT', `/api/institution/students/${legacy.id}`, libTok, { displayName: 'Legacy Renamed', memberRole: 'Researcher', branch: 'X' });
    const u = await row(legacy.id);
    check('renamed, and Researcher + Associate Professor is untouched', r.status === 200 && u.displayName === 'Legacy Renamed' && u.memberRole === 'Researcher' && u.designation === 'Associate Professor', u);
    const same = await call('PUT', `/api/institution/students/${legacy.id}`, libTok, { designation: 'Associate Professor', memberRole: 'Researcher' });
    check('saving the same pair changes nothing', same.status === 200 && (await row(legacy.id)).designation === 'Associate Professor');
    const blank = await call('PUT', `/api/institution/students/${legacy.id}`, libTok, { designation: '   ' });
    check('a designation on record cannot be blanked by an edit', blank.status === 400 && blank.data?.code === 'INVALID_DESIGNATION' && (await row(legacy.id)).designation === 'Associate Professor', blank);
    const evil = await call('PUT', `/api/institution/students/${legacy.id}`, libTok, { designation: '<script>alert(1)</script>' });
    check('markup in an edit is refused, the old title stays', evil.status === 400 && (await row(legacy.id)).designation === 'Associate Professor', evil);
    const none = await call('PUT', `/api/institution/students/${bare.id}`, libTok, { designation: '', displayName: 'Bare Renamed' });
    check('a person with no title may be saved without one', none.status === 200 && (await row(bare.id)).designation === null && (await row(bare.id)).displayName === 'Bare Renamed', none);
    const setNew = await call('PUT', `/api/institution/students/${bare.id}`, libTok, { designation: 'Senior Lecturer' });
    check('…and given one later', setNew.status === 200 && (await row(bare.id)).designation === 'Senior Lecturer');
    const badRole = await call('PUT', `/api/institution/students/${legacy.id}`, libTok, { memberRole: 'Godmode' });
    check('an invalid account type in an edit is refused', badRole.status === 400 && badRole.data?.code === 'MEMBER_ROLE' && (await row(legacy.id)).memberRole === 'Researcher', badRole);
    const admList = await call('GET', `/api/admin/users?search=${encodeURIComponent('oldmember-' + RUN)}`, adminTok);
    const oi = admList.data?.data?.[0];
    check('a member with a title and NO account type is shown as needing review, never as Faculty from the title', oi?.accessRole === null && oi?.accessRoleSource === 'review' && oi?.designation === 'Professor', oi && { a: oi.accessRole, s: oi.accessRoleSource });
    void old;
  }

  section('10. Changing the designation changes no access');
  {
    const u0 = await row(legacy.id);
    const subs0 = await db.subscription.count({ where: { OR: [{ userId: legacy.id }, { institutionId: inst.id }] } });
    const access0 = await db.institutionMemberAccess.count({ where: { userId: legacy.id } });
    const r = await call('PUT', `/api/institution/students/${legacy.id}`, libTok, { designation: 'Professor' });
    const u1 = await row(legacy.id);
    check('the designation changed', r.status === 200 && u1.designation === 'Professor');
    check('technical role, account type, institution, status and block are exactly as before', u1.role === u0.role && u1.memberRole === u0.memberRole && u1.institutionId === u0.institutionId && u1.status === u0.status && u1.isBlocked === u0.isBlocked, { b: [u0.role, u0.memberRole], a: [u1.role, u1.memberRole] });
    check('no subscription or licensed access was created or removed', (await db.subscription.count({ where: { OR: [{ userId: legacy.id }, { institutionId: inst.id }] } })) === subs0 && (await db.institutionMemberAccess.count({ where: { userId: legacy.id } })) === access0);
    const asAdmin = await call('PUT', `/api/admin/users/${legacy.id}`, adminTok, { designation: 'Dean' });
    const u2 = await row(legacy.id);
    check('the same through the Admin edit', asAdmin.status === 200 && u2.designation === 'Dean' && u2.role === u0.role && u2.memberRole === u0.memberRole);
  }

  section('Admin → Users → Edit');
  {
    const evil = await call('PUT', `/api/admin/users/${legacy.id}`, adminTok, { designation: '<img src=x onerror=alert(1)>' });
    check('markup is refused', evil.status === 400 && evil.data?.code === 'INVALID_DESIGNATION', evil);
    const long = await call('PUT', `/api/admin/users/${legacy.id}`, adminTok, { designation: 'z'.repeat(101) });
    check('over 100 characters is refused', long.status === 400, long);
    const custom = await call('PUT', `/api/admin/users/${legacy.id}`, adminTok, { designation: 'Clinical Research Coordinator' });
    check('a written-in title is stored as written', custom.status === 200 && (await row(legacy.id)).designation === 'Clinical Research Coordinator', custom);
    const type = await call('PUT', `/api/admin/users/${legacy.id}`, adminTok, { memberRole: 'Faculty' });
    check('an institution member\'s account type can be set', type.status === 200 && (await row(legacy.id)).memberRole === 'Faculty', type);
    const bad = await call('PUT', `/api/admin/users/${legacy.id}`, adminTok, { memberRole: 'Superhero' });
    check('an invalid account type is refused', bad.status === 400 && (await row(legacy.id)).memberRole === 'Faculty', bad);
    const forStaff = await call('PUT', `/api/admin/users/${admin.id}`, adminTok, { memberRole: 'Faculty' });
    check('an account type cannot be put on a staff account', forStaff.status === 400 && (await row(admin.id)).memberRole === null, forStaff);
    const forLib = await call('PUT', `/api/admin/users/${librarian.id}`, adminTok, { memberRole: 'Student' });
    check('nor on the institution\'s own account (that is Institution Admin, by its technical role)', forLib.status === 400 && (await row(librarian.id)).memberRole === null, forLib);
    const list = await call('GET', `/api/admin/users?search=${encodeURIComponent('librarian-' + RUN)}`, adminTok);
    check('the institution account reads as Institution Admin', list.data?.data?.[0]?.accessRole === 'Institution Admin' && list.data?.data?.[0]?.designation === 'Librarian', list.data?.data?.[0]);
    const roleChange = await call('PUT', `/api/admin/users/${legacy.id}`, adminTok, { designation: 'Professor', memberRole: 'Researcher' });
    check('changing the account type does not touch the technical role', roleChange.status === 200 && (await row(legacy.id)).role === 'Student', roleChange);
  }

  section('Bulk import: designation is optional but still checked');
  {
    const r = await call('POST', '/api/institution/students/bulk', libTok, { users: [
      { name: 'Bulk Ok', email: `bulkok-${RUN}${DOMAIN}`, password: 'Temp-Pass-123', role: 'Faculty', designation: 'Lecturer' },
      { name: 'Bulk Evil', email: `bulkevil-${RUN}${DOMAIN}`, password: 'Temp-Pass-123', role: 'Faculty', designation: '<script>alert(1)</script>' },
      { name: 'Bulk None', email: `bulknone-${RUN}${DOMAIN}`, password: 'Temp-Pass-123', role: 'Student' },
      { name: 'Bulk Custom', email: `bulkcustom-${RUN}${DOMAIN}`, password: 'Temp-Pass-123', role: 'Researcher', designation: 'Clinical Research Coordinator' },
      { name: 'Bulk Other', email: `bulkother-${RUN}${DOMAIN}`, password: 'Temp-Pass-123', role: 'Researcher', designation: 'Other' },
    ] });
    check('the clean rows are added, the two bad ones refused with a reason', r.status === 200 && r.data?.successCount === 3 && r.data?.errorCount === 2, r.data);
    check('the markup row created nothing, the "Other" row created nothing', !(await byEmail('bulkevil')) && !(await byEmail('bulkother')));
    check('a row with no designation is fine', (await byEmail('bulknone'))?.designation === null && (await byEmail('bulknone'))?.memberRole === 'Student');
    check('a written-in title is stored as written', (await byEmail('bulkcustom'))?.designation === 'Clinical Research Coordinator');
  }

  section('Public signup');
  {
    const body = (tag: string, o: any) => ({ email: `${tag}-${RUN}${DOMAIN}`, password: 'Sign-Up-Pass-1', name: tag, organization: o.org ?? '', contact: '9999999999', interestedDomains: ['Law'], state: 'Delhi', country: 'India', attribution: {}, ...o });
    const verified = (tag: string) => db.emailVerification.upsert({ where: { email: `${tag}-${RUN}${DOMAIN}` }, create: { email: `${tag}-${RUN}${DOMAIN}`, isVerified: true } as any, update: { isVerified: true } as any });
    const signup = async (tag: string, o: any) => { await verified(tag); const r = await call('POST', '/api/auth/signup', null, body(tag, o)); const u = await byEmail(tag); if (u) created.users.push(u.id); return { r, u }; };

    const a = await signup('sg-custom', { registrantType: 'Solo', designation: 'Clinical Research Coordinator' });
    check('Solo + a written-in title: the account carries the title', a.r.status === 200 && a.u?.designation === 'Clinical Research Coordinator' && a.u?.role === 'Subscriber', { s: a.r.status, d: a.u?.designation, r: a.u?.role });
    const b = await signup('sg-listed', { registrantType: 'Solo', designation: "Master's Student" });
    check('a listed title is stored as it was', b.u?.designation === "Master's Student");
    const c = await signup('sg-evil', { registrantType: 'Solo', designation: '<script>alert(1)</script>' });
    check('markup in a written-in title is not stored (the account is still made)', c.r.status === 200 && c.u?.designation === '', { s: c.r.status, d: c.u?.designation });
    const d = await signup('sg-long', { registrantType: 'Solo', designation: 'q'.repeat(150) });
    check('a title over 100 characters is not stored', d.r.status === 200 && d.u?.designation === '', d.u?.designation);
    const e = await signup('sg-other', { registrantType: 'Solo', designation: 'Other' });
    check('the word "Other" is not stored as a title', e.u?.designation === '', e.u?.designation);

    const f = await signup('sg-custom-inst', { registrantType: 'Institute', org: `Written-in college ${RUN}`, designation: 'Deputy Registrar (Academics)' });
    check('Institution + a written-in title: kept, and the account is an ordinary member account — a written-in title never opens the institution view', f.u?.designation === 'Deputy Registrar (Academics)' && f.u?.role === 'Subscriber' && f.u?.institutionId === null, { d: f.u?.designation, r: f.u?.role, i: f.u?.institutionId });
    const g = await signup('sg-librarian', { registrantType: 'Institute', org: `Listed college ${RUN}`, designation: 'Librarian' });
    if (g.u?.institutionId) created.institutions.push(g.u.institutionId);
    check('(unchanged, and still by design) a LISTED library or leadership title opens the institution view at signup', g.u?.role === 'Institution' && g.u?.designation === 'Librarian', { r: g.u?.role });
  }
} finally {
  await stop(srv);
  const users = await db.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = [...new Set([...created.users, ...users.map(u => u.id)])];
  const insts = await db.institution.findMany({ where: { name: { contains: RUN } }, select: { id: true } });
  await db.subscription.deleteMany({ where: { OR: [{ userId: { in: ids } }, { institutionId: { in: insts.map(i => i.id) } }] } as any }).catch(() => {});
  await db.userSession.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.adminAuditLog.deleteMany({ where: { adminEmail: { contains: DOMAIN } } as any }).catch(() => {});
  await db.institutionMemberAccess.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await db.emailVerification.deleteMany({ where: { email: { endsWith: DOMAIN } } } as any).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await db.institution.deleteMany({ where: { id: { in: [...new Set([...created.institutions, ...insts.map(i => i.id)])] } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
