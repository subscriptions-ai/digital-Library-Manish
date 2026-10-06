import React, { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { issuerOf, bankRowsOf, statutoryLineOf } from '../../config';
import { Button, EmptyState, PageHeader, SkeletonRows, StatusBadge } from '../ui';

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
        // An error answers with an object, not a list; never hand one to .map.
        if (!Array.isArray(paymentsData) || !Array.isArray(quotationsData)) throw new Error();
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

  // The quotation preview is a dialog; Escape puts it away like any other.
  useEffect(() => {
    if (!selectedQuotation) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedQuotation(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedQuotation]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        className="mb-0"
        title="Quotations & Invoices"
        description="Review your quotations, payment history, and download tax invoices."
      />

      <div className="flex w-fit max-w-full gap-1 rounded-lg border border-rule bg-surface-2 p-1" role="group" aria-label="Show">
        <button type="button" aria-pressed={activeTab === 'quotations'} onClick={() => setActiveTab('quotations')} className={`h-8 rounded-md px-4 text-sm font-semibold transition-colors duration-150 ${activeTab === 'quotations' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink-2'}`}>My Quotations</button>
        <button type="button" aria-pressed={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')} className={`h-8 rounded-md px-4 text-sm font-semibold transition-colors duration-150 ${activeTab === 'invoices' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink-2'}`}>My Invoices</button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6">
            <SkeletonRows rows={5} />
          </div>
        ) : activeTab === 'quotations' ? (
          quotations.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No quotations yet"
              description="You haven't requested any quotations yet."
            />
          ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Quotation ID</th>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => (
                  <tr key={quotation.id}>
                    <td>
                      <span className="whitespace-nowrap rounded bg-surface-2 px-2 py-1 font-mono text-xs font-semibold text-ink-2">
                        {quotation.id}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {new Date(quotation.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap font-semibold text-ink tabular-nums">
                      ₹{quotation.total?.toLocaleString()}
                    </td>
                    <td>
                      <StatusBadge status={quotation.status} />
                    </td>
                    <td className="text-right">
                      <Button variant="ghost" size="sm" className="text-accent" onClick={() => setSelectedQuotation(quotation)}>
                        View Email Template
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        ) : payments.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="You haven't made any transactions yet."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Transaction ID</th>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <span className="whitespace-nowrap rounded bg-surface-2 px-2 py-1 font-mono text-xs font-semibold text-ink-2">
                        {payment.id.split('_').pop()?.toUpperCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {new Date(payment.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap font-semibold text-ink tabular-nums">
                      ₹{payment.amount?.toLocaleString()}
                    </td>
                    <td>
                      {payment.status === 'Success'
                        ? <StatusBadge status="paid" label={payment.status} />
                        : <StatusBadge status={payment.status} />}
                    </td>
                    <td className="text-right">
                      {payment.status === 'Success' ? (
                        <button
                          type="button"
                          onClick={() => downloadDummyInvoice(payment.id)}
                          className="btn btn-ghost btn-icon btn-sm text-muted hover:text-accent"
                          title="Download PDF Invoice"
                          aria-label="Download invoice"
                        >
                          <Download size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="text-faint" aria-label="Not available">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-2 backdrop-blur-sm sm:p-4" onClick={() => setSelectedQuotation(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quotation-dialog-title"
            className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-rule bg-surface shadow-2xl sm:h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6">
              <h2 id="quotation-dialog-title" className="flex min-w-0 items-center gap-2 type-card-title text-ink">
                <FileText size={18} className="shrink-0 text-accent" aria-hidden="true" />
                <span className="truncate">Quotation Details <span className="font-normal text-muted">#{selectedQuotation.id}</span></span>
              </h2>
              <Button variant="outline" size="sm" onClick={() => setSelectedQuotation(null)} autoFocus>
                <X size={16} aria-hidden="true" /> Close
              </Button>
            </div>
            
            <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
              <div className="grid min-h-0 grid-cols-1 lg:h-full lg:grid-cols-5">
                
                {/* Left side: Info */}
                <div className="overflow-y-auto border-b border-rule bg-surface p-4 sm:p-6 lg:col-span-2 lg:border-b-0 lg:border-r">
                  <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Quotation Summary</h3>
                  
                  <div className="space-y-4">
                    <div className="rounded-xl border border-rule bg-surface-2 p-4">
                      <p className="mb-1 text-xs text-muted">Status</p>
                      <StatusBadge status={selectedQuotation.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="mb-1 text-xs text-muted">Plan</p>
                        <p className="font-semibold text-ink">{selectedQuotation.planType || 'Monthly'}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted">Date</p>
                        <p className="font-semibold text-ink">{new Date(selectedQuotation.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-rule bg-surface-2 p-4">
                      <p className="mb-2 text-xs text-muted">Pricing Breakdown</p>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-ink-2">Subtotal</span>
                        <span className="font-semibold text-ink tabular-nums">₹{selectedQuotation.subtotal?.toLocaleString()}</span>
                      </div>
                      <div className="mb-3 flex justify-between text-sm">
                        <span className="text-ink-2">GST (18%)</span>
                        <span className="font-semibold text-ink tabular-nums">₹{selectedQuotation.gstAmount?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t border-rule pt-2 text-base">
                        <span className="font-semibold text-ink">Total</span>
                        <span className="font-bold text-accent tabular-nums">₹{selectedQuotation.total?.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-rule bg-accent-soft p-4">
                      <p className="text-sm text-ink-2">To proceed with this quotation, please contact your account manager or click upgrade in your dashboard.</p>
                    </div>
                  </div>
                </div>

                {/* Right side: Email Preview */}
                <div className="flex min-h-0 flex-col bg-surface-2 lg:col-span-3 lg:h-full">
                  <div className="flex shrink-0 items-center justify-between border-b border-rule px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Sent Email Copy</span>
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
