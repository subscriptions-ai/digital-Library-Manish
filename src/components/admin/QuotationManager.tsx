import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { CheckCircle, XCircle, ArrowRight, Eye, X, ExternalLink, Mail, FileText, Plus, Download, Receipt } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { generateReceiptPDF } from '../../lib/receiptPdf';

const STATUS_COLORS: Record<string, string> = {
  Pending:   'bg-amber-100 text-amber-700 border-amber-200',
  Sent:      'bg-amber-100 text-amber-700 border-amber-200',
  Downloaded:'bg-purple-100 text-purple-700 border-purple-200',
  Approved:  'bg-blue-100 text-blue-700 border-blue-200',
  Paid:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_ICONS: Record<string, any> = {
  Pending:   <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />,
  Sent:      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />,
  Downloaded:<div className="w-1.5 h-1.5 rounded-full bg-purple-500" />,
  Approved:  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />,
  Paid:      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />,
  Cancelled: <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />,
};

const getDomainList = (q: any) => {
  if (Array.isArray(q.items) && q.items.length > 0) {
    const domains = q.items.map((i: any) => i.domainName || i.domain || i.contentType).filter(Boolean);
    if (domains.length > 0) return domains.join(', ');
  }
  if (q.pricingBreakdown?.breakdown && Array.isArray(q.pricingBreakdown.breakdown) && q.pricingBreakdown.breakdown.length > 0) {
    const domains = q.pricingBreakdown.breakdown.map((i: any) => i.domainName || i.domain || i.contentType).filter(Boolean);
    if (domains.length > 0) return domains.join(', ');
  }
  return q.allowedDomain || 'All Domains';
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
  const [selectedCustomerEmail, setSelectedCustomerEmail] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ paymentMethod: 'Bank Transfer', paymentRef: '', paymentDate: new Date().toISOString().slice(0, 10) });
  const [creatingReceipt, setCreatingReceipt] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();


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
    // "Paid" is not just a label — it should produce a receipt and a ledger
    // entry. Send it through the payment modal instead of silently flipping
    // the field, which used to leave Payments and Receipts empty.
    if (status === 'Paid') {
      const q = quotations.find((x: any) => x.id === id) || selected;
      if (q) { openPaymentModal(q); return; }
    }
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

  const openPaymentModal = (q: any) => {
    setPayForm({ paymentMethod: 'Bank Transfer', paymentRef: '', paymentDate: new Date().toISOString().slice(0, 10) });
    setPayModal(q);
  };

  // Mark payment received -> create a receipt (same template, "Receipt" labels) and download it
  const createReceipt = async () => {
    if (!payModal) return;
    setCreatingReceipt(true);
    try {
      const res = await fetch(`/api/admin/quotations/${payModal.id}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(payForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record payment');
      toast.success(`Payment recorded — Receipt ${data.receiptNumber} created`);
      try {
        const doc = generateReceiptPDF(data);
        doc.save(`Receipt_${data.receiptNumber}.pdf`);
      } catch (pdfErr) { console.error('Receipt PDF generation failed', pdfErr); }
      setPayModal(null);
      setSelected(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment');
    } finally {
      setCreatingReceipt(false);
    }
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

  const groupedQuotations = Object.values(
    filteredQuotations.reduce((acc: any, q: any) => {
      const email = q.userEmail;
      if (!acc[email]) {
        acc[email] = {
          userEmail: email,
          userName: q.userName,
          mobile: q.mobile,
          organization: q.organization,
          latestDate: q.createdAt,
          latestStatus: q.status,
          totalQuotations: 1,
          quotations: [q],
          totalAmount: q.total
        };
      } else {
        acc[email].totalQuotations += 1;
        acc[email].quotations.push(q);
        acc[email].totalAmount += q.total;
        if (new Date(q.createdAt) > new Date(acc[email].latestDate)) {
          acc[email].latestDate = q.createdAt;
          acc[email].latestStatus = q.status;
          acc[email].userName = q.userName;
        }
      }
      return acc;
    }, {})
  ).sort((a: any, b: any) => {
      const sortKey = sortBy === 'createdAt' ? 'latestDate' : sortBy === 'total' ? 'totalAmount' : sortBy;
      const valA = a[sortKey] ?? a['latestDate'];
      const valB = b[sortKey] ?? b['latestDate'];
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
    const headers = ['ID', 'User', 'Email', 'Mobile', 'Organization', 'Plan', 'Domain', 'Amount', 'Date', 'Status', 'Delivery', 'Created By'];
    const rows = filteredQuotations.map(q => [
      q.id,
      q.userName,
      q.userEmail,
      q.mobile || '',
      q.organization || '',
      q.planType || 'Monthly',
      getDomainList(q),
      q.total,
      q.createdAt ? format(new Date(q.createdAt), 'yyyy-MM-dd') : '',
      q.status,
      q.deliveryMethod || 'Email',
      q.createdBy || 'User'
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
    <>
      {!selectedCustomerEmail ? (
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
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm overflow-x-auto">
          {(['', 'Pending', 'Downloaded', 'Approved', 'Paid', 'Cancelled'] as const).map(f => (
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
          <button 
            onClick={() => navigate(location.pathname + '/create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all"
          >
            <Plus size={14} /> Create Quotation
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
            ) : groupedQuotations.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">No customers found matching criteria.</td></tr>
            ) : groupedQuotations.map((g: any) => (
              <tr key={g.userEmail} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{g.userName}</div>
                  <div className="text-[11px] text-slate-500 font-medium">{g.userEmail}{g.mobile ? ` • ${g.mobile}` : ''}</div>
                  {g.organization && <div className="text-[10px] text-slate-400 mt-1">{g.organization}</div>}
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
                    {g.totalQuotations} Quote{g.totalQuotations !== 1 && 's'}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="text-slate-600 text-[11px] font-medium leading-tight max-w-[150px] truncate" title={getDomainList(g.quotations[0])}>{getDomainList(g.quotations[0])}</div>
                  {g.totalQuotations > 1 && <div className="text-[9px] text-slate-400 font-bold mt-1">+ {g.totalQuotations - 1} more</div>}
                </td>
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900">{formatPrice(g.totalAmount)}</div>
                  <div className="text-[10px] text-slate-400 font-medium">Total Volume</div>
                </td>
                <td className="px-5 py-4 text-slate-500 text-[11px] font-medium">
                  {g.latestDate ? format(new Date(g.latestDate), 'dd MMM yyyy') : '—'}
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Latest</div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide shadow-sm ${STATUS_COLORS[g.latestStatus] || ''}`}>
                    {STATUS_ICONS[g.latestStatus]}
                    {g.latestStatus}
                  </span>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Latest Status</div>
                </td>
                <td className="px-5 py-4 text-right">
                  <button onClick={() => setSelectedCustomerEmail(g.userEmail)}
                    className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm transition-all shadow-slate-300">
                    View History
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <button onClick={() => setSelectedCustomerEmail(null)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 mb-2 transition-colors">
                <ArrowRight className="rotate-180" size={16} /> Back to All Customers
              </button>
              <h1 className="text-2xl font-bold text-slate-900">
                {quotations.filter(q => q.userEmail === selectedCustomerEmail)[0]?.userName || 'Customer'}'s Quotations
              </h1>
              <p className="text-sm text-slate-500">{selectedCustomerEmail}</p>
            </div>
            <button 
              onClick={() => navigate(location.pathname + '/create')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all"
            >
              <Plus size={14} /> Create New Quote
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 font-semibold text-slate-600">ID / Date</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Plan & Domain</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Amount</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Status & Delivery</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Created By</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.filter(q => q.userEmail === selectedCustomerEmail).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(q => (
                  <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-900 font-mono text-xs mb-1">#{q.id}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{q.createdAt ? format(new Date(q.createdAt), 'dd MMM yyyy, p') : '—'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200 mb-1.5">
                        {q.planType || 'Monthly'}
                      </span>
                      <div className="text-slate-600 text-[11px] font-medium leading-tight max-w-[200px] truncate" title={getDomainList(q)}>{getDomainList(q)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-900">{formatPrice(q.total)}</div>
                      <div className="text-[10px] text-slate-400 font-medium">incl. GST</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide shadow-sm ${STATUS_COLORS[q.status] || ''}`}>
                        {STATUS_ICONS[q.status]}
                        {q.status}
                      </span>
                      <div className="mt-1.5 text-[10px] font-medium text-slate-400 flex items-center gap-1">
                        {q.deliveryMethod === 'Download' ? <><Download size={10} /> Downloaded</> : <><Mail size={10} /> Emailed</>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-[11px] font-semibold text-slate-600">{q.createdBy || 'User'}</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Always-available status selector */}
                        <select value={q.status} onChange={(e) => updateStatus(q.id, e.target.value)}
                          title="Change status anytime"
                          className={`text-[11px] font-bold border rounded-lg px-2 py-1.5 bg-white outline-none focus:border-blue-500 cursor-pointer ${STATUS_COLORS[q.status] || 'text-slate-700 border-slate-200'}`}>
                          {['Pending', 'Sent', 'Downloaded', 'Approved', 'Paid', 'Cancelled'].map(s => (
                            <option key={s} value={s} className="text-slate-700 bg-white font-medium">{s}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setSelected(q); setConvertForm({ startDate: '', endDate: '' }); }}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="View Details">
                            <Eye size={16} />
                          </button>
                          {q.status === 'Approved' && (
                            <button onClick={() => { setSelected(q); setConvertForm({ startDate: '', endDate: '' }); }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Convert to Subscription">
                              <ArrowRight size={16} />
                            </button>
                          )}
                          {q.status !== 'Paid' && (
                            <button onClick={() => openPaymentModal(q)}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Payment Received — Create Receipt">
                              <Receipt size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail / Convert Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[90vw] lg:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-900 text-xl flex items-center gap-3">
                <FileText size={22} className="text-blue-600" />
                Quotation Details <span className="text-slate-400 text-sm font-medium">#{selected.id}</span>
              </h2>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Split Layout Container */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-5 min-h-0">
              
              {/* Left Column: Details & Actions */}
              <div className="lg:col-span-2 overflow-y-auto p-6 border-r border-slate-200 flex flex-col gap-5">
                
                {/* User info */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Customer</p>
                      <p className="font-bold text-slate-900">{selected.userName}</p>
                      <p className="text-sm text-slate-600">{selected.userEmail}</p>
                      {selected.mobile && <p className="text-sm text-slate-600">{selected.mobile}</p>}
                      {selected.organization && <p className="text-xs text-slate-500 mt-1">{selected.organization}</p>}
                      {selected.state && <p className="text-xs text-slate-500">{selected.state}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Package</p>
                      <p className="font-bold text-slate-900">{selected.planType || 'Monthly'} Plan</p>
                      <p className="text-sm text-slate-600">{getDomainList(selected)}</p>
                      {selected.notes && <p className="text-xs text-slate-500 mt-1 italic">{selected.notes}</p>}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Metadata</p>
                    <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">Date:</span> {selected.createdAt ? format(new Date(selected.createdAt), 'dd MMM yyyy, p') : 'Unknown'}</p>
                    <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">Generated By:</span> {selected.createdBy || 'User / System'}</p>
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
                  {selected.couponCode && selected.discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-600 font-semibold">
                      <span>Discount ({selected.couponCode})</span><span>-{formatPrice(selected.discountAmount)}</span>
                    </div>
                  )}
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

                {/* Spacer to push actions to bottom if needed */}
                <div className="flex-1"></div>

                {/* Status Actions — always available */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Change Status (anytime)</p>
                    <div className="flex flex-wrap gap-2">
                      {(['Pending', 'Approved', 'Paid', 'Cancelled'] as const).map(st => (
                        <button key={st} onClick={() => updateStatus(selected.id, st)} disabled={selected.status === st}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${selected.status === st
                            ? 'bg-slate-900 text-white border-slate-900 cursor-default'
                            : 'text-slate-600 border-slate-200 hover:bg-slate-50 active:scale-95'}`}>
                          {selected.status === st ? `✓ ${st}` : st}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selected.status !== 'Paid' && (
                    <div className="flex justify-end">
                      <button onClick={() => openPaymentModal(selected)}
                        className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95">
                        <Receipt size={14} /> Payment Received — Create Receipt
                      </button>
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Email Preview */}
              <div className="lg:col-span-3 flex flex-col bg-slate-100 h-full min-h-0">
                <div className="bg-slate-800 p-3 px-5 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    {selected.deliveryMethod === 'Download' ? <Download size={16} className="text-slate-300" /> : <Mail size={16} className="text-slate-300" />}
                    <span className="text-sm font-bold tracking-wide">{selected.deliveryMethod === 'Download' ? 'PDF File Downloaded (Not Emailed)' : 'Email Template Preview'}</span>
                  </div>
                  {selected.deliveryMethod !== 'Download' && <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-mono">Exactly as sent</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                  <div className="bg-white shadow-md mx-auto max-w-2xl min-h-full border border-slate-200 rounded-sm">
                    {selected.deliveryMethod === 'Download' ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400 p-8 text-center">
                        <Download size={48} className="mb-4 text-slate-300" />
                        <h3 className="text-lg font-bold text-slate-600 mb-2">Quotation Only Downloaded</h3>
                        <p className="text-sm">This quotation was downloaded as a PDF file and was not sent via email. Therefore, there is no email template to preview.</p>
                      </div>
                    ) : selected.sentEmailHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: selected.sentEmailHtml }} />
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
                                <p style={{fontSize:"16px", color:"#1e293b", margin:"0 0 6px", fontWeight:600}}>Dear {selected.userName},</p>
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
                                        <td style={{color:"#ffffff", fontSize:"13px", fontWeight:700, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>{selected.id}</td>
                                      </tr>
                                      <tr>
                                        <td style={{color:"#93c5fd", fontSize:"12px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>Quotation Date</td>
                                        <td style={{color:"#ffffff", fontSize:"13px", fontWeight:600, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>{selected.createdAt ? format(new Date(selected.createdAt), "dd MMM yyyy") : "—"}</td>
                                      </tr>
                                      <tr>
                                        <td style={{color:"#93c5fd", fontSize:"12px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>Subscription Validity</td>
                                        <td style={{color:"#86efac", fontSize:"13px", fontWeight:600, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>30 Days from Issue</td>
                                      </tr>
                                      <tr>
                                        <td style={{color:"#93c5fd", fontSize:"12px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>Subscription Duration</td>
                                        <td style={{color:"#ffffff", fontSize:"13px", fontWeight:600, textAlign:"right", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.1)"}}>{selected.planType || "—"}</td>
                                      </tr>
                                    </tbody></table>
                                    {((selected.items?.length > 0) || (selected.pricingBreakdown?.breakdown?.length > 0)) && (
                                      <>
                                        <p style={{color:"#93c5fd", fontSize:"12px", margin:"14px 0 6px"}}>Selected Department(s)</p>
                                        <ul style={{margin:"0 0 14px", paddingLeft:"4px", listStyle:"none"}}>
                                          {(selected.items?.length > 0 ? selected.items : selected.pricingBreakdown?.breakdown || []).map((b: any, i: number) => (
                                            <li key={i} style={{padding:"4px 0", color:"#e2e8f0", fontSize:"14px"}}>✅ &nbsp;{b.domainName || b.domain || b.contentType}</li>
                                          ))}
                                        </ul>
                                      </>
                                    )}
                                    <table width="100%" cellPadding={0} cellSpacing={0} style={{borderTop:"1px solid rgba(255,255,255,0.25)", paddingTop:"14px", marginTop:"4px"}}><tbody>
                                      <tr>
                                        <td style={{color:"#bfdbfe", fontSize:"13px", fontWeight:600, paddingTop:"14px"}}>Total Amount (Including 18% GST)</td>
                                        <td style={{textAlign:"right", paddingTop:"14px"}}>
                                          <span style={{color:"#ffffff", fontSize:"22px", fontWeight:900}}>₹{selected.total?.toLocaleString("en-IN", {minimumFractionDigits:2})}</span>
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
      )}

      {/* Payment Received / Create Receipt Modal */}
      {payModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Receipt size={20} className="text-emerald-600" /> Record Payment
              </h2>
              <button onClick={() => setPayModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Customer</span><span className="font-bold text-slate-900">{payModal.userName}</span></div>
                <div className="flex justify-between mt-1"><span className="text-slate-500">Amount</span><span className="font-bold text-emerald-600">{formatPrice(payModal.total)}</span></div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none">
                  {['Bank Transfer', 'UPI', 'Razorpay', 'Cheque', 'Cash'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Transaction / Reference No. <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="text" value={payForm.paymentRef} onChange={e => setPayForm(f => ({ ...f, paymentRef: e.target.value }))}
                  placeholder="e.g. UTR / UPI ref / cheque no."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date</label>
                <input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none" />
              </div>
              <p className="text-xs text-slate-500">This marks the quotation as <b>Paid</b>, generates a receipt (same template), and downloads it. The receipt also appears in the <b>Receipts</b> module.</p>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setPayModal(null)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">Cancel</button>
              <button onClick={createReceipt} disabled={creatingReceipt}
                className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 disabled:opacity-50">
                {creatingReceipt ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Receipt size={15} />}
                Create Receipt
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
