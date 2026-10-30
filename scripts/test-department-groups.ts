// Run: npx tsx scripts/test-department-groups.ts
// The Subject Groups only help people find departments. These checks pin that down: the groups
// cover the catalogue exactly, selection helpers behave, and the price is still a function of the
// number of departments alone.
import assert from 'node:assert/strict';
import { DOMAINS } from '../src/constants';
import { priceDepartments } from '../src/lib/institutionPricing';
import { QUOTE_DEPARTMENTS, docToRender, emptyDoc } from '../src/lib/quotation/quotationModel';
import { issuerOf } from '../src/config';
import {
  GROUPED_DEPARTMENTS, INSTITUTION_DEPARTMENT_GROUPS, OTHER_GROUP_ID, canonicalDepartment, canonicalDepartments,
  filterGroups, groupState, groupsFor, setDepartment, setGroup, summariseSelection,
} from '../src/lib/institutionDepartmentGroups';

const catalogue = DOMAINS.map((d) => d.name);
const eng = INSTITUTION_DEPARTMENT_GROUPS.find((g) => g.id === 'engineering-technology')!;
const med = INSTITUTION_DEPARTMENT_GROUPS.find((g) => g.id === 'medical-health-sciences')!;

// ── The groups cover the catalogue exactly: nothing missing, nothing invented, nothing twice. ──
assert.equal(catalogue.length, 33);
assert.deepEqual([...GROUPED_DEPARTMENTS].sort(), [...catalogue].sort());
assert.equal(new Set(GROUPED_DEPARTMENTS).size, GROUPED_DEPARTMENTS.length, 'a department is in two groups');
assert.deepEqual([...QUOTE_DEPARTMENTS].sort(), [...catalogue].sort(), 'quotation list drifted from the catalogue');
assert.equal(INSTITUTION_DEPARTMENT_GROUPS.length, 9);
assert.equal(eng.departments.length, 10);
assert.equal(med.departments.length, 10);
for (const n of ['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology']) assert(med.departments.includes(n), `${n} belongs in Medical & Health Sciences`);
assert.equal(groupsFor(catalogue).some((g) => g.id === OTHER_GROUP_ID), false, 'nothing should be unmapped');

// ── A department the groups do not know still shows, under "Other departments". ──
const withNew = groupsFor([...catalogue, 'Astronomy']);
assert.deepEqual(withNew[withNew.length - 1], { id: OTHER_GROUP_ID, name: 'Other departments', departments: ['Astronomy'] });
// …and a screen offering fewer departments shows only those, dropping empty groups.
assert.deepEqual(groupsFor(['Computer / IT', 'Nursing']).map((g) => g.id), ['engineering-technology', 'medical-health-sciences']);

// ── Older spellings read as the catalogue's name; nothing else is touched. ──
assert.equal(canonicalDepartment('Computer/IT'), 'Computer / IT');
assert.equal(canonicalDepartment('Civil/Construction Engineering'), 'Civil / Construction Engineering');
assert.equal(canonicalDepartment('Education & Social Sciences'), 'Education and Social Sciences');
assert.equal(canonicalDepartment('Pharmacy'), 'Pharmacy');
assert.deepEqual(canonicalDepartments(['Computer/IT', 'Computer / IT', 'Law']), ['Computer / IT', 'Law']);

