/**
 * Account type and professional designation: the central lists and rules (src/lib/memberRoles.ts). No database, no server.
 *
 *   npx tsx scripts/test-designations.ts
 *
 * The server routes and the real forms are covered by test-designation-api.ts.
 */
import assert from 'node:assert/strict';
import {
  DESIGNATIONS_BY_ROLE, OTHER_DESIGNATION, MAX_DESIGNATION_LENGTH, ALL_SUGGESTED_DESIGNATIONS, designationGroupOf, getSuggestedDesignations,
  normalizeDesignation, isKnownDesignation, isStandardDesignation, validateDesignation, designationStateFor, designationAfterAccountTypeChange,
  designationFromState, classifyDesignation, effectiveAccessRole, suggestedAccountType,
} from '../src/lib/memberRoles';

let failed = 0, passed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log('PASS ', name); } catch (e: any) { failed++; console.log('FAIL ', name, '\n      ', String(e.message).split('\n')[0]); }
};

console.log('— The lists —');
check('Faculty suggests faculty titles, ending in Other', () => {
  const l = getSuggestedDesignations('Faculty');
  for (const t of ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Senior Lecturer', 'HOD / Head of Department', 'Dean', 'Principal', 'Visiting Faculty', 'Adjunct Faculty']) assert.ok(l.includes(t), t);
  assert.equal(l[l.length - 1], OTHER_DESIGNATION);
});
check('Researcher suggests research titles, ending in Other', () => {
  const l = getSuggestedDesignations('Researcher');
  for (const t of ['Researcher', 'Senior Researcher', 'Research Scientist', 'Senior Research Scientist', 'Research Associate', 'Research Fellow', 'Senior Research Fellow', 'Junior Research Fellow', 'Postdoctoral Fellow', 'Postdoctoral Researcher', 'Project Scientist', 'Scientist', 'Principal Investigator', 'Research Officer']) assert.ok(l.includes(t), t);
  assert.equal(l[l.length - 1], OTHER_DESIGNATION);
});
check('Student suggests student titles, ending in Other', () => {
  const l = getSuggestedDesignations('Student');
  for (const t of ['Undergraduate Student', 'Postgraduate Student', "Master's Student", 'PhD Scholar', 'Doctoral Researcher', 'Research Scholar', 'Intern']) assert.ok(l.includes(t), t);
  assert.equal(l[l.length - 1], OTHER_DESIGNATION);
});
check('Librarian and Institution Admin suggest the library roles', () => {
  for (const r of ['Librarian', 'Institution Admin']) { const l = getSuggestedDesignations(r); assert.ok(l.includes('Chief Librarian') && l.includes('Information Scientist') && l.includes('Library Administrator')); assert.equal(l[l.length - 1], OTHER_DESIGNATION); }
});
check('Corporate suggests industry titles', () => { const l = getSuggestedDesignations('Corporate'); assert.ok(l.includes('R&D Manager') && l.includes('Product Manager') && l.includes('Senior Engineer')); assert.equal(l[l.length - 1], OTHER_DESIGNATION); });
check('every list has Other, once, last', () => { for (const [g, l] of Object.entries(DESIGNATIONS_BY_ROLE)) { assert.equal(l.filter(x => x === OTHER_DESIGNATION).length, 1, g); assert.equal(l[l.length - 1], OTHER_DESIGNATION, g); } });
check('no list repeats a title', () => { for (const [g, l] of Object.entries(DESIGNATIONS_BY_ROLE)) assert.equal(new Set(l.map(x => x.toLowerCase())).size, l.length, g); });
check('an unknown or missing account type is offered every title, so nothing is hidden', () => {
  for (const r of ['', null, undefined, 'Godmode']) { const l = getSuggestedDesignations(r); assert.ok(l.includes('Professor') && l.includes('Research Scientist') && l.includes('Intern') && l.includes('Librarian')); assert.equal(l[l.length - 1], OTHER_DESIGNATION); }
  assert.equal(new Set(ALL_SUGGESTED_DESIGNATIONS).size, ALL_SUGGESTED_DESIGNATIONS.length);
});
check('the lists follow the account type (and are not the same list)', () => {
  assert.ok(!getSuggestedDesignations('Student').includes('Professor'));
  assert.ok(!getSuggestedDesignations('Faculty').includes('Intern'));
  assert.equal(designationGroupOf('faculty'), 'Faculty'); assert.equal(designationGroupOf('Institution Admin'), 'Institution'); assert.equal(designationGroupOf('Librarian'), 'Institution');
});
check('titles that were already offered are all still there (none was deleted)', () => {
  for (const t of ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Research Scholar', 'Research Associate', 'Research Fellow'])
    assert.ok(ALL_SUGGESTED_DESIGNATIONS.includes(t), t);
});

console.log('\n— Searching and matching —');
check('"research" finds the research titles (the picker filters by every word, any case)', () => {
  const words = 'research'.split(' ');
  const hits = getSuggestedDesignations('Researcher').filter(o => o !== OTHER_DESIGNATION && words.every(w => o.toLowerCase().includes(w)));
  for (const t of ['Researcher', 'Senior Researcher', 'Research Scientist', 'Research Associate', 'Research Fellow']) assert.ok(hits.includes(t), t);
});
check('isKnownDesignation is case- and spacing-insensitive, and Other is never a title', () => {
  assert.ok(isKnownDesignation('Faculty', '  associate   PROFESSOR '));
  assert.ok(!isKnownDesignation('Faculty', 'Other')); assert.ok(!isKnownDesignation('Faculty', ''));
  assert.ok(!isKnownDesignation('Student', 'Professor'));
  assert.ok(isStandardDesignation('Professor') && !isStandardDesignation('Clinical Research Coordinator'));
});
check('a title can be in two lists (Scientist)', () => assert.ok(isKnownDesignation('Researcher', 'Scientist') && isKnownDesignation('Corporate', 'Scientist')));

console.log('\n— What may be stored —');
check('whitespace is squeezed and trimmed', () => assert.equal(normalizeDesignation('  Clinical   Research  Coordinator '), 'Clinical Research Coordinator'));
check('a normal title is accepted as written', () => assert.deepEqual(validateDesignation('Clinical Research Coordinator'), { ok: true, value: 'Clinical Research Coordinator' }));
check('real titles with punctuation are accepted', () => { for (const t of ["Master's Student", 'R&D Manager', 'HOD / Head of Department', 'Professor (Adjunct)', 'Reader – Education', 'Sr. Scientist, Grade-II']) assert.deepEqual(validateDesignation(t), { ok: true, value: t }, t); });
check('blank: not required → null; required → refused', () => {
  assert.deepEqual(validateDesignation('   '), { ok: true, value: null });
  assert.deepEqual(validateDesignation(undefined), { ok: true, value: null });
  assert.ok('error' in validateDesignation('  ', { required: true }));
});
check(`longer than ${MAX_DESIGNATION_LENGTH} characters is refused, exactly ${MAX_DESIGNATION_LENGTH} is fine`, () => {
  assert.ok('error' in validateDesignation('x'.repeat(MAX_DESIGNATION_LENGTH + 1)));
  assert.ok(!('error' in validateDesignation('x'.repeat(MAX_DESIGNATION_LENGTH))));
});
check('markup and script are refused', () => {
  for (const t of ['<script>alert(1)</script>', 'Professor<img src=x onerror=alert(1)>', '<b>Dean</b>', 'javascript:alert(1)', 'Dean onclick=alert(1)', '<', 'a > b', 'Professor\u0000', 'Dean\u0007'])
    assert.ok('error' in validateDesignation(t), JSON.stringify(t));
});
check('a non-text value is refused', () => { for (const v of [42, {}, ['Professor'], true]) assert.ok('error' in validateDesignation(v as any), JSON.stringify(v)); });
check('the literal word "Other" is never stored as a title', () => { for (const t of ['Other', 'other', ' OTHER ']) assert.ok('error' in validateDesignation(t), t); });
check('a title is NOT checked against the lists: Researcher + Associate Professor is acceptable', () => {
  assert.deepEqual(validateDesignation('Associate Professor'), { ok: true, value: 'Associate Professor' });
  assert.deepEqual(validateDesignation('Intern'), { ok: true, value: 'Intern' });
});

console.log('\n— The form —');
check('a title in the account type\'s list loads as a selection', () => assert.deepEqual(designationStateFor('Faculty', 'Associate Professor'), { value: 'Associate Professor', other: false }));
check('a legacy Researcher + Associate Professor loads as the title itself, not erased and not "Other"', () =>
  assert.deepEqual(designationStateFor('Researcher', 'Associate Professor'), { value: 'Associate Professor', other: false }));
check('a written-in title loads under Other with the title in the box', () =>
  assert.deepEqual(designationStateFor('Researcher', 'Clinical Research Coordinator'), { value: 'Clinical Research Coordinator', other: true }));
check('a stored title in a different case is shown in its listed spelling', () => assert.equal(designationStateFor('Faculty', 'associate professor').value, 'Associate Professor'));
check('nothing stored → an empty selection', () => assert.deepEqual(designationStateFor('Faculty', null), { value: '', other: false }));
check('a stored title is never lost on load, whatever it is', () => { for (const t of ['Professor', 'Intern', 'Dean of Studies, Eastern Campus', 'Reader']) { const s = designationStateFor('Student', t); assert.equal(s.value.toLowerCase(), t.toLowerCase()); } });

check('Faculty + Associate Professor → Researcher: the title is cleared', () => {
  const r = designationAfterAccountTypeChange('Researcher', { value: 'Associate Professor', other: false });
  assert.deepEqual(r, { state: { value: '', other: false }, reset: true });
});
check('…unless the title is in both lists (Scientist: Researcher → Corporate)', () => {
  const r = designationAfterAccountTypeChange('Corporate', { value: 'Scientist', other: false });
  assert.deepEqual(r, { state: { value: 'Scientist', other: false }, reset: false });
});
check('a title written in under Other is not from a list, so it stays', () => {
  const r = designationAfterAccountTypeChange('Student', { value: 'Clinical Research Coordinator', other: true });
  assert.deepEqual(r, { state: { value: 'Clinical Research Coordinator', other: true }, reset: false });
});
check('an empty field stays empty and says nothing', () => assert.deepEqual(designationAfterAccountTypeChange('Student', { value: '', other: false }), { state: { value: '', other: false }, reset: false }));
check('Other with nothing typed cannot be saved; with a title it saves the title, not "Other"', () => {
  assert.ok('error' in designationFromState({ value: '', other: true }, { required: true }));
  assert.ok('error' in designationFromState({ value: '   ', other: true }));
  assert.deepEqual(designationFromState({ value: ' Clinical Research Coordinator ', other: true }, { required: true }), { ok: true, value: 'Clinical Research Coordinator' });
});
check('a required designation that is empty is refused; an optional one is null', () => {
  assert.ok('error' in designationFromState({ value: '', other: false }, { required: true }));
  assert.deepEqual(designationFromState({ value: '', other: false }), { ok: true, value: null });
});

console.log('\n— Account type is not read off the title —');
check('Professor with no account type is not Faculty', () => assert.deepEqual(effectiveAccessRole({ role: 'Student', designation: 'Professor' }), { role: null, source: 'review' }));
check('a saved account type wins, whatever the title', () => assert.deepEqual(effectiveAccessRole({ role: 'Student', memberRole: 'Researcher', designation: 'Associate Professor' }), { role: 'Researcher', source: 'set' }));
check('the title can only be a hint for a reviewer, never the value', () => { assert.equal(suggestedAccountType('Professor'), 'Faculty'); assert.equal(effectiveAccessRole({ role: 'Student', designation: 'Professor' }).role, null); });

console.log('\n— The audit\'s classes —');
for (const [type, d, cls] of [
  ['Faculty', 'Associate Professor', 'Standard'], ['Researcher', 'Research Scientist', 'Standard'], ['Student', 'PhD Scholar', 'Standard'],
  ['Researcher', 'Associate Professor', 'Cross-category but valid'], ['Faculty', 'Research Fellow', 'Cross-category but valid'],
  ['Researcher', 'Clinical Research Coordinator', 'Custom'], ['Faculty', 'Reader', 'Custom'],
  ['Faculty', '', 'Missing designation'], ['Faculty', null, 'Missing designation'],
  ['', 'Professor', 'Needs review'], [null, 'Reader', 'Needs review'],
  ['Faculty', '<b>Dean</b>', 'Needs review'], ['Faculty', 'x'.repeat(150), 'Needs review'],
] as const) check(`${type || '(none)'} + ${JSON.stringify(d).slice(0, 40)} → ${cls}`, () => assert.equal(classifyDesignation(type, d), cls));

console.log(`\n${failed ? `${failed} failed, ${passed} passed` : `All passed (${passed})`}`);
process.exit(failed ? 1 : 0);
