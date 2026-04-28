import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { CheckCircle, XCircle, ArrowRight, Eye, X, ExternalLink } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  Pending:   'bg-amber-100 text-amber-700 border-amber-200',
  Sent:      'bg-amber-100 text-amber-700 border-amber-200',
  Approved:  'bg-blue-100 text-blue-700 border-blue-200',
  Paid:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_ICONS: Record<string, any> = {
  Pending:   <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />,
  Sent:      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />,
  Approved:  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />,
  Paid:      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />,
  Cancelled: <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />,
};


export function QuotationManager() {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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
      const data = await res.json();
      setQuotations(Array.isArray(data) ? data : []);
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

  const filteredQuotations = quotations
    .filter(q => {
      const matchesStatus = !statusFilter || q.status === statusFilter || (statusFilter === 'Pending' && q.status === 'Sent');
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        q.userName?.toLowerCase()?.includes(searchLower) || 
        q.userEmail?.toLowerCase()?.includes(searchLower) ||
        q.organization?.toLowerCase()?.includes(searchLower) ||
        q.id?.toLowerCase()?.includes(searchLower);
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const stats = {
    total: quotations.length,
    pending: quotations.filter(q => q.status === 'Pending' || q.status === 'Sent').length,
    approved: quotations.filter(q => q.status === 'Approved').length,
    revenue: quotations.filter(q => q.status === 'Paid').reduce((acc, q) => acc + q.total, 0)
  };

  const exportToCSV = () => {
    const headers = ['ID', 'User', 'Email', 'Organization', 'Plan', 'Domain', 'Amount', 'Date', 'Status'];
    const rows = filteredQuotations.map(q => [
      q.id,
      q.userName,
      q.userEmail,
      q.organization || '',
      q.planType || 'Monthly',
      q.allowedDomain || 'All Domains',
      q.total,
      q.createdAt ? format(new Date(q.createdAt), 'yyyy-MM-dd') : '',
      q.status
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `quotations_export_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotation Management</h1>
          <p className="text-sm text-slate-500">Review user quotations, approve, and convert to subscriptions.</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Quotes', value: stats.total, icon: <Eye size={18} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Pending/Sent', value: stats.pending, icon: <div className="w-2 h-2 rounded-full bg-amber-500" />, bg: 'bg-amber-50' },
          { label: 'Approved', value: stats.approved, icon: <CheckCircle size={18} className="text-indigo-600" />, bg: 'bg-indigo-50' },
          { label: 'Total Revenue', value: formatPrice(stats.revenue), icon: <div className="text-emerald-600 font-bold">₹</div>, bg: 'bg-emerald-50' },
        ].map((s, i) => (
          <div key={i} className={`p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-4`}>
            <div className={`p-3 rounded-xl ${s.bg}`}>{s.icon}</div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{s.label}</p>
              <p className="text-xl font-bold text-slate-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Filter tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {(['', 'Pending', 'Approved', 'Paid', 'Cancelled'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${statusFilter === f ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>
              {f || 'All'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Eye size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search quotes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
            />
          </div>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <ExternalLink size={14} /> Export
          </button>
        </div>
      </div>


      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => { setSortBy('userName'); setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); }}>
                <div className="flex items-center gap-2">User {sortBy === 'userName' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
              </th>
              <th className="px-5 py-3 font-semibold text-slate-600">Plan</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Domain</th>
              <th className="px-5 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => { setSortBy('total'); setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); }}>
                <div className="flex items-center gap-2">Amount {sortBy === 'total' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
              </th>
              <th className="px-5 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => { setSortBy('createdAt'); setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); }}>
                <div className="flex items-center gap-2">Date {sortBy === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
              </th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center">
                <div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              </td></tr>
            ) : filteredQuotations.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">No quotations found.</td></tr>
            ) : filteredQuotations.map(q => (
              <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{q.userName}</div>
                  <div className="text-[11px] text-slate-500 font-medium">{q.userEmail}</div>
                  {q.organization && <div className="text-[10px] text-slate-400 mt-0.5">{q.organization}</div>}
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                    {q.planType || 'Monthly'}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="text-slate-600 text-[11px] font-medium leading-tight max-w-[150px] truncate">{q.allowedDomain || 'All Domains'}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900">{formatPrice(q.total)}</div>
                  <div className="text-[10px] text-slate-400 font-medium">incl. GST</div>
                </td>
                <td className="px-5 py-4 text-slate-500 text-[11px] font-medium">
                  {q.createdAt ? format(new Date(q.createdAt), 'dd MMM yyyy') : '—'}
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide shadow-sm ${STATUS_COLORS[q.status] || ''}`}>
                    {STATUS_ICONS[q.status]}
                    {q.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setSelected(q); setConvertForm({ startDate: '', endDate: '' }); }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="View Details">
                      <Eye size={16} />
                    </button>
                    {(q.status === 'Pending' || q.status === 'Sent') && (
                      <button onClick={() => updateStatus(q.id, 'Approved')}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Approve">
                        <CheckCircle size={16} />
                      </button>
                    )}
                    {q.status === 'Approved' && (
                      <button onClick={() => { setSelected(q); setConvertForm({ startDate: '', endDate: '' }); }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Convert to Subscription">
                        <ArrowRight size={16} />
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
                {(selected.status === 'Pending' || selected.status === 'Sent') && (
                  <>
                    <button onClick={() => updateStatus(selected.id, 'Cancelled')}
                      className="px-4 py-2 text-sm font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-xl">Cancel</button>
                    <button onClick={() => updateStatus(selected.id, 'Approved')}
                      className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95">
                      <CheckCircle size={14} /> Approve Quotation
                    </button>
                  </>
                )}
                {selected.status === 'Approved' && (
                  <button onClick={() => updateStatus(selected.id, 'Paid')}
                    className="px-5 py-2 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-slate-200 transition-all active:scale-95">
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
