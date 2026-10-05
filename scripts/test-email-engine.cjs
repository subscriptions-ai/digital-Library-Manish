#!/usr/bin/env node
/**
 * The email engine, driven end to end against a running server.
 *
 *   AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= PORT=3100 npx tsx server.ts
 *   node scripts/test-email-engine.cjs http://localhost:3100
 *
 * Needs the throwaway test inbox (no AWS keys) — it makes the engine send real
 * passes. It creates its own members (addresses ending @ee-test.invalid), and
 * removes them, their sends, and every setting it changed when it is done.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const BASE = process.argv[2] || 'http://localhost:3100';
const SECRET = process.env.JWT_SECRET || 'your-fallback-secret-for-dev-only';
const G = '\x1b[32m', R = '\x1b[31m', O = '\x1b[0m';
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ${G}pass${O}  ${n}${d ? '  ' + d : ''}`); };
const bad = (n, d) => { fail++; console.log(`  ${R}FAIL${O}  ${n}\n        ${d}`); };
const expect = (cond, name, detail = '') => (cond ? ok(name, detail) : bad(name, detail || 'was not true'));

const DAY = 864e5;
const ago = d => new Date(Date.now() - d * DAY);
const SUFFIX = '@ee-test.invalid';

(async () => {
  const admin = await p.user.findFirst({ where: { role: 'SuperAdmin' } });
  if (!admin) { console.log('no SuperAdmin in this database'); process.exit(1); }
  const A = jwt.sign({ uid: admin.id, email: admin.email, role: 'SuperAdmin' }, SECRET, { expiresIn: '10m' });
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(BASE + path, {
      method, headers: { Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const dry = async only => (await call('/api/admin/email-engine/run', 'POST', { dryRun: true, only })).body;
  const real = async only => (await call('/api/admin/email-engine/run', 'POST', { dryRun: false, only })).body;
  const dueIn = (run, key) => (run?.journeys || []).find(j => j.templateKey === key)?.examples?.map(e => e.email) || [];
  const rule = (key, data) => call(`/api/admin/email-rules/${key}`, 'POST', data);

  // Verification is switched off in a development settings.json, which would make
  // every verification test pass for the wrong reason. Switched on for the run
  // and put back after; the engine reads the file on every call.
  const SETTINGS = path.join(__dirname, '..', 'settings.json');
  const settingsBefore = fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS, 'utf8') : null;
  const parsed = settingsBefore ? JSON.parse(settingsBefore) : {};
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...parsed, emailVerificationEnabled: true }, null, 2));

  // Real passes mail whoever is due, and a development database is full of
  // people who must not be mailed by a test: opt them all out, then put them back.
  const others = await p.user.findMany({ where: { email: { not: { endsWith: SUFFIX } }, marketingOptOut: false }, select: { id: true } });
  await p.user.updateMany({ where: { id: { in: others.map(u => u.id) } }, data: { marketingOptOut: true } });
  const restore = async () => {
    await p.user.updateMany({ where: { id: { in: others.map(u => u.id) } }, data: { marketingOptOut: false } });
    if (settingsBefore !== null) fs.writeFileSync(SETTINGS, settingsBefore);
  };
  process.on('SIGINT', async () => { await restore(); process.exit(130); });

  // What to put back afterwards.
  const eng0 = await p.emailEngine.findUnique({ where: { id: 'singleton' } });
  const rules0 = await p.emailRule.findMany();

  const hash = await bcrypt.hash('Test-pass-1', 4);
  const mk = (tag, data) => p.user.create({
    data: { email: `${tag}${SUFFIX}`, password: hash, displayName: `EE ${tag}`, role: 'Subscriber', status: 'Active', ...data },
  });

  try {
    await p.emailEngine.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
    // Open window all day, huge cap, tracking began a month ago.
    await call('/api/admin/email-engine', 'POST', { enabled: true, startHour: 0, endHour: 24, dailyCap: 5000 });
    await p.emailEngine.update({ where: { id: 'singleton' }, data: { loginTrackingSince: ago(30), lockedUntil: null, lockedBy: null } });
    // Every journey off until a test turns one on.
    for (const r of await p.emailRule.findMany()) await p.emailRule.update({ where: { id: r.id }, data: { enabled: false } });

    const unverified = await mk('unverified', { createdAt: ago(3), lastMarketingAt: null });
    const verified = await mk('verified', { createdAt: ago(3), emailVerifiedAt: ago(3) });
    const neverIn = await mk('neverin', { createdAt: ago(5), emailVerifiedAt: ago(5) });
    const legacy = await mk('legacy', { createdAt: ago(90), emailVerifiedAt: ago(90) });
    const quiet = await mk('quiet', { createdAt: ago(20), emailVerifiedAt: ago(20), lastLoginAt: ago(10) });
    const dormant = await mk('dormant', { createdAt: ago(200), emailVerifiedAt: ago(200), lastLoginAt: ago(60), lastReadAt: ago(45) });
    const optedOut = await mk('optedout', { createdAt: ago(3), marketingOptOut: true });
    const blocked = await mk('blocked', { createdAt: ago(3), isBlocked: true });
    const E = u => u.email;

    console.log('\nSign-in is recorded');
    {
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: E(verified), password: 'Test-pass-1' }),
      });
      await new Promise(res => setTimeout(res, 400));
      const row = await p.user.findUnique({ where: { id: verified.id }, select: { lastLoginAt: true } });
      expect(r.status === 200 && row.lastLoginAt && Date.now() - row.lastLoginAt < 10_000, 'a successful login sets lastLoginAt');
      const bad1 = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: E(neverIn), password: 'wrong' }),
      });
      const row2 = await p.user.findUnique({ where: { id: neverIn.id }, select: { lastLoginAt: true } });
      expect(bad1.status === 401 && !row2.lastLoginAt, 'a failed login does not');
      await p.user.update({ where: { id: verified.id }, data: { lastLoginAt: null } });
    }

    console.log('\nA dry run writes nothing');
    {
      await rule('verify-email-reminder', { enabled: true });
      const sendsBefore = await p.emailSend.count();
      const stateBefore = await p.emailEngine.findUnique({ where: { id: 'singleton' } });
      const ruleBefore = await p.emailRule.findUnique({ where: { templateKey: 'verify-email-reminder' } });
      const d = await dry();
      const stateAfter = await p.emailEngine.findUnique({ where: { id: 'singleton' } });
      const ruleAfter = await p.emailRule.findUnique({ where: { templateKey: 'verify-email-reminder' } });
      expect(await p.emailSend.count() === sendsBefore, 'no send rows');
      expect(+(stateAfter.lastRunAt || 0) === +(stateBefore.lastRunAt || 0) && stateAfter.lastSent === stateBefore.lastSent, 'the engine\'s last-run state is untouched');
      expect(ruleAfter.lastSent === ruleBefore.lastSent && +(ruleAfter.lastRunAt || 0) === +(ruleBefore.lastRunAt || 0), 'the journey\'s last-run counters are untouched');
      expect(!!ruleAfter.lastDryRunAt, 'the check is recorded as a check', `${ruleAfter.lastDryRunDue} due`);
      expect(!stateAfter.lockedUntil, 'it takes no lease');
    }

    console.log('\nThe journeys');
    {
      let d = await dry('verify-email-reminder');
      const v = dueIn(d, 'verify-email-reminder');
      expect(v.includes(E(unverified)), 'verification reminder: an unverified member is due');
      expect(!v.includes(E(verified)), 'verification reminder: a verified member is not');
      expect(!v.includes(E(optedOut)) && !v.includes(E(blocked)), 'opted-out and blocked members are never due');

      await rule('verify-email-reminder', { delayDays: 5 });
      d = await dry('verify-email-reminder');
      expect(!dueIn(d, 'verify-email-reminder').includes(E(unverified)), 'delayDays decides eligibility (3 days old, wait 5 → not due)');
      await rule('verify-email-reminder', { delayDays: 2 });
      d = await dry('verify-email-reminder');
      expect(dueIn(d, 'verify-email-reminder').includes(E(unverified)), 'delayDays decides eligibility (3 days old, wait 2 → due)');

      // The old hard-coded 3 days for never-read: a one-day wait must now be honoured.
      const fresh = await mk('fresh', { createdAt: ago(1.5) });
      const dueFor = async key => (await call(`/api/admin/members/${fresh.id}/mail`)).body.templates.find(t => t.key === key);
      await rule('never-read', { delayDays: 1 });
      expect((await dueFor('never-read'))?.due === true, 'never-read honours a wait shorter than the old hard-coded 3 days');
      await rule('never-read', { delayDays: 7 });
      expect((await dueFor('never-read'))?.due === false, 'never-read honours a longer wait too');
      await rule('never-read', { delayDays: 3 });

      await p.user.update({ where: { id: unverified.id }, data: { emailVerifiedAt: new Date() } });
      d = await dry('verify-email-reminder');
      expect(!dueIn(d, 'verify-email-reminder').includes(E(unverified)), 'verification reminder stops once verified');
      await p.user.update({ where: { id: unverified.id }, data: { emailVerifiedAt: null } });
      await rule('verify-email-reminder', { enabled: false });

      await rule('never-logged-in', { enabled: true, delayDays: 3 });
      d = await dry('never-logged-in');
      const nl = dueIn(d, 'never-logged-in');
      expect(nl.includes(E(neverIn)), 'never logged in: verified, old enough, no sign-in → due');
      expect(!nl.includes(E(unverified)), 'never logged in: not verified → not due');
      expect(!nl.includes(E(legacy)), 'never logged in: an account older than sign-in tracking is left alone');
      expect(!nl.includes(E(quiet)), 'never logged in: someone who has signed in is not due');
      await rule('never-logged-in', { enabled: false });

      await rule('no-research-activity', { enabled: true, delayDays: 3 });
      d = await dry('no-research-activity');
      let nr = dueIn(d, 'no-research-activity');
      expect(nr.includes(E(quiet)), 'no research: signed in, did nothing → due');
      expect(!nr.includes(E(neverIn)), 'no research: never signed in → not due');
      await p.libraryEvent.create({ data: { kind: 'search', userId: quiet.id, query: 'ee-test' } });
      d = await dry('no-research-activity');
      expect(!dueIn(d, 'no-research-activity').includes(E(quiet)), 'no research: stops once they search');
      await p.libraryEvent.deleteMany({ where: { userId: quiet.id } });
      await rule('no-research-activity', { enabled: false });

      await rule('inactive-user', { enabled: true, delayDays: 30 });
      d = await dry('inactive-user');
      expect(dueIn(d, 'inactive-user').includes(E(dormant)), 'inactive: read 45 days ago, quiet since → due');
      await p.libraryEvent.create({ data: { kind: 'view', userId: dormant.id, itemType: 'article', itemId: 'ee-test' } });
      d = await dry('inactive-user');
      expect(!dueIn(d, 'inactive-user').includes(E(dormant)), 'inactive: not due once they come back');
      await p.libraryEvent.deleteMany({ where: { userId: dormant.id } });
      await rule('inactive-user', { enabled: false });
    }

    console.log('\nNo duplicate sends');
    {
      await p.emailSend.deleteMany({ where: { email: { endsWith: SUFFIX } } });
      await p.user.updateMany({ where: { email: { endsWith: SUFFIX } }, data: { lastMarketingAt: null } });
      await rule('verify-email-reminder', { enabled: true, delayDays: 2, maxSends: 3, repeatAfterDays: 5 });

      // Two passes at the same instant: one runs, one is turned away, one mail goes.
      const [r1, r2] = await Promise.all([real('verify-email-reminder'), real('verify-email-reminder')]);
      const sent = await p.emailSend.findMany({ where: { userId: unverified.id, templateKey: 'verify-email-reminder' } });
      expect(sent.filter(s => s.status === 'Sent').length === 1, 'two passes at once send one mail', JSON.stringify(sent.map(s => s.status)));
      const turned = [r1, r2].filter(r => /already running/.test(r?.note || ''));
      expect(turned.length === 1, 'the second pass is turned away by the lease', [r1?.note, r2?.note].join(' | '));
      expect(!(await p.emailEngine.findUnique({ where: { id: 'singleton' } })).lockedUntil, 'the lease is released afterwards');

      // The claim, with the lease out of the way: a send already in flight is not repeated…
      await p.emailSend.deleteMany({ where: { userId: unverified.id } });
      await p.user.update({ where: { id: unverified.id }, data: { lastMarketingAt: null } });
      await p.emailSend.create({ data: { userId: unverified.id, email: E(unverified), templateKey: 'verify-email-reminder', dedupeKey: 'auto:1', subject: 'x', status: 'Sending', sentBy: 'auto' } });
      await real('verify-email-reminder');
      let row = await p.emailSend.findFirst({ where: { userId: unverified.id, templateKey: 'verify-email-reminder', dedupeKey: 'auto:1' } });
      expect(row.status === 'Sending', 'a send in flight is not sent a second time');

      // …and one abandoned by a crash is taken over.
      await p.$executeRaw`update "EmailSend" set "updatedAt" = now() - interval '20 minutes' where id = ${row.id}`;
      await real('verify-email-reminder');
      row = await p.emailSend.findUnique({ where: { id: row.id } });
      expect(row.status === 'Sent', 'an abandoned claim is taken over and sent once');
      await real('verify-email-reminder');
      expect(await p.emailSend.count({ where: { userId: unverified.id, status: 'Sent' } }) === 1, 'running again does not send the same step twice');
    }

    console.log('\nOne automatic mail a day');
    {
      await p.emailSend.deleteMany({ where: { email: { endsWith: SUFFIX } } });
      await p.user.updateMany({ where: { email: { endsWith: SUFFIX } }, data: { lastMarketingAt: null } });
      // A different journey's mail went to this member two hours ago…
      await p.emailSend.create({ data: {
        userId: unverified.id, email: E(unverified), templateKey: 'never-read', dedupeKey: 'auto:1',
        subject: 'x', status: 'Sent', sentBy: 'auto', createdAt: new Date(Date.now() - 2 * 3600e3),
      } });
      await real('verify-email-reminder');
      const mine = await p.emailSend.findFirst({ where: { userId: unverified.id, templateKey: 'verify-email-reminder' } });
      expect(mine?.status === 'Skipped' && /24 hours/.test(mine.reason || ''), 'a second automatic mail within 24 hours is refused', `${mine?.status} — ${mine?.reason}`);
    }

    console.log('\nVerified members are not mailed');
    {
      await p.emailSend.deleteMany({ where: { email: { endsWith: SUFFIX } } });
      await p.user.updateMany({ where: { email: { endsWith: SUFFIX } }, data: { lastMarketingAt: null } });
      // The member is verified between being listed and being mailed: pretend the
      // list was drawn earlier by making them verified while the rule says due.
      await p.user.update({ where: { id: unverified.id }, data: { emailVerifiedAt: new Date() } });
      await real('verify-email-reminder');
      const row = await p.emailSend.findFirst({ where: { userId: unverified.id, templateKey: 'verify-email-reminder', status: 'Sent' } });
      expect(!row, 'a member who has verified is not mailed');
      await p.user.update({ where: { id: unverified.id }, data: { emailVerifiedAt: null } });
    }

    console.log('\nThe day is the Indian day');
    {
      await p.emailSend.deleteMany({ where: { email: { endsWith: SUFFIX } } });
      const IST = 330 * 60_000;
      const midnight = new Date(Math.floor((Date.now() + IST) / DAY) * DAY - IST);
      const base = (await call('/api/admin/email-engine')).body.state.sentToday;
      const mkRow = (key, at) => p.emailSend.create({ data: { userId: dormant.id, email: E(dormant), templateKey: 'never-read', dedupeKey: key, subject: 'x', status: 'Sent', sentBy: 'auto', createdAt: at } });
      await mkRow('tz:before', new Date(+midnight - 60_000));
      await mkRow('tz:after', new Date(+midnight + 60_000));
      const now = (await call('/api/admin/email-engine')).body.state.sentToday;
      expect(now - base === 1, 'only the send after Indian midnight counts toward today', `counted ${now - base} of the two`);
    }
  } finally {
    await restore();
    await p.emailSend.deleteMany({ where: { email: { endsWith: SUFFIX } } });
    await p.libraryEvent.deleteMany({ where: { userId: { in: (await p.user.findMany({ where: { email: { endsWith: SUFFIX } }, select: { id: true } })).map(u => u.id) } } });
    await p.user.deleteMany({ where: { email: { endsWith: SUFFIX } } });
    // Put back what was there.
    await p.emailEngine.update({ where: { id: 'singleton' }, data: {
      enabled: eng0?.enabled ?? false, startHour: eng0?.startHour ?? 10, endHour: eng0?.endHour ?? 18, dailyCap: eng0?.dailyCap ?? 200,
      loginTrackingSince: eng0?.loginTrackingSince ?? null, lockedUntil: null, lockedBy: null,
      lastRunAt: eng0?.lastRunAt ?? null, lastSent: eng0?.lastSent ?? 0, lastSkipped: eng0?.lastSkipped ?? 0, lastNote: eng0?.lastNote ?? null,
    } });
    for (const r of await p.emailRule.findMany()) {
      const before = rules0.find(x => x.templateKey === r.templateKey);
      if (before) await p.emailRule.update({ where: { id: r.id }, data: {
        enabled: before.enabled, delayDays: before.delayDays, repeatAfterDays: before.repeatAfterDays, maxSends: before.maxSends, dailyCap: before.dailyCap,
        lastRunAt: before.lastRunAt, lastDue: before.lastDue, lastSent: before.lastSent, lastSkipped: before.lastSkipped, lastFailed: before.lastFailed,
        lastDryRunAt: before.lastDryRunAt, lastDryRunDue: before.lastDryRunDue,
      } });
      else await p.emailRule.delete({ where: { id: r.id } });
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
