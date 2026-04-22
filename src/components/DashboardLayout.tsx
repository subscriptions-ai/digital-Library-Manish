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
  BookOpen,
  Receipt,
  PlaySquare
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarItem {
  label: string;
  icon: React.ElementType;
  path: string;
  roles: string[];
}

const sidebarItems: SidebarItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'My Library', icon: Library, path: '/dashboard/library', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'My Content Access', icon: BookOpen, path: '/dashboard/access', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'My Subscriptions', icon: CreditCard, path: '/dashboard/subscriptions', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'Video Library', icon: PlaySquare, path: '/dashboard/videos', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'Invoices & Payments', icon: Receipt, path: '/dashboard/invoices', roles: ['Subscriber', 'College', 'University', 'Corporate'] },
  { label: 'Profile Settings', icon: Settings, path: '/dashboard/settings', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex transition-colors duration-300">
      {/* Sidebar */}
      <aside className={`
        ${isSidebarOpen ? 'w-64' : 'w-20'} 
        bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 flex flex-col z-40
      `}>
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
                <Library className="text-white" size={20} />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Digital Library</span>
            </Link>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
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
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                  ${isActive 
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold' 
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-200'}
                `}
                title={!isSidebarOpen ? item.label : undefined}
              >
                <item.icon size={20} className={isActive ? 'text-blue-600 dark:text-blue-400' : ''} />
                {isSidebarOpen && <span>{item.label}</span>}
                {isActive && isSidebarOpen && <ChevronRight size={16} className="ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Institution badge for Students */}
        {profile?.role === 'Student' && profile?.organization && isSidebarOpen && (
          <div className="mx-4 mb-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
            <p className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500 uppercase tracking-wider mb-0.5">Associated Institution</p>
            <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 truncate">{profile.organization}</p>
          </div>
        )}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all"
            title={!isSidebarOpen ? "Logout" : undefined}
          >
            <LogOut size={20} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        {/* Header */}
        <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 sticky top-0 z-30 transition-colors duration-300">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {sidebarItems.find(i => location.pathname === i.path || (i.path !== '/dashboard' && location.pathname.startsWith(i.path)))?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{profile?.displayName || profile?.email}</p>
              {profile?.role === 'Student' && profile?.organization ? (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{profile.organization}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.role}</p>
              )}
            </div>
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700">
              {profile?.displayName?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {children}
        </div>
      </main>
    </div>
  );
}
