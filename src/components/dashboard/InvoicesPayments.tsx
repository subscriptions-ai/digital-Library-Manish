import React, { useEffect, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { rowToRender } from '../../lib/quotation/quotationModel';
import { downloadQuotationPdf } from '../../lib/quotation/quotationPdf';
import { printQuotation } from '../../lib/quotation/quotationPrint';
import { QuotationFrame } from '../quotation/QuotationFrame';
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
                        View Quotation
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

                {/* Right side: the quotation, as it was issued */}
                <div className="flex min-h-0 flex-col bg-surface-2 lg:col-span-3 lg:h-full">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Quotation</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => printQuotation(rowToRender(selectedQuotation))}>
                        <Printer size={14} aria-hidden="true" /> Print
                      </Button>
                      <Button size="sm" onClick={() => downloadQuotationPdf(rowToRender(selectedQuotation)).catch(() => toast.error('Could not create the PDF.'))}>
                        <Download size={14} aria-hidden="true" /> Download PDF
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                    <QuotationFrame render={rowToRender(selectedQuotation)} />
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
