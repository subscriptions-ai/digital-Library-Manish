import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addDays, format } from 'date-fns';
import { COMPANY_DETAILS } from '../../config';
import { loadPdfLogo } from '../../lib/pdfLogo';
import { GST_RATE } from '../../lib/gstUtils';
import { SOLO_TERM_MONTHS, SOLO_RATE_STANDARD, SOLO_RATE_BULK, SOLO_BULK_THRESHOLD, type SoloPrice } from '../../lib/soloPricing';

/**
 * A quotation a Solo Learner can keep or pass to whoever is paying.
 *
 * It states Solo Learner pricing and nothing else: the institution rate card and the
 * institution quotation are separate and are not used here. Amounts are written "Rs.", as on our
 * receipts, because the built-in PDF fonts have no rupee sign.
 *
 * Like the institution download it is a reference, not a stored record, and the price is
 * confirmed again by the server at payment.
 */

const SAC_CODE = '998439';
const VALID_DAYS = 30;

const rs = (n: number, decimals = 2) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const quotationNumber = (d: Date) => `STMQ-S-${format(d, 'yyMMdd-HHmm')}-${Math.floor(1000 + Math.random() * 9000)}`;

export type SoloQuotationInput = {
  name?: string;
  email?: string;
  state?: string | null;
  departments: string[];
  price: SoloPrice;
};

