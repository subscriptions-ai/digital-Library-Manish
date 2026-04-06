import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, LogOut, ChevronLeft, Menu, FileText, Activity } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

interface InstitutionLayoutProps {
  children: React.ReactNode;
}

export function InstitutionLayout({ children }: InstitutionLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading, isInstitutionAdmin } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role !== 'Institution' && !isInstitutionAdmin) {
        toast.error('Unauthorized access');
        navigate('/dashboard');
      }
    } else if (!loading && !profile) {
      navigate('/login');
    }
  }, [profile, loading, navigate, isInstitutionAdmin]);

  const handleSignOut = async () => {
    try {
      await logout();
      toast.success('Signed out successfully');
      navigate('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`bg-indigo-900 text-white flex flex-col transition-all duration-300 shrink-0 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className={`flex items-center gap-2 p-5 mb-2 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <div className="flex items-center gap-2.5 font-extrabold tracking-tight">
              <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                <LayoutDashboard size={18} />
              </div>
              <span className="text-base truncate">INSTITUTION</span>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-white/10 rounded-lg text-indigo-200">
            {isSidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1 pb-4 mt-4">
          <NavButton
            icon={<LayoutDashboard size={18} />}
            label="Dashboard Overview"
            active={location.pathname === '/institution'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution')}
          />
          <NavButton
            icon={<Users size={18} />}
            label="Student Management"
            active={location.pathname.startsWith('/institution/students')}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution/students')}
          />
          <NavButton
            icon={<Activity size={18} />}
            label="Learning Analytics"
            active={location.pathname === '/institution/analytics'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution/analytics')}
          />
        </nav>

        <div className="pt-4 pb-5 px-3 border-t border-white/10 space-y-0.5">
          <NavButton icon={<LogOut size={18} />} label="Sign Out" active={false} collapsed={!isSidebarOpen}
            onClick={handleSignOut} danger />
          <div className={`flex items-center gap-3 px-3 py-2 ${!isSidebarOpen && 'justify-center'} mt-2`}>
            <div className="h-8 w-8 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
              {profile.displayName?.substring(0, 2).toUpperCase() || 'IN'}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <div className="text-xs font-bold truncate">{profile.displayName || 'Institution Head'}</div>
                <div className="text-[10px] text-indigo-300">{profile.organization || 'University Portal'}</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden bg-slate-50">
        <header className="bg-white/80 backdrop-blur-md border-b border-white z-10 sticky top-0 h-16 flex items-center px-8 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <h1 className="text-lg font-bold text-slate-800">
            {location.pathname === '/institution' ? 'Institution Dashboard'
            : location.pathname.startsWith('/institution/students') ? 'Student Directory'
            : location.pathname === '/institution/analytics' ? 'Learning Analytics'
            : 'Dashboard'}
          </h1>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavButton({ icon, label, active, collapsed, onClick, danger = false }: {
  icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
        active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20'
        : danger ? 'text-red-300 hover:bg-red-500/10'
        : 'text-indigo-200 hover:bg-white/5 hover:text-white'
      } ${collapsed && 'justify-center'}`}
      title={collapsed ? label : undefined}
    >
      <div className="shrink-0">{icon}</div>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
