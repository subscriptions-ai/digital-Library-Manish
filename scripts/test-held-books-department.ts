/**
 * The held-books job must never overwrite a department that is already set — placed by hand or by Review Automation.
 * Private throwaway database `stm_review_test` only.
 *
 *   npx tsx scripts/test-held-books-department.ts
 *
 * Seeds DOAB Drafts the held-books job would otherwise promote (strong evidence: a controlled code and wording agree) and proves: an unassigned one
 * is classified exactly as before; one with a manually assigned department and one assigned by Review Automation are left byte-for-byte alone (even
 * updatedAt) across repeated passes; a department assigned between the job reading a book and writing it still wins; and nothing is published,
 * rejected or re-statused because of this protection.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_review_test');

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_review_test') throw new Error(`refusing to run against "${name}"`);
const L = await import('../src/lib/ingestion/localWork.js');
const A = await import('../src/lib/ingestion/reviewAssignment.js');
const { CLASSIFIER_RULES_VERSION } = await import('../src/lib/ingestion/books/classifier.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const TAG = `held-${Date.now().toString(36)}`;
const made: string[] = [];
const dental = ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'];
const seed = async (title: string, o: any = {}) => {
  const b = await db.book.create({ data: { title: `${TAG} ${title}`, status: 'Draft', ownershipSource: 'Ingested', source: 'DOAB', year: 2021, licence: 'CC BY', licenceIsNC: false,
    accessType: 'OpenAccess', accessStatus: 'MetadataOnly', rightsStatus: 'MetadataOnly', language: 'en', domain: o.domain ?? null,
    metadata: { harvest: { classifications: o.weak ? [] : dental, keywords: o.weak ? ['dental implants'] : ['dentistry', 'oral health'], provider: {}, department: { band: 'review', score: 1, suggested: 'Arts', runnerUp: null } } } } });
  made.push(b.id); return b.id;
};
const row = async (id: string) => JSON.stringify((await db.$queryRawUnsafe(`select * from "Book" where id = $1`, id))[0]);
const get = async (id: string) => (await db.$queryRawUnsafe(`select id, status, domain, "rejectionNote", licence from "Book" where id = $1`, id))[0];
const resetJob = () => db.appSetting.deleteMany({ where: { key: 'ingestion.localwork.v1' } });
const runAll = async () => { let guard = 0; const total = { promoted: 0, checked: 0 }; while ((await L.heldBooksJob.pending()) > 0 && guard++ < 50) { const o = await L.heldBooksJob.run(500); total.promoted += o.promoted; total.checked += o.checked; } return total; };

await resetJob();
const idFree = await seed('Unassigned, strong evidence');
const idWeak = await seed('Unassigned, words only', { weak: true });
const idEmpty = await seed('Empty-string department, strong evidence', { domain: '' });
const idManual = await seed('Placed by hand', { domain: 'Law' });
const idAuto = await seed('Placed by Review Automation');
const placed = await A.assignDepartmentStayDraft({ bookId: idAuto, department: 'Arts', basis: 'person', source: 'batch-chosen', by: { email: 'admin@example.com' } });
eq('setup: Review Automation placed one book in Arts and left it a Draft', [placed.result, (await get(idAuto)).domain, (await get(idAuto)).status], ['assigned', 'Arts', 'Draft']);

const manualBefore = await row(idManual), autoBefore = await row(idAuto);

console.log('\nSelection');
eq('the job sees only books whose department is unset (not the two placed ones)', await L.heldBooksJob.pending(), 3);

console.log('\nFirst pass');
const first = await runAll();
check('the job ran under classifier rules v1, unchanged', CLASSIFIER_RULES_VERSION === 1);
eq('an unassigned Draft with strong evidence is classified and promoted exactly as before', [(await get(idFree)).status, (await get(idFree)).domain], ['Published', 'Dental']);
eq('an empty-string department counts as unset, as before', [(await get(idEmpty)).status, (await get(idEmpty)).domain], ['Published', 'Dental']);
eq('an unassigned Draft with only wording stays a Draft with no department (classified, not promoted)', [(await get(idWeak)).status, (await get(idWeak)).domain], ['Draft', null]);
eq('only the two unassigned strong books were promoted', first.promoted, 2);
eq('a manually assigned department is preserved (department, status, every column, even updatedAt)', await row(idManual), manualBefore);
eq('a Review Automation department is preserved, with its record', await row(idAuto), autoBefore);
eq('…and neither was published', [(await get(idManual)).status, (await get(idAuto)).status], ['Draft', 'Draft']);

console.log('\nRepeated passes');
for (let i = 1; i <= 2; i++) {
  await resetJob();   // a full re-judge, as a rules change or the weekly recheck would cause
  await runAll();
  eq(`pass ${i + 1}: manually assigned book unchanged`, await row(idManual), manualBefore);
  eq(`pass ${i + 1}: Review Automation book unchanged`, await row(idAuto), autoBefore);
}
eq('rerunning changed nothing else: still exactly two Published among the seeded books', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where title like $1 and status = 'Published'`, `${TAG}%`))[0].n, 2);
eq('no seeded book was rejected or given a rejection note', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where title like $1 and (status = 'Rejected' or "rejectionNote" is not null)`, `${TAG}%`))[0].n, 0);

console.log('\nA department assigned between reading and writing');
await resetJob();
const idRace = await seed('Assigned while the job is looking');
const realFindMany = db.book.findMany.bind(db.book);
let hit = false;
db.book.findMany = async (args: any) => {
  const rows = await realFindMany(args);
  if (!hit && rows.some((r: any) => r.id === idRace)) { hit = true; await db.$executeRawUnsafe(`update "Book" set domain = 'Law' where id = $1`, idRace); }
  return rows;
};
await L.heldBooksJob.run(500);
db.book.findMany = realFindMany;
check('(the race was staged: the job had already read the book as unassigned)', hit);
eq('the department assigned in that moment wins, and the book is not published', [(await get(idRace)).domain, (await get(idRace)).status], ['Law', 'Draft']);

await db.book.deleteMany({ where: { id: { in: made } } });
await resetJob();
eq('everything seeded was removed', await db.book.count({ where: { title: { startsWith: TAG } } }), 0);
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
