/**
 * Account type and professional designation of a person — two different things.
 *
 * ACCOUNT TYPE (the `memberRole` column; shown as "Account Type") is how the person uses the library: Faculty,
 * Researcher, Student, Librarian or Institution Admin. It is chosen, and never read off a title.
 *
 * PROFESSIONAL DESIGNATION (the `designation` column) is their real-world title ("Associate Professor", "Research
 * Scientist"). It is suggested from the account type but never restricted to it: a real person can be a Researcher
 * whose title is Associate Professor, and nothing here treats that as a mistake. It is shown beside the account
 * type, and it grants nothing.
 *
 * This file is the one place the lists, the rules and the helpers for both live. The institution Add/Edit User forms,
 * the Admin Users edit form, the CSV import, the server's validation and the read-only audit all use it.
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

export const OTHER_DESIGNATION = 'Other';
export const MAX_DESIGNATION_LENGTH = 100;

/** The kinds of list there are. Faculty, Researcher and Student are account types; Institution is the library roles; Corporate is industry. */
export type DesignationGroup = 'Faculty' | 'Researcher' | 'Student' | 'Institution' | 'Corporate';
export const DESIGNATION_GROUPS_ORDER: readonly DesignationGroup[] = ['Faculty', 'Researcher', 'Student', 'Institution', 'Corporate'];

/**
 * Titles suggested for each account type, each ending in "Other". Suggestions are guidance, not a rule: the server does not refuse a title because
 * it is not in the list for the account type, and a title may be in more than one list ("Scientist" is a researcher's and an industry title).
 * Existing titles already in use are kept; none was removed.
 */
export const DESIGNATIONS_BY_ROLE: Record<DesignationGroup, readonly string[]> = {
  Faculty: [
    'Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Senior Lecturer', 'HOD / Head of Department', 'Dean', 'Principal',
    'Visiting Faculty', 'Adjunct Faculty', OTHER_DESIGNATION,
  ],
  Researcher: [
    'Researcher', 'Senior Researcher', 'Research Scientist', 'Senior Research Scientist', 'Research Associate', 'Research Fellow', 'Senior Research Fellow',
    'Junior Research Fellow', 'Postdoctoral Fellow', 'Postdoctoral Researcher', 'Project Scientist', 'Scientist', 'Principal Investigator', 'Research Officer', OTHER_DESIGNATION,
  ],
  Student: [
    'Undergraduate Student', 'Postgraduate Student', "Master's Student", 'PhD Scholar', 'Doctoral Researcher', 'Research Scholar', 'Intern', OTHER_DESIGNATION,
  ],
  Institution: [
    'Librarian', 'Chief Librarian', 'Head Librarian', 'Deputy Librarian', 'Assistant Librarian', 'Library Officer', 'Information Scientist',
    'Knowledge Resource Manager', 'Library Administrator', OTHER_DESIGNATION,
  ],
  Corporate: [
    'R&D Manager', 'Research Manager', 'Scientist', 'Senior Scientist', 'Engineer', 'Senior Engineer', 'Technical Manager', 'Product Manager', 'Director', OTHER_DESIGNATION,
  ],
};

/** The list an account type suggests from: Librarian and Institution Admin use the library roles. */
export function designationGroupOf(accountType: unknown): DesignationGroup | null {
  const v = String(accountType ?? '').trim().toLowerCase();
  if (v === 'faculty') return 'Faculty';
  if (v === 'researcher') return 'Researcher';
  if (v === 'student') return 'Student';
  if (v === 'librarian' || v === 'institution admin' || v === 'institution') return 'Institution';
  if (v === 'corporate' || v === 'corporate / industry' || v === 'industry') return 'Corporate';
  return null;
}

/** Every suggested title once each, "Other" last: what is offered when the account type is not known. */
export const ALL_SUGGESTED_DESIGNATIONS: readonly string[] = [
  ...new Set(DESIGNATION_GROUPS_ORDER.flatMap(g => DESIGNATIONS_BY_ROLE[g]).filter(d => d !== OTHER_DESIGNATION)), OTHER_DESIGNATION];

/** The titles to suggest for an account type (or list name), "Other" last. An unknown account type is offered every title, so nothing is hidden from a person. */
export function getSuggestedDesignations(accountType: unknown): string[] {
  const g = designationGroupOf(accountType);
  return g ? [...DESIGNATIONS_BY_ROLE[g]] : [...ALL_SUGGESTED_DESIGNATIONS];
}

