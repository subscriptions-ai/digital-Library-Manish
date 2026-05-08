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
            
            <div className="flex-1 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-5 h-full">
                
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
                <div className="lg:col-span-3 bg-slate-100 flex flex-col h-full">
                  <div className="bg-slate-200 p-3 text-slate-600 flex justify-between items-center shrink-0 border-b border-slate-300">
                    <span className="text-xs font-bold uppercase tracking-wide">Sent Email Copy</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="bg-white shadow-lg mx-auto max-w-2xl min-h-full border border-slate-200 rounded-sm">
                      {selectedQuotation.sentEmailHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: selectedQuotation.sentEmailHtml }} />
                      ) : (
                        <div className="p-8 bg-white text-slate-800">
                          <div className="text-center mb-8 pb-8 border-b border-slate-100">
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">STM DIGITAL LIBRARY</h1>
                            <p className="text-slate-500 font-medium text-sm">Legacy Quotation Preview</p>
                          </div>
                          <div className="mb-8">
                            <p className="text-sm text-slate-500 mb-1">Dear <strong className="text-slate-800">Subscriber</strong>,</p>
                            <p className="text-sm text-slate-600 leading-relaxed">
                              This is a reconstructed preview of your quotation generated on <strong className="text-slate-800">{new Date(selectedQuotation.createdAt).toLocaleDateString()}</strong>.
                            </p>
                          </div>
                          
                          <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 mb-8">
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/60">
                              <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Plan Details</span>
                              <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">{selectedQuotation.planType || 'Standard'}</span>
                            </div>
                            
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-slate-600">Subtotal</span>
                              <span className="font-semibold text-slate-900">₹{selectedQuotation.subtotal?.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center mb-4">
                              <span className="text-slate-600">GST (18%)</span>
                              <span className="font-semibold text-slate-900">₹{selectedQuotation.gstAmount?.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                              <span className="font-bold text-slate-900">Total Payable</span>
                              <span className="text-xl font-black text-blue-600">₹{selectedQuotation.total?.toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="text-center text-xs text-slate-400 mt-12 pt-6 border-t border-slate-100">
                            <p>This is a system-generated preview. The exact email formatting for this legacy record was not retained.</p>
                          </div>
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
