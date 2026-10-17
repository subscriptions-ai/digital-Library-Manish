#!/usr/bin/env node
/**
 * Privileged accounts: a read-only inventory, a password check that answers only YES/NO, and a guarded "finalize" that leaves exactly one
 * intended Super Admin. Plain node, so it runs inside the production container (scripts/ is copied into the image):
 *
 *   node scripts/privileged-accounts.cjs                       # READ-ONLY list of every staff account
 *   node scripts/privileged-accounts.cjs --check               # READ-ONLY: asks for a password, says which privileged accounts it opens
 *   node scripts/privileged-accounts.cjs --finalize --keep <userId> --email <final@address> --disable <userId>[,<userId>…]
 *                                                              # DRY RUN: prints what would change, changes nothing
 *   … --finalize … --apply                                     # does it (asks for the new password twice)
 *
 * Finalize, in one transaction: the kept account gets the final email (trimmed, lower-cased, unique case-insensitively) and a new bcrypt
 * password, and stays an active Super Admin; each account in --disable is BLOCKED (never deleted, role and history untouched) and every
 * session it holds is ended, so a browser still signed in as it stops working at its next request; the kept account's old sessions end too.
 * It refuses anything that would leave no active Super Admin. Every change is written to AdminAuditLog without any password or hash.
 *
 * Never prints a password, a hash, a token or a session id.
 */
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const STAFF = ['SuperAdmin', 'Admin', 'ContentManager', 'SubscriptionManager', 'SalesExecutive', 'SalesManager', 'Publisher'];
const BCRYPT = /^\$2[aby]\$\d\d\$/;
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const day = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '—');
const prisma = new PrismaClient();

/**
 * Reads a line without echoing it, so a password is never shown on screen or kept in shell history. With piped input (the test suite)
 * the lines are read in order from one shared reader.
 */
let rl = null;
const queued = [];
const waiting = [];
function askHidden(question) {
  const tty = !!process.stdin.isTTY;
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: tty ? process.stdout : undefined, terminal: tty });
    if (tty) rl._writeToOutput = (s) => { if (/: $/.test(s)) process.stdout.write(s); };
    rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : queued.push(l)));
    rl.on('close', () => { while (waiting.length) waiting.shift()(''); });
  }
  if (tty) process.stdout.write(question);
  return new Promise((resolve) => (queued.length ? resolve(queued.shift()) : waiting.push(resolve))).then((a) => { if (tty) process.stdout.write('\n'); return a; });
}
const closeInput = () => { if (rl) rl.close(); };

/** A Super Admin record in any spelling ever stored (SuperAdmin, SUPER_ADMIN, superadmin…), whatever its status. */
const isSuperRole = (r) => /^super_?admin$/i.test(String(r || ''));

