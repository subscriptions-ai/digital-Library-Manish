/**
 * The sign-up "Designation / Role" lists per account context (src/lib/signupRoles.ts). No database, no server.
 *
 *   npx tsx scripts/test-signup-roles.ts
 */
import { SIGNUP_ROLE_CONFIG, rolesFor, roleId, designationAfterContextChange, searchRoles, INSTITUTION_ACCOUNT_ROLES } from '../src/lib/signupRoles';
import { DESIGNATIONS_BY_TYPE, DESIGNATION_GROUPS, POPULAR_DESIGNATIONS, opensInstitutionDashboard, REGISTRANT_TYPES } from '../src/constants';
import { validateDesignation } from '../src/lib/memberRoles';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d !== '' ? '  — ' + JSON.stringify(d).slice(0, 240) : ''}`); };
const has = (ctx: string, ...roles: string[]) => roles.every(r => rolesFor(ctx).includes(r));
const none = (ctx: string, ...roles: string[]) => roles.every(r => !rolesFor(ctx).includes(r));
const labels = (ctx: 'Institute' | 'Corporate' | 'Solo') => SIGNUP_ROLE_CONFIG[ctx].groups.map(g => g.label);

console.log('\nTests 1–2 — Institution');
check('popular roles are the institution ones', ['Librarian', 'Principal', 'Dean', 'Head of Department (HOD)', 'Director'].every(r => POPULAR_DESIGNATIONS.Institute.includes(r)), POPULAR_DESIGNATIONS.Institute);
check('no student, intern, independent, freelance or founder role anywhere in the list',
  none('Institute', 'Undergraduate Student', "Master's Student", 'PhD Scholar', 'Research Scholar', 'Intern', 'Independent Researcher', 'Freelancer', 'Entrepreneur / Founder', 'Postdoctoral Researcher'));
check('none of them among the popular roles either', !POPULAR_DESIGNATIONS.Institute.some(r => /student|scholar|intern|independent|freelanc|founder/i.test(r)));
check('the expanded groups are Library, Academic leadership, Faculty / academic representative, Administration / procurement',
  JSON.stringify(labels('Institute')) === JSON.stringify(['Library', 'Academic leadership', 'Faculty / academic representative', 'Administration / procurement']), labels('Institute'));
check('there is no Studying group', !labels('Institute').includes('Studying'));
check('the whole requested list is there', has('Institute', 'Chief Librarian', 'Head Librarian', 'Deputy Librarian', 'Assistant Librarian', 'Library Officer', 'Library Administrator', 'Information Scientist', 'Knowledge Resource Manager',
  'Vice Principal', 'Registrar', 'Academic Coordinator', 'Research Coordinator', 'IQAC Coordinator', 'Professor', 'Associate Professor', 'Assistant Professor', 'Faculty / Academic Professional', 'Faculty Representative',
  'Administrator', 'Management Representative', 'Procurement / Purchase Officer', 'Purchase Manager', 'Accounts / Finance Representative', 'IT / Digital Library Coordinator'));

console.log('\nTest 3 — Corporate / Industry');
check('popular roles are the corporate ones', ['R&D Manager', 'Research Scientist', 'Manager', 'Product Manager', 'CEO / Managing Director'].every(r => POPULAR_DESIGNATIONS.Corporate.includes(r)));
check('no student, librarian or professor role', none('Corporate', 'Undergraduate Student', "Master's Student", 'PhD Scholar', 'Librarian', 'Professor', 'Associate Professor', 'Assistant Professor'));
check('no Faculty, Library or Studying group', !labels('Corporate').some(l => /faculty|library|studying/i.test(l)), labels('Corporate'));
check('the whole requested list is there', has('Corporate', 'Managing Director', 'Vice President (VP)', 'General Manager', 'Department Head', 'R&D Head', 'Research Manager', 'Senior Research Scientist', 'Scientist', 'Senior Scientist', 'Principal Investigator',
  'Engineer', 'Senior Engineer', 'Engineering Manager', 'Technical Lead', 'Technical Lead / Manager', 'Technical Manager', 'Senior Manager', 'Project Manager', 'HR Manager', 'Accounts Manager', 'Training & Development Manager', 'Procurement / Purchase Manager',
  'Working Professional', 'Industry Professional', 'Consultant'));

console.log('\nTest 4 — Solo Learner is broad');
check('students, researchers, faculty, library, professionals, leadership, R&D and management are all there',
  has('Solo', 'Undergraduate Student', 'Postdoctoral Researcher', 'Intern', 'Independent Researcher', 'Principal Investigator (PI)', 'Professor', 'Lecturer', 'Librarian', 'Library Professional', 'Freelancer', 'Entrepreneur / Founder', 'Dean', 'Head of Department (HOD)', 'Vice President (VP)', 'R&D Head', 'Research Manager', 'Project Manager', 'Procurement / Purchase Manager'));
check('the groups are the eight requested', JSON.stringify(labels('Solo')) === JSON.stringify(['Studying', 'Research & academia', 'Faculty', 'Library', 'Working professional', 'Leadership', 'Research & development', 'Management / technical']), labels('Solo'));
check('popular roles are the solo ones', JSON.stringify(POPULAR_DESIGNATIONS.Solo) === JSON.stringify(['Undergraduate Student', "Master's Student", 'PhD Scholar', 'Researcher / Scientist', 'Independent Researcher', 'Faculty / Academic Professional', 'Working Professional', 'Librarian']));

console.log('\nPopular roles belong to their own context only');
for (const ctx of ['Institute', 'Corporate', 'Solo'] as const) check(`${ctx}: every popular role is in that context's list`, POPULAR_DESIGNATIONS[ctx].every(r => rolesFor(ctx).includes(r)), POPULAR_DESIGNATIONS[ctx].filter(r => !rolesFor(ctx).includes(r)));
check('constants expose the same lists the form and server read', ['Institute', 'Corporate', 'Solo'].every(c => JSON.stringify(DESIGNATIONS_BY_TYPE[c]) === JSON.stringify(rolesFor(c)) && DESIGNATION_GROUPS[c] === SIGNUP_ROLE_CONFIG[c as 'Solo'].groups));
check('the three contexts are the three registration options', REGISTRANT_TYPES.map(t => t.id).join() === 'Institute,Corporate,Solo');

