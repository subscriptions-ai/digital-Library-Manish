import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { CheckCircle, XCircle, ArrowRight, Eye, X, ExternalLink } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  Pending:   'bg-amber-100 text-amber-700 border-amber-200',
  Approved:  'bg-blue-100 text-blue-700 border-blue-200',
  Paid:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function QuotationManager() {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertForm, setConvertForm] = useState({ startDate: '', endDate: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/quotations${q}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setQuotations(await res.json());
    } catch { toast.error('Failed to load quotations'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/quotations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status })
      });
      toast.success(`Quotation ${status.toLowerCase()}`);
      fetchData();
      setSelected(null);
    } catch { toast.error('Failed to update'); }
  };

  const convertToSubscription = async () => {
    if (!selected) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/admin/quotations/${selected.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(convertForm)
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success('Subscription created from quotation!');
      fetchData();
      setSelected(null);
    } catch (e: any) { toast.error(e.message || 'Conversion failed'); }
    finally { setConverting(false); }
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotation Management</h1>
          <p className="text-sm text-slate-500">Review user quotations, approve, and convert to subscriptions.</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {(['', 'Pending', 'Approved', 'Paid', 'Cancelled'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${statusFilter === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 font-semibold text-slate-600">User</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Plan</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Domain</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Amount</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Date</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center">
                <div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              </td></tr>
            ) : quotations.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">No quotations found.</td></tr>
            ) : quotations.map(q => (
              <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="font-semibold text-slate-900">{q.userName}</div>
                  <div className="text-xs text-slate-500">{q.userEmail}</div>
                  {q.organization && <div className="text-xs text-slate-400 mt-0.5">{q.organization}</div>}
                </td>
                <td className="px-5 py-3">
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-indigo-50 text-indigo-700">
                    {q.planType || 'Monthly'}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-600 text-xs">{q.allowedDomain || 'All Domains'}</td>
                <td className="px-5 py-3">
                  <div className="font-bold text-slate-900">{formatPrice(q.total)}</div>
                  <div className="text-xs text-slate-400">incl. GST</div>
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs">{q.createdAt ? format(new Date(q.createdAt), 'dd MMM yyyy') : '—'}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${STATUS_COLORS[q.status] || ''}`}>
                    {q.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => { setSelected(q); setConvertForm({ startDate: '', endDate: '' }); }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                      <Eye size={13} /> View
                    </button>
                    {q.status === 'Pending' && (
                      <button onClick={() => updateStatus(q.id, 'Approved')}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg">
                        <CheckCircle size={13} /> Approve
                      </button>
                    )}
                    {q.status === 'Approved' && (
                      <button onClick={() => { setSelected(q); setConvertForm({ startDate: '', endDate: '' }); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg">
                        <ArrowRight size={13} /> Convert
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail / Convert Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">Quotation Details</h2>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* User info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Customer</p>
                  <p className="font-bold text-slate-900">{selected.userName}</p>
                  <p className="text-sm text-slate-600">{selected.userEmail}</p>
                  {selected.organization && <p className="text-xs text-slate-500">{selected.organization}</p>}
                  {selected.state && <p className="text-xs text-slate-500">{selected.state}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Package</p>
                  <p className="font-bold text-slate-900">{selected.planType || 'Monthly'} Plan</p>
                  <p className="text-sm text-slate-600">{selected.allowedDomain || 'All Domains'}</p>
                  {selected.notes && <p className="text-xs text-slate-500 mt-1 italic">{selected.notes}</p>}
                </div>
              </div>

              {/* Pricing breakdown */}
              {selected.pricingBreakdown?.breakdown?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-2">Module Breakdown</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">Content Type</th>
                          <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">Domain</th>
                          <th className="px-4 py-2 text-right text-xs font-bold text-slate-500 uppercase">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selected.pricingBreakdown.breakdown.map((b: any, i: number) => (
                          <tr key={i}>
                            <td className="px-4 py-2 font-medium text-slate-800">{b.contentType}</td>
                            <td className="px-4 py-2 text-slate-500">{b.domain}</td>
                            <td className="px-4 py-2 text-right font-bold text-slate-900">{formatPrice(b.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span><span className="font-semibold">{formatPrice(selected.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>GST (18%)</span><span className="font-semibold">{formatPrice(selected.gstAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total</span><span className="text-lg">{formatPrice(selected.total)}</span>
                </div>
              </div>

              {/* Convert to subscription (only for Approved) */}
              {selected.status === 'Approved' && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-blue-900">Convert to Active Subscription</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                      <input type="date" value={convertForm.startDate} onChange={e => setConvertForm(f => ({ ...f, startDate: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">End Date</label>
                      <input type="date" value={convertForm.endDate} onChange={e => setConvertForm(f => ({ ...f, endDate: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">Leave blank to auto-calculate from plan type ({selected.planType === 'Yearly' ? '12' : selected.planType === 'Quarterly' ? '3' : '1'} month/s)</p>
                  <button onClick={convertToSubscription} disabled={converting}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    {converting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight size={15} />}
                    Create Subscription
                  </button>
                </div>
              )}

              {/* Status Actions */}
              <div className="flex justify-end gap-3">
                {selected.status === 'Pending' && (
                  <>
                    <button onClick={() => updateStatus(selected.id, 'Cancelled')}
                      className="px-4 py-2 text-sm font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-xl">Cancel</button>
                    <button onClick={() => updateStatus(selected.id, 'Approved')}
                      className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2">
                      <CheckCircle size={14} /> Approve Quotation
                    </button>
                  </>
                )}
                {selected.status === 'Approved' && (
                  <button onClick={() => updateStatus(selected.id, 'Paid')}
                    className="px-5 py-2 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center gap-2">
                    Mark as Paid
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
