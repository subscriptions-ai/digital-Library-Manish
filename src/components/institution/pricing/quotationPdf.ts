import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addDays, format } from 'date-fns';
import { COMPANY_DETAILS } from '../../../config';
import { GST_RATE, MAX_INSTITUTION_USERS, TERM_MONTHS } from '../../../lib/institutionPricing';
import { COMPANY_STATE } from '../../../lib/gstUtils';

/**
 * A quotation a librarian can take to their finance office.
 *
 * It carries the same numbers the screen showed — the server's quote when there was one —
 * and says plainly that the price is confirmed again at payment. The built-in PDF fonts have
 * no rupee sign, so amounts are written "Rs.", as on our receipts.
 *
 * Tax is shown the way an invoice shows it: who is billing (GSTIN, address), who is billed
 * (state), the SAC code the wizard quotation already uses, and the GST split — CGST + SGST
 * within Delhi, IGST outside it. When the customer's state is not known the split is not
 * guessed: the total is shown as GST and the place of supply is asked for.
 */

const SAC_CODE = '998439';
const VALID_DAYS = 30;

const rs = (n: number, decimals = 2) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

/** The built-in fonts draw "₹" as a stray glyph; notes built from on-screen copy are rewritten. */
const pdfSafe = (s: string) => s.replace(/₹\s?/g, 'Rs. ');

// Display only: a word typed in lower case gets a capital, anything already
// capitalised (an acronym, a name like "McGill") is left as it was typed.
const titleCase = (s: string) =>
  s.replace(/\S+/g, w => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w));

export type QuotationInput = {
  institution?: string;
  /** The contact's name and email, shown as "Attn". */
  contactName?: string;
  contactEmail?: string;
  /** Where the customer is, which decides CGST + SGST or IGST. */
  customerState?: string | null;
  customerGstin?: string | null;
  /** Kept for callers that still pass one pre-built line. */
  preparedFor?: string;
  title: string;
  /** Compact label/value rows under the subject: departments, period. */
  summary?: [string, string][];
  /** Which pricing slab applied, already worded, shown beside the totals. */
  slabNote?: string;
  lines: { description: string; quantity: number; rate: number }[];
  base: number;
  gst: number;
  total: number;
  notes: string[];
  fileName: string;
};

/** A reference, not a stored record: it ties this document to the day and moment it was made. */
const quotationNumber = (d: Date) => `STMQ-${format(d, 'yyMMdd-HHmm')}-${Math.floor(1000 + Math.random() * 9000)}`;

