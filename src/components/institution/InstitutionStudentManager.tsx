import React, { useState, useEffect } from 'react';
import { Search, Upload, Plus, ShieldCheck, ShieldAlert, BookOpen, Clock, Settings, ChevronDown, MoreVertical, Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function InstitutionStudentManager() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // New Student Form Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', password: '' });

  // Grant Access Modal States
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/institution/students', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error("Failed to load students");
      const data = await response.json();
      setStudents(data);
    } catch (err) {
      toast.error('Could not load student roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/institution/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newStudent)
      });
      if (!res.ok) throw new Error("Failed to create student");
      toast.success("Student added successfully");
      setShowAddModal(false);
      setNewStudent({ name: '', email: '', password: '' });
      fetchStudents();
    } catch (err) {
      toast.error("Error creating student record");
    }
  };

  const handleToggleBlock = async (id: string, isBlocked: boolean) => {
    try {
      const res = await fetch(`/api/institution/students/${id}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ isBlocked })
      });
      if (!res.ok) throw new Error("Toggle block failed");
      toast.success(isBlocked ? "Student access suspended" : "Student access restored");
      fetchStudents();
    } catch (error) {
      toast.error('Failed to update access status');
    }
  };

  const filteredStudents = students.filter(s => 
    s.email.toLowerCase().includes(search.toLowerCase()) || 
    (s.displayName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Directory</h1>
          <p className="text-sm text-slate-500 mt-1">Manage single accounts or bulk upload rosters.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name/email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button onClick={() => toast("CSV Bulk Upload functionality overlay triggered (Mock)")} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50">
            <Upload size={16} /> Bulk CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700">
            <Plus size={16} /> Add Student
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 flex-1 overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 box-border">
              <tr>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">Student</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">Role</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase text-center">Status</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">Loading student roster...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">No students enrolled yet.</td></tr>
              ) : (
                filteredStudents.map(student => (
                  <React.Fragment key={student.id}>
                    <tr className="hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-indigo-100 text-indigo-600 font-bold flex flex-col justify-center items-center rounded-full shrink-0">
                            {student.displayName?.charAt(0).toUpperCase() || student.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{student.displayName || "Unknown"}</div>
                            <div className="text-xs text-slate-500">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-xs">{student.role}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                          student.isBlocked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {student.isBlocked ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                          {student.isBlocked ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setSelectedStudentId(student.id); setShowAccessModal(true); }} className="text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                            Grant Access
                          </button>
                          <button 
                            onClick={() => handleToggleBlock(student.id, !student.isBlocked)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${student.isBlocked ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                          >
                            {student.isBlocked ? 'Restore' : 'Block'}
                          </button>
                          <button onClick={() => setExpandedRow(expandedRow === student.id ? null : student.id)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                            <ChevronDown size={18} className={`transition-transform ${expandedRow === student.id ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === student.id && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={4} className="px-6 py-4 border-b border-slate-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <div>
                              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3"><BookOpen size={16} className="text-indigo-600" /> Granted Access Control</h4>
                              {student.subscriptions && student.subscriptions.length > 0 ? (
                                <ul className="space-y-2">
                                  {student.subscriptions.map((sub: any) => (
                                    <li key={sub.id} className="text-sm flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                                      <div>
                                        <div className="font-bold text-slate-800">{sub.domainName}</div>
                                        <div className="text-xs text-slate-500">Expires: {new Date(sub.endDate).toLocaleDateString()}</div>
                                      </div>
                                      <button className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline">Remove</button>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-xs text-slate-500">No content domains accessed.</p>}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3"><Activity size={16} className="text-indigo-600" /> Recent Learning Activity</h4>
                              {student.activities && student.activities.length > 0 ? (
                                <ul className="space-y-2">
                                  {student.activities.slice(0,3).map((act: any) => (
                                    <li key={act.id} className="text-sm flex justify-between items-center p-2 bg-slate-50 border border-slate-100 rounded-lg">
                                      <div>
                                        <div className="font-bold text-slate-800 line-clamp-1">{act.content?.title || "Unknown resource"}</div>
                                        <div className="text-xs text-slate-500 gap-2 flex">
                                          <span className="flex items-center gap-1"><Clock size={10} /> {Math.round(act.timeSpent / 60)} min</span>
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-slate-400 whitespace-nowrap">{new Date(act.accessedAt).toLocaleDateString()}</div>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-xs text-slate-500">No activity tracked yet.</p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* ADD STUDENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">Manually Register Student</h2>
              <button onClick={() => setShowAddModal(false)} className="text-indigo-200 hover:text-white">&times;</button>
            </div>
            <form onSubmit={handleAddStudent} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                <input required type="text" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="Student Name" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input required type="email" value={newStudent.email} onChange={e => setNewStudent({...newStudent, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="student@university.edu" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Temporary Password</label>
                <input required type="password" value={newStudent.password} onChange={e => setNewStudent({...newStudent, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="••••••••" />
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md shadow-indigo-600/20">Register Student</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* GRANT ACCESS MODAL */}
      {showAccessModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Grant Domain Access</h2>
            <p className="text-sm text-slate-500 mb-6">Allocate content permissions to this student based on your own institutional subscription capacity.</p>
            <div className="bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200 text-sm mb-6 flex items-start gap-3">
              <ShieldAlert size={18} className="shrink-0 mt-0.5" />
              <p>For development speed, this is mocked visually. Normally this hooks into <b>/api/institution/students/:id/grant</b> picking from domains belonging to the institution.</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAccessModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
