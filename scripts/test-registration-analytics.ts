/**
 * Registration analytics for the Sales Workspace: windows, counting rules, subscription states, cohort conversion, assigned-member isolation,
 * and the read-only permission boundary — through the real routes.
 *
 *   npx tsx scripts/test-registration-analytics.ts
 *
 * A real server on the throwaway database `stm_ingestion_test`. Every outbound request is blocked. All fixtures carry a per-run tag and are
 * removed afterwards; aggregates over the whole table are asserted as before/after deltas, and dated windows sit in 2001, where no real data is.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import {
  conversion, growth, istDay, lastDaysWindow, previousWindow, resolveWindow, todayWindow, windowOfDays, zeroFill,
} from '../src/lib/registrationWindows.js';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const { registrationSummary, assignedMembers } = await import('../src/server/registrationAnalytics.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const STAFF = ['SuperAdmin', 'Admin', 'ContentManager', 'SubscriptionManager', 'SalesExecutive', 'SalesManager', 'Publisher'];

// ── 1. Pure windows and arithmetic ──────────────────────────────────────────
section('1. IST windows, custom ranges, growth, conversion (pure)');
{
  // 2026-10-05 18:30 UTC is 2026-10-06 00:00 IST exactly.
  const midnight = new Date('2026-10-05T18:30:00.000Z');
  check('00:00 IST is the new day', istDay(midnight) === '2026-10-06');
  check('one millisecond earlier is still the old day', istDay(new Date(midnight.getTime() - 1)) === '2026-10-05');
  const t = todayWindow(midnight);
  check('today starts at 00:00 IST and ends exclusive at the next', t.start.toISOString() === '2026-10-05T18:30:00.000Z' && t.end.toISOString() === '2026-10-06T18:30:00.000Z' && t.days === 1, t);
  const w7 = lastDaysWindow(7, midnight);
  check('last 7 days = today and the six before', w7.fromDay === '2026-09-30' && w7.toDay === '2026-10-06' && w7.days === 7, w7);
  const w30 = lastDaysWindow(30, midnight);
  check('last 30 days spans 30 calendar days', w30.fromDay === '2026-09-07' && w30.days === 30, w30);
  const p = previousWindow(w7);
  check('previous equivalent period is the 7 days right before', p.fromDay === '2026-09-23' && p.toDay === '2026-09-29' && p.end.getTime() === w7.start.getTime(), p);
  check('a custom range is inclusive of both days', windowOfDays('2026-10-01', '2026-10-03')!.days === 3);
  const now = new Date('2026-10-28T06:00:00Z');
  check('custom: end before start is refused', !resolveWindow('custom', '2026-10-05', '2026-10-01', now).ok);
  check('custom: 31 February is refused', !resolveWindow('custom', '2026-02-31', '2026-03-02', now).ok);
  check('custom: garbage is refused', !resolveWindow('custom', 'yesterday', '2026-03-02', now).ok);
  check('custom: missing end is refused', !resolveWindow('custom', '2026-03-02', undefined, now).ok);
  check('custom: the future is refused', !resolveWindow('custom', '2026-10-01', '2026-11-30', now).ok);
  check('custom: more than a year is refused', !resolveWindow('custom', '2024-01-01', '2026-01-01', now).ok);
  check('custom: a valid range resolves', resolveWindow('custom', '2026-10-01', '2026-10-07', now).ok);
  check('unknown range key is refused', !resolveWindow('forever', undefined, undefined, now).ok);
  const z = zeroFill([{ day: '2026-10-02', count: 4 }], windowOfDays('2026-10-01', '2026-10-04')!);
  check('zero-fill gives every day, empty ones as 0', same(z, [{ day: '2026-10-01', count: 0 }, { day: '2026-10-02', count: 4 }, { day: '2026-10-03', count: 0 }, { day: '2026-10-04', count: 0 }]), z);
  check('zero-fill across a month end', zeroFill([], windowOfDays('2026-02-27', '2026-03-02')!).map(r => r.day).join() === '2026-02-27,2026-02-28,2026-03-01,2026-03-02');
  check('growth: 6 vs 4 = +50%', same(growth(6, 4), { kind: 'pct', pct: 50, delta: 2 }));
  check('growth: 1 vs 4 = -75%', same(growth(1, 4), { kind: 'pct', pct: -75, delta: -3 }));
  check('growth: previous 0, current 5 → "new", no percentage', same(growth(5, 0), { kind: 'new', delta: 5 }));
  check('growth: 0 vs 0 → flat, not NaN', same(growth(0, 0), { kind: 'flat', delta: 0 }));
  check('conversion: 3 of 12 = 25%', same(conversion(12, 3), { available: true, cohort: 12, converted: 3, ratePct: 25 }));
  check('conversion: an empty cohort has no rate, not 0%', (conversion(0, 0) as any).ratePct === null);
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const RUN = Date.now().toString(36);
const DOMAIN = `@regan-${RUN}.invalid`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const made = { users: [] as string[], subs: [] as string[], pays: [] as string[], leads: [] as string[], insts: [] as string[], reqs: [] as string[] };
const D = (iso: string) => new Date(iso);
const mkUser = async (tag: string, o: any = {}) => {
  const u = await db.user.create({ data: { email: `${tag}${DOMAIN}`, password: 'x', displayName: tag, role: 'Subscriber', ...o } as any });
  made.users.push(u.id); return u;
};
const mkSub = async (data: any) => { const s = await db.subscription.create({ data: { planName: 'Premium', planType: 'Yearly', durationMonths: 12, status: 'Active', endDate: new Date(Date.now() + 200 * 864e5), ...data } as any }); made.subs.push(s.id); return s; };
const mkPay = async (userId: string, status: string) => { const p = await db.payment.create({ data: { amount: 4990, status, userId, items: [] } as any }); made.pays.push(p.id); return p; };
const mkLead = async (email: string, assignedToId: string | null) => { const l = await db.lead.create({ data: { name: email, email, assignedToId, assignedAt: assignedToId ? new Date() : null } as any }); made.leads.push(l.id); return l; };
const session = async (u: { id: string; email: string; role: string }) => {
  const sid = `sid-ra-${RUN}-${u.id.slice(0, 6)}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role: u.role, email: u.email }, SECRET, { expiresIn: '1h' });
};

const PORT = 3114, BASE = `http://127.0.0.1:${PORT}`;
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
  return { status: r.status, data, allow: r.headers.get('allow') };
};

let srv: Srv | null = null;
try {
  // ── 2. Counting rules, IST boundaries ─────────────────────────────────────
  section('2. Eligible users, duplicates, IST day boundaries (window 01–03 Mar 2001)');
  const W = windowOfDays('2001-03-01', '2001-03-03')!;
  const before = await registrationSummary(db, STAFF, W, 'custom');

  await mkUser('b3-start-inclusive', { createdAt: D('2001-02-28T18:30:00.000Z'), emailVerifiedAt: new Date() });   // 00:00:00.000 IST 1 Mar
  await mkUser('b1-last-ms-of-day1', { createdAt: D('2001-03-01T18:29:59.999Z') });                                 // 23:59:59.999 IST 1 Mar
  await mkUser('b2-first-ms-of-day2', { createdAt: D('2001-03-01T18:30:00.000Z'), emailVerifiedAt: new Date() });  // 00:00:00.000 IST 2 Mar
  await mkUser('b5-last-ms-of-window', { createdAt: D('2001-03-03T18:29:59.999Z') });                               // 23:59:59.999 IST 3 Mar
  await mkUser('b6-after-window', { createdAt: D('2001-03-03T18:30:00.000Z') });                                    // 4 Mar IST: outside
  await mkUser('b4-before-window', { createdAt: D('2001-02-28T18:29:59.999Z') });                                   // 28 Feb IST: previous window
  await mkUser('institution-member-student', { role: 'Student', createdAt: D('2001-03-02T05:00:00Z') });           // counts: a member account
  // Excluded, all inside the window:
  await mkUser('x-sales', { role: 'SalesExecutive', createdAt: D('2001-03-02T05:00:00Z') });
  await mkUser('x-admin', { role: 'Admin', createdAt: D('2001-03-02T05:00:00Z') });
  await mkUser('x-demo', { isDemoAccount: true, createdAt: D('2001-03-02T05:00:00Z') });
  await mkUser('x-deleted', { status: 'DELETED', createdAt: D('2001-03-02T05:00:00Z') });
  await mkUser('x-pending-deletion', { status: 'PENDING_DELETION', createdAt: D('2001-03-02T05:00:00Z') });
  await mkUser('x-anonymised', { purgedAt: new Date(), createdAt: D('2001-03-02T05:00:00Z') });
  // One member with two subscriptions and two leads — joins must not double-count.
  const dup = await mkUser('dup-two-subs-two-leads', { createdAt: D('2001-03-02T06:00:00Z') });
  await mkSub({ userId: dup.id }); await mkSub({ userId: dup.id, planName: 'Premium 2' });

  const after = await registrationSummary(db, STAFF, W, 'custom');
  const dTotal = after.cards.total - before.cards.total;
  check('selected-window count: 4 boundary members + the Student + the duplicate-holder, none of the 6 excluded accounts', after.selected.registrations - before.selected.registrations === 6, { d: after.selected.registrations - before.selected.registrations });
  check('all-time total grows by eligible accounts only (6 in the window + the two just outside it)', dTotal === 8, { dTotal });
  check('daily series: 1 Mar has 2 (start inclusive + last ms), 2 Mar has 3, 3 Mar has 1', same(after.series.map(r => r.count - (before.series.find(b => b.day === r.day)?.count ?? 0)), [2, 3, 1]), after.series);
  check('last ms of the 3rd lands inside, first ms of the 4th does not', after.series[2].count - before.series[2].count === 1);
  const prevB = after.selected.previousRegistrations - before.selected.previousRegistrations;
  check('the 28 Feb 23:59:59.999 IST member belongs to the previous period', prevB === 1, { prevB });
  check('verified counts use emailVerifiedAt: 2 of the new members', after.cards.verified - before.cards.verified === 2 && after.selected.verified - before.selected.verified === 2);

  section('Fixed windows follow the clock, not the filter');
  {
    const b = await registrationSummary(db, STAFF, W, 'custom');
    await mkUser('now', {});
    await mkUser('eight-days-ago', { createdAt: new Date(Date.now() - 8 * 864e5) });
    await mkUser('forty-days-ago', { createdAt: new Date(Date.now() - 40 * 864e5) });
    const a = await registrationSummary(db, STAFF, W, 'custom');
    check('today +1 (only the member created now)', a.cards.today - b.cards.today === 1);
    check('last 7 days +1', a.cards.last7 - b.cards.last7 === 1);
    check('last 30 days +2 (now and 8 days ago, not 40)', a.cards.last30 - b.cards.last30 === 2);
    check('total +3', a.cards.total - b.cards.total === 3);
    check('the selected range (2001) did not move', a.selected.registrations === b.selected.registrations);
  }

  section('Zero registrations and zero previous period');
  {
    const w = windowOfDays('2001-06-01', '2001-06-03')!;           // previous = 29–31 May: empty
    await mkUser('jun-1', { createdAt: D('2001-06-01T10:00:00Z') });
    await mkUser('jun-2', { createdAt: D('2001-06-02T10:00:00Z') });
    const s = await registrationSummary(db, STAFF, w, 'custom');
    check('previous zero, current 2 → "new", no percentage', s.selected.growth.kind === 'new' && !('pct' in s.selected.growth), s.selected.growth);
    const e = await registrationSummary(db, STAFF, windowOfDays('2001-08-01', '2001-08-03')!, 'custom');
    check('nothing in either period → flat, series is three zeros', e.selected.growth.kind === 'flat' && same(e.series.map(r => r.count), [0, 0, 0]), e);
  }

  // ── 3. Subscription states and cohort conversion ──────────────────────────
  section('3. Subscription classification and cohort conversion (cohort: 15–17 Apr 2001)');
  const CW = windowOfDays('2001-04-15', '2001-04-17')!;
  const cb = await registrationSummary(db, STAFF, CW, 'custom');
  const reg = (tag: string, o: any = {}) => mkUser(tag, { createdAt: D('2001-04-16T06:00:00Z'), ...o });
  const future = new Date(Date.now() + 200 * 864e5), past = new Date(Date.now() - 30 * 864e5);

  const paidEarly = await reg('paid-early');
  await mkSub({ userId: paidEarly.id, paymentId: (await mkPay(paidEarly.id, 'Paid')).id, createdAt: D('2001-04-17T05:00:00Z') });    // activated inside the period
  const paidLate = await reg('paid-late');
  await mkSub({ userId: paidLate.id, paymentId: (await mkPay(paidLate.id, 'Success')).id, createdAt: D('2001-05-20T05:00:00Z') });   // after the cutoff
  const paidExpired = await reg('paid-then-expired');
  await mkSub({ userId: paidExpired.id, paymentId: (await mkPay(paidExpired.id, 'Paid')).id, createdAt: D('2001-04-16T09:00:00Z'), endDate: past });
  const pending = await reg('payment-pending');
  await mkSub({ userId: pending.id, paymentId: (await mkPay(pending.id, 'Pending')).id });
  const granted = await reg('admin-granted');
  await mkSub({ userId: granted.id, planName: 'Pro' });
  const trial = await reg('trial');
  await mkSub({ userId: trial.id, planName: 'Demo Trial' });
  const cancelled = await reg('cancelled');
  await mkSub({ userId: cancelled.id, status: 'Cancelled', cancelledAt: new Date() });
  const expired = await reg('expired');
  await mkSub({ userId: expired.id, status: 'Active', endDate: past });
  await reg('never-subscribed');
  const inst = await db.institution.create({ data: { name: `Inst ${RUN}` } }); made.insts.push(inst.id);
  await mkSub({ institutionId: inst.id, userId: null });
  const coveredMember = await reg('via-institution', { institutionId: inst.id, role: 'Student' });
  // A managed-seat institution: only members holding a seat are covered, and not when it is over its limit.
  const seat = await db.institution.create({ data: { name: `Seat Inst ${RUN}` } }); made.insts.push(seat.id);
  await mkSub({ institutionId: seat.id, userId: null, licensedUserLimit: 1 });
  const seated = await reg('seated', { institutionId: seat.id, role: 'Student' });
  const unseated = await reg('not-seated', { institutionId: seat.id, role: 'Student' });
  await db.institutionMemberAccess.create({ data: { userId: seated.id, institutionId: seat.id } as any });

  const ca = await registrationSummary(db, STAFF, CW, 'custom');
  const dlt = (k: string) => (ca.subscriptions as any)[k] - (cb.subscriptions as any)[k];
  check('paid: Paid and Success payments both count; a Pending payment does not; an expired one does not', dlt('paid') === 2, { paid: dlt('paid') });
  check('institution: covered member counted; seat holder counted; member without a seat is not', dlt('institution') === 2, { institution: dlt('institution') });
  check('granted: running access with no recorded payment is not called paid', dlt('granted') === 2, { granted: dlt('granted') });
  check('trial is not active: counted as trial', dlt('trial') === 1);
  check('expired and cancelled are separate and not active', dlt('expired') === 2 && dlt('cancelled') === 1, { e: dlt('expired'), c: dlt('cancelled') });
  check('none: never subscribed + the unseated institution member', dlt('none') === 2, { none: dlt('none') });
  check('activePaid equals paid; withoutActive = trial + expired + cancelled + none', dlt('activePaid') === 2 && dlt('withoutActive') === 6, { w: dlt('withoutActive') });
  check('the cohort is everyone registered in the window; converted = paid by the period end only', ca.conversion.available && (ca.conversion as any).cohort - (cb.conversion as any).cohort === 12 && (ca.conversion as any).converted - (cb.conversion as any).converted === 2, ca.conversion);
  check('a member who paid after the cutoff is paid today but not converted in this cohort', dlt('paid') === 2 && (ca.conversion as any).converted - (cb.conversion as any).converted === 2);
  const wide = await registrationSummary(db, STAFF, windowOfDays('2001-04-15', '2001-06-30')!, 'custom');
  check('a later cutoff picks up the late payer', (wide.conversion as any).converted >= (ca.conversion as any).converted + 1, wide.conversion);

  // ── 4. Assigned members: isolation, search, pagination ────────────────────
  section('4. Assigned-member isolation (direct)');
  const execA = await mkUser('exec-a', { role: 'SalesExecutive' });
  const execB = await mkUser('exec-b', { role: 'SalesExecutive' });
  const a1 = await mkUser('a-one', { displayName: 'Alpha One', organization: 'Alpha College', emailVerifiedAt: new Date(), createdAt: D('2001-05-01T10:00:00Z') });
  const a2 = await mkUser('a-two', { displayName: 'Alpha Two', createdAt: D('2001-05-02T10:00:00Z') });
  const a3 = await mkUser('a-three', { displayName: 'Alpha Three', emailVerifiedAt: new Date(), createdAt: D('2001-05-03T10:00:00Z') });
  const a4 = await mkUser('a-four', { displayName: '100% Match_Test', emailVerifiedAt: new Date(), createdAt: D('2001-05-04T10:00:00Z') });
  const a5 = await mkUser('a-five', { displayName: 'Alpha Five', emailVerifiedAt: new Date(), createdAt: D('2001-05-05T10:00:00Z') });
  const bOne = await mkUser('b-one', { displayName: 'Bravo One', createdAt: D('2001-05-06T10:00:00Z') });
  const free = await mkUser('nobody-owns-me', { displayName: 'Charlie Free', createdAt: D('2001-05-07T10:00:00Z') });
  await mkLead(a1.email.toUpperCase(), execA.id);                 // case differs from the account's address
  await mkLead(a1.email, execA.id);                               // a second lead for the same member: still one row
  for (const u of [a2, a3, a4, a5]) await mkLead(u.email, execA.id);
  await mkLead(bOne.email, execB.id);
  await mkLead(free.email, null);                                 // unassigned stays unassigned
  await mkSub({ userId: a3.id, planName: 'Pro' });                // granted → not a follow-up
  await mkSub({ userId: a5.id, paymentId: (await mkPay(a5.id, 'Paid')).id });   // paid → not a follow-up

  const all = await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50 });
  const emails = all.members.map(m => m.email);
  check('A sees exactly their 5 members (one row for the member with two leads)', all.total === 5 && emails.length === 5 && new Set(emails).size === 5, { total: all.total, emails });
  check('A does not see B\'s member or the unassigned one', !emails.includes(bOne.email) && !emails.includes(free.email));
  check('B sees only B\'s member', (await assignedMembers(db, STAFF, execB.id, { page: 1, pageSize: 50 })).members.map(m => m.email).join() === bOne.email);
  check('an executive with no assignments sees nothing', (await assignedMembers(db, STAFF, execA.id.replace(/.$/, 'x'), { page: 1, pageSize: 50 })).total === 0);
  check('search is applied server-side and cannot reach another executive\'s member', (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, q: 'Bravo' })).total === 0 && (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, q: 'Charlie' })).total === 0);
  check('search finds an assigned member by name, organisation and address', (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, q: 'alpha college' })).total === 1 && (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, q: 'a-two' })).total === 1);
  check('LIKE wildcards in a search are literal ("%" matches only the name containing it)', (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, q: '%' })).total === 1 && (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, q: '_' })).total === 1);
  const p1 = await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 2 }), p2 = await assignedMembers(db, STAFF, execA.id, { page: 2, pageSize: 2 }), p3 = await assignedMembers(db, STAFF, execA.id, { page: 3, pageSize: 2 });
  const paged = [...p1.members, ...p2.members, ...p3.members].map(m => m.email);
  check('pagination: 3 pages, no overlap, newest first, total stays 5', p1.pages === 3 && p1.total === 5 && new Set(paged).size === 5 && paged.length === 5 && paged[0] === a5.email && paged[4] === a1.email, { pages: p1.pages, paged });
  check('verified filter', (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, verified: 'yes' })).total === 4 && (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, verified: 'no' })).total === 1);
  check('subscription filter: paid 1, active 2, inactive 3', (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, subscription: 'paid' })).total === 1 && (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, subscription: 'active' })).total === 2 && (await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, subscription: 'inactive' })).total === 3);
  const fu = await assignedMembers(db, STAFF, execA.id, { page: 1, pageSize: 50, followUp: true });
  check('follow-up = assigned, verified, no running subscription (a-one and a-four only)', fu.members.map(m => m.email).sort().join() === [a1.email, a4.email].sort().join(), fu.members.map(m => m.email));
  check('a row carries only the permitted columns', same(Object.keys(all.members[0]).sort(), ['email', 'leadId', 'name', 'organization', 'registeredAt', 'subscription', 'subscriptionLabel', 'verified']), Object.keys(all.members[0]));

  // ── 5. Through the real routes ────────────────────────────────────────────
  section('5. Routes: access, read-only, isolation, regression');
  const tokA = await session(execA), tokB = await session(execB);
  const mgr = await mkUser('manager', { role: 'SalesManager' }), tokMgr = await session(mgr);
  const superU = await mkUser('super', { role: 'SuperAdmin' }), tokSuper = await session(superU);
  const subMgr = await mkUser('submgr', { role: 'SubscriptionManager' }), tokSubMgr = await session(subMgr);
  const editor = await mkUser('editor', { role: 'ContentManager' }), tokEditor = await session(editor);
  const reader = await mkUser('reader', { role: 'Subscriber' }), tokReader = await session(reader);
  srv = await start();

  check('no token → 401', (await call('GET', '/api/sales/registrations/summary', null)).status === 401);
  for (const [name, tok] of [['reader', tokReader], ['content manager', tokEditor], ['subscription manager', tokSubMgr]] as const) {
    const r = await call('GET', '/api/sales/registrations/summary', tok);
    const u = await call('GET', '/api/sales/registrations/users', tok);
    check(`${name} → 403 on summary and on the member list`, r.status === 403 && u.status === 403, { s: r.status, u: u.status });
  }
  for (const [name, tok] of [['executive', tokA], ['manager', tokMgr], ['super admin', tokSuper]] as const) {
    check(`${name} may read the summary`, (await call('GET', '/api/sales/registrations/summary?range=30d', tok)).status === 200);
  }
  const sum = await call('GET', '/api/sales/registrations/summary?range=custom&from=2001-03-01&to=2001-03-03', tokA);
  check('summary over HTTP matches the direct call', sum.status === 200 && sum.data.selected.registrations === after.selected.registrations && sum.data.series.length === 3 && !!sum.data.generatedAt, sum.data?.selected);
  check('summary carries no member names or addresses', !JSON.stringify(sum.data).includes(DOMAIN));
  check('bad ranges are 400s with a reason', (await call('GET', '/api/sales/registrations/summary?range=custom&from=2001-03-05&to=2001-03-01', tokA)).status === 400
    && (await call('GET', '/api/sales/registrations/summary?range=custom&from=2001-03-01', tokA)).status === 400
    && (await call('GET', '/api/sales/registrations/summary?range=bogus', tokA)).status === 400);
  const c1 = await call('GET', '/api/sales/registrations/summary?range=today', tokA), c2 = await call('GET', '/api/sales/registrations/summary?range=today', tokA);
  check('a repeat within the cache window returns the same generatedAt (cached, refresh time visible)', c1.data.generatedAt === c2.data.generatedAt);

  const listA = await call('GET', '/api/sales/registrations/users?pageSize=50', tokA), listB = await call('GET', '/api/sales/registrations/users?pageSize=50', tokB);
  check('A\'s list over HTTP is A\'s five; B\'s is B\'s one', listA.data?.total === 5 && listB.data?.total === 1 && listB.data.members[0].email === bOne.email, { a: listA.data?.total, b: listB.data?.total });
  check('the list never carries ids, phone numbers or password fields', !/"id"|contact|phone|password|whatsapp/i.test(JSON.stringify(listA.data)), Object.keys(listA.data?.members?.[0] || {}));
  check('B searching for A\'s member by exact address finds nothing', (await call('GET', `/api/sales/registrations/users?q=${encodeURIComponent(a1.email)}`, tokB)).data?.total === 0);
  check('page size is capped at 50', (await call('GET', '/api/sales/registrations/users?pageSize=5000', tokA)).data?.pageSize === 50);
  check('junk paging falls back safely', (await call('GET', '/api/sales/registrations/users?page=-4&pageSize=abc', tokA)).data?.page === 1);
  const fus = await call('GET', '/api/sales/registrations/follow-ups', tokA);
  check('follow-ups: A\'s two verified-but-unsubscribed members, plus the enquiry count', fus.status === 200 && fus.data.verifiedUnsubscribed.total === 2 && typeof fus.data.pendingEnquiries === 'number', fus.data);
  check('super admin sees only members assigned to themselves, not everyone', (await call('GET', '/api/sales/registrations/users', tokSuper)).data?.total === 0);

  // Direct API attempts and URL manipulation.
  for (const [m, p] of [['GET', `/api/sales/registrations/users/${bOne.id}`], ['GET', `/api/sales/registrations/user/${bOne.id}`], ['GET', '/api/sales/registrations/export'], ['GET', '/api/sales/registrations/users.csv'], ['GET', '/api/sales/registrations/users/export']] as const) {
    const r = await call(m, p, tokA);
    check(`${m} ${p.replace(bOne.id, ':otherExecutivesMemberId')} → 404, nothing served`, r.status === 404 && !JSON.stringify(r.data).includes(bOne.email), r);
  }
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await call(m, `/api/sales/registrations/users`, tokA, { email: 'x@y.z' });
    check(`${m} on the member list → 405, Allow: GET`, r.status === 405 && r.allow === 'GET', r);
    const s = await call(m, `/api/sales/registrations/summary`, tokA, {});
    check(`${m} on the summary → 405`, s.status === 405);
  }
  check('a write by URL manipulation (query string verbs) changes nothing', (await call('GET', `/api/sales/registrations/users?delete=${bOne.id}&verify=1&role=Admin`, tokA)).status === 200 && (await db.user.findUnique({ where: { id: bOne.id } }))?.role === 'Subscriber');

  // The sales role has no user-management reach through anything else.
  const snap = async () => JSON.stringify(await db.user.findUnique({ where: { id: a2.id }, select: { role: true, email: true, password: true, emailVerifiedAt: true, isBlocked: true, status: true, displayName: true } }));
  const subCount = () => db.subscription.count({ where: { userId: a2.id } });
  const s0 = await snap(), n0 = await subCount();
  const attempts: [string, string, any][] = [
    ['POST', '/api/admin/users/create', { name: 'Eve', email: `eve${DOMAIN}`, role: 'Subscriber' }],
    ['PUT', `/api/admin/users/${a2.id}`, { name: 'Hacked', email: `h${DOMAIN}`, role: 'SuperAdmin' }],
    ['PUT', `/api/admin/users/${a2.id}/role`, { role: 'SuperAdmin' }],
    ['POST', `/api/admin/users/${a2.id}/reset-password`, { newPassword: 'Newpass-123456' }],
    ['DELETE', `/api/admin/users/${a2.id}`, undefined],
    ['POST', `/api/admin/users/${a2.id}/block`, {}],
    ['POST', '/api/admin/subscriptions/assign', { userIds: [a2.id], planName: 'X', durationMonths: 12 }],
    ['PUT', '/api/admin/subscriptions/none', { status: 'Active' }],
    ['POST', '/api/admin/subscription-requests/none/approve', {}],
    ['POST', '/api/admin/quotations/none/convert', {}],
    ['GET', '/api/admin/users', undefined],
  ];
  for (const [m, p, b] of attempts) {
    const r = await call(m, p, tokA, b);
    check(`executive ${m} ${p.replace(a2.id, ':id')} → 403`, r.status === 403, r.status);
  }
  check('the member\'s record and subscriptions are untouched', (await snap()) === s0 && (await subCount()) === n0);
  check('a manager is held to the same boundary', (await call('PUT', `/api/admin/users/${a2.id}/role`, tokMgr, { role: 'SuperAdmin' })).status === 403);

  section('Regression: admin and existing sales workflows');
  check('super admin still reaches Admin → Users', (await call('GET', '/api/admin/users?pageSize=1', tokSuper)).status === 200);
  check('super admin still reaches the accounts summary', (await call('GET', '/api/admin/accounts/summary', tokSuper)).status === 200);
  const ml = await call('GET', '/api/sales/my-leads', tokA);
  check('My Leads still returns exactly the executive\'s own leads', ml.status === 200 && ml.data.length === 6 && ml.data.every((l: any) => l.assignedToId === execA.id), ml.data?.length);
  check('notifications, activity and enquiries still answer', (await call('GET', '/api/sales/notifications', tokA)).status === 200 && (await call('GET', '/api/sales/my-activity', tokA)).status === 200 && (await call('GET', '/api/sales/pro-applications?status=Pending', tokA)).status === 200);
  const lead0 = await db.lead.findFirst({ where: { assignedToId: execA.id, email: a2.email } });
  const st = await call('PUT', `/api/sales/leads/${lead0!.id}/status`, tokA, { status: 'Positive' });
  check('an executive can still update their own lead\'s status (existing workflow unchanged)', st.status === 200 && st.data.status === 'Positive');
} catch (e: any) {
  fail++; console.log('  FAIL  unexpected error —', e?.stack || e);
} finally {
  await stop(srv);
  await db.leadInteraction.deleteMany({ where: { leadId: { in: made.leads } } }).catch(() => {});
  await db.lead.deleteMany({ where: { id: { in: made.leads } } }).catch(() => {});
  await db.subscription.deleteMany({ where: { OR: [{ id: { in: made.subs } }, { userId: { in: made.users } }] } }).catch(() => {});
  await db.payment.deleteMany({ where: { id: { in: made.pays } } }).catch(() => {});
  await db.institutionMemberAccess.deleteMany({ where: { institutionId: { in: made.insts } } }).catch(() => {});
  await db.userSession.deleteMany({ where: { userId: { in: made.users } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: made.users } } }).catch((e: any) => console.log('cleanup users:', e.message));
  await db.institution.deleteMany({ where: { id: { in: made.insts } } }).catch(() => {});
  const left = await db.user.count({ where: { email: { endsWith: DOMAIN } } });
  console.log(`\ncleanup: ${left === 0 ? 'all fixtures removed' : `${left} fixture users remain`}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
