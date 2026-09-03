import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CreditCard, 
  FileText, 
  Settings, 
  LogOut, 
  ChevronRight,
  Menu,
  X,
  Library,
  Receipt,
  PlaySquare,
  MessageSquareHeart
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FeedbackWidget } from './dashboard/FeedbackWidget';

interface SidebarItem {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  path: string;
  roles: string[];
}

const sidebarItems: SidebarItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  // Browsing, entitlements and saved items are the same library seen three
  // ways; they are tabs inside it now rather than three sidebar entries.
  { label: 'Library', icon: Library, path: '/dashboard/library', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'My Subscriptions', icon: CreditCard, path: '/dashboard/subscriptions', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'Video Library', icon: PlaySquare, path: '/dashboard/videos', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'My Feedbacks', icon: MessageSquareHeart, path: '/dashboard/feedbacks', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'Invoices & Payments', icon: Receipt, path: '/dashboard/invoices', roles: ['Subscriber', 'College', 'University', 'Corporate'] },
  { label: 'Profile Settings', icon: Settings, path: '/dashboard/settings', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 768);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role !== 'Student' && profile.role !== 'Subscriber') {
        if (profile.role === 'SuperAdmin') navigate('/admin');
        else if (profile.role === 'Institution') navigate('/institution');
        else if (profile.role === 'SubscriptionManager') navigate('/manager');
      }
    } else if (!loading && !profile) {
      navigate('/login');
    }
  }, [profile, loading, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const filteredItems = sidebarItems.filter(item => 
    profile?.role && item.roles.includes(profile.role)
  );

  return (
    <div className="flex min-h-screen bg-ground">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50
        ${isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'} 
        bg-surface border-r border-rule transition-all duration-300 flex flex-col
      `}>
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
                <Library className="text-accent-on" size={19} />
              </div>
              <span className="font-serif text-[15px] font-medium text-ink">Digital Library</span>
            </Link>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {filteredItems.map((item) => {
            const isActive = item.path === '/dashboard' 
              ? location.pathname === '/dashboard' 
              : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 rounded-md px-3.5 py-2.5 text-[14px] transition-colors
                  ${isActive
                    ? 'bg-accent-soft text-accent font-semibold'
                    : 'text-muted hover:bg-surface-2 hover:text-ink-2'}
                `}
                title={!isSidebarOpen ? item.label : undefined}
              >
                <item.icon size={20} className={isActive ? 'text-accent' : ''} />
                {isSidebarOpen && <span>{item.label}</span>}
                {isActive && isSidebarOpen && <ChevronRight size={16} className="ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Institution badge for Students */}
        {profile?.role === 'Student' && profile?.organization && isSidebarOpen && (
          <div className="mx-4 mb-3 rounded-md border border-rule bg-surface-2 px-4 py-3">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-faint">Associated institution</p>
            <p className="truncate text-[13.5px] font-medium text-ink-2">{profile.organization}</p>
          </div>
        )}
        <div className="border-t border-rule p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3.5 py-2.5 text-[14px] text-muted transition-colors hover:bg-alarm-soft hover:text-alarm"
            title={!isSidebarOpen ? "Logout" : undefined}
          >
            <LogOut size={20} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ground">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-rule bg-surface/85 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="-ml-2 rounded-md p-2 text-muted transition-colors hover:bg-surface-2 md:hidden"
            >
              <Menu size={24} />
            </button>
            <h2 className="max-w-[150px] truncate font-serif text-[17px] font-medium text-ink sm:max-w-none sm:text-[19px]">
              {sidebarItems.find(i => location.pathname === i.path || (i.path !== '/dashboard' && location.pathname.startsWith(i.path)))?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="text-right hidden sm:flex flex-col items-end">
              <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                {profile?.isDemoAccount && (
                  <span className="rounded-[3px] border border-caution bg-caution-soft px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-caution">
                    Demo
                  </span>
                )}
                <span className="truncate max-w-[120px] lg:max-w-[200px]">{profile?.displayName || profile?.email}</span>
              </div>
              {profile?.role === 'Student' && profile?.organization ? (
                <p className="text-[12px] text-muted">{profile.organization}</p>
              ) : (
                <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{profile?.role}</p>
              )}
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-surface-2 font-medium text-muted">
              {profile?.displayName?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase()}
            </div>
            <div className="mx-1 h-7 w-px bg-rule"></div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-[13.5px] font-medium text-muted transition-colors hover:text-alarm"
              title="Sign Out"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {children}
        </div>
      </main>
      <FeedbackWidget />
    </div>
  );
}