// ── Select all / indeterminate / cross-group (spec cases A–E). ──
const priceOf = (sel: string[]) => priceDepartments(sel.length);
let sel: string[] = [];
sel = setDepartment(sel, 'Computer / IT', true);
assert.equal(priceOf(sel).rate, 9990);                                           // A
sel = setDepartment(sel, 'Mechanical Engineering', true);
assert.equal(priceOf(sel).rate, 9490);                                           // B
sel = setGroup([], eng.departments, true);
assert.equal(sel.length, 10);                                                    // C
assert.equal(groupState(eng.departments, sel), 'all');
assert.equal(priceOf(sel).rate, 7990);
sel = setDepartment(sel, 'Mechanical Engineering', false);                       // D
assert.equal(groupState(eng.departments, sel), 'some');
assert.equal(sel.length, 9);
assert.equal(priceOf(sel).quantity, 9);
assert.equal(groupState(eng.departments, []), 'none');
sel = [...eng.departments.slice(0, 3), ...med.departments.slice(0, 2)];          // E
assert.equal(sel.length, 5);
assert.equal(priceOf(sel).rate, 7990);
assert.equal(priceOf(sel).base, 5 * 7990);
// Ticking a group keeps what was picked elsewhere, and unticking only removes that group.
const mixed = setGroup(['Commerce', 'Nursing'], eng.departments, true);
assert.equal(mixed.length, 12);
assert.deepEqual(mixed.slice(0, 2), ['Commerce', 'Nursing']);
assert.deepEqual(setGroup(mixed, eng.departments, false), ['Commerce', 'Nursing']);
// Ticking a group when some are already chosen never doubles a department.
assert.equal(new Set(setGroup(['Energy'], eng.departments, true)).size, 10);
// The same department is never added twice.
assert.deepEqual(setDepartment(['Law'], 'Law', true), ['Law']);
// Held departments (not choosable) are left out of a group's state and of "Select all".
const choosable = eng.departments.filter((d) => d !== 'Energy');
assert.equal(groupState(choosable, choosable), 'all');
assert.equal(setGroup([], choosable, true).includes('Energy'), false);

// ── Search (spec case F): by department and by group; the selection is not touched by it. ──
const names = (q: string) => filterGroups(groupsFor(catalogue), q).map((r) => [r.group.id, r.visible]);
assert.deepEqual(names('mechanical'), [['engineering-technology', ['Mechanical Engineering']]]);
const med2 = filterGroups(groupsFor(catalogue), 'medical');
assert.deepEqual(med2.map((r) => r.group.id), ['medical-health-sciences']);
assert.equal(med2[0].visible.length, 10);                      // the group's name matched: all of it
assert.equal(med2[0].complete, true);
assert.deepEqual(names('radiology'), [['medical-health-sciences', ['Radiology']]]);
assert.deepEqual(names('optometry'), [['medical-health-sciences', ['Optometry & Ophthalmology']]]);
const comp = filterGroups(groupsFor(catalogue), 'computer');
assert.deepEqual(comp.map((r) => [r.group.name, r.visible, r.complete]), [['Engineering & Technology', ['Computer / IT'], false]]);
assert.equal(filterGroups(groupsFor(catalogue), 'zzzz').length, 0);
assert.equal(filterGroups(groupsFor(catalogue), '').length, 9);

// ── The summary groups the chosen departments and keeps their real names (spec H, 12). ──
const sum = summariseSelection(groupsFor(catalogue), ['Pharmacy', 'Computer / IT', 'Commerce', 'Medical Sciences', 'Mechanical Engineering']);
assert.deepEqual(sum.map((s) => [s.group.name, s.picked]), [
  ['Engineering & Technology', ['Computer / IT', 'Mechanical Engineering']],
  ['Medical & Health Sciences', ['Medical Sciences', 'Pharmacy']],
  ['Business & Management', ['Commerce']],
]);

// ── The quotation still lists the actual departments, in the order chosen — never a group name. ──
const chosen = ['Computer / IT', 'Mechanical Engineering', 'Medical Sciences', 'Pharmacy', 'Commerce'];
const rendered = docToRender({ ...emptyDoc('ITB/SDL/26-27/999'), departments: chosen, state: 'Delhi', totalUsers: 5 }, issuerOf(null));
assert.deepEqual(rendered.departments, chosen);

// ── The price is by count alone: any 5 departments cost the same, whichever groups they sit in. ──
assert.deepEqual(priceDepartments(5), priceOf(eng.departments.slice(0, 5)));
assert.deepEqual(priceDepartments(5), priceOf(['Law', 'Arts', 'Commerce', 'Nursing', 'Energy']));
for (const [n, rate] of [[1, 9990], [2, 9490], [3, 8990], [4, 8490], [5, 7990], [12, 7990]] as const) assert.equal(priceDepartments(n).rate, rate);

console.log('department groups: all checks pass');
