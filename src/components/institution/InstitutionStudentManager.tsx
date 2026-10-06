import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, ShieldCheck, ShieldAlert, BookOpen, Clock, AlertTriangle, Download, Upload, Users,
  ChevronDown, Pencil, Trash2, Save, Activity, RefreshCw, Eye, EyeOff, Lock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { INSTITUTION_MEMBER_ROLES, PRO_ONLY_MEMBER_ROLES } from '../../constants';
import { usePricing } from './pricing/PricingContext';
import { seatsLabel } from './pricing/PlanWidgets';
import { LicensedAccessPanel } from '../LicensedAccessPanel';
import { Button, ConfirmDialog, Dialog, EmptyState, Field, SkeletonRows, Spinner, StatusBadge, friendlyError } from '../ui';

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const STUDENT_NEEDS_PRO = 'Students are not allowed to be added on this plan. Upgrade to Pro to add students.';

/**
 * The role, as chips rather than a dropdown.
 *
 * A dropdown was the obvious control, but a disabled <option> cannot carry a
 * tooltip — the browser draws that list itself and shows nothing on hover — and
 * the one thing a locked Student has to do is say why it is locked. A chip can.
 * It is not `disabled` either, for the same reason: a disabled button fires no
 * hover in Chrome. It simply refuses the click and says so.
 */
