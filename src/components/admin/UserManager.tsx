import React, { useState, useEffect } from 'react';
import {
  Search, ShieldAlert, ShieldCheck, Mail, Calendar, CreditCard,
  ChevronDown, Pencil, Trash2, RefreshCw, X, Save, Loader2,
  UserPlus, Filter, Building2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const ROLES = ['SuperAdmin', 'SubscriptionManager', 'Institution', 'Student', 'Subscriber'];

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin: 'bg-red-100 text-red-700',
  SubscriptionManager: 'bg-emerald-100 text-emerald-700',
  Institution: 'bg-indigo-100 text-indigo-700',
  Student: 'bg-purple-100 text-purple-700',
  Subscriber: 'bg-blue-100 text-blue-700',
};

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

export function UserManager() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Edit modal
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '', role: '', organization: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Reset password
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRole !== 'all') params.set('role', filterRole);
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/users?${params}`, { headers: authHeader() });
      let data: any[] = [];
      try { data = await res.json(); } catch {}
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Could not fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [filterRole]);

  /* ── EDIT ── */
  const openEdit = (user: any) => {
    setEditUser(user);
    setEditForm({
      displayName: user.displayName || '',
      email: user.email || '',
      role: user.role || '',
      organization: user.organization || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(editForm),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error || 'Update failed');
      toast.success('User updated');
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  /* ── DELETE ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success(`User "${deleteTarget.displayName || deleteTarget.email}" deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── BLOCK / UNBLOCK ── */
  const handleToggleBlock = async (id: string, isBlocked: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ isBlocked }),
      });
      if (!res.ok) throw new Error();
      toast.success(isBlocked ? 'User blocked' : 'User unblocked');
      fetchUsers();
    } catch {
      toast.error('Failed to update status');
    }
  };

  /* ── RESET PASSWORD ── */
  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: authHeader(),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error || 'Reset failed');
      toast.success(`New password emailed to ${resetTarget.email}`);
      setResetTarget(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const filtered = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create, edit, and manage all platform users.</p>
        </div>
        <button
          onClick={() => navigate('/admin/users/create')}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all"
        >
          <UserPlus size={16} /> Create User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchUsers()}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none appearance-none"
          >
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">User</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-16 text-center text-slate-500">
                  <Loader2 className="animate-spin mx-auto mb-2 text-blue-500" size={24} />
                  Loading users…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-16 text-center text-slate-400">No users found.</td></tr>
              ) : filtered.map(user => (
                <React.Fragment key={user.id}>
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold shrink-0">
                          {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{user.displayName || 'Unnamed'}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1"><Mail size={11} />{user.email}</div>
                          {user.organization && <div className="text-xs text-slate-400 mt-0.5">{user.organization}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        user.isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {user.isBlocked ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
                        {user.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        <button onClick={() => openEdit(user)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit user">
                          <Pencil size={15} />
                        </button>
                        {/* Block/Unblock */}
                        <button onClick={() => handleToggleBlock(user.id, !user.isBlocked)}
                          className={`p-2 rounded-lg transition-colors ${user.isBlocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                          title={user.isBlocked ? 'Unblock' : 'Block'}>
                          {user.isBlocked ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                        </button>
                        {/* Reset Password */}
                        <button onClick={() => setResetTarget(user)}
                          className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Reset password">
                          <RefreshCw size={15} />
                        </button>
                        {/* Delete */}
                        <button onClick={() => setDeleteTarget(user)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete user">
                          <Trash2 size={15} />
                        </button>
                        {/* Expand */}
                        <button onClick={() => setExpandedRow(expandedRow === user.id ? null : user.id)}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                          <ChevronDown size={16} className={`transition-transform ${expandedRow === user.id ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded details */}
                  {expandedRow === user.id && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={4} className="px-6 py-5 border-b border-slate-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <Calendar size={13} /> Active Subscriptions
                            </h4>
                            {user.subscriptions?.length > 0 ? (
                              <ul className="space-y-2">
                                {user.subscriptions.map((sub: any) => (
                                  <li key={sub.id} className="bg-white p-3 rounded-xl border border-slate-200 text-sm flex justify-between">
                                    <div>
                                      <div className="font-bold text-slate-800">{sub.planName || sub.domainName}</div>
                                      <div className="text-xs text-slate-500">Expires: {new Date(sub.endDate).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 rounded-full self-center ${sub.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{sub.status}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-slate-400 italic">No active subscriptions.</p>}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <CreditCard size={13} /> Recent Payments
                            </h4>
                            {user.payments?.length > 0 ? (
                              <ul className="space-y-2">
                                {user.payments.map((p: any) => (
                                  <li key={p.id} className="bg-white p-3 rounded-xl border border-slate-200 text-sm flex justify-between">
                                    <div>
                                      <div className="font-bold text-slate-800">₹{p.amount}</div>
                                      <div className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 rounded-full self-center ${p.status === 'Success' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-slate-400 italic">No payment history.</p>}
                          </div>
                        </div>

                        {/* Institution Specific Details */}
                        {user.role === 'Institution' && user.institutionProfile && (
                          <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="col-span-1 sm:col-span-3">
                              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Building2 size={13} /> Institution Marketing Details
                              </h4>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-200">
                              <div className="text-[10px] font-bold text-slate-400 uppercase">Courses Offered</div>
                              <div className="text-sm font-medium text-slate-800 mt-1">{user.institutionProfile.coursesOffered || '—'}</div>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-200">
                              <div className="text-[10px] font-bold text-slate-400 uppercase">Total Courses</div>
                              <div className="text-sm font-medium text-slate-800 mt-1">{user.institutionProfile.totalCourses || '—'}</div>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-200">
                              <div className="text-[10px] font-bold text-slate-400 uppercase">Student Body Size</div>
                              <div className="text-sm font-medium text-slate-800 mt-1">{user.institutionProfile.studentBodySize || '—'}</div>
                            </div>
                            {(user.institutionProfile.city || user.institutionProfile.contactPhone) && (
                              <div className="col-span-1 sm:col-span-3 bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap gap-6">
                                {user.institutionProfile.city && (
                                  <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">City</div>
                                    <div className="text-sm font-medium text-slate-800 mt-1">{user.institutionProfile.city}</div>
                                  </div>
                                )}
                                {user.institutionProfile.contactPhone && (
                                  <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Contact Phone</div>
                                    <div className="text-sm font-medium text-slate-800 mt-1">{user.institutionProfile.contactPhone}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer count */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
          {filtered.length} user{filtered.length !== 1 ? 's' : ''} shown
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      <AnimatePresence>
        {editUser && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                <h2 className="text-white font-bold text-lg">Edit User</h2>
                <button onClick={() => setEditUser(null)} className="text-blue-200 hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                  <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 outline-none">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Organization / Institution Name</label>
                  <input value={editForm.organization} onChange={e => setEditForm(f => ({ ...f, organization: e.target.value }))}
                    placeholder="Optional"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setEditUser(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={editSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-600/20">
                    {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {editSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRM MODAL ── */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center"><Trash2 className="text-red-600" size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-900">Delete User?</h3>
                  <p className="text-sm text-slate-500">This is permanent and cannot be undone.</p>
                </div>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm">
                <span className="font-bold text-red-800">{deleteTarget.displayName || deleteTarget.email}</span>
                <span className="text-red-600"> ({deleteTarget.role})</span>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                <button onClick={handleDelete} disabled={deleteLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50">
                  {deleteLoading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  {deleteLoading ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── RESET PASSWORD CONFIRM ── */}
      <AnimatePresence>
        {resetTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-purple-100 flex items-center justify-center"><RefreshCw className="text-purple-600" size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-900">Reset Password?</h3>
                  <p className="text-sm text-slate-500">A new password will be emailed to the user.</p>
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-sm font-bold text-purple-900">
                {resetTarget.email}
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setResetTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                <button onClick={handleResetPassword} disabled={resetLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50">
                  {resetLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  {resetLoading ? 'Sending…' : 'Send Reset'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
