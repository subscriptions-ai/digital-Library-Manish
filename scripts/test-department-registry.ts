// Run: npx tsx scripts/test-department-registry.ts
// The canonical department registry: it equals the public taxonomy, it resolves spellings it has been told
// about, and it never guesses.
import assert from 'node:assert/strict';
import { DOMAINS } from '../src/constants';
import { GROUPED_DEPARTMENTS } from '../src/lib/institutionDepartmentGroups';
import {
  AUTO_INGEST_NAMES, CANONICAL_DEPARTMENTS, CANONICAL_NAMES, isAutoIngested, canonicalDepartmentName, canonicalOrSelf, departmentFromSlug, departmentKey,
  entitlementCovers, foldCounts, resolveCanonicalDepartment, resolvedNames, spellingsOf, spellingsOfAll,
} from '../src/lib/departmentRegistry';

// ── The registry is the taxonomy: same names, same ids, official names untouched. ──
assert.deepEqual(CANONICAL_DEPARTMENTS.map((d) => [d.id, d.name]).sort(), DOMAINS.map((d) => [d.id, d.name]).sort());
assert.equal(CANONICAL_NAMES.length, 33);

// ── The four departments added 2026-10-30: official names and ids, a few explicit aliases, and no guessing. ──
const ADDED = ['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology'];
for (const name of ADDED) { assert(CANONICAL_NAMES.includes(name), `${name} is missing`); assert.equal(resolveCanonicalDepartment(name).changed, false); }
assert.deepEqual(['paramedical-sciences', 'radiology', 'medical-laboratory-technology', 'optometry-ophthalmology'].map((id) => departmentFromSlug(id)?.name), ADDED);
assert.equal(canonicalDepartmentName('optometry and ophthalmology'), 'Optometry & Ophthalmology');    // "&" and "and" are not a difference
assert.equal(canonicalDepartmentName('Paramedical'), 'Paramedical Sciences');
assert.equal(canonicalDepartmentName('Medical Lab Technology'), 'Medical Laboratory Technology');
for (const v of ['Optometry', 'Ophthalmology', 'Paramedics', 'Radiography', 'Laboratory', 'MLT', 'Medical Lab']) assert.equal(canonicalDepartmentName(v), null, `${v} must not be guessed`);
// The ingestion engines leave exactly these four alone; every other department keeps taking part.
assert.deepEqual(CANONICAL_NAMES.filter((n) => !isAutoIngested(n)).sort(), [...ADDED].sort());
assert.equal(AUTO_INGEST_NAMES.length, 29);
assert(!AUTO_INGEST_NAMES.some((n) => ADDED.includes(n)));
assert.deepEqual([...GROUPED_DEPARTMENTS].sort(), [...CANONICAL_NAMES].sort(), 'Subject Groups must use the registry names');
// No alias is also an official name or another department's alias (the module would throw on load), and none is empty.
for (const d of CANONICAL_DEPARTMENTS) for (const a of d.aliases) { assert(a.trim()); assert.equal(resolveCanonicalDepartment(a).name, d.name); }

// ── A. / B. The spec's spellings. ──
assert.equal(resolveCanonicalDepartment(' Medical sciences ').name, 'Medical Sciences');       // A
assert.equal(resolveCanonicalDepartment('Physiotheraphy').name, 'Physiotherapy');              // B
assert.equal(resolveCanonicalDepartment('Physio Therapy').name, 'Physiotherapy');
assert.equal(resolveCanonicalDepartment('Medical').name, 'Medical Sciences');
assert.equal(resolveCanonicalDepartment('Biotechnology').name, 'Bio Technology');              // the official name is kept
assert.equal(resolveCanonicalDepartment('Bio Technology').name, 'Bio Technology');
assert.equal(resolveCanonicalDepartment('BIO TECHNOLOGY').status, 'canonical');
assert.equal(resolveCanonicalDepartment('BIO TECHNOLOGY').changed, true);
assert.equal(resolveCanonicalDepartment('Bio Technology').changed, false);
assert.equal(resolveCanonicalDepartment('Biotechnology').status, 'alias');

