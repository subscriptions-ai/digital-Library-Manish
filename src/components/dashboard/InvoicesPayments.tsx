import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function InvoicesPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/invoices', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(setPayments)
      .catch(() => toast.error("Failed to load invoices"))
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
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Invoices & Payments</h1>
        <p className="text-sm text-slate-500 mt-1">Review your payment history and download tax invoices.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
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
    </div>
  );
}
