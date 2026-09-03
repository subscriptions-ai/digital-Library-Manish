import React, { useState, useEffect } from 'react';
import {
  Search, Plus, ShieldCheck, ShieldAlert, BookOpen, Clock,
  ChevronDown, Pencil, Trash2, X, Save, Loader2, Activity, RefreshCw, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

export function InstitutionStudentManager() {
  const [students, setStudents] = useState<any[]>([]);
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

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/institution/students', { headers: authHeader() });
      let data: any[] = [];
      try { data = await res.json(); } catch {}
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Could not load student roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  /* ── ADD STUDENT ── */
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    try {
      const res = await fetch('/api/institution/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(newStudent),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error || 'Failed to add user');
      toast.success('User registered successfully');
      setShowAddModal(false);
      setNewStudent({ name: '', email: '', password: '', mobile: '', designation: '', branch: '', department: '' });
      fetchStudents();
    } catch (err: any) {
      toast.error(err.message);
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
      toast.error(err.message);
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
      if (!res.ok) throw new Error('Could not delete student');
      toast.success(`"${deleteTarget.displayName || deleteTarget.email}" removed`);
      setDeleteTarget(null);
      fetchStudents();
    } catch (err: any) {
      toast.error(err.message);
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
      if (!res.ok) throw new Error();
      toast.success(isBlocked ? 'Student suspended' : 'Student access restored');
      fetchStudents();
    } catch {
      toast.error('Failed to update access status');
    }
  };

  const filtered = students.filter(s =>
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    (s.displayName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">User Directory</h1>
          <p className="text-sm text-muted mt-0.5">Manage, edit and remove enrolled users.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={15} />
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-rule rounded-md py-2.5 pl-10 pr-4 text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none bg-surface"
            />
          </div>
          <button onClick={fetchStudents} className="p-2.5 bg-surface border border-rule rounded-md hover:bg-surface-2 text-muted">
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-surface border border-rule text-ink-2 px-4 py-2.5 rounded-md text-sm font-bold hover:bg-surface-2 transition-colors"
          >
            Import Users
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 rounded-md text-sm font-bold hover:bg-accent-hover shadow-md "
          >
            <Plus size={16} /> Add User
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-md border border-rule shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-2 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-muted uppercase">User</th>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-muted uppercase text-center">Designation</th>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-muted uppercase text-center">Status</th>
                <th className="px-6 py-4 border-b border-rule text-xs font-bold text-muted uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {loading ? (
                <tr><td colSpan={3} className="px-6 py-14 text-center text-muted">
                  <Loader2 className="animate-spin mx-auto mb-2 text-faint" size={24} />
                  Loading students…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-14 text-center text-faint">No students found.</td></tr>
              ) : filtered.map(student => (
                <React.Fragment key={student.id}>
                  <tr className="hover:bg-surface-2/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-accent text-white flex items-center justify-center font-bold shrink-0">
                          {(student.displayName || student.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-ink text-sm">{student.displayName || 'Unnamed'}</div>
                          <div className="text-xs text-muted">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-2 text-ink-2">
                        {student.designation || 'Student'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        student.isBlocked ? 'bg-alarm-soft text-alarm' : 'bg-accent-soft text-accent'
                      }`}>
                        {student.isBlocked ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
                        {student.isBlocked ? 'Suspended' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        <button onClick={() => openEdit(student)}
                          className="p-2 text-muted hover:text-accent hover:bg-accent-soft rounded-lg transition-colors" title="Edit">
                          <Pencil size={15} />
                        </button>
                        {/* Block/Unblock */}
                        <button onClick={() => handleToggleBlock(student.id, !student.isBlocked)}
                          className={`p-2 rounded-lg transition-colors ${student.isBlocked ? 'text-accent hover:bg-accent-soft' : 'text-caution hover:bg-caution-soft'}`}
                          title={student.isBlocked ? 'Restore' : 'Suspend'}>
                          {student.isBlocked ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                        </button>
                        {/* Delete */}
                        <button onClick={() => setDeleteTarget(student)}
                          className="p-2 text-muted hover:text-alarm hover:bg-alarm-soft rounded-lg transition-colors" title="Delete">
                          <Trash2 size={15} />
                        </button>
                        {/* Expand */}
                        <button onClick={() => setExpandedRow(expandedRow === student.id ? null : student.id)}
                          className="p-2 text-faint hover:text-ink-2 hover:bg-surface-2 rounded-lg transition-colors">
                          <ChevronDown size={16} className={`transition-transform ${expandedRow === student.id ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded */}
                  {expandedRow === student.id && (
                    <tr className="bg-surface-2/50">
                      <td colSpan={3} className="px-6 py-5 border-b border-rule">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <h4 className="text-xs font-bold text-ink-2 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <BookOpen size={13} /> Access Grants
                            </h4>
                            {student.subscriptions?.length > 0 ? (
                              <ul className="space-y-2">
                                {student.subscriptions.map((sub: any) => (
                                  <li key={sub.id} className="bg-surface text-sm flex justify-between p-3 rounded-md border border-rule">
                                    <div>
                                      <div className="font-bold text-ink">{sub.domainName || sub.planName}</div>
                                      <div className="text-xs text-muted">Expires: {new Date(sub.endDate).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 rounded-full self-center ${sub.status === 'Active' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>{sub.status}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-faint italic">No access grants.</p>}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-ink-2 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <Activity size={13} /> Recent Activity
                            </h4>
                            {student.activities?.length > 0 ? (
                              <ul className="space-y-2">
                                {student.activities.slice(0, 3).map((act: any) => (
                                  <li key={act.id} className="bg-surface text-sm flex justify-between p-3 rounded-md border border-rule">
                                    <div>
                                      <div className="font-bold text-ink line-clamp-1">{act.content?.title || 'Resource'}</div>
                                      <div className="text-xs text-muted flex items-center gap-1"><Clock size={10} />{Math.round((act.timeSpent || 0) / 60)} min</div>
                                    </div>
                                    <div className="text-[10px] text-faint whitespace-nowrap self-center">{new Date(act.accessedAt).toLocaleDateString('en-IN')}</div>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-faint italic">No activity yet.</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-rule bg-surface-2 text-xs text-faint">
          {filtered.length} student{filtered.length !== 1 ? 's' : ''} enrolled
        </div>
      </div>

      {/* ── ADD MODAL ── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-md w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-accent px-6 py-4 flex items-center justify-between">
                <h2 className="text-white font-bold text-lg">Register User</h2>
                <button onClick={() => setShowAddModal(false)} className="text-faint hover:text-white"><X size={20} /></button>
              </div>
              <form onSubmit={handleAddStudent} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Full Name *</label>
                    <input required type="text" value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                      placeholder="User Name"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Email *</label>
                    <input required type="email" value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                      placeholder="user@university.edu"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Mobile Number</label>
                    <input type="text" value={newStudent.mobile} onChange={e => setNewStudent({ ...newStudent, mobile: e.target.value })}
                      placeholder="+91 9876543210"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Designation</label>
                    <select value={newStudent.designation} onChange={e => setNewStudent({ ...newStudent, designation: e.target.value })}
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none">
                      <option value="">Select Role...</option>
                      <option value="Student">Student</option>
                      <option value="Professor">Professor</option>
                      <option value="HOD">HOD</option>
                      <option value="Librarian">Librarian</option>
                      <option value="Staff">Staff</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Branch</label>
                    <input type="text" value={newStudent.branch} onChange={e => setNewStudent({ ...newStudent, branch: e.target.value })}
                      placeholder="e.g. Computer Science"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Department</label>
                    <input type="text" value={newStudent.department} onChange={e => setNewStudent({ ...newStudent, department: e.target.value })}
                      placeholder="e.g. Engineering"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Temporary Password *</label>
                  <div className="relative">
                    <input required type={showPassword ? "text" : "password"} value={newStudent.password} onChange={e => setNewStudent({ ...newStudent, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 pr-10 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink-2 focus:outline-none"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-rule">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-md font-bold hover:bg-rule">Cancel</button>
                  <button type="submit" disabled={addLoading}
                    className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-md font-bold hover:bg-accent-hover disabled:opacity-50 shadow-md ">
                    {addLoading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    {addLoading ? 'Registering…' : 'Register User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── IMPORT MODAL ── */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-md w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-accent px-6 py-4 flex items-center justify-between">
                <h2 className="text-white font-bold text-lg">Import Users</h2>
                <button onClick={() => setShowImportModal(false)} className="text-faint hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-ink-2">Upload a CSV file containing multiple users to register them all at once. The file must include the headers: <strong>name, email, password</strong>. Optional headers: <strong>mobile, designation, branch, department</strong>.</p>
                
                <div className="flex justify-center my-4">
                  <a href="data:text/csv;charset=utf-8,name,email,password,mobile,designation,branch,department%0AJohn%20Doe,john@example.com,pass123,9876543210,Student,CSE,Engineering" 
                     download="sample_users.csv"
                     className="text-accent text-sm font-bold hover:underline">
                    Download Sample CSV
                  </a>
                </div>

                <input type="file" accept=".csv" className="w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-accent-soft file:text-accent hover:file:bg-accent-soft" 
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
                            if (!res.ok) throw new Error(data.error || 'Failed to import users');
                            
                            toast.success(`Import complete! Successfully added ${data.successCount} users. ${data.errorCount > 0 ? `${data.errorCount} failed.` : ''}`);
                            setShowImportModal(false);
                            fetchStudents();
                          } catch (err: any) {
                            toast.error(err.message);
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

                <div className="flex justify-end gap-3 pt-4">
                  <button onClick={() => setShowImportModal(false)} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-md font-bold hover:bg-rule">Close</button>
                </div>
                {importing && <div className="text-center text-accent text-sm font-bold flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Processing File...</div>}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── EDIT MODAL ── */}
      <AnimatePresence>
        {editStudent && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-md w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-accent px-6 py-4 flex items-center justify-between">
                <h2 className="text-white font-bold text-lg">Edit Student</h2>
                <button onClick={() => setEditStudent(null)} className="text-faint hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Full Name</label>
                    <input value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Email</label>
                    <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Mobile Number</label>
                    <input type="text" value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))}
                      placeholder="+91 9876543210"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Designation</label>
                    <select value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))}
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none">
                      <option value="">Select Role...</option>
                      <option value="Student">Student</option>
                      <option value="Professor">Professor</option>
                      <option value="HOD">HOD</option>
                      <option value="Librarian">Librarian</option>
                      <option value="Staff">Staff</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Branch</label>
                    <input type="text" value={editForm.branch} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))}
                      placeholder="e.g. Computer Science"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Department</label>
                    <input type="text" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                      placeholder="e.g. Engineering"
                      className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Reset Password</label>
                  <input type="text" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Leave blank to keep current password"
                    className="w-full bg-surface-2 border border-rule px-4 py-2.5 rounded-md text-sm focus:border-accent focus:ring-2 focus:border-accent outline-none" />
                  <p className="text-[10px] text-faint mt-1">Note: Passwords are encrypted for security so the old one cannot be displayed.</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-rule">
                  <button onClick={() => setEditStudent(null)} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-md font-bold hover:bg-rule">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={editSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-md font-bold hover:bg-accent-hover disabled:opacity-50">
                    {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {editSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRM ── */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-md w-full max-w-sm shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-alarm-soft flex items-center justify-center"><Trash2 className="text-alarm" size={20} /></div>
                <div>
                  <h3 className="font-bold text-ink">Remove Student?</h3>
                  <p className="text-sm text-muted">This will permanently delete the student's account.</p>
                </div>
              </div>
              <div className="bg-alarm-soft border border-alarm rounded-md p-3 text-sm font-bold text-alarm">
                {deleteTarget.displayName || deleteTarget.email}
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-md font-bold hover:bg-rule">Cancel</button>
                <button onClick={handleDelete} disabled={deleteLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-alarm text-white rounded-md font-bold hover:opacity-90 disabled:opacity-50">
                  {deleteLoading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  {deleteLoading ? 'Removing…' : 'Remove Student'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
