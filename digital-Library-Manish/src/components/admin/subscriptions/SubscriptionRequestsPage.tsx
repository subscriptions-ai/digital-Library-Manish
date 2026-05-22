import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Check, X, ChevronDown, Calendar, Clock, User, Mail } from 'lucide-react';
import { format } from 'date-fns';

export function SubscriptionRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'Pending' | 'Approved' | 'Rejected' | ''>('Pending');
  const [approveModal, setApproveModal] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [approveForm, setApproveForm] = useState({ startDate: '', endDate: '' });
  const [rejectNote, setRejectNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const query = activeFilter ? `?status=${activeFilter}` : '';
      const res = await fetch(`/api/admin/subscription-requests${query}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setRequests(data);
    } catch {
      toast.error('Could not load subscription requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [activeFilter]);

  const handleApprove = async () => {
    if (!approveModal) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/subscription-requests/${approveModal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(approveForm)
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success('Request approved — subscription created!');
      setApproveModal(null);
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessing(true);
    try {
      await fetch(`/api/admin/subscription-requests/${rejectModal.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ rejectionNote: rejectNote })
      });
      toast.success('Request rejected');
      setRejectModal(null);
      setRejectNote('');
      fetchRequests();
    } catch {
      toast.error('Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  const PLAN_COLOR: Record<string, string> = {
    Monthly: 'bg-blue-100 text-blue-700',
    Yearly:  'bg-indigo-100 text-indigo-700',
    Custom:  'bg-purple-100 text-purple-700'
  };

  const STATUS_COLOR: Record<string, string> = {
    Pending:  'bg-amber-100 text-amber-700',
    Approved: 'bg-emerald-100 text-emerald-700',
    Rejected: 'bg-red-100 text-red-700'
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscription Requests</h1>
          <p className="text-sm text-slate-500">Review and approve incoming subscription requests.</p>
        </div>
        {activeFilter === 'Pending' && requests.length > 0 && (
          <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-bold">{requests.length} Pending</span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {(['Pending', 'Approved', 'Rejected', ''] as const).map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${activeFilter === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 font-semibold text-slate-600">User Details</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Plan</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Duration</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Payment Ref</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Submitted</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">
                <div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              </td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">No {activeFilter || ''} requests found.</td></tr>
            ) : requests.map(req => (
              <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                      {req.userName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{req.userName}</div>
                      <div className="text-xs text-slate-500">{req.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${PLAN_COLOR[req.planType] || 'bg-slate-100 text-slate-600'}`}>
                    {req.planType}
                  </span>
                  {req.planDescription && <div className="text-xs text-slate-400 mt-0.5">{req.planDescription}</div>}
                </td>
                <td className="px-5 py-3 text-slate-600">
                  <div className="flex items-center gap-1"><Clock size={12} /> {req.durationMonths} month{req.durationMonths > 1 ? 's' : ''}</div>
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs">
                  {req.paymentRef ? (
                    req.paymentRef.startsWith('http') ? (
                      <a href={req.paymentRef} target="_blank" rel="noreferrer" className="text-blue-600 underline">View Screenshot</a>
                    ) : req.paymentRef
                  ) : <span className="text-slate-300">None</span>}
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs">
                  {req.createdAt ? format(new Date(req.createdAt), 'dd MMM yyyy') : '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${STATUS_COLOR[req.status] || ''}`}>
                    {req.status}
                  </span>
                  {req.rejectionNote && <div className="text-xs text-red-500 mt-0.5">{req.rejectionNote}</div>}
                </td>
                <td className="px-5 py-3 text-right">
                  {req.status === 'Pending' && (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setApproveModal(req); setApproveForm({ startDate: '', endDate: '' }); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors">
                        <Check size={13} /> Approve
                      </button>
                      <button onClick={() => { setRejectModal(req); setRejectNote(''); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors">
                        <X size={13} /> Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Approve Modal */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">Approve Subscription Request</h2>
              <p className="text-sm text-slate-500 mt-1">For <strong>{approveModal.userName}</strong> — {approveModal.planType} plan</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Date</label>
                <input type="date" value={approveForm.startDate} onChange={e => setApproveForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none" />
                <p className="text-xs text-slate-400 mt-1">Leave blank to use today's date</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Date (Expiry)</label>
                <input type="date" value={approveForm.endDate} onChange={e => setApproveForm(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none" />
                <p className="text-xs text-slate-400 mt-1">Leave blank to auto-calculate from {approveModal.durationMonths} month(s)</p>
              </div>
            </div>
            <div className="p-6 flex gap-3 justify-end border-t border-slate-100">
              <button onClick={() => setApproveModal(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleApprove} disabled={processing}
                className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2">
                {processing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={15} />}
                Approve & Create Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">Reject Request</h2>
              <p className="text-sm text-slate-500 mt-1">For <strong>{rejectModal.userName}</strong></p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Rejection Reason (optional)</label>
              <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none resize-none"
                placeholder="Reason visible to admin records..." />
            </div>
            <div className="p-6 flex gap-3 justify-end border-t border-slate-100">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleReject} disabled={processing}
                className="px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2">
                {processing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <X size={15} />}
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
