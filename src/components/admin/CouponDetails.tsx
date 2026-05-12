import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag, Calendar, User, ShoppingBag, Percent, DollarSign, CheckCircle, XCircle } from 'lucide-react';

export const CouponDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoupon = async () => {
      try {
        const res = await fetch(`/api/coupons/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) setCoupon(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchCoupon();
  }, [id]);

  if (loading) return <div className="p-12 text-center text-slate-500 font-medium">Loading coupon details...</div>;
  if (!coupon) return <div className="p-12 text-center text-red-500 font-bold">Coupon not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/admin/coupons')}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Coupons
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Tag size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{coupon.code}</h1>
              <p className="text-sm text-slate-500 mt-1">Discount Coupon Details</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border ${coupon.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {coupon.isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {coupon.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="flex items-start gap-3">
            <div className="text-slate-400 mt-0.5">
              {coupon.discountType === 'percentage' ? <Percent size={18} /> : <DollarSign size={18} />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Discount</p>
              <p className="text-xl font-bold text-slate-900">
                {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="text-slate-400 mt-0.5"><User size={18} /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Usage Limit</p>
              <p className="text-xl font-bold text-slate-900">
                {coupon.usedCount} <span className="text-slate-400 text-sm">/ {coupon.maxUses || 'Unlimited'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-slate-400 mt-0.5"><ShoppingBag size={18} /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Min Order</p>
              <p className="text-xl font-bold text-slate-900">
                {coupon.minimumOrderAmount ? `₹${coupon.minimumOrderAmount}` : 'None'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-slate-400 mt-0.5"><Calendar size={18} /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Validity</p>
              <div className="text-sm font-semibold text-slate-700">
                {coupon.validFrom ? <div>From: {new Date(coupon.validFrom).toLocaleDateString()}</div> : null}
                {coupon.validUntil ? <div>Until: {new Date(coupon.validUntil).toLocaleDateString()}</div> : null}
                {!coupon.validFrom && !coupon.validUntil ? <div>Forever</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Usage History</h2>
          <p className="text-sm text-slate-500 mt-1">Audit log of all orders that used this coupon.</p>
        </div>
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-white border-b border-slate-100">
              <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Date & Time</th>
              <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">User</th>
              <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Order / Ref ID</th>
              <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs text-right">Discount Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!coupon.usages || coupon.usages.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-slate-500">No usage history found for this coupon.</td></tr>
            ) : (
              coupon.usages.map((usage: any) => (
                <tr key={usage.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-600 font-medium">
                    {new Date(usage.usedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    {usage.user ? (
                      <div>
                        <div className="font-bold text-slate-900">{usage.user.displayName || usage.user.name}</div>
                        <div className="text-xs text-slate-500">{usage.user.email}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Guest / Unknown</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">
                    {usage.orderId || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-right font-black text-emerald-600">
                    - ₹{usage.discount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