function RolePicker({ value, onChange, onFree }: {
  value: string; onChange: (role: string) => void; onFree: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {INSTITUTION_MEMBER_ROLES.map(r => {
        const locked = onFree && PRO_ONLY_MEMBER_ROLES.includes(r);
        const on = value === r;
        return (
          <span key={r} className="role-chip relative">
            <button
              type="button"
              aria-disabled={locked}
              aria-pressed={on}
              title={locked ? STUDENT_NEEDS_PRO : undefined}
              onClick={() => { if (locked) { toast.error(STUDENT_NEEDS_PRO); return; } onChange(on ? '' : r); }}
              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                locked ? 'cursor-not-allowed border-dashed border-rule bg-surface-2 text-muted'
                : on ? 'border-accent bg-accent text-accent-on'
                : 'border-rule-2 bg-surface text-ink-2 hover:border-accent hover:text-accent'}`}
            >
              {locked && <Lock size={12} aria-hidden="true" />}{r}
              {locked && <span className="ml-0.5 rounded bg-accent-soft px-1 text-[11px] font-bold uppercase tracking-wider text-accent">Pro</span>}
            </button>
            {locked && (
              <span role="tooltip"
                className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-60 max-w-[calc(100vw-48px)] rounded-lg bg-ink px-3 py-2 text-left text-xs leading-snug text-surface shadow-[var(--shadow-pop)]">
                {STUDENT_NEEDS_PRO}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function InstitutionStudentManager() {
  // The plan decides whether anyone can be added at all, and how many more.
  const pricing = usePricing();
  const plan = pricing?.plan ?? null;
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Set by the server: this institution may not add members at the moment.
  const [addRestricted, setAddRestricted] = useState(false);
  const [institutionName, setInstitutionName] = useState('');
  const RESTRICTED_TEXT = 'User addition is currently restricted for your institution.';

  const contactSupport = () => navigate('/contact', { state: { prefill: {
    fullName: profile?.displayName || '', email: profile?.email || '', organization: institutionName,
    message: `Hello, user addition is currently restricted for our institution. Please help us review and restore member-adding access.\n\nInstitution: ${institutionName}`,
  } } });

  useEffect(() => {
    fetch('/api/institution/user-addition', { headers: authHeader() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setAddRestricted(!!d.restricted); setInstitutionName(d.institutionName || ''); } })
      .catch(() => {});
  }, []);
  const [students, setStudents] = useState<any[]>([]);
  // Whether the cap applies at all: an institution with a subscription is not
  // limited here, and must not be shown a notice about a limit it does not have.
  const [onFree, setOnFree] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', password: '', mobile: '', designation: '', branch: '', department: '' });
  const [addLoading, setAddLoading] = useState(false);

  // Bulk import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit modal
  const [editStudent, setEditStudent] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '', contact: '', designation: '', branch: '', department: '', password: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Suspend confirm
  const [suspendTarget, setSuspendTarget] = useState<any | null>(null);

  // Stable closers: the dialog re-runs its focus handling whenever onClose
  // changes, and a fresh arrow on every keystroke would pull the caret out of
  // the field being typed in.
  const closeAdd = useCallback(() => setShowAddModal(false), []);
  const closeImport = useCallback(() => setShowImportModal(false), []);
  const closeEdit = useCallback(() => setEditStudent(null), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);
  const closeSuspend = useCallback(() => setSuspendTarget(null), []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/institution/students', { headers: authHeader() });
      let data: any[] = [];
      try { data = await res.json(); } catch {}
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Could not load the user list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  /**
   * Whether there is room for one more person, asked before a form opens rather than
   * after it is filled in. No subscription opens the department window; a full house
   * says so and shows who to contact.
   */
  const haveSeat = (_then?: () => void): boolean => {
    if (!plan || plan.unlimitedSeats || plan.seats.capacity == null) return true;
    if (!plan.hasSubscription || !plan.seats.capacity) {
      toast('Subscribe to at least one department before adding users.');
      pricing?.openDepartments();
      return false;
    }
    if ((plan.seats.available ?? 0) < 1) {
      toast(`Your institution has reached its limit of ${plan.seats.capacity.toLocaleString('en-IN')} users.`);
      pricing?.openUserLimit();
      return false;
    }
    return true;
  };

  /** The server's own refusal for want of seats: say it, and offer the way out. */
  const handleSeatRefusal = (data: any, then?: () => void): boolean => {
    if (data?.code === 'USER_ADDITION_RESTRICTED') {
      setAddRestricted(true);
      toast.error(`${RESTRICTED_TEXT} Please contact STM Digital Library support.`);
      return true;
    }
    if (data?.code === 'NEEDS_SUBSCRIPTION') {
      toast.error(data.error || 'Subscribe to at least one department before adding users.');
      pricing?.openDepartments();
      return true;
    }
    if (data?.code === 'SEATS_FULL') {
      toast.error(data.error || 'Your institution has reached its user limit.');
      pricing?.openUserLimit();
      return true;
    }
    return false;
  };

  const openAdd = () => { if (addRestricted) { toast.error(RESTRICTED_TEXT); return; } if (haveSeat(() => setShowAddModal(true))) setShowAddModal(true); };
  const openImport = () => { if (addRestricted) { toast.error(RESTRICTED_TEXT); return; } if (haveSeat(() => setShowImportModal(true))) setShowImportModal(true); };

  useEffect(() => {
    fetch('/api/institution/overview', { headers: authHeader() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setOnFree(!!d.subscription?.onFreeAllowance))
      .catch(() => {});
  }, []);

  /* ── ADD STUDENT ── */
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.designation) { toast.error('Choose a role'); return; }
    setAddLoading(true);
    try {
      const res = await fetch('/api/institution/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(newStudent),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        // The form stays filled in, so it can be sent again once there is room.
        if (handleSeatRefusal(data)) return;
        throw new Error(data?.error || 'Failed to add user');
      }
      toast.success('User added');
      setShowAddModal(false);
      setNewStudent({ name: '', email: '', password: '', mobile: '', designation: '', branch: '', department: '' });
      fetchStudents();
      pricing?.reload();
    } catch (err: any) {
      toast.error(friendlyError(err, 'Failed to add user'));
    } finally {
      setAddLoading(false);
    }
  };

  /* ── EDIT STUDENT ── */
  const openEdit = (student: any) => {
    setEditStudent(student);
    setEditForm({ 
      displayName: student.displayName || '', 
      email: student.email || '',
      contact: student.contact || '',
      designation: student.designation || '',
      branch: student.institutionProfile?.branch || '',
      department: student.institutionProfile?.department || '',
      password: '' // empty so they only reset it if they type something
    });
  };

  const handleSaveEdit = async () => {
    if (!editStudent) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/institution/students/${editStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(editForm),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error || 'Update failed');
      toast.success('User updated');
      setEditStudent(null);
      fetchStudents();
    } catch (err: any) {
      toast.error(friendlyError(err, 'Update failed'));
    } finally {
      setEditSaving(false);
    }
  };

  /* ── DELETE STUDENT ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/institution/students/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (!res.ok) throw new Error('Could not delete user');
      toast.success(`"${deleteTarget.displayName || deleteTarget.email}" removed`);
      setDeleteTarget(null);
      fetchStudents();
      pricing?.reload();
    } catch (err: any) {
      toast.error(friendlyError(err, 'Could not delete user'));
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── BLOCK / UNBLOCK ── */
  const handleToggleBlock = async (id: string, isBlocked: boolean) => {
    try {
      const res = await fetch(`/api/institution/students/${id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ isBlocked }),
      });
      if (!res.ok) {
        let data: any = {};
        try { data = await res.json(); } catch {}
        if (handleSeatRefusal(data, () => handleToggleBlock(id, isBlocked))) return;
        throw new Error();
      }
      toast.success(isBlocked ? 'User suspended' : 'User access restored');
      fetchStudents();
      pricing?.reload();
    } catch {
      toast.error('Failed to update access status');
    }
  };

  const confirmSuspend = () => {
    if (!suspendTarget) return;
    const id = suspendTarget.id;
    setSuspendTarget(null);
    handleToggleBlock(id, true);
  };

  const filtered = students.filter(s =>
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    (s.displayName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* User Addition Restriction: whether new users may be added. It is not
          the licensed-seat count below, and it never touches existing users. */}
      {addRestricted && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-caution/40 bg-caution-soft p-4 sm:flex-row sm:items-start">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-caution/15 text-caution" aria-hidden="true">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">User Addition Restricted</p>
              <StatusBadge status="user-addition-restricted" />
            </div>
            <p className="mt-1 text-sm text-ink-2">
              Your institution cannot add new users at this time. Existing users and library access remain unaffected.
              Please contact STM Digital Library support for assistance.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={contactSupport} className="shrink-0 self-start">
            Contact Us
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="type-page-title text-ink">User Directory</h1>
            {plan && (plan.hasSubscription || plan.unlimitedSeats) && (
              <button
                type="button"
                onClick={() => (plan.unlimitedSeats ? undefined : pricing?.openUserLimit())}
                title={plan.unlimitedSeats ? 'Your current plan has no cap on users' : 'Every active member, you included, counts towards the limit. Click for more.'}
                className={`badge tnum ${
                  !plan.unlimitedSeats && (plan.seats.available ?? 0) < 1
                    ? 'badge-caution'
                    : 'badge-accent'} ${plan.unlimitedSeats ? 'cursor-default' : 'cursor-pointer hover:border-accent'}`}
              >
                {plan.unlimitedSeats ? 'Users: Unlimited' : `Users: ${seatsLabel(plan)}`}
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {!plan ? 'Everyone you have added to this institution.'
              : !plan.hasSubscription ? 'Subscribe to at least one Premium department before adding users.'
              : plan.unlimitedSeats ? 'Everyone you have added to this institution.'
              : (plan.seats.available ?? 0) < 1 ? 'You have reached your user limit. Suspend someone to free a place, or contact us for more.'
              : `Everyone you have added to this institution — room for ${Number(plan.seats.available).toLocaleString('en-IN')} more.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <label htmlFor="user-search" className="sr-only">Search users by name or email</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
            <input
              id="user-search"
              type="search"
              placeholder="Search name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <Button variant="outline" className="btn-icon" onClick={fetchStudents} aria-label="Refresh user list" title="Refresh">
            <RefreshCw size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            onClick={openImport}
            disabled={addRestricted}
            title={addRestricted ? RESTRICTED_TEXT : undefined}
          >
            <Upload size={16} aria-hidden="true" /> Import Users
          </Button>
          <Button
            onClick={openAdd}
            disabled={addRestricted}
            title={addRestricted ? RESTRICTED_TEXT : undefined}
          >
            <Plus size={16} aria-hidden="true" /> Add User
          </Button>
        </div>
      </div>

      {/* Subscription access: who holds the institution's licensed seats. A
          separate thing from whether new users may be added (above). */}
      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">Manage Subscription Access</span>
            <span className="mt-0.5 block text-xs text-muted">Who holds a licensed seat and can read subscribed content</span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-rule p-4 sm:p-5"><LicensedAccessPanel base="/api/institution/access" institutionName={institutionName} /></div>
      </details>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="data-table min-w-[560px]">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Designation</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-6">
                  <SkeletonRows rows={4} />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-0">
                  <EmptyState icon={Users} title="No users found"
                    description={search ? 'No one matches this search. Try another name or email.' : 'Users you add appear here.'}
                    action={!search && !addRestricted ? <Button size="sm" onClick={openAdd}><Plus size={16} aria-hidden="true" /> Add User</Button> : undefined} />
                </td></tr>
              ) : filtered.map(student => {
                const name = student.displayName || student.email || 'this user';
                const open = expandedRow === student.id;
                return (
                <React.Fragment key={student.id}>
                  <tr>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent" aria-hidden="true">
                          {(student.displayName || student.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-ink">{student.displayName || 'Unnamed'}</div>
                          <div className="truncate text-xs text-muted">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{student.designation || 'Student'}</span>
                    </td>
                    <td>
                      <StatusBadge status={student.isBlocked ? 'suspended' : 'active'} />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEdit(student)}
                          className="btn btn-ghost btn-sm btn-icon hover:text-accent" title="Edit" aria-label={`Edit ${name}`}>
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        {/* Suspending asks first; restoring does not need to. */}
                        <button type="button"
                          onClick={() => (student.isBlocked ? handleToggleBlock(student.id, false) : setSuspendTarget(student))}
                          className={`btn btn-ghost btn-sm btn-icon ${student.isBlocked ? 'text-accent hover:bg-accent-soft' : 'text-caution hover:bg-caution-soft'}`}
                          title={student.isBlocked ? 'Restore' : 'Suspend'}
                          aria-label={student.isBlocked ? `Restore access for ${name}` : `Suspend ${name}`}>
                          {student.isBlocked ? <ShieldCheck size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(student)}
                          className="btn btn-ghost btn-sm btn-icon hover:bg-alarm-soft hover:text-alarm" title="Delete" aria-label={`Delete ${name}`}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setExpandedRow(open ? null : student.id)}
                          className="btn btn-ghost btn-sm btn-icon" aria-expanded={open}
                          aria-label={open ? `Hide details for ${name}` : `Show details for ${name}`}>
                          <ChevronDown size={16} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded */}
                  {open && (
                    <tr className="bg-surface-2/50 hover:bg-surface-2/50">
                      <td colSpan={4} className="py-5">
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                          <div>
                            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                              <BookOpen size={14} aria-hidden="true" /> Access Grants
                            </h4>
                            {student.subscriptions?.length > 0 ? (
                              <ul className="space-y-2">
                                {student.subscriptions.map((sub: any) => (
                                  <li key={sub.id} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-surface p-3 text-sm">
                                    <div className="min-w-0">
                                      <div className="font-semibold text-ink">{sub.domainName || sub.planName}</div>
                                      <div className="text-xs text-muted">Expires: {new Date(sub.endDate).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <StatusBadge status={sub.status} />
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-muted">No access grants.</p>}
                          </div>
                          <div>
                            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                              <Activity size={14} aria-hidden="true" /> Recent Activity
                            </h4>
                            {student.activities?.length > 0 ? (
                              <ul className="space-y-2">
                                {student.activities.slice(0, 3).map((act: any) => (
                                  <li key={act.id} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-surface p-3 text-sm">
                                    <div className="min-w-0">
                                      <div className="line-clamp-1 font-semibold text-ink">{act.content?.title || 'Resource'}</div>
                                      <div className="flex items-center gap-1 text-xs text-muted"><Clock size={12} aria-hidden="true" />{Math.round((act.timeSpent || 0) / 60)} min</div>
                                    </div>
                                    <div className="shrink-0 whitespace-nowrap text-xs text-muted">{new Date(act.accessedAt).toLocaleDateString('en-IN')}</div>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-muted">No activity yet.</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-rule bg-surface-2 px-5 py-3 text-xs text-muted">
          {filtered.length} user{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── ADD MODAL ── */}
      <Dialog
        open={showAddModal}
        onClose={closeAdd}
        title="Add User"
        description="Register a member of your institution. Fields marked * are required."
        footer={<>
          <Button variant="outline" onClick={closeAdd}>Cancel</Button>
          <Button type="submit" form="add-user-form" loading={addLoading}>
            {!addLoading && <Plus size={16} aria-hidden="true" />}
            {addLoading ? 'Registering…' : 'Register User'}
          </Button>
        </>}
      >
        <form id="add-user-form" onSubmit={handleAddStudent} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full Name" required>
              <input type="text" className="input" value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                placeholder="User Name" autoComplete="off" />
            </Field>
            <Field label="Email" required>
              <input type="email" className="input" value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                placeholder="user@university.edu" autoComplete="off" />
            </Field>
          </div>

          <Field label="Mobile Number">
            <input type="tel" className="input" value={newStudent.mobile} onChange={e => setNewStudent({ ...newStudent, mobile: e.target.value })}
              placeholder="+91 9876543210" />
          </Field>

          <div role="group" aria-labelledby="add-designation-label" className="field">
            <p id="add-designation-label" className="field-label">Designation<span className="req" aria-hidden="true">*</span></p>
            <RolePicker value={newStudent.designation} onFree={onFree}
              onChange={role => setNewStudent({ ...newStudent, designation: role })} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Branch">
              <input type="text" className="input" value={newStudent.branch} onChange={e => setNewStudent({ ...newStudent, branch: e.target.value })}
                placeholder="e.g. Computer Science" />
            </Field>
            <Field label="Department">
              <input type="text" className="input" value={newStudent.department} onChange={e => setNewStudent({ ...newStudent, department: e.target.value })}
                placeholder="e.g. Engineering" />
            </Field>
          </div>

          <div className="field">
            <label htmlFor="add-user-password" className="field-label">Temporary Password<span className="req" aria-hidden="true">*</span></label>
            <div className="relative">
              <input id="add-user-password" required type={showPassword ? "text" : "password"} value={newStudent.password} onChange={e => setNewStudent({ ...newStudent, password: e.target.value })}
                placeholder="••••••••" autoComplete="new-password"
                className="input pr-11" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="btn btn-ghost btn-sm btn-icon absolute right-1 top-1/2 -translate-y-1/2"
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* ── IMPORT MODAL ── */}
      <Dialog
        open={showImportModal}
        onClose={closeImport}
        title="Import Users"
        description="Upload a CSV file to register several users at once."
        footer={<Button variant="outline" onClick={closeImport}>Close</Button>}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-2">The file must include the headers: <strong className="text-ink">name, email, password, designation</strong>. Optional headers: <strong className="text-ink">mobile, branch, department</strong>.</p>
          <p className="text-xs text-muted">Designation must be one of: {INSTITUTION_MEMBER_ROLES.join(', ')}.{onFree ? ' Student rows are refused on this plan — upgrade to Pro to add students.' : ''}</p>

          <a href="data:text/csv;charset=utf-8,name,email,password,mobile,designation,branch,department%0AJohn%20Doe,john@example.com,pass123,9876543210,Professor,CSE,Engineering"
             download="sample_users.csv"
             className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <Download size={16} aria-hidden="true" /> Download Sample CSV
          </a>

          <div className="field">
            <label htmlFor="import-users-file" className="field-label">CSV file</label>
            <input id="import-users-file" type="file" accept=".csv" disabled={importing}
              className="w-full text-sm text-muted file:mr-4 file:h-9 file:cursor-pointer file:rounded-lg file:border-0 file:bg-accent-soft file:px-4 file:text-sm file:font-semibold file:text-accent disabled:opacity-60"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImporting(true);

                try {
                  // Dynamically import papaparse for client-side parsing
                  const Papa = (await import('papaparse')).default;

                  Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: async (results) => {
                      try {
                        const res = await fetch('/api/institution/students/bulk', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...authHeader() },
                          body: JSON.stringify({ users: results.data })
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          if (handleSeatRefusal(data)) { setShowImportModal(false); return; }
                          throw new Error(data.error || 'Failed to import users');
                        }

                        toast.success(`Import complete. Added ${data.successCount} users.${data.errorCount > 0 ? ` ${data.errorCount} failed.` : ''}`);
                        setShowImportModal(false);
                        fetchStudents();
                        pricing?.reload();
                        // Rows refused for want of room: say how many, and say who to contact.
                        const seatless = (data.errors || []).filter((x: any) => /no user seats left/i.test(x?.error || '')).length;
                        if (seatless) {
                          toast.error(`${seatless} user${seatless === 1 ? ' was' : 's were'} not added: your institution has reached its user limit. Contact us for more, then import them again.`, { duration: 7000 });
                          pricing?.openUserLimit();
                        }
                      } catch (err: any) {
                        toast.error(friendlyError(err, 'Failed to import users'));
                      } finally {
                        setImporting(false);
                      }
                    },
                    error: () => {
                      toast.error('Failed to parse CSV file');
                      setImporting(false);
                    }
                  });
                } catch (err) {
                  setImporting(false);
                  toast.error('Could not process the file');
                }
              }}
            />
          </div>

          {importing && <Spinner label="Processing file" className="text-accent" />}
        </div>
      </Dialog>

      {/* ── EDIT MODAL ── */}
      <Dialog
        open={!!editStudent}
        onClose={closeEdit}
        title="Edit User"
        description={editStudent ? `Update the details for ${editStudent.displayName || editStudent.email}.` : undefined}
        footer={<>
          <Button variant="outline" onClick={closeEdit}>Cancel</Button>
          <Button onClick={handleSaveEdit} loading={editSaving}>
            {!editSaving && <Save size={16} aria-hidden="true" />}
            {editSaving ? 'Saving…' : 'Save Changes'}
          </Button>
        </>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full Name">
              <input className="input" value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input type="email" className="input" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Mobile Number">
              <input type="tel" className="input" value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))}
                placeholder="+91 9876543210" />
            </Field>
            <Field label="Designation">
              <select className="input" value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))}
                title={onFree ? STUDENT_NEEDS_PRO : undefined}>
                <option value="">Select Role...</option>
                {editStudent?.designation && !(INSTITUTION_MEMBER_ROLES as readonly string[]).includes(editStudent.designation) && (
                  <option value={editStudent.designation}>{editStudent.designation}</option>
                )}
                {INSTITUTION_MEMBER_ROLES.map(r => {
                  const locked = onFree && PRO_ONLY_MEMBER_ROLES.includes(r) && editStudent?.designation !== r;
                  return <option key={r} value={r} disabled={locked}>{locked ? `${r} — Pro only` : r}</option>;
                })}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Branch">
              <input type="text" className="input" value={editForm.branch} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))}
                placeholder="e.g. Computer Science" />
            </Field>
            <Field label="Department">
              <input type="text" className="input" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Engineering" />
            </Field>
          </div>

          <Field label="Reset Password" help="Passwords are encrypted for security, so the old one cannot be displayed. Leave blank to keep it.">
            <input type="text" className="input" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Leave blank to keep current password" autoComplete="off" />
          </Field>
        </div>
      </Dialog>

      {/* ── SUSPEND CONFIRM ── */}
      <ConfirmDialog
        open={!!suspendTarget}
        onClose={closeSuspend}
        onConfirm={confirmSuspend}
        title="Suspend this user?"
        description={suspendTarget ? `${suspendTarget.displayName || suspendTarget.email} will lose access until you restore it.` : undefined}
        confirmLabel="Suspend User"
      />

      {/* ── DELETE CONFIRM ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={closeDelete}
        onConfirm={handleDelete}
        title="Remove this user?"
        description={deleteTarget ? `This permanently deletes the account of ${deleteTarget.displayName || deleteTarget.email}. This cannot be undone.` : undefined}
        confirmLabel={deleteLoading ? 'Removing…' : 'Remove User'}
        danger
        loading={deleteLoading}
      />
    </div>
  );
}
