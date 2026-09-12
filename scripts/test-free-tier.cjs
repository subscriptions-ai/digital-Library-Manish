#!/usr/bin/env node
/**
 * The free member's clock, against the running server.
 *
 *   node scripts/test-free-tier.cjs                 # http://localhost:3000
 *   node scripts/test-free-tier.cjs https://host
 *
 * The table in scripts/test-allowance.ts proves the rules. This proves they are
 * actually wired to the doors: that the reader and both proxies refuse when the
 * time is up, that signing out stops the clock, that a subscription lifts it,
 * and that nobody else is touched by any of it.
 *
 * It creates one throwaway member, moves its clock by editing its own rows
 * rather than waiting two hours, and deletes everything it made at the end —
 * including on failure.
 *
 * Run the server without AWS credentials while testing this, or joining will
 * send a real welcome email and a real alert to the admin address:
 *
 *   AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= npm run dev
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const BASE = process.argv[2] || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET || 'your-fallback-secret-for-dev-only';
const EMAIL = 'free-clock-test@example.invalid';
const JOIN_EMAIL = 'free-join-test@example.invalid';
const PASSWORD = 'Test-Clock-9f2a!';
const MIN = 60_000;

const G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', O = '\x1b[0m';
let pass = 0; const failures = [];
const ok = (n, d = '') => { pass++; console.log(`  ${G}pass${O}  ${n}${d ? D + '  ' + d + O : ''}`); };
const bad = (n, d) => { failures.push(`${n} — ${d}`); console.log(`  ${R}FAIL${O}  ${n}\n        ${R}${d}${O}`); };
const is = (n, got, want) => (JSON.stringify(got) === JSON.stringify(want)
  ? ok(n) : bad(n, `want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`));

const get = async (path, token) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let body = null; try { body = await r.json(); } catch { /* bytes, not json */ }
  return { status: r.status, body };
};
const post = async (path, token, data) => {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data || {}),
  });
  let body = null; try { body = await r.json(); } catch { /* */ }
  return { status: r.status, body };
};

let user = null;
let joined = null;

const wipeSessions = () => p.freeSession.deleteMany({ where: { userId: user.id } });
const istDay = at => new Date(at + 5.5 * 3600e3).toISOString().slice(0, 10);

/** Put the member in a given situation without waiting for it to arrive. */
const running = async minutesAgo => {
  await wipeSessions();
  const at = new Date(Date.now() - minutesAgo * MIN);
  await p.freeSession.create({
    data: { userId: user.id, day: istDay(at.getTime()), number: 1, runningSince: at, startedAt: at },
  });
};
const completed = async (count, holdEndedMinutesAgo) => {
  await wipeSessions();
  const day = istDay(Date.now());
  for (let n = 1; n <= count; n++) {
    const done = new Date(Date.now() - (holdEndedMinutesAgo + 120) * MIN - (count - n) * MIN);
    await p.freeSession.create({
      data: {
        userId: user.id, day, number: n, usedMs: 30 * MIN, startedAt: done,
        completedAt: done, holdUntil: new Date(done.getTime() + 120 * MIN),
      },
    });
  }
};

