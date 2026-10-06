import React, { useState, useEffect, useRef } from 'react';
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
  ArrowRight,
  GraduationCap,
  School,
  Globe,
  Briefcase,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { DOMAINS } from '../constants';
import { SUBSCRIPTION_PLANS } from '../lib/adminPricingData';
import { COMPANY_DETAILS } from '../config';
import { calculateGST, COMPANY_STATE, INDIAN_STATES } from '../lib/gstUtils';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { STM_LOGO_BASE64 } from '../logoBase64';
import { EmailVerificationInput } from './EmailVerificationInput';
import { Button, friendlyError } from './ui';

type Step = 1 | 2 | 3;

interface FormData {
  fullName: string;
  designation: string;
  mobile: string;
  email: string;
  organization: string;
  address: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  gstNumber: string;
  selectedDepartments: string[];
  subscriptionPlanId: string;
  duration: string;
  userCategory: string;
}

const USER_CATEGORIES: { label: string; icon: LucideIcon; planId: string }[] = [
  { label: 'Student Scholar',     icon: GraduationCap, planId: 'student-plan'   },
  { label: 'College Excellence',  icon: School,        planId: 'college-plan'   },
  { label: 'University Global',   icon: Globe,         planId: 'university-plan' },
  { label: 'Corporate Innovator', icon: Briefcase,     planId: 'corporate-plan'  },
];
const DURATIONS = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];
const STEP_LABELS = ['Details', 'Selection', 'Preview'];

/**
 * A labelled control with an optional leading icon. Kept at module level so a
 * keystroke does not remount the input and drop the caret.
 */
function WizardField({ id, label, icon: Icon, className, children, trailing }: {
  id: string; label: string; icon?: LucideIcon; className?: string; children: React.ReactNode; trailing?: React.ReactNode;
}) {
  return (
    <div className={cn('field', className)}>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />}
        {children}
        {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </div>
  );
}

/** A small uppercase caption inside the quotation preview. */
function DocLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[11px] font-semibold uppercase tracking-wider text-muted', className)}>{children}</p>;
}

/** A choice that is either selected or not — user type, department, duration. */
const choiceClass = (selected: boolean) => cn(
  'rounded-lg border transition-colors duration-150',
  selected ? 'border-accent bg-accent-soft text-accent' : 'border-rule bg-surface text-ink-2 hover:border-rule-2 hover:bg-surface-2',
);

