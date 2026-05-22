import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, CheckCircle, XCircle, Mail, MapPin, Building2, Phone, Briefcase, Eye, ArrowRight, X, Calendar, Paperclip, FileText as FileTextIcon } from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";

interface AgencyInquiry {
  id: string;
  agencyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  region: string;
  experience: string;
  message?: string;
  status: string;
  discount?: number;
  validUntil?: string;
  createdAt: string;
}

export function AgencyInquiriesPage() {
  const [inquiries, setInquiries] = useState<AgencyInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  
  // Modal State
  const [selectedInquiry, setSelectedInquiry] = useState<AgencyInquiry | null>(null);
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  
  // Accept State
  const [discountPercent, setDiscountPercent] = useState<number>(30);
  const [validUntil, setValidUntil] = useState<string>("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [acceptHtml, setAcceptHtml] = useState("");

  // Reject State
  const [rejectHtml, setRejectHtml] = useState("");

  useEffect(() => {
    fetchInquiries();
  }, []);

  const fetchInquiries = async () => {
    try {
      const response = await fetch("/api/agency-inquiry", {
        headers: { "Authorization": `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setInquiries(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  };

  // --- HTML TEMPLATES ---

  const generateAcceptHtml = (inquiry: AgencyInquiry, discount: number, dateStr: string) => {
    const validText = dateStr ? `<p style="color: #475569; line-height: 1.6; margin-top: 16px;">This partnership offer is valid until <strong>${format(new Date(dateStr), "MMMM d, yyyy")}</strong>.</p>` : "";
    
    return `
<div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
  <div style="background-color: #2563eb; padding: 24px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">STM Digital Library</h1>
    <p style="color: #bfdbfe; margin: 8px 0 0 0; font-size: 14px;">Partnership Program</p>
  </div>
  <div style="padding: 32px; background-color: #ffffff;">
    <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Welcome aboard, ${inquiry.contactPerson}!</h2>
    <p style="color: #475569; line-height: 1.6;">Thank you for expressing interest in partnering with STM Digital Library. We have reviewed <strong>${inquiry.agencyName}</strong> and your experience in the ${inquiry.region} region.</p>
    
    <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 24px 0; border-radius: 4px;">
      <p style="margin: 0; color: #166534; font-weight: 500;">We are delighted to inform you that your partnership proposal has been <strong>APPROVED</strong>!</p>
    </div>

    <p style="color: #475569; line-height: 1.6; margin-bottom: 0;">As an official partner, you are entitled to a flat <strong style="color: #2563eb; font-size: 18px;">${discount}% discount</strong> on all our digital library subscriptions when referring institutions.</p>
    ${validText}

    <h3 style="color: #1e293b; margin-top: 32px; font-size: 16px;">Next Steps</h3>
    <ul style="color: #475569; line-height: 1.6; padding-left: 20px;">
      <li>Review the attached partnership agreement terms.</li>
      <li>Our onboarding team will schedule a product training session.</li>
      <li>You will receive access to your partner dashboard shortly.</li>
    </ul>

    <p style="color: #475569; line-height: 1.6; margin-top: 32px;">We look forward to a successful and long-term partnership with you.</p>
    
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #64748b; font-size: 14px;">Best regards,</p>
      <p style="margin: 4px 0 0 0; color: #0f172a; font-weight: 600;">STM Digital Library Partnership Team</p>
    </div>
  </div>
</div>
`.trim();
  };

  const generateRejectHtml = (inquiry: AgencyInquiry) => {
    return `
<div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
  <div style="background-color: #1e293b; padding: 24px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">STM Digital Library</h1>
    <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Partnership Program</p>
  </div>
  <div style="padding: 32px; background-color: #ffffff;">
    <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Update on Your Application</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${inquiry.contactPerson},</p>
    <p style="color: #475569; line-height: 1.6;">Thank you for taking the time to apply for the STM Digital Library Agency Partnership Program and for sharing the details about <strong>${inquiry.agencyName}</strong>.</p>
    
    <p style="color: #475569; line-height: 1.6;">We have carefully reviewed your application. Unfortunately, we are unable to proceed with your partnership proposal at this time. We receive many applications and currently have limited capacity in the <strong>${inquiry.region}</strong> region.</p>

    <p style="color: #475569; line-height: 1.6;">We truly appreciate your interest in STM Digital Library and wish you and your agency the best of luck in your future endeavors. We will keep your information on file should our requirements change in the future.</p>
    
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #64748b; font-size: 14px;">Best regards,</p>
      <p style="margin: 4px 0 0 0; color: #0f172a; font-weight: 600;">STM Digital Library Partnership Team</p>
    </div>
  </div>
</div>
`.trim();
  };

  // --- PDF GENERATOR ---

  const generatePartnershipPDFBase64 = (inquiry: AgencyInquiry, discount: number, dateStr: string): string => {
    const doc = new jsPDF();
    
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("STM Digital Library", 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("Official Agency Partnership Agreement", 105, 30, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`Date: ${format(new Date(), "MMMM d, yyyy")}`, 20, 60);
    doc.text(`Agency Name: ${inquiry.agencyName}`, 20, 70);
    doc.text(`Contact Person: ${inquiry.contactPerson}`, 20, 80);
    doc.text(`Approved Discount Tier: ${discount}%`, 20, 90);
    if (dateStr) {
      doc.text(`Agreement Valid Until: ${format(new Date(dateStr), "MMMM d, yyyy")}`, 20, 100);
    }

    doc.setFontSize(10);
    const textY = dateStr ? 120 : 110;
    const terms = [
      "1. This agreement appoints the Agency as a non-exclusive partner for referring institutions.",
      "2. The Agency will receive the approved discount on list prices for all referred sales.",
      "3. The Agency must adhere to the STM Digital Library branding guidelines.",
      "4. All sales must be processed through the official portal.",
      "5. STM Digital Library reserves the right to terminate this agreement at any time."
    ];

    doc.text("Terms and Conditions:", 20, textY);
    terms.forEach((term, index) => {
      doc.text(term, 20, textY + 10 + (index * 10));
    });

    doc.text("STM Authorization Signature:", 20, textY + 80);
    doc.line(20, textY + 95, 80, textY + 95);
    doc.text("STM Digital Library Management", 20, textY + 105);

    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
  };

  // --- HANDLERS ---

  const handleOpenAcceptModal = (inquiry: AgencyInquiry) => {
    setSelectedInquiry(inquiry);
    setDiscountPercent(30);
    setValidUntil("");
    setAttachPdf(true);
    setAcceptHtml(generateAcceptHtml(inquiry, 30, ""));
    setIsAcceptModalOpen(true);
  };

  const handleOpenRejectModal = (inquiry: AgencyInquiry) => {
    setSelectedInquiry(inquiry);
    setRejectHtml(generateRejectHtml(inquiry));
    setIsRejectModalOpen(true);
  };

  const handleDiscountChange = (val: number) => {
    setDiscountPercent(val);
    if (selectedInquiry) setAcceptHtml(generateAcceptHtml(selectedInquiry, val, validUntil));
  };

  const handleDateChange = (val: string) => {
    setValidUntil(val);
    if (selectedInquiry) setAcceptHtml(generateAcceptHtml(selectedInquiry, discountPercent, val));
  };

  const handleSendAcceptance = async () => {
    if (!selectedInquiry) return;
    
    toast.loading("Sending email & updating status...", { id: "accept" });
    try {
      const payload: any = {
        id: selectedInquiry.id,
        discount: discountPercent,
        validUntil: validUntil || null,
        subject: "Welcome to the STM Digital Library Agency Partnership Program",
        html: acceptHtml
      };

      if (attachPdf) {
        payload.attachment = {
          filename: "Partnership_Agreement.pdf",
          content: generatePartnershipPDFBase64(selectedInquiry, discountPercent, validUntil)
        };
      }

      const response = await fetch("/api/agency-inquiry/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Failed to accept");
      
      toast.success("Partnership accepted and email sent!", { id: "accept" });
      setIsAcceptModalOpen(false);
      fetchInquiries();
    } catch (error) {
      console.error(error);
      toast.error("Failed to process request", { id: "accept" });
    }
  };

  const handleSendRejection = async () => {
    if (!selectedInquiry) return;

    toast.loading("Sending rejection email...", { id: "reject" });
    try {
      const response = await fetch("/api/agency-inquiry/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          id: selectedInquiry.id,
          subject: "Update on Your STM Digital Library Partnership Application",
          html: rejectHtml
        })
      });

      if (!response.ok) throw new Error("Failed to reject");
      
      toast.success("Partnership rejected and email sent", { id: "reject" });
      setIsRejectModalOpen(false);
      fetchInquiries();
    } catch (error) {
      console.error(error);
      toast.error("Failed to process rejection", { id: "reject" });
    }
  };

  const filteredInquiries = inquiries.filter(inq => {
    const matchesSearch = inq.agencyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          inq.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || inq.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agency Partnership Inquiries</h1>
          <p className="text-slate-500 mt-1">Review and manage agency partnership requests</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search by agency name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={20} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Accepted">Accepted</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                  <th className="p-4">Agency Details</th>
                  <th className="p-4">Region & Experience</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredInquiries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No inquiries found.
                    </td>
                  </tr>
                ) : (
                  filteredInquiries.map((inq) => (
                    <tr key={inq.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-1">
                            <Building2 size={16} />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{inq.agencyName}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><Mail size={12}/> {inq.email}</span>
                              <span className="flex items-center gap-1"><Phone size={12}/> {inq.phone}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Contact: {inq.contactPerson}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 align-top">
                        <div className="space-y-1">
                          <p className="text-sm text-slate-700 flex items-center gap-1.5">
                            <MapPin size={14} className="text-slate-400"/> {inq.region}
                          </p>
                          <p className="text-sm text-slate-700 flex items-center gap-1.5">
                            <Briefcase size={14} className="text-slate-400"/> {inq.experience} Years
                          </p>
                        </div>
                      </td>
                      <td className="p-4 align-top">
                        <p className="text-sm text-slate-700">{format(new Date(inq.createdAt), "MMM d, yyyy")}</p>
                      </td>
                      <td className="p-4 align-top">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          inq.status === 'Accepted' ? 'bg-green-100 text-green-700' :
                          inq.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {inq.status === 'Accepted' && <CheckCircle size={12} />}
                          {inq.status === 'Rejected' && <XCircle size={12} />}
                          {inq.status === 'Pending' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                          {inq.status} {inq.discount ? `(${inq.discount}%)` : ''}
                        </span>
                        {inq.status === 'Accepted' && inq.validUntil && (
                          <div className="text-[10px] text-slate-500 mt-1">
                            Valid until: {format(new Date(inq.validUntil), "MMM d, yyyy")}
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-top text-right space-x-2">
                        {inq.status === "Pending" && (
                          <>
                            <button
                              onClick={() => handleOpenAcceptModal(inq)}
                              className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleOpenRejectModal(inq)}
                              className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors shadow-sm border border-red-100"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Acceptance Modal */}
      <AnimatePresence>
        {isAcceptModalOpen && selectedInquiry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsAcceptModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Accept Partnership & Send Email</h3>
                  <p className="text-sm text-slate-500 mt-1">Configure the terms and preview the acceptance email.</p>
                </div>
                <button 
                  onClick={() => setIsAcceptModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-0 overflow-y-auto flex-1 flex flex-col lg:flex-row">
                {/* Configuration Sidebar */}
                <div className="w-full lg:w-1/3 bg-slate-50 p-6 border-r border-slate-200 space-y-6 flex-shrink-0">
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-slate-900">Set Discount Tier (%)</label>
                    <div className="flex flex-col gap-3">
                      <button onClick={() => handleDiscountChange(30)} className={`p-3 rounded-xl border-2 text-left transition-all ${discountPercent === 30 ? 'border-blue-500 bg-blue-100/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                        <div className="flex justify-between items-center"><span className="font-bold text-base text-slate-900">30%</span>{discountPercent === 30 && <CheckCircle size={18} className="text-blue-500" />}</div>
                        <p className="text-xs text-slate-500 mt-1">Standard</p>
                      </button>
                      <button onClick={() => handleDiscountChange(40)} className={`p-3 rounded-xl border-2 text-left transition-all ${discountPercent === 40 ? 'border-blue-500 bg-blue-100/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                        <div className="flex justify-between items-center"><span className="font-bold text-base text-slate-900">40%</span>{discountPercent === 40 && <CheckCircle size={18} className="text-blue-500" />}</div>
                        <p className="text-xs text-slate-500 mt-1">Premium</p>
                      </button>
                      <div className={`p-3 rounded-xl border-2 flex flex-col transition-all ${!([30, 40].includes(discountPercent)) ? 'border-blue-500 bg-blue-100/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-2">
                          <input type="number" className="w-full bg-transparent font-bold text-base text-slate-900 focus:outline-none" placeholder="Custom %" value={discountPercent} onChange={(e) => handleDiscountChange(Number(e.target.value))} />
                          {!([30, 40].includes(discountPercent)) && <CheckCircle size={18} className="text-blue-500" />}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Custom</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-bold text-slate-900">Partnership Validity</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input type="date" value={validUntil} onChange={(e) => handleDateChange(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                    <p className="text-xs text-slate-500">Leave blank for no expiration.</p>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="mt-0.5">
                        <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><FileTextIcon size={14} className="text-blue-500"/> Attach Partnership Form PDF</span>
                        <p className="text-xs text-slate-500 mt-1">Automatically generates and attaches the official agreement PDF with the chosen terms.</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Email Preview Area */}
                <div className="w-full lg:w-2/3 p-6 flex flex-col min-h-[500px]">
                  <label className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2"><Eye size={16}/> Live Email HTML Preview</label>
                  <p className="text-xs text-slate-500 mb-4">This is exactly how the email will look to the recipient.</p>
                  <div 
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl overflow-y-auto p-6"
                    dangerouslySetInnerHTML={{ __html: acceptHtml }}
                  />
                  <div className="mt-4">
                    <details className="group">
                      <summary className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">Edit Raw HTML Code</summary>
                      <textarea
                        rows={8}
                        value={acceptHtml}
                        onChange={(e) => setAcceptHtml(e.target.value)}
                        className="w-full mt-2 p-3 text-xs font-mono text-slate-700 bg-slate-900 text-slate-300 rounded-xl focus:outline-none"
                      />
                    </details>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsAcceptModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendAcceptance}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
                >
                  <Mail size={16} />
                  Send & Accept Partnership
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rejection Modal */}
      <AnimatePresence>
        {isRejectModalOpen && selectedInquiry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsRejectModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-red-50/50">
                <div>
                  <h3 className="text-xl font-bold text-red-900">Reject Partnership Proposal</h3>
                  <p className="text-sm text-red-500 mt-1">Agency: {selectedInquiry.agencyName}</p>
                </div>
                <button 
                  onClick={() => setIsRejectModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex flex-col min-h-[400px]">
                <label className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2"><Eye size={16}/> Live Email HTML Preview</label>
                <p className="text-xs text-slate-500 mb-4">This polite rejection email will be sent immediately.</p>
                <div 
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl overflow-y-auto p-6"
                  dangerouslySetInnerHTML={{ __html: rejectHtml }}
                />
                <div className="mt-4">
                  <details className="group">
                    <summary className="text-xs text-red-600 font-medium cursor-pointer hover:underline">Edit Raw HTML Code</summary>
                    <textarea
                      rows={6}
                      value={rejectHtml}
                      onChange={(e) => setRejectHtml(e.target.value)}
                      className="w-full mt-2 p-3 text-xs font-mono text-slate-700 bg-slate-900 text-slate-300 rounded-xl focus:outline-none"
                    />
                  </details>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsRejectModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendRejection}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
                >
                  <Mail size={16} />
                  Send Rejection Email
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
