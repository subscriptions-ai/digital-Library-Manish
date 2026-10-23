import type { PrismaClient } from '@prisma/client';
import { revokeSessions, auditAccount, type Actor } from './accountSecurity.js';

/**
 * Removing a person from an institution is NOT deleting their account.
 *
 *   membership     the link between a person and ONE institution (User.institutionId, plus the seat row in InstitutionMemberAccess)
 *   the account    the global User row: sign-in, subscriptions, payments, history
 *
 * An institution removing a member always ends the membership at once (access, seat, sessions). The account itself is touched only when
 * nothing else keeps it alive — then it is held as PENDING_DELETION for 48 hours so a Super Admin can undo it, and a purge job anonymises it
 * after re-checking that nothing has changed. Anything that still ties the person to a subscription, another institution, a publisher
 * login or a staff role keeps the account: only the membership goes.
 */

export const GRACE_HOURS = 48;
export const PENDING_DELETION = 'PENDING_DELETION';
export const DELETED = 'DELETED';
/** The access class of a member an institution added. Only these can be removed by an institution, and only these can ever be scheduled. */
export const MEMBER_ROLE = 'Student';
const HOUR = 3_600_000;

export class RemovalError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }

export type Blocker = { code: string; detail: string };
type Db = PrismaClient | any;
type Subject = { id: string; role: string; institutionId: string | null };

/** Whether a status means the account may not sign in or read anything. */
export const isRemovedStatus = (s: string | null | undefined) => s === PENDING_DELETION || s === DELETED;

/** "r*****@gmail.com" — enough to recognise an account in the admin queue without showing the address. */
export function maskEmail(email: string | null | undefined): string {
  const e = String(email || '');
  const at = e.indexOf('@');
  if (at < 1) return '•••';
  return `${e[0]}${'*'.repeat(Math.min(5, Math.max(1, at - 1)))}${e.slice(at)}`;
}

/**
 * What still ties this account to the application once `removedFrom` lets go of them. Empty means nothing does and the account may be
 * scheduled for deletion. Anything listed keeps the account; each entry says why.
 *
 * `atPurge` is the second look, at the end of the 48 hours: by then the account has no institution at all, so ANY institution link means
 * somebody has added them back.
 */
export async function deletionBlockers(db: Db, user: Subject, removedFrom: string | null, o: { atPurge?: boolean } = {}): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
  const now = new Date();
  const other = removedFrom ?? '__none__';

  if (user.role !== MEMBER_ROLE) blockers.push({ code: 'ROLE', detail: `the account has the ${user.role} role, not an institution member's` });

  if (user.institutionId && (o.atPurge || user.institutionId !== removedFrom)) {
    blockers.push({ code: 'INSTITUTION', detail: o.atPurge ? 'the account belongs to an institution again' : 'the account belongs to another institution' });
  }

  const [personalPlans, otherSeats, pendingRequests, publisher, publisherSeat, posts, campaigns] = await Promise.all([
    // A plan held by the person themselves (Solo / individual / Pro), as opposed to one the removing institution holds.
    db.subscription.count({ where: { userId: user.id, status: 'Active', endDate: { gt: now }, OR: [{ institutionId: null }, { institutionId: { not: other } }] } }),
    db.institutionMemberAccess.count({ where: { userId: user.id, revokedAt: null, institutionId: { not: other } } }),
    db.subscriptionRequest.count({ where: { userId: user.id, status: 'Pending' } }),
    db.publisher.count({ where: { userId: user.id } }),
    db.publisherContact.count({ where: { userId: user.id } }),
    db.blogPost.count({ where: { authorId: user.id } }),
    db.campaign.count({ where: { ownerId: user.id } }),
  ]);
  if (personalPlans) blockers.push({ code: 'ACTIVE_SUBSCRIPTION', detail: `${personalPlans} active subscription(s) held by the person themselves` });
  if (otherSeats) blockers.push({ code: 'OTHER_INSTITUTION', detail: `a seat at ${otherSeats} other institution(s)` });
  if (pendingRequests) blockers.push({ code: 'PENDING_REQUEST', detail: 'a subscription request is waiting' });
  if (publisher || publisherSeat) blockers.push({ code: 'PUBLISHER', detail: 'linked to a publisher account' });
  if (posts) blockers.push({ code: 'AUTHORED_CONTENT', detail: 'the author of published blog posts' });
  if (campaigns) blockers.push({ code: 'CAMPAIGN_OWNER', detail: 'owns a marketing campaign' });
  return blockers;
}

export type RemovalOutcome =
  | { outcome: 'scheduled'; scheduledDeletionAt: Date; sessionsEnded: number }
  | { outcome: 'membership-only'; blockers: Blocker[]; sessionsEnded: number };

/**
 * An institution removes one of its members. The membership ends now; the account is scheduled for deletion in 48 hours only if nothing
 * else keeps it. Never deletes a User row.
 */
