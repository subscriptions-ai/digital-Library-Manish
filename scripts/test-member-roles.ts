/**
 * Role and designation are two things: the mapping, the import rules and what the Admin table is shown. No database.
 *
 *   npx tsx scripts/test-member-roles.ts
 */
import assert from 'node:assert/strict';
import {
  ACCESS_ROLES, ASSIGNABLE_MEMBER_ROLES, roleFromDesignation, effectiveAccessRole, resolveImportRole, assignableRole, cleanDesignation,
} from '../src/lib/memberRoles';

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log('PASS ', name); } catch (e: any) { failed++; console.log('FAIL ', name, '\n      ', e.message.split('\n')[0]); }
};

console.log('— Designation → role (only where it is not in doubt) —');
for (const [d, r] of [
  ['Professor', 'Faculty'], ['Associate Professor', 'Faculty'], ['Assistant Professor', 'Faculty'], ['Lecturer', 'Faculty'],
  ['Senior Lecturer', 'Faculty'], ['Faculty', 'Faculty'], ['asst. professor', 'Faculty'], ['  PROFESSOR ', 'Faculty'],
  ['Librarian', 'Librarian'], ['Student', 'Student'],
  ['Research Scholar', 'Researcher'], ['Research Associate', 'Researcher'], ['Research Fellow', 'Researcher'],
] as const) check(`${d} → ${r}`, () => assert.equal(roleFromDesignation(d), r));
for (const d of ['HOD / Dean', 'Dean', 'Head of Department', 'Teacher', 'Manager', '1st Year', 'Final Year', '', null, undefined, 'Professor of Practice emeritus'])
  check(`${JSON.stringify(d)} → no role (asked about, not guessed)`, () => assert.equal(roleFromDesignation(d), null));

console.log('\n— Student is still a role, and Professor is not Student —');
check('Student is an access role', () => assert.ok((ACCESS_ROLES as readonly string[]).includes('Student')));
check('Student is assignable', () => assert.equal(assignableRole('student'), 'Student'));
check('Professor is not a role', () => assert.equal(assignableRole('Professor'), null));
check('Librarian and Institution Admin cannot be assigned from the add screen', () => {
  assert.equal(assignableRole('Librarian'), null); assert.equal(assignableRole('Institution Admin'), null);
});
check('a Professor member is displayed as Faculty, never Student', () =>
  assert.deepEqual(effectiveAccessRole({ role: 'Student', designation: 'Professor' }), { role: 'Faculty', source: 'designation' }));
check('Associate Professor member → Faculty', () => assert.equal(effectiveAccessRole({ role: 'Student', designation: 'Associate Professor' }).role, 'Faculty'));

console.log('\n— What the table shows —');
check('a saved role wins over the designation', () =>
  assert.deepEqual(effectiveAccessRole({ role: 'Student', memberRole: 'Researcher', designation: 'Professor' }), { role: 'Researcher', source: 'set' }));
check('the institution account is Institution Admin, whatever its title', () =>
  assert.deepEqual(effectiveAccessRole({ role: 'Institution', designation: 'Librarian' }), { role: 'Institution Admin', source: 'account' }));
check('a saved memberRole cannot demote the institution account', () =>
  assert.equal(effectiveAccessRole({ role: 'Institution', memberRole: 'Student' }).role, 'Institution Admin'));
check('a member titled Librarian is a Librarian', () => assert.equal(effectiveAccessRole({ role: 'Student', designation: 'Librarian' }).role, 'Librarian'));
check('no role and a title that settles nothing → needs review, not Student', () =>
  assert.deepEqual(effectiveAccessRole({ role: 'Student', designation: '2nd Year' }), { role: null, source: 'review' }));
check('no role and no title → needs review', () => assert.deepEqual(effectiveAccessRole({ role: 'Student' }), { role: null, source: 'review' }));
check('an unknown saved memberRole is ignored, not trusted', () =>
  assert.equal(effectiveAccessRole({ role: 'Student', memberRole: 'Godmode', designation: 'Professor' }).role, 'Faculty'));

console.log('\n— Bulk import —');
check('a Role column is used', () => assert.deepEqual(resolveImportRole({ role: 'Researcher', designation: 'Professor' }), { role: 'Researcher' }));
check('the Role column is read in any case', () => assert.deepEqual(resolveImportRole({ role: 'faculty' }), { role: 'Faculty' }));
check('an invalid Role is refused, whatever the designation says', () => assert.ok('error' in resolveImportRole({ role: 'Professor', designation: 'Professor' })));
check('no Role, designation Professor → Faculty', () => assert.deepEqual(resolveImportRole({ designation: 'Professor' }), { role: 'Faculty' }));
check('no Role, designation Research Fellow → Researcher', () => assert.deepEqual(resolveImportRole({ designation: 'Research Fellow' }), { role: 'Researcher' }));
check('no Role, designation Student → Student', () => assert.deepEqual(resolveImportRole({ designation: 'Student' }), { role: 'Student' }));
check('no Role, ambiguous designation → refused for correction', () => {
  const r = resolveImportRole({ designation: 'HOD / Dean' }); assert.ok('error' in r && /does not settle a role/.test(r.error));
});
check('no Role, no designation → refused, never Student', () => {
  const r = resolveImportRole({}); assert.ok('error' in r && /Role is missing/.test(r.error));
});
check('a Librarian designation cannot create a second administrator', () => assert.ok('error' in resolveImportRole({ designation: 'Librarian' })));

console.log('\n— Designation text —');
check('trimmed and bounded', () => assert.equal(cleanDesignation('  Associate   Professor '), 'Associate Professor'));
check('empty is null', () => assert.equal(cleanDesignation('   '), null));
check('free text is kept', () => assert.equal(cleanDesignation('Dean of Studies'), 'Dean of Studies'));
check('assignable list is exactly Faculty, Researcher, Student', () => assert.deepEqual([...ASSIGNABLE_MEMBER_ROLES], ['Faculty', 'Researcher', 'Student']));

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
