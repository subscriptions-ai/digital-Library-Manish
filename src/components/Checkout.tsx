import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { calculateGST, INDIAN_STATES, COMPANY_STATE } from '../lib/gstUtils';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { CreditCard, FileText, ChevronLeft, ShieldCheck, Building2, User, Mail, MapPin, Trash2, Tag } from 'lucide-react';
import { COMPANY_DETAILS } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { InvoicePreview } from './InvoicePreview';
import { InvoiceData } from '../lib/invoiceGenerator';

export function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items: cartItems, totalBasePrice: cartTotalBasePrice, clearCart, appliedCoupon, applyCoupon, removeCoupon } = useCart();
  const locationState = location.state || { type: 'payment', selectedState: COMPANY_STATE, userCategory: 'Academic' };
  const { type, selectedState: initialSelectedState, userCategory: initialUserCategory, items: stateItems, formData: stateFormData } = locationState;
  
  const couponCode = appliedCoupon?.code || null;
  const discountAmount = appliedCoupon?.discount || 0;
  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: stateFormData?.name || '',
    email: stateFormData?.email || '',
    organization: stateFormData?.organization || '',
    address: stateFormData?.address || '',
    state: stateFormData?.state || initialSelectedState || COMPANY_STATE,
    pincode: stateFormData?.pincode || '',
    gstNumber: stateFormData?.gstNumber || '',
    userCategory: stateFormData?.userCategory || initialUserCategory || 'Student',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [paymentId, setPaymentId] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');

  // Determine which items to use: state items (from QuotationWizard) or cart items
  const items = stateItems || cartItems;
  const totalBasePrice = stateItems 
    ? stateItems.reduce((sum: number, item: any) => sum + item.price, 0) 
    : cartTotalBasePrice;

  const handleApplyCoupon = async () => {
    if (!couponInput) return;
    setCouponLoading(true);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput, orderAmount: totalBasePrice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid coupon');
      applyCoupon({ id: data.couponId, discount: data.discount, code: couponInput.toUpperCase() });
      toast.success('Coupon applied successfully!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCouponLoading(false);
    }
  };

  const discountedBasePrice = Math.max(0, totalBasePrice - discountAmount);
  const isInterState = formData.state !== COMPANY_STATE;
  const gstBreakdown = calculateGST(discountedBasePrice, isInterState);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const generateQuotationPDF = async () => {
    const doc = new jsPDF();
    const quotationNumber = `QTN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const date = format(new Date(), 'dd-MM-yyyy');
    const validity = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'dd-MM-yyyy');

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
    doc.text(`Date: ${date}`, 20, 67);
    doc.text(`Validity: ${validity} (30 Days)`, 20, 72);

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
    doc.text(`₹${totalBasePrice.toLocaleString()}`, 185, finalY, { align: 'right' });
    let currentY = finalY;
    if (couponCode) {
      currentY += 5;
      doc.text(`Discount (${couponCode}):`, 140, currentY);
      doc.text(`-₹${discountAmount.toLocaleString()}`, 185, currentY, { align: 'right' });
    }

    if (isInterState) {
      doc.text('IGST (18%):', 140, currentY + 5);
      doc.text(`₹${gstBreakdown.igst.toLocaleString()}`, 185, currentY + 5, { align: 'right' });
      currentY += 5;
    } else {
      doc.text('CGST (9%):', 140, currentY + 5);
      doc.text(`₹${gstBreakdown.cgst.toLocaleString()}`, 185, currentY + 5, { align: 'right' });
      doc.text('SGST (9%):', 140, currentY + 10);
      doc.text(`₹${gstBreakdown.sgst.toLocaleString()}`, 185, currentY + 10, { align: 'right' });
      currentY += 10;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Payable:', 140, currentY + 10);
    doc.text(`₹${gstBreakdown.totalAmount.toLocaleString()}`, 185, currentY + 10, { align: 'right' });

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

    // Terms & Conditions
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

    return { doc, quotationNumber };
  };

  const handleQuotation = async () => {
    if (!formData.name || !formData.email || !formData.address) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (gstBreakdown.totalAmount <= 0) {
      toast.error('Invalid amount. Please check quotation.');
      return;
    }
    
    // Instead of generating and sending immediately, we go to preview
    navigate('/quotation-preview', { state: { formData, items } });
  };

  const handlePayment = async () => {
    if (!formData.name || !formData.email || !formData.address) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (gstBreakdown.totalAmount <= 0) {
      toast.error('Invalid amount. Please check quotation.');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/payment/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: gstBreakdown.totalAmount,
          receipt: `receipt_${Date.now()}`
        })
      });

      const order = await response.json();

      if (order.isMock) {
        // Automatically bypass standard payment gateway flow for local development
        const toastId = toast.loading("Razorpay keys missing. Simulating success for local testing...", { id: "mock-payment" });
        
        setTimeout(async () => {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: order.id,
                razorpay_payment_id: `pay_mock_${Date.now()}`,
                razorpay_signature: `sig_mock_${Date.now()}`,
                amount: gstBreakdown.totalAmount,
                items: items,
                userId: user?.uid || null,
                guestData: formData,
                couponCode,
                discountAmount
              })
            });
            
            const verifyData = await verifyRes.json();
            toast.dismiss(toastId);
            
            if (verifyData.status === 'success') {
              toast.success('Mock Payment successful! Access activated.');
              setPaymentId('sim_pay_' + Math.random().toString(36).substring(7));
              setOrderId('sim_ord_' + Math.random().toString(36).substring(7));
              
              // Prepare Invoice Data
              const newInvoiceData: InvoiceData = {
                invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
                date: new Date(),
                customerName: formData.name,
                customerEmail: formData.email,
                customerAddress: `${formData.address}, ${formData.state} - ${formData.pincode}`,
                customerGSTIN: formData.gstNumber,
                items: items.map(item => ({
                  description: `${item.domainName} (${item.planName} - ${item.duration})`,
                  quantity: 1,
                  unitPrice: item.price
                })),
                couponCode,
                discountAmount
              };
              
              setInvoiceData(newInvoiceData);
              setShowInvoice(true);
              clearCart();
            } else {
              toast.error('Mock payment verification failed.');
            }
          } catch (err) {
            toast.dismiss(toastId);
            toast.error('Failed to complete simulated payment.');
          } finally {
            setIsProcessing(false);
          }
        }, 1200);
        return;
      }

      const options = {
        key: order.razorpayKey || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: 'STM Digital Library',
        description: 'Subscription Purchase',
        handler: async (response: any) => {
          const verifyRes = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...response,
              amount: gstBreakdown.totalAmount,
              items: items,
              userId: user?.uid || null,
              guestData: formData,
              couponCode,
              discountAmount
            })
          });
          const verifyData = await verifyRes.json();
            if (verifyData.status === 'success') {
              toast.success('Payment successful! Access activated.');
              setPaymentId(response.razorpay_payment_id || '');
              setOrderId(response.razorpay_order_id || '');
              
              // Prepare Invoice Data
            const newInvoiceData: InvoiceData = {
              invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
              date: new Date(),
              customerName: formData.name,
              customerEmail: formData.email,
              customerAddress: `${formData.address}, ${formData.state} - ${formData.pincode}`,
              customerGSTIN: formData.gstNumber,
              items: items.map(item => ({
                description: `${item.domainName} (${item.planName} - ${item.duration})`,
                quantity: 1,
                unitPrice: item.price
              })),
              couponCode,
              discountAmount
            };
            
            setInvoiceData(newInvoiceData);
            setShowInvoice(true);
            clearCart();
          } else {
            toast.error('Payment verification failed.');
          }
        },
        prefill: {
          name: formData.name,
          email: formData.email,
          contact: ''
        },
        theme: { color: '#2563eb' }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error(error);
      toast.error('Payment initialization failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (showInvoice && invoiceData) {
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-slate-900">Your Subscription Invoice</h1>
            <button 
              onClick={() => navigate('/dashboard')}
              className="text-sm font-bold text-blue-600 hover:text-blue-700"
            >
              Go to Dashboard
            </button>
          </div>
          <InvoicePreview 
            data={invoiceData} 
            onClose={() => navigate('/dashboard')} 
            rawItems={items}
            paymentId={paymentId}
            orderId={orderId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Link to="/cart" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 mb-8 transition-colors">
          <ChevronLeft size={16} />
          Back to Cart
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                {type === 'payment' ? <CreditCard className="text-blue-600" /> : <FileText className="text-blue-600" />}
                {type === 'payment' ? 'Checkout Details' : 'Quotation Details'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" name="name" required
                      value={formData.name} onChange={handleInputChange}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="email" name="email" required
                      value={formData.email} onChange={handleInputChange}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Organization / Institution Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" name="organization"
                      value={formData.organization} onChange={handleInputChange}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="University of Mumbai"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Billing Address *</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-4 text-slate-400" size={18} />
                    <textarea 
                      name="address" required rows={3}
                      value={formData.address} onChange={handleInputChange}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="123, Academic Plaza, MG Road..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">State *</label>
                  <select 
                    name="state" required
                    value={formData.state} onChange={handleInputChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {INDIAN_STATES.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Pincode *</label>
                  <input 
                    type="text" name="pincode" required
                    value={formData.pincode} onChange={handleInputChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="400001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">GST Number (Optional)</label>
                  <input 
                    type="text" name="gstNumber"
                    value={formData.gstNumber} onChange={handleInputChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="27AAACS1234A1Z5"
                  />
                </div>
              </div>

              <div className="mt-12 p-6 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-4">
                <ShieldCheck className="text-green-600 shrink-0" size={24} />
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your data is secure. We follow strict data protection guidelines and use encrypted connections for all transactions.
                </p>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 sticky top-24">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Order Summary</h2>
              
              <div className="space-y-4 mb-8">
                {items.map(item => (
                  <div key={item.domainId} className="flex justify-between text-sm">
                    <span className="text-slate-600">{item.domainName}</span>
                    <span className="font-bold text-slate-900">₹{item.price.toLocaleString()}</span>
                  </div>
                ))}
                
                <div className="h-px bg-slate-100 my-4" />
                
                {/* Coupon Input in Checkout */}
                {!couponCode ? (
                  <div className="flex gap-2 my-4">
                    <input 
                      type="text" 
                      placeholder="Coupon Code" 
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      className="flex-1 rounded-xl border-slate-200 bg-slate-50 py-2 px-3 text-sm focus:border-blue-500 outline-none uppercase"
                    />
                    <button 
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponInput}
                      className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={removeCoupon}
                    className="text-[10px] text-red-500 hover:underline mb-2 flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Remove Coupon
                  </button>
                )}

                <div className="flex justify-between text-slate-600 text-sm">
                  <span>Subtotal</span>
                  <span>₹{totalBasePrice.toLocaleString()}</span>
                </div>
                
                {couponCode && (
                  <div className="flex justify-between text-green-600 text-sm font-semibold">
                    <span>Discount ({couponCode})</span>
                    <span>-₹{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                
                {isInterState ? (
                  <div className="flex justify-between text-slate-600 text-sm">
                    <div className="flex flex-col">
                      <span>IGST (18%)</span>
                      <span className="text-[10px] text-slate-400 italic">Inter-state supply</span>
                    </div>
                    <span>₹{gstBreakdown.igst.toLocaleString()}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-600 text-sm">
                      <div className="flex flex-col">
                        <span>CGST (9%)</span>
                        <span className="text-[10px] text-slate-400 italic">Intra-state supply</span>
                      </div>
                      <span>₹{gstBreakdown.cgst.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 text-sm">
                      <div className="flex flex-col">
                        <span>SGST (9%)</span>
                        <span className="text-[10px] text-slate-400 italic">Intra-state supply</span>
                      </div>
                      <span>₹{gstBreakdown.sgst.toLocaleString()}</span>
                    </div>
                  </>
                )}
                
                <div className="h-px bg-slate-100 my-4" />
                
                <div className="flex justify-between text-xl font-bold text-slate-900">
                  <span>Total</span>
                  <span>₹{gstBreakdown.totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <button 
                onClick={type === 'payment' ? handlePayment : handleQuotation}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : (type === 'payment' ? 'Complete Payment' : 'Generate & Send Quotation')}
              </button>

              <p className="mt-6 text-center text-xs text-slate-400">
                “18% GST applicable as per GOI rules”
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