export function downloadQuotation(q: QuotationInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const today = new Date();
  const expires = addDays(today, VALID_DAYS);
  const number = quotationNumber(today);
  const L = 18, R = 192, W = R - L;
  const TEAL: [number, number, number] = [11, 110, 114];
  const INK: [number, number, number] = [15, 23, 42];
  const MUTED: [number, number, number] = [100, 116, 139];

  // ── Letterhead ──
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, 210, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...INK);
  doc.text(COMPANY_DETAILS.name, L, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(COMPANY_DETAILS.positioning, L, 23);
  doc.text(COMPANY_DETAILS.registeredOffice, L, 27.5);
  doc.text(`${COMPANY_DETAILS.email}  |  ${COMPANY_DETAILS.tel.join(' / ')}  |  ${COMPANY_DETAILS.website}`, L, 32);
  doc.text(`GSTIN: ${COMPANY_DETAILS.gstin}   |   PAN: ${COMPANY_DETAILS.pan}   |   CIN: ${COMPANY_DETAILS.cin}`, L, 36.5);

  // Title block, on the right of the letterhead.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...TEAL);
  doc.text('QUOTATION', R, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(`No: ${number}`, R, 24, { align: 'right' });
  doc.text(`Date: ${format(today, 'dd MMM yyyy')}`, R, 28.5, { align: 'right' });
  doc.text(`Valid until: ${format(expires, 'dd MMM yyyy')}`, R, 33, { align: 'right' });

  doc.setDrawColor(226, 232, 240); doc.line(L, 41, R, 41);

  // ── Billed to / Subject ──
  const contact = q.contactName
    ? `Attn: ${titleCase(q.contactName)}${q.contactEmail ? ` (${q.contactEmail})` : ''}`
    : (q.preparedFor || q.contactEmail || '');
  const inState = !!q.customerState && q.customerState.trim().toLowerCase() === COMPANY_STATE.toLowerCase();
  const stateKnown = !!q.customerState?.trim();

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text('PREPARED FOR', L, 48);
  doc.text('SUBJECT', 112, 48);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...INK);
  doc.text(titleCase(q.institution || 'Your institution'), L, 54);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let cy = 59;
  if (contact) { doc.text(contact, L, cy); cy += 4.5; }
  doc.text(`Place of supply: ${stateKnown ? q.customerState : 'To be confirmed'}`, L, cy); cy += 4.5;
  doc.text(`Customer GSTIN: ${q.customerGstin || 'Not provided'}`, L, cy);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(q.title, R - 112), 112, 54);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text(`${TERM_MONTHS}-month subscription from the date of activation`, 112, 59);
  // The summary: what is being bought, in three lines.
  doc.setFontSize(8.8);
  (q.summary || []).forEach(([label, value], i) => {
    const ry = 64.5 + i * 4.4;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text(`${label}:`, 112, ry);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
    doc.text(value, 112 + 36, ry);
  });

  // ── Line items ──
  autoTable(doc, {
    startY: 80,
    head: [['#', 'Description', 'SAC', 'Qty', 'Rate / year', 'Amount']],
    body: q.lines.map((l, i) => [
      String(i + 1), pdfSafe(l.description), SAC_CODE, String(l.quantity), rs(l.rate, 2), rs(l.quantity * l.rate, 2),
    ]),
    theme: 'grid',
    headStyles: { fillColor: TEAL, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.8, textColor: INK, cellPadding: 2.6 },
    alternateRowStyles: { fillColor: [247, 250, 250] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 16, halign: 'center', textColor: MUTED },
      3: { cellWidth: 13, halign: 'right' }, 4: { cellWidth: 29, halign: 'right' }, 5: { cellWidth: 31, halign: 'right', fontStyle: 'bold' },
    },
    styles: { lineColor: [226, 232, 240] },
    // Rows are never cut across a page, the header repeats on every page the table
    // reaches, and the table stops short of the footer.
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    margin: { left: L, right: 210 - R, top: 20, bottom: 22 },
  });

  // ── Pagination ──
  // Every block below is measured before it is drawn, and moved whole to the next
  // page when it will not fit — so a heading can never be left alone at a page
  // bottom, and the totals and the payment box are never split. Nothing is shrunk:
  // a longer quotation simply takes a second page.
  const TOP = 20, BOTTOM = 297 - 22;            // BOTTOM leaves the footer clear
  const LH = 4.1;                                // line height of body text
  let y = (doc as any).lastAutoTable.finalY + 8;
  const ensure = (height: number) => {
    if (y + height > BOTTOM) { doc.addPage(); y = TOP; }
  };
  const bulletHeight = (lines: string[]) => lines.length * LH + 0.8;
  const body = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(71, 85, 105); };
  const heading = (t: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(t, L, y); y += 5; body();
  };
  const wrap = (t: string): string[] => doc.splitTextToSize(`•  ${pdfSafe(t)}`, W);

  // ── Totals, with the tax split (one block, with the slab note beside it) ──
  const totalRows: [string, string, boolean?][] = [['Subtotal', rs(q.base)]];
  const pct = Math.round(GST_RATE * 100);
  if (!stateKnown) totalRows.push([`GST @ ${pct}%`, rs(q.gst)]);
  else if (inState) {
    const half = Math.round((q.gst / 2) * 100) / 100;
    totalRows.push([`CGST @ ${pct / 2}%`, rs(half)], [`SGST @ ${pct / 2}%`, rs(Math.round((q.gst - half) * 100) / 100)]);
  } else totalRows.push([`IGST @ ${pct}%`, rs(q.gst)]);
  ensure(totalRows.length * 5.5 + 2 + 9 + 2);

  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11.5 : 9.5);
    doc.setTextColor(...INK);
    doc.text(label, 140, y, { align: 'right' });
    doc.text(value, R, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  if (q.slabNote) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(q.slabNote, 82), L, y);
    doc.setTextColor(...INK);
  }
  for (const [label, value] of totalRows) row(label, value);
  doc.setDrawColor(203, 213, 225); doc.line(108, y - 2.5, R, y - 2.5);
  y += 2;
  doc.setFillColor(238, 247, 247); doc.rect(108, y - 5.5, R - 108, 9, 'F');
  row('Total payable', rs(q.total), true);

  // ── What is included: the whole block, or none of it, on a page ──
  const includes = [
    `Full access to each subscribed department for ${TERM_MONTHS} months from the date of activation.`,
    `Up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users on your institution's account, at no extra charge. For more, please contact ${COMPANY_DETAILS.email}.`,
  ].map(wrap);
  y += 5;
  body();
  ensure(5 + includes.reduce((h, l) => h + bulletHeight(l), 0));
  heading('What this includes');
  for (const lines of includes) { doc.text(lines, L, y); y += bulletHeight(lines); }

  // ── Terms: the heading travels with its first bullet; the rest flow on ──
  const terms = [
    ...q.notes,
    `This quotation is valid until ${format(expires, 'dd MMM yyyy')}. The price is held until then; the amount shown at payment is the amount charged.`,
    stateKnown
      ? `GST is charged as ${inState ? 'CGST and SGST' : 'IGST'}, as the place of supply is ${q.customerState}.`
      : 'GST is charged as CGST and SGST within Delhi and as IGST elsewhere, once the place of supply is confirmed.',
  ].map(wrap);
  y += 3;
  body();
  // The heading and the first bullet — and the second, if there is one and it is short.
  ensure(5 + bulletHeight(terms[0]) + (terms[1] ? bulletHeight(terms[1]) : 0));
  heading('Terms');
  terms.forEach(lines => {
    ensure(bulletHeight(lines));
    body();
    doc.text(lines, L, y); y += bulletHeight(lines);
  });

  // ── How to pay: one block, never split from its details ──
  const bank = COMPANY_DETAILS.bank;
  y += 4;
  ensure(27);
  doc.setDrawColor(226, 232, 240); doc.setFillColor(250, 251, 252);
  doc.roundedRect(L, y, W, 27, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text('How to pay', L + 4, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(71, 85, 105);
  doc.text(`Pay online from the Subscriptions page, or by bank transfer to ${bank.accountName}.`, L + 4, y + 11.5);
  doc.text(`${bank.bankName}, ${bank.branch}   |   A/c ${bank.accountNumber}   |   IFSC ${bank.ifscCode}`, L + 4, y + 16.5);
  doc.text(`After a transfer, write to ${COMPANY_DETAILS.email} with the quotation number ${number} and the transfer reference.`, L + 4, y + 21.5);

  // ── Footer, on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(120);
    doc.text(`This is a computer-generated quotation and needs no signature.   Questions? ${COMPANY_DETAILS.email}  |  ${COMPANY_DETAILS.tel[0]}`, 105, 288, { align: 'center' });
    doc.text(`${number}  ·  page ${p} of ${pages}`, 105, 292.5, { align: 'center' });
  }

  doc.save(q.fileName);
}
