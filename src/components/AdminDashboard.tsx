import React, { useState, useEffect } from 'react';
import { LayoutGrid, FileText, CreditCard, Users, Search, Download, ExternalLink, ChevronRight, Filter, LogOut, Check, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, isAdmin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'quotations' | 'payments' | 'users' | 'submissions'>('quotations');
  const [quotations, setQuotations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      toast.error('Unauthorized access');
      navigate('/dashboard');
      return;
    }

    const fetchData = async () => {
      setDataLoading(true);
      try {
        // Mocked or limited endpoints for currently implemented routes
        // For production, these will fetch actual data from API matching the Drizzle schema.
        const usersData = await api.users.getAll();
        setUsersList(Array.isArray(usersData) ? usersData : []);

        const contentData = await api.content.getAll();
        setSubmissions(Array.isArray(contentData) ? contentData : []);

        // Assuming quotations and payments APIs are partially implemented 
        // Replace these with actual fetch when fully connected
        setQuotations([]);
        setPayments([]);
      } catch (error) {
        console.error('Error fetching admin data:', error);
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [authLoading, isAdmin, navigate]);

  const handleApproveSubmission = async (submission: any) => {
    // Currently relying on existing status fields, ideally update via API
    toast.success('Submission approved in UI! (API connection required for persistence)');
  };

  const handleRejectSubmission = async (submissionId: string) => {
    toast.success('Submission rejected in UI! (API connection required for persistence)');
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  if (authLoading || dataLoading) {
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
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
              {profile?.displayName?.slice(0, 2).toUpperCase() || 'AD'}
            </div>
            <div>
              <div className="text-xs font-bold">{profile?.displayName || 'Admin'}</div>
              <div className="text-[10px] text-slate-500">{profile?.role || 'Super Admin'}</div>
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
            <div className="text-3xl font-bold text-slate-900">{usersList.length}</div>
            <div className="mt-2 text-xs text-green-600 font-bold">Registered on platform</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">User / Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Details</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status / Role</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activeTab === 'users' && usersList.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{u.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{u.displayName || u.email}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{u.createdAt ? format(new Date(u.createdAt), 'dd MMM, yyyy') : 'N/A'}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{u.status || 'Active'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      u.role === 'SuperAdmin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
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
                  <td className="px-6 py-4 text-sm text-slate-600">{s.publishedAt ? format(new Date(s.publishedAt), 'dd MMM, yyyy') : 'N/A'}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{s.publishingMode}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      s.status === 'Approved' || true ? 'bg-green-100 text-green-700' : 
                      s.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      Published
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="View Details"><Eye size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Add similar empty states or lists for payments and quotations */}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
