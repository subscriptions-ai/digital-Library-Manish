import React, { useState, useEffect } from 'react';
import { LayoutGrid, FileText, CreditCard, Users, Search, Download, ExternalLink, ChevronRight, Filter, LogOut, Check, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { collection, onSnapshot, query, orderBy, doc, getDoc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'quotations' | 'payments' | 'users' | 'submissions'>('quotations');
  const [quotations, setQuotations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && (userDoc.data().role === 'Admin' || userDoc.data().role === 'SuperAdmin')) {
          setIsAdmin(true);
          
          const qQuotations = query(collection(db, 'quotations'), orderBy('createdAt', 'desc'));
          const qPayments = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));
          const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
          const qSubmissions = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));

          const unsubQuotations = onSnapshot(qQuotations, (snapshot) => {
            setQuotations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'quotations'));

          const unsubPayments = onSnapshot(qPayments, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));

          const unsubUsers = onSnapshot(qUsers, (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

          const unsubSubmissions = onSnapshot(qSubmissions, (snapshot) => {
            setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'submissions'));

          return () => {
            unsubQuotations();
            unsubPayments();
            unsubUsers();
            unsubSubmissions();
          };
        } else {
          toast.error('Unauthorized access');
          navigate('/dashboard');
        }
      } else {
        navigate('/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleApproveSubmission = async (submission: any) => {
    try {
      // 1. Update submission status
      await updateDoc(doc(db, 'submissions', submission.id), {
        status: 'Approved',
        updatedAt: serverTimestamp()
      });

      // 2. Add to published content
      await addDoc(collection(db, 'content'), {
        submissionId: submission.id,
        title: submission.title,
        authors: submission.authors,
        contentType: submission.contentType,
        subjectArea: submission.subjectArea || 'General',
        fileUrl: submission.fileUrl,
        publishingMode: submission.publishingMode,
        publishedAt: serverTimestamp()
      });

      toast.success('Submission approved and published!');
    } catch (error) {
      console.error('Error approving submission:', error);
      toast.error('Failed to approve submission');
    }
  };

  const handleRejectSubmission = async (submissionId: string) => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'Rejected',
        updatedAt: serverTimestamp()
      });
      toast.success('Submission rejected');
    } catch (error) {
      console.error('Error rejecting submission:', error);
      toast.error('Failed to reject submission');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      toast.success('Signed out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const totalRevenue = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-12">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <LayoutGrid size={20} />
          </div>
          <span className="font-bold tracking-tight">STM ADMIN</span>
        </div>

        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setActiveTab('quotations')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'quotations' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <FileText size={18} />
            Quotations
          </button>
          <button 
            onClick={() => setActiveTab('payments')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'payments' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <CreditCard size={18} />
            Payments
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Users size={18} />
            Users
          </button>
          <button 
            onClick={() => setActiveTab('submissions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'submissions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <FileText size={18} />
            Submissions
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10">
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all mb-4"
          >
            <LogOut size={18} />
            Sign Out
          </button>
          <div className="flex items-center gap-3 px-4">
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">AD</div>
            <div>
              <div className="text-xs font-bold">Admin User</div>
              <div className="text-[10px] text-slate-500">Super Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 capitalize">{activeTab} Management</h1>
            <p className="text-sm text-slate-500 mt-1">Track and manage your platform's {activeTab}.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder={`Search ${activeTab}...`}
                className="bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:border-blue-500 outline-none w-64"
              />
            </div>
            <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
              <Filter size={18} />
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Revenue</div>
            <div className="text-3xl font-bold text-slate-900">₹{totalRevenue.toLocaleString()}</div>
            <div className="mt-2 text-xs text-green-600 font-bold">From {payments.length} successful payments</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Active Quotations</div>
            <div className="text-3xl font-bold text-slate-900">{quotations.length}</div>
            <div className="mt-2 text-xs text-blue-600 font-bold">{quotations.filter(q => q.status === 'Sent').length} pending</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Users</div>
            <div className="text-3xl font-bold text-slate-900">{users.length}</div>
            <div className="mt-2 text-xs text-green-600 font-bold">Registered on platform</div>
          </div>
          {auth.currentUser?.email === 'subscriptions@stmjournals.com' && (
            <div className="bg-blue-600 p-6 rounded-2xl shadow-lg shadow-blue-200 flex flex-col justify-center">
              <p className="text-xs font-bold text-blue-100 uppercase tracking-widest mb-2">Developer Tools</p>
              <button 
                onClick={async () => {
                  try {
                    const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
                    const { createUserWithEmailAndPassword } = await import('firebase/auth');
                    
                    // This is a simplified seed for demo purposes
                    toast.loading('Seeding test users...');
                    
                    // Note: In a real app, you'd do this via an admin API or firebase console
                    // Here we just provide instructions or a small helper
                    toast.success('Ready to seed! Use the "User Management" tab to change roles of any signed-up user.');
                  } catch (err) {
                    toast.error('Seed failed');
                  }
                }}
                className="w-full py-2 bg-white text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 transition-all"
              >
                Seed Test Instructions
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">User / Organization</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activeTab === 'quotations' && quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{q.quotationId || q.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{q.userName || 'Unknown User'}</div>
                    <div className="text-xs text-slate-500">{q.organization || q.state}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{q.createdAt?.toDate ? format(q.createdAt.toDate(), 'dd MMM, yyyy') : 'N/A'}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">₹{q.total?.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      q.status === 'Paid' ? 'bg-green-100 text-green-700' : 
                      q.status === 'Expired' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Download size={18} /></button>
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><ExternalLink size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {activeTab === 'payments' && payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{p.paymentId || p.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{p.userName || 'User'}</div>
                    <div className="text-xs text-slate-500">via {p.method}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{p.createdAt?.toDate ? format(p.createdAt.toDate(), 'dd MMM, yyyy') : 'N/A'}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">₹{p.amount?.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      p.status === 'Success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Download size={18} /></button>
                  </td>
                </tr>
              ))}
              {activeTab === 'users' && users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{u.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{u.displayName || u.email}</div>
                    <div className="text-xs text-slate-500">{u.organization || 'Individual'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'dd MMM, yyyy') : 'N/A'}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{u.state || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      (u.role === 'Admin' || u.role === 'SuperAdmin') ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><ExternalLink size={18} /></button>
                  </td>
                </tr>
              ))}
              {activeTab === 'submissions' && submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{s.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-500">{s.authors} • {s.contentType}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{s.createdAt?.toDate ? format(s.createdAt.toDate(), 'dd MMM, yyyy') : 'N/A'}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{s.publishingMode}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      s.status === 'Approved' ? 'bg-green-100 text-green-700' : 
                      s.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="View Details"><Eye size={18} /></button>
                      {s.status === 'Pending' && (
                        <>
                          <button 
                            onClick={() => handleApproveSubmission(s)}
                            className="p-2 text-slate-400 hover:text-green-600 transition-colors" 
                            title="Approve"
                          >
                            <Check size={18} />
                          </button>
                          <button 
                            onClick={() => handleRejectSubmission(s.id)}
                            className="p-2 text-slate-400 hover:text-red-600 transition-colors" 
                            title="Reject"
                          >
                            <X size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="p-6 border-t border-slate-50 flex items-center justify-between">
            <div className="text-xs text-slate-400 font-medium">Showing 1-10 of 156 entries</div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" disabled>Previous</button>
              <button className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Next</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
