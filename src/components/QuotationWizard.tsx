import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  MapPin, 
  Building2, 
  Phone, 
  Mail, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  FileText, 
  Download, 
  Send, 
  CreditCard,
  LayoutGrid,
  Calendar,
  Users,
  ShieldCheck,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { DOMAINS, SUBSCRIPTION_PLANS } from '../constants';
import { COMPANY_DETAILS } from '../config';
import { calculateGST, COMPANY_STATE, INDIAN_STATES } from '../lib/gstUtils';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';

type Step = 1 | 2 | 3;

interface FormData {
  fullName: string;
  mobile: string;
  email: string;
  organization: string;
  address: string;
  pincode: string;
  city: string;
  state: string;
  gstNumber: string;
  selectedDepartments: string[];
  subscriptionPlanId: string;
  duration: string;
  userCategory: string;
}

const USER_CATEGORIES = ['Student', 'College', 'University', 'Corporate'];
const DURATIONS = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

export function QuotationWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    mobile: '',
    email: '',
    organization: '',
    address: '',
    pincode: '',
    city: '',
    state: '',
    gstNumber: '',
    selectedDepartments: [],
    subscriptionPlanId: SUBSCRIPTION_PLANS[0].id,
    duration: 'Yearly',
    userCategory: 'Student'
  });

  const [isPincodeLoading, setIsPincodeLoading] = useState(false);

  // Auto-fill city/state based on pincode
  useEffect(() => {
    if (formData.pincode.length === 6) {
      const fetchPincodeData = async () => {
        setIsPincodeLoading(true);
        try {
          const response = await fetch(`https://api.postalpincode.in/pincode/${formData.pincode}`);
          const data = await response.json();
          if (data[0].Status === 'Success') {
            const postOffice = data[0].PostOffice[0];
            setFormData(prev => ({
              ...prev,
              city: postOffice.District,
              state: postOffice.State
            }));
            toast.success(`Location identified: ${postOffice.District}, ${postOffice.State}`);
          }
        } catch (error) {
          console.error('Pincode fetch error:', error);
        } finally {
          setIsPincodeLoading(false);
        }
      };
      fetchPincodeData();
    }
  }, [formData.pincode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleDepartment = (id: string) => {
    setFormData(prev => {
      const isSelected = prev.selectedDepartments.includes(id);
      if (isSelected) {
        return { ...prev, selectedDepartments: prev.selectedDepartments.filter(d => d !== id) };
      } else {
        return { ...prev, selectedDepartments: [...prev.selectedDepartments, id] };
      }
    });
  };

  const validateStep1 = () => {
    const { fullName, mobile, email, address, pincode, city, state } = formData;
    if (!fullName || !mobile || !email || !address || !pincode || !city || !state) {
      toast.error('Please fill all required fields');
      return false;
    }
    if (!/^\d{10}$/.test(mobile)) {
      toast.error('Invalid mobile number');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      toast.error('Invalid email address');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (formData.selectedDepartments.length === 0) {
      toast.error('Please select at least one department');
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const prevStep = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  // Pricing Logic
  const selectedPlan = SUBSCRIPTION_PLANS.find(p => p.id === formData.subscriptionPlanId);
  const basePricePerDept = selectedPlan?.pricing.find(pr => pr.duration === formData.duration)?.price || 0;
  const totalBasePrice = basePricePerDept * formData.selectedDepartments.length;
  const isInterState = formData.state !== COMPANY_STATE;
  const gstBreakdown = calculateGST(totalBasePrice, isInterState);

  const generatePDF = () => {
    const doc = new jsPDF();
    const quotationNumber = `QTN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const pdfDate = format(new Date(), 'dd-MMM-yyyy');
    const pdfValidity = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'dd-MMM-yyyy');

    // Top Header
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('QUOTATION', 20, 10);
    doc.text('SUBJECTED TO DELHI JURISDICTION.', 190, 10, { align: 'right' });

    // Company Logo & Name
    doc.setFontSize(20);
    doc.text(COMPANY_DETAILS.name, 105, 25, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${COMPANY_DETAILS.address} - 201301`, 105, 30, { align: 'center' });

    // Info Box
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.rect(20, 35, 170, 25); // Main box
    doc.line(65, 35, 65, 60); // Vertical line 1
    doc.line(135, 35, 135, 60); // Vertical line 2

    // Quotation Info (Left)
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('QUOTATION NUMBER :', 22, 40);
    doc.setFont('helvetica', 'normal');
    doc.text(quotationNumber, 22, 44);
    doc.setFont('helvetica', 'bold');
    doc.text('QUOTATION DATE :', 22, 52);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfDate, 22, 56);

    // Bank Details (Middle)
    doc.setFont('helvetica', 'bold');
    doc.text('BANK DETAILS:', 67, 40);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Bank Name : ${COMPANY_DETAILS.bank.bankName}`, 67, 44);
    doc.text(`A/C. Number : ${COMPANY_DETAILS.bank.accountNumber}`, 67, 47);
    doc.text(`IFSC Code : ${COMPANY_DETAILS.bank.ifscCode}`, 67, 50);
    doc.text('Swift Code : HDFCINBBXXX', 67, 53);
    doc.text(`A/C. Holder : ${COMPANY_DETAILS.bank.accountName}`, 67, 56);

    // Company Reg Info (Right)
    doc.setFontSize(7);
    doc.text('GSTIN :', 137, 40);
    doc.text('09AACCC6494M1Z1', 155, 40);
    doc.text('PAN No. :', 137, 44);
    doc.text('AACCC6494M', 155, 44);
    doc.text('CIN No. :', 137, 48);
    doc.text('U80302DL2005PTC138759', 155, 48);
    doc.text('LEGAL NAME:', 137, 52);
    doc.text(COMPANY_DETAILS.name, 137, 56, { maxWidth: 30 });

    // Billed To
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Billed To / Details of Receiver:', 20, 70);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name : ${formData.fullName}`, 25, 76);
    doc.text(`Address : ${formData.address}`, 25, 81, { maxWidth: 100 });
    doc.text(`City/State/Country : ${formData.city}, ${formData.state} - ${formData.pincode}, India`, 25, 91);
    if (formData.gstNumber) {
      doc.text(`GSTIN : ${formData.gstNumber.toUpperCase()}`, 140, 91);
    }

    // Items Table
    const tableData = formData.selectedDepartments.map((deptId, index) => {
      const dept = DOMAINS.find(d => d.id === deptId);
      return [
        index + 1,
        `${dept?.name} (${selectedPlan?.name} - ${formData.duration})`,
        '9901', // HSN Placeholder
        '1',
        basePricePerDept.toFixed(2),
        basePricePerDept.toFixed(2),
        '0.00',
        basePricePerDept.toFixed(2),
        '18.00',
        (basePricePerDept * 1.18).toFixed(2)
      ];
    });

    (doc as any).autoTable({
      startY: 95,
      head: [['Sr.No', 'Particulars', 'HSN/SAC', 'Qty', 'Unit Price', 'Amount', 'Discount', 'Taxable Value', 'GST Rate (%)', 'Net Amount']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontSize: 6, fontStyle: 'bold' },
      styles: { fontSize: 6, cellPadding: 1 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 60 },
        2: { cellWidth: 15 },
        3: { cellWidth: 8, halign: 'center' },
        4: { cellWidth: 15, halign: 'right' },
        5: { cellWidth: 15, halign: 'right' },
        6: { cellWidth: 12, halign: 'right' },
        7: { cellWidth: 15, halign: 'right' },
        8: { cellWidth: 10, halign: 'center' },
        9: { cellWidth: 15, halign: 'right' },
      }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 5;

    // GST Breakdown Table
    const gstData = [[
      '1',
      '9901',
      gstBreakdown.basePrice.toFixed(2),
      isInterState ? '0.00' : '9.00',
      isInterState ? '0.00' : gstBreakdown.sgst.toFixed(2),
      isInterState ? '0.00' : '9.00',
      isInterState ? '0.00' : gstBreakdown.cgst.toFixed(2),
      isInterState ? '18.00' : '0.00',
      isInterState ? gstBreakdown.igst.toFixed(2) : '0.00',
      gstBreakdown.totalGst.toFixed(2)
    ]];

    (doc as any).autoTable({
      startY: currentY,
      head: [['Sr.No', 'HSN/SAC', 'Taxable Value', 'SGST Rate (%)', 'SGST Amt', 'CGST Rate (%)', 'CGST Amt', 'IGST Rate (%)', 'IGST Amt', 'Total Tax Amt']],
      body: gstData,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontSize: 6, fontStyle: 'bold' },
      styles: { fontSize: 6, cellPadding: 1 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // Summary
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total (INR) = ${gstBreakdown.totalAmount.toLocaleString()}`, 190, currentY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Tax Amount (INR) = ${gstBreakdown.totalGst.toLocaleString()}`, 190, currentY + 5, { align: 'right' });

    // Terms & Conditions
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Terms & Conditions:', 20, currentY + 15);
    doc.setFont('helvetica', 'normal');
    doc.text('1. Subscription will be activated post-payment confirmation.', 20, currentY + 20);
    doc.text('2. All disputes are subject to Delhi jurisdiction only.', 20, currentY + 24);
    doc.text('3. Quotation is valid for 30 days.', 20, currentY + 28);

    doc.setFont('helvetica', 'bold');
    doc.text(`For, ${COMPANY_DETAILS.name}`, 190, currentY + 20, { align: 'right' });
    doc.text('Authorised Signatory', 190, currentY + 35, { align: 'right' });

    doc.save(`Quotation_${quotationNumber}.pdf`);
    toast.success('Quotation downloaded!');
  };

  const handleSendEmail = async () => {
    toast.loading('Sending quotation...', { id: 'send-email' });
    try {
      // Mocking email send logic
      setTimeout(() => {
        toast.success('Quotation sent to your email!', { id: 'send-email' });
      }, 1500);
    } catch (error) {
      toast.error('Failed to send email', { id: 'send-email' });
    }
  };

  const handlePayment = () => {
    if (gstBreakdown.totalAmount <= 0) {
      toast.error("Invalid amount. Please check quotation.");
      return;
    }
    // Navigate to checkout with the wizard data
    const checkoutItems = formData.selectedDepartments.map(deptId => {
      const dept = DOMAINS.find(d => d.id === deptId);
      return {
        id: `${deptId}-${formData.subscriptionPlanId}`,
        domainId: deptId,
        domainName: dept?.name || '',
        planId: formData.subscriptionPlanId,
        planName: selectedPlan?.name || '',
        duration: formData.duration,
        price: basePricePerDept
      };
    });

    navigate('/checkout', { 
      state: { 
        type: 'payment',
        formData: {
          name: formData.fullName,
          email: formData.email,
          mobile: formData.mobile,
          organization: formData.organization,
          address: formData.address,
          pincode: formData.pincode,
          state: formData.state,
          userCategory: formData.userCategory
        },
        items: checkoutItems
      } 
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Progress Indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between max-w-2xl mx-auto relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
            <div 
              className="absolute top-1/2 left-0 h-0.5 bg-blue-600 -translate-y-1/2 z-0 transition-all duration-500" 
              style={{ width: `${((step - 1) / 2) * 100}%` }}
            />
            
            {[1, 2, 3].map((s) => (
              <div key={s} className="relative z-10 flex flex-col items-center gap-2">
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center font-bold transition-all duration-300",
                  step >= s ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white text-slate-400 border-2 border-slate-200"
                )}>
                  {step > s ? <CheckCircle2 size={20} /> : s}
                </div>
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  step >= s ? "text-blue-600" : "text-slate-400"
                )}>
                  {s === 1 ? 'Details' : s === 2 ? 'Selection' : 'Preview'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 md:p-12"
            >
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <User className="text-blue-600" />
                  Basic Details
                </h2>
                <p className="text-slate-500 mt-1">Tell us about yourself and your organization.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="Enter your full name"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Mobile Number *</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="tel" 
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      placeholder="10-digit mobile number"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Email ID *</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="your@email.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Organization Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      name="organization"
                      value={formData.organization}
                      onChange={handleInputChange}
                      placeholder="University / College / Company"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700">Billing Address *</label>
                  <textarea 
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Complete billing address"
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Pincode *</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleInputChange}
                      maxLength={6}
                      placeholder="6-digit pincode"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                    {isPincodeLoading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">City *</label>
                  <input 
                    type="text" 
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="City"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">State *</label>
                  <select 
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all appearance-none"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">GST Number (Optional)</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      name="gstNumber"
                      value={formData.gstNumber}
                      onChange={handleInputChange}
                      placeholder="Enter GSTIN if applicable"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-12 flex justify-end">
                <button 
                  onClick={nextStep}
                  className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
                >
                  Next Step
                  <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 md:p-12"
            >
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <LayoutGrid className="text-blue-600" />
                  Selection
                </h2>
                <p className="text-slate-500 mt-1">Choose your departments and subscription plan.</p>
              </div>

              <div className="space-y-8">
                {/* User Category */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Users size={16} className="text-blue-600" />
                    User Category
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {USER_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setFormData(prev => ({ ...prev, userCategory: cat }))}
                        className={cn(
                          "rounded-xl border-2 py-3 text-sm font-bold transition-all",
                          formData.userCategory === cat 
                            ? "border-blue-600 bg-blue-50 text-blue-700" 
                            : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Departments */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <BookOpen size={16} className="text-blue-600" />
                    Select Departments (Multi-select)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {DOMAINS.map(dept => (
                      <button
                        key={dept.id}
                        onClick={() => toggleDepartment(dept.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all",
                          formData.selectedDepartments.includes(dept.id)
                            ? "border-blue-600 bg-blue-50"
                            : "border-slate-100 bg-slate-50 hover:border-slate-200"
                        )}
                      >
                        <div className={cn(
                          "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                          formData.selectedDepartments.includes(dept.id)
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-slate-300"
                        )}>
                          {formData.selectedDepartments.includes(dept.id) && <CheckCircle2 size={14} />}
                        </div>
                        <span className={cn(
                          "text-sm font-bold",
                          formData.selectedDepartments.includes(dept.id) ? "text-blue-700" : "text-slate-600"
                        )}>
                          {dept.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subscription Plan */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-blue-600" />
                      Subscription Plan
                    </label>
                    <select
                      name="subscriptionPlanId"
                      value={formData.subscriptionPlanId}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all appearance-none"
                    >
                      {SUBSCRIPTION_PLANS.map(plan => (
                        <option key={plan.id} value={plan.id}>{plan.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Calendar size={16} className="text-blue-600" />
                      Duration
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {DURATIONS.map(dur => (
                        <button
                          key={dur}
                          onClick={() => setFormData(prev => ({ ...prev, duration: dur }))}
                          className={cn(
                            "rounded-xl border-2 py-2 text-xs font-bold transition-all",
                            formData.duration === dur 
                              ? "border-blue-600 bg-blue-50 text-blue-700" 
                              : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
                          )}
                        >
                          {dur}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 flex justify-between">
                <button 
                  onClick={prevStep}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 px-8 py-4 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <ChevronLeft size={18} />
                  Back
                </button>
                <button 
                  onClick={nextStep}
                  className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
                >
                  Preview Quotation
                  <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              {/* Quotation Preview Card */}
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
                {/* Header Section */}
                <div className="p-8 border-b border-slate-100">
                  <div className="flex justify-between items-start mb-8">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Quotation</div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Subjected to Delhi Jurisdiction</div>
                  </div>
                  
                  <div className="text-center mb-8">
                    <div className="flex justify-center items-center gap-3 mb-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <BookOpen size={24} />
                      </div>
                      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{COMPANY_DETAILS.name}</h1>
                    </div>
                    <p className="text-xs text-slate-500">{COMPANY_DETAILS.address} - 201301</p>
                  </div>

                  {/* Info Grid Box */}
                  <div className="grid grid-cols-1 md:grid-cols-3 border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Quotation Number</p>
                          <p className="text-sm font-bold text-slate-900">QTN-{new Date().getFullYear()}-XXXX</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Quotation Date</p>
                          <p className="text-sm font-bold text-slate-900">{format(new Date(), 'dd MMM yyyy')}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Bank Details (NEFT/RTGS)</p>
                      <div className="space-y-1 text-[11px] text-slate-600">
                        <p><span className="font-bold">Bank:</span> {COMPANY_DETAILS.bank.bankName}</p>
                        <p><span className="font-bold">A/C:</span> {COMPANY_DETAILS.bank.accountNumber}</p>
                        <p><span className="font-bold">IFSC:</span> {COMPANY_DETAILS.bank.ifscCode}</p>
                        <p><span className="font-bold">Holder:</span> {COMPANY_DETAILS.bank.accountName}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50/50">
                      <div className="space-y-2 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase">GSTIN:</span>
                          <span className="font-bold text-slate-900">09AACCC6494M1Z1</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase">PAN No:</span>
                          <span className="font-bold text-slate-900">AACCC6494M</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase">CIN No:</span>
                          <span className="font-bold text-slate-900">U80302DL2005PTC138759</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Billed To / Details of Receiver:</h3>
                      <div className="space-y-1">
                        <p className="text-lg font-bold text-slate-900">{formData.fullName}</p>
                        <p className="text-sm text-slate-600">{formData.organization || 'Individual'}</p>
                        <p className="text-sm text-slate-500 mt-2">{formData.address}</p>
                        <p className="text-sm text-slate-500">{formData.city}, {formData.state} - {formData.pincode}</p>
                        {formData.gstNumber && (
                          <p className="text-xs font-bold text-blue-600 mt-2 uppercase">GSTIN: {formData.gstNumber}</p>
                        )}
                      </div>
                    </div>
                    <div className="md:text-right">
                      <div className="inline-block p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Subscription Validity</p>
                        <p className="text-sm font-bold text-slate-900">30 Days from Issue</p>
                        <p className="text-[10px] font-bold text-blue-600 uppercase mt-2">{formData.userCategory} Category</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 overflow-hidden mb-8">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-[10px] font-bold uppercase text-slate-500">Sr.No</th>
                          <th className="px-6 py-3 text-[10px] font-bold uppercase text-slate-500">Particulars</th>
                          <th className="px-6 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Taxable Value</th>
                          <th className="px-6 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Net Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {formData.selectedDepartments.map((deptId, index) => {
                          const dept = DOMAINS.find(d => d.id === deptId);
                          return (
                            <tr key={deptId}>
                              <td className="px-6 py-4 text-xs text-slate-500">{index + 1}</td>
                              <td className="px-6 py-4">
                                <p className="text-sm font-bold text-slate-700">{dept?.name}</p>
                                <p className="text-[10px] text-slate-400">{selectedPlan?.name} - {formData.duration}</p>
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">₹{basePricePerDept.toLocaleString()}</td>
                              <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">₹{(basePricePerDept * 1.18).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">GST Breakdown</h3>
                      <div className="rounded-xl border border-slate-100 overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">Type</th>
                              <th className="px-3 py-2 text-center">Rate</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {isInterState ? (
                              <tr>
                                <td className="px-3 py-2">IGST</td>
                                <td className="px-3 py-2 text-center">18%</td>
                                <td className="px-3 py-2 text-right">₹{gstBreakdown.igst.toLocaleString()}</td>
                              </tr>
                            ) : (
                              <>
                                <tr>
                                  <td className="px-3 py-2">CGST</td>
                                  <td className="px-3 py-2 text-center">9%</td>
                                  <td className="px-3 py-2 text-right">₹{gstBreakdown.cgst.toLocaleString()}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2">SGST</td>
                                  <td className="px-3 py-2 text-center">9%</td>
                                  <td className="px-3 py-2 text-right">₹{gstBreakdown.sgst.toLocaleString()}</td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 pt-4">
                      <div className="flex justify-between w-full text-sm">
                        <span className="text-slate-500">Total Taxable Value</span>
                        <span className="font-bold text-slate-900">₹{gstBreakdown.basePrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between w-full text-sm">
                        <span className="text-slate-500">Total Tax Amount</span>
                        <span className="font-bold text-slate-900">₹{gstBreakdown.totalGst.toLocaleString()}</span>
                      </div>
                      <div className="h-px bg-slate-200 w-full my-2" />
                      <div className="flex justify-between w-full items-center">
                        <span className="text-lg font-bold text-slate-900">Total (INR)</span>
                        <span className="text-2xl font-black text-blue-600">₹{gstBreakdown.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-12 pt-8 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Terms & Conditions:</h3>
                      <ul className="space-y-1 text-[10px] text-slate-500 list-decimal pl-4">
                        <li>Subscription will be activated post-payment confirmation.</li>
                        <li>All disputes are subject to Delhi jurisdiction only.</li>
                        <li>18% GST applicable as per Government of India rules.</li>
                        <li>Quotation is valid for 30 days.</li>
                      </ul>
                    </div>
                    <div className="md:text-right flex flex-col justify-end">
                      <p className="text-[10px] font-bold text-slate-900 mb-8">For, {COMPANY_DETAILS.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">Authorised Signatory</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <button 
                  onClick={prevStep}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <ChevronLeft size={18} />
                  Edit
                </button>
                <button 
                  onClick={generatePDF}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white hover:bg-slate-800 transition-all"
                >
                  <Download size={18} />
                  Download
                </button>
                <button 
                  onClick={handleSendEmail}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-blue-100 py-4 text-sm font-bold text-blue-700 hover:bg-blue-200 transition-all"
                >
                  <Send size={18} />
                  Send Email
                </button>
                <button 
                  onClick={handlePayment}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
                >
                  <CreditCard size={18} />
                  Pay Now
                </button>
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-400">
                  By proceeding, you agree to our <Link to="/terms" className="underline">Terms of Service</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
