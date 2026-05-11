import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { calculateGST, COMPANY_STATE } from '../lib/gstUtils';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { FileText, Download, Mail, Edit3, ChevronLeft, Printer, ShieldCheck, BookOpen } from 'lucide-react';
import { COMPANY_DETAILS } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { STM_LOGO_BASE64 } from '../logoBase64';

const createQuotationPDF = (formData: any, items: any[], gstBreakdown: any, isInterState: boolean, quotationNumber: string, date: string, validity: string) => {
  const doc = new jsPDF();
  const pdfDate = format(new Date(), 'dd-MM-yyyy');
  const pdfValidity = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'dd-MM-yyyy');

  // Add Logo
  doc.addImage(STM_LOGO_BASE64, 'PNG', 20, 10, 20, 20);

  // Company Header
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

  // Quotation Info
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTATION', 20, 52);
  
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(`Quotation No: ${quotationNumber}`, 20, 62);
  doc.text(`Date: ${pdfDate}`, 20, 67);
  doc.text(`Validity: ${pdfValidity} (30 Days)`, 20, 72);

  // Bill To
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 130, 52);
  doc.setFont('helvetica', 'normal');
  doc.text(formData.name, 130, 58);
  doc.text(formData.organization || 'Individual', 130, 63);
  doc.text(formData.address, 130, 68, { maxWidth: 60 });
  doc.text(`${formData.state} - ${formData.pincode}`, 130, 78);
  if (formData.gstNumber) doc.text(`GSTIN: ${formData.gstNumber.toUpperCase()}`, 130, 83);

  // Table
  const tableData = items.map((item, index) => [
    index + 1,
    `${item.domainName}\n(${item.planName} - ${item.duration})`,
    '1',
    `₹${item.price.toLocaleString()}`,
    `₹${item.price.toLocaleString()}`
  ]);

  (doc as any).autoTable({
    startY: 95,
    head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 100 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totals
  doc.setFontSize(9);
  doc.text('Subtotal:', 140, finalY);
  doc.text(`₹${gstBreakdown.basePrice.toLocaleString()}`, 185, finalY, { align: 'right' });

  if (isInterState) {
    doc.text('IGST (18%):', 140, finalY + 5);
    doc.text(`₹${gstBreakdown.igst.toLocaleString()}`, 185, finalY + 5, { align: 'right' });
  } else {
    doc.text('CGST (9%):', 140, finalY + 5);
    doc.text(`₹${gstBreakdown.cgst.toLocaleString()}`, 185, finalY + 5, { align: 'right' });
    doc.text('SGST (9%):', 140, finalY + 10);
    doc.text(`₹${gstBreakdown.sgst.toLocaleString()}`, 185, finalY + 10, { align: 'right' });
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Payable:', 140, finalY + 20);
  doc.text(`₹${gstBreakdown.totalAmount.toLocaleString()}`, 185, finalY + 20, { align: 'right' });

  // Bank Details
  const bankY = finalY + 35;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Bank Details (For NEFT / RTGS):', 20, bankY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Account Number: ${COMPANY_DETAILS.bank.accountNumber}`, 20, bankY + 6);
  doc.text(`Account Name: ${COMPANY_DETAILS.bank.accountName}`, 20, bankY + 11);
  doc.text(`Bank Name: ${COMPANY_DETAILS.bank.bankName}`, 20, bankY + 16);
  doc.text(`Branch: ${COMPANY_DETAILS.bank.branch}`, 20, bankY + 21);
  doc.text(`IFSC Code: ${COMPANY_DETAILS.bank.ifscCode}`, 20, bankY + 26);

  // Terms & Conditions (Summary on Page 1)
  const termsY = bankY + 40;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Terms & Conditions:', 20, termsY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('1. Subscription will be activated post-payment confirmation.', 20, termsY + 6);
  doc.text('2. All disputes are subject to Delhi jurisdiction only.', 20, termsY + 11);

  // Footer
  const footerY = 280;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`For any queries: Landline: ${COMPANY_DETAILS.tel[1]} | Mobile: ${COMPANY_DETAILS.mobile} | Email: ${COMPANY_DETAILS.email}`, 105, footerY, { align: 'center' });

  // --- PAGE 2: Terms and Conditions ---
  doc.addPage();
  
  const termsData = [
    {
      title: "1. Applicability:",
      text: "These terms and conditions shall apply to all offers, proposals and agreements made between Consortium eLearning Network Pvt. Ltd. (herein referred as CELNET) and any third party or its agent (\"the Client\") relating to the products and/or services of CELNET (\"the Products and/or Services\"). They supersede any previous supply terms and conditions."
    },
    {
      title: "2. Offer and acceptance; Description:",
      text: "Each order for the Products and Services by the Client from CELNET shall be deemed to be an offer by the Client to purchase the Products and Services subject to this T&C. No order placed by the Client shall be deemed accepted until a written acknowledgement of order is issued by CELNET."
    },
    {
      title: "3. Execution and modification of the order:",
      text: "Any modifications to the agreed product or service description, budget or schedule, as set out in the order acknowledgement, may result in an adjustment to the final price and/or delivery schedule at CELNET's discretion."
    },
    {
      title: "4. Rates and prices:",
      text: "Unless otherwise agreed by CELNET in writing the prices/rates for the Products shall be those set out in CELNET's current pricelists. All such prices/rates shall be exclusive of any handling, packing, loading, freight, transport and insurance charges."
    },
    {
      title: "5. Payment:",
      text: "Unless otherwise agreed in writing, payments shall be effected within thirty (30) days of the invoice date in the currency invoiced in advance or if agreed. Time for payment shall be of the essence. CELNET may set and vary credit limits for any Client account."
    },
    {
      title: "6. Distribution:",
      text: "The Client shall not engage in piracy, reproduction, or plagiarism of the Products or any other products of CELNET or its affiliates, nor shall it directly or indirectly facilitate any other party to engage in those activities."
    },
    {
      title: "7. Intellectual property:",
      text: "Copyright and other intellectual property rights to all CELNET proposals, publications and other Products and or Services shall remain with CELNET unless agreed otherwise in writing. The rights granted by CELNET are restricted to use solely by the Client and may not be assigned."
    },
    {
      title: "8. Liability and claims:",
      text: "TO THE MAXIMUM EXTENT PERMITTED BY RELEVANT LAWS (1) CELNET shall not be liable for any of the following losses which may arise by reason of any breach of this T&C or any implied warranty, condition or other term, any representation or any duty of any kind imposed on CELNET."
    },
    {
      title: "9. Force majeure:",
      text: "If by reason of labor dispute, strikes, inability to obtain labor or materials, fire or other action of the elements, accidents, power or telecommunications failure, customs delays, governmental restrictions or appropriation or other causes beyond the control of a party, such party is unable to perform."
    },
    {
      title: "10. Audit:",
      text: "If Client is an agent, Client shall allow Publisher's authorized representative at any reasonable time to have access to Client's premises for the purpose of inspecting Client's facilities, books and records."
    },
    {
      title: "11. Compliance with laws:",
      text: "Client shall at all times during the term strictly comply with all applicable laws, ordinances, codes, regulations, standards and judicial and administrative orders relevant to its duties, obligations and performance under this T&C."
    },
    {
      title: "12. Cancellations & Returns:",
      text: "Without prejudice to any rights the Client may have under statute as a consumer, if the Client cancels an order either fully or partially, a cancellation fee may be charged. All cancellations must be made in writing. This fee will be calculated to cover any external or internal costs which have been incurred."
    },
    {
      title: "13. General:",
      text: "The formation, existence, construction, performance, validity and all aspects of the T&C shall be governed by the law of the corporate domicile of the CELNET company which is providing the Products or Services. The parties agree to submit to the exclusive jurisdiction of the courts of that same corporate domicile."
    }
  ];

  let leftY = 20;
  let rightY = 20;

  doc.setTextColor(15, 23, 42);

  termsData.forEach((term, index) => {
    const isLeftCol = index < 6;
    let currentY = isLeftCol ? leftY : rightY;
    const xPos = isLeftCol ? 15 : 110;
    const colWidth = 85;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(term.title, xPos, currentY);
    currentY += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const splitText = doc.splitTextToSize(term.text, colWidth);
    doc.text(splitText, xPos, currentY);
    
    currentY += (splitText.length * 3) + 6;
    
    if (isLeftCol) {
      leftY = currentY;
    } else {
      rightY = currentY;
    }
  });

  return doc;
};
export function QuotationPreview() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items: cartItems, totalBasePrice: cartTotalBasePrice, clearCart } = useCart();
  const { formData, items: stateItems } = location.state || { formData: null, items: null };

  const items = stateItems || cartItems;
  const totalBasePrice = stateItems 
    ? stateItems.reduce((sum: number, item: any) => sum + item.price, 0) 
    : cartTotalBasePrice;

  if (!formData || items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">No Quotation Data Found</h2>
          <Link to="/cart" className="text-blue-600 font-bold hover:underline">Return to Cart</Link>
        </div>
      </div>
    );
  }

  const isInterState = formData.state !== COMPANY_STATE;
  const gstBreakdown = calculateGST(totalBasePrice, isInterState);
  const quotationNumber = `QTN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const date = format(new Date(), 'MMMM dd, yyyy');
  const validity = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'MMMM dd, yyyy');

  const generatePDF = () => {
    const doc = createQuotationPDF(formData, items, gstBreakdown, isInterState, quotationNumber, date, validity);
    doc.save(`Quotation_${quotationNumber}.pdf`);
    toast.success('Quotation downloaded successfully!');
  };

  const handleSendEmail = async () => {
    toast.loading('Sending quotation to email...', { id: 'send-email' });
    
    try {
      // Generate fully-featured PDF including terms and conditions page
      const pdfDoc = createQuotationPDF(formData, items, gstBreakdown, isInterState, quotationNumber, date, validity);
      const pdfBase64 = pdfDoc.output('datauristring').split(',')[1];

      const token = localStorage.getItem('token');
      const response = await fetch('/api/quotation/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userEmail: formData.email,
          userName: formData.name,
          quotationData: {
            quotationNumber,
            totalAmount: gstBreakdown.totalAmount.toLocaleString()
          },
          pdfBase64
        })
      });

      if (response.ok) {
        // The backend endpoint now handles saving the quotation to PostgreSQL


        toast.success('Quotation sent to your email!', { id: 'send-email' });
        clearCart();
        navigate('/dashboard');
      } else {
        throw new Error('Failed to send email');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to send quotation email.', { id: 'send-email' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft size={16} />
            Edit Details
          </button>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider">
              Preview Mode
            </span>
          </div>
        </div>

        {/* Quotation Document UI */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden mb-12">
          {/* Header */}
          <div className="bg-slate-900 p-12 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/logo.png" alt="STM Digital Library Logo" className="h-16 w-16 object-contain" />
                <h1 className="text-2xl font-bold tracking-tight">{COMPANY_DETAILS.name}</h1>
              </div>
              <div className="text-slate-400 text-xs space-y-1">
                <p>{COMPANY_DETAILS.address}</p>
                <p>CIN: U80302DL2005PTC138759 | GSTIN: 09AACCC6494M1Z1</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-4xl font-light tracking-widest text-slate-500 mb-2 uppercase">Quotation</h2>
              <p className="text-blue-400 font-bold">#{quotationNumber}</p>
            </div>
          </div>

          <div className="p-12">
            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Bill To:</h3>
                <div className="space-y-1">
                  <p className="text-xl font-bold text-slate-900">{formData.name}</p>
                  <p className="text-slate-600 font-medium">{formData.organization || 'Individual Researcher'}</p>
                  <p className="text-blue-600 text-xs font-bold uppercase tracking-widest">{formData.userCategory}</p>
                  <p className="text-slate-500 text-sm leading-relaxed max-w-xs mt-2">{formData.address}</p>
                  <p className="text-slate-500 text-sm">{formData.state} - {formData.pincode}</p>
                  {formData.gstNumber && (
                    <p className="text-blue-600 text-xs font-bold mt-2">GSTIN: {formData.gstNumber}</p>
                  )}
                </div>
              </div>
              <div className="md:text-right">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Date Issued:</h3>
                    <p className="text-slate-900 font-bold">{date}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Valid Until:</h3>
                    <p className="text-slate-900 font-bold">{validity}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-100 mb-8">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-500">#</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-500">Description</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-500 text-center">Qty</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-500 text-right">Rate</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-500 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-400">{index + 1}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900">{item.domainName}</p>
                        <p className="text-xs text-slate-500">{item.planName} Subscription ({item.duration})</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 text-center">1</td>
                      <td className="px-6 py-4 text-sm text-slate-600 text-right">₹{item.price.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">₹{item.price.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end gap-3 border-t border-slate-100 pt-8">
              <div className="flex justify-between w-full max-w-xs text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-bold text-slate-900">₹{gstBreakdown.basePrice.toLocaleString()}</span>
              </div>
              
              {isInterState ? (
                <div className="flex justify-between w-full max-w-xs text-sm">
                  <div className="flex flex-col">
                    <span className="text-slate-500">IGST (18%)</span>
                    <span className="text-[10px] text-slate-400 italic">Inter-state supply</span>
                  </div>
                  <span className="font-bold text-slate-900">₹{gstBreakdown.igst.toLocaleString()}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between w-full max-w-xs text-sm">
                    <div className="flex flex-col">
                      <span className="text-slate-500">CGST (9%)</span>
                      <span className="text-[10px] text-slate-400 italic">Intra-state supply</span>
                    </div>
                    <span className="font-bold text-slate-900">₹{gstBreakdown.cgst.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between w-full max-w-xs text-sm">
                    <div className="flex flex-col">
                      <span className="text-slate-500">SGST (9%)</span>
                      <span className="text-[10px] text-slate-400 italic">Intra-state supply</span>
                    </div>
                    <span className="font-bold text-slate-900">₹{gstBreakdown.sgst.toLocaleString()}</span>
                  </div>
                </>
              )}

              <div className="h-px bg-slate-200 w-full max-w-xs my-2" />
              
              <div className="flex justify-between w-full max-w-xs items-center">
                <span className="text-lg font-bold text-slate-900">Total Payable</span>
                <span className="text-2xl font-black text-blue-600">₹{gstBreakdown.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* Bank Details */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Bank Details (NEFT/RTGS):</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account Number:</span>
                    <span className="font-bold text-slate-900">{COMPANY_DETAILS.bank.accountNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account Name:</span>
                    <span className="font-bold text-slate-900">{COMPANY_DETAILS.bank.accountName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bank Name:</span>
                    <span className="font-bold text-slate-900">{COMPANY_DETAILS.bank.bankName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IFSC Code:</span>
                    <span className="font-bold text-slate-900">{COMPANY_DETAILS.bank.ifscCode}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100">
                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-4">Terms & Conditions:</h3>
                <ul className="space-y-2 text-xs text-blue-700 list-disc pl-4">
                  <li>Subscription will be activated post-payment confirmation.</li>
                  <li>All disputes are subject to Delhi jurisdiction only.</li>
                  <li>18% GST applicable as per Government of India rules.</li>
                  <li>Quotation is valid for 30 days.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 p-8 text-center border-t border-slate-100">
            <p className="text-xs text-slate-400 font-medium mb-2">
              {COMPANY_DETAILS.name} | CIN: U80302DL2005PTC138759 | GSTIN: 09AACCC6494M1Z1
            </p>
            <p className="text-[10px] text-slate-400">
              Landline: {COMPANY_DETAILS.tel[1]} | Mobile: {COMPANY_DETAILS.mobile} | Email: {COMPANY_DETAILS.email}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => navigate('/checkout', { state: { type: 'quotation', formData } })}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Edit3 size={18} />
            Edit Details
          </button>
          <button 
            onClick={generatePDF}
            className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            <Download size={18} />
            Download PDF
          </button>
          <button 
            onClick={handleSendEmail}
            className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
          >
            <Mail size={18} />
            Send to Email
          </button>
        </div>
      </div>
    </div>
  );
}
