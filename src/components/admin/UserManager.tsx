import React, { useState, useEffect } from 'react';
import {
  Search, ShieldAlert, ShieldCheck, Mail, Calendar, CreditCard,
  ChevronDown, Pencil, Trash2, RefreshCw, X, Save, Loader2,
  UserPlus, Filter, Building2, Download, BookOpen, LogOut, Undo2, Clock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { UsersByInstitution } from './UsersByInstitution';
import { LibrarianMembers } from './LibrarianMembers';
import { AccountDepartments } from './AccountDepartments';
import { REGISTRANT_TYPES, DOMAINS } from '../../constants';
import { AccountSummary, ResetPasswordDialog, useReauth } from './AccountSecurity';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_SESSION_LIMIT, MAX_SESSION_LIMIT, MIN_SESSION_LIMIT } from '../../lib/sessionLimits';

// The roles that exist on the server (STAFF_ROLES + reader roles). The server decides who may assign which.
const ROLES = ['SuperAdmin', 'SubscriptionManager', 'ContentManager', 'SalesManager', 'SalesExecutive', 'Publisher', 'Institution', 'Student', 'Subscriber'];

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin: 'bg-alarm-soft text-alarm',
  SubscriptionManager: 'bg-success-soft text-success',
  ContentManager: 'bg-caution-soft text-caution',
  Institution: 'bg-info-soft text-info',
  Student: 'bg-accent-soft text-accent',
  Subscriber: 'bg-info-soft text-accent',
};
const ACCOUNT_LABEL: Record<string, string> = {
  blocked: 'Blocked', active: 'Active', pending_deletion: 'Pending deletion', removed: 'Removed from institution', deleted: 'Deleted',
};

const isRemoved = (u: any) => u.status === 'PENDING_DELETION' || u.status === 'DELETED';
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
/** "47h 58m" until the purge. Display only: the server's clock decides when anything is deleted. */
const timeLeft = (iso?: string | null) => {
  if (!iso) return '—';
  const m = Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
  return m <= 0 ? 'due now' : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** The filters, as the server's question. */
function queryFor(f: Record<string, string>, search: string) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && v !== 'all') params.set(k, v);
  if (search) params.set('search', search);
  return params;
}

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

