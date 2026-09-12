/**
 * One-time backfill for two columns the admin screens filter on.
 *
 * Both answer questions about members that used to require reading another
 * table in full: whether an address was ever proved (EmailVerification, keyed
 * by address, written before the account exists) and when the member last read
 * something (LibraryEvent, one row per open). New rows keep themselves up to
 * date; this carries the history across. Safe to run more than once.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();

  const proofs = await p.emailVerification.findMany({
    where: { isVerified: true }, select: { email: true, updatedAt: true },
  });
  let verified = 0;
  for (const v of proofs) {
    const r = await p.user.updateMany({
      where: { email: v.email, emailVerifiedAt: null },
      data: { emailVerifiedAt: v.updatedAt || new Date() },
    });
    verified += r.count;
  }

  const lastReads = await p.libraryEvent.groupBy({
    by: ['userId'], where: { kind: 'view', userId: { not: null } }, _max: { at: true },
  });
  let read = 0;
  for (const r of lastReads) {
    if (!r.userId || !r._max.at) continue;
    const done = await p.user.updateMany({
      where: { id: r.userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: r._max.at } }] },
      data: { lastReadAt: r._max.at },
    });
    read += done.count;
  }

  console.log(`email proofs: ${proofs.length} → ${verified} members marked verified`);
  console.log(`readers in the event log: ${lastReads.length} → ${read} members given a last-read date`);
  await p.$disconnect();
})();
