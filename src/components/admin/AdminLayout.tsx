import React, { useState, useEffect } from 'react';
import {
  LayoutGrid, Users, LogOut, ChevronLeft, Menu, CreditCard, Bell,
  Book, BookOpen, Newspaper, FileText, GraduationCap, Users2, Video, Mail,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const CONTENT_MODULES = [
  { name: 'Books',                  slug: 'books',                   icon: <Book size={16} /> },
  { name: 'Periodicals',            slug: 'periodicals',              icon: <BookOpen size={16} /> },
  { name: 'Magazines',              slug: 'magazines',                icon: <Newspaper size={16} /> },
  { name: 'Case Reports',           slug: 'case-reports',             icon: <FileText size={16} /> },
  { name: 'Theses',                 slug: 'theses',                   icon: <GraduationCap size={16} /> },
  { name: 'Conference Proceedings', slug: 'conference-proceedings',   icon: <Users2 size={16} /> },
  { name: 'Educational Videos',     slug: 'educational-videos',       icon: <Video size={16} /> },
  { name: 'Newsletters',            slug: 'newsletters',              icon: <Mail size={16} /> },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [contentExpanded, setContentExpanded] = useState(true);
  const [subsExpanded, setSubsExpanded] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role !== 'Admin' && profile.role !== 'SuperAdmin') {
        toast.error('Unauthorized access');
        navigate('/dashboard');
      } else {
        // fetch pending subscription requests count for badge
        fetch('/api/admin/subscription-requests?status=Pending', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()).then(data => {
          if (Array.isArray(data)) setPendingCount(data.length);
        }).catch(() => {});
      }
    } else if (!loading && !profile) {
      navigate('/login');
    }
  }, [profile, loading, navigate]);

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

  const isContentActive = CONTENT_MODULES.some(m => location.pathname.startsWith(`/admin/${m.slug}`));
  const isSubsActive = location.pathname.startsWith('/admin/subscription');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`bg-slate-900 text-white flex flex-col transition-all duration-300 shrink-0 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        {/* Logo + Toggle */}
        <div className={`flex items-center gap-2 p-5 mb-2 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <div className="flex items-center gap-2.5 font-extrabold tracking-tight">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <LayoutGrid size={18} />
              </div>
              <span className="text-base">STM ADMIN</span>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400">
            {isSidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 pb-4">
          {/* Dashboard */}
          <NavButton
            icon={<LayoutGrid size={17} />}
            label="Dashboard"
            active={location.pathname === '/admin'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin')}
          />

          {/* Content Modules */}
          <div>
            <button
              onClick={() => { setContentExpanded(!contentExpanded); if (!isSidebarOpen) setIsSidebarOpen(true); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isContentActive ? 'bg-blue-600/20 text-blue-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              } ${!isSidebarOpen && 'justify-center'}`}
              title={!isSidebarOpen ? 'Content' : undefined}
            >
              <BookOpen size={17} className="shrink-0" />
              {isSidebarOpen && (
                <>
                  <span className="flex-1 text-left">Content</span>
                  {contentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </>
              )}
            </button>
            {isSidebarOpen && contentExpanded && (
              <div className="mt-0.5 ml-4 border-l border-slate-700 pl-3 space-y-0.5">
                {CONTENT_MODULES.map(m => (
                  <button
                    key={m.slug}
                    onClick={() => navigate(`/admin/${m.slug}`)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      location.pathname.startsWith(`/admin/${m.slug}`)
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Users */}
          <NavButton
            icon={<Users size={17} />}
            label="Users"
            active={location.pathname === '/admin/users'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/users')}
          />

          {/* Subscriptions */}
          <div>
            <button
              onClick={() => { setSubsExpanded(!subsExpanded); if (!isSidebarOpen) setIsSidebarOpen(true); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isSubsActive ? 'bg-blue-600/20 text-blue-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              } ${!isSidebarOpen && 'justify-center'}`}
              title={!isSidebarOpen ? 'Subscriptions' : undefined}
            >
              <CreditCard size={17} className="shrink-0" />
              {isSidebarOpen && (
                <>
                  <span className="flex-1 text-left">Subscriptions</span>
                  {pendingCount > 0 && (
                    <span className="bg-amber-500 text-xs text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                  {subsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </>
              )}
            </button>
            {isSidebarOpen && subsExpanded && (
              <div className="mt-0.5 ml-4 border-l border-slate-700 pl-3 space-y-0.5">
                <button
                  onClick={() => navigate('/admin/subscriptions')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    location.pathname === '/admin/subscriptions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  All Subscriptions
                </button>
                <button
                  onClick={() => navigate('/admin/subscription-requests')}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    location.pathname === '/admin/subscription-requests' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>Subscription Requests</span>
                  {pendingCount > 0 && location.pathname !== '/admin/subscription-requests' && (
                    <span className="bg-amber-500 text-[10px] text-white w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {pendingCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Pricing Modules */}
          <NavButton
            icon={<span style={{fontSize: 16}}>💰</span>}
            label="Pricing Modules"
            active={location.pathname === '/admin/pricing'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/pricing')}
          />

          {/* Quotations */}
          <NavButton
            icon={<FileText size={17} />}
            label="Quotations"
            active={location.pathname === '/admin/quotations'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/quotations')}
          />
        </nav>

        {/* Footer */}
        <div className="pt-4 pb-5 px-3 border-t border-white/10 space-y-0.5">
          <NavButton icon={<LogOut size={17} />} label="Sign Out" active={false} collapsed={!isSidebarOpen}
            onClick={handleSignOut} danger />
          <div className={`flex items-center gap-3 px-3 py-2 ${!isSidebarOpen && 'justify-center'}`}>
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
              {profile.displayName?.substring(0, 2).toUpperCase() || 'AD'}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <div className="text-xs font-bold truncate">{profile.displayName || 'Admin User'}</div>
                <div className="text-[10px] text-slate-500">{profile.role}</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 h-14 flex items-center px-8 shrink-0">
          <h1 className="text-base font-bold text-slate-800">
            {CONTENT_MODULES.find(m => location.pathname.startsWith(`/admin/${m.slug}`))?.name
              || (location.pathname === '/admin/subscription-requests' ? 'Subscription Requests'
              : location.pathname === '/admin/subscriptions' ? 'Subscriptions'
              : location.pathname === '/admin/users' ? 'Users'
              : 'Dashboard')}
          </h1>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50">
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
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        active ? 'bg-blue-600 text-white'
        : danger ? 'text-red-400 hover:bg-red-500/10'
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
      } ${collapsed && 'justify-center'}`}
      title={collapsed ? label : undefined}
    >
      <div className="shrink-0">{icon}</div>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
