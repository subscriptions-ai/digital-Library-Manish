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
  ArrowRight
} from 'lucide-react';
import { DOMAINS, SUBSCRIPTION_PLANS } from '../constants';
import { COMPANY_DETAILS } from '../config';
import { calculateGST, COMPANY_STATE, INDIAN_STATES } from '../lib/gstUtils';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { STM_LOGO_BASE64 } from '../logoBase64';

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

const USER_CATEGORIES = [
  { label: 'Student Scholar',     emoji: '🎓', planId: 'student-plan'   },
  { label: 'College Excellence',  emoji: '🏫', planId: 'college-plan'   },
  { label: 'University Global',   emoji: '🌐', planId: 'university-plan' },
  { label: 'Corporate Innovator', emoji: '💼', planId: 'corporate-plan'  },
];
const DURATIONS = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

export function QuotationWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
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
          const res = await fetch('/api/quotation/next-number');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, orderAmount: totalBasePrice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid coupon');
      setAppliedCoupon({ id: data.couponId, discount: data.discount, code: couponCode.toUpperCase() });
      toast.success('Coupon applied successfully!');
    } catch (e: any) {
      toast.error(e.message);
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
    doc.text('DIVISION OF CONSORTIUM ELEARNING NETWORK PVT. LTD.', pageW / 2, 44, { align: 'center' });

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
    [['GSTIN', '09AACCC6494M1Z1'], ['PAN NUMBER', 'AACCC6494M'], ['CIN NUMBER', 'U80302DL2005PTC138759']].forEach(([lbl, val], i) => {
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
        formData.duration,
        `Rs.${basePricePerDept.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `Rs.${gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `Rs.${(basePricePerDept + gst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      ];
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [['SR.NO', 'DEPARTMENT', 'DURATION', 'BASE PRICE', 'GST (18%)', 'TOTAL']],
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
    doc.text('DIVISION OF CONSORTIUM ELEARNING NETWORK PVT. LTD.', pageW / 2, 32, { align: 'center' });

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
        text: 'These terms and conditions shall apply to all offers, proposals and agreements made between Consortium eLearning Network Pvt. Ltd. (herein referred as CELNET) and any third party or its agent ("the Client") relating to the products and/or services of CELNET ("the Products and/or Services"), whether such products and services are provided within or outside the country, unless otherwise agreed in writing and signed by an authorized signatory of CELNET. Failing this, they will supersede any other terms and conditions, including those contained in any of the Client\'s documentation.',
      },
      {
        title: '2. Offer and acceptance; Description:',
        text: 'Each order for the Products and Services by the Client from CELNET shall be deemed to be an offer by the Client to purchase the Products and Services subject to this T&C. No order placed by the Client shall be deemed to be accepted by CELNET until CELNET issues a written order confirmation to the Client or (if earlier) CELNET delivers the Products or Services to the Client. Client represents and warrants that it has the legal right to use any information, data or other materials with which the Products or Services are used.',
      },
      {
        title: '3. Execution and modification of the order:',
        text: 'Any modification to the agreed product or service description, budget or schedule, as set out in the order acknowledgement, may result in an adjustment to the final price and/or to the delivery schedule by CELNET. No modification shall take effect unless it has been acknowledged in writing by CELNET. CELNET shall not be liable for any delay or failure to perform its obligations under this T&C to the extent that such delay or failure results from a modification requested by the Client.',
      },
      {
        title: '4. Rates and prices:',
        text: 'Unless otherwise agreed by CELNET in writing the prices/rates for the Products shall be those set out in CELNET\'s current pricelists. All such prices/rates shall be exclusive of any handling, packing, loading, freight, transport and insurance charges. All quotations are exclusive of GST. CELNET reserves the right to revise prices at any time. The prices mentioned in this quotation are valid for 30 days from the date of issue.',
      },
      {
        title: '5. Payment:',
        text: 'Unless otherwise agreed in writing, payments shall be effected within thirty (30) days of the invoice date in the currency invoiced. The Client shall make all payments due under the T&C without any deduction whether by way of set-off, counterclaim, discount, abatement or otherwise. Subscription services will only be activated upon receipt of full payment. CELNET reserves the right to suspend access to services in case of delayed or incomplete payment.',
      },
      {
        title: '6. Distribution:',
        text: 'The Client shall not engage in piracy, reproduction, or plagiarism of the Products or any other products of CELNET or its affiliates, nor shall it directly or indirectly facilitate any other party to engage in those activities. The Products and Services are licensed only for the Client\'s own internal use. The Client shall not resell, sublicense, or otherwise transfer the Products or Services to any third party without the prior written consent of CELNET.',
      },
      {
        title: '7. Intellectual property:',
        text: 'Copyright and other intellectual property rights to all CELNET proposals, publications and other Products and/or Services shall remain with CELNET unless agreed otherwise in writing. The rights granted by CELNET are restricted to use solely by the Client and may not be assigned, transferred or sub-licensed. All trademarks, service marks, trade names, logos and other designations of CELNET and its affiliates are the property of CELNET or its affiliates.',
      },
      {
        title: '8. Liability and claims:',
        text: 'TO THE MAXIMUM EXTENT PERMITTED BY RELEVANT LAWS, CELNET shall not be liable for any indirect, incidental, punitive or consequential losses which may arise by reason of any breach of this T&C or any implied warranty, condition or other term. CELNET\'s total liability in connection with any single claim shall not exceed the amount paid by the Client for the relevant Products or Services in the twelve (12) months preceding the event giving rise to liability.',
      },
      {
        title: '9. Force majeure:',
        text: 'If by reason of labor dispute, strikes, inability to obtain labor or materials, fire, flood, natural disaster, pandemic, government regulations, restrictions, or any other cause beyond the reasonable control of either party, such party is unable to perform its obligations under this T&C, then performance of such obligation shall be excused for the duration of the force majeure event. The affected party shall promptly notify the other party in writing of such event.',
      },
      {
        title: '10. Audit:',
        text: 'If Client is an agent, Client shall allow Publisher\'s authorized representative at any reasonable time to have access to Client\'s premises for the purpose of inspecting Client\'s activities, books and records relating to the Products and Services. Client shall maintain accurate records of all uses of the Products and Services and shall provide copies of such records to CELNET upon request. Such audit rights shall survive the termination of this T&C.',
      },
      {
        title: '11. Compliance with laws:',
        text: 'Client shall at all times during the term strictly comply with all applicable laws, ordinances, codes, regulations, standards and judicial and administrative orders relevant to its duties, obligations and performance under this T&C including, without limitation, all applicable data protection laws. Client shall not use the Products or Services for any unlawful purpose or in any way that violates any applicable law or regulation.',
      },
      {
        title: '12. Cancellations & Returns:',
        text: 'Without prejudice to any rights the Client may have under statute as a consumer, if the Client cancels an order, a cancellation fee may be charged. All cancellations must be made in writing. Due to the digital nature of the subscription services, no refunds will be issued once a subscription has been activated and access has been granted. Cancellation requests made within 24 hours of order placement may be considered at CELNET\'s discretion.',
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
      toast.success('Quotation downloaded!', { id: toastId });
    } catch (error: any) {
      console.error('PDF Generation failed:', error);
      toast.error(`PDF Error: ${error?.message || 'Unknown error'}`, { id: toastId, duration: 5000 });
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
          ...(user ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` } : {})
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
            items: checkoutItems
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
      toast.error(error?.message || 'Failed to send email', { id: 'send-email' });
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
          userCategory: formData.userCategory,
          couponCode: appliedCoupon?.code || null,
          discountAmount: appliedCoupon?.discount || 0
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
                {/* Row 1: Organization Name – full width */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700">Organization Name *</label>
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

                {/* Row 2: Full Name | Designation */}
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
                  <label className="text-sm font-bold text-slate-700">Designation</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      name="designation"
                      value={formData.designation}
                      onChange={handleInputChange}
                      placeholder="e.g. Librarian, HOD, Director"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Row 3: Mobile Number | Email ID */}
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

                {/* Row 4: Full Address – full width */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700">Full Address *</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Street, Building, Area details"
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                  />
                </div>

                {/* Row 5: Pincode | City */}
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

                {/* Row 6: State | Country */}
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
                  <label className="text-sm font-bold text-slate-700">Country *</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    placeholder="Country"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>

                {/* Row 7: GST Number – full width */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700">GST Number (Optional)</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      name="gstNumber"
                      value={formData.gstNumber}
                      onChange={handleInputChange}
                      placeholder="ENTER GSTIN IF APPLICABLE"
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
                    User Type
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {USER_CATEGORIES.map(({ label, emoji, planId }) => (
                      <button
                        key={label}
                        onClick={() => setFormData(prev => ({ ...prev, userCategory: label, subscriptionPlanId: planId }))}
                        className={cn(
                          "rounded-xl border-2 py-3 px-2 text-xs font-bold transition-all flex flex-col items-center gap-1",
                          formData.userCategory === label
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
                        )}
                      >
                        <span className="text-xl">{emoji}</span>
                        <span className="leading-tight text-center">{label}</span>
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
              className="space-y-6"
            >
              {/* ── PROFORMA INVOICE card ── */}
              <div ref={previewRef} className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">

                {/* Header */}
                <div className="p-8 border-b border-slate-100">
                  <div className="flex justify-between items-center mb-7">
                    <span className="text-[10px] font-extrabold tracking-widest uppercase border border-blue-300 text-blue-600 rounded-full px-3 py-1">Quotation</span>
                    <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Subject to Delhi Jurisdiction</span>
                  </div>

                  {/* Branding */}
                  <div className="flex flex-col items-center text-center gap-3 mb-7">
                    <div className="w-20 h-20 flex items-center justify-center">
                      <img src="/logo.png" alt="STM Digital Library Logo" className="w-full h-full object-contain drop-shadow-md" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">{COMPANY_DETAILS.name}</h1>
                      <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">Division of Consortium eLearning Network Pvt. Ltd.</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 bg-green-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-wide">
                      <CheckCircle2 size={11} /> 21 Years of Trusted Excellence in Education &amp; Academic Publishing
                    </span>
                    <p className="text-xs text-slate-400">{COMPANY_DETAILS.address} - 201301</p>
                  </div>

                  {/* 3-col info grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 border border-slate-200 rounded-2xl overflow-hidden text-[11px]">

                    {/* Left: Quotation meta */}
                    <div className="p-5 space-y-4 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/40">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Quotation Number</p>
                        <p className="font-black text-blue-600">{quotationNumber || 'Generating...'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Issue Date</p>
                        <p className="font-bold text-slate-800">{format(new Date(), 'dd MMM yyyy')}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Valid Till</p>
                        <p className="font-bold text-green-600">{format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'dd MMM yyyy')}</p>
                      </div>
                    </div>

                    {/* Middle: Bank details */}
                    <div className="p-5 border-b md:border-b-0 md:border-r border-slate-200">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Bank Details (NEFT/RTGS)</p>
                      <div className="space-y-2 text-slate-700">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Bank:</span>
                          <span className="font-bold text-right">{COMPANY_DETAILS.bank.bankName}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Account:</span>
                          <span className="font-bold text-right">{COMPANY_DETAILS.bank.accountNumber}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">IFSC:</span>
                          <span className="font-bold text-right">{COMPANY_DETAILS.bank.ifscCode}</span>
                        </div>
                      </div>
                      <div className="mt-3 border border-slate-200 rounded-lg px-3 py-2 bg-white">
                        <p className="text-[9px] text-slate-400 mb-0.5">Holder:</p>
                        <p className="font-bold text-slate-800 text-xs">{COMPANY_DETAILS.bank.accountName}</p>
                      </div>
                    </div>

                    {/* Right: Legal identifiers */}
                    <div className="p-5 bg-slate-50/40 space-y-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Legal Identifiers</p>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">GSTIN</p>
                        <p className="font-bold text-slate-800">09AACCC6494M1Z1</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Pan Number</p>
                        <p className="font-bold text-slate-800">AACCC6494M</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">CIN Number</p>
                        <p className="font-bold text-slate-800">U80302DL2005PTC138759</p>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Body */}
                <div className="p-8 space-y-8">

                  {/* Receiver + Subscription summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-blue-500 mb-3 flex items-center gap-1.5">
                        <User size={10} /> Receiver Details (Billed To)
                      </p>
                      <div className="space-y-0.5">
                        <p className="text-xl font-black text-slate-900">{formData.fullName}</p>
                        {formData.designation && <p className="text-sm font-bold text-blue-600">{formData.designation}</p>}
                        {formData.organization && <p className="text-sm text-slate-700">{formData.organization}</p>}
                        <div className="pt-2 space-y-0.5 text-xs text-slate-500">
                          {formData.city && <p>{formData.city}</p>}
                          <p>{[formData.address, formData.state, formData.pincode && `- ${formData.pincode}`, formData.country].filter(Boolean).join(', ')}</p>
                          {formData.gstNumber && <p className="font-bold text-blue-600 uppercase mt-1">GSTIN: {formData.gstNumber}</p>}
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-700 rounded-2xl p-5 text-white">
                      <div className="flex justify-end mb-4">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-blue-300 flex items-center gap-1.5">
                          <Calendar size={9} /> Subscription Summary
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Category</p>
                          <p className="text-base font-bold">{formData.userCategory}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Duration Plan</p>
                          <p className="text-3xl font-black">{formData.duration}</p>
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t border-blue-600">
                          <Users size={14} className="text-blue-300" />
                          <span className="text-sm font-bold">{formData.selectedDepartments.length} Department(s)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Department table */}
                  <div className="rounded-2xl overflow-hidden border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-white">
                        <tr>
                          <th className="px-5 py-3 font-bold uppercase tracking-widest">SR.NO</th>
                          <th className="px-5 py-3 font-bold uppercase tracking-widest">Department</th>
                          <th className="px-5 py-3 font-bold uppercase tracking-widest">Duration</th>
                          <th className="px-5 py-3 font-bold uppercase tracking-widest text-right">Base Price</th>
                          <th className="px-5 py-3 font-bold uppercase tracking-widest text-right">GST (18%)</th>
                          <th className="px-5 py-3 font-bold uppercase tracking-widest text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.selectedDepartments.map((deptId, idx) => {
                          const dept = DOMAINS.find(d => d.id === deptId);
                          const gst = basePricePerDept * 0.18;
                          return (
                            <tr key={deptId} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3 text-blue-500 font-bold">{String(idx + 1).padStart(2, '0')}</td>
                              <td className="px-5 py-3 font-black text-slate-800 uppercase">{dept?.name}</td>
                              <td className="px-5 py-3 text-slate-500">{formData.duration}</td>
                              <td className="px-5 py-3 font-bold text-slate-800 text-right">₹{basePricePerDept.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-5 py-3 font-bold text-slate-500 text-right">₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-5 py-3 font-black text-blue-600 text-right">₹{(basePricePerDept + gst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* GST Breakdown + Grand Total */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">GST Breakdown</p>
                      <div className="rounded-xl overflow-hidden border border-slate-200">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-bold text-slate-500">Type</th>
                              <th className="px-4 py-2 text-center font-bold text-slate-500">Rate</th>
                              <th className="px-4 py-2 text-right font-bold text-slate-500">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {isInterState ? (
                              <tr>
                                <td className="px-4 py-2">IGST</td>
                                <td className="px-4 py-2 text-center">18%</td>
                                <td className="px-4 py-2 text-right font-bold">₹{gstBreakdown.igst.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                              </tr>
                            ) : (
                              <>
                                <tr>
                                  <td className="px-4 py-2">CGST</td>
                                  <td className="px-4 py-2 text-center">9%</td>
                                  <td className="px-4 py-2 text-right font-bold">₹{gstBreakdown.cgst.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                                </tr>
                                <tr>
                                  <td className="px-4 py-2">SGST</td>
                                  <td className="px-4 py-2 text-center">9%</td>
                                  <td className="px-4 py-2 text-right font-bold">₹{gstBreakdown.sgst.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center gap-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Subtotal (Base Price Total)</span>
                        <span className="font-bold text-slate-900">₹{gstBreakdown.basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total GST (18%)</span>
                        <span className="font-bold text-slate-900">₹{gstBreakdown.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>

                      {/* Coupon Code Section */}
                      {!appliedCoupon ? (
                        <div className="mt-2 flex items-center space-x-2">
                          <input 
                            type="text" 
                            placeholder="Have a coupon code?" 
                            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm uppercase focus:border-blue-500 focus:outline-none"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                          />
                          <button 
                            type="button"
                            onClick={handleApplyCoupon}
                            disabled={couponLoading || !couponCode}
                            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {couponLoading ? '...' : 'Apply'}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 rounded-md bg-green-50 px-3 py-2 flex items-center justify-between border border-green-200">
                          <div>
                            <span className="text-xs font-bold text-green-700 uppercase">{appliedCoupon.code}</span>
                            <span className="ml-2 text-sm font-bold text-green-700">-₹{appliedCoupon.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <button type="button" onClick={removeCoupon} className="text-xs text-green-700 hover:underline">Remove</button>
                        </div>
                      )}

                      <div className="h-px bg-slate-200 my-1" />
                      <div className="flex justify-between items-center">
                        <span className="text-base font-black text-slate-900">GRAND TOTAL</span>
                        <span className="text-2xl font-black text-blue-600">₹{gstBreakdown.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Signature */}
                  <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                        <ShieldCheck size={10} /> Terms &amp; Conditions
                      </p>
                      <ul className="space-y-2">
                        {[
                          'Subscription will be activated post-payment confirmation.',
                          '18% GST applicable as per Government of India rules.',
                          'Quotation is valid for 30 days from the date of issue.',
                          <span key="jd">All disputes are subject to <strong>Delhi Jurisdiction</strong> only.</span>
                        ].map((t, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                            <CheckCircle2 size={13} className="text-blue-400 mt-0.5 shrink-0" />
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-col items-end justify-between gap-4">
                      <div className="text-right">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">For Publisher</p>
                        <p className="text-sm font-bold text-slate-800 mt-1">STM Digital Library</p>
                      </div>
                      <div className="w-44 h-24 flex items-center justify-center">
                        <img src="/assets/signature.png" alt="Authorized Signature" className="max-h-full max-w-full object-contain" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Authorized Signatory</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={prevStep} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-7 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                  <ChevronLeft size={16} /> Edit
                </button>
                <button onClick={generatePDF} className="flex items-center gap-2 rounded-2xl bg-slate-900 px-7 py-3.5 text-sm font-bold text-white hover:bg-slate-800 transition-all">
                  <Download size={16} /> Download
                </button>
                <button onClick={handleSendEmail} className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-7 py-3.5 text-sm font-bold text-blue-700 hover:bg-blue-100 transition-all">
                  <Send size={16} /> Send Email
                </button>
                <button onClick={handlePayment} className="flex items-center gap-2 rounded-2xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
                  <CreditCard size={16} /> Pay Now
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
