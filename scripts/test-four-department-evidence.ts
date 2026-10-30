/**
 * The evidence rules for preparing a move of existing records into Radiology, Optometry & Ophthalmology, Medical Laboratory Technology and
 * Paramedical Sciences (src/lib/ingestion/fourDepartmentEvidence.ts). Pure: no database, no network.
 *
 *   npx tsx scripts/test-four-department-evidence.ts
 */
import assert from 'node:assert/strict';
import { judgeBook, judgeJournal, accessEffect, manifestRow, ACCESS_PRESERVATION_MECHANISM } from '../src/lib/ingestion/fourDepartmentEvidence';
import { isAutoIngested } from '../src/lib/departmentRegistry';

let pass = 0;
const ok = (name: string, cond: boolean, detail: unknown = '') => { assert.ok(cond, `${name} ${detail ? JSON.stringify(detail) : ''}`); pass++; console.log(`  PASS  ${name}`); };
const book = (o: any = {}) => ({ id: 'b', title: 'x', domain: 'Medical Sciences', status: 'Draft', ...o });
const jr = (o: any = {}) => ({ id: 'j', title: 'x', domain: 'Medical Sciences', status: 'MetadataOnly', ...o });

console.log('Books');
ok('a title that says radiology proposes nothing by itself', judgeBook(book({ title: 'Pitfalls in Diagnostic Radiology' })).verdict === 'hold');
ok('a narrow NLM class alone is one family: held', judgeBook(book({ nlm: ['WN 100 A1'] })).verdict === 'hold' && /one family/.test(judgeBook(book({ nlm: ['WN 100 A1'] })).reason));
ok('a MeSH subject alone is one family: held', judgeBook(book({ kw: ['Diagnostic Imaging'] })).verdict === 'hold');
const rad = judgeBook(book({ title: 'Chest imaging', nlm: ['WN 160 B1 2001'], kw: ['Diagnostic Imaging', 'Thorax'] }));
ok('NLM WN + MeSH "Diagnostic Imaging" propose Radiology', rad.verdict === 'propose' && rad.proposed === 'Radiology' && rad.evidence.length === 2, rad);
ok('NLM WW + MeSH "Eye Diseases" propose Optometry & Ophthalmology', judgeBook(book({ nlm: ['WW 140 C2'], kw: ['Eye Diseases'] })).proposed === 'Optometry & Ophthalmology');
ok('NLM QY + MeSH "Clinical Laboratory Techniques" propose Medical Laboratory Technology', judgeBook(book({ nlm: ['QY 25 D3'], kw: ['Clinical Laboratory Techniques'] })).proposed === 'Medical Laboratory Technology');
ok('the broad medical codes are not evidence: LCC "R"/"RC", NLM "W", NLM "WB" do nothing', ['W 20', 'WB 100', 'WG 200', 'R 5'].every(c => judgeBook(book({ nlm: [c], kw: ['Diagnostic Imaging'] })).verdict === 'hold'));
ok('the broad headings are not evidence either (a THEMA/BIC medicine heading is not an NLM class)', judgeBook(book({ kw: ['THEMA EDITEUR::M MEDICINE::MN CLINICAL AND INTERNAL MEDICINE', 'Diagnostic Imaging'] })).verdict === 'hold');
ok('"Radiography, Dental" is Dental’s, even beside WN', judgeBook(book({ nlm: ['WN 230 A'], kw: ['Radiography', 'Radiography, Dental'] })).verdict === 'hold');
ok('a MeSH term is matched whole: "Radiography, Dental" is not "Radiography"', judgeBook(book({ nlm: ['WN 230 A'], kw: ['Radiography, Dental'] })).verdict === 'hold');
ok('evidence for two departments at once is held, not resolved', judgeBook(book({ nlm: ['WN 100 A', 'WW 100 B'], kw: ['Diagnostic Imaging', 'Eye Diseases'] })).verdict === 'hold');
ok('a record already filed under a specific department (Dental) is held', judgeBook(book({ domain: 'Dental', nlm: ['WN 230 A'], kw: ['Diagnostic Imaging'] })).verdict === 'hold');
ok('veterinary imaging is held', judgeBook(book({ title: 'Veterinary diagnostic imaging', nlm: ['WN 100 A'], kw: ['Diagnostic Imaging'] })).verdict === 'hold');
ok('Paramedical Sciences is never proposed, whatever the record says', ['Emergency Medical Technicians', 'Paramedics', 'Allied Health Personnel'].every(k => judgeBook(book({ title: 'Paramedic practice', nlm: ['WX 215 A'], kw: [k] })).proposed !== 'Paramedical Sciences'));
ok('"None" as a subject is not a subject', judgeBook(book({ subject: 'None', nlm: ['WN 100 A'] })).evidence.length === 1);

