import React, { useEffect } from 'react';
import { LogOut, LayoutDashboard, CheckSquare, Target } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

export function SalesLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading } = useAuth();

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
            onClick={() => navigate('/sales/pipeline')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              location.pathname.includes('/sales/pipeline') || location.pathname === '/sales'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            <LayoutDashboard size={18} /> My Pipeline
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
