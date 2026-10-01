import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { COMPANY_DETAILS } from '../../../config';
import { GST_RATE, INCLUDED_SEATS, TERM_MONTHS } from '../../../lib/institutionPricing';

/**
 * A one-page quotation a librarian can take to their finance office.
 *
 * It carries the same numbers the screen showed — the server's quote when there was one —
 * and says plainly that the price is confirmed again at payment. The built-in PDF fonts have
 * no rupee sign, so amounts are written "Rs.", as on our receipts.
 */

const rs = (n: number, decimals = 2) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

/** The built-in fonts draw "₹" as a stray glyph; notes built from on-screen copy are rewritten. */
const pdfSafe = (s: string) => s.replace(/₹\s?/g, 'Rs. ');

export type QuotationInput = {
  institution?: string;
  preparedFor?: string;
  title: string;
  lines: { description: string; quantity: number; rate: number }[];
  base: number;
  gst: number;
  total: number;
  notes: string[];
  fileName: string;
};

export function downloadQuotation(q: QuotationInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const today = new Date();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(COMPANY_DETAILS.name, 20, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100);
  doc.text(COMPANY_DETAILS.positioning, 20, 27);
  doc.text(`${COMPANY_DETAILS.email}  |  ${COMPANY_DETAILS.tel.join(' / ')}  |  ${COMPANY_DETAILS.website}`, 20, 31.5);

  doc.setDrawColor(226, 232, 240);
  doc.line(20, 37, 190, 37);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(11, 110, 114);
  doc.text('QUOTATION', 20, 47);
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(q.title, 20, 53.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date: ${format(today, 'dd-MM-yyyy')}`, 190, 47, { align: 'right' });
  doc.text(`Valid for 30 days`, 190, 52, { align: 'right' });

  let y = 63;
  doc.setFont('helvetica', 'bold');
  doc.text('PREPARED FOR', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(q.institution || 'Your institution', 20, y + 5.5);
  if (q.preparedFor) doc.text(q.preparedFor, 20, y + 10.5);
  y += 18;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Qty', 'Rate / year', 'Amount']],
    body: q.lines.map((l, i) => [String(i + 1), pdfSafe(l.description), String(l.quantity), rs(l.rate, 0), rs(l.quantity * l.rate, 0)]),
    theme: 'grid',
    headStyles: { fillColor: [11, 110, 114], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right', cellWidth: 16 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 32 } },
    margin: { left: 20, right: 20 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9.5);
    doc.text(label, 140, y, { align: 'right' });
    doc.text(value, 190, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  row('Subtotal', rs(q.base));
  row(`GST @ ${Math.round(GST_RATE * 100)}%`, rs(q.gst));
  doc.setDrawColor(203, 213, 225);
  doc.line(110, y - 2.5, 190, y - 2.5);
  y += 2;
  row('Total payable', rs(q.total), true);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Terms', 20, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const terms = [
    ...q.notes,
    `Every purchase runs ${TERM_MONTHS} months from the date it is paid for.`,
    `A department subscription includes ${INCLUDED_SEATS} users: the librarian and ${INCLUDED_SEATS - 1} more.`,
    'Prices are confirmed again at payment; the amount shown before you pay is the amount charged.',
  ];
  for (const t of terms) {
    const wrapped = doc.splitTextToSize(`- ${pdfSafe(t)}`, 170);
    doc.text(wrapped, 20, y);
    y += wrapped.length * 4.2 + 1;
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Questions? Write to ${COMPANY_DETAILS.email}`, 105, 285, { align: 'center' });

  doc.save(q.fileName);
}