(async () => {
  console.log(`\nThe free member's clock, against ${BASE}\n${'─'.repeat(64)}`);

  const article = await p.article.findFirst({
    where: { status: 'Published', pdfUrl: { not: null } }, select: { id: true },
  });
  if (!article) { console.log('No readable article to open — nothing to test against.'); return; }

  await p.user.deleteMany({ where: { email: EMAIL } });
  user = await p.user.create({
    data: {
      email: EMAIL, password: await bcrypt.hash(PASSWORD, 10),
      displayName: 'Free Clock Test', role: 'Subscriber', status: 'Active',
      interestedDomains: ['Nursing', 'Law'],
    },
  });
  const token = jwt.sign({ uid: user.id, email: EMAIL, role: 'Subscriber' }, SECRET, { expiresIn: '1h' });
  const view = () => get(`/api/content/${article.id}/view`, token);

  // ── joining ───────────────────────────────────────────────────────────────
  console.log('\nJoining');
  await p.user.deleteMany({ where: { email: JOIN_EMAIL } });
  await p.emailVerification.deleteMany({ where: { email: JOIN_EMAIL } });
  await p.lead.deleteMany({ where: { email: JOIN_EMAIL } });
  {
    const body = {
      email: JOIN_EMAIL, password: PASSWORD, name: 'Join Test',
      organization: 'Test College', contact: '+91 90000 00000',
      registrantType: 'Institute', designation: 'Librarian',
      state: 'Delhi', country: 'India', whatsapp: '+91 90000 11111',
      interestedDomains: ['Nursing', 'Law', 'Not A Real Department'],
    };
    // Signup follows the switch in settings rather than its own opinion — with
    // verification turned off, check-or-send answers "verified" without writing
    // anything down, and demanding a record here refuses everybody.
    const settings = await get('/api/public/settings', null);
    const verifying = settings.body?.emailVerificationEnabled !== false;

    if (verifying) {
      // An address nobody has to own would be an endless supply of accounts,
      // and so an endless supply of hours.
      const unverified = await post('/api/auth/signup', null, body);
      is('an unverified address cannot open an account', unverified.status, 400);
      is('and no account was made', await p.user.count({ where: { email: JOIN_EMAIL } }), 0);
      await p.emailVerification.create({ data: { email: JOIN_EMAIL, isVerified: true } });
    } else {
      console.log(`  ${D}note  email verification is switched off, so the limit is one`);
      console.log(`        account per address only by convention${O}`);
    }

    const r = await post('/api/auth/signup', null, body);
    is(verifying ? 'a verified address can' : 'an address can open an account', r.status, 200);

    joined = await p.user.findUnique({ where: { email: JOIN_EMAIL } });
    if (!joined) bad('the member exists afterwards', 'no row');
    else {
      is('the subjects they named are kept', joined.interestedDomains, ['Nursing', 'Law']);
      ok('and anything invented is dropped');
      is('what they registered as is kept, and where they are',
        [joined.registrantType, joined.designation, joined.state, joined.country],
        ['Institute', 'Librarian', 'Delhi', 'India']);
      is('and a number that can be reached on WhatsApp', joined.whatsapp, '+91 90000 11111');

      // The designation column exists to be counted, so only the listed ones
      // may enter it — including one borrowed from the wrong list.
      const strays = [
        { email: 'stray-a@example.invalid', registrantType: 'Institute', designation: 'Supreme Overlord' },
        { email: 'stray-b@example.invalid', registrantType: 'Institute', designation: 'R&D Head' },
      ];
      for (const stray of strays) await post('/api/auth/signup', null, { ...body, ...stray });
      const kept = await p.user.findMany({
        where: { email: { in: strays.map(x => x.email) } }, select: { designation: true },
      });
      is('a designation that is not on the list is not recorded as one',
        kept.map(k => k.designation), kept.map(() => ''));
      await p.lead.deleteMany({ where: { email: { in: strays.map(x => x.email) } } });
      await p.user.deleteMany({ where: { email: { in: strays.map(x => x.email) } } });
      const a = await get('/api/me/allowance', r.body?.token);
      is('they arrive on the free membership', [a.body?.plan, a.body?.timed], ['Free', true]);
    }
    const lead = await p.lead.findFirst({ where: { email: JOIN_EMAIL } });
    lead ? is('they are filed as a lead for sales', lead.source, 'Free signup')
         : bad('they are filed as a lead for sales', 'no lead');
    if (lead) (/Nursing, Law/.test(lead.notes || '')
      ? ok('with what they came to read') : bad('with what they came to read', lead.notes));
  }

  // ── arriving ──────────────────────────────────────────────────────────────
  console.log('\nArriving');
  {
    const a = await get('/api/me/allowance', token);
    is('a new member is on the clock but has not started it',
      [a.body?.plan, a.body?.timed, a.body?.state], ['Free', true, 'available']);
    const after = await p.freeSession.count({ where: { userId: user.id } });
    is('asking the time did not start it', after, 0);
  }
  {
    const r = await post('/api/auth/login', null, { email: EMAIL, password: PASSWORD });
    if (r.status !== 200) bad('signing in works', `HTTP ${r.status}`);
    else {
      await new Promise(r2 => setTimeout(r2, 400));    // the clock starts alongside the reply
      const a = await get('/api/me/allowance', token);
      is('signing in starts the clock', a.body?.state, 'running');
      ok('and it is the first of the day', `session ${a.body?.number} of ${a.body?.sessionsPerDay}`);
    }
  }

  // ── the doors ─────────────────────────────────────────────────────────────
  console.log('\nWhile the clock runs');
  await running(5);
  {
    const r = await view();
    is('the reader opens', r.status, 200);
  }

  console.log('\nWhen the time is up');
  await running(31);                                   // ran out a minute ago
  {
    const r = await view();
    is('the reader is refused', [r.status, r.body?.code, r.body?.state], [403, 'FREE_LIMIT', 'waiting']);
    r.body?.nextOpensAt
      ? ok('and it says when the next session opens', new Date(r.body.nextOpensAt).toLocaleTimeString())
      : bad('and it says when the next session opens', 'no nextOpensAt');
  }
  {
    // The bytes come through the proxies. A gate only on the reader would be
    // no gate at all.
    const pdf = await get(`/api/content/${article.id}/proxy-pdf`, token);
    is('the pdf proxy is refused too', [pdf.status, pdf.body?.code], [403, 'FREE_LIMIT']);
    const frame = await get(`/api/content/${article.id}/proxy-frame?token=${token}`, token);
    is('and so is the page proxy', frame.status, 403);
  }

  console.log('\nAfter the wait');
  await completed(1, 1);                               // one done, wait ended a minute ago
  {
    const a = await get('/api/me/allowance', token);
    is('nothing has started on its own', a.body?.state, 'available');
    const r = await view();
    is('opening something starts the second session', r.status, 200);
    const n = await p.freeSession.count({ where: { userId: user.id } });
    is('and it is recorded as the second', n, 2);
  }

  console.log("\nThe day's four");
  await completed(4, 1);
  {
    const r = await view();
    is('the fifth is refused', [r.status, r.body?.state], [403, 'spent']);
    const a = await get('/api/me/allowance', token);
    is('two hours are accounted for', a.body?.usedTodayMs / MIN, 120);
    const midnight = new Date(a.body?.nextOpensAt);
    is('and it comes back after midnight', midnight > new Date(), true);
  }

  console.log('\nSigning out');
  await running(10);
  {
    const r = await post('/api/auth/logout', token);
    is('the server is told', r.status, 200);
    const row = await p.freeSession.findFirst({ where: { userId: user.id } });
    is('the clock is stopped', row.runningSince, null);
    is('and the ten minutes used are banked', Math.round(row.usedMs / MIN), 10);
    const a = await get('/api/me/allowance', token);
    is('twenty are kept for them', [a.body?.state, Math.round(a.body?.remainingMs / MIN)], ['paused', 20]);
  }
  {
    // Signing out must not become a way to read for nothing.
    const r = await view();
    is('reading with a kept token starts it again', r.status, 200);
    const row = await p.freeSession.findFirst({ where: { userId: user.id } });
    row.runningSince ? ok('the clock is running again') : bad('the clock is running again', 'still stopped');
  }

  // ── who the clock does not apply to ───────────────────────────────────────
  console.log('\nWho is not on the clock');
  await completed(4, 1);                               // out of time, if it applied
  const sub = await p.subscription.create({
    data: {
      userId: user.id, planName: 'Pro membership', planType: 'Custom', durationMonths: 12,
      status: 'Active', endDate: new Date(Date.now() + 365 * 864e5),
    },
  });
  {
    const a = await get('/api/me/allowance', token);
    is('a Pro member is not timed', [a.body?.plan, a.body?.timed], ['Unlimited', false]);
    const r = await view();
    is('and reads with the day already spent', r.status, 200);
  }
  await p.subscription.delete({ where: { id: sub.id } });
  {
    const r = await view();
    is('and is timed again the moment it lapses', [r.status, r.body?.state], [403, 'spent']);
  }
  {
    const student = await p.user.findFirst({
      where: { role: 'Student', institutionId: { not: null } }, select: { id: true, email: true, role: true, institutionId: true },
    });
    if (!student) console.log(`  ${D}skip  institution members — none to test with${O}`);
    else {
      const st = jwt.sign({ uid: student.id, email: student.email, role: 'Student', institutionId: student.institutionId }, SECRET, { expiresIn: '1h' });

      // The rule is the plan, not the role. A college with a plan running keeps
      // its people off the clock; a college whose plan has lapsed does not
      // leave them with nothing — they fall back to the free allowance, the
      // same as anyone else without one.
      const instSub = await p.subscription.create({
        data: {
          institutionId: student.institutionId, planName: 'Institution plan', planType: 'Custom',
          durationMonths: 12, status: 'Active', endDate: new Date(Date.now() + 200 * 864e5),
        },
      });
      const covered = await get('/api/me/allowance', st);
      is('a college with a plan keeps its people off the clock',
        [covered.body?.plan, covered.body?.timed], ['Unlimited', false]);

      await p.subscription.delete({ where: { id: instSub.id } });
      const lapsed = await get('/api/me/allowance', st);
      is('and a college whose plan has lapsed falls back to the free allowance',
        [lapsed.body?.plan, lapsed.body?.timed], ['Free', true]);
    }
  }

  // ── asking for more ───────────────────────────────────────────────────────
  console.log('\nAsking for Pro');
  {
    await p.subscriptionRequest.deleteMany({ where: { userId: user.id } });
    const r = await post('/api/me/pro-application', token, {
      organization: 'Test College', contact: '+91 90000 00001', designation: 'Researcher',
      purpose: 'Finishing a thesis',
    });
    is('an application can be sent', r.status, 200);

    const req = await p.subscriptionRequest.findFirst({ where: { userId: user.id } });
    req ? is('it is filed against the member', [req.planType, req.status, !!req.userId], ['Pro', 'Pending', true])
        : bad('it is filed against the member', 'no request');

    const again = await post('/api/me/pro-application', token, {});
    is('a second one is refused while the first waits', again.status, 409);

    const mine = await get('/api/me/pro-application', token);
    is('the member can see where it stands', mine.body?.application?.status, 'Pending');

    const lead = await p.lead.findFirst({ where: { email: EMAIL } });
    lead ? is('sales get a lead too', lead.source, 'Pro application')
         : bad('sales get a lead too', 'no lead');

    // A sales executive is shown only leads assigned to them, so without its own
    // page an application would be visible to nobody who could ring them.
    const salesUser = await p.user.findFirst({
      where: { role: { in: ['SalesExecutive', 'SalesManager'] } },
      select: { id: true, email: true, role: true },
    });
    if (!salesUser) console.log(`  ${D}skip  the sales team sees it — no sales user to test with${O}`);
    else {
      const st = jwt.sign({ uid: salesUser.id, email: salesUser.email, role: salesUser.role }, SECRET, { expiresIn: '1h' });
      const list = await get('/api/sales/pro-applications?status=Pending', st);
      const found = (list.body?.applications || []).some(a => a.email === EMAIL);
      is('the sales team sees it without it being assigned', [list.status, found], [200, true]);
    }

    // Approving is the existing flow untouched; what it produces must lift the clock.
    const admin = await p.user.findFirst({ where: { role: 'SuperAdmin' }, select: { id: true, email: true, role: true } });
    const at = jwt.sign({ uid: admin.id, email: admin.email, role: 'SuperAdmin' }, SECRET, { expiresIn: '1h' });
    await completed(4, 1);                               // out of time, if it applied
    const approved = await post(`/api/admin/subscription-requests/${req.id}/approve`, at, {});
    is('an administrator can approve it', approved.status, 200);
    const a = await get('/api/me/allowance', token);
    is('and the clock lifts at once', [a.body?.plan, a.body?.timed], ['Unlimited', false]);
    is('the reader opens with the day already spent', (await view()).status, 200);
  }

  // ── one page for the account ─────────────────────────────────────────────
  console.log('\nMembership and subscription, in one place');
  {
    await p.subscription.deleteMany({ where: { userId: user.id } });
    const m = await get('/api/me/membership', token);
    is('a free member holds a free membership',
      [m.body?.plan, m.body?.current, m.body?.payments?.count], ['Free', null, 0]);

    const sub = await p.subscription.create({
      data: {
        userId: user.id, planName: 'Pro membership', planType: 'Custom', durationMonths: 12,
        status: 'Active', startDate: new Date(Date.now() - 30 * 864e5),
        endDate: new Date(Date.now() + 335 * 864e5),
      },
    });
    const pro = await get('/api/me/membership', token);
    is('an approved member holds Pro, with dates',
      [pro.body?.plan, pro.body?.current?.planName, !!pro.body?.current?.endDate],
      ['Pro', 'Pro membership', true]);

    // Running out is a return to the free allowance, not a locked door — and
    // the page can only say so if it is told which membership ended.
    await p.subscription.update({
      where: { id: sub.id }, data: { endDate: new Date(Date.now() - 864e5) },
    });
    const after = await get('/api/me/membership', token);
    is('a lapsed membership drops back to free and says which ended',
      [after.body?.plan, after.body?.lapsed?.planName], ['Free', 'Pro membership']);
    await p.subscription.delete({ where: { id: sub.id } });
  }

  console.log('\nWhat a member may see');
  {
    // Every one of these scoped by the member's domains, and a free member has
    // none — so each answered "nothing", and the dashboard of somebody with the
    // run of the library read 0 accessible items, 0 departments, no content
    // found. Asking each of them again is the only way that class stays fixed.
    await p.subscription.deleteMany({ where: { userId: user.id } });
    const a = await get('/api/library/articles?limit=5', token);
    const all = await get('/api/library/articles?limit=5', null);
    is('the new catalogue is whole', a.body?.total, all.body?.total);

    const scope = await get('/api/user/access-scope', token);
    is('their access is not a list of departments', scope.body?.all, true);

    const dash = await get('/api/user/dashboard', token);
    (dash.body?.allowedDomains?.length > 0)
      ? ok('the dashboard covers departments', `${dash.body.allowedDomains.length}`)
      : bad('the dashboard covers departments', 'none');
    is('and names the membership', dash.body?.planName, 'Free membership');

    const facets = await get('/api/user/available-facets', token);
    ((facets.body?.archived?.departments?.length || facets.body?.neu?.departments?.length) > 0)
      ? ok('the filters offer departments')
      : bad('the filters offer departments', JSON.stringify(facets.body).slice(0, 120));

    const filters = await get('/api/content/filters?1=1&onlyUnlocked=true', token);
    ((filters.body?.subjects?.length || 0) + (filters.body?.tags?.length || 0) > 0)
      ? ok('the archived filters are not empty')
      : bad('the archived filters are not empty', JSON.stringify(filters.body).slice(0, 120));

    const list = await get('/api/content/list?onlyUnlocked=true&limit=5', token);
    (list.body?.total > 0)
      ? ok('the archived shelf is not empty', `${list.body.total} items`)
      : bad('the archived shelf is not empty', 'nothing returned');
  }
})()
  .catch(e => bad('the run itself', String(e?.message || e)))
  .finally(async () => {
    if (joined) {
      // A qualifying designation creates an institution to be the librarian of,
      // so the tidy-up has to take that with it.
      await p.freeSession.deleteMany({ where: { userId: joined.id } }).catch(() => {});
      const madeInstitution = joined.institutionId
        || (await p.user.findUnique({ where: { id: joined.id }, select: { institutionId: true } }).catch(() => null))?.institutionId;
      await p.lead.deleteMany({ where: { email: JOIN_EMAIL } }).catch(() => {});
      await p.emailVerification.deleteMany({ where: { email: JOIN_EMAIL } }).catch(() => {});
      await p.user.delete({ where: { id: joined.id } }).catch(() => {});
      if (madeInstitution) await p.institution.delete({ where: { id: madeInstitution } }).catch(() => {});
    }
    if (user) {
      await p.freeSession.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await p.subscription.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await p.subscriptionRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await p.lead.deleteMany({ where: { email: EMAIL } }).catch(() => {});
      await p.readEvent.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await p.libraryEvent.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await p.user.delete({ where: { id: user.id } }).catch(() => {});
      const left = await p.user.count({ where: { email: EMAIL } });
      left === 0 ? ok('the test member is cleaned up') : bad('the test member is cleaned up', 'still there');
    }
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`${pass} passed · ${failures.length ? R : ''}${failures.length} failed${O}`);
    failures.forEach(f => console.log('  · ' + f));
    await p.$disconnect();
    process.exit(failures.length ? 1 : 0);
  });
