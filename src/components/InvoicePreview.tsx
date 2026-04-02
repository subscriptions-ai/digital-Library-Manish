import React, { useState } from "react";
import { format } from "date-fns";
import { COMPANY_DETAILS } from "../config";
import { Download, Printer, Mail, CheckCircle2, Loader2 } from "lucide-react";
import { generateInvoicePDF, InvoiceData } from "../lib/invoiceGenerator";
import { toast } from "react-hot-toast";

interface InvoicePreviewProps {
  data: InvoiceData;
  onClose?: () => void;
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({ data, onClose }) => {
  const [isEmailing, setIsEmailing] = useState(false);
  const subTotal = data.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const totalGST = (subTotal * 18) / 100;
  const grandTotal = subTotal + totalGST;

  const handleDownload = () => {
    const doc = generateInvoicePDF(data);
    doc.save(`Invoice_${data.invoiceNumber}.pdf`);
  };

  const handlePrint = () => {
    const doc = generateInvoicePDF(data);
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  const handleEmail = async () => {
    setIsEmailing(true);
    try {
      const doc = generateInvoicePDF(data);
      const pdfBase64 = doc.output("datauristring").split(",")[1];

      const response = await fetch("/api/invoice/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: data.customerEmail,
          userName: data.customerName,
          invoiceData: {
            invoiceNumber: data.invoiceNumber,
            grandTotal: grandTotal.toFixed(2),
          },
          pdfBase64,
        }),
      });

      const result = await response.json();
      if (result.status === "success") {
        toast.success("Invoice emailed successfully!");
      } else {
        throw new Error(result.error || "Failed to send email");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to email invoice. Please download it instead.");
    } finally {
      setIsEmailing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 max-w-4xl mx-auto my-8">
      {/* Header Actions */}
      <div className="bg-slate-900 px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 size={20} />
          <span className="text-sm font-bold uppercase tracking-widest">Payment Successful</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleEmail}
            disabled={isEmailing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isEmailing ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
            Email Invoice
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={16} /> Download PDF
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Printer size={16} /> Print
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Invoice Content */}
      <div className="p-12" id="invoice-content">
        <div className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">{COMPANY_DETAILS.name}</h1>
            <p className="text-sm text-slate-500 max-w-xs leading-relaxed">{COMPANY_DETAILS.address}</p>
            <p className="text-sm font-bold text-slate-700 mt-2">GSTIN: {COMPANY_DETAILS.gstin}</p>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-black text-slate-200 uppercase tracking-tighter mb-4">Invoice</h2>
            <div className="space-y-1">
              <p className="text-sm text-slate-500">Invoice Number: <span className="font-bold text-slate-900">{data.invoiceNumber}</span></p>
              <p className="text-sm text-slate-500">Date: <span className="font-bold text-slate-900">{format(data.date, "dd-MMM-yyyy")}</span></p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-12 mb-12 border-t border-b border-slate-100 py-8">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Bill To:</h3>
            <p className="text-lg font-bold text-slate-900">{data.customerName}</p>
            <p className="text-sm text-slate-500">{data.customerEmail}</p>
            {data.customerAddress && <p className="text-sm text-slate-500 mt-2 max-w-xs">{data.customerAddress}</p>}
            {data.customerGSTIN && <p className="text-sm font-bold text-slate-700 mt-2">GSTIN: {data.customerGSTIN}</p>}
          </div>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Payment Details:</h3>
            <div className="space-y-2">
              <p className="text-sm text-slate-600 flex justify-between"><span>Account Name:</span> <span className="font-medium text-slate-900">{COMPANY_DETAILS.bank.accountName}</span></p>
              <p className="text-sm text-slate-600 flex justify-between"><span>Account Number:</span> <span className="font-medium text-slate-900">{COMPANY_DETAILS.bank.accountNumber}</span></p>
              <p className="text-sm text-slate-600 flex justify-between"><span>Bank Name:</span> <span className="font-medium text-slate-900">{COMPANY_DETAILS.bank.bankName}</span></p>
              <p className="text-sm text-slate-600 flex justify-between"><span>IFSC Code:</span> <span className="font-medium text-slate-900">{COMPANY_DETAILS.bank.ifscCode}</span></p>
            </div>
          </div>
        </div>

        <table className="w-full mb-12">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left">
              <th className="py-4 text-sm font-bold uppercase tracking-wider text-slate-900">Description</th>
              <th className="py-4 text-sm font-bold uppercase tracking-wider text-slate-900 text-center">Qty</th>
              <th className="py-4 text-sm font-bold uppercase tracking-wider text-slate-900 text-right">Unit Price</th>
              <th className="py-4 text-sm font-bold uppercase tracking-wider text-slate-900 text-right">Taxable Value</th>
              <th className="py-4 text-sm font-bold uppercase tracking-wider text-slate-900 text-center">GST %</th>
              <th className="py-4 text-sm font-bold uppercase tracking-wider text-slate-900 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((item, index) => {
              const taxableValue = item.quantity * item.unitPrice;
              const total = taxableValue * 1.18;
              return (
                <tr key={index}>
                  <td className="py-6 text-sm font-medium text-slate-900">{item.description}</td>
                  <td className="py-6 text-sm text-slate-500 text-center">{item.quantity}</td>
                  <td className="py-6 text-sm text-slate-500 text-right">₹{item.unitPrice.toFixed(2)}</td>
                  <td className="py-6 text-sm text-slate-500 text-right">₹{taxableValue.toFixed(2)}</td>
                  <td className="py-6 text-sm text-slate-500 text-center">18%</td>
                  <td className="py-6 text-sm font-bold text-slate-900 text-right">₹{total.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-80 space-y-3">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Sub Total:</span>
              <span className="font-medium text-slate-900">₹{subTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>CGST (9%):</span>
              <span className="font-medium text-slate-900">₹{(totalGST / 2).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>SGST (9%):</span>
              <span className="font-medium text-slate-900">₹{(totalGST / 2).toFixed(2)}</span>
            </div>
            <div className="pt-3 border-t-2 border-slate-100 flex justify-between items-center">
              <span className="text-lg font-bold text-slate-900">Grand Total:</span>
              <span className="text-2xl font-black text-blue-600">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-20 pt-12 border-t border-slate-100 grid grid-cols-2 gap-12">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Terms & Conditions:</h4>
            <ul className="text-[10px] text-slate-400 space-y-1 list-disc pl-4">
              <li>This is a digital subscription service.</li>
              <li>Subscription is valid for the period mentioned in the plan.</li>
              <li>No refunds will be provided after access is granted.</li>
              <li>All disputes are subject to Noida jurisdiction.</li>
            </ul>
          </div>
          <div className="text-center flex flex-col items-center justify-end">
            <div className="w-48 border-b border-slate-300 mb-2"></div>
            <p className="text-xs font-bold text-slate-900">Authorized Signatory</p>
            <p className="text-[10px] text-slate-400 mt-1">Dhruv Infosystems Private Limited</p>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="bg-slate-50 px-8 py-6 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">
          Thank you for choosing Journals Library. For any queries, please email <span className="text-blue-600 font-medium">{COMPANY_DETAILS.email}</span>
        </p>
      </div>
    </div>
  );
};