async function inventory() {
  const rows = await prisma.user.findMany({
    // Every privileged record, active or not: the known staff roles plus any role spelled with "admin" or "master" in any case.
    where: { OR: [{ role: { in: STAFF } }, { role: { contains: 'admin', mode: 'insensitive' } }, { role: { contains: 'master', mode: 'insensitive' } }] },
    select: { id: true, displayName: true, email: true, role: true, status: true, isBlocked: true, createdAt: true, updatedAt: true, lastLoginAt: true, emailVerifiedAt: true, password: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  const live = await prisma.userSession.groupBy({ by: ['userId'], where: { userId: { in: rows.map((r) => r.id) }, revokedAt: null, expiresAt: { gt: new Date() } }, _count: { _all: true } });
  const liveBy = new Map(live.map((l) => [l.userId, l._count._all]));
  const out = rows.map((u) => ({
    id: u.id, name: u.displayName || '', email: u.email, role: u.role,
    status: u.isBlocked ? 'Blocked' : u.status, created: day(u.createdAt), updated: day(u.updatedAt), lastLogin: day(u.lastLoginAt),
    verified: u.emailVerifiedAt ? 'YES' : 'NO', password: BCRYPT.test(u.password || '') ? 'YES' : 'NO', liveSessions: liveBy.get(u.id) || 0,
  }));
  console.table(out);
  const sa = rows.filter((u) => isSuperRole(u.role));
  const active = (u) => !u.isBlocked && u.status === 'Active';
  console.log(`Super Admins: ${sa.length} (active ${sa.filter(active).length}) · Admins: ${rows.filter((u) => u.role === 'Admin').length} · active privileged accounts: ${rows.filter(active).length}`);

  // Super Admin records: TOTAL and ACTIVE are different questions, so both are answered.
  const state = (u) => (u.isBlocked ? 'BLOCKED' : u.status === 'Active' ? 'ACTIVE' : String(u.status || 'UNKNOWN').toUpperCase());
  console.log(`\nSUPER ADMIN RECORDS (all statuses): ${sa.length}`);
  sa.forEach((u, i) => {
    const o = out.find((x) => x.id === u.id);
    console.log(`\nSuper Admin #${i + 1}\n  User ID: ${u.id}\n  Email: ${u.email}\n  Name: ${u.displayName || '—'}\n  Role: ${u.role}\n  Status: ${state(u)}\n  Email Verified: ${o.verified}\n  Password Credential Exists: ${o.password}\n  Created At: ${o.created}\n  Updated At: ${o.updated}\n  Last Login: ${o.lastLogin}\n  Live Sessions: ${o.liveSessions}`);
  });
  const byState = sa.reduce((m, u) => ((m[state(u)] = (m[state(u)] || 0) + 1), m), {});
  console.log(`\nActive: ${byState.ACTIVE || 0} · Blocked: ${byState.BLOCKED || 0} · other non-active statuses: ${sa.length - (byState.ACTIVE || 0) - (byState.BLOCKED || 0)}`);

  // Former Super Admins: accounts whose role was changed away from Super Admin, from both audit trails.
  const removed = await prisma.adminAuditLog.findMany({ where: { action: { in: ['SUPER_ADMIN_REMOVED', 'ROLE_CHANGED'] } }, select: { action: true, at: true, meta: true } });
  const formerIds = new Set(removed.filter((r) => r.action === 'SUPER_ADMIN_REMOVED' || isSuperRole(r.meta && r.meta.from)).map((r) => r.meta && r.meta.targetUserId).filter(Boolean));
  const usage = await prisma.usageLog.findMany({ where: { action: 'ROLE_CHANGE', details: { startsWith: 'Role changed from SuperAdmin' } }, select: { details: true, createdAt: true } });
  console.log(`Former Super Admins (role changed away, per AdminAuditLog): ${formerIds.size}${formerIds.size ? ' — ' + [...formerIds].join(', ') : ''}`);
  console.log(`Role changes away from SuperAdmin in UsageLog: ${usage.length}`);
  // Same person, several privileged records: compare the part of the address before "@" and the display name.
  const key = (u) => String(u.email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const groups = new Map();
  for (const u of rows) for (const k of [`local:${key(u)}`, `name:${String(u.displayName || '').trim().toLowerCase()}`]) if (!k.endsWith(':')) groups.set(k, [...(groups.get(k) || []), u]);
  const dups = [...groups.entries()].filter(([, us]) => us.length > 1);
  console.log(`Privileged records sharing an email name or display name: ${dups.length ? dups.map(([k, us]) => `${k} → ${us.map((u) => `${u.email} (${u.role})`).join(', ')}`).join(' | ') : 'none'}`);
  console.log(`MASTER_ADMIN_EMAIL is ${process.env.MASTER_ADMIN_EMAIL ? 'set' : 'not set'} here${process.env.MASTER_ADMIN_EMAIL ? `; an account with that address ${rows.some((u) => u.email.toLowerCase() === process.env.MASTER_ADMIN_EMAIL.trim().toLowerCase()) ? 'exists' : 'does NOT exist'}` : ''}.`);
  return rows;
}

async function check() {
  const rows = await prisma.user.findMany({ where: { role: { in: STAFF } }, select: { id: true, email: true, role: true, isBlocked: true, password: true } });
  const pw = await askHidden('Password to test (not shown): ');
  if (!pw) { console.log('Nothing entered.'); return; }
  for (const u of rows) {
    let ok = false;
    if (BCRYPT.test(u.password || '')) { try { ok = await bcrypt.compare(pw, u.password); } catch { ok = false; } }
    if (ok) console.log(`OPENS  ${u.email}  (${u.id}, ${u.role}${u.isBlocked ? ', but the account is BLOCKED so sign-in is refused' : ''})`);
  }
  console.log('Accounts not listed above are not opened by that password.');
}

async function finalize() {
  const keepId = opt('--keep');
  const email = String(opt('--email') || '').trim().toLowerCase();
  const disable = String(opt('--disable') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const apply = flag('--apply');
  if (!keepId || !email) throw new Error('Give --keep <userId> and --email <final address> (and --disable <userId,…> for obsolete accounts).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That final email address is not valid.');
  if (disable.includes(keepId)) throw new Error('The kept account cannot also be disabled.');

  const keep = await prisma.user.findUnique({ where: { id: keepId } });
  if (!keep) throw new Error('No account has that --keep id.');
  if (keep.role !== 'SuperAdmin') throw new Error(`The kept account is ${keep.role}, not SuperAdmin.`);
  const clash = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, NOT: { id: keepId } }, select: { id: true, role: true } });
  if (clash && !disable.includes(clash.id)) throw new Error(`Another account (${clash.id}, ${clash.role}) already uses ${email}. Free that address first.`);
  if (clash) throw new Error(`${email} belongs to an account you are disabling (${clash.id}). Change that account's address first; a blocked account still holds its email.`);
  const olds = await prisma.user.findMany({ where: { id: { in: disable } }, select: { id: true, email: true, role: true, isBlocked: true } });
  if (olds.length !== disable.length) throw new Error('One of the --disable ids does not exist.');

  console.log(`\n${apply ? 'APPLYING' : 'DRY RUN (add --apply to make these changes)'}`);
  console.log(`KEEP     ${keep.id}  ${keep.email} -> ${email}${keep.email === email ? ' (unchanged)' : ''}; new password; stays active SuperAdmin; its current sessions end`);
  if (keep.isBlocked) console.log('         (the kept account is blocked now; it will be unblocked)');
  for (const o of olds) console.log(`DISABLE  ${o.id}  ${o.email} (${o.role}) -> blocked, all sessions ended; not deleted, history kept`);
  if (!apply) return;

  const pw = await askHidden('New password for the kept account (not shown): ');
  const again = await askHidden('Type it again: ');
  if (pw !== again) throw new Error('The two passwords do not match. Nothing was changed.');
  if (pw.length < 8 || Buffer.byteLength(pw, 'utf8') > 72) throw new Error('The password must be 8 to 72 bytes. Nothing was changed.');
  const hash = await bcrypt.hash(pw, 10);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: keep.id }, data: { email, password: hash, isBlocked: false, status: 'Active', role: 'SuperAdmin', isFirstLogin: false, ...(keep.email !== email ? { emailVerifiedAt: null } : {}) } });
    await tx.userSession.updateMany({ where: { userId: keep.id, revokedAt: null }, data: { revokedAt: now } });
    for (const o of olds) {
      await tx.user.update({ where: { id: o.id }, data: { isBlocked: true } });
      await tx.userSession.updateMany({ where: { userId: o.id, revokedAt: null }, data: { revokedAt: now } });
    }
    const left = await tx.user.count({ where: { role: 'SuperAdmin', isBlocked: false, status: 'Active' } });
    if (left < 1) throw new Error('This would leave no active Super Admin. Nothing was changed.');
    const actor = { adminId: keep.id, adminEmail: email };
    if (keep.email !== email) await tx.adminAuditLog.create({ data: { ...actor, action: 'EMAIL_CHANGED', meta: { targetUserId: keep.id, via: 'privileged-accounts.cjs' } } });
    await tx.adminAuditLog.create({ data: { ...actor, action: 'PASSWORD_RESET', meta: { targetUserId: keep.id, via: 'privileged-accounts.cjs' } } });
    for (const o of olds) await tx.adminAuditLog.create({ data: { ...actor, action: 'ACCOUNT_DISABLED', meta: { targetUserId: o.id, targetRole: o.role, via: 'privileged-accounts.cjs', reason: 'obsolete privileged account' } } });
  });

  // Verify from the database, not from what was intended.
  const after = await prisma.user.findUnique({ where: { id: keep.id }, select: { email: true, password: true, role: true, isBlocked: true } });
  const works = await bcrypt.compare(pw, after.password);
  console.log(`\nKept account: ${after.email}, ${after.role}, ${after.isBlocked ? 'BLOCKED' : 'active'}, new password verifies: ${works ? 'YES' : 'NO'}`);
  for (const o of olds) {
    const r = await prisma.user.findUnique({ where: { id: o.id }, select: { isBlocked: true } });
    const liveLeft = await prisma.userSession.count({ where: { userId: o.id, revokedAt: null, expiresAt: { gt: new Date() } } });
    console.log(`Disabled ${o.email}: blocked ${r.isBlocked ? 'YES' : 'NO'}, live sessions left ${liveLeft}`);
  }
  console.log(`Active Super Admins now: ${await prisma.user.count({ where: { role: 'SuperAdmin', isBlocked: false, status: 'Active' } })}`);
}

(async () => {
  if (flag('--finalize')) await finalize();
  else if (flag('--check')) await check();
  else await inventory();
})().catch((e) => { console.error(e && e.message ? e.message : e); process.exitCode = 1; }).finally(() => { closeInput(); return prisma.$disconnect(); });
