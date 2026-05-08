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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h2 className="font-bold">Quotation {selectedQuotation.id} Email Template</h2>
              <button onClick={() => setSelectedQuotation(null)} className="text-slate-400 hover:text-white px-3 py-1">Close</button>
            </div>
            <div className="flex-1 bg-slate-50 p-6 overflow-auto">
              <div className="bg-white border border-slate-200 shadow-sm mx-auto max-w-2xl p-8 min-h-full">
                {selectedQuotation.sentEmailHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedQuotation.sentEmailHtml }} />
                ) : (
                  <div className="text-center text-slate-500 mt-20 font-medium">Email template not captured for this quotation.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