/** Whitespace squeezed to single spaces and trimmed. Case is left alone: it is how the person's title is written. */
export function normalizeDesignation(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

const keyOf = (v: unknown) => normalizeDesignation(v).toLowerCase();

/** Whether `designation` is one of the titles suggested for this account type (the word "Other" is not a title). */
export function isKnownDesignation(accountType: unknown, designation: unknown): boolean {
  const k = keyOf(designation);
  return !!k && k !== keyOf(OTHER_DESIGNATION) && getSuggestedDesignations(accountType).some(d => keyOf(d) === k && d !== OTHER_DESIGNATION);
}

/** Whether any list at all suggests this title. */
export function isStandardDesignation(designation: unknown): boolean {
  return isKnownDesignation(null, designation);
}

/** The listed spelling of a title ("associate professor" → "Associate Professor"), or the title as written when it is not listed. */
export function canonicalDesignation(designation: unknown): string {
  const k = keyOf(designation);
  return ALL_SUGGESTED_DESIGNATIONS.find(d => d !== OTHER_DESIGNATION && keyOf(d) === k) ?? normalizeDesignation(designation);
}

/**
 * Whether a professional designation is acceptable to store: a reasonable piece of text, no longer than MAX_DESIGNATION_LENGTH, with no markup, script
 * or control characters. It is deliberately NOT checked against the suggested lists. The literal word "Other" is refused: it is the choice that opens
 * the text box, never a title.
 */
export function validateDesignation(value: unknown, opts: { required?: boolean } = {}): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value !== undefined && value !== null && typeof value !== 'string') return { ok: false, error: 'Designation must be text.' };
  const v = normalizeDesignation(value);
  if (!v) return opts.required ? { ok: false, error: 'Professional designation is required.' } : { ok: true, value: null };
  if (v.length > MAX_DESIGNATION_LENGTH) return { ok: false, error: `Designation can be at most ${MAX_DESIGNATION_LENGTH} characters.` };
  if (/[<>]/.test(v) || /[\u0000-\u001f\u007f]/.test(v) || /javascript:|data:text\/html|on[a-z]+\s*=/i.test(v)) return { ok: false, error: 'Designation cannot contain markup, script or special characters.' };
  if (v.toLowerCase() === OTHER_DESIGNATION.toLowerCase()) return { ok: false, error: 'Please enter the actual designation, not the word "Other".' };
  return { ok: true, value: v };
}

/**
 * What the designation field holds in a form: the title (`value`), and whether it is being written in as "Other" (`other`). Choosing a suggestion
 * sets `value` to it; choosing "Other" opens the text box, where `value` is what is typed.
 */
export type DesignationState = { value: string; other: boolean };

/**
 * The field's state for a title already on record. A title in the account type's list is a plain selection. A title from another list (a Researcher
 * who is an Associate Professor) is kept exactly as it is, shown as selected. Anything else is shown as "Other" with the title in the box, so no stored
 * value is ever dropped just because it is not in a list.
 */
export function designationStateFor(accountType: unknown, stored: unknown): DesignationState {
  const v = normalizeDesignation(stored);
  if (!v) return { value: '', other: false };
  if (isKnownDesignation(accountType, v) || isStandardDesignation(v)) return { value: canonicalDesignation(v), other: false };
  return { value: v, other: true };
}

/**
 * Changing the account type while a title is selected. A title picked from a list stays only if it is also in the new type's list; otherwise the field
 * is emptied (`reset`) so the old title is not left looking as if it were picked from the new list. A title written in as "Other" is not from a list, so
 * it stays.
 */
export function designationAfterAccountTypeChange(nextAccountType: unknown, state: DesignationState): { state: DesignationState; reset: boolean } {
  if (state.other || !state.value) return { state, reset: false };
  if (isKnownDesignation(nextAccountType, state.value)) return { state, reset: false };
  return { state: { value: '', other: false }, reset: true };
}

/** The title to save from a form's state, or why it cannot be. */
export function designationFromState(state: DesignationState, opts: { required?: boolean } = {}): { ok: true; value: string | null } | { ok: false; error: string } {
  if (state.other && !normalizeDesignation(state.value)) return { ok: false, error: 'Please enter the designation.' };
  return validateDesignation(state.value, opts);
}

export type DesignationClass = 'Standard' | 'Cross-category but valid' | 'Custom' | 'Missing designation' | 'Needs review';

/**
 * How a stored (account type, designation) pair reads, for the read-only audit. None of these is an error, and none is a reason to change a record:
 *  Standard                  the title is suggested for this account type
 *  Cross-category but valid  a standard title, from another list (Researcher + Associate Professor)
 *  Custom                    written in; not in any list
 *  Missing designation       none on record
 *  Needs review              no account type on record, or text that would not be accepted today (markup, too long)
 */
export function classifyDesignation(accountType: unknown, designation: unknown): DesignationClass {
  const v = normalizeDesignation(designation);
  if (!v) return 'Missing designation';
  const bad = validateDesignation(v);
  if (!bad.ok) return 'Needs review';
  if (!designationGroupOf(accountType)) return 'Needs review';
  if (isKnownDesignation(accountType, v)) return 'Standard';
  if (isStandardDesignation(v)) return 'Cross-category but valid';
  return 'Custom';
}

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

export type RoleSource = 'set' | 'account' | 'review';

/**
 * The account type to show for a person, and how it was settled:
 *  - account: the technical role is Institution, which can run the whole account → Institution Admin.
 *  - set: someone chose it.
 *  - review: none has been chosen. The account type is null and the screen says so.
 *
 * It is never read off the designation. A title of "Professor" does not make an account Faculty, and a Researcher whose title is Associate Professor is
 * a Researcher. (Before 2026-10-24 a title that settled a role was shown as that role, marked as such; that guess is gone from every screen. The
 * designation is still shown beside it, and `suggestedAccountType` gives a reviewer the old hint in a tooltip, never as a value.)
 */
export function effectiveAccessRole(u: { role?: string | null; memberRole?: string | null; designation?: string | null }):
  { role: AccessRole | null; source: RoleSource } {
  if (u.role === 'Institution') return { role: 'Institution Admin', source: 'account' };
  const set = accessRoleOf(u.memberRole);
  if (set) return { role: set, source: 'set' };
  return { role: null, source: 'review' };
}

/** For a tooltip on "Needs review" only: the account type a title usually goes with. Never shown as the account type and never saved. */
export function suggestedAccountType(designation: unknown): AccessRole | null {
  return roleFromDesignation(designation);
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
