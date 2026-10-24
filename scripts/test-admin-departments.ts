/** The wording rules of the Admin → Users "Departments" block (src/lib/accountDepartments.ts). Pure; no database.  npx tsx scripts/test-admin-departments.ts */
import { departmentView, type DepartmentInspection } from '../src/lib/accountDepartments.js';
import { selectedDepartments } from '../src/server/entitlements.js';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok ? '  — ' + JSON.stringify(d) : ''}`); };
const FOUR = ['Applied Mechanics', 'Civil / Construction Engineering', 'Computer / IT', 'Electrical Engineering'];
const base: DepartmentInspection = { selectedDepartments: FOUR, effectiveDepartments: FOUR, departmentSource: 'registration', isInstitutionMember: false, institutionName: null, recordedSelection: 4 };
const V = (o: Partial<DepartmentInspection>) => departmentView({ ...base, ...o });

console.log('\nTest 1 — institution owner, 4 selected');
{ const v = V({ departmentSource: 'institution' });
  check('exactly the 4 names, in order', JSON.stringify(v.selected?.names) === JSON.stringify(FOUR));
  check('identical to effective → one block only', v.access === null); }

console.log('\nTest 2 — one department');
{ const v = V({ selectedDepartments: [FOUR[2]], effectiveDepartments: [FOUR[2]] });
  check('one chip', v.selected?.names.length === 1 && v.selected.names[0] === FOUR[2]); }

console.log('\nTest 3 — legacy account, nothing recorded');
{ const v = V({ selectedDepartments: [], effectiveDepartments: [], departmentSource: 'none', recordedSelection: 0 });
  check('no names, flagged legacy, never all', v.selected?.names.length === 0 && v.selected.legacy && (!v.access || (!v.access.all && v.access.names.length === 0)), v);
  const odd = V({ selectedDepartments: [], effectiveDepartments: [], departmentSource: 'none', recordedSelection: 2 });
  check('names that match no department are not called "not recorded" legacy', odd.selected?.legacy === false); }

console.log('\nTest 4 — institution member inherits 4');
{ const v = V({ selectedDepartments: [], isInstitutionMember: true, institutionName: 'STM journals', departmentSource: 'institution' });
  check('labelled Access departments, inherited from the institution', v.access?.label === 'Access departments' && v.access.inheritedFrom === 'STM journals' && v.access.names.length === 4);
  check('no "selected" block for something they did not select', v.selected === null);
  const own = V({ selectedDepartments: ['Law'], isInstitutionMember: true, institutionName: 'X', departmentSource: 'institution' });
  check('a member’s own sign-up pick is shown apart from the inherited access', own.selected?.names[0] === 'Law' && own.access?.inheritedFrom === 'X'); }

console.log('\nTest 5 — explicit All Domains plan');
{ const v = V({ effectiveDepartments: 'ALL_DEPARTMENTS', effectiveAll: true, departmentSource: 'all-domains-plan' });
  check('effective is All departments', v.access?.all === true);
  check('the selection is still shown separately', v.selected?.names.length === 4);
  const none = V({ selectedDepartments: [], effectiveDepartments: 'ALL_DEPARTMENTS', effectiveAll: true, departmentSource: 'all-domains-plan', recordedSelection: 0 });
  check('all-domains with no selection does not invent one', none.selected?.names.length === 0); }

console.log('\nSelected vs effective differ');
{ const v = V({ effectiveDepartments: ['Law', 'Nursing'], departmentSource: 'subscription' });
  check('both are shown, not merged', v.selected?.names.length === 4 && v.access?.names.length === 2 && v.access.label === 'Effective access'); }

console.log('\nTest 6 — aliases');
{ const c = selectedDepartments(['Biotechnology', 'Bio Technology', 'Computer / IT', 'Nonsense dept']);
  check('aliases fold to one canonical name; unknown names dropped', c.length === 2 && c.includes('Bio Technology') && c.includes('Computer / IT'), c); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
