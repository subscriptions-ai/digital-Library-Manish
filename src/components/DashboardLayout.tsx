import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  FileText, 
  BarChart3, 
  Settings, 
  LogOut, 
  ChevronRight,
  Menu,
  X,
  Library,
  GraduationCap,
  Building2,
  Database
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
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['SuperAdmin', 'SubscriptionManager', 'ContentManager', 'College', 'University', 'Corporate', 'Student', 'Agency'] },
  { label: 'User Management', icon: Users, path: '/dashboard/users', roles: ['SuperAdmin', 'SubscriptionManager', 'College', 'University', 'Corporate'] },
  { label: 'Subscriptions', icon: CreditCard, path: '/dashboard/subscriptions', roles: ['SuperAdmin', 'SubscriptionManager'] },
  { label: 'Content Manager', icon: Library, path: '/dashboard/content', roles: ['SuperAdmin', 'ContentManager'] },
  { label: 'Analytics', icon: BarChart3, path: '/dashboard/analytics', roles: ['SuperAdmin', 'SubscriptionManager', 'College', 'University', 'Corporate'] },
  { label: 'Settings', icon: Settings, path: '/dashboard/settings', roles: ['SuperAdmin', 'SubscriptionManager', 'ContentManager', 'College', 'University', 'Corporate', 'Student', 'Agency'] },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const filteredItems = sidebarItems.filter(item => 
    profile?.role && item.roles.includes(profile.role)
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`
        ${isSidebarOpen ? 'w-64' : 'w-20'} 
        bg-white border-r border-slate-200 transition-all duration-300 flex flex-col
      `}>
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Library className="text-white" size={20} />
              </div>
              <span className="font-bold text-slate-900">Digital Library</span>
            </Link>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                  ${isActive 
                    ? 'bg-blue-50 text-blue-600 font-bold' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
                `}
              >
                <item.icon size={20} />
                {isSidebarOpen && <span>{item.label}</span>}
                {isActive && isSidebarOpen && <ChevronRight size={16} className="ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
          >
            <LogOut size={20} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-900">
              {sidebarItems.find(i => i.path === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900">{profile?.displayName || profile?.email}</p>
              <p className="text-xs text-slate-500">{profile?.role}</p>
            </div>
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
              {profile?.displayName?.[0] || profile?.email?.[0]}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
