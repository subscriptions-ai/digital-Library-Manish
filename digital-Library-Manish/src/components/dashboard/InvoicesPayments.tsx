import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function InvoicesPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'quotations' | 'invoices'>('quotations');
  const [selectedQuotation, setSelectedQuotation] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/user/invoices', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()),
      fetch('/api/user/quotations', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json())
    ])
      .then(([paymentsData, quotationsData]) => {
        setPayments(paymentsData);
        setQuotations(quotationsData);
      })
      .catch(() => toast.error("Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  const downloadDummyInvoice = (id: string) => {
    const link = document.createElement('a');
    link.href = `data:text/plain;charset=utf-8,Mock%20Invoice%20Data%20for%20Payment:%20${id}`;
    link.download = `Invoice_${id.slice(-6)}.txt`;
    link.click();
    toast.success("Invoice downloaded!");
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quotations & Invoices</h1>
        <p className="text-sm text-slate-500 mt-1">Review your quotations, payment history, and download tax invoices.</p>
      </div>

      <div className="flex gap-2 bg-white p-1 rounded-xl w-fit shadow-sm border border-slate-100">
        <button onClick={() => setActiveTab('quotations')} className={`px-5 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'quotations' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>My Quotations</button>
        <button onClick={() => setActiveTab('invoices')} className={`px-5 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'invoices' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>My Invoices</button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
          </div>
        ) : activeTab === 'quotations' ? (
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 font-bold uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Quotation ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <AnimatePresence>
                  {quotations.map((quotation, idx) => (
                    <motion.tr 
                      key={quotation.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded w-max">
                          {quotation.id}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-500">
                        {new Date(quotation.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-extrabold text-slate-900 border-x border-slate-50">
                        ₹{quotation.total?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                          quotation.status === 'Approved' ? 'bg-blue-100 text-blue-700' :
                          quotation.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                          quotation.status === 'Cancelled' ? 'bg-slate-100 text-slate-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {quotation.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedQuotation(quotation)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          View Email Template
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>

            {quotations.length === 0 && (
              <div className="text-center p-12">
                <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                <h3 className="text-lg font-bold text-slate-600">No Quotations found</h3>
                <p className="text-slate-400 text-sm mt-1">You haven't requested any quotations yet.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 font-bold uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <AnimatePresence>
                  {payments.map((payment, idx) => (
                    <motion.tr 
                      key={payment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded w-max">
                          {payment.id.split('_').pop()?.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-500">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-extrabold text-slate-900 border-x border-slate-50">
                        ₹{payment.amount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                          payment.status === 'Success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {payment.status === 'Success' ? (
                          <button
                            onClick={() => downloadDummyInvoice(payment.id)}
                            className="inline-flex items-center gap-2 p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Download PDF Invoice"
                          >
                            <Download size={18} />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>

            {payments.length === 0 && (
              <div className="text-center p-12">
                <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                <h3 className="text-lg font-bold text-slate-600">No payment history</h3>
                <p className="text-slate-400 text-sm mt-1">You haven't made any transactions yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold flex items-center gap-2">
                <FileText size={18} className="text-blue-400" />
                Quotation Details <span className="text-slate-400 font-normal">#{selectedQuotation.id}</span>
              </h2>
              <button onClick={() => setSelectedQuotation(null)} className="text-slate-400 hover:text-white px-3 py-1 bg-slate-800 rounded-lg transition-colors">Close</button>
            </div>
            
            <div className="flex-1 overflow-hidden min-h-0">
              <div className="grid grid-cols-1 lg:grid-cols-5 h-full min-h-0">
                
                {/* Left side: Info */}
                <div className="lg:col-span-2 bg-white p-6 overflow-y-auto border-r border-slate-200">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Quotation Summary</h3>
                  
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 mb-1">Status</p>
                      <span className={`inline-flex px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md ${
                        selectedQuotation.status === 'Approved' ? 'bg-blue-100 text-blue-700' :
                        selectedQuotation.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                        selectedQuotation.status === 'Cancelled' ? 'bg-slate-100 text-slate-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {selectedQuotation.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Plan</p>
                        <p className="font-bold text-slate-900">{selectedQuotation.planType || 'Monthly'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Date</p>
                        <p className="font-bold text-slate-900">{new Date(selectedQuotation.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <p className="text-xs text-slate-500 mb-2">Pricing Breakdown</p>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">Subtotal</span>
                        <span className="font-semibold text-slate-900">₹{selectedQuotation.subtotal?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-3">
                        <span className="text-slate-600">GST (18%)</span>
                        <span className="font-semibold text-slate-900">₹{selectedQuotation.gstAmount?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-base pt-2 border-t border-slate-200">
                        <span className="font-bold text-slate-900">Total</span>
                        <span className="font-black text-blue-600">₹{selectedQuotation.total?.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100">
                      <p className="text-sm font-medium">To proceed with this quotation, please contact your account manager or click upgrade in your dashboard.</p>
                    </div>
                  </div>
                </div>

                {/* Right side: Email Preview */}
                <div className="lg:col-span-3 bg-slate-100 flex flex-col h-full min-h-0">
                  <div className="bg-slate-200 p-3 text-slate-600 flex justify-between items-center shrink-0 border-b border-slate-300">
                    <span className="text-xs font-bold uppercase tracking-wide">Sent Email Copy</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="bg-white shadow-lg mx-auto max-w-2xl min-h-full border border-slate-200 rounded-sm">
                      {selectedQuotation.sentEmailHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: selectedQuotation.sentEmailHtml }} />
                      ) : (
                        <div style={{margin:0, padding:0, backgroundColor:"#eef2f7", fontFamily:"'Segoe UI',Arial,sans-serif"}}>
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{backgroundColor:"#eef2f7", padding:"32px 0"}}>
                            <tbody><tr><td align="center">
                            <table width="620" cellPadding={0} cellSpacing={0} style={{background:"#ffffff", borderRadius:"16px", overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.10)", maxWidth:"620px"}}>
                              <tbody>
                              <tr>
                                <td style={{background:"linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%)", padding:"32px 48px 28px", textAlign:"center"}}>
                                  <img src="/assets/stm-logo.png" alt="STM Digital Library" width="90" height="90" style={{display:"block", margin:"0 auto 16px", borderRadius:"12px"}} onError={(e:any)=>e.target.style.display="none"} />
                                  <h1 style={{color:"#ffffff", margin:"0 0 6px", fontSize:"26px", fontWeight:900, letterSpacing:"1px"}}>STM DIGITAL LIBRARY</h1>
                                  <p style={{color:"#93c5fd", margin:"0 0 16px", fontSize:"13px", fontWeight:500}}>A Division of Consortium eLearning Network Pvt. Ltd.</p>
                                  <span style={{display:"inline-block", background:"#15803d", color:"#ffffff", fontSize:"11px", fontWeight:700, borderRadius:"30px", padding:"6px 20px", letterSpacing:"1px"}}>
                                    🏆 &nbsp;21 Years of Trusted Excellence in Education &amp; Academic Publishing
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td style={{padding:"36px 48px 0"}}>
                                  <p style={{fontSize:"16px", color:"#1e293b", margin:"0 0 6px", fontWeight:600}}>Dear Subscriber,</p>
                                  <p style={{fontSize:"14px", color:"#475569", lineHeight:"1.75", margin:"0 0 20px"}}>
                                    Greetings from <strong>STM Digital Library</strong>!<br/>
                                    Thank you for your interest in our digital library subscription services.<br/>
                                    Please find below the quotation for the selected department(s) and subscription duration.
                                  </p>
                                  <hr style={{border:"none", borderTop:"1px solid #e2e8f0", margin:"0 0 28px"}} />
                                </td>
                              </tr>
                              <tr>
                                <td style={{padding:"0 48px 28px"}}>
                                  <table width="100%" cellPadding={0} cellSpacing={0} style={{background:"linear-gradient(135deg,#1d4ed8,#1e40af)", borderRadius:"14px", overflow:"hidden"}}>
                                    <tbody><tr><td style={{padding:"20px 28px"}}>
                                      <p style={{color:"#bfdbfe", fontSize:"10px", fontWeight:700, letterSpacing:"2.5px", textTransform:"uppercase", margin:"0 0 18px"}}>📄 &nbsp;Quotation Details</p>
                                      <table width="100%" cellPadding={0} cellSpacing={0}><tbody>
                                        <tr>
                                          <td style={{color:"#93c5fd", fontSize:"12px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)", width:"55%"}}>Quotation Number</td>
                                          <td style={{color:"#ffffff", fontSize:"13px", fontWeight:700, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>{selectedQuotation.id}</td>
                                        </tr>
                                        <tr>
                                          <td style={{color:"#93c5fd", fontSize:"12px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>Quotation Date</td>
                                          <td style={{color:"#ffffff", fontSize:"13px", fontWeight:600, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>{selectedQuotation.createdAt ? new Date(selectedQuotation.createdAt).toLocaleDateString() : "—"}</td>
                                        </tr>
                                        <tr>
                                          <td style={{color:"#93c5fd", fontSize:"12px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>Subscription Validity</td>
                                          <td style={{color:"#86efac", fontSize:"13px", fontWeight:600, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>30 Days from Issue</td>
                                        </tr>
                                        <tr>
                                          <td style={{color:"#93c5fd", fontSize:"12px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>Subscription Duration</td>
                                          <td style={{color:"#ffffff", fontSize:"13px", fontWeight:600, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>{selectedQuotation.planType || "—"}</td>
                                        </tr>
                                      </tbody></table>
                                      {((selectedQuotation.items?.length > 0) || (selectedQuotation.pricingBreakdown?.breakdown?.length > 0)) && (
                                        <>
                                          <p style={{color:"#93c5fd", fontSize:"12px", margin:"14px 0 6px"}}>Selected Department(s)</p>
                                          <ul style={{margin:"0 0 14px", paddingLeft:"4px", listStyle:"none"}}>
                                            {(selectedQuotation.items?.length > 0 ? selectedQuotation.items : selectedQuotation.pricingBreakdown?.breakdown || []).map((b: any, i: number) => (
                                              <li key={i} style={{padding:"4px 0", color:"#e2e8f0", fontSize:"14px"}}>✅ &nbsp;{b.domainName || b.domain || b.contentType}</li>
                                            ))}
                                          </ul>
                                        </>
                                      )}
                                      <table width="100%" cellPadding={0} cellSpacing={0} style={{borderTop:"1px solid rgba(255,255,255,0.25)", paddingTop:"14px", marginTop:"4px"}}><tbody>
                                        <tr>
                                          <td style={{color:"#bfdbfe", fontSize:"13px", fontWeight:600, paddingTop:"14px"}}>Total Amount (Including 18% GST)</td>
                                          <td style={{textAlign:"right", paddingTop:"14px"}}>
                                            <span style={{color:"#ffffff", fontSize:"22px", fontWeight:900}}>₹{selectedQuotation.total?.toLocaleString("en-IN", {minimumFractionDigits:2})}</span>
                                          </td>
                                        </tr>
                                      </tbody></table>
                                    </td></tr></tbody>
                                  </table>
                                </td>
                              </tr>
                              <tr>
                                <td style={{padding:"0 48px 28px"}}>
                                  <table width="100%" cellPadding={0} cellSpacing={0} style={{background:"#fefce8", borderRadius:"14px", border:"1px solid #fde68a"}}>
                                    <tbody><tr><td style={{padding:"22px 28px"}}>
                                      <p style={{color:"#92400e", fontSize:"11px", fontWeight:700, letterSpacing:"2px", textTransform:"uppercase", margin:"0 0 14px"}}>💳 &nbsp;Payment Information</p>
                                      <p style={{color:"#78350f", fontSize:"13px", fontWeight:600, margin:"0 0 12px"}}>Payments must be made only to:</p>
                                      <table width="100%" cellPadding={0} cellSpacing={0}><tbody>
                                        {([["Account Name","Consortium eLearning Network Pvt. Ltd."],["Account Number","03942000001153"],["Bank Name","HDFC Bank"],["Branch","Sector-62, Noida, U.P., India"],["IFSC Code","HDFC0002649"]] as [string,string][]).map(([label,val])=>(
                                          <tr key={label}>
                                            <td style={{color:"#92400e", fontSize:"12px", padding:"5px 0", borderBottom:"1px solid #fde68a", width:"45%"}}>{label}</td>
                                            <td style={{color:"#1e293b", fontSize:"13px", fontWeight:700, padding:"5px 0", borderBottom:"1px solid #fde68a"}}>{val}</td>
                                          </tr>
                                        ))}
                                      </tbody></table>
                                    </td></tr></tbody>
                                  </table>
                                </td>
                              </tr>
                              <tr>
                                <td style={{padding:"0 48px 28px"}}>
                                  <table width="100%" cellPadding={0} cellSpacing={0} style={{background:"#f0fdf4", borderRadius:"14px", border:"1px solid #bbf7d0"}}>
                                    <tbody><tr><td style={{padding:"22px 28px"}}>
                                      <p style={{color:"#15803d", fontSize:"11px", fontWeight:700, letterSpacing:"2px", textTransform:"uppercase", margin:"0 0 14px"}}>📞 &nbsp;Contact Information</p>
                                      <p style={{color:"#166534", fontSize:"13px", fontWeight:500, margin:"0 0 10px"}}>For any assistance regarding subscription, quotation, or payment:</p>
                                      <p style={{fontSize:"13px", color:"#1e293b", margin:"4px 0"}}>📧 &nbsp;<a href="mailto:info@celnet.in" style={{color:"#2563eb", textDecoration:"none", fontWeight:600}}>info@celnet.in</a></p>
                                      <p style={{fontSize:"13px", color:"#1e293b", margin:"4px 0"}}>📞 &nbsp;+91-9810078958</p>
                                      <p style={{fontSize:"13px", color:"#1e293b", margin:"4px 0"}}>🌐 &nbsp;<a href="https://journalslibrary.com/" style={{color:"#2563eb", textDecoration:"none", fontWeight:600}}>journalslibrary.com</a></p>
                                    </td></tr></tbody>
                                  </table>
                                </td>
                              </tr>
                              <tr>
                                <td style={{padding:"0 48px 28px"}}>
                                  <table width="100%" cellPadding={0} cellSpacing={0} style={{borderTop:"2px solid #e2e8f0", paddingTop:"24px"}}><tbody>
                                    <tr>
                                      <td style={{paddingTop:"20px"}}>
                                        <p style={{color:"#475569", fontSize:"14px", margin:"0 0 4px"}}>Warm regards,</p>
                                        <p style={{color:"#1e293b", fontSize:"15px", fontWeight:700, margin:"0 0 2px"}}>STM Digital Library Team</p>
                                        <p style={{color:"#64748b", fontSize:"12px", margin:"0"}}>Consortium eLearning Network Pvt. Ltd.</p>
                                        <p style={{color:"#64748b", fontSize:"12px", margin:"4px 0 0"}}>A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India</p>
                                      </td>
                                      <td style={{textAlign:"right", verticalAlign:"bottom", paddingTop:"20px"}}>
                                        <p style={{color:"#94a3b8", fontSize:"10px", fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", margin:"0 0 4px"}}>For Publisher</p>
                                        <p style={{color:"#1e293b", fontSize:"13px", fontWeight:700, margin:"0 0 4px"}}>STM Digital Library</p>
                                        <p style={{color:"#64748b", fontSize:"11px", fontWeight:700, letterSpacing:"1px", textTransform:"uppercase", margin:"0"}}>Authorized Signatory</p>
                                      </td>
                                    </tr>
                                  </tbody></table>
                                </td>
                              </tr>
                              <tr>
                                <td style={{background:"linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%)", padding:"28px 48px", textAlign:"center"}}>
                                  <p style={{color:"#f8fafc", fontSize:"13px", fontWeight:700, margin:"0 0 6px", letterSpacing:"0.5px"}}>🏆 &nbsp;21 Years of Trusted Excellence in Education &amp; Academic Publishing</p>
                                  <p style={{color:"#64748b", fontSize:"11px", margin:"0 0 4px"}}>© {new Date().getFullYear()} Consortium eLearning Network Pvt. Ltd. All rights reserved.</p>
                                  <p style={{color:"#475569", fontSize:"11px", margin:"0"}}>GSTIN: 09AACCC6494M1Z1 &nbsp;|&nbsp; PAN: AACCC6494M &nbsp;|&nbsp; CIN: U80302DL2005PTC138759</p>
                                </td>
                              </tr>
                              </tbody>
                            </table>
                            </td></tr></tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
