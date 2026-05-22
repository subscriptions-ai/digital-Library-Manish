import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Tag, Plus, CheckCircle, XCircle, Trash2, Edit, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const CouponsManager = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    code: '',
    discountType: 'percentage',
    discountValue: '',
    maxUses: '',
    validFrom: '',
    validUntil: '',
    minimumOrderAmount: ''
  });

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setCoupons(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formData,
          code: formData.code.toUpperCase()
        })
      });
      
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || `Server returned ${res.status}`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create coupon');
      }

      toast.success("Coupon created successfully");
      setFormData({ code: '', discountType: 'percentage', discountValue: '', maxUses: '', validFrom: '', validUntil: '', minimumOrderAmount: '' });
      fetchCoupons();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/coupons/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      if (res.ok) fetchCoupons();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this coupon?")) return;
    try {
      const res = await fetch(`/api/coupons/${id}`, { 
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success("Coupon deleted");
        fetchCoupons();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Coupons Management</h1>
          <p className="text-sm text-slate-500">Create and manage discount codes for users.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Plus size={20} className="text-blue-600" /> Create New Coupon
        </h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">Code *</label>
            <input required value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. SUMMER20" className="uppercase w-full rounded-lg border-slate-200 py-2 px-3 text-sm focus:border-blue-500 outline-none border" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">Type</label>
            <select className="w-full rounded-lg border-slate-200 py-2 px-3 text-sm focus:border-blue-500 outline-none border"
              value={formData.discountType} onChange={e => setFormData({ ...formData, discountType: e.target.value })}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount (₹)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">Value *</label>
            <input required type="number" min="0" step="0.01" value={formData.discountValue} onChange={e => setFormData({ ...formData, discountValue: e.target.value })} placeholder="e.g. 20" className="w-full rounded-lg border-slate-200 py-2 px-3 text-sm focus:border-blue-500 outline-none border" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">Max Uses</label>
            <input type="number" min="1" value={formData.maxUses} onChange={e => setFormData({ ...formData, maxUses: e.target.value })} placeholder="Blank = unlimited" className="w-full rounded-lg border-slate-200 py-2 px-3 text-sm focus:border-blue-500 outline-none border" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">Min Order Amount (₹)</label>
            <input type="number" min="0" value={formData.minimumOrderAmount} onChange={e => setFormData({ ...formData, minimumOrderAmount: e.target.value })} placeholder="e.g. 1000" className="w-full rounded-lg border-slate-200 py-2 px-3 text-sm focus:border-blue-500 outline-none border" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">Valid From</label>
            <input type="date" value={formData.validFrom} onChange={e => setFormData({ ...formData, validFrom: e.target.value })} className="w-full rounded-lg border-slate-200 py-2 px-3 text-sm focus:border-blue-500 outline-none border" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">Valid Until</label>
            <input type="date" value={formData.validUntil} onChange={e => setFormData({ ...formData, validUntil: e.target.value })} className="w-full rounded-lg border-slate-200 py-2 px-3 text-sm focus:border-blue-500 outline-none border" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors">
              Create Coupon
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 font-semibold text-slate-600">Code</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Discount</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Usage</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Validity</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Loading...</td></tr>
            ) : coupons.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">No coupons created yet.</td></tr>
            ) : (
              coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 font-bold text-slate-900 uppercase">
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-blue-500" />
                      {coupon.code}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-semibold text-emerald-600">
                      {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`}
                    </span>
                    {coupon.minimumOrderAmount && <div className="text-xs text-slate-400 mt-0.5">Min: ₹{coupon.minimumOrderAmount}</div>}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <span className="font-semibold text-slate-900">{coupon.usedCount}</span> / {coupon.maxUses || '∞'}
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500">
                    {coupon.validFrom && <div>From: {new Date(coupon.validFrom).toLocaleDateString()}</div>}
                    {coupon.validUntil && <div>Until: {new Date(coupon.validUntil).toLocaleDateString()}</div>}
                    {!coupon.validFrom && !coupon.validUntil && <span>Forever</span>}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${coupon.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {coupon.isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {coupon.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/admin/coupons/${coupon.id}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <ChevronRight size={16} />
                      </Link>
                      <button onClick={() => handleToggleStatus(coupon.id, coupon.isActive)} className="text-xs font-semibold text-slate-500 border border-slate-200 px-2 py-1 rounded hover:bg-slate-50">
                        Toggle
                      </button>
                      <button onClick={() => handleDelete(coupon.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
