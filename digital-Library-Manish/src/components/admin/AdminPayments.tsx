import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  Search, CheckCircle, XCircle, X, CreditCard, User, Package, Calendar,
  Hash, ShoppingBag, Building2, ChevronRight, Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/admin/payments', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch payments');
      setPayments(await res.json());
    } catch {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayments(); }, []);

  const filteredPayments = payments.filter(p =>
    (p.paymentId || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.orderId || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.displayName || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = payments.filter(p => p.status === 'Success').reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Revenue</p>
          <p className="text-2xl font-black text-slate-900">₹{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Successful</p>
          <p className="text-2xl font-black text-emerald-600">{payments.filter(p => p.status === 'Success').length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Transactions</p>
          <p className="text-2xl font-black text-slate-900">{payments.length}</p>
        </div>
      </div>

      {/* Header + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments & Transactions</h1>
          <p className="text-sm text-slate-500">Click any row to view full transaction details.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by ID, email or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-500 outline-none w-full md:w-72"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest text-xs font-bold">
            <tr>
              <th className="px-6 py-4">Transaction</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Items</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">Loading...</td></tr>
            ) : filteredPayments.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center">
                <Receipt size={40} className="mx-auto text-slate-200 mb-3" />
                <p className="font-bold text-slate-500">No payments found</p>
                <p className="text-xs text-slate-400 mt-1">Transactions will appear here after checkout</p>
              </td></tr>
            ) : filteredPayments.map((p) => {
              const items = Array.isArray(p.items) ? p.items : [];
              return (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="font-mono font-bold text-slate-800 bg-slate-100 group-hover:bg-blue-100 px-2 py-1 rounded text-xs w-max transition-colors">
                      {(p.paymentId || p.id || '').slice(0, 18)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{p.user?.displayName || 'Guest User'}</div>
                    <div className="text-xs text-slate-500">{p.user?.email || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium text-xs">
                    {p.createdAt ? format(new Date(p.createdAt), 'dd MMM yyyy') : 'N/A'}<br />
                    <span className="text-slate-400">{p.createdAt ? format(new Date(p.createdAt), 'hh:mm a') : ''}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-600">
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </span>
                    {items[0] && (
                      <div className="text-xs text-slate-400 truncate max-w-[140px]">{items[0].domainName}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-black text-slate-900 text-base">₹{p.amount?.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md ${
                      p.status === 'Success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {p.status === 'Success' ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedPayment && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPayment(null)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            {/* Drawer Panel */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg z-50 bg-white shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="bg-slate-900 px-6 py-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                    <CreditCard size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-base leading-tight">Transaction Details</h2>
                    <p className="text-slate-400 text-xs font-mono">{selectedPayment.paymentId || selectedPayment.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPayment(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Status Banner */}
                <div className={`rounded-xl p-4 flex items-center gap-3 ${
                  selectedPayment.status === 'Success' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
                }`}>
                  {selectedPayment.status === 'Success'
                    ? <CheckCircle size={22} className="text-emerald-600 shrink-0" />
                    : <XCircle size={22} className="text-red-600 shrink-0" />
                  }
                  <div>
                    <p className={`font-bold text-sm ${selectedPayment.status === 'Success' ? 'text-emerald-800' : 'text-red-800'}`}>
                      Payment {selectedPayment.status === 'Success' ? 'Successful' : 'Failed'}
                    </p>
                    <p className={`text-xs mt-0.5 ${selectedPayment.status === 'Success' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {selectedPayment.createdAt ? format(new Date(selectedPayment.createdAt), "dd MMM yyyy 'at' hh:mm a") : 'N/A'}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className={`text-2xl font-black ${selectedPayment.status === 'Success' ? 'text-emerald-700' : 'text-red-700'}`}>
                      ₹{selectedPayment.amount?.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">incl. GST</p>
                  </div>
                </div>

                {/* Transaction IDs */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Hash size={12} /> Transaction Reference
                  </p>
                  <InfoRow label="Payment ID" value={selectedPayment.paymentId || '—'} mono />
                  <InfoRow label="Order ID" value={selectedPayment.orderId || '—'} mono />
                  <InfoRow label="Internal ID" value={selectedPayment.id} mono />
                  <InfoRow label="Gateway" value={selectedPayment.method || 'Razorpay'} />
                </div>

                {/* User Info */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                    <User size={12} /> Buyer Information
                  </p>
                  <InfoRow label="Name" value={selectedPayment.user?.displayName || 'Guest / Unknown'} />
                  <InfoRow label="Email" value={selectedPayment.user?.email || 'N/A'} />
                  <InfoRow label="Role" value={selectedPayment.user?.role || 'N/A'} />
                  {selectedPayment.user?.organization && (
                    <InfoRow label="Organization" value={selectedPayment.user.organization} icon={<Building2 size={12} />} />
                  )}
                  {selectedPayment.user?.state && (
                    <InfoRow label="State" value={selectedPayment.user.state} />
                  )}
                  {!selectedPayment.userId && (
                    <div className="bg-amber-100 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium">
                      ⚠️ Guest payment — user was auto-created or not yet linked
                    </div>
                  )}
                </div>

                {/* Items Purchased */}
                {Array.isArray(selectedPayment.items) && selectedPayment.items.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <ShoppingBag size={12} /> Items Purchased ({selectedPayment.items.length})
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {selectedPayment.items.map((item: any, i: number) => (
                        <div key={i} className="px-4 py-4 space-y-3">
                          {/* Domain Name — the actual product */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                                <Package size={16} className="text-indigo-600" />
                              </div>
                              <div>
                                <p className="font-black text-slate-900 text-sm leading-tight">
                                  {item.domainName || 'Unknown Domain'}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide font-bold">Domain / Subject Area</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black text-slate-900 text-base">
                                {item.price ? `₹${Number(item.price).toLocaleString()}` : '—'}
                              </p>
                              <p className="text-[10px] text-slate-400">base price</p>
                            </div>
                          </div>
                          {/* Plan details */}
                          <div className="ml-11 grid grid-cols-3 gap-2">
                            <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-center">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Plan</p>
                              <p className="text-xs font-bold text-slate-700">{item.planName || item.plan?.name || '—'}</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-center">
                              <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Category</p>
                              <p className="text-xs font-bold text-blue-700">{item.category || '—'}</p>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-center">
                              <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-0.5">Duration</p>
                              <p className="text-xs font-bold text-emerald-700">{item.duration || 'Monthly'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Totals footer */}
                    <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-400">{selectedPayment.items.length} item(s) total (incl. 18% GST)</p>
                      <p className="text-base font-black text-white">₹{selectedPayment.amount?.toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar size={12} /> Timeline
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">Order Created</p>
                      <p className="text-xs text-slate-400">{selectedPayment.createdAt ? format(new Date(selectedPayment.createdAt), "dd MMM yyyy, hh:mm a") : '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${selectedPayment.status === 'Success' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                    <div>
                      <p className="text-xs font-bold text-slate-700">Payment {selectedPayment.status === 'Success' ? 'Verified & Captured' : 'Failed / Pending'}</p>
                      <p className="text-xs text-slate-400">via {selectedPayment.method || 'Razorpay'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ label, value, mono = false, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-500 shrink-0 flex items-center gap-1">{icon}{label}</span>
      <span className={`text-xs font-bold text-slate-800 text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