console.log('\nJournals');
ok('a title alone proposes nothing', judgeJournal(jr({ title: 'Journal of Radiology' })).verdict === 'hold');
ok('a subject label alone is one family: held', judgeJournal(jr({ title: 'Clinical Insights', subjects: ['Medicine: Ophthalmology'] })).verdict === 'hold');
const oph = judgeJournal(jr({ title: 'Taiwan Journal of Ophthalmology', subjects: ['Medicine: Ophthalmology'] }));
ok('the DOAJ label "Medicine: Ophthalmology" plus a title that names the field propose Optometry & Ophthalmology', oph.proposed === 'Optometry & Ophthalmology' && oph.evidence.includes('subject label') && oph.evidence.includes('title names the field'), oph);
ok('"Medical radiology" label + radiology title propose Radiology', judgeJournal(jr({ title: 'Journal of Medical Radiology', subjects: ['Medicine: Medicine (General): Medical physics. Medical radiology. Nuclear medicine'] })).proposed === 'Radiology');
ok('"Computer Vision and Pattern Recognition" is not an eye journal', judgeJournal(jr({ title: 'Vision Research Letters', subjects: ['Computer Vision and Pattern Recognition'] })).verdict === 'hold');
ok('"Dental Radiography and Imaging" is Dental’s', judgeJournal(jr({ title: 'Journal of Oral Radiology', domain: 'Dental', subjects: ['Dental Radiography and Imaging'] })).verdict === 'hold');
ok('"Medicine: Pathology" is too broad to mean laboratory technology', judgeJournal(jr({ title: 'Laboratory Medicine Reports', subjects: ['Medicine: Pathology'] })).verdict === 'hold');
ok('a Radiology label under an Ophthalmology-only title is held (label and title must name the same field)', judgeJournal(jr({ title: 'Journal of Ophthalmology', subjects: ['Medicine: Medicine (General): Medical physics. Medical radiology. Nuclear medicine'] })).verdict === 'hold');

console.log('\nAccess: who loses what');
ok('there is no mechanism that keeps a reader’s access to a record that moves department', ACCESS_PRESERVATION_MECHANISM === false);
ok('a Draft book in Medical Sciences: nobody reads it, no access change', !accessEffect('book', { domain: 'Medical Sciences', status: 'Draft' }).changes);
ok('a Published book in Medical Sciences: moving it removes it from its readers → needs preservation', accessEffect('book', { domain: 'Medical Sciences', status: 'Published' }).needsPreservation);
ok('a public journal (MetadataOnly or Accepted) behaves the same; NeedsReview does not', accessEffect('journal', { domain: 'Medical Sciences', status: 'Accepted' }).needsPreservation && accessEffect('journal', { domain: 'Medical Sciences', status: 'MetadataOnly' }).needsPreservation && !accessEffect('journal', { domain: 'Medical Sciences', status: 'NeedsReview' }).changes);
ok('a record with no department is not a loss for anyone', !accessEffect('book', { domain: null, status: 'Published' }).needsPreservation);
const ready = manifestRow('book', book({ nlm: ['WN 160 B1'], kw: ['Diagnostic Imaging'], status: 'Draft' }));
const held = manifestRow('book', book({ nlm: ['WN 160 B1'], kw: ['Diagnostic Imaging'], status: 'Published' }));
const amb = manifestRow('book', book({ title: 'Radiology', status: 'Published' }));
ok('evidence + no access change = ready', ready.decision === 'ready' && ready.proposedDepartment === 'Radiology');
ok('evidence + a public record = held for access, with the reason written down', held.decision === 'held-access' && /no mechanism/.test(held.reason) && held.proposedDepartment === 'Radiology');
ok('no evidence = held as ambiguous, nothing proposed', amb.decision === 'held-ambiguous' && amb.proposedDepartment === null);

console.log('\nThe engines');
ok('this module is not what ingestion uses: the four departments are still off for the engines', !['Radiology', 'Optometry & Ophthalmology', 'Medical Laboratory Technology', 'Paramedical Sciences'].some(isAutoIngested));

console.log(`\n${pass} passed, 0 failed`);
