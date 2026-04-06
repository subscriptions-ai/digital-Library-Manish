import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, CreditCard, LogOut, ChevronLeft, Menu, Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';

interface ManagerLayoutProps {
  children: React.ReactNode;
}

export function ManagerLayout({ children }: ManagerLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading, isSubscriptionManager } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!loading && profile) {
      if (!isSubscriptionManager && profile.role !== 'SubscriptionManager') {
        toast.error('Unauthorized access');
        navigate('/dashboard');
      } else {
        fetch('/api/admin/subscription-requests?status=Pending', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()).then(data => {
          if (Array.isArray(data)) setPendingCount(data.length);
        }).catch(() => {});
      }
    } else if (!loading && !profile) {
      navigate('/login');
    }
  }, [profile, loading, navigate, isSubscriptionManager]);

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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`bg-emerald-950 text-white flex flex-col transition-all duration-300 shrink-0 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className={`flex items-center gap-2 p-5 mb-2 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <div className="flex items-center gap-2.5 font-extrabold tracking-tight">
              <div className="h-8 w-8 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                <Bell size={18} />
              </div>
              <span className="text-base truncate">SALES PORTAL</span>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-200">
            {isSidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1 pb-4 mt-4">
          <NavButton
            icon={<LayoutDashboard size={18} />}
            label="Sales Overview"
            active={location.pathname === '/manager'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/manager')}
          />
          <div className="relative">
            <NavButton
              icon={<CreditCard size={18} />}
              label="Subscription Requests"
              active={location.pathname.startsWith('/manager/requests')}
              collapsed={!isSidebarOpen}
              onClick={() => navigate('/manager/requests')}
            />
            {pendingCount > 0 && isSidebarOpen && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-amber-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center shadow-sm">
                {pendingCount}
              </div>
            )}
            {pendingCount > 0 && !isSidebarOpen && (
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 border border-emerald-950" />
            )}
          </div>
          <NavButton
            icon={<CreditCard size={18} />}
            label="All Subscriptions"
            active={location.pathname.startsWith('/manager/subscriptions')}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/manager/subscriptions')}
          />
          <NavButton
            icon={<FileText size={18} />}
            label="Quotation Manager"
            active={location.pathname.startsWith('/manager/quotations')}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/manager/quotations')}
          />
        </nav>

        <div className="pt-4 pb-5 px-3 border-t border-white/10 space-y-0.5">
          <NavButton icon={<LogOut size={18} />} label="Sign Out" active={false} collapsed={!isSidebarOpen}
            onClick={handleSignOut} danger />
          <div className={`flex items-center gap-3 px-3 py-2 ${!isSidebarOpen && 'justify-center'} mt-2`}>
            <div className="h-8 w-8 rounded-full bg-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
              {profile.displayName?.substring(0, 2).toUpperCase() || 'SM'}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <div className="text-xs font-bold truncate">{profile.displayName || 'Sales Manager'}</div>
                <div className="text-[10px] text-emerald-300">Subscription Manager</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden bg-slate-50">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 z-10 sticky top-0 h-16 flex items-center px-8 shrink-0 shadow-sm">
          <h1 className="text-lg font-bold text-slate-800">
            {location.pathname === '/manager' ? 'Sales Revenue Analytics'
            : location.pathname.startsWith('/manager/requests') ? 'Incoming Requests'
            : location.pathname.startsWith('/manager/quotations') ? 'Quotation Workflow'
            : location.pathname.startsWith('/manager/subscriptions') ? 'Global Subscriptions'
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
        active ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20'
        : danger ? 'text-red-300 hover:bg-red-500/10'
        : 'text-emerald-200 hover:bg-white/5 hover:text-white'
      } ${collapsed && 'justify-center'}`}
      title={collapsed ? label : undefined}
    >
      <div className="shrink-0">{icon}</div>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
