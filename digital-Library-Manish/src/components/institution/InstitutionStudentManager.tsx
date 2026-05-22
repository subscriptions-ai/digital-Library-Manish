import React, { useState, useEffect } from 'react';
import {
  Search, Plus, ShieldCheck, ShieldAlert, BookOpen, Clock,
  ChevronDown, Pencil, Trash2, X, Save, Loader2, Activity, RefreshCw
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
  const [newStudent, setNewStudent] = useState({ name: '', email: '', password: '' });
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal
  const [editStudent, setEditStudent] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '' });
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
      if (!res.ok) throw new Error(data?.error || 'Failed to add student');
      toast.success('Student registered successfully');
      setShowAddModal(false);
      setNewStudent({ name: '', email: '', password: '' });
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
    setEditForm({ displayName: student.displayName || '', email: student.email || '' });
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
      toast.success('Student updated');
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
          <h1 className="text-2xl font-bold text-slate-900">Student Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage, edit and remove enrolled students.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none bg-white"
            />
          </div>
          <button onClick={fetchStudents} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500">
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-md shadow-indigo-600/20"
          >
            <Plus size={16} /> Add Student
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">Student</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase text-center">Status</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={3} className="px-6 py-14 text-center text-slate-500">
                  <Loader2 className="animate-spin mx-auto mb-2 text-indigo-400" size={24} />
                  Loading students…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-14 text-center text-slate-400">No students found.</td></tr>
              ) : filtered.map(student => (
                <React.Fragment key={student.id}>
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 text-white flex items-center justify-center font-bold shrink-0">
                          {(student.displayName || student.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{student.displayName || 'Unnamed'}</div>
                          <div className="text-xs text-slate-500">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        student.isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {student.isBlocked ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
                        {student.isBlocked ? 'Suspended' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        <button onClick={() => openEdit(student)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                          <Pencil size={15} />
                        </button>
                        {/* Block/Unblock */}
                        <button onClick={() => handleToggleBlock(student.id, !student.isBlocked)}
                          className={`p-2 rounded-lg transition-colors ${student.isBlocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                          title={student.isBlocked ? 'Restore' : 'Suspend'}>
                          {student.isBlocked ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                        </button>
                        {/* Delete */}
                        <button onClick={() => setDeleteTarget(student)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 size={15} />
                        </button>
                        {/* Expand */}
                        <button onClick={() => setExpandedRow(expandedRow === student.id ? null : student.id)}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                          <ChevronDown size={16} className={`transition-transform ${expandedRow === student.id ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded */}
                  {expandedRow === student.id && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={3} className="px-6 py-5 border-b border-slate-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <BookOpen size={13} /> Access Grants
                            </h4>
                            {student.subscriptions?.length > 0 ? (
                              <ul className="space-y-2">
                                {student.subscriptions.map((sub: any) => (
                                  <li key={sub.id} className="bg-white text-sm flex justify-between p-3 rounded-xl border border-slate-200">
                                    <div>
                                      <div className="font-bold text-slate-800">{sub.domainName || sub.planName}</div>
                                      <div className="text-xs text-slate-500">Expires: {new Date(sub.endDate).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 rounded-full self-center ${sub.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{sub.status}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-slate-400 italic">No access grants.</p>}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <Activity size={13} /> Recent Activity
                            </h4>
                            {student.activities?.length > 0 ? (
                              <ul className="space-y-2">
                                {student.activities.slice(0, 3).map((act: any) => (
                                  <li key={act.id} className="bg-white text-sm flex justify-between p-3 rounded-xl border border-slate-200">
                                    <div>
                                      <div className="font-bold text-slate-800 line-clamp-1">{act.content?.title || 'Resource'}</div>
                                      <div className="text-xs text-slate-500 flex items-center gap-1"><Clock size={10} />{Math.round((act.timeSpent || 0) / 60)} min</div>
                                    </div>
                                    <div className="text-[10px] text-slate-400 whitespace-nowrap self-center">{new Date(act.accessedAt).toLocaleDateString('en-IN')}</div>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-sm text-slate-400 italic">No activity yet.</p>}
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
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
          {filtered.length} student{filtered.length !== 1 ? 's' : ''} enrolled
        </div>
      </div>

      {/* ── ADD MODAL ── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
                <h2 className="text-white font-bold text-lg">Register Student</h2>
                <button onClick={() => setShowAddModal(false)} className="text-indigo-200 hover:text-white"><X size={20} /></button>
              </div>
              <form onSubmit={handleAddStudent} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input required type="text" value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                    placeholder="Student Name"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input required type="email" value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                    placeholder="student@university.edu"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Temporary Password</label>
                  <input required type="password" value={newStudent.password} onChange={e => setNewStudent({ ...newStudent, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                  <button type="submit" disabled={addLoading}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-600/20">
                    {addLoading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    {addLoading ? 'Registering…' : 'Register Student'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── EDIT MODAL ── */}
      <AnimatePresence>
        {editStudent && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
                <h2 className="text-white font-bold text-lg">Edit Student</h2>
                <button onClick={() => setEditStudent(null)} className="text-indigo-200 hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setEditStudent(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={editSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">
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
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center"><Trash2 className="text-red-600" size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-900">Remove Student?</h3>
                  <p className="text-sm text-slate-500">This will permanently delete the student's account.</p>
                </div>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm font-bold text-red-800">
                {deleteTarget.displayName || deleteTarget.email}
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                <button onClick={handleDelete} disabled={deleteLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50">
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
