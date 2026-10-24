/**
 * The quotation email: what it must contain, what it must not, and that it stays email-safe. No database, no server.
 *
 *   npx tsx scripts/test-quotation-email.ts
 */
import { readFileSync } from 'node:fs';
import { buildQuotationEmailHtml, QUOTATION_EMAIL_PALETTE } from '../src/lib/quotation/quotationEmail';
import { COMPANY_DETAILS } from '../src/config';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + String(detail).slice(0, 200) : ''}`); };

const base = { hasLogo: true, recipientName: 'Asha Rao', quotationNumber: 'ITB/SDL/26-27/002', issuedDate: '23 Oct 2026', validityDays: 15, duration: 'Annual',
  departments: ['Law', 'Nursing', 'Computer / IT'], discount: 0, total: 94282 };
const html = buildQuotationEmailHtml(base);
const header = html.slice(html.indexOf('<!-- Header'), html.indexOf('<!-- Introduction'));

console.log('Header');
check('"Operated by IT BREAK COM PRIVATE LIMITED" is not in the header', !/operated by/i.test(header) && !/operated by/i.test(html));
check('the logo is the first thing in the header, on the left', header.indexOf('cid:stm-logo') > -1 && header.indexOf('cid:stm-logo') < header.indexOf('STM Digital Library</p>'));
check('the logo cell comes before the title cell (left, then name)', header.indexOf('width="64"') < header.indexOf('padding-left:18px'));
check('the logo uses exactly src="cid:stm-logo" (the server swaps that attribute for the stored copy)', /src="cid:stm-logo"/.test(html));
check('without a logo file a plain "STM" mark stands in, and nothing points at cid', !/cid:stm-logo/.test(buildQuotationEmailHtml({ ...base, hasLogo: false })) && />STM</.test(buildQuotationEmailHtml({ ...base, hasLogo: false })));
const stored = html.replace(/src="cid:stm-logo"/g, 'src="https://journalslibrary.com/assets/stm-logo.png"');
check('the stored copy has no cid reference left', !/cid:/.test(stored));

console.log('\nContent: every value is there');
for (const [what, needle] of [
  ['recipient', 'Dear Asha Rao,'], ['quotation number', 'ITB/SDL/26-27/002'], ['date', '23 Oct 2026'], ['validity', '15 days from issue'], ['duration', 'Annual'],
  ['total, with Indian grouping and paise', '₹94,282.00'.replace('₹', '&#8377;')], ['department Law', 'Law'], ['department Nursing', 'Nursing'], ['department Computer / IT', 'Computer / IT'],
  ['department count row', '3 departments'],
  ['account name', COMPANY_DETAILS.legalName], ['account number', COMPANY_DETAILS.bank.accountNumber], ['bank', COMPANY_DETAILS.bank.bankName],
  ['branch', COMPANY_DETAILS.bank.branch], ['IFSC', COMPANY_DETAILS.bank.ifscCode], ['contact email', COMPANY_DETAILS.email],
  ['GSTIN', COMPANY_DETAILS.gstin], ['PAN', COMPANY_DETAILS.pan], ['CIN', COMPANY_DETAILS.cin],
  ['the attached-quotation sentence', 'Please find attached our subscription quotation for the selected department(s) and subscription period.'],
  ['the attachment reminder', 'Please refer to the attached PDF for the complete quotation, department details, pricing and applicable terms.'],
  ['the one-line description', 'A single organised academic platform for discovering, accessing and managing research and learning resources.'],
  ['the contact line', 'Need assistance?'], ['the phone, from the company details', COMPANY_DETAILS.mobile.replace(/-/g, ' ')],
  ['the signature address', 'A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India'],
] as const) check(what, html.includes(needle), needle);
check('no discount line when there is no discount', !/Special discount/.test(html));
const withDiscount = buildQuotationEmailHtml({ ...base, discount: 4000 });
check('a discount shows as a minus amount', /Special discount \/ adjustment/.test(withDiscount) && /&minus;&#8377;4,000\.00/.test(withDiscount));
check('one department reads "1 department"', buildQuotationEmailHtml({ ...base, departments: ['Law'] }).includes('>1 department<'));
check('an empty list shows 0 departments and no broken table', buildQuotationEmailHtml({ ...base, departments: [] }).includes('0 departments') && !/&#10003;/.test(buildQuotationEmailHtml({ ...base, departments: [] })));

console.log('\nDepartments: 1–4 are named, more are a count (the PDF keeps the full list)');
const names = (n: number) => Array.from({ length: n }, (_, i) => `Department ${String.fromCharCode(65 + (i % 26))}${i}`);
const ticks = (h: string) => (h.match(/&#10003;/g) || []).length;
for (const n of [1, 2, 3, 4]) {
  const h = buildQuotationEmailHtml({ ...base, departments: names(n) });
  check(`${n} department${n > 1 ? 's' : ''}: all named, no "more" line`, ticks(h) === n && names(n).every(d => h.includes(d)) && !/more department/.test(h) && !/Complete department-wise/.test(h));
}
for (const [n, rest] of [[5, 1], [16, 12], [34, 30]] as const) {
  const h = buildQuotationEmailHtml({ ...base, departments: names(n) });
  check(`${n} departments: first 4 named, "+ ${rest} more department${rest > 1 ? 's' : ''}", count row says ${n}`,
    ticks(h) === 4 && names(4).every(d => h.includes(d)) && !h.includes(names(5)[4]) && h.includes(`+ ${rest} more department${rest > 1 ? 's' : ''}`) && h.includes(`>${n} departments<`), h.match(/\+ \d+ more[^<]*/)?.[0]);
  check(`${n} departments: points to the attached quotation for the rest`, h.includes('Complete department-wise details are included in the attached quotation.'));
}
check('the order given is kept (first four, not a sort)', (() => { const h = buildQuotationEmailHtml({ ...base, departments: ['Zoology', 'Law', 'Arts', 'Physics', 'Botany'] }); return h.indexOf('Zoology') < h.indexOf('Law') && !h.includes('Botany'); })());
check('a long department name stays inside its cell (wraps; no nowrap on names)', !/white-space:nowrap[^"]*"[^>]*><span[^>]*>&#10003;/.test(buildQuotationEmailHtml({ ...base, departments: ['Electronics & Telecommunication Engineering'] })));
const sixteen = buildQuotationEmailHtml({ ...base, departments: names(16), total: 150851.2 });
check('the total is the amount given, in Indian grouping', sixteen.includes('&#8377;1,50,851.20'));

console.log('\nRemoved from the body');
check('no About list (journals, proceedings, videos, e-books, theses)', !/Academic journals|Conference proceedings|Educational videos|Theses|About STM Digital Library/.test(html));
check('no "For Publisher / Authorized Signatory" block', !/For Publisher|Authorized Signatory/i.test(html));
check('no separate Contact information card', !/Contact information/i.test(html));
check('the legal identity stays in the signature and the footer', (html.match(new RegExp(COMPANY_DETAILS.legalName, 'g')) || []).length >= 2);

console.log('\nPhone: the header does not lose the quotation number');
check('the quotation number is in the header once, in a cell that stacks under the name on a phone', (header.match(/ITB\/SDL\/26-27\/002/g) || []).length === 1 && /class="hcol hright"/.test(header) && /\.hcol \{ display:block/.test(html));
check('the header is compact (24px vertical padding)', /padding:24px 40px/.test(header));

console.log('\nSafety: nothing the sender typed becomes markup');
const hostile = buildQuotationEmailHtml({ ...base, recipientName: '<img src=x onerror=alert(1)>', quotationNumber: '"><script>1</script>', departments: ['<b>Law</b>'] });
check('name, number and department names are escaped', !/<img src=x/.test(hostile) && !/<script>1/.test(hostile) && !/<b>Law<\/b>/.test(hostile) && /&lt;b&gt;Law/.test(hostile));

console.log('\nDesign: one palette, email-safe markup');
const colours = [...new Set((html.match(/#[0-9a-fA-F]{6}\b/g) || []).map(c => c.toUpperCase()))];
const allowed = new Set(QUOTATION_EMAIL_PALETTE.map(c => c.toUpperCase()));
const stray = colours.filter(c => !allowed.has(c));
check(`every colour is from the palette (${colours.length} used)`, stray.length === 0, stray.join(', '));
check('the two brand colours are used', colours.includes('#0F172B') && colours.includes('#1B5DFC'));
check('no gradients, shadows or flex/grid (unsupported or unreliable in mail clients)', !/linear-gradient|box-shadow|display:\s*(flex|grid)|position:\s*(absolute|fixed)/i.test(html));
check('no script, external stylesheet or web font', !/<script|<link\b|@import|@font-face/i.test(html));
check('the layout is tables', (html.match(/<table/g) || []).length >= 10 && /role="presentation"/.test(html));
check('the container is at most 640px wide', /width="640"/.test(html) && /max-width:640px/.test(html) && !/width="6[5-9]\d"|width="[7-9]\d\d"/.test(html));
check('a phone gets a narrower layout through one small media query', /@media only screen and \(max-width:640px\)/.test(html) && (html.match(/@media/g) || []).length === 1);
check('the preheader (inbox preview line) names the quotation and the total', /display:none[^>]*>Quotation ITB\/SDL\/26-27\/002[^<]*&#8377;94,282\.00/.test(html));
check('the document has a title, a language and a viewport', /<title>Quotation ITB/.test(html) && /<html lang="en">/.test(html) && /name="viewport"/.test(html));

console.log('\nWiring: the server uses this and the old inline template is gone');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
check('server.ts builds the quotation email with buildQuotationEmailHtml', /buildQuotationEmailHtml\(\{/.test(server) && /const htmlForDb = htmlBody\.replace\(\/src="cid:stm-logo"\/g/.test(server));
check('the old inline quotation template is gone', !/Payments must be made only to/.test(server) && !/QUOTATION DETAILS/.test(server));
check('the logo is still attached under the content id the template uses', /cid: 'stm-logo'/.test(server));

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
