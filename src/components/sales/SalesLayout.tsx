import React, { useEffect, useState, useRef } from 'react';
import { LogOut, LayoutDashboard, Target, Users, ClipboardList, BarChart3, Bell } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

export function SalesLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading } = useAuth();
  const [notif, setNotif] = useState<any>({ total: 0, list: [] });
  const [bellOpen, setBellOpen] = useState(false);
  const prevCount = useRef(0);

  const loadNotif = async () => {
    try {
      const r = await fetch('/api/sales/notifications', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) return;
      const d = await r.json();
      if ((d.total || 0) > prevCount.current && prevCount.current !== 0) toast.success(`${d.total} new lead${d.total > 1 ? 's' : ''} assigned to you`);
      prevCount.current = d.total || 0;
      setNotif(d);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!profile) return;
    loadNotif();
    const t = setInterval(loadNotif, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [profile]);
  // Refresh the badge shortly after landing on My Leads (opening it clears the flags server-side)
  useEffect(() => { if (location.pathname.startsWith('/sales/leads')) setTimeout(loadNotif, 1500); /* eslint-disable-next-line */ }, [location.pathname]);
  useEffect(() => { if (!bellOpen) return; const c = () => setBellOpen(false); window.addEventListener('click', c); return () => window.removeEventListener('click', c); }, [bellOpen]);

  useEffect(() => {
    if (!loading) {
      if (!profile) {
        navigate('/login');
      } else if (profile.role !== 'SalesExecutive' && profile.role !== 'SalesManager' && profile.role !== 'SuperAdmin') {
        toast.error('Unauthorized access to Sales Portal');
        navigate('/dashboard');
      }
    }
  }, [profile, loading, navigate]);

  const handleSignOut = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  if (loading || !profile) return <div className="min-h-screen bg-slate-50 flex items-center justify-center animate-pulse">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-indigo-900">
              <Target className="text-indigo-600" />
              Sales Workspace
            </div>
            <div className="flex items-center gap-4">
              <div className="relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setBellOpen(o => !o); loadNotif(); }} className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
                  <Bell size={19} />
                  {notif.total > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-[9px] text-white min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold">{notif.total > 9 ? '9+' : notif.total}</span>
                  )}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[80] overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800">Notifications</span>
                      {notif.total > 0 && <span className="text-[11px] font-bold text-rose-500">{notif.total} new</span>}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
                      {(!notif.list || notif.list.length === 0) && <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up 🎉</div>}
                      {(notif.list || []).map((l: any) => (
                        <button key={l.id} onClick={() => { setBellOpen(false); navigate('/sales/leads'); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3">
                          <Users size={16} className="text-indigo-600 mt-0.5 shrink-0" />
                          <div className="min-w-0"><div className="text-sm font-semibold text-slate-800 truncate">New lead: {l.name}</div>
                            <div className="text-[12px] text-slate-500 truncate">{[l.organization, l.source].filter(Boolean).join(' · ') || 'Assigned to you'}</div></div>
                        </button>
                      ))}
                      {notif.total > 0 && (
                        <button onClick={() => { setBellOpen(false); navigate('/sales/leads'); }} className="w-full text-center px-4 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50">View all my leads →</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-sm font-semibold text-slate-600 hidden sm:block">
                {profile.displayName || profile.email}
              </span>
              <button onClick={handleSignOut} className="text-slate-400 hover:text-rose-600 transition-colors p-2" title="Sign Out">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-6 flex-1 flex flex-col md:flex-row gap-6">
        <aside className="w-full md:w-64 shrink-0 space-y-2">
          <button
            onClick={() => navigate('/sales')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              location.pathname === '/sales'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>

          <button
            onClick={() => navigate('/sales/leads')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              location.pathname.startsWith('/sales/leads')
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            <Users size={18} /> My Leads
            {notif.total > 0 && <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{notif.total > 9 ? '9+' : notif.total}</span>}
          </button>

          <button
            onClick={() => navigate('/sales/activity')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              location.pathname === '/sales/activity'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            <ClipboardList size={18} /> Activity Log
          </button>

          <button
            onClick={() => navigate('/sales/performance')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              location.pathname === '/sales/performance'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            <BarChart3 size={18} /> Performance
          </button>
          
          {profile.role === 'SuperAdmin' && (
            <div className="pt-4 mt-4 border-t border-slate-200">
              <button
                onClick={() => navigate('/admin/leads')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-900 transition-all"
              >
                Return to Admin
              </button>
            </div>
          )}
        </aside>

        <main className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
          {children}
        </main>
      </div>
    </div>
  );
}