export async function downloadSoloQuotation(q: SoloQuotationInput) {
  const logo = await loadPdfLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const today = new Date();
  const expires = addDays(today, VALID_DAYS);
  const number = quotationNumber(today);
  const L = 18, R = 192, W = R - L;
  const TEAL: [number, number, number] = [11, 110, 114];
  const INK: [number, number, number] = [15, 23, 42];
  const MUTED: [number, number, number] = [100, 116, 139];
  const { price } = q;
  const pct = Math.round(GST_RATE * 100);

  // ── Letterhead ──
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, 210, 3, 'F');
  // The seal sits at the left of the letterhead; the company block moves right to make room.
  if (logo) { try { doc.addImage(logo, 'PNG', L, 9, 22, 22); } catch { /* the quotation stands without it */ } }
  const HX = logo ? L + 26 : L;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...INK);
  doc.text(COMPANY_DETAILS.name, HX, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(logo ? 7.8 : 8.5); doc.setTextColor(...MUTED);
  doc.text(COMPANY_DETAILS.positioning, HX, 23);
  doc.text(COMPANY_DETAILS.registeredOffice, HX, 27.5);
  doc.text(`${COMPANY_DETAILS.email}  |  ${COMPANY_DETAILS.tel.join(' / ')}  |  ${COMPANY_DETAILS.website}`, HX, 32);
  doc.text(`GSTIN: ${COMPANY_DETAILS.gstin}   |   PAN: ${COMPANY_DETAILS.pan}   |   CIN: ${COMPANY_DETAILS.cin}`, HX, 36.5);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...TEAL);
  doc.text('QUOTATION', R, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(`No: ${number}`, R, 24, { align: 'right' });
  doc.text(`Date: ${format(today, 'dd MMM yyyy')}`, R, 28.5, { align: 'right' });
  doc.text(`Valid until: ${format(expires, 'dd MMM yyyy')}`, R, 33, { align: 'right' });
  doc.setDrawColor(226, 232, 240); doc.line(L, 41, R, 41);

  // ── Prepared for / Subject ──
  const stateKnown = !!q.state?.trim();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text('PREPARED FOR', L, 48);
  doc.text('SUBJECT', 112, 48);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...INK);
  doc.text(q.name || 'Solo Learner', L, 54);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let cy = 59;
  if (q.email) { doc.text(q.email, L, cy); cy += 4.5; }
  doc.text(`Place of supply: ${stateKnown ? q.state : 'To be confirmed'}`, L, cy);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  doc.text('Premium Subscription (Solo Learner)', 112, 54);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text(`${SOLO_TERM_MONTHS}-month subscription from the date of activation`, 112, 59);
  doc.setFontSize(8.8);
  ([
    ['Departments', String(price.count)],
    ['Rate per department', `${rs(price.rate, 0)} / year`],
    ['Pricing', price.bulkApplied ? `${SOLO_BULK_THRESHOLD}+ department rate` : 'Standard rate'],
  ] as [string, string][]).forEach(([label, value], i) => {
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
    body: q.departments.map((d, i) => [
      String(i + 1), `Department subscription: ${d} (${SOLO_TERM_MONTHS} months)`, SAC_CODE, '1', rs(price.rate), rs(price.rate),
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
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    margin: { left: L, right: 210 - R, top: 20, bottom: 22 },
  });

  // Every block below is measured and moved whole to the next page when it will not fit.
  const TOP = 20, BOTTOM = 297 - 22;
  const LH = 4.1;
  let y = (doc as any).lastAutoTable.finalY + 8;
  const ensure = (height: number) => { if (y + height > BOTTOM) { doc.addPage(); y = TOP; } };
  const bulletHeight = (lines: string[]) => lines.length * LH + 0.8;
  const body = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(71, 85, 105); };
  const heading = (t: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(t, L, y); y += 5; body();
  };
  const wrap = (t: string): string[] => doc.splitTextToSize(`•  ${t}`, W);

  // ── Totals, with the tax split ──
  const totalRows: [string, string][] = [
    [`Selected departments`, String(price.count)],
    [`Rate per department`, rs(price.rate)],
    ['Subtotal', rs(price.subtotal)],
  ];
  if (price.gstSplit === 'cgst-sgst') totalRows.push([`CGST @ ${pct / 2}%`, rs(price.cgst)], [`SGST @ ${pct / 2}%`, rs(price.sgst)]);
  else if (price.gstSplit === 'igst') totalRows.push([`IGST @ ${pct}%`, rs(price.igst)]);
  else totalRows.push([`GST @ ${pct}%`, rs(price.gst)]);
  ensure(totalRows.length * 5.5 + 2 + 9 + 2);

  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11.5 : 9.5);
    doc.setTextColor(...INK);
    doc.text(label, 140, y, { align: 'right' });
    doc.text(value, R, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(
    `Solo Learner pricing: ${rs(SOLO_RATE_STANDARD, 0)} per department per year for 1-${SOLO_BULK_THRESHOLD - 1} departments; ${rs(SOLO_RATE_BULK, 0)} per department per year for ${SOLO_BULK_THRESHOLD} or more, on every department.`, 82), L, y);
  doc.setTextColor(...INK);
  for (const [label, value] of totalRows) row(label, value);
  doc.setDrawColor(203, 213, 225); doc.line(108, y - 2.5, R, y - 2.5);
  y += 2;
  doc.setFillColor(238, 247, 247); doc.rect(108, y - 5.5, R - 108, 9, 'F');
  row('Grand total', rs(price.total), true);

  // ── What is included ──
  const includes = [
    `Full access to each subscribed department for ${SOLO_TERM_MONTHS} months from the date of activation.`,
    'The subscription is for your own account and is not shared with other users.',
  ].map(wrap);
  y += 5;
  body();
  ensure(5 + includes.reduce((h, l) => h + bulletHeight(l), 0));
  heading('What this includes');
  for (const lines of includes) { doc.text(lines, L, y); y += bulletHeight(lines); }

  // ── Terms ──
  const terms = [
    `This quotation is valid until ${format(expires, 'dd MMM yyyy')}. The price is held until then; the amount shown at payment is the amount charged.`,
    stateKnown
      ? `GST is charged as ${price.gstSplit === 'cgst-sgst' ? 'CGST and SGST' : 'IGST'}, as the place of supply is ${q.state}.`
      : 'GST is charged as CGST and SGST within Delhi and as IGST elsewhere, once the place of supply is confirmed.',
  ].map(wrap);
  y += 3;
  body();
  ensure(5 + bulletHeight(terms[0]) + (terms[1] ? bulletHeight(terms[1]) : 0));
  heading('Terms');
  terms.forEach(lines => { ensure(bulletHeight(lines)); body(); doc.text(lines, L, y); y += bulletHeight(lines); });

  // ── How to pay ──
  const bank = COMPANY_DETAILS.bank;
  y += 4;
  ensure(27);
  doc.setDrawColor(226, 232, 240); doc.setFillColor(250, 251, 252);
  doc.roundedRect(L, y, W, 27, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text('How to pay', L + 4, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(71, 85, 105);
  doc.text(`Pay online from your Subscription page, or by bank transfer to ${bank.accountName}.`, L + 4, y + 11.5);
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

  doc.save('STM_Digital_Library_Solo_Subscription_Quotation.pdf');
}