// ── The spellings the old quotation list and the AI classifier used. ──
assert.equal(canonicalDepartmentName('Computer/IT'), 'Computer / IT');
assert.equal(canonicalDepartmentName('Civil/Construction Engineering'), 'Civil / Construction Engineering');
assert.equal(canonicalDepartmentName('Civil/Construction'), 'Civil / Construction Engineering');
assert.equal(canonicalDepartmentName('Education & Social Sciences'), 'Education and Social Sciences');
assert.equal(canonicalDepartmentName('Electronics & Telecom'), 'Electronics & Telecommunication Engineering');
assert.equal(canonicalDepartmentName('electronics and telecommunication engineering'), 'Electronics & Telecommunication Engineering');

// ── C. Nothing is guessed. ──
for (const v of ['unknown random subject', 'Engineering', 'Social Sciences', 'Medicine', 'Physio', 'Computer', '', '   ', 'College Excellence']) {
  const r = resolveCanonicalDepartment(v);
  assert.equal(r.status, 'unresolved', v); assert.equal(r.name, null, v);
}
assert.equal(resolveCanonicalDepartment(null).status, 'unresolved');
assert.equal(resolveCanonicalDepartment(42 as any).status, 'unresolved');
assert.equal(canonicalOrSelf('Engineering'), 'Engineering');   // old records with an unknown value display as stored
assert.deepEqual(resolvedNames(['medical', 'Engineering', 'Medical Sciences']), ['Medical Sciences']);

// ── E. Filtering by the official name reaches records stored under any known or observed spelling. ──
assert.deepEqual(spellingsOf('Physiotherapy').sort(), ['Physio Therapy', 'Physiotheraphy', 'Physiotherapy']);
const observed = ['Medical sciences', 'MEDICAL SCIENCES', 'Medical', 'Engineering', 'Pharmacy'];
assert.deepEqual(spellingsOf('Medical Sciences', observed).sort(), ['MEDICAL SCIENCES', 'Medical', 'Medical Sciences', 'Medical sciences']);
assert.deepEqual(spellingsOf('medical', observed).sort(), ['MEDICAL SCIENCES', 'Medical', 'Medical Sciences', 'Medical sciences']);
assert.equal(spellingsOf('Medical Sciences', observed).includes('Engineering'), false);
assert.deepEqual(spellingsOf('Engineering', observed), ['Engineering']);   // unknown asks for itself only
assert.equal(spellingsOfAll(['Medical Sciences', 'Pharmacy'], observed).includes('Pharmacy'), true);

// ── F. Entitlements: an old spelling still grants the department, both ways. ──
assert.equal(entitlementCovers(['Medical sciences'], 'Medical Sciences'), true);
assert.equal(entitlementCovers(['Medical Sciences'], 'Medical sciences'), true);
assert.equal(entitlementCovers(['Medical Sciences'], 'Nursing'), false);
assert.equal(entitlementCovers(['Medical Sciences'], null), false);
assert.equal(entitlementCovers(['Engineering'], 'Engineering'), true);        // unknown values still match themselves
assert.equal(entitlementCovers(['Engineering'], 'Medical Sciences'), false);

// ── Counts: spellings fold into one line and are added once; unknown values keep their own line. ──
const folded = foldCounts([
  { name: 'Medical Sciences', count: 3523 }, { name: 'Medical sciences', count: 10 }, { name: 'Medical', count: 2 },
  { name: 'Engineering', count: 131 }, { name: null, count: 5 },
]);
assert.deepEqual(folded.map((f) => [f.name, f.count]), [['Medical Sciences', 3535], ['Engineering', 131]]);
assert.deepEqual(folded[0].spellings, ['Medical Sciences', 'Medical sciences', 'Medical']);

// ── URLs: the public id, the library slug and an alias's slug all reach the one department. ──
assert.equal(departmentFromSlug('civil-construction')?.name, 'Civil / Construction Engineering');
assert.equal(departmentFromSlug('civil-construction-engineering')?.name, 'Civil / Construction Engineering');
assert.equal(departmentFromSlug('biotechnology')?.name, 'Bio Technology');
assert.equal(departmentFromSlug('physiotheraphy')?.name, 'Physiotherapy');
assert.equal(departmentFromSlug('bio-technology')?.name, 'Bio Technology');
assert.equal(departmentFromSlug('engineering'), null);

assert.equal(departmentKey('  Computer / IT '), departmentKey('computer/it'));
console.log('department registry: all checks pass');

