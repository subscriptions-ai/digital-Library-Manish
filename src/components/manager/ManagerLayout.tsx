import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, CreditCard, LogOut, ChevronLeft, Menu, Bell, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Spinner } from '../ui';

interface ManagerLayoutProps {
  children: React.ReactNode;
}

export function ManagerLayout({ children }: ManagerLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading, isSubscriptionManager } = useAuth();
  // Open on a desktop; collapsed to the icon rail on a phone, where a 256px
  // sidebar would leave the content almost no room.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
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
      <div className="min-h-screen bg-ground flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="app-type min-h-screen bg-ground flex">
      {/* Sidebar */}
      <aside className={`sticky top-0 h-screen self-start bg-emerald-950 text-white flex flex-col transition-[width] duration-200 shrink-0 ${isSidebarOpen ? 'w-64' : 'w-16 sm:w-20'}`}>
        <div className={`flex items-center gap-2 px-3 py-4 sm:px-4 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <div className="flex items-center gap-2 font-bold tracking-tight min-w-0">
              <div className="h-8 w-8 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0" aria-hidden="true">
                <Bell size={18} />
              </div>
              <span className="text-base truncate">SALES PORTAL</span>
            </div>
          )}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-emerald-200 transition-colors"
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={isSidebarOpen}
          >
            {isSidebarOpen ? <ChevronLeft size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>

        <nav aria-label="Manager" className="flex-1 overflow-y-auto px-2 sm:px-3 space-y-1 pb-4 mt-2">
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
              hint={pendingCount > 0 ? `${pendingCount} pending` : undefined}
            />
            {pendingCount > 0 && isSidebarOpen && (
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 bg-amber-500 text-emerald-950 text-xs font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center" aria-hidden="true">
                {pendingCount}
              </div>
            )}
            {pendingCount > 0 && !isSidebarOpen && (
              <div className="pointer-events-none absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 border border-emerald-950" aria-hidden="true" />
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
          <NavButton
            icon={<UserPlus size={18} />}
            label="Create User"
            active={location.pathname === '/manager/users/create'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/manager/users/create')}
          />
        </nav>

        <div className="pt-3 pb-4 px-2 sm:px-3 border-t border-white/10 space-y-1">
          <NavButton icon={<LogOut size={18} />} label="Sign Out" active={false} collapsed={!isSidebarOpen}
            onClick={handleSignOut} danger />
          <div className={`flex items-center gap-3 px-3 py-2 ${!isSidebarOpen && 'justify-center'}`}>
            <div className="h-8 w-8 rounded-full bg-emerald-700 flex items-center justify-center text-xs font-bold shrink-0" aria-hidden="true">
              {profile.displayName?.substring(0, 2).toUpperCase() || 'SM'}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <div className="text-sm font-semibold truncate">{profile.displayName || 'Sales Manager'}</div>
                <div className="text-xs text-emerald-300">Subscription Manager</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-hidden bg-ground">
        <header className="bg-surface/90 backdrop-blur-md border-b border-rule z-10 sticky top-0 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 shrink-0">
          <h1 className="text-lg font-bold text-ink truncate">
            {location.pathname === '/manager' ? 'Sales Revenue Analytics'
            : location.pathname.startsWith('/manager/requests') ? 'Incoming Requests'
            : location.pathname.startsWith('/manager/quotations') ? 'Quotation Workflow'
            : location.pathname.startsWith('/manager/subscriptions') ? 'Global Subscriptions'
            : 'Dashboard'}
          </h1>
          <button
            onClick={handleSignOut}
            className="btn btn-ghost btn-sm shrink-0"
            aria-label="Sign Out"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavButton({ icon, label, active, collapsed, onClick, danger = false, hint }: {
  icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; danger?: boolean; hint?: string;
}) {
  return (
    <button onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed || hint ? [label, hint].filter(Boolean).join(', ') : undefined}
      className={`w-full flex items-center gap-3 px-3 h-11 rounded-lg text-sm font-semibold transition-colors duration-150 ${
        active ? 'bg-emerald-600 text-white'
        : danger ? 'text-red-300 hover:bg-white/5 hover:text-red-200'
        : 'text-emerald-200 hover:bg-white/5 hover:text-white'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : undefined}
    >
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
