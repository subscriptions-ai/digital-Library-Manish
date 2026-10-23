/**
 * Role and designation of a person in an institution — two different things.
 *
 * ROLE is what the person is to the library: Faculty, Researcher, Student, Librarian or
 * Institution Admin. It is chosen, never guessed from a title when it can be avoided.
 *
 * DESIGNATION is their job title ("Associate Professor", "Dean"). It is free text, shown
 * beside the role, and it grants nothing.
 *
 * Neither is `User.role`. That column is the technical access class the whole application
 * authorises with (JWT claim, dashboard route, content entitlement) and every member an
 * institution adds shares one value of it. The role here is `User.memberRole`: what the
 * person is called, for people. Authorisation never reads it, except that adding a Student
 * is a Pro feature, and that is checked against the role the librarian chose.
 */

export const ACCESS_ROLES = ['Faculty', 'Researcher', 'Student', 'Librarian', 'Institution Admin'] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

/**
 * What a librarian may give a person they add. Librarian and Institution Admin are not here:
 * either would be a second administrator of the account, and nobody can add one from this screen.
 */
export const ASSIGNABLE_MEMBER_ROLES = ['Faculty', 'Researcher', 'Student'] as const;
export type AssignableMemberRole = (typeof ASSIGNABLE_MEMBER_ROLES)[number];

/** Roles that belong to Pro: shown to a free institution, refused by the server. */
export const PRO_ONLY_ACCESS_ROLES: readonly string[] = ['Student'];

/** Titles offered as suggestions in the form. Any title may be typed. */
export const DESIGNATION_SUGGESTIONS = [
  'Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'HOD / Dean',
  'Research Scholar', 'Research Associate', 'Research Fellow', 'Student',
] as const;

export const MAX_DESIGNATION_LENGTH = 80;

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Only titles whose role is not in doubt. Anything else (Dean, HOD, Teacher, Manager…)
 * is deliberately absent, so it is asked about rather than assumed.
 */
const DESIGNATION_TO_ROLE: Record<string, AccessRole> = {
  'professor': 'Faculty', 'prof': 'Faculty',
  'associate professor': 'Faculty', 'assoc professor': 'Faculty', 'associate prof': 'Faculty',
  'assistant professor': 'Faculty', 'asst professor': 'Faculty', 'assistant prof': 'Faculty', 'asst prof': 'Faculty',
  'lecturer': 'Faculty', 'senior lecturer': 'Faculty',
  'faculty': 'Faculty',
  'research scholar': 'Researcher', 'research associate': 'Researcher', 'research fellow': 'Researcher',
  'researcher': 'Researcher',
  'student': 'Student',
  'librarian': 'Librarian',
};

/** The role a designation settles on, or null when it does not settle on one. */
export function roleFromDesignation(designation: unknown): AccessRole | null {
  return DESIGNATION_TO_ROLE[norm(designation)] ?? null;
}

/** `value` as one of the roles a librarian may assign, or null. Case and spacing are forgiven. */
export function assignableRole(value: unknown): AssignableMemberRole | null {
  const v = norm(value);
  return ASSIGNABLE_MEMBER_ROLES.find(r => r.toLowerCase() === v) ?? null;
}

/** Any role a person can hold, or null. */
export function accessRoleOf(value: unknown): AccessRole | null {
  const v = norm(value);
  return ACCESS_ROLES.find(r => r.toLowerCase() === v) ?? null;
}

export type RoleSource = 'set' | 'account' | 'designation' | 'review';

/**
 * The role to show for a person, and how it was settled:
 *  - account: the technical role is Institution, which can run the whole account → Institution Admin.
 *  - set: someone chose it.
 *  - designation: nobody chose it, but the title settles it. Shown, not saved.
 *  - review: nothing settles it. The role is null and the screen says so.
 */
export function effectiveAccessRole(u: { role?: string | null; memberRole?: string | null; designation?: string | null }):
  { role: AccessRole | null; source: RoleSource } {
  if (u.role === 'Institution') return { role: 'Institution Admin', source: 'account' };
  const set = accessRoleOf(u.memberRole);
  if (set) return { role: set, source: 'set' };
  const mapped = roleFromDesignation(u.designation);
  if (mapped && mapped !== 'Librarian') return { role: mapped, source: 'designation' };
  if (mapped === 'Librarian') return { role: 'Librarian', source: 'designation' };
  return { role: null, source: 'review' };
}

/**
 * A bulk-import row's role. An explicit Role column wins and must be valid; without one the
 * designation must settle it. Never defaults.
 */
export function resolveImportRole(row: { role?: unknown; memberRole?: unknown; designation?: unknown }):
  { role: AssignableMemberRole } | { error: string } {
  const given = String(row.role ?? row.memberRole ?? '').trim();
  if (given) {
    const r = assignableRole(given);
    return r ? { role: r } : { error: `Role must be one of: ${ASSIGNABLE_MEMBER_ROLES.join(', ')}` };
  }
  const designation = String(row.designation ?? '').trim();
  if (!designation) return { error: `Role is missing. Add a role (${ASSIGNABLE_MEMBER_ROLES.join(', ')}) for this row` };
  const mapped = roleFromDesignation(designation);
  const r = mapped && assignableRole(mapped);
  return r ? { role: r }
    : { error: `The designation "${designation.slice(0, 40)}" does not settle a role. Add a role (${ASSIGNABLE_MEMBER_ROLES.join(', ')}) for this row` };
}

/** A designation as stored: trimmed, bounded, and null when empty. */
export function cleanDesignation(value: unknown): string | null {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESIGNATION_LENGTH);
  return v || null;
}