export function QuotationWizard({ isAdminMode = false }: { isAdminMode?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [isEmailVerified, setIsEmailVerified] = useState(isAdminMode);
  const [quotationNumber, setQuotationNumber] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    designation: '',
    mobile: '',
    email: '',
    organization: '',
    address: '',
    pincode: '',
    city: '',
    state: '',
    country: 'India',
    gstNumber: '',
    selectedDepartments: [],
    subscriptionPlanId: SUBSCRIPTION_PLANS[0].id,
    duration: 'Yearly',
    userCategory: 'Student Scholar'
  });

  useEffect(() => {
    if (!isAdminMode || !formData.email || !formData.email.includes('@')) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quotation/customer/${encodeURIComponent(formData.email)}`);
        if (res.ok) {
          const data = await res.json();
          setFormData(prev => ({
            ...prev,
            fullName: data.userName || prev.fullName,
            organization: data.organization || prev.organization,
            designation: data.designation || prev.designation,
            address: data.address || prev.address,
            pincode: data.pincode || prev.pincode,
            city: data.city || prev.city,
            state: data.state || prev.state,
            country: data.country || prev.country,
            mobile: data.mobile || prev.mobile,
            gstNumber: data.gstNumber || prev.gstNumber,
            userCategory: data.userCategory || prev.userCategory,
          }));
          toast.success("Customer details auto-filled from previous records.");
        }
      } catch (err) {
        // ignore if not found
      }
    }, 800);
    return () => clearTimeout(timeoutId);
  }, [formData.email, isAdminMode]);

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ id: string, discount: number, code: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const [isPincodeLoading, setIsPincodeLoading] = useState(false);

  // Auto-fill city/state based on pincode
  useEffect(() => {
    if (formData.pincode.length === 6) {
      const fetchPincodeData = async () => {
        setIsPincodeLoading(true);
        try {
          const response = await fetch(`https://api.postalpincode.in/pincode/${formData.pincode}`);
          const data = await response.json();
          const userId = user?.uid || 'anonymous';
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
    if (!isEmailVerified) {
      toast.error('Please verify your email address first');
      return false;
    }
    const { fullName, mobile, email, organization, address, pincode, city, state } = formData;
    if (!organization || !fullName || !mobile || !email || !address || !pincode || !city || !state) {
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

  const nextStep = async () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) {
      // Fetch sequential quotation number when entering preview step
      if (!quotationNumber) {
        try {
          const res = await fetch('/api/quotation/next-number', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          const data = await res.json();
          if (data.quotationNumber) setQuotationNumber(data.quotationNumber);
        } catch {
          // Fallback to a temp number if server is unreachable
          const now = new Date();
          const yr = now.getFullYear();
          const mo = String(now.getMonth() + 1).padStart(2, '0');
          setQuotationNumber(`QTN-${yr}-${mo}-01`);
        }
      }
      setStep(3);
    }
  };

  const prevStep = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    setCouponLoading(true);
    try {
      const selectedPlan = SUBSCRIPTION_PLANS.find(p => p.id === formData.subscriptionPlanId);
      const basePricePerDept = selectedPlan?.pricing.find(pr => pr.duration === formData.duration)?.price || 0;
      const totalBasePrice = basePricePerDept * formData.selectedDepartments.length;

      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ code: couponCode, orderAmount: totalBasePrice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid coupon');
      setAppliedCoupon({ id: data.couponId, discount: data.discount, code: couponCode.toUpperCase() });
      toast.success('Coupon applied successfully!');
    } catch (e: any) {
      toast.error(friendlyError(e, 'Invalid coupon'));
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
  };

  // Pricing Logic
  const selectedPlan = SUBSCRIPTION_PLANS.find(p => p.id === formData.subscriptionPlanId);
  const basePricePerDept = selectedPlan?.pricing.find(pr => pr.duration === formData.duration)?.price || 0;
  const totalBasePrice = basePricePerDept * formData.selectedDepartments.length;
  const discountedBasePrice = Math.max(0, totalBasePrice - (appliedCoupon?.discount || 0));
  const isInterState = formData.state !== COMPANY_STATE;
  const gstBreakdown = calculateGST(discountedBasePrice, isInterState);

  const createPdfDocument = async () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const qtnNum = quotationNumber || (() => {
      const now = new Date();
      return `QTN-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    })();
    const pdfDate = format(new Date(), 'dd MMM yyyy');
    const validTill = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'dd MMM yyyy');
    const pageW = 210;
    const margin = 14;
    const contentW = pageW - margin * 2;

    // outer border
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.4);
    doc.rect(margin - 2, 8, contentW + 4, 276);

    // TOP BADGES
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.setDrawColor(147, 197, 253);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, 13, 33, 5, 1.5, 1.5, 'S');
    doc.text('QUOTATION', margin + 16.5, 16.5, { align: 'center' });
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'bold');
    doc.text('SUBJECT TO DELHI JURISDICTION', pageW - margin, 16.5, { align: 'right' });

    // Logo
    doc.addImage(STM_LOGO_BASE64, 'PNG', pageW / 2 - 8, 18, 16, 16);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_DETAILS.name.toUpperCase(), pageW / 2, 39, { align: 'center' });

    doc.setTextColor(37, 99, 235);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_DETAILS.positioning.toUpperCase(), pageW / 2, 44, { align: 'center' });

    // Green badge
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(pageW / 2 - 52, 47, 104, 6, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text('21 YEARS OF TRUSTED EXCELLENCE IN EDUCATION & ACADEMIC PUBLISHING', pageW / 2, 51, { align: 'center' });

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${COMPANY_DETAILS.address} - 201301`, pageW / 2, 57, { align: 'center' });

    // 3-COL INFO GRID
    const gridY = 61;
    const gridH = 30;
    const colW = contentW / 3;
    const col1X = margin;
    const col2X = margin + colW;
    const col3X = margin + colW * 2;

    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.3);
    doc.rect(col1X, gridY, contentW, gridH);
    doc.line(col2X, gridY, col2X, gridY + gridH);
    doc.line(col3X, gridY, col3X, gridY + gridH);

    // Col 1
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
    doc.text('QUOTATION NUMBER', col1X + 3, gridY + 5);
    doc.setFontSize(7); doc.setTextColor(37, 99, 235);
    doc.text(qtnNum, col1X + 3, gridY + 9);
    doc.setFontSize(5.5); doc.setTextColor(148, 163, 184);
    doc.text('ISSUE DATE', col1X + 3, gridY + 15);
    doc.setFontSize(7); doc.setTextColor(30, 41, 59);
    doc.text(pdfDate, col1X + 3, gridY + 19);
    doc.setFontSize(5.5); doc.setTextColor(148, 163, 184);
    doc.text('VALID TILL', col1X + 3, gridY + 25);
    doc.setFontSize(7); doc.setTextColor(22, 163, 74);
    doc.text(validTill, col1X + 3, gridY + 29);

    // Col 2
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
    doc.text('BANK DETAILS (NEFT/RTGS)', col2X + 3, gridY + 5);
    const bankRows = [['Bank:', COMPANY_DETAILS.bank.bankName], ['Account:', COMPANY_DETAILS.bank.accountNumber], ['IFSC:', COMPANY_DETAILS.bank.ifscCode]];
    bankRows.forEach(([label, value], i) => {
      const ry = gridY + 9 + i * 5;
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
      doc.text(label, col2X + 3, ry);
      doc.setTextColor(30, 41, 59);
      doc.text(value, col2X + 17, ry);
    });
    doc.setDrawColor(220, 220, 230);
    doc.rect(col2X + 3, gridY + 23, colW - 6, 6);
    doc.setFontSize(5); doc.setTextColor(148, 163, 184);
    doc.text('Holder:', col2X + 4, gridY + 26);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
    doc.text(COMPANY_DETAILS.bank.accountName, col2X + 4, gridY + 29, { maxWidth: colW - 8 });

    // Col 3
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
    doc.text('LEGAL IDENTIFIERS', col3X + 3, gridY + 5);
    [['GSTIN', COMPANY_DETAILS.gstin], ['PAN NUMBER', COMPANY_DETAILS.pan], ['CIN NUMBER', COMPANY_DETAILS.cin]].forEach(([lbl, val], i) => {
      const ry = gridY + 9 + i * 7;
      doc.setFontSize(5); doc.setTextColor(148, 163, 184); doc.text(lbl, col3X + 3, ry);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59); doc.text(val, col3X + 3, ry + 3.5);
    });

    // RECEIVER + SUBSCRIPTION SUMMARY
    const secY = gridY + gridH + 6;
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
    doc.text('RECEIVER DETAILS (BILLED TO)', margin, secY + 4);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text(formData.fullName, margin, secY + 11);
    let rcvY = secY + 15;
    if (formData.designation) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
      doc.text(formData.designation, margin, rcvY); rcvY += 4;
    }
    if (formData.organization) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
      doc.text(formData.organization, margin, rcvY); rcvY += 4;
    }
    if (formData.city) { doc.text(formData.city, margin, rcvY); rcvY += 4; }
    const addrParts = [formData.address, formData.state, formData.pincode && `- ${formData.pincode}`, formData.country].filter(Boolean).join(', ');
    doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
    doc.text(addrParts, margin, rcvY, { maxWidth: 80 });

    // Dark blue subscription box
    const boxX = pageW / 2 + 2;
    const boxW = contentW / 2 - 2;
    const boxH = 38;
    doc.setFillColor(29, 78, 216);
    doc.roundedRect(boxX, secY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(147, 197, 253);
    doc.text('SUBSCRIPTION SUMMARY', boxX + boxW - 3, secY + 5, { align: 'right' });
    doc.text('CATEGORY', boxX + 4, secY + 12);
    doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(formData.userCategory, boxX + 4, secY + 17);
    doc.setFontSize(5.5); doc.setTextColor(147, 197, 253);
    doc.text('DURATION PLAN', boxX + 4, secY + 23);
    doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text(formData.duration, boxX + 4, secY + 30);
    doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.3);
    doc.line(boxX + 3, secY + 33, boxX + boxW - 3, secY + 33);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(147, 197, 253);
    doc.text(`${formData.selectedDepartments.length} Department(s)`, boxX + 4, secY + 37);

    // DEPARTMENT TABLE
    const tableStartY = secY + boxH + 6;
    const deptRows = formData.selectedDepartments.map((deptId, idx) => {
      const dept = DOMAINS.find(d => d.id === deptId);
      const gst = basePricePerDept * 0.18;
      return [
        String(idx + 1).padStart(2, '0'),
        (dept?.name || '').toUpperCase(),
        '998439',
        `Rs.${basePricePerDept.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `Rs.${gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `Rs.${(basePricePerDept + gst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      ];
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [['SR.NO', 'DEPARTMENT', 'SAC CODE', 'BASE PRICE', 'GST (18%)', 'TOTAL']],
      body: deptRows,
      theme: 'plain',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
      bodyStyles: { fontSize: 7, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 14, textColor: [37, 99, 235], fontStyle: 'bold' },
        1: { cellWidth: 55, fontStyle: 'bold' },
        2: { cellWidth: 25, textColor: [100, 116, 139] },
        3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 28, halign: 'right', textColor: [100, 116, 139] },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [37, 99, 235] },
      },
      margin: { left: margin, right: margin },
    });

    let curY = (doc as any).lastAutoTable.finalY + 7;

    // GST BREAKDOWN
    const halfW = contentW / 2 - 3;
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
    doc.text('GST BREAKDOWN', margin, curY);
    const gstRows = isInterState
      ? [['IGST', '18%', `Rs.${gstBreakdown.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]]
      : [['CGST', '9%', `Rs.${gstBreakdown.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
         ['SGST', '9%', `Rs.${gstBreakdown.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]];

    autoTable(doc, {
      startY: curY + 3,
      head: [['Type', 'Rate', 'Amount']],
      body: gstRows,
      theme: 'grid',
      tableWidth: halfW,
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontSize: 6.5, fontStyle: 'bold', cellPadding: 2 },
      bodyStyles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 20, halign: 'center' }, 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: margin, right: pageW - margin - halfW },
    });

    const gstBottom = (doc as any).lastAutoTable.finalY;

    // Totals (right)
    const totX = margin + halfW + 6;
    const totW = halfW - 3;
    let totY = curY + 6;
    const pdfTotals = [
      ['Subtotal (Base Price Total)', `Rs.${totalBasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]
    ];
    if (appliedCoupon) {
      pdfTotals.push([`Discount (${appliedCoupon.code})`, `-Rs.${appliedCoupon.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);
    }
    pdfTotals.push(['Total GST (18%)', `Rs.${gstBreakdown.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);
    
    pdfTotals.forEach(([lbl, val]) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(lbl, totX, totY);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
      doc.text(val, totX + totW, totY, { align: 'right' });
      totY += 5;
    });
    doc.setDrawColor(220, 220, 230); doc.setLineWidth(0.3);
    doc.line(totX, totY, totX + totW, totY);
    totY += 4;
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
    doc.text('GRAND TOTAL', totX, totY);
    doc.setFontSize(11); doc.setTextColor(37, 99, 235);
    doc.text(`Rs.${gstBreakdown.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, totX + totW, totY, { align: 'right' });

    curY = Math.max(gstBottom, totY) + 8;

    // TERMS & SIGNATURE
    doc.setDrawColor(220, 220, 230); doc.setLineWidth(0.2);
    doc.line(margin, curY, pageW - margin, curY);
    curY += 5;

    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
    doc.text('TERMS & CONDITIONS', margin, curY);
    curY += 4;
    const terms = [
      'Subscription will be activated post-payment confirmation.',
      '18% GST applicable as per Government of India rules.',
      'Quotation is valid for 30 days from the date of issue.',
      'All disputes are subject to Delhi Jurisdiction only.',
    ];
    const sigBaseY = curY;
    terms.forEach(t => {
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(`•  ${t}`, margin, curY); curY += 4;
    });

    // Signature right
    let sigY = sigBaseY;
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
    doc.text('FOR PUBLISHER', pageW - margin, sigY, { align: 'right' }); sigY += 4;
    doc.setFontSize(7); doc.setTextColor(30, 41, 59);
    doc.text('STM Digital Library', pageW - margin, sigY, { align: 'right' }); sigY += 4;
    const sealW = 40;
    // Try to embed signature image
    try {
      const sigResp = await fetch('/assets/signature.png');
      if (sigResp.ok) {
        const blob = await sigResp.blob();
        const b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
        doc.addImage(`data:image/png;base64,${b64}`, 'PNG', pageW - margin - sealW, sigY, sealW, 14);
      } else {
        throw new Error('sig not found');
      }
    } catch {
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(pageW - margin - sealW, sigY, sealW, 14);
      doc.setLineDashPattern([], 0);
      doc.setFontSize(5.5); doc.setTextColor(180, 180, 190);
      doc.text('Seal & Signature', pageW - margin - sealW / 2, sigY + 8, { align: 'center' });
    }
    sigY += 17;
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105);
    doc.text('AUTHORIZED SIGNATORY', pageW - margin, sigY, { align: 'right' });

    // ============================================================
    // PAGE 2: FULL TERMS & CONDITIONS + PRIVACY POLICY
    // ============================================================
    doc.addPage();

    // Page 2 outer border
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.4);
    doc.rect(margin - 2, 8, contentW + 4, 276);

    // Page 2 Header
    doc.addImage(STM_LOGO_BASE64, 'PNG', pageW / 2 - 6, 12, 12, 12);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_DETAILS.name.toUpperCase(), pageW / 2, 28, { align: 'center' });
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(37, 99, 235);
    doc.text(COMPANY_DETAILS.positioning.toUpperCase(), pageW / 2, 32, { align: 'center' });

    // Divider
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.3);
    doc.line(margin, 36, pageW - margin, 36);

    // Section Title
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, 39, contentW, 7, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TERMS & CONDITIONS', pageW / 2, 44, { align: 'center' });

    const fullTerms = [
      {
        title: '1. Applicability:',
        text: `These terms and conditions shall apply to all offers, proposals and agreements made between ${COMPANY_DETAILS.legalName} (herein referred as ${COMPANY_DETAILS.shortName}) and any third party or its agent ("the Client") relating to the products and/or services of ${COMPANY_DETAILS.shortName} ("the Products and/or Services"), whether such products and services are provided within or outside the country, unless otherwise agreed in writing and signed by an authorized signatory of ${COMPANY_DETAILS.shortName}. Failing this, they will supersede any other terms and conditions, including those contained in any of the Client's documentation.`,
      },
      {
        title: '2. Offer and acceptance; Description:',
        text: `Each order for the Products and Services by the Client from ${COMPANY_DETAILS.shortName} shall be deemed to be an offer by the Client to purchase the Products and Services subject to this T&C. No order placed by the Client shall be deemed to be accepted by ${COMPANY_DETAILS.shortName} until ${COMPANY_DETAILS.shortName} issues a written order confirmation to the Client or (if earlier) ${COMPANY_DETAILS.shortName} delivers the Products or Services to the Client. Client represents and warrants that it has the legal right to use any information, data or other materials with which the Products or Services are used.`,
      },
      {
        title: '3. Execution and modification of the order:',
        text: `Any modification to the agreed product or service description, budget or schedule, as set out in the order acknowledgement, may result in an adjustment to the final price and/or to the delivery schedule by ${COMPANY_DETAILS.shortName}. No modification shall take effect unless it has been acknowledged in writing by ${COMPANY_DETAILS.shortName}. ${COMPANY_DETAILS.shortName} shall not be liable for any delay or failure to perform its obligations under this T&C to the extent that such delay or failure results from a modification requested by the Client.`,
      },
      {
        title: '4. Rates and prices:',
        text: `Unless otherwise agreed by ${COMPANY_DETAILS.shortName} in writing the prices/rates for the Products shall be those set out in ${COMPANY_DETAILS.shortName}'s current pricelists. All such prices/rates shall be exclusive of any handling, packing, loading, freight, transport and insurance charges. All quotations are exclusive of GST. ${COMPANY_DETAILS.shortName} reserves the right to revise prices at any time. The prices mentioned in this quotation are valid for 30 days from the date of issue.`,
      },
      {
        title: '5. Payment:',
        text: `Unless otherwise agreed in writing, payments shall be effected within thirty (30) days of the invoice date in the currency invoiced. The Client shall make all payments due under the T&C without any deduction whether by way of set-off, counterclaim, discount, abatement or otherwise. Subscription services will only be activated upon receipt of full payment. ${COMPANY_DETAILS.shortName} reserves the right to suspend access to services in case of delayed or incomplete payment.`,
      },
      {
        title: '6. Distribution:',
        text: `The Client shall not engage in piracy, reproduction, or plagiarism of the Products or any other products of ${COMPANY_DETAILS.shortName} or its affiliates, nor shall it directly or indirectly facilitate any other party to engage in those activities. The Products and Services are licensed only for the Client's own internal use. The Client shall not resell, sublicense, or otherwise transfer the Products or Services to any third party without the prior written consent of ${COMPANY_DETAILS.shortName}.`,
      },
      {
        title: '7. Intellectual property:',
        text: `Copyright and other intellectual property rights to all ${COMPANY_DETAILS.shortName} proposals, publications and other Products and/or Services shall remain with ${COMPANY_DETAILS.shortName} unless agreed otherwise in writing. The rights granted by ${COMPANY_DETAILS.shortName} are restricted to use solely by the Client and may not be assigned, transferred or sub-licensed. All trademarks, service marks, trade names, logos and other designations of ${COMPANY_DETAILS.shortName} and its affiliates are the property of ${COMPANY_DETAILS.shortName} or its affiliates.`,
      },
      {
        title: '8. Liability and claims:',
        text: `TO THE MAXIMUM EXTENT PERMITTED BY RELEVANT LAWS, ${COMPANY_DETAILS.shortName} shall not be liable for any indirect, incidental, punitive or consequential losses which may arise by reason of any breach of this T&C or any implied warranty, condition or other term. ${COMPANY_DETAILS.shortName}'s total liability in connection with any single claim shall not exceed the amount paid by the Client for the relevant Products or Services in the twelve (12) months preceding the event giving rise to liability.`,
      },
      {
        title: '9. Force majeure:',
        text: 'If by reason of labor dispute, strikes, inability to obtain labor or materials, fire, flood, natural disaster, pandemic, government regulations, restrictions, or any other cause beyond the reasonable control of either party, such party is unable to perform its obligations under this T&C, then performance of such obligation shall be excused for the duration of the force majeure event. The affected party shall promptly notify the other party in writing of such event.',
      },
      {
        title: '10. Audit:',
        text: `If Client is an agent, Client shall allow Publisher's authorized representative at any reasonable time to have access to Client's premises for the purpose of inspecting Client's activities, books and records relating to the Products and Services. Client shall maintain accurate records of all uses of the Products and Services and shall provide copies of such records to ${COMPANY_DETAILS.shortName} upon request. Such audit rights shall survive the termination of this T&C.`,
      },
      {
        title: '11. Compliance with laws:',
        text: 'Client shall at all times during the term strictly comply with all applicable laws, ordinances, codes, regulations, standards and judicial and administrative orders relevant to its duties, obligations and performance under this T&C including, without limitation, all applicable data protection laws. Client shall not use the Products or Services for any unlawful purpose or in any way that violates any applicable law or regulation.',
      },
      {
        title: '12. Cancellations & Returns:',
        text: `Without prejudice to any rights the Client may have under statute as a consumer, if the Client cancels an order, a cancellation fee may be charged. All cancellations must be made in writing. Due to the digital nature of the subscription services, no refunds will be issued once a subscription has been activated and access has been granted. Cancellation requests made within 24 hours of order placement may be considered at ${COMPANY_DETAILS.shortName}'s discretion.`,
      },
      {
        title: '13. General:',
        text: 'The formation, existence, construction, performance, validity and all aspects of the T&C shall be governed by the law of India. The parties agree to submit to the exclusive jurisdiction of the courts in Delhi, India. Any dispute arising out of or in connection with this T&C shall be resolved through arbitration in New Delhi in accordance with the Arbitration and Conciliation Act, 1996. The language of arbitration shall be English.',
      },
    ];

    const p2Col1X = margin;
    const p2Col2X = margin + contentW / 2 + 2;
    const p2ColWidth = contentW / 2 - 4;
    let p2LeftY = 50;
    let p2RightY = 50;

    fullTerms.forEach((term, idx) => {
      const isLeft = idx < 7;
      const xPos = isLeft ? p2Col1X : p2Col2X;
      let currentY = isLeft ? p2LeftY : p2RightY;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      doc.text(term.title, xPos, currentY);
      currentY += 4;

      // Body
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(term.text, p2ColWidth);
      doc.text(lines, xPos, currentY);
      currentY += lines.length * 3.2 + 5;

      if (isLeft) p2LeftY = currentY;
      else p2RightY = currentY;
    });

    // Vertical divider between columns
    const colDividerTop = 50;
    const colDividerBottom = Math.max(p2LeftY, p2RightY);
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.2);
    doc.line(pageW / 2, colDividerTop, pageW / 2, colDividerBottom);

    // Page 2 Footer
    const p2FooterY = 284;
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.2);
    doc.line(margin, p2FooterY - 4, pageW - margin, p2FooterY - 4);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`${COMPANY_DETAILS.name} | ${COMPANY_DETAILS.address} | Email: ${COMPANY_DETAILS.email}`, pageW / 2, p2FooterY, { align: 'center' });

    return { doc, quotationNumber: qtnNum };
  };

  const previewRef = useRef<HTMLDivElement>(null);

  const generatePDF = async () => {
    const toastId = toast.loading('Generating PDF...');
    try {
      const { doc, quotationNumber: qtn } = await createPdfDocument();
      doc.save(`Quotation_${qtn}.pdf`);
      
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

      try {
        await fetch('/api/quotation/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            userEmail: formData.email,
            userName: formData.fullName,
            organization: formData.organization,
            state: formData.state,
            duration: formData.duration,
            userId: user?.uid,
            quotationData: {
              quotationNumber: qtn,
              items: checkoutItems,
              subtotal: gstBreakdown.basePrice,
              gstAmount: gstBreakdown.totalGst,
              totalAmount: gstBreakdown.totalAmount,
              discountAmount: appliedCoupon?.discount || 0,
              couponCode: appliedCoupon?.code || null,
              mobile: formData.mobile,
              designation: formData.designation,
              address: formData.address,
              pincode: formData.pincode,
              city: formData.city,
              country: formData.country,
              gstNumber: formData.gstNumber,
              userCategory: formData.userCategory
            }
          })
        });
      } catch (e) {
        console.warn('Failed to save quotation silently');
      }

      toast.success('Quotation downloaded!', { id: toastId });
    } catch (error: any) {
      console.error('PDF Generation failed:', error);
      toast.error(friendlyError(error, 'Could not generate the PDF. Please try again.'), { id: toastId, duration: 5000 });
    }
  };

  const handleSendEmail = async () => {
    toast.loading('Sending quotation...', { id: 'send-email' });
    try {
      const { doc, quotationNumber: qtn } = await createPdfDocument();
      // Generate base64
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
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

      const response = await fetch('/api/quotation/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          userEmail: formData.email,
          userName: formData.fullName,
          organization: formData.organization,
          state: formData.state,
          userId: user?.uid,
          duration: formData.duration,
          quotationDate: format(new Date(), 'dd MMM yyyy'),
          quotationData: {
            quotationNumber: qtn,
            totalAmount: gstBreakdown.totalAmount,
            subtotal: gstBreakdown.basePrice,
            gstAmount: gstBreakdown.totalGst,
            discountAmount: appliedCoupon?.discount || 0,
            couponCode: appliedCoupon?.code || null,
            items: checkoutItems,
            mobile: formData.mobile,
            designation: formData.designation,
            address: formData.address,
            pincode: formData.pincode,
            city: formData.city,
            country: formData.country,
            gstNumber: formData.gstNumber,
            userCategory: formData.userCategory
          },
          pdfBase64
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send email');
      }

      toast.success('Quotation sent to your email!', { id: 'send-email' });
      // Reset QTN so next send gets a fresh sequential number
      setQuotationNumber('');
    } catch (error: any) {
      console.error("Email send failed:", error);
      toast.error(friendlyError(error, 'Failed to send email'), { id: 'send-email' });
    }
  };

  const inr2 = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="py-2 sm:py-4">
      <div className="mx-auto max-w-4xl">
        {/* Progress Indicator */}
        <nav aria-label="Quotation steps" className="mb-8 sm:mb-10">
          <ol className="flex items-start justify-between max-w-xl mx-auto relative">
            <div className="absolute top-4 sm:top-5 left-[16.66%] right-[16.66%] h-0.5 bg-rule" aria-hidden="true" />
            <div
              className="absolute top-4 sm:top-5 left-[16.66%] h-0.5 bg-accent transition-all duration-300"
              style={{ width: `${((step - 1) / 2) * 66.68}%` }}
              aria-hidden="true"
            />

            {[1, 2, 3].map((s) => (
              <li key={s} className="relative z-10 flex flex-1 flex-col items-center gap-2" aria-current={step === s ? 'step' : undefined}>
                <div className={cn(
                  "h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors duration-200",
                  step >= s ? "bg-accent text-accent-on" : "bg-surface text-muted border-2 border-rule-2"
                )}>
                  {step > s ? <CheckCircle2 size={18} aria-hidden="true" /> : s}
                </div>
                <span className={cn(
                  "text-xs font-semibold",
                  step >= s ? "text-accent" : "text-muted"
                )}>
                  {STEP_LABELS[s - 1]}
                  {step > s && <span className="sr-only"> (completed)</span>}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="card p-5 sm:p-8"
            >
              <div className="mb-6">
                <h2 className="type-section text-ink flex items-center gap-2">
                  <User size={20} className="text-accent shrink-0" aria-hidden="true" />
                  Basic Details
                </h2>
                <p className="text-sm text-muted mt-1">Tell us about yourself and your organization.</p>
              </div>

              {isAdminMode ? (
                <WizardField id="qw-email" label="Client Email ID *" icon={Mail} className="mb-6">
                  <input
                    id="qw-email"
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter client's email address"
                    className="input pl-10"
                  />
                </WizardField>
              ) : (
                <div className="mb-6 bg-surface-2 p-4 rounded-lg border border-rule">
                  <EmailVerificationInput
                    label="Email ID *"
                    value={formData.email}
                    onChange={(email) => setFormData(prev => ({ ...prev, email }))}
                    onVerified={setIsEmailVerified}
                  />
                </div>
              )}

              <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 transition-opacity duration-200 ${isEmailVerified ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                {/* Row 1: Organization Name – full width */}
                <WizardField id="qw-organization" label="Organization Name *" icon={Building2} className="md:col-span-2">
                  <input
                    id="qw-organization"
                    type="text"
                    name="organization"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.organization}
                    onChange={handleInputChange}
                    placeholder="University / College / Company"
                    className="input pl-10"
                  />
                </WizardField>

                {/* Row 2: Full Name | Designation */}
                <WizardField id="qw-fullName" label="Full Name *" icon={User}>
                  <input
                    id="qw-fullName"
                    type="text"
                    name="fullName"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="Enter your full name"
                    className="input pl-10"
                  />
                </WizardField>

                <WizardField id="qw-designation" label="Designation *" icon={User}>
                  <input
                    id="qw-designation"
                    type="text"
                    name="designation"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.designation}
                    onChange={handleInputChange}
                    placeholder="e.g. Librarian, HOD, Director"
                    className="input pl-10"
                  />
                </WizardField>

                {/* Row 3: Mobile Number | Email ID */}
                <WizardField id="qw-mobile" label="Mobile Number *" icon={Phone}>
                  <input
                    id="qw-mobile"
                    type="tel"
                    name="mobile"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.mobile}
                    onChange={handleInputChange}
                    placeholder="10-digit mobile number"
                    className="input pl-10"
                  />
                </WizardField>

                {/* Row 4: Full Address – full width */}
                <WizardField id="qw-address" label="Full Address *" className="md:col-span-2">
                  <textarea
                    id="qw-address"
                    name="address"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Street, Building, Area details"
                    rows={3}
                    className="input resize-none"
                  />
                </WizardField>

                {/* Row 5: Pincode | City */}
                <WizardField
                  id="qw-pincode"
                  label="Pincode *"
                  icon={MapPin}
                  trailing={isPincodeLoading ? <Loader2 size={16} className="animate-spin text-accent" aria-label="Looking up pincode" /> : undefined}
                >
                  <input
                    id="qw-pincode"
                    type="text"
                    name="pincode"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.pincode}
                    onChange={handleInputChange}
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="6-digit pincode"
                    className="input pl-10 pr-10"
                  />
                </WizardField>

                <WizardField id="qw-city" label="City *">
                  <input
                    id="qw-city"
                    type="text"
                    name="city"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="City"
                    className="input"
                  />
                </WizardField>

                {/* Row 6: State | Country */}
                <WizardField id="qw-state" label="State *">
                  <select
                    id="qw-state"
                    name="state"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.state}
                    onChange={handleInputChange}
                    className="input"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </WizardField>

                <WizardField id="qw-country" label="Country *">
                  <input
                    id="qw-country"
                    type="text"
                    name="country"
                    required={isEmailVerified}
                    disabled={!isEmailVerified}
                    value={formData.country}
                    onChange={handleInputChange}
                    placeholder="Country"
                    className="input"
                  />
                </WizardField>

                {/* Row 7: GST Number – full width */}
                <WizardField id="qw-gstNumber" label="GST Number (Optional)" icon={ShieldCheck} className="md:col-span-2">
                  <input
                    id="qw-gstNumber"
                    type="text"
                    name="gstNumber"
                    disabled={!isEmailVerified}
                    value={formData.gstNumber}
                    onChange={handleInputChange}
                    placeholder="ENTER GSTIN IF APPLICABLE"
                    className="input pl-10 uppercase"
                  />
                </WizardField>
              </div>

              <div className="mt-8 flex justify-end border-t border-rule pt-6">
                <Button onClick={nextStep} className="w-full sm:w-auto">
                  Next Step
                  <ChevronRight size={18} aria-hidden="true" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="card p-5 sm:p-8"
            >
              <div className="mb-6">
                <h2 className="type-section text-ink flex items-center gap-2">
                  <LayoutGrid size={20} className="text-accent shrink-0" aria-hidden="true" />
                  Selection
                </h2>
                <p className="text-sm text-muted mt-1">Choose your departments and subscription plan.</p>
              </div>

              <div className="space-y-8">
                {/* User Category */}
                <fieldset className="space-y-3">
                  <legend className="field-label flex items-center gap-2 mb-3">
                    <Users size={16} className="text-accent" aria-hidden="true" />
                    User Type
                  </legend>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {USER_CATEGORIES.map(({ label, icon: Icon, planId }) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={formData.userCategory === label}
                        onClick={() => setFormData(prev => ({ ...prev, userCategory: label, subscriptionPlanId: planId }))}
                        className={cn(choiceClass(formData.userCategory === label), "py-3 px-2 text-xs font-semibold flex flex-col items-center gap-2")}
                      >
                        <Icon size={20} aria-hidden="true" />
                        <span className="leading-tight text-center">{label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* Departments */}
                <fieldset className="space-y-3">
                  <legend className="field-label flex items-center gap-2 mb-3">
                    <BookOpen size={16} className="text-accent" aria-hidden="true" />
                    Select Departments (Multi-select)
                    {formData.selectedDepartments.length > 0 && (
                      <span className="badge badge-accent">{formData.selectedDepartments.length} selected</span>
                    )}
                  </legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                    {DOMAINS.map(dept => {
                      const on = formData.selectedDepartments.includes(dept.id);
                      return (
                        <button
                          key={dept.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleDepartment(dept.id)}
                          className={cn(choiceClass(on), "flex items-center gap-3 px-3 py-3 text-left")}
                        >
                          <span className={cn(
                            "h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors duration-150",
                            on ? "bg-accent border-accent text-accent-on" : "bg-surface border-rule-2"
                          )} aria-hidden="true">
                            {on && <CheckCircle2 size={14} />}
                          </span>
                          <span className={cn("text-sm font-medium", on ? "text-accent" : "text-ink-2")}>
                            {dept.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Subscription Plan */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="field">
                    <p className="field-label flex items-center gap-2">
                      <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
                      Subscription Plan
                    </p>
                    <div className="flex h-10 items-center rounded-lg border border-rule bg-surface-2 px-3 text-sm font-semibold text-ink" aria-live="polite">
                      {SUBSCRIPTION_PLANS.find(p => p.id === formData.subscriptionPlanId)?.name || 'Select User Type above'}
                    </div>
                  </div>

                  <fieldset className="field">
                    <legend className="field-label flex items-center gap-2 mb-1.5">
                      <Calendar size={16} className="text-accent" aria-hidden="true" />
                      Duration
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      {DURATIONS.map(dur => (
                        <button
                          key={dur}
                          type="button"
                          aria-pressed={formData.duration === dur}
                          onClick={() => setFormData(prev => ({ ...prev, duration: dur }))}
                          className={cn(choiceClass(formData.duration === dur), "h-10 text-xs font-semibold")}
                        >
                          {dur}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-rule pt-6 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={prevStep}>
                  <ChevronLeft size={18} aria-hidden="true" />
                  Back
                </Button>
                <Button onClick={nextStep}>
                  Preview Quotation
                  <ChevronRight size={18} aria-hidden="true" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              {/* ── PROFORMA INVOICE card ── */}
              <div ref={previewRef} className="card overflow-hidden">

                {/* Header */}
                <div className="p-4 sm:p-8 border-b border-rule">
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
                    <span className="badge badge-accent uppercase tracking-wider">Quotation</span>
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted">Subject to Delhi Jurisdiction</span>
                  </div>

                  {/* Branding */}
                  <div className="flex flex-col items-center text-center gap-3 mb-6">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                      <img src="/logo.png" alt="STM Digital Library Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <p className="text-xl sm:text-2xl font-bold tracking-tight text-ink uppercase">{COMPANY_DETAILS.name}</p>
                      <p className="text-[11px] font-semibold text-accent uppercase tracking-wider mt-0.5">{COMPANY_DETAILS.positioning.replace(/^A /, "")}</p>
                    </div>
                    <span className="badge badge-success h-auto py-1 whitespace-normal text-center leading-snug uppercase tracking-wide">
                      <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" /> 21 Years of Trusted Excellence in Education &amp; Academic Publishing
                    </span>
                    <p className="text-xs text-muted">{COMPANY_DETAILS.address} - 201301</p>
                  </div>

                  {/* 3-col info grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 border border-rule rounded-xl overflow-hidden text-xs">

                    {/* Left: Quotation meta */}
                    <div className="p-4 sm:p-5 space-y-4 border-b md:border-b-0 md:border-r border-rule bg-surface-2">
                      <div>
                        <DocLabel className="mb-0.5">Quotation Number</DocLabel>
                        <p className="font-bold text-accent break-all">{quotationNumber || 'Generating...'}</p>
                      </div>
                      <div>
                        <DocLabel className="mb-0.5">Issue Date</DocLabel>
                        <p className="font-semibold text-ink">{format(new Date(), 'dd MMM yyyy')}</p>
                      </div>
                      <div>
                        <DocLabel className="mb-0.5">Valid Till</DocLabel>
                        <p className="font-semibold text-success">{format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'dd MMM yyyy')}</p>
                      </div>
                    </div>

                    {/* Middle: Bank details */}
                    <div className="p-4 sm:p-5 border-b md:border-b-0 md:border-r border-rule">
                      <DocLabel className="mb-3">Bank Details (NEFT/RTGS)</DocLabel>
                      <dl className="space-y-2 text-ink-2">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">Bank:</dt>
                          <dd className="font-semibold text-right text-ink">{COMPANY_DETAILS.bank.bankName}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">Account:</dt>
                          <dd className="font-semibold text-right text-ink break-all">{COMPANY_DETAILS.bank.accountNumber}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">IFSC:</dt>
                          <dd className="font-semibold text-right text-ink">{COMPANY_DETAILS.bank.ifscCode}</dd>
                        </div>
                      </dl>
                      <div className="mt-3 border border-rule rounded-lg px-3 py-2 bg-surface">
                        <p className="text-[11px] text-muted mb-0.5">Holder:</p>
                        <p className="font-semibold text-ink text-xs">{COMPANY_DETAILS.bank.accountName}</p>
                      </div>
                    </div>

                    {/* Right: Legal identifiers */}
                    <div className="p-4 sm:p-5 bg-surface-2 space-y-3">
                      <DocLabel className="mb-1">Legal Identifiers</DocLabel>
                      <div>
                        <DocLabel>GSTIN</DocLabel>
                        <p className="font-semibold text-ink break-all">{COMPANY_DETAILS.gstin}</p>
                      </div>
                      <div>
                        <DocLabel>Pan Number</DocLabel>
                        <p className="font-semibold text-ink">{COMPANY_DETAILS.pan}</p>
                      </div>
                      <div>
                        <DocLabel>CIN Number</DocLabel>
                        <p className="font-semibold text-ink break-all">{COMPANY_DETAILS.cin}</p>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Body */}
                <div className="p-4 sm:p-8 space-y-8">

                  {/* Receiver + Subscription summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="min-w-0">
                      <DocLabel className="mb-3 flex items-center gap-1.5 text-accent">
                        <User size={12} aria-hidden="true" /> Receiver Details (Billed To)
                      </DocLabel>
                      <div className="space-y-0.5">
                        <p className="text-lg sm:text-xl font-bold text-ink break-words">{formData.fullName}</p>
                        {formData.designation && <p className="text-sm font-semibold text-accent">{formData.designation}</p>}
                        {formData.organization && <p className="text-sm text-ink-2">{formData.organization}</p>}
                        <div className="pt-2 space-y-0.5 text-xs text-muted break-words">
                          {formData.city && <p>{formData.city}</p>}
                          <p>{[formData.address, formData.state, formData.pincode && `- ${formData.pincode}`, formData.country].filter(Boolean).join(', ')}</p>
                          {formData.gstNumber && <p className="font-semibold text-accent uppercase mt-1">GSTIN: {formData.gstNumber}</p>}
                        </div>
                      </div>
                    </div>

                    <div className="bg-navy rounded-xl p-5 on-dark">
                      <div className="flex justify-end mb-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider on-dark-2 flex items-center gap-1.5">
                          <Calendar size={12} aria-hidden="true" /> Subscription Summary
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider on-dark-2">Category</p>
                          <p className="text-base font-semibold">{formData.userCategory}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider on-dark-2">Duration Plan</p>
                          <p className="text-2xl sm:text-3xl font-bold">{formData.duration}</p>
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t on-dark-edge">
                          <Users size={16} className="on-dark-2" aria-hidden="true" />
                          <span className="text-sm font-semibold">{formData.selectedDepartments.length} Department(s)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Department table */}
                  <div className="table-wrap rounded-xl border border-rule">
                    <table className="data-table min-w-[36rem]">
                      <thead>
                        <tr>
                          <th>Sr. No</th>
                          <th>Department</th>
                          <th>SAC Code</th>
                          <th className="text-right">Base Price</th>
                          <th className="text-right">GST (18%)</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.selectedDepartments.map((deptId, idx) => {
                          const dept = DOMAINS.find(d => d.id === deptId);
                          const gst = basePricePerDept * 0.18;
                          return (
                            <tr key={deptId}>
                              <td className="text-muted font-semibold tabular-nums">{String(idx + 1).padStart(2, '0')}</td>
                              <td className="font-semibold text-ink uppercase">{dept?.name}</td>
                              <td className="text-muted">998439</td>
                              <td className="font-semibold text-ink text-right tabular-nums whitespace-nowrap">₹{basePricePerDept.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-muted text-right tabular-nums whitespace-nowrap">₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="font-bold text-accent text-right tabular-nums whitespace-nowrap">₹{(basePricePerDept + gst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* GST Breakdown + Grand Total */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div>
                      <DocLabel className="mb-3">GST Breakdown</DocLabel>
                      <div className="table-wrap rounded-xl border border-rule">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th className="text-center">Rate</th>
                              <th className="text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {isInterState ? (
                              <tr>
                                <td>IGST</td>
                                <td className="text-center">18%</td>
                                <td className="text-right font-semibold text-ink tabular-nums">₹{gstBreakdown.igst.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                              </tr>
                            ) : (
                              <>
                                <tr>
                                  <td>CGST</td>
                                  <td className="text-center">9%</td>
                                  <td className="text-right font-semibold text-ink tabular-nums">₹{gstBreakdown.cgst.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                                </tr>
                                <tr>
                                  <td>SGST</td>
                                  <td className="text-center">9%</td>
                                  <td className="text-right font-semibold text-ink tabular-nums">₹{gstBreakdown.sgst.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center gap-3">
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-muted">Subtotal (Base Price Total)</span>
                        <span className="font-semibold text-ink tabular-nums whitespace-nowrap">{inr2(gstBreakdown.basePrice)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-muted">Total GST (18%)</span>
                        <span className="font-semibold text-ink tabular-nums whitespace-nowrap">{inr2(gstBreakdown.totalGst)}</span>
                      </div>

                      {/* Coupon Code Section */}
                      {!appliedCoupon ? (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Have a coupon code?"
                            aria-label="Coupon code"
                            className="input h-9 flex-1 min-w-0 uppercase"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleApplyCoupon}
                            loading={couponLoading}
                            disabled={!couponCode}
                            className="h-9"
                          >
                            Apply
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg bg-success-soft px-3 py-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-success uppercase">{appliedCoupon.code}</span>
                            <span className="ml-2 text-sm font-semibold text-success tabular-nums">-{inr2(appliedCoupon.discount)}</span>
                          </div>
                          <button type="button" onClick={removeCoupon} className="text-xs font-semibold text-success hover:underline shrink-0">Remove</button>
                        </div>
                      )}

                      <div className="h-px bg-rule my-1" />
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <span className="text-base font-bold text-ink">GRAND TOTAL</span>
                        <span className="text-xl sm:text-2xl font-bold text-accent tabular-nums">{inr2(gstBreakdown.totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Signature */}
                  <div className="pt-6 border-t border-rule grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <DocLabel className="mb-3 flex items-center gap-1.5">
                        <ShieldCheck size={12} aria-hidden="true" /> Terms &amp; Conditions
                      </DocLabel>
                      <ul className="space-y-2">
                        {[
                          'Subscription will be activated post-payment confirmation.',
                          '18% GST applicable as per Government of India rules.',
                          'Quotation is valid for 30 days from the date of issue.',
                          <span key="jd">All disputes are subject to <strong>Delhi Jurisdiction</strong> only.</span>
                        ].map((t, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-muted">
                            <CheckCircle2 size={14} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-col items-start md:items-end justify-between gap-4">
                      <div className="md:text-right">
                        <DocLabel>For Publisher</DocLabel>
                        <p className="text-sm font-semibold text-ink mt-1">STM Digital Library</p>
                      </div>
                      {/* The signature image is dark ink, so it keeps a white ground in dark mode. */}
                      <div className="w-44 h-24 flex items-center justify-center rounded-lg bg-white">
                        <img src="/assets/signature.png" alt="Authorized Signature" className="max-h-full max-w-full object-contain" />
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">Authorized Signatory</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
                <Button variant="outline" onClick={prevStep}>
                  <ChevronLeft size={16} aria-hidden="true" /> Edit
                </Button>
                <Button variant="outline" onClick={generatePDF}>
                  <Download size={16} aria-hidden="true" /> Download
                </Button>
                <Button onClick={handleSendEmail}>
                  <Send size={16} aria-hidden="true" /> Send Email
                </Button>
              </div>

              <div className="text-center">
                <p className="text-xs text-muted">
                  By proceeding, you agree to our <Link to="/terms-and-conditions" className="text-accent underline">Terms of Service</Link> and <Link to="/privacy-policy" className="text-accent underline">Privacy Policy</Link>.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
