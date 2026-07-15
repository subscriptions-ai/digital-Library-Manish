import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { COMPANY_DETAILS } from '../config';
import { COMPANY_STATE } from './gstUtils';
import { STM_LOGO_BASE64 } from '../logoBase64';

/**
 * Receipt PDF generator.
 *
 * Deliberately mirrors the QUOTATION template (src/components/QuotationPreview.tsx →
 * createQuotationPDF) so a receipt looks identical to the quotation the customer received —
 * only the labels change: "QUOTATION" → "RECEIPT", "Quotation No" → "Receipt No", and the
 * bank block becomes a payment-details block.
 *
 * Input is a Receipt record (from the DB / the create-receipt API response).
 */

interface ReceiptItem {
  domainName?: string;
  domain?: string;
  contentType?: string;
  planName?: string;
  duration?: string;
  price?: number;
  amount?: number;
}

interface ReceiptRecord {
  receiptNumber: string;
  userName: string;
  organization?: string | null;
  state?: string | null;
  address?: string | null;
  pincode?: string | null;
  gstNumber?: string | null;
  userCategory?: string | null;
  items: ReceiptItem[] | any;
  subtotal: number;
  gstAmount: number;
  total: number;
  discountAmount?: number | null;
  couponCode?: string | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
  paymentDate?: string | Date | null;
}

const inr = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;

const itemDescription = (item: ReceiptItem) => {
  const main = item.domainName || item.domain || item.contentType || 'Subscription';
  const parts = [item.planName, item.duration].filter(Boolean).join(' - ');
  return parts ? `${main}\n(${parts})` : main;
};

export function generateReceiptPDF(receipt: ReceiptRecord): jsPDF {
  const doc = new jsPDF();

  const items: ReceiptItem[] = Array.isArray(receipt.items) ? receipt.items : [];
  const isInterState = (receipt.state || '') !== COMPANY_STATE;
  const discount = receipt.discountAmount || 0;
  const gst = receipt.gstAmount || 0;
  const paymentDate = receipt.paymentDate ? new Date(receipt.paymentDate) : new Date();
  const pdfDate = format(paymentDate, 'dd-MM-yyyy');

  // ── Logo + Company Header ─────────────────────────────────────────
  doc.addImage(STM_LOGO_BASE64, 'PNG', 20, 10, 20, 20);
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_DETAILS.name, 105, 20, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(COMPANY_DETAILS.address, 105, 26, { align: 'center' });
  doc.text('CIN No.: U80302DL2005PTC138759 | IEC Code: AACCC6494M | PAN No.: AACCC6494M', 105, 31, { align: 'center' });
  doc.text('GSTIN: 09AACCC6494M1Z1', 105, 36, { align: 'center' });

  doc.setDrawColor(226, 232, 240);
  doc.line(20, 42, 190, 42);

  // ── Receipt Info (was "QUOTATION") ────────────────────────────────
  doc.setFontSize(14);
  doc.setTextColor(5, 150, 105); // emerald — signals a paid receipt
  doc.setFont('helvetica', 'bold');
  doc.text('RECEIPT', 20, 52);

  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(`Receipt No: ${receipt.receiptNumber}`, 20, 62);
  doc.text(`Payment Date: ${pdfDate}`, 20, 67);
  doc.text(`Payment Method: ${receipt.paymentMethod || 'Bank Transfer'}`, 20, 72);
  if (receipt.paymentRef) doc.text(`Reference: ${receipt.paymentRef}`, 20, 77);

  // ── Bill To ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 130, 52);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.userName || '', 130, 58);
  doc.text(receipt.organization || 'Individual', 130, 63);
  if (receipt.address) doc.text(receipt.address, 130, 68, { maxWidth: 60 });
  doc.text(`${receipt.state || ''}${receipt.pincode ? ' - ' + receipt.pincode : ''}`, 130, 78);
  if (receipt.gstNumber) doc.text(`GSTIN: ${receipt.gstNumber.toUpperCase()}`, 130, 83);

  // ── Items table ───────────────────────────────────────────────────
  const tableData = items.map((item, index) => {
    const price = item.price ?? item.amount ?? 0;
    return [
      index + 1,
      itemDescription(item),
      '1',
      inr(price),
      inr(price),
    ];
  });

  autoTable(doc, {
    startY: 95,
    head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 100 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // ── Totals ────────────────────────────────────────────────────────
  let y = finalY;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', 140, y);
  doc.text(inr(receipt.subtotal), 185, y, { align: 'right' });

  if (discount > 0) {
    y += 5;
    doc.text(`Discount${receipt.couponCode ? ` (${receipt.couponCode})` : ''}:`, 140, y);
    doc.text(`-${inr(discount)}`, 185, y, { align: 'right' });
  }

  if (isInterState) {
    y += 5;
    doc.text('IGST (18%):', 140, y);
    doc.text(inr(gst), 185, y, { align: 'right' });
  } else {
    y += 5;
    doc.text('CGST (9%):', 140, y);
    doc.text(inr(gst / 2), 185, y, { align: 'right' });
    y += 5;
    doc.text('SGST (9%):', 140, y);
    doc.text(inr(gst / 2), 185, y, { align: 'right' });
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text('Amount Paid:', 140, y + 10);
  doc.text(inr(receipt.total), 185, y + 10, { align: 'right' });
  doc.setTextColor(15, 23, 42);

  // "PAID" badge
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(20, y - 2, 34, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('PAID', 37, y + 6, { align: 'center' });
  doc.setTextColor(15, 23, 42);

  // ── Payment Details (was Bank Details) ────────────────────────────
  const payY = y + 25;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Details:', 20, payY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Payment Method: ${receipt.paymentMethod || 'Bank Transfer'}`, 20, payY + 6);
  if (receipt.paymentRef) doc.text(`Transaction / Reference: ${receipt.paymentRef}`, 20, payY + 11);
  doc.text(`Payment Date: ${pdfDate}`, 20, payY + 16);
  doc.text(`Received By: ${COMPANY_DETAILS.bank.accountName}`, 20, payY + 21);

  // ── Note ──────────────────────────────────────────────────────────
  const noteY = payY + 34;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Note:', 20, noteY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('1. This is a computer-generated payment receipt and does not require a signature.', 20, noteY + 6);
  doc.text('2. Subscription access is activated as per the agreed plan terms.', 20, noteY + 11);

  // ── Footer ────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    `For any queries: Landline: ${COMPANY_DETAILS.tel[1]} | Mobile: ${COMPANY_DETAILS.mobile} | Email: ${COMPANY_DETAILS.email}`,
    105,
    280,
    { align: 'center' }
  );

  return doc;
}
