import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { Receipt, Download, Mail, Search, CheckCircle2, IndianRupee } from 'lucide-react';
import { generateReceiptPDF } from '../../lib/receiptPdf';

export function ReceiptManager() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/receipts', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setReceipts(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

  const download = (receipt: any) => {
    try {
      const doc = generateReceiptPDF(receipt);
      doc.save(`Receipt_${receipt.receiptNumber}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF');
    }
  };

  const sendEmail = async (receipt: any) => {
    setSending(receipt.id);
    try {
      const doc = generateReceiptPDF(receipt);
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const res = await fetch(`/api/admin/receipts/${receipt.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ pdfBase64 }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to send'); }
      toast.success(`Receipt emailed to ${receipt.userEmail}`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send receipt');
    } finally {
      setSending(null);
    }
  };

  const filtered = receipts.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.receiptNumber?.toLowerCase().includes(s) ||
      r.userName?.toLowerCase().includes(s) ||
      r.userEmail?.toLowerCase().includes(s) ||
      r.organization?.toLowerCase().includes(s)
    );
  });

  const totalCollected = receipts.reduce((acc, r) => acc + (r.total || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Receipts</h1>
        <p className="text-sm text-slate-500">All payment receipts generated from paid quotations. Download or email them to customers.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Receipts', value: receipts.length, icon: <Receipt size={18} className="text-emerald-600" />, bg: 'bg-emerald-50' },
          { label: 'Total Collected', value: formatPrice(totalCollected), icon: <IndianRupee size={18} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Emailed', value: receipts.filter(r => r.emailSentAt).length, icon: <CheckCircle2 size={18} className="text-indigo-600" />, bg: 'bg-indigo-50' },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}>{s.icon}</div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{s.label}</p>
              <p className="text-xl font-bold text-slate-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-full md:w-80">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by receipt no, name, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 font-semibold text-slate-600">Receipt No.</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Customer</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Amount</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Payment</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Date</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center">
                <div className="flex justify-center"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-slate-400">No receipts yet. Mark a quotation as "Payment Received" to generate one.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900 font-mono text-xs">{r.receiptNumber}</div>
                  {r.emailSentAt && <div className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1"><CheckCircle2 size={10} /> Emailed</div>}
                </td>
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900">{r.userName}</div>
                  <div className="text-[11px] text-slate-500">{r.userEmail}</div>
                  {r.organization && <div className="text-[10px] text-slate-400 mt-0.5">{r.organization}</div>}
                </td>
                <td className="px-5 py-4">
                  <div className="font-bold text-emerald-600">{formatPrice(r.total)}</div>
                  <div className="text-[10px] text-slate-400">incl. GST</div>
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">{r.paymentMethod}</span>
                  {r.paymentRef && <div className="text-[10px] text-slate-400 mt-1 font-mono truncate max-w-[120px]" title={r.paymentRef}>{r.paymentRef}</div>}
                </td>
                <td className="px-5 py-4 text-slate-500 text-[11px] font-medium">
                  {r.paymentDate ? format(new Date(r.paymentDate), 'dd MMM yyyy') : '—'}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => download(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-all" title="Download receipt PDF">
                      <Download size={14} /> Download
                    </button>
                    <button onClick={() => sendEmail(r)} disabled={sending === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50" title="Email receipt to customer">
                      {sending === r.id ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Mail size={14} />}
                      Send
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