// ── Server pieces, with no database: the spellings cache and the input guard. ──
import { createDepartmentSpellings } from '../src/server/departmentSpellings';
import { normaliseBodyDepartments, requireOfficialDepartments, requireOfficialDepartmentsOnEdit } from '../src/server/departmentInput';
(async () => {
  let reads = 0;
  const fake = { $queryRawUnsafe: async () => { reads++; return [{ v: 'Medical sciences' }, { v: 'Physiotheraphy' }, { v: 'Engineering' }, { v: 'Pharmacy' }]; } };
  const sp = createDepartmentSpellings(fake as any, 60_000);
  assert.deepEqual((await sp.expand(['Medical Sciences'])).sort(), ['Medical', 'Medical Sciences', 'Medical sciences']);
  assert.deepEqual((await sp.expand(['Physiotherapy'])).sort(), ['Physio Therapy', 'Physiotheraphy', 'Physiotherapy']);
  assert.deepEqual(await sp.expand(['Engineering']), ['Engineering']);
  assert.equal(reads, 1, 'the stored spellings are read once and cached');
  sp.refresh(); await sp.expand(['Law']); assert.equal(reads, 2);
  // A failed read never takes the caller down: the registry alone still answers.
  const broken = createDepartmentSpellings({ $queryRawUnsafe: async () => { throw new Error('db down'); } } as any);
  const prev = console.error; console.error = () => {};
  assert.deepEqual((await broken.expand(['Physiotherapy'])).sort(), ['Physio Therapy', 'Physiotheraphy', 'Physiotherapy']);
  console.error = prev;

  // I. New manual input: known spellings become the official name, unknown values are refused and nothing is guessed.
  const body: any = { domain: ' Medical sciences ', title: 'x' };
  assert.deepEqual(normaliseBodyDepartments(body), { rewrites: 1, problems: [] });
  assert.equal(body.domain, 'Medical Sciences');
  const bad: any = { domain: 'Underwater Basketry' };
  assert.equal(normaliseBodyDepartments(bad).problems.length, 1);
  assert.equal(bad.domain, 'Underwater Basketry', 'an unknown value is reported, not rewritten');
  const none: any = { domain: '' }; assert.equal(normaliseBodyDepartments(none).problems.length, 0);
  // …and the four added 2026-10-30 are accepted by hand, by file and from a publisher, under their official names (an alias is rewritten).
  const added: any = { items: [{ domain: 'Radiology' }, { domain: 'Paramedical' }, { department: 'optometry and ophthalmology' }, { domain: 'Medical Laboratory Technology' }] };
  assert.deepEqual(normaliseBodyDepartments(added), { rewrites: 2, problems: [] });
  assert.deepEqual(added.items.map((i: any) => i.domain ?? i.department), ['Radiology', 'Paramedical Sciences', 'Optometry & Ophthalmology', 'Medical Laboratory Technology']);
  const notYet: any = { domain: 'Optometry' }; assert.equal(normaliseBodyDepartments(notYet).problems.length, 1, 'a half-name is refused, not guessed');
  const bulk: any = { items: [{ domain: 'Physiotheraphy' }, { department: 'Law' }, { domain: 'Zzz' }, { title: 'no dept' }] };
  const r = normaliseBodyDepartments(bulk);
  assert.deepEqual(r.problems, [{ where: 'row 3', value: 'Zzz' }]);
  assert.equal(bulk.items[0].domain, 'Physiotherapy');
  // The middleware answers 400 listing the rows, and calls next() when all is well.
  let status = 0, payload: any = null, nexted = 0;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  requireOfficialDepartments({ body: { items: [{ domain: 'Zzz' }] } }, res, () => nexted++);
  assert.equal(status, 400); assert.equal(payload.code, 'UNKNOWN_DEPARTMENT'); assert.match(payload.error, /row 1: "Zzz"/); assert.equal(nexted, 0);
  requireOfficialDepartments({ body: { domain: 'physiotheraphy' } }, res, () => nexted++); assert.equal(nexted, 1);
  // Editing an old record filed under an unknown value ("Engineering") is allowed while the value is unchanged.
  status = 0;
  await requireOfficialDepartmentsOnEdit(async () => 'Engineering')({ body: { domain: 'Engineering', title: 'fixed typo' } }, res, () => nexted++);
  assert.equal(nexted, 2); assert.equal(status, 0);
  await requireOfficialDepartmentsOnEdit(async () => 'Engineering')({ body: { domain: 'Zzz' } }, res, () => nexted++);
  assert.equal(status, 400);
  console.log('department server pieces: all checks pass');
})().catch((e) => { console.error(e); process.exit(1); });