export function UserManager() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Every one of these is a question for the database now. Two of them used to
  // be answered by sifting the fifty rows already on screen, which reads as a
  // filter and behaves as a lie once there is more than one page.
  const [filters, setFilters] = useState({
    role: 'all', accountStatus: 'all', registrantType: 'all', state: 'all', source: 'all',
    verified: 'all', active: 'all', domain: 'all', joinedFrom: '',
  });
  const [counts, setCounts] = useState<any>(null);
  const [facets, setFacets] = useState<any>(null);
  /**
   * The flat list of everybody, or the same people under their institution.
   * Remembered, because an admin who works institution by institution should
   * not have to find the switch again on every visit.
   */
  const [view, setView] = useState<'list' | 'institution'>(() => {
    try { return localStorage.getItem('adminUsersView') === 'institution' ? 'institution' : 'list'; }
    catch { return 'list'; }
  });
  useEffect(() => {
    try { localStorage.setItem('adminUsersView', view); } catch { /* blocked storage is not worth failing over */ }
  }, [view]);
  const [exporting, setExporting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Edit modal
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '', role: '', organization: '', contact: '', designation: '', branch: '', department: '', sessionLimit: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Cancel a scheduled deletion: the account only, or the account and its place at the institution it was removed from.
  const [restoreTarget, setRestoreTarget] = useState<{ user: any; membership: boolean } | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Reset password (the dialog owns its fields; nothing typed outlives it)
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  // Asks for the acting Super Admin's own password when the server requires it for another Super Admin.
  const reauth = useReauth();
  // The simultaneous-login limit is a Super Admin's to change; the server refuses anyone else whatever this screen shows.
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'SuperAdmin';
  const [summaryKey, setSummaryKey] = useState(0);

  // A page at a time, counted on the server. The browser used to hold every
  // member at once and sift them here, which is a habit that ends the day the
  // membership outgrows a screenful.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PER_PAGE = 50;

  const fetchUsers = async (toPage = page) => {
    setLoading(true);
    try {
      const params = queryFor(filters, search);
      params.set('page', String(toPage));
      params.set('limit', String(PER_PAGE));
      const res = await fetch(`/api/admin/users?${params}`, { headers: authHeader() });
      let data: any = null;
      try { data = await res.json(); } catch {}
      setUsers(Array.isArray(data) ? data : (data?.data ?? []));
      setTotal(Array.isArray(data) ? data.length : (data?.total ?? 0));
      setCounts(data?.counts ?? null);
      setFacets(data?.facets ?? null);
      setPage(toPage);
    } catch {
      toast.error('Could not fetch users');
    } finally {
      setLoading(false);
    }
  };

  // Searching is the server's job now, so it is asked again when the text
  // settles rather than filtering whatever happens to be in hand.
  useEffect(() => { fetchUsers(1); }, [filters]);
  useEffect(() => {
    const t = setTimeout(() => fetchUsers(1), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* ── EDIT ── */
  const openEdit = (user: any) => {
    setEditUser(user);
    setEditForm({
      displayName: user.displayName || '',
      email: user.email || '',
      role: user.role || '',
      organization: user.organization || '',
      contact: user.contact || '',
      designation: user.designation || '',
      branch: user.institutionProfile?.branch || '',
      department: user.institutionProfile?.department || '',
      // Empty is "use the system default"; the server stores that as null.
      sessionLimit: user.maxConcurrentSessions ? String(user.maxConcurrentSessions) : ''
    });
  };

  /** The limit as the form holds it: null for the default, a whole number 1-10, or an error to show instead of saving. */
  const parsedLimit = (): { value: number | null } | { error: string } => {
    const t = editForm.sessionLimit.trim();
    if (!t) return { value: null };
    const n = Number(t);
    return /^\d+$/.test(t) && n >= MIN_SESSION_LIMIT && n <= MAX_SESSION_LIMIT
      ? { value: n } : { error: `Enter a whole number from ${MIN_SESSION_LIMIT} to ${MAX_SESSION_LIMIT}, or use the system default.` };
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    const limit = parsedLimit();
    if ('error' in limit) { toast.error(limit.error); return; }
    setEditSaving(true);
    try {
      const { sessionLimit: _unused, ...fields } = editForm;
      const out = await reauth.run(actorPassword => fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        // The limit travels with the other fields, and only from a Super Admin: the server refuses anyone else's.
        body: JSON.stringify({ ...fields, ...(isSuperAdmin ? { maxConcurrentSessions: limit.value } : {}), ...(actorPassword ? { actorPassword } : {}) }),
      }));
      if (!out) return;
      if (!out.res.ok) throw new Error(out.body?.error || 'Update failed');
      toast.success(editForm.email.trim().toLowerCase() !== String(editUser.email).toLowerCase() || editForm.role !== editUser.role
        ? 'User updated. They will sign in again with the new details.' : 'User updated');
      setEditUser(null);
      fetchUsers();
      setSummaryKey(k => k + 1);
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
      const out = await reauth.run(actorPassword => fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(actorPassword ? { actorPassword } : {}),
      }));
      if (!out) return;
      if (!out.res.ok) throw new Error(out.body?.error || 'Delete failed');
      setSummaryKey(k => k + 1);
      toast.success(`User "${deleteTarget.displayName || deleteTarget.email}" deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── CANCEL A SCHEDULED DELETION ── */
  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoreLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${restoreTarget.user.id}/cancel-deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ restoreMembership: restoreTarget.membership }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Could not cancel the deletion');
      toast.success(restoreTarget.membership ? 'Deletion cancelled and the user restored to their institution' : 'Deletion cancelled. The institution membership was not restored.');
      setRestoreTarget(null);
      fetchUsers();
      setSummaryKey(k => k + 1);
    } catch (err: any) {
      toast.error(err?.message || 'Could not cancel the deletion');
    } finally {
      setRestoreLoading(false);
    }
  };

  /* ── BLOCK / UNBLOCK ── */
  const handleToggleBlock = async (id: string, isBlocked: boolean) => {
    try {
      const out = await reauth.run(actorPassword => fetch(`/api/admin/users/${id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ isBlocked, ...(actorPassword ? { actorPassword } : {}) }),
      }));
      if (!out) return;
      if (!out.res.ok) throw new Error(out.body?.error);
      toast.success(isBlocked ? 'User blocked and signed out' : 'User unblocked');
      fetchUsers();
      setSummaryKey(k => k + 1);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    }
  };

  /* ── END ACTIVE SESSION ── */
  const handleEndSession = async (user: any) => {
    if (!window.confirm(`Sign ${user.displayName || user.email} out? Their current session ends on its next request.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}/revoke-session`, { method: 'POST', headers: authHeader() });
      if (!res.ok) throw new Error();
      toast.success('Session ended');
      fetchUsers();
    } catch {
      toast.error('Could not end the session');
    }
  };

  /**
   * The whole answer, not the page of it.
   *
   * Both exports wrote out the fifty rows in hand under the name
   * users_export.csv. On a membership of one, that file is right; on a
   * membership of twenty thousand it is right about fifty of them and silent
   * about the rest, which is the worst way for a number to be wrong. The
   * server streams every member matching the filters that are set.
   */
  const exportMembers = async () => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const params = queryFor(filters, search);
      params.set('format', 'csv');
      const res = await fetch(`/api/admin/users?${params}`, { headers: authHeader() });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${total.toLocaleString()} members`);
    } catch {
      toast.error('Could not export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">User Management</h1>
          <p className="text-sm text-muted mt-0.5">Create, edit, and manage all platform users.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* One list of everybody, or the same people under the institution
              whose account they are on. */}
          <div className="flex rounded-xl border border-rule bg-surface p-1">
            {([['list', 'Everyone'], ['institution', 'By institution']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                  view === k ? 'bg-ink text-surface' : 'text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/admin/users/create')}
            className="flex items-center gap-2 bg-accent-solid text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all"
          >
            <UserPlus size={16} /> Create User
          </button>
        </div>
      </div>

      {view === 'institution' && <UsersByInstitution />}
      {view === 'list' && (<>
      <AccountSummary refreshKey={summaryKey} />

      {/* Filters — every one of them a question to the database */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              type="text"
              placeholder="Name, email or organisation…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchUsers(1)}
              className="w-full bg-surface border border-rule rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none transition-all"
            />
          </div>
          <button onClick={() => fetchUsers(page)} className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-rule rounded-xl text-sm font-medium hover:bg-surface-hover transition-colors">
            <RefreshCw size={15} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-rule rounded-xl text-sm font-bold hover:bg-surface-hover transition-colors text-ink-2 disabled:opacity-60"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-surface border border-rule rounded-xl shadow-lg overflow-hidden z-50">
                <button onClick={exportMembers} className="w-full text-left px-4 py-3 text-sm hover:bg-surface-hover font-medium text-ink-2">
                  Export all {total.toLocaleString()} matching members
                  <span className="block text-[11px] font-normal text-muted">CSV · every filter below applied</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { k: 'role', label: 'All roles', options: ROLES.map(r => [r, r]) },
            { k: 'accountStatus', label: 'Any status', options: Object.entries(ACCOUNT_LABEL) },
            { k: 'registrantType', label: 'Registering as', options: REGISTRANT_TYPES.map((t: any) => [t.value, t.label]) },
            { k: 'active', label: 'Read anything?', options: [['read', 'Has read something'], ['never', 'Never opened anything']] },
            { k: 'verified', label: 'Email', options: [['yes', 'Verified'], ['no', 'Not verified']] },
            { k: 'source', label: 'Came from', options: [
              ...(facets?.source || []).filter((f: any) => f.value).map((f: any) => [f.value, `${f.value} (${f.count})`]),
              ['none', 'No campaign tag'],
            ] },
            { k: 'state', label: 'Any state', options: (facets?.state || []).filter((f: any) => f.value).map((f: any) => [f.value, `${f.value} (${f.count})`]) },
            { k: 'domain', label: 'Any department', options: DOMAINS.map((d: any) => [d.name, d.name]) },
          ].map(f => (
            <select
              key={f.k}
              value={(filters as any)[f.k]}
              onChange={e => setFilters(v => ({ ...v, [f.k]: e.target.value }))}
              className={`px-3 py-2 rounded-xl text-sm font-medium outline-none appearance-none border transition-colors ${
                (filters as any)[f.k] !== 'all'
                  ? 'bg-accent-soft border-accent text-accent'
                  : 'bg-surface border-rule text-ink-2'}`}
            >
              <option value="all">{f.label}</option>
              {f.options.map(([v, label]: any) => <option key={v} value={v}>{label}</option>)}
            </select>
          ))}
          <input
            type="date"
            value={filters.joinedFrom}
            onChange={e => setFilters(v => ({ ...v, joinedFrom: e.target.value }))}
            title="Joined on or after"
            className={`px-3 py-2 rounded-xl text-sm font-medium outline-none border ${
              filters.joinedFrom ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-rule text-ink-2'}`}
          />
          {(Object.values(filters).some(v => v && v !== 'all') || search) && (
            <button
              onClick={() => { setSearch(''); setFilters({ role: 'all', accountStatus: 'all', registrantType: 'all', state: 'all', source: 'all', verified: 'all', active: 'all', domain: 'all', joinedFrom: '' }); }}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-muted hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {/* What the filters add up to. The one figure a campaign turns on —
            how many of the people who registered ever opened anything — did
            not exist on this screen before. */}
        {counts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-rule rounded-xl border border-rule bg-surface">
            {[
              { label: 'Matching', value: counts.matching, hint: 'these filters' },
              { label: 'Have read something', value: counts.everRead,
                hint: counts.matching ? `${Math.round((counts.everRead / counts.matching) * 100)}% of them` : '' },
              { label: 'Never opened anything', value: counts.neverRead, hint: 'registered only' },
              { label: 'Verified email', value: counts.verified, hint: '' },
            ].map(c => (
              <div key={c.label} className="p-4">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted">{c.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{Number(c.value || 0).toLocaleString()}</p>
                {c.hint && <p className="mt-0.5 text-[11px] text-muted">{c.hint}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface rounded-2xl border border-rule shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-2 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-ink-2 uppercase tracking-widest">User</th>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-ink-2 uppercase tracking-widest">Role</th>
                {/* The signup form has been collecting these for weeks and no
                    screen has ever shown them. */}
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-ink-2 uppercase tracking-widest">Registered as</th>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-ink-2 uppercase tracking-widest">Activity</th>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-ink-2 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-ink-2 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule-subtle">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-muted">
                  <Loader2 className="animate-spin mx-auto mb-2 text-accent" size={24} />
                  Loading users…
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-muted">No users found.</td></tr>
              ) : users.map(user => (
                <React.Fragment key={user.id}>
                  <tr aria-selected={expandedRow === user.id} className={`transition-colors ${expandedRow === user.id ? 'bg-accent-soft' : 'hover:bg-surface-hover'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold shrink-0 overflow-hidden shadow-sm">
                          {user.institutionProfile?.logoUrl ? (
                            <img src={user.institutionProfile.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                          ) : (
                            (user.displayName || user.email || '?').charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-ink text-sm flex items-center gap-2">
                            {user.displayName || 'Unnamed'}
                            {user.isDemoAccount && (
                              <span className="bg-caution-soft text-caution text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest border border-caution/40">
                                Demo
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted flex items-center gap-1">
                            <Mail size={11} />{user.email}
                            {user.isEmailVerified ? (
                              <span className="inline-flex items-center gap-0.5 text-success bg-success-soft px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ml-1">
                                <ShieldCheck size={10} /> Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-caution bg-caution-soft px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ml-1">
                                <ShieldAlert size={10} /> Unverified
                              </span>
                            )}
                          </div>
                          {user.organization && <div className="text-xs text-muted mt-0.5">{user.organization}</div>}
                          {(user.designation || user.contact) && (
                            <div className="text-xs text-muted mt-0.5 flex gap-2">
                              {user.designation && <span className="font-semibold text-ink-2">{user.designation}</span>}
                              {user.contact && <span>• {user.contact}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {/* An institution's people are shown by what they are to the library (Faculty, Student…),
                          not by the technical access class they all share. Staff and individuals keep theirs. */}
                      {user.institutionId && user.role !== 'Institution' ? (
                        <span title={user.accessRoleSource === 'designation' ? 'Settled from the designation; not yet saved on the account' : user.accessRole ? undefined : 'No role has been chosen, and the designation does not settle one'}
                          className={`text-xs font-bold px-2.5 py-1 rounded-full ${user.accessRole ? 'bg-surface-2 text-ink-2' : 'bg-caution-soft text-caution'}`}>
                          {user.accessRole || 'Needs review'}
                        </span>
                      ) : (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_COLORS[user.role] || 'bg-surface-2 text-ink-2'}`}>
                          {user.role === 'Institution' ? 'Institution Admin' : user.role}
                        </span>
                      )}
                      {user.sessionLimit > 1 && (
                        <span title={`Allowed ${user.sessionLimit} simultaneous logins (${user.activeSessionCount ?? 0} now)`}
                          className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-info-soft text-info whitespace-nowrap">{user.sessionLimit} logins</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs">
                        <p className="font-semibold text-ink-2">{user.registrantType || <span className="text-muted">—</span>}</p>
                        {user.designation && <p className="text-muted">{user.designation}</p>}
                        {(user.state || user.country) && (
                          <p className="mt-0.5 text-muted">{[user.state, user.country].filter(Boolean).join(', ')}</p>
                        )}
                        {Array.isArray(user.interestedDomains) && user.interestedDomains.length > 0 && (
                          <p className="mt-0.5 text-muted" title={user.interestedDomains.join(', ')}>
                            {user.interestedDomains.length} department{user.interestedDomains.length > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs">
                        {user.lastReadAt ? (
                          <span className="inline-flex items-center gap-1 rounded bg-success-soft px-1.5 py-0.5 font-bold uppercase tracking-wider text-[9px] text-success">
                            <BookOpen size={10} /> read {new Date(user.lastReadAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-bold uppercase tracking-wider text-[9px] text-muted">
                            never opened anything
                          </span>
                        )}
                        {/* The tag is a code; where a campaign is registered under
                            it, the row says what it stands for instead. */}
                        <p className="mt-1 text-muted">
                          {user.campaign ? (
                            <>via <b className="text-ink-2">{user.campaign.name}</b>
                              {' '}<span className="text-muted">{user.campaign.channel} · {user.campaign.ownerName}</span></>
                          ) : user.signupSource ? (
                            <>via <b className="text-ink-2">{user.signupSource}</b></>
                          ) : 'no campaign tag'}
                        </p>
                        {user.createdAt && (
                          <p className="text-muted">joined {new Date(user.createdAt).toLocaleDateString()}</p>
                        )}
                        <p className="text-muted">last sign-in {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '—'}</p>
                        {/* Whether a password exists, never what it is. */}
                        <p className="text-muted">password {user.hasPassword ? 'configured' : (user.signInMethods || []).includes('Google') ? 'not set (signs in with Google)' : <b className="text-caution">not configured</b>}</p>
                        {(user.signInMethods || []).length > 0 && <p className="text-muted">sign-in {(user.signInMethods as string[]).join(' + ')}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isRemoved(user) ? (
                        <>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            user.status === 'DELETED' ? 'bg-surface-3 text-muted' : 'bg-caution-soft text-caution'
                          }`}>
                            <Clock size={11} /> {user.status === 'DELETED' ? 'Deleted' : 'Pending deletion'}
                          </span>
                          {user.removal && (
                            <div className="mt-1.5 text-left text-[10px] leading-tight text-muted">
                              <p>Removed from <b className="text-ink-2">{user.removal.removedByInstitution?.name || 'an institution'}</b></p>
                              <p>by {user.removal.removedBy || 'unknown'}</p>
                              <p>Removed {when(user.removal.removedAt)}</p>
                              {user.status === 'DELETED'
                                ? <p>Anonymised {when(user.removal.purgedAt)}</p>
                                : <>
                                    <p>Scheduled {when(user.removal.scheduledDeletionAt)}</p>
                                    <p className="font-bold text-caution">{timeLeft(user.removal.scheduledDeletionAt)} remaining</p>
                                  </>}
                            </div>
                          )}
                        </>
                      ) : (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        user.isBlocked ? 'bg-alarm-soft text-alarm' : 'bg-success-soft text-success'
                      }`}>
                        {user.isBlocked ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
                        {user.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                      )}
                      {!isRemoved(user) && user.removal && (
                        <p className="mt-1.5 text-[10px] leading-tight text-muted">Removed from {user.removal.removedByInstitution?.name || 'an institution'} {when(user.removal.removedAt)}</p>
                      )}
                      {user.activeSession && (
                        <div className="mt-1.5 text-[10px] leading-tight text-muted">
                          <p className="font-bold text-success">Signed in</p>
                          <p>{user.activeSession.device || 'Unknown browser'}</p>
                          <p>since {new Date(user.activeSession.loginAt).toLocaleString()}</p>
                          <p>last active {new Date(user.activeSession.lastActivity).toLocaleString()}</p>
                          <p>expires {new Date(user.activeSession.expiresAt).toLocaleString()}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Their mail: what has gone to them, and what is still due */}
                        <button onClick={() => navigate(`/admin/emails?user=${user.id}`)}
                          className="p-2 text-muted hover:text-accent hover:bg-accent-soft rounded-lg transition-colors"
                          title="Emails sent to this member">
                          <Mail size={15} />
                        </button>
                        {/* A removed account can only be brought back (or left to run out); nothing else applies to it. */}
                        {user.status === 'PENDING_DELETION' && (
                          <>
                            <button onClick={() => setRestoreTarget({ user, membership: false })}
                              className="p-2 text-muted hover:text-success hover:bg-success-soft rounded-lg transition-colors" title="Cancel deletion">
                              <Undo2 size={15} />
                            </button>
                            {user.removal?.removedByInstitution && (
                              <button onClick={() => setRestoreTarget({ user, membership: true })}
                                className="p-2 text-muted hover:text-accent hover:bg-accent-soft rounded-lg transition-colors"
                                title={`Cancel deletion and restore to ${user.removal.removedByInstitution.name}`}>
                                <Building2 size={15} />
                              </button>
                            )}
                          </>
                        )}
                        {!isRemoved(user) && (<>
                        {/* Edit */}
                        <button onClick={() => openEdit(user)}
                          className="p-2 text-muted hover:text-accent hover:bg-accent-soft rounded-lg transition-colors"
                          title="Edit user">
                          <Pencil size={15} />
                        </button>
                        {/* Block/Unblock */}
                        <button onClick={() => handleToggleBlock(user.id, !user.isBlocked)}
                          className={`p-2 rounded-lg transition-colors ${user.isBlocked ? 'text-success hover:bg-success-soft' : 'text-caution hover:bg-caution-soft'}`}
                          title={user.isBlocked ? 'Unblock' : 'Block'}>
                          {user.isBlocked ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                        </button>
                        {/* Sign out active session */}
                        {user.activeSession && (
                          <button onClick={() => handleEndSession(user)}
                            className="p-2 text-muted hover:text-caution hover:bg-caution-soft rounded-lg transition-colors"
                            title="Sign out active session">
                            <LogOut size={15} />
                          </button>
                        )}
                        {/* Reset Password */}
                        <button onClick={() => setResetTarget(user)}
                          className="p-2 text-muted hover:text-accent hover:bg-accent-soft rounded-lg transition-colors"
                          title="Reset password">
                          <RefreshCw size={15} />
                        </button>
                        </>)}
                        {/* Delete */}
                        <button onClick={() => setDeleteTarget(user)}
                          className="p-2 text-muted hover:text-alarm hover:bg-alarm-soft rounded-lg transition-colors"
                          title="Delete user">
                          <Trash2 size={15} />
                        </button>
                        {/* Expand */}
                        <button onClick={() => setExpandedRow(expandedRow === user.id ? null : user.id)}
                          className="p-2 text-muted hover:text-ink hover:bg-surface-3 rounded-lg transition-colors">
                          <ChevronDown size={16} className={`transition-transform ${expandedRow === user.id ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded details */}
                  {expandedRow === user.id && (
                    <tr className="bg-surface-2/60">
                      <td colSpan={6} className="px-6 py-5 border-b border-rule-subtle">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h4 className="text-xs font-bold text-ink-2 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <Calendar size={13} /> Active Subscriptions
                            </h4>
                            {(user.role === 'Student' || user.role === 'Institution') && user.institution ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <Building2 size={13} className="text-info" />
                                  <span className="text-xs font-semibold text-info">{user.role === 'Institution' ? user.institution.name : `Via: ${user.institution.name}`}</span>
                                </div>
                                {user.institution.subscriptions?.length > 0 ? (
                                  <ul className="space-y-2">
                                    {user.institution.subscriptions.map((sub: any) => (
                                      <li key={sub.id} className="bg-surface p-3 rounded-xl border border-info/30 text-sm flex justify-between">
                                        <div>
                                          <div className="font-bold text-ink">{sub.planName || sub.domainName}</div>
                                          <div className="text-xs text-muted">Domains: {Array.isArray(sub.domains) ? sub.domains.join(', ') : sub.domainName || '—'}</div>
                                          <div className="text-xs text-muted">Expires: {sub.endDate ? new Date(sub.endDate).toLocaleDateString('en-IN') : '—'}</div>
                                        </div>
                                        <span className="text-[10px] font-bold px-2 rounded-full self-center bg-success-soft text-success">{sub.status}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : <p className="text-sm text-muted italic">No active subscriptions for this institution.</p>}
                              </div>
                            ) : user.subscriptions?.length > 0 ? (
                              <ul className="space-y-2">
                                {user.subscriptions.map((sub: any) => (
                                  <li key={sub.id} className="bg-surface p-3 rounded-xl border border-rule text-sm flex justify-between">
                                    <div>
                                      <div className="font-bold text-ink">{sub.planName || sub.domainName}</div>
                                      <div className="text-xs text-muted">Expires: {new Date(sub.endDate).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 rounded-full self-center ${sub.status === 'Active' ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'}`}>{sub.status}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-muted italic">No active subscriptions.</p>}
                          </div>

                          {/* Extra Details (Branch, Dept) */}
                          {(user.institutionProfile?.branch || user.institutionProfile?.department) && (
                            <div>
                              <h4 className="text-xs font-bold text-ink-2 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Building2 size={13} /> Academic Info
                              </h4>
                              <div className="bg-surface p-3 rounded-xl border border-rule grid grid-cols-2 gap-2">
                                {user.institutionProfile.branch && (
                                  <div>
                                    <div className="text-[10px] font-bold text-muted uppercase">Branch</div>
                                    <div className="text-sm font-medium text-ink">{user.institutionProfile.branch}</div>
                                  </div>
                                )}
                                {user.institutionProfile.department && (
                                  <div>
                                    <div className="text-[10px] font-bold text-muted uppercase">Department</div>
                                    <div className="text-sm font-medium text-ink">{user.institutionProfile.department}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          <div>
                            <h4 className="text-xs font-bold text-ink-2 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <CreditCard size={13} /> Recent Payments
                            </h4>
                            {user.payments?.length > 0 ? (
                              <ul className="space-y-2">
                                {user.payments.map((p: any) => (
                                  <li key={p.id} className="bg-surface p-3 rounded-xl border border-rule text-sm flex justify-between">
                                    <div>
                                      <div className="font-bold text-ink">₹{p.amount}</div>
                                      <div className="text-xs text-muted">{new Date(p.createdAt).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 rounded-full self-center ${p.status === 'Success' ? 'bg-success-soft text-success' : 'bg-caution-soft text-caution'}`}>{p.status}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-muted italic">No payment history.</p>}
                          </div>
                        </div>

                        {/* The departments this account selected (and, where it differs, what it can open). Fetched for this row only. */}
                        <AccountDepartments userId={user.id} />

                        {/* The people this librarian put on the library. */}
                        {user.role === 'Institution' && user.institutionId && (
                          <LibrarianMembers
                            librarianId={user.id}
                            institutionId={user.institutionId}
                            institutionName={user.institution?.name}
                          />
                        )}

                        {/* Institution Specific Details */}
                        {user.role === 'Institution' && user.institutionProfile && (
                          <div className="mt-6 pt-6 border-t border-rule grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="col-span-1 sm:col-span-3">
                              <h4 className="text-xs font-bold text-ink-2 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Building2 size={13} /> Institution Marketing Details
                              </h4>
                            </div>
                            <div className="bg-surface p-3 rounded-xl border border-rule">
                              <div className="text-[10px] font-bold text-muted uppercase">Courses Offered</div>
                              <div className="text-sm font-medium text-ink mt-1">{user.institutionProfile.coursesOffered || '—'}</div>
                            </div>
                            <div className="bg-surface p-3 rounded-xl border border-rule">
                              <div className="text-[10px] font-bold text-muted uppercase">Total Courses</div>
                              <div className="text-sm font-medium text-ink mt-1">{user.institutionProfile.totalCourses || '—'}</div>
                            </div>
                            <div className="bg-surface p-3 rounded-xl border border-rule">
                              <div className="text-[10px] font-bold text-muted uppercase">Student Body Size</div>
                              <div className="text-sm font-medium text-ink mt-1">{user.institutionProfile.studentBodySize || '—'}</div>
                            </div>
                            {(user.institutionProfile.city || user.institutionProfile.contactPhone) && (
                              <div className="col-span-1 sm:col-span-3 bg-surface p-3 rounded-xl border border-rule flex flex-wrap gap-6">
                                {user.institutionProfile.city && (
                                  <div>
                                    <div className="text-[10px] font-bold text-muted uppercase">City</div>
                                    <div className="text-sm font-medium text-ink mt-1">{user.institutionProfile.city}</div>
                                  </div>
                                )}
                                {user.institutionProfile.contactPhone && (
                                  <div>
                                    <div className="text-[10px] font-bold text-muted uppercase">Contact Phone</div>
                                    <div className="text-sm font-medium text-ink mt-1">{user.institutionProfile.contactPhone}</div>
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
        {/* Footer count and pager. The count is the whole membership matching the
            filters, not the handful on screen — the difference between them is
            the entire point of paging. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-subtle bg-surface-2 px-6 py-3 text-xs text-muted">
          <span>
            {total.toLocaleString()} user{total !== 1 ? 's' : ''}
            {total > 0 && <> · showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)}</>}
          </span>
          {total > PER_PAGE && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchUsers(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-rule bg-surface px-3 py-1.5 font-semibold text-ink-2 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="tabular-nums">page {page} of {Math.max(1, Math.ceil(total / PER_PAGE))}</span>
              <button
                onClick={() => fetchUsers(page + 1)}
                disabled={page >= Math.ceil(total / PER_PAGE) || loading}
                className="rounded-lg border border-rule bg-surface px-3 py-1.5 font-semibold text-ink-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* ── EDIT MODAL ── */}
      <AnimatePresence>
        {editUser && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]"
            >
              <div className="bg-accent-solid px-6 py-4 flex items-center justify-between shrink-0">
                <h2 className="text-white font-bold text-lg">Edit User</h2>
                <button onClick={() => setEditUser(null)} className="text-white/80 hover:text-white" aria-label="Close"><X size={20} /></button>
              </div>
              {/* The form scrolls; the header above and the buttons below stay in view, however short the screen. */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Full Name</label>
                  <input value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                    className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Role</label>
                  <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent outline-none">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Organization / Institution Name</label>
                  <input value={editForm.organization} onChange={e => setEditForm(f => ({ ...f, organization: e.target.value }))}
                    placeholder="Optional"
                    className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Mobile Number</label>
                    <input value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))}
                      placeholder="Optional"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Designation</label>
                    <input value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))}
                      placeholder="Optional"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Branch</label>
                    <input value={editForm.branch} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))}
                      placeholder="Optional"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Department</label>
                    <input value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                      placeholder="Optional"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none" />
                  </div>
                </div>
                {/* Login access: how many sign-ins this account may hold at once. Nothing else about the account changes. */}
                <div className="border-t border-rule pt-4">
                  <p className="text-xs font-bold text-ink-2 uppercase tracking-widest mb-3">Login access</p>
                  {(() => {
                    const lim = parsedLimit();
                    const n = 'value' in lim ? (lim.value ?? DEFAULT_SESSION_LIMIT) : null;
                    return (
                      <>
                        <label htmlFor="session-limit" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Simultaneous login limit</label>
                        <div className="flex items-center gap-3">
                          <input id="session-limit" type="number" inputMode="numeric" min={MIN_SESSION_LIMIT} max={MAX_SESSION_LIMIT} step={1}
                            value={editForm.sessionLimit} disabled={!isSuperAdmin}
                            onChange={e => setEditForm(f => ({ ...f, sessionLimit: e.target.value }))}
                            placeholder={String(DEFAULT_SESSION_LIMIT)} aria-describedby="session-limit-help"
                            className="w-24 bg-surface-2 border border-rule px-4 py-2.5 rounded-xl text-sm tabular-nums focus:border-accent focus:ring-2 focus:ring-accent-soft outline-none disabled:opacity-60" />
                          {isSuperAdmin && editForm.sessionLimit !== '' && (
                            <button type="button" onClick={() => setEditForm(f => ({ ...f, sessionLimit: '' }))}
                              className="text-xs font-bold text-accent hover:underline">Use system default ({DEFAULT_SESSION_LIMIT})</button>
                          )}
                        </div>
                        <p id="session-limit-help" className={`mt-1.5 text-xs ${n === null ? 'text-alarm' : 'text-ink-2'}`}>
                          {n === null ? `Enter a whole number from ${MIN_SESSION_LIMIT} to ${MAX_SESSION_LIMIT}.`
                            : n === 1 ? 'This account can be signed in on one device or session at a time.'
                            : `This account can stay signed in on up to ${n} devices/sessions at the same time.`}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          Maximum number of active login sessions this account may use at the same time. System default: {DEFAULT_SESSION_LIMIT}.
                          {' '}Signed in now: {editUser.activeSessionCount ?? 0}.
                          {!isSuperAdmin && ' Only a Super Admin can change this.'}
                        </p>
                      </>
                    );
                  })()}
                </div>
                {/* The password is not an editable field: it cannot be shown, only replaced. */}
                <div className="rounded-xl border border-rule bg-surface-2 p-3 text-xs text-ink-2">
                  <p><b>Password:</b> {editUser.hasPassword ? 'Configured' : 'Not configured'}</p>
                  <p className="mt-0.5">Password cannot be displayed. Set a new password to replace it.</p>
                  <button type="button" onClick={() => { const u = editUser; setEditUser(null); setResetTarget(u); }}
                    className="mt-2 font-bold text-accent hover:underline">Reset password…</button>
                  {(editForm.email.trim().toLowerCase() !== String(editUser.email).toLowerCase() || editForm.role !== editUser.role) && (
                    <p className="mt-2 text-caution">Changing the email or role signs this user out; they sign in again with the new details{editForm.email.trim().toLowerCase() !== String(editUser.email).toLowerCase() ? ', and the new address must be verified again' : ''}.</p>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex justify-end gap-3 border-t border-rule bg-surface px-5 py-3 sm:px-6">
                <button onClick={() => setEditUser(null)} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-xl font-bold hover:bg-surface-3">Cancel</button>
                <button onClick={handleSaveEdit} disabled={editSaving}
                  className="flex items-center gap-2 px-5 py-2 bg-accent-solid text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50">
                  {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── CANCEL DELETION CONFIRM ── */}
      <AnimatePresence>
        {restoreTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-success-soft flex items-center justify-center"><Undo2 className="text-success" size={20} /></div>
                <div>
                  <h3 className="font-bold text-ink">Cancel this deletion?</h3>
                  <p className="text-sm text-muted">
                    {restoreTarget.membership
                      ? `The account is restored and added back to ${restoreTarget.user.removal?.removedByInstitution?.name || 'its institution'}.`
                      : 'The account is restored. It is not added back to the institution it was removed from.'}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setRestoreTarget(null)} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-xl font-bold hover:bg-surface-3">Keep scheduled</button>
                <button onClick={handleRestore} disabled={restoreLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-accent-solid text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50">
                  {restoreLoading ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
                  {restoreLoading ? 'Restoring…' : 'Cancel deletion'}
                </button>
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
              className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-alarm-soft flex items-center justify-center"><Trash2 className="text-alarm" size={20} /></div>
                <div>
                  <h3 className="font-bold text-ink">Delete User?</h3>
                  <p className="text-sm text-muted">This is permanent and cannot be undone.</p>
                </div>
              </div>
              <div className="bg-alarm-soft border border-alarm/30 rounded-xl p-3 text-sm">
                <span className="font-bold text-alarm">{deleteTarget.displayName || deleteTarget.email}</span>
                <span className="text-alarm"> ({deleteTarget.role})</span>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-xl font-bold hover:bg-surface-3">Cancel</button>
                <button onClick={handleDelete} disabled={deleteLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-alarm-solid text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50">
                  {deleteLoading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  {deleteLoading ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── RESET PASSWORD ── */}
      <ResetPasswordDialog user={resetTarget} onClose={() => { setResetTarget(null); fetchUsers(); }} run={reauth.run} />
      {reauth.dialog}
    </div>
  );
}
