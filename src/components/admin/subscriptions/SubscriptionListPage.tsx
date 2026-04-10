import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';

import { DOMAINS } from '../../../constants';

export function SubscriptionListPage() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Expired' | 'Cancelled' | ''>('Active');
  const [assignModal, setAssignModal] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({ 
    userId: '', planName: '', planType: 'Monthly', durationMonths: '1',
    domainName: '', contentTypes: [] as string[]
  });
  const [saving, setSaving] = useState(false);

  const AVAILABLE_CONTENT_TYPES = [
    'Books', 'Periodicals', 'Magazines', 'Case Reports', 'Theses', 
    'Conference Proceedings', 'Educational Videos', 'Newsletters'
  ];

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/subscriptions${q}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSubscriptions(await res.json());
    } catch { toast.error('Failed to load subscriptions'); }
    finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setUsers(await res.json());
    } catch {}
  };

  useEffect(() => { fetchSubs(); }, [statusFilter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/admin/subscriptions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Subscription ${newStatus.toLowerCase()}`);
      fetchSubs();
    } catch { toast.error('Update failed'); }
  };

  const handleAssign = async () => {
    if (!assignForm.userId) { toast.error('User is required'); return; }
    if (!assignForm.planName && !assignForm.domainName) { toast.error('Domain Name or Plan Custom Name required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${assignForm.userId}/assign-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(assignForm)
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Subscription assigned!');
      setAssignModal(false);
      setAssignForm({ userId: '', planName: '', planType: 'Monthly', durationMonths: '1', domainName: '', contentTypes: [] });
      fetchSubs();
    } catch { toast.error('Assignment failed'); }
    finally { setSaving(false); }
  };

  const STATUS_COLORS: Record<string, string> = {
    Active:    'bg-emerald-100 text-emerald-700',
    Expired:   'bg-red-100 text-red-700',
    Cancelled: 'bg-slate-100 text-slate-600'
  };

  const PLAN_COLORS: Record<string, string> = {
    Monthly: 'bg-blue-100 text-blue-700',
    Yearly:  'bg-indigo-100 text-indigo-700',
    Custom:  'bg-purple-100 text-purple-700'
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscriptions</h1>
          <p className="text-sm text-slate-500">Manage all user subscriptions. Expired subs auto-update on page load.</p>
        </div>
        <button onClick={() => { fetchUsers(); setAssignModal(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
          <Plus size={15} /> Assign Manually
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {(['Active', 'Expired', 'Cancelled', ''] as const).map(f => (
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
              <th className="px-5 py-3 font-semibold text-slate-600">Duration</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Start Date</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Expiry Date</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">
                <div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              </td></tr>
            ) : subscriptions.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400">No subscriptions found.</td></tr>
            ) : subscriptions.map(sub => (
              <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="font-semibold text-slate-900">{sub.user?.displayName || sub.user?.email || 'Unknown User'}</div>
                  <div className="text-xs text-slate-500">{sub.user?.email}</div>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${PLAN_COLORS[sub.planType] || 'bg-slate-100 text-slate-600'}`}>
                    {sub.planType}
                  </span>
                  <div className="text-xs text-slate-500 mt-0.5">{sub.planName}</div>
                </td>
                <td className="px-5 py-3 text-slate-600">{sub.durationMonths || 1} month{(sub.durationMonths || 1) > 1 ? 's' : ''}</td>
                <td className="px-5 py-3 text-slate-600 text-xs">{sub.startDate ? format(new Date(sub.startDate), 'dd MMM yyyy') : '—'}</td>
                <td className="px-5 py-3">
                  <div className={`text-xs font-semibold ${sub.status === 'Expired' ? 'text-red-600' : sub.status === 'Active' ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {sub.endDate ? format(new Date(sub.endDate), 'dd MMM yyyy') : '—'}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${STATUS_COLORS[sub.status] || ''}`}>
                    {sub.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {sub.status === 'Active' && (
                    <button onClick={() => handleStatusChange(sub.id, 'Cancelled')}
                      className="px-3 py-1 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                      Cancel
                    </button>
                  )}
                  {sub.status === 'Cancelled' && (
                    <button onClick={() => handleStatusChange(sub.id, 'Active')}
                      className="px-3 py-1 text-xs font-bold text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
                      Re-activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">Manually Assign Subscription</h2>
              <p className="text-sm text-slate-500 mt-1">Create a subscription directly for any user.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Select User <span className="text-red-500">*</span></label>
                <select value={assignForm.userId} onChange={e => setAssignForm(f => ({ ...f, userId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:border-blue-500 outline-none">
                  <option value="">— Choose user —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.displayName || 'No Name'} | {u.role} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Domain Name <span className="text-red-500">*</span></label>
                <select value={assignForm.domainName} onChange={e => setAssignForm(f => ({ ...f, domainName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:border-blue-500 outline-none">
                  <option value="">— Choose domain —</option>
                  <option value="All Domains">All Domains Packages</option>
                  {DOMAINS.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Content Types <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {AVAILABLE_CONTENT_TYPES.map(ct => (
                    <label key={ct} className="flex items-center gap-2 text-sm text-slate-600">
                      <input 
                        type="checkbox" 
                        checked={assignForm.contentTypes.includes(ct)}
                        onChange={(e) => {
                          const newTypes = e.target.checked 
                            ? [...assignForm.contentTypes, ct]
                            : assignForm.contentTypes.filter(t => t !== ct);
                          setAssignForm(f => ({ ...f, contentTypes: newTypes }));
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {ct}
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Plan Custom Name (optional)</label>
                <input type="text" value={assignForm.planName} onChange={e => setAssignForm(f => ({ ...f, planName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:border-blue-500 outline-none"
                  placeholder="e.g. Special Architecture Grant" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Plan Type</label>
                  <select value={assignForm.planType} onChange={e => {
                      const val = e.target.value;
                      const months = val === 'Yearly' ? '12' : val === 'Quarterly' ? '3' : '1';
                      setAssignForm(f => ({ ...f, planType: val, durationMonths: months }));
                    }}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:border-blue-500 outline-none">
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Duration (months)</label>
                  <input type="number" min="1" value={assignForm.durationMonths} onChange={e => setAssignForm(f => ({ ...f, durationMonths: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:border-blue-500 outline-none" />
                </div>
              </div>
            </div>
            <div className="p-6 flex gap-3 justify-end border-t border-slate-100">
              <button onClick={() => setAssignModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleAssign} disabled={saving}
                className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2">
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={15} />}
                Assign Subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