export async function removeFromInstitution(db: Db, p: { userId: string; institutionId: string; actor: Actor; now?: Date }): Promise<RemovalOutcome> {
  const now = p.now ?? new Date();
  const user = await db.user.findUnique({ where: { id: p.userId }, select: { id: true, role: true, institutionId: true } });
  if (!user) throw new RemovalError(404, 'User not found');
  if (user.institutionId !== p.institutionId) throw new RemovalError(403, 'Not your user');
  if (user.id === p.actor.uid) throw new RemovalError(400, 'You cannot remove your own account.');
  if (user.role !== MEMBER_ROLE) throw new RemovalError(400, 'Only the users you added can be removed here.');

  const blockers = await deletionBlockers(db, user, p.institutionId);
  const schedule = blockers.length === 0;
  const due = new Date(now.getTime() + GRACE_HOURS * HOUR);
  const trail = { removedAt: now, removedBy: p.actor.uid ?? null, removedByInstitutionId: p.institutionId };

  await db.$transaction([
    // The seat goes with the membership.
    db.institutionMemberAccess.updateMany({ where: { userId: user.id, institutionId: p.institutionId, revokedAt: null }, data: { revokedAt: now, revokedBy: p.actor.uid ?? null } }),
    db.user.update({
      where: { id: user.id },
      data: schedule
        ? { ...trail, status: PENDING_DELETION, institutionId: null, deletionScheduledAt: due, removalReason: 'Removed by institution' }
        : { ...trail, institutionId: null, role: 'Subscriber', institutionProfile: {}, deletionScheduledAt: null,
            removalReason: `Removed from institution; account kept (${blockers.map(b => b.code).join(', ')})` },
    }),
  ]);
  // The token carries role and institution, so every session ends: a person who keeps another entitlement signs in again and gets only that.
  const sessionsEnded = await revokeSessions(db, user.id);

  await auditAccount(db, p.actor, 'INSTITUTION_USER_REMOVED', { userId: user.id, institutionId: p.institutionId, outcome: schedule ? 'scheduled' : 'membership-only', kept: schedule ? [] : blockers.map(b => b.code) });
  if (schedule) await auditAccount(db, p.actor, 'GLOBAL_DELETION_SCHEDULED', { userId: user.id, institutionId: p.institutionId, scheduledDeletionAt: due.toISOString() });
  return schedule ? { outcome: 'scheduled', scheduledDeletionAt: due, sessionsEnded } : { outcome: 'membership-only', blockers, sessionsEnded };
}

/**
 * Super Admin undoes a scheduled deletion. The account comes back; the institution membership does NOT, unless asked for separately —
 * restoring a person and re-admitting them to an institution are different decisions.
 */
export async function cancelDeletion(db: Db, p: { userId: string; actor: Actor; restoreMembership?: boolean }) {
  const u = await db.user.findUnique({ where: { id: p.userId }, select: { id: true, role: true, status: true, removedByInstitutionId: true } });
  if (!u) throw new RemovalError(404, 'User not found');
  if (u.status === DELETED) throw new RemovalError(409, 'This account has already been deleted and cannot be restored.');
  if (u.status !== PENDING_DELETION) throw new RemovalError(409, 'This account is not pending deletion.');

  let institutionId: string | null = null;
  if (p.restoreMembership) {
    const inst = u.removedByInstitutionId ? await db.institution.findUnique({ where: { id: u.removedByInstitutionId }, select: { id: true } }) : null;
    if (!inst) throw new RemovalError(409, 'The institution it was removed from no longer exists.');
    institutionId = inst.id;
  }
  await db.user.update({
    where: { id: u.id },
    data: { status: 'Active', deletionScheduledAt: null, institutionId, role: u.role === MEMBER_ROLE && !institutionId ? 'Subscriber' : u.role },
  });
  await auditAccount(db, p.actor, 'GLOBAL_DELETION_CANCELLED', { userId: u.id, institutionId: u.removedByInstitutionId, membershipRestored: !!institutionId, reason: 'cancelled by a Super Admin' });
  return { membershipRestored: !!institutionId };
}

/**
 * The SAME institution adds back, within the 48 hours, a person it removed. The existing account is reused — same id, same history,
 * no second row — with the details the institution has just supplied.
 */
export async function reactivateRemovedMember(db: Db, existing: { id: string; status: string; removedByInstitutionId: string | null },
  p: { institutionId: string; institutionName: string; actor: Actor; data: { displayName: string; passwordHash: string; contact: string | null; designation: string; memberRole?: string | null; institutionProfile: any } }) {
  if (existing.status !== PENDING_DELETION || existing.removedByInstitutionId !== p.institutionId) return null;
  const user = await db.user.update({
    where: { id: existing.id },
    data: {
      status: 'Active', deletionScheduledAt: null, isBlocked: false, role: MEMBER_ROLE, institutionId: p.institutionId, organization: p.institutionName,
      displayName: p.data.displayName, password: p.data.passwordHash, contact: p.data.contact, designation: p.data.designation, institutionProfile: p.data.institutionProfile,
      ...(p.data.memberRole ? { memberRole: p.data.memberRole } : {}),
    },
  });
  await auditAccount(db, p.actor, 'GLOBAL_DELETION_CANCELLED', { userId: existing.id, institutionId: p.institutionId, reason: 're-added by the same institution' });
  return user;
}

