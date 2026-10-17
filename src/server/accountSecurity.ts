import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

/**
 * Account credentials and the rules around them, in one place, so every route that changes an email, a password, a role or an account's
 * standing applies the same ones.
 *
 * Nothing here ever returns, logs or audits a password, a hash, a token or a one-time code. Credential presence is answered by the database
 * (`password ~ '^\$2'`) so the hash never has to leave it.
 */

/** The project's existing rule (signup reset, forced change, profile): at least 8 characters. bcrypt reads only the first 72 bytes. */
export const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

/** What is wrong with a proposed password, or null. Never echoes the password. */
export function passwordProblem(pw: unknown, confirm?: unknown): string | null {
  if (typeof pw !== 'string' || pw.trim() === '') return 'Enter a new password.';
  if (pw.length < PASSWORD_MIN) return `The password must be at least ${PASSWORD_MIN} characters.`;
  if (Buffer.byteLength(pw, 'utf8') > PASSWORD_MAX_BYTES) return `The password must be at most ${PASSWORD_MAX_BYTES} bytes.`;
  if (confirm !== undefined && confirm !== pw) return 'The two passwords do not match.';
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

/** Emails are compared trimmed and lower-cased: `Admin@Example.com` and `admin@example.com` are one address. */
export const normalizeEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
export const isValidEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * The account for an address, as typed. The stored address wins when it matches exactly; otherwise one case-insensitive match is accepted.
 * (Some older rows were stored with capitals, so a lower-cased lookup alone would miss them.) More than one case-insensitive match is refused.
 */
export async function findUserByEmail<T extends Record<string, any>>(prisma: PrismaClient, email: unknown, select?: T): Promise<any | null> {
  const raw = typeof email === 'string' ? email.trim() : '';
  if (!raw) return null;
  const exact = await prisma.user.findUnique({ where: { email: raw }, ...(select ? { select } : {}) } as any);
  if (exact) return exact;
  const many = await prisma.user.findMany({ where: { email: { equals: raw, mode: 'insensitive' } }, take: 2, ...(select ? { select } : {}) } as any);
  return many.length === 1 ? many[0] : null;
}

/** True when another account already holds this address (compared case-insensitively). */
export async function emailTaken(prisma: PrismaClient, email: string, exceptId?: string): Promise<boolean> {
  const hit = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
  return !!hit;
}

/** An account that can act as a Super Admin right now. */
export const isActiveSuperAdmin = (u: { role?: string | null; isBlocked?: boolean | null; status?: string | null }) =>
  u.role === 'SuperAdmin' && !u.isBlocked && (u.status ?? 'Active') === 'Active';

/**
 * Would this change leave the system with no active Super Admin? Demoting, blocking, deactivating or deleting the last one is refused, so
 * there is always someone who can manage accounts. Another Super Admin has to be created (or unblocked) first.
 */
export async function removesLastSuperAdmin(prisma: PrismaClient, target: { id: string; role: string; isBlocked: boolean; status: string },
  change: { role?: string; isBlocked?: boolean; status?: string; deleted?: boolean }): Promise<boolean> {
  if (!isActiveSuperAdmin(target)) return false;
  const after = { role: change.role ?? target.role, isBlocked: change.isBlocked ?? target.isBlocked, status: change.status ?? target.status };
  if (!change.deleted && isActiveSuperAdmin(after)) return false;
  const others = await prisma.user.count({ where: { role: 'SuperAdmin', isBlocked: false, status: 'Active', NOT: { id: target.id } } });
  return others === 0;
}
export const LAST_SUPER_ADMIN = { code: 'LAST_SUPER_ADMIN', error: 'This is the only active Super Admin. Create or activate another Super Admin first.' };

/** Ends every live session of one account, optionally keeping the caller's own. Returns how many ended. Touches nobody else. */
export async function revokeSessions(prisma: PrismaClient, userId: string, keepSessionId?: string | null): Promise<number> {
  const r = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null, ...(keepSessionId ? { NOT: { sessionId: keepSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

/** Checks a password against the account's stored hash. A value that is not a bcrypt hash never matches. */
export async function passwordMatches(prisma: PrismaClient, userId: string, password: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!u?.password || !/^\$2[aby]\$\d\d\$/.test(u.password)) return false;
  try { return await bcrypt.compare(password, u.password); } catch { return false; }
}

/**
 * Re-authentication for the most sensitive actions (another Super Admin's email or password, demoting, blocking or deleting a Super Admin):
 * the acting Super Admin types their own password again. Reuses the password they already have; no second sign-in system.
 * Answered with 403 (never 401, which the browser treats as "signed out").
 */
export const REAUTH_REQUIRED = { code: 'REAUTH_REQUIRED', error: 'Confirm your own password to continue.' };
export const REAUTH_FAILED = { code: 'REAUTH_FAILED', error: 'Your password was not correct.' };

/** Which accounts have a usable password, for a page of ids. Only ids come back, never the hash. */
export async function withPasswordCredential(prisma: PrismaClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ANY(${ids}::text[]) AND password ~ '^\\$2[aby]\\$[0-9]{2}\\$'`;
  return new Set(rows.map(r => r.id));
}

export type Actor = { uid?: string; email?: string; role?: string };
/**
 * Security-sensitive account changes, in the admin audit log. Actor, target, action and safe facts only: never a password, a hash, a token
 * or a code. A failure to audit is logged and does not undo the change.
 */
export async function auditAccount(prisma: PrismaClient, actor: Actor | null, action: string, meta: Record<string, unknown>) {
  try {
    await prisma.adminAuditLog.create({ data: { adminId: actor?.uid ?? null, adminEmail: actor?.email ?? null, action, meta: meta as any } });
  } catch (e: any) { console.error(`account audit ${action} could not be written:`, e?.name || 'error'); }
}

/** The account fields a screen may see. Explicit, so a new secret column can never leak by default. */
export const SAFE_USER_SELECT = {
  id: true, email: true, displayName: true, role: true, status: true, isBlocked: true, emailVerifiedAt: true,
  lastLoginAt: true, createdAt: true, institutionId: true, isFirstLogin: true, organization: true, contact: true, designation: true,
} as const;