console.log('\nOne spelling per role');
for (const ctx of ['Institute', 'Corporate', 'Solo'] as const) {
  const all = SIGNUP_ROLE_CONFIG[ctx].groups.flatMap(g => g.roles);
  check(`${ctx}: no role listed twice, no two roles share an id`, new Set(all).size === all.length && new Set(all.map(roleId)).size === all.length, all.filter((r, i) => all.indexOf(r) !== i));
}
check('only the full spelling of Head of Department exists', !SIGNUP_ROLE_CONFIG.Institute.groups.flatMap(g => g.roles).some(r => r === 'HOD' || r === 'Head of Department') && roleId('Head of Department (HOD)') === 'head-of-department-hod');

console.log('\nTests 5–6 — switching context');
check('Solo → PhD Scholar, then Institution: cleared', designationAfterContextChange('PhD Scholar', 'Institute') === '');
check('Institution → Librarian, then Corporate: cleared', designationAfterContextChange('Librarian', 'Corporate') === '');
check('Corporate → R&D Manager, then Institution: cleared', designationAfterContextChange('R&D Manager', 'Institute') === '');
check('Institution → Director, then Corporate: kept (Corporate offers it too)', designationAfterContextChange('Director', 'Corporate') === 'Director');
check('Institution → Dean, then Solo: kept', designationAfterContextChange('Dean', 'Solo') === 'Dean');
check('nothing chosen stays nothing', designationAfterContextChange('', 'Institute') === '');

console.log('\nSearch stays inside the context');
check('Institution: "student" finds nothing', searchRoles('Institute', 'student').length === 0, searchRoles('Institute', 'student'));
check('Institution: "librarian" finds the library roles', searchRoles('Institute', 'librarian').includes('Chief Librarian'));
check('Corporate: "professor" finds nothing', searchRoles('Corporate', 'professor').length === 0, searchRoles('Corporate', 'professor'));
check('Solo: "professor" finds all three', ['Professor', 'Associate Professor', 'Assistant Professor'].every(r => searchRoles('Solo', 'professor').includes(r)));
check('Solo: "student" finds the student roles', searchRoles('Solo', 'student').includes('Undergraduate Student'));
check('an empty or blank query finds nothing (the popular list shows instead)', searchRoles('Solo', '   ').length === 0);
check('an unknown context offers and finds nothing', rolesFor('Nope').length === 0 && searchRoles('Nope', 'a').length === 0);

console.log('\n"Other"');
check('"Other" is not a title: the form checks the written-in one', 'error' in (validateDesignation('Other', { required: true }) as any));
const custom = validateDesignation('  Controller of Examinations  ', { required: true }) as any;
check('a written-in title is trimmed and kept as written (not "Other")', custom.ok && custom.value === 'Controller of Examinations', custom);
check('over 100 characters is refused', 'error' in (validateDesignation('x'.repeat(101), { required: true }) as any));
check('markup is refused', 'error' in (validateDesignation('<b>Dean</b>', { required: true }) as any));

console.log('\nA designation grants nothing: the institution account is decided by an unchanged, explicit list');
const OLD_INSTITUTE = ['Librarian', 'Principal', 'Vice Principal', 'Dean', 'Director', 'Head of Department (HOD)'];
const OLD_CORPORATE = ['CEO / Managing Director', 'Director', 'Vice President (VP)', 'General Manager', 'Department Head'];
const contexts = ['Institute', 'Corporate', 'Solo'];
const everyRole = [...new Set(contexts.flatMap(rolesFor)), 'Other', 'Professor', 'HOD', 'Faculty Member', 'Undergraduate Student'];
const wrong: string[] = [];
for (const ctx of contexts) for (const r of everyRole) {
  const was = ctx === 'Institute' ? OLD_INSTITUTE.includes(r) : ctx === 'Corporate' ? OLD_CORPORATE.includes(r) : false;
  if (opensInstitutionDashboard(ctx, r) !== was) wrong.push(`${ctx}/${r}`);
}
check('for every context and every role, the result is exactly what it was before the lists changed', wrong.length === 0, wrong);
check('every role that opens it is still offered in its context', OLD_INSTITUTE.every(r => rolesFor('Institute').includes(r)) && OLD_CORPORATE.every(r => rolesFor('Corporate').includes(r)));
check('Professor, CEO and the new roles open nothing by themselves',
  !opensInstitutionDashboard('Institute', 'Professor') && !opensInstitutionDashboard('Solo', 'CEO / Managing Director') && !opensInstitutionDashboard('Institute', 'Chief Librarian') && !opensInstitutionDashboard('Corporate', 'Managing Director'));
check('the explicit list names only Institute and Corporate', Object.keys(INSTITUTION_ACCOUNT_ROLES).sort().join() === 'Corporate,Institute');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