/** The anonymised row keeps its id so payments, subscriptions and audit entries stay attached to something. */
const anonymousFields = (id: string, now: Date) => ({
  email: `deleted-${id}@deleted.invalid`, password: '!deleted', displayName: 'Deleted user', organization: '', contact: null, whatsapp: null,
  designation: '', state: null, country: null, institutionProfile: {}, interestedDomains: [], unsubscribeToken: null, marketingOptOut: true,
  status: DELETED, isBlocked: true, purgedAt: now,
});

export type PurgeResult = { examined: number; deleted: number; cancelled: number; failed: number };

/**
 * The scheduled purge. For every account whose 48 hours are up it looks again at whether anything now keeps the account — a plan bought on
 * day two, an institution that added them back — and only then anonymises it. Removes the person's own records (sessions, reading history,
 * favourites, feedback, free-session clock); detaches what other people's analytics need (the event rows stay, without the identity); leaves
 * payments, subscriptions, quotations, receipts and the audit log exactly as they are.
 */
export async function purgeDueAccounts(db: Db, o: { now?: Date; limit?: number } = {}): Promise<PurgeResult> {
  const now = o.now ?? new Date();
  const due = await db.user.findMany({
    where: { status: PENDING_DELETION, deletionScheduledAt: { lte: now } },
    select: { id: true, role: true, institutionId: true, email: true, removedByInstitutionId: true, removalReason: true },
    orderBy: { deletionScheduledAt: 'asc' }, take: o.limit ?? 200,
  });
  const out: PurgeResult = { examined: due.length, deleted: 0, cancelled: 0, failed: 0 };

  for (const u of due) {
    try {
      const blockers = await deletionBlockers(db, u, u.removedByInstitutionId, { atPurge: true });
      if (blockers.length) {
        await db.user.update({ where: { id: u.id }, data: {
          status: 'Active', deletionScheduledAt: null, role: u.role === MEMBER_ROLE && !u.institutionId ? 'Subscriber' : u.role,
          removalReason: `${u.removalReason || 'Removed by institution'} | deletion cancelled: ${blockers.map(b => b.code).join(', ')}`,
        } });
        await auditAccount(db, null, 'GLOBAL_DELETION_CANCELLED', { userId: u.id, institutionId: u.removedByInstitutionId, reason: 'still has a valid relationship', kept: blockers.map(b => b.code), actor: 'system' });
        out.cancelled++;
        continue;
      }
      const done = await db.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'account-purge:' + u.id}))`;
        const fresh = await tx.user.findUnique({ where: { id: u.id }, select: { status: true } });
        if (fresh?.status !== PENDING_DELETION) return false;
        const id = u.id;
        await tx.userSession.deleteMany({ where: { userId: id } });
        await tx.institutionMemberAccess.deleteMany({ where: { userId: id } });
        await tx.favorite.deleteMany({ where: { userId: id } });
        await tx.feedback.deleteMany({ where: { userId: id } });
        await tx.studentActivity.deleteMany({ where: { userId: id } });
        await tx.usageLog.deleteMany({ where: { userId: id } });
        await tx.freeSession.deleteMany({ where: { userId: id } });
        await tx.libraryEvent.updateMany({ where: { userId: id }, data: { userId: null } });
        await tx.readEvent.updateMany({ where: { userId: id }, data: { userId: null } });
        await tx.pageVisit.updateMany({ where: { userId: id }, data: { userId: null, ipAddress: null } });
        await tx.emailSend.updateMany({ where: { userId: id }, data: { userId: null, email: 'deleted@deleted.invalid' } });
        await tx.aIVisitor.updateMany({ where: { OR: [{ userId: id }, { email: { equals: u.email, mode: 'insensitive' } }] }, data: { userId: null, email: null, name: 'Deleted visitor' } });
        await tx.emailVerification.deleteMany({ where: { email: { equals: u.email, mode: 'insensitive' } } });
        await tx.user.update({ where: { id }, data: anonymousFields(id, now) });
        return true;
      });
      if (done) {
        await auditAccount(db, null, 'GLOBAL_DELETION_EXECUTED', { userId: u.id, institutionId: u.removedByInstitutionId, actor: 'system' });
        out.deleted++;
      }
    } catch (e: any) {
      out.failed++;
      console.error(`account purge failed for ${u.id}:`, e?.code || e?.name || 'error');
    }
  }
  return out;
}
