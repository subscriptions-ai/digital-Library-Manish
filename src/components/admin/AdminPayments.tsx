import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Download, Search, CheckCircle, XCircle } from 'lucide-react';

export function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/admin/payments', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch payments');
      const data = await res.json();
      setPayments(data);
    } catch (err) {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const filteredPayments = payments.filter(p => 
    (p.paymentId || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.displayName || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments & Transactions</h1>
          <p className="text-sm text-slate-500">Monitor all incoming payments across the platform.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by ID, email or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-500 outline-none w-full md:w-64"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden auto-x-scroll">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest text-xs font-bold">
            <tr>
              <th className="px-6 py-4">Transaction ID</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-slate-400">Loading...</td></tr>
            ) : filteredPayments.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-slate-400">No payments found.</td></tr>
            ) : filteredPayments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded w-max text-xs">
                    {p.paymentId || p.id}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">{p.user?.displayName || 'Guest User'}</div>
                  <div className="text-xs text-slate-500">{p.user?.email || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 text-slate-600 font-medium">
                  {p.createdAt ? format(new Date(p.createdAt), 'dd MMM yyyy, hh:mm a') : 'N/A'}
                </td>
                <td className="px-6 py-4">
                  <span className="font-bold text-slate-900 text-base">₹{p.amount?.toLocaleString()}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md ${
                    p.status === 'Success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {p.status === 'Success' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
