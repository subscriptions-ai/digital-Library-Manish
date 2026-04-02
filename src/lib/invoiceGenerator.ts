import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format } from "date-fns";
import { COMPANY_DETAILS } from "../config";

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  customerName: string;
  customerEmail: string;
  customerAddress?: string;
  customerGSTIN?: string;
  items: InvoiceItem[];
}

export const generateInvoicePDF = (data: InvoiceData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 20;

  // Header - Company Logo/Name
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_DETAILS.name, margin, 30);

  // TAX INVOICE Label
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.setFont("helvetica", "normal");
  doc.text("TAX INVOICE", pageWidth - margin - 25, 30);

  // Company Details
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(COMPANY_DETAILS.address, margin, 38);
  doc.text(`GSTIN: ${COMPANY_DETAILS.gstin}`, margin, 43);
  doc.text(`Email: ${COMPANY_DETAILS.email}`, margin, 48);
  doc.text(`Tel: ${COMPANY_DETAILS.tel.join(", ")}`, margin, 53);

  // Invoice Meta Info
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice Details", pageWidth - margin - 60, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Invoice No: ${data.invoiceNumber}`, pageWidth - margin - 60, 55);
  doc.text(`Date: ${format(data.date, "dd-MMM-yyyy")}`, pageWidth - margin - 60, 60);

  // Bill To Section
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", margin, 75);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(data.customerName, margin, 82);
  doc.text(data.customerEmail, margin, 87);
  if (data.customerAddress) {
    const splitAddress = doc.splitTextToSize(data.customerAddress, 80);
    doc.text(splitAddress, margin, 92);
  }
  if (data.customerGSTIN) {
    doc.text(`GSTIN: ${data.customerGSTIN}`, margin, 105);
  }

  // Table
  const tableData = data.items.map((item) => {
    const taxableValue = item.quantity * item.unitPrice;
    const gstRate = 18;
    const gstAmount = (taxableValue * gstRate) / 100;
    const total = taxableValue + gstAmount;

    return [
      item.description,
      item.quantity,
      item.unitPrice.toFixed(2),
      taxableValue.toFixed(2),
      `${gstRate}%`,
      gstAmount.toFixed(2),
      total.toFixed(2),
    ];
  });

  const subTotal = data.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const totalGST = (subTotal * 18) / 100;
  const grandTotal = subTotal + totalGST;

  (doc as any).autoTable({
    startY: 115,
    head: [["Description", "Qty", "Unit Price", "Taxable Value", "GST %", "GST Amt", "Total"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "center" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totals
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Sub Total:", pageWidth - margin - 60, finalY);
  doc.text(subTotal.toFixed(2), pageWidth - margin, finalY, { align: "right" });

  doc.text("CGST (9%):", pageWidth - margin - 60, finalY + 5);
  doc.text((totalGST / 2).toFixed(2), pageWidth - margin, finalY + 5, { align: "right" });

  doc.text("SGST (9%):", pageWidth - margin - 60, finalY + 10);
  doc.text((totalGST / 2).toFixed(2), pageWidth - margin, finalY + 10, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Grand Total:", pageWidth - margin - 60, finalY + 18);
  doc.text(`INR ${grandTotal.toFixed(2)}`, pageWidth - margin, finalY + 18, { align: "right" });

  // Bank Details
  const bankY = finalY + 40;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Bank Details for Payment:", margin, bankY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Account Name: ${COMPANY_DETAILS.bank.accountName}`, margin, bankY + 7);
  doc.text(`Account Number: ${COMPANY_DETAILS.bank.accountNumber}`, margin, bankY + 12);
  doc.text(`Bank: ${COMPANY_DETAILS.bank.bankName}, ${COMPANY_DETAILS.bank.branch}`, margin, bankY + 17);
  doc.text(`IFSC Code: ${COMPANY_DETAILS.bank.ifscCode}`, margin, bankY + 22);

  // Footer / Signatory
  doc.setFontSize(9);
  doc.text("For Dhruv Infosystems Private Limited", pageWidth - margin - 60, bankY + 30, { align: "center" });
  doc.text("(Authorized Signatory)", pageWidth - margin - 60, bankY + 50, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("This is a computer-generated invoice and does not require a physical signature.", pageWidth / 2, 285, { align: "center" });

  return doc;
};
