/**
 * The "Designation / Role" lists on the public sign-up form, one set per ACCOUNT CONTEXT ("I am registering as").
 *
 * The designation is what the person is called in real life. It is a label: it never decides what an account may do. (The one place a
 * listed designation is read at sign-up, `opensInstitutionDashboard`, is the explicit list at the bottom of this file, kept exactly as it was
 * before these lists were reshaped, and a role written in under "Other" never counts.)
 *
 * Every list is here and nowhere else; src/constants.ts re-exports what the server and the form already import. The value stored is the label.
 * The institution's Add User / Edit User forms are a different thing (account types for people an institution adds) and live in memberRoles.ts.
 *
 * Existing records are not touched: a designation stored under an older list still displays, because nothing reads these lists back.
 */

/** The stored ids of the three contexts. "Institute" is what the Institution option has always been stored as. */
export type RegistrationContext = 'Institute' | 'Corporate' | 'Solo';

export type RoleGroup = { label: string; roles: string[] };
export type ContextRoles = { popular: string[]; groups: RoleGroup[] };

/** One internal id per role label, so "HOD" and "Head of Department (HOD)" cannot drift into two values: the label is the only spelling there is. */
export const roleId = (label: string): string =>
  label.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Institution: the person who represents, runs, evaluates or buys for the institution. No students, no independent work. ────────────────
const INSTITUTION: ContextRoles = {
  popular: ['Librarian', 'Principal', 'Dean', 'Head of Department (HOD)', 'Director', 'Faculty Representative', 'Research Coordinator', 'Procurement / Purchase Officer'],
  groups: [
    { label: 'Library', roles: ['Librarian', 'Chief Librarian', 'Head Librarian', 'Deputy Librarian', 'Assistant Librarian', 'Library Officer', 'Library Administrator', 'Information Scientist', 'Knowledge Resource Manager'] },
    { label: 'Academic leadership', roles: ['Principal', 'Vice Principal', 'Dean', 'Director', 'Registrar', 'Head of Department (HOD)', 'Academic Coordinator', 'Research Coordinator', 'IQAC Coordinator'] },
    { label: 'Faculty / academic representative', roles: ['Professor', 'Associate Professor', 'Assistant Professor', 'Faculty / Academic Professional', 'Faculty Representative'] },
    { label: 'Administration / procurement', roles: ['Administrator', 'Management Representative', 'Procurement / Purchase Officer', 'Purchase Manager', 'Accounts / Finance Representative', 'IT / Digital Library Coordinator'] },
  ],
};

// ── Corporate / Industry: business, research, technical and decision-making roles. ───────────────────────────────────────────────────────
const CORPORATE: ContextRoles = {
  popular: ['R&D Manager', 'Research Scientist', 'Research Associate', 'Department Head', 'Manager', 'Technical Lead / Manager', 'Product Manager', 'CEO / Managing Director'],
  groups: [
    { label: 'Leadership', roles: ['CEO / Managing Director', 'Managing Director', 'Director', 'Vice President (VP)', 'General Manager', 'Department Head'] },
    { label: 'Research & development', roles: ['R&D Head', 'R&D Manager', 'Research Manager', 'Research Scientist', 'Senior Research Scientist', 'Research Associate', 'Scientist', 'Senior Scientist', 'Principal Investigator'] },
    { label: 'Engineering / technical', roles: ['Engineer', 'Senior Engineer', 'Engineering Manager', 'Technical Lead', 'Technical Lead / Manager', 'Technical Manager'] },
    { label: 'Management', roles: ['Senior Manager', 'Manager', 'Product Manager', 'Project Manager', 'HR Manager', 'Accounts Manager', 'Training & Development Manager', 'Procurement / Purchase Manager'] },
    { label: 'Professional', roles: ['Working Professional', 'Industry Professional', 'Consultant'] },
  ],
};

// ── Solo Learner: one person on their own, so the broadest list: study, research, teaching, the library, work and leadership. ─────────────
const SOLO: ContextRoles = {
  popular: ['Undergraduate Student', "Master's Student", 'PhD Scholar', 'Researcher / Scientist', 'Independent Researcher', 'Faculty / Academic Professional', 'Working Professional', 'Librarian'],
  groups: [
    { label: 'Studying', roles: ['Undergraduate Student', "Master's Student", 'Postgraduate Student', 'PhD Scholar', 'Research Scholar', 'Doctoral Researcher', 'Postdoctoral Researcher', 'Intern'] },
    { label: 'Research & academia', roles: ['Researcher / Scientist', 'Independent Researcher', 'Research Scientist', 'Senior Research Scientist', 'Research Associate', 'Research Fellow', 'Principal Investigator (PI)', 'Research / Academic Coordinator', 'Faculty / Academic Professional'] },
    { label: 'Faculty', roles: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Faculty Member'] },
    { label: 'Library', roles: ['Librarian', 'Chief Librarian', 'Assistant Librarian', 'Library Professional'] },
    { label: 'Working professional', roles: ['Working Professional', 'Industry Professional', 'Consultant', 'Freelancer', 'Entrepreneur / Founder'] },
    { label: 'Leadership', roles: ['Principal', 'Vice Principal', 'Dean', 'Director', 'Head of Department (HOD)', 'CEO / Managing Director', 'Vice President (VP)', 'General Manager', 'Department Head'] },
    { label: 'Research & development', roles: ['R&D Head', 'R&D Manager', 'Research Manager'] },
    { label: 'Management / technical', roles: ['Senior Manager', 'Manager', 'Product Manager', 'Project Manager', 'Engineering Manager', 'Technical Lead / Manager', 'Training & Development Manager', 'Procurement / Purchase Manager'] },
  ],
};

export const SIGNUP_ROLE_CONFIG: Record<RegistrationContext, ContextRoles> = { Institute: INSTITUTION, Corporate: CORPORATE, Solo: SOLO };

/** The roles of a context, flat and each once. An unknown context has none. */
export const rolesFor = (context: string): string[] =>
  [...new Set((SIGNUP_ROLE_CONFIG[context as RegistrationContext]?.groups || []).flatMap(g => g.roles))];

/**
 * The listed designations that make a sign-up an Institution account (the librarian's view). This is the list the server has always acted on,
 * written out so that renaming or regrouping the lists above cannot change who gets it. Solo has none. Not extended for the new roles.
 */
export const INSTITUTION_ACCOUNT_ROLES: Record<string, string[]> = {
  Institute: ['Librarian', 'Principal', 'Vice Principal', 'Dean', 'Director', 'Head of Department (HOD)'],
  Corporate: ['CEO / Managing Director', 'Director', 'Vice President (VP)', 'General Manager', 'Department Head'],
};

/**
 * What the designation becomes when the person changes "I am registering as". It stays only if the new context also offers it; otherwise it
 * is cleared, so a role from another context is never left silently selected.
 */
export const designationAfterContextChange = (designation: string, newContext: string): string =>
  !designation || rolesFor(newContext).includes(designation) ? designation : '';

/** The roles of one context that match what was typed: every word must appear in the role or its group's name. Never looks outside the context. */
export function searchRoles(context: string, query: string): string[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  for (const g of SIGNUP_ROLE_CONFIG[context as RegistrationContext]?.groups || []) {
    for (const role of g.roles) {
      const hay = `${role} ${g.label}`.toLowerCase();
      if (words.every(w => hay.includes(w)) && !out.includes(role)) out.push(role);
    }
  }
  return out;
}
