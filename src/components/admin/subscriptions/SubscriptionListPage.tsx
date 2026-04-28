import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { Plus, Search, Building2, User, Package, BookOpen } from 'lucide-react';
import { DOMAINS } from '../../../constants';

export function SubscriptionListPage() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Expired' | 'Cancelled' | ''>('Active');
  
  // Assignment Modal States
  const [assignModal, setAssignModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // User Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRole, setSearchRole] = useState<'all' | 'Subscriber' | 'Institution'>('all');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Assignment Form Data
  const [assignMode, setAssignMode] = useState<'bundle' | 'quick'>('bundle');
  const [bundles, setBundles] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({ 
    userIds: [] as string[],
    bundleId: '',
    planType: 'Monthly', 
    durationMonths: '1',
    domains: [] as string[], 
    contentTypes: [] as string[]
  });

  const AVAILABLE_CONTENT_TYPES = [
    'Books', 'Periodicals', 'Magazines', 'Case Reports', 'Theses', 
    'Conference Proceedings', 'Educational Videos', 'Newsletters'
  ];

  // Fetch functions
  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/subscriptions${q}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSubscriptions(await res.json());
    } catch { toast.error('Failed to load subscriptions'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  // Handle User Search
  useEffect(() => {
    if (!assignModal) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const q = new URLSearchParams();
        if (searchQuery) q.set('search', searchQuery);
        if (searchRole !== 'all') q.set('role', searchRole);
        const res = await fetch(`/api/admin/users?${q.toString()}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setSearchResults(await res.json());
      } catch {
        // fail silently for search
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, searchRole, assignModal]);

  // Load Bundles
  useEffect(() => {
    if (assignModal && bundles.length === 0) {
      fetch('/api/bundles', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      .then(r => r.ok ? r.json() : [])
      .then(data => setBundles(Array.isArray(data) ? data : []))
      .catch(() => {});
    }
  }, [assignModal, bundles.length]);

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
    if (assignForm.userIds.length === 0) { toast.error('Select at least one user or institution'); return; }
    
    if (assignMode === 'bundle' && !assignForm.bundleId) {
      toast.error('Select a bundle'); return;
    }
    
    if (assignMode === 'quick' && (assignForm.domains.length === 0 || assignForm.contentTypes.length === 0)) {
      toast.error('Select at least one domain and content type'); return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          userIds: assignForm.userIds,
          bundleId: assignMode === 'bundle' ? assignForm.bundleId : undefined,
          domains: assignMode === 'quick' ? assignForm.domains : undefined,
          contentTypes: assignMode === 'quick' ? assignForm.contentTypes : undefined,
          planType: assignForm.planType,
          durationMonths: assignForm.durationMonths
        })
      });
      
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed');
      
      toast.success('Subscriptions assigned successfully!');
      setAssignModal(false);
      setAssignForm({ userIds: [], bundleId: '', planType: 'Monthly', durationMonths: '1', domains: [], contentTypes: [] });
      fetchSubs();
    } catch (err: any) { 
      toast.error(err.message || 'Assignment failed'); 
    }
    finally { setSaving(false); }
  };

  const toggleUserSelection = (id: string) => {
    setAssignForm(prev => {
      const isSelected = prev.userIds.includes(id);
      return {
        ...prev,
        userIds: isSelected ? prev.userIds.filter(uid => uid !== id) : [...prev.userIds, id]
      };
    });
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
          <h1 className="text-2xl font-bold text-slate-900">Subscriptions & Assignments</h1>
          <p className="text-sm text-slate-500">Manage institutional and user subscriptions efficiently.</p>
        </div>
        <button onClick={() => setAssignModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
          <Plus size={15} /> Mass Assign
        </button>
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {(['Active', 'Expired', 'Cancelled', ''] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${statusFilter === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden auto-x-scroll">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 font-semibold text-slate-600">Subscriber</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Plan</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Duration</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-slate-400">Loading...</td></tr>
            ) : subscriptions.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-slate-400">No subscriptions found.</td></tr>
            ) : subscriptions.map(sub => (
              <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {sub.institutionId ? <Building2 size={15} className="text-blue-500" /> : <User size={15} className="text-slate-400" />}
                    <div>
                      <div className="font-semibold text-slate-900">{sub.institution?.name || sub.user?.displayName || sub.user?.email || 'Unknown User'}</div>
                      <div className="text-xs text-slate-500">
                        {sub.institutionId ? `Institution Access (${sub.institution?.users?.length || 0} users)` : (sub.user?.email || 'Student')}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${PLAN_COLORS[sub.planType] || 'bg-slate-100 text-slate-600'}`}>
                    {sub.planType}
                  </span>
                  <div className="text-xs font-bold text-slate-800 mt-1">{sub.planName}</div>
                  <div className="text-xs text-slate-500 truncate max-w-xs">{Array.isArray(sub.domains) ? sub.domains.join(', ') : sub.domainName || 'No Domains'}</div>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  <div className="font-semibold">{sub.durationMonths || 1} month{(sub.durationMonths || 1) > 1 ? 's' : ''}</div>
                  <div className="text-[10px] text-slate-500">{sub.startDate ? format(new Date(sub.startDate), 'dd MMM yy') : ''} → {sub.endDate ? format(new Date(sub.endDate), 'dd MMM yy') : ''}</div>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-xl flex items-center gap-2"><Plus className="text-blue-600" /> Advanced Assignment</h2>
                <p className="text-sm text-slate-500 mt-1 pb-1">Scalable search-first system. Target users and auto-inherit via institutions.</p>
              </div>
              <button onClick={() => setAssignModal(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full">×</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
              {/* LEFT COLUMN: WHO */}
              <div className="flex-1 space-y-4 border-r border-slate-100 pr-0 md:pr-8">
                <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">1. Target Beneficiaries</h3>
                
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" placeholder="Search names or emails..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                  </div>
                  <select value={searchRole} onChange={e => setSearchRole(e.target.value as any)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:border-blue-500 outline-none">
                    <option value="all">Any Role</option>
                    <option value="Institution">Institutions</option>
                    <option value="Subscriber">Individuals</option>
                  </select>
                </div>

                <div className="border border-slate-200 rounded-xl max-h-[250px] overflow-y-auto bg-slate-50/50">
                  {searching ? (
                     <div className="p-4 text-center text-sm text-slate-400">Searching...</div>
                  ) : searchResults.length === 0 ? (
                     <div className="p-4 text-center text-sm text-slate-400">No users found. Try adjusting filters.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {searchResults.map(u => (
                        <label key={u.id} className="flex items-start gap-3 p-3 hover:bg-slate-100 cursor-pointer transition-colors pt-4 pb-4">
                          <input type="checkbox" checked={assignForm.userIds.includes(u.id)} onChange={() => toggleUserSelection(u.id)}
                            className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{u.displayName || u.email}</span>
                              <span className={`px-2 py-[2px] rounded text-[9px] font-bold uppercase tracking-wider ${u.role === 'Institution' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'}`}>
                                {u.role}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{u.email}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-xl border border-blue-100 font-medium">
                  <strong>Selected Targets:</strong> {assignForm.userIds.length} users ({assignForm.userIds.length > 0 ? "ready" : "none"})
                </div>
              </div>

              {/* RIGHT COLUMN: WHAT */}
              <div className="flex-1 space-y-5">
                <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">2. Subscription Package</h3>
                
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setAssignMode('bundle')} className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${assignMode === 'bundle' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                    <Package size={16} /> Pre-built Bundle
                  </button>
                  <button onClick={() => setAssignMode('quick')} className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${assignMode === 'quick' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                    <BookOpen size={16} /> Custom Array
                  </button>
                </div>

                {assignMode === 'bundle' ? (
                  <div className="space-y-3">
                    {bundles.length > 0 ? bundles.map(b => (
                      <div key={b.id} onClick={() => setAssignForm(f => ({ ...f, bundleId: b.id }))} 
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${assignForm.bundleId === b.id ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
                        <div className="font-bold text-slate-900">{b.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{Array.isArray(b.domains) ? b.domains.length : 0} Domains · {Array.isArray(b.contentTypes) ? b.contentTypes.length : 0} Media Types</div>
                      </div>
                    )) : (
                      <div className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded-xl">No bundles created yet in the database. Use Custom Array.</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Select Domain(s)</label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setAssignForm(f => ({ ...f, domains: f.domains.length === DOMAINS.length ? [] : DOMAINS.map(d => d.name) }))}
                          className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200">
                          Toggle All
                        </button>
                        {DOMAINS.map(d => (
                          <button key={d.name} type="button" onClick={() => {
                            setAssignForm(f => ({
                              ...f, domains: f.domains.includes(d.name) ? f.domains.filter(x => x !== d.name) : [...f.domains, d.name]
                            }))
                          }} className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${assignForm.domains.includes(d.name) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                            {d.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Content Types</label>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABLE_CONTENT_TYPES.map(ct => (
                          <button key={ct} type="button" onClick={() => {
                            setAssignForm(f => ({
                              ...f, contentTypes: f.contentTypes.includes(ct) ? f.contentTypes.filter(x => x !== ct) : [...f.contentTypes, ct]
                            }))
                          }} className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${assignForm.contentTypes.includes(ct) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                            {ct}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-slate-100">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Plan Billing Type</label>
                    <select value={assignForm.planType} onChange={e => {
                        const val = e.target.value;
                        const m = val === 'Yearly' ? '12' : val === 'Quarterly' ? '3' : '1';
                        setAssignForm(f => ({ ...f, planType: val, durationMonths: m }));
                      }}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:border-blue-500 outline-none">
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Quarterly</option>
                      <option value="Yearly">Yearly</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Access Duration (Months)</label>
                    <input type="number" min="1" value={assignForm.durationMonths} onChange={e => setAssignForm(f => ({ ...f, durationMonths: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:border-blue-500 outline-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 flex gap-3 justify-end border-t border-slate-100 bg-slate-50">
              <button onClick={() => setAssignModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleAssign} disabled={saving || assignForm.userIds.length === 0}
                className="px-6 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 rounded-xl disabled:opacity-50 disabled:shadow-none flex items-center gap-2 transition-all">
                {saving ? "Processing..." : `Grant Access to ${assignForm.userIds.length} users`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
