/**
 * Pins the self-service quotation rules, and draws every scenario as a real PDF.
 *
 *   npx tsx scripts/test-quotation-plans.ts [outDir]
 *
 * The pricing cases are the ones the rate card is meant to satisfy: an institution's slab is
 * decided by the total after the purchase and only the NEW departments are charged; a Solo
 * Learner's 5+ rate applies to every department in the purchase. With an `outDir` the PDFs are
 * written there, and each is checked to be exactly two pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  INSTITUTION_PLAN_KIND, QUOTE_DEPARTMENTS, SOLO_PLAN_KIND,
  buildInstitutionPlanSnapshot, buildSoloPlanSnapshot, institutionPlanToRender, planSnapshotToRow, rowToRender, soloPlanToRender,
} from '../src/lib/quotation/quotationModel';
import { buildQuotationPdf, type QuoteAssets } from '../src/lib/quotation/quotationPdf';

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
};

const names = (from: number, n: number) => QUOTE_DEPARTMENTS.slice(from, from + n);
const customer = { name: 'Raju University', contact: 'Raju', email: 'raju@gmail.com', state: 'Uttar Pradesh' };
const inst = (existing: number, fresh: number, state = 'Uttar Pradesh') =>
  buildInstitutionPlanSnapshot({ quoteNo: 'STMQ-TEST', now: new Date('2026-10-07T10:00:00'), customer: { ...customer, state }, existingNames: names(0, existing), newNames: names(existing, fresh) });
const solo = (n: number, state = 'Uttar Pradesh') =>
  buildSoloPlanSnapshot({ quoteNo: 'STMQ-S-TEST', now: new Date('2026-10-07T10:00:00'), customer: { name: 'Mohan', email: 'mohan@gmail.com', state }, names: names(0, n) });

console.log('\n— Institution: the slab is the total after purchase; only new departments are charged —');
const caseRows: [string, number, number, number, number][] = [
  // label, existing, new, expected rate, expected charge
  ['A  existing 0 + new 1  (total 1)', 0, 1, 9990, 9990],
  ['B  existing 1 + new 1  (total 2)', 1, 1, 9490, 9490],
  ['C  existing 2 + new 1  (total 3)', 2, 1, 8990, 8990],
  ['   existing 3 + new 1  (total 4)', 3, 1, 8490, 8490],
  ['D  existing 4 + new 1  (total 5)', 4, 1, 7990, 7990],
  ['E  existing 6 + new 3  (total 9)', 6, 3, 7990, 23970],
  ['   existing 8 + new 4  (total 12)', 8, 4, 7990, 31960],
];
for (const [label, e, n, rate, charge] of caseRows) {
  const s = inst(e, n);
  check(`${label}: rate`, s.ratePerNewDepartment, rate);
  check(`${label}: charged (new only)`, s.subtotal, charge);
  check(`${label}: counts`, [s.existingDepartmentCount, s.newDepartmentCount, s.totalDepartmentCount], [e, n, e + n]);
}
{
  const s = inst(6, 3);
  check('E  GST @18% (IGST, Uttar Pradesh)', s.gst, 4314.6);
  check('E  grand total', s.grandTotal, 28284.6);
  check('E  slab label', s.appliedPricingSlab, '5+ departments');
  const r = institutionPlanToRender(s);
  check('E  one aggregated line: qty/rate/amount', [r.lines.length, r.lines[0].qty, r.lines[0].rate, r.lines[0].amount], [1, '3', 7990, 23970]);
  check('E  existing departments are not a charged line', r.lines.map(l => l.title), ['Premium Department Subscription']);
  check('E  IGST shown, no CGST/SGST', [r.tax, r.igst, r.cgst, r.sgst], ['igst', 4314.6, 0, 0]);
  check('E  existing context carried to the sheet', [r.existingDepartments?.count, r.existingDepartments?.names.length], [6, 6]);
  const text = r.terms.map(t => `${t.lead ?? ''} ${t.text}`).join('\n');
  check('E  terms state the existing/new/total and no re-charge', [
    /Existing active departments: 6\. New departments: 3\. Total after purchase: 9\./.test(text),
    /5\+ departments at INR 7,990 per department\/year/.test(text),
    /not charged again under this quotation/.test(text),
    /keep their current expiry dates/.test(text),
  ], [true, true, true, true]);
  check('E  no fake discount line', r.discount, 0);
}
{
  // The 12-month term is only claimed for what is new; with nothing existing, nothing about "existing" is said.
  const r = institutionPlanToRender(inst(0, 3));
  const text = r.terms.map(t => t.text).join('\n');
  check('new-only: no existing-department wording', [/Existing active departments/.test(text), r.existingDepartments], [false, undefined]);
  check('new-only: 3 departments at 8,990', [r.lines[0].rate, r.lines[0].amount], [8990, 26970]);
  const cgst = institutionPlanToRender(inst(0, 3, 'Delhi'));
  check('Delhi customer: CGST + SGST', [cgst.tax, cgst.cgst, cgst.sgst, cgst.igst], ['split', 2427.3, 2427.3, 0]);
}
check('existing departments are never charged: a "new" name already held is dropped',
  buildInstitutionPlanSnapshot({ quoteNo: 'X', customer, existingNames: ['Law', 'Nursing'], newNames: ['Nursing', 'Pharmacy'] }).newDepartmentNames, ['Pharmacy']);

console.log('\n— Solo: the 5+ rate applies to every department in the purchase —');
for (const [n, rate, total] of [[1, 4990, 4990], [4, 4990, 19960], [5, 3990, 19950], [6, 3990, 23940], [10, 3990, 39900]] as const) {
  const s = solo(n);
  check(`${n} department(s): rate`, s.ratePerDepartment, rate);
  check(`${n} department(s): subtotal`, s.subtotal, total);
}
{
  const s = solo(5);
  check('5 departments: GST and total', [s.gst, s.grandTotal], [3591, 23541]);
  const r = soloPlanToRender(s);
  check('solo sheet is labelled for an individual', [r.customerLabel, r.termsHeading], ['Customer details', 'Terms & Conditions']);
  check('solo has no institution-only clauses', r.terms.some(t => /Accreditation|Indemnity/.test(t.lead ?? '')), false);
  const text = r.terms.map(t => t.text).join('\n');
  check('solo terms: pricing sentence and account sentence', [
    /INR 4,990 per department per year for 1-4 departments; INR 3,990 per department per year for 5 or more departments, applicable to every selected department in that purchase\. Applied here: 5\+ department rate\./.test(text),
    /own account and must not be shared with another user/.test(text),
  ], [true, true]);
  check('solo has no existing-department context', r.existingDepartments, undefined);
}

console.log('\n— A stored quotation draws from its snapshot, not from today\'s rate card —');
{
  const s = inst(6, 3);
  const row = { id: s.quoteNo, pricingBreakdown: { ...s, ratePerNewDepartment: 12345, subtotal: 37035, gst: 6666.3, grandTotal: 43701.3 } };
  check('institution row renders the stored rate', rowToRender(row).lines[0].rate, 12345);
  const stored = planSnapshotToRow(s);
  check('row carries the snapshot and the totals', [stored.data.pricingBreakdown.kind, stored.data.total, stored.data.gstAmount], [INSTITUTION_PLAN_KIND, 28284.6, 4314.6]);
  check('solo row carries its kind', planSnapshotToRow(solo(5)).data.pricingBreakdown.kind, SOLO_PLAN_KIND);
}

// ── PDFs ────────────────────────────────────────────────────────────────────
const outDir = process.argv[2];
if (outDir) {
  console.log(`\n— PDFs → ${outDir} (each must be exactly two pages) —`);
  fs.mkdirSync(outDir, { recursive: true });
  const root = path.resolve(process.cwd(), 'public/assets/quotation');
  const data = (f: string) => `data:image/jpeg;base64,${fs.readFileSync(path.join(root, f)).toString('base64')}`;
  const assets: QuoteAssets = { logo: data('logo.jpg'), signature: data('signature.jpg'), qr: data('upi-qr.jpg') };

  const long = [
    'Electronics & Telecommunication Engineering', 'Civil/Construction Engineering', 'Education & Social Sciences',
    'Chemical Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'Medical Sciences', 'Material Science',
    'Applied Mechanics', 'Applied Sciences', 'Bio Technology', 'Life Sciences',
  ];
  const scenarios: [string, ReturnType<typeof soloPlanToRender>][] = [
    ['solo-1', soloPlanToRender(solo(1))],
    ['solo-4', soloPlanToRender(solo(4))],
    ['solo-5', soloPlanToRender(solo(5))],
    ['solo-10', soloPlanToRender(solo(10))],
    ['solo-24-delhi', soloPlanToRender(buildSoloPlanSnapshot({ quoteNo: 'STMQ-S-261007-1145-2892', now: new Date('2026-10-07'), customer: { name: 'Mohan', email: 'mohan@gmail.com', phone: '9876543210', state: 'Delhi' }, names: QUOTE_DEPARTMENTS }))],
    ['inst-new-only-3', institutionPlanToRender(inst(0, 3))],
    ['inst-existing6-new3', institutionPlanToRender(inst(6, 3))],
    ['inst-existing2-new1', institutionPlanToRender(inst(2, 1))],
    ['inst-existing8-new4-total12', institutionPlanToRender(inst(8, 4))],
    ['inst-stress-existing12-new12-longnames', institutionPlanToRender(buildInstitutionPlanSnapshot({ quoteNo: 'STMQ-261007-1148-8324', now: new Date('2026-10-07'), customer, existingNames: long, newNames: QUOTE_DEPARTMENTS.filter(d => !long.includes(d)).slice(0, 12) }))],
    ['inst-existing-names-unknown', institutionPlanToRender({ ...inst(6, 3), existingDepartmentNames: [] })],
  ];
  for (const [name, render] of scenarios) {
    const doc = buildQuotationPdf(render, assets);
    const pages = doc.getNumberOfPages();
    fs.writeFileSync(path.join(outDir, `${name}.pdf`), Buffer.from(doc.output('arraybuffer')));
    check(`${name}: exactly 2 pages`, pages, 2);
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
