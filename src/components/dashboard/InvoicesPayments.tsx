import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { issuerOf, bankRowsOf, statutoryLineOf } from '../../config';

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
        <h1 className="text-2xl font-bold text-ink tracking-tight">Quotations & Invoices</h1>
        <p className="text-sm text-muted mt-1">Review your quotations, payment history, and download tax invoices.</p>
      </div>

      <div className="flex gap-2 bg-surface p-1 rounded-md w-fit shadow-sm border border-rule">
        <button onClick={() => setActiveTab('quotations')} className={`px-5 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'quotations' ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2'}`}>My Quotations</button>
        <button onClick={() => setActiveTab('invoices')} className={`px-5 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'invoices' ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2'}`}>My Invoices</button>
      </div>

      <div className="bg-surface rounded-md border border-rule shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-surface-2 rounded-md" />)}
          </div>
        ) : activeTab === 'quotations' ? (
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-2 text-xs text-muted font-bold uppercase tracking-widest border-b border-rule">
                <tr>
                  <th className="px-6 py-4">Quotation ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                <AnimatePresence>
                  {quotations.map((quotation, idx) => (
                    <motion.tr 
                      key={quotation.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-bold text-ink-2 bg-surface-2 px-2 py-1 rounded w-max">
                          {quotation.id}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-muted">
                        {new Date(quotation.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-extrabold text-ink border-x border-rule">
                        ₹{quotation.total?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                          quotation.status === 'Approved' ? 'bg-accent-soft text-accent' :
                          quotation.status === 'Paid' ? 'bg-accent-soft text-accent' :
                          quotation.status === 'Cancelled' ? 'bg-surface-2 text-ink-2' :
                          'bg-caution-soft text-caution'
                        }`}>
                          {quotation.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedQuotation(quotation)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-accent hover:text-accent hover:bg-accent-soft rounded-lg transition-colors"
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
                <FileText size={48} className="mx-auto text-faint mb-4" />
                <h3 className="text-lg font-bold text-ink-2">No Quotations found</h3>
                <p className="text-faint text-sm mt-1">You haven't requested any quotations yet.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-2 text-xs text-muted font-bold uppercase tracking-widest border-b border-rule">
                <tr>
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                <AnimatePresence>
                  {payments.map((payment, idx) => (
                    <motion.tr 
                      key={payment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-bold text-ink-2 bg-surface-2 px-2 py-1 rounded w-max">
                          {payment.id.split('_').pop()?.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-muted">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-extrabold text-ink border-x border-rule">
                        ₹{payment.amount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                          payment.status === 'Success' ? 'bg-accent-soft text-accent' : 'bg-alarm-soft text-alarm'
                        }`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {payment.status === 'Success' ? (
                          <button
                            onClick={() => downloadDummyInvoice(payment.id)}
                            className="inline-flex items-center gap-2 p-2 text-muted hover:text-accent hover:bg-accent-soft rounded-lg transition-colors"
                            title="Download PDF Invoice"
                          >
                            <Download size={18} />
                          </button>
                        ) : (
                          <span className="text-faint">-</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>

            {payments.length === 0 && (
              <div className="text-center p-12">
                <FileText size={48} className="mx-auto text-faint mb-4" />
                <h3 className="text-lg font-bold text-ink-2">No payment history</h3>
                <p className="text-faint text-sm mt-1">You haven't made any transactions yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-md w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-ink text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold flex items-center gap-2">
                <FileText size={18} className="text-accent" />
                Quotation Details <span className="text-faint font-normal">#{selectedQuotation.id}</span>
              </h2>
              <button onClick={() => setSelectedQuotation(null)} className="text-faint hover:text-white px-3 py-1 bg-ink-2 rounded-lg transition-colors">Close</button>
            </div>
            
            <div className="flex-1 overflow-hidden min-h-0">
              <div className="grid grid-cols-1 lg:grid-cols-5 h-full min-h-0">
                
                {/* Left side: Info */}
                <div className="lg:col-span-2 bg-surface p-6 overflow-y-auto border-r border-rule">
                  <h3 className="text-sm font-bold text-faint uppercase tracking-wider mb-4">Quotation Summary</h3>
                  
                  <div className="space-y-6">
                    <div className="bg-surface-2 p-4 rounded-md border border-rule">
                      <p className="text-xs text-muted mb-1">Status</p>
                      <span className={`inline-flex px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md ${
                        selectedQuotation.status === 'Approved' ? 'bg-accent-soft text-accent' :
                        selectedQuotation.status === 'Paid' ? 'bg-accent-soft text-accent' :
                        selectedQuotation.status === 'Cancelled' ? 'bg-surface-2 text-ink-2' :
                        'bg-caution-soft text-caution'
                      }`}>
                        {selectedQuotation.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted mb-1">Plan</p>
                        <p className="font-bold text-ink">{selectedQuotation.planType || 'Monthly'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-1">Date</p>
                        <p className="font-bold text-ink">{new Date(selectedQuotation.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="border border-rule rounded-md p-4 bg-surface-2">
                      <p className="text-xs text-muted mb-2">Pricing Breakdown</p>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-2">Subtotal</span>
                        <span className="font-semibold text-ink">₹{selectedQuotation.subtotal?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-3">
                        <span className="text-ink-2">GST (18%)</span>
                        <span className="font-semibold text-ink">₹{selectedQuotation.gstAmount?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-base pt-2 border-t border-rule">
                        <span className="font-bold text-ink">Total</span>
                        <span className="font-black text-accent">₹{selectedQuotation.total?.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="bg-accent-soft text-accent p-4 rounded-md border border-rule">
                      <p className="text-sm font-medium">To proceed with this quotation, please contact your account manager or click upgrade in your dashboard.</p>
                    </div>
                  </div>
                </div>

                {/* Right side: Email Preview */}
                <div className="lg:col-span-3 bg-surface-2 flex flex-col h-full min-h-0">
                  <div className="bg-rule p-3 text-ink-2 flex justify-between items-center shrink-0 border-b border-rule-2">
                    <span className="text-xs font-bold uppercase tracking-wide">Sent Email Copy</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="bg-surface shadow-lg mx-auto max-w-2xl min-h-full border border-rule rounded-sm">
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
                                  <p style={{color:"#93c5fd", margin:"0 0 16px", fontSize:"13px", fontWeight:500}}>{issuerOf(selectedQuotation).positioning}</p>
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
                                        {bankRowsOf(issuerOf(selectedQuotation)).map(([label,val])=>(
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
                                      <p style={{fontSize:"13px", color:"#1e293b", margin:"4px 0"}}>📧 &nbsp;<a href={`mailto:${issuerOf(selectedQuotation).email}`} style={{color:"#2563eb", textDecoration:"none", fontWeight:600}}>{issuerOf(selectedQuotation).email}</a></p>
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
                                        <p style={{color:"#64748b", fontSize:"12px", margin:"0"}}>{issuerOf(selectedQuotation).legalName}</p>
                                        <p style={{color:"#64748b", fontSize:"12px", margin:"4px 0 0"}}>{issuerOf(selectedQuotation).registeredOffice}</p>
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
                                  <p style={{color:"#64748b", fontSize:"11px", margin:"0 0 4px"}}>© {new Date().getFullYear()} {issuerOf(selectedQuotation).legalName}. All rights reserved.</p>
                                  <p style={{color:"#475569", fontSize:"11px", margin:"0"}}>{statutoryLineOf(issuerOf(selectedQuotation))}</p>
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
