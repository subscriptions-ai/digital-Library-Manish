import { SeatNotice } from './dashboard/SeatNotice';
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
  History,
  MessageSquareHeart,
  Sun,
  Moon,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from './ui/ThemeToggle';
import { ReadingClock, useAllowance } from './membership/ReadingClock';
import { SubscriptionSidebarCard } from './subscription/SubscriptionSidebarCard';
import { dashboardTitle, affiliation } from '../lib/identity';
import { motion, AnimatePresence } from 'framer-motion';
import { FeedbackWidget } from './dashboard/FeedbackWidget';
import { getDashboardRoute } from '../lib/dashboardRoute';
import { Spinner } from './ui';

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
  // The page existed and only the dashboard's own "View history" link reached
  // it, so a reader who had scrolled past that link could not find what they
  // had read.
  { label: 'Reading History', icon: History, path: '/dashboard/history', roles: ['Subscriber', 'Student', 'College', 'University', 'Corporate'] },
  { label: 'Subscription', icon: Sparkles, path: '/dashboard/pro', roles: ['Subscriber'] },
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

  // The drawer is a modal surface on a phone, so Escape should put it away the
  // way it would any other overlay. On a desktop the rail stays as it is.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.innerWidth < 768) setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSidebarOpen]);

  // An account whose own dashboard is somewhere else (Sales, Admin, an institution…) is sent
  // there. Nothing of this layout renders meanwhile, so the wrong dashboard never flashes.
  const ownRoute = profile ? getDashboardRoute(profile) : null;
  const elsewhere = !!ownRoute && ownRoute !== '/dashboard';
  useEffect(() => {
    if (loading) return;
    if (!profile) navigate('/login', { replace: true });
    else if (elsewhere) navigate(ownRoute!, { replace: true });
  }, [profile, loading, navigate, elsewhere, ownRoute]);

  // The clock in the header. Browsing is free — the catalogue stays open while a
  // member waits, and the limit lands where the reading does.
  const { allowance, msLeft, msUntil } = useAllowance();

  // One small ask on mount, only for the people it can hide something from.
  const [hasPayments, setHasPayments] = useState(false);
  useEffect(() => {
    if (profile?.role !== 'Subscriber') return;
    fetch('/api/me/membership', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setHasPayments((d?.payments?.count || 0) > 0))
      .catch(() => {});
  }, [profile?.role]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Membership and My Subscriptions were one subject told twice, and for a
  // self-registered member the second was always an empty page. It folds into
  // Membership for them; institutions keep it, because their plans really are
  // subscriptions to a set of departments.
  //
  // Invoices is hidden until there is something in it, for the same reason: a
  // free member should not be handed a third blank screen about their account.
  const isIndividual = profile?.role === 'Subscriber';
  const filteredItems = sidebarItems.filter(item =>
    profile?.role && item.roles.includes(profile.role)
      && !(isIndividual && item.path === '/dashboard/subscriptions')
      && !(isIndividual && item.path === '/dashboard/invoices' && !hasPayments)
  );

  if (loading || !profile || elsewhere) {
    return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;
  }

  return (
    <div className="app-type flex min-h-screen bg-ground">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm md:hidden"
          aria-hidden="true"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {/* A drawer on a phone, a rail that stays put on a desktop. It used to
          scroll off with the page, so the member block, Sign Out and the Pro
          card left the screen exactly when a long dashboard was being read. */}
      <aside id="dashboard-sidebar" aria-label="Dashboard navigation" className={`
        fixed inset-y-0 left-0 z-50 md:sticky md:inset-y-auto md:top-0 md:h-screen md:self-start
        ${isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'} 
        bg-surface border-r border-rule transition-all duration-200 flex flex-col
      `}>
        <div className={`flex h-16 shrink-0 items-center border-b border-rule px-4 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent" aria-hidden="true">
                <Library className="text-accent-on" size={18} />
              </div>
              <span className="font-serif text-[15px] font-medium text-ink">Digital Library</span>
            </Link>
          )}
          <button 
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={isSidebarOpen}
            aria-controls="dashboard-sidebar"
            className="btn btn-ghost btn-icon btn-sm"
          >
            {isSidebarOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {filteredItems.map((item) => {
            const isActive = item.path === '/dashboard' 
              ? location.pathname === '/dashboard' 
              : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                aria-label={!isSidebarOpen ? item.label : undefined}
                onClick={() => { if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                className={`
                  flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150
                  ${isSidebarOpen ? '' : 'justify-center'}
                  ${isActive
                    ? 'bg-accent-soft text-accent font-semibold'
                    : 'font-medium text-muted hover:bg-surface-2 hover:text-ink-2'}
                `}
                title={!isSidebarOpen ? item.label : undefined}
              >
                <item.icon size={18} className={`shrink-0 ${isActive ? 'text-accent' : ''}`} />
                {isSidebarOpen && <span className="truncate">{item.label}</span>}
                {isActive && isSidebarOpen && <ChevronRight size={16} className="ml-auto shrink-0 opacity-50" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>

        {/* Institution badge for Students */}
        {profile?.role === 'Student' && profile?.organization && isSidebarOpen && (
          <div className="mx-3 mb-3 rounded-lg border border-rule bg-surface-2 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Associated institution</p>
            <p className="truncate text-sm font-medium text-ink-2">{profile.organization}</p>
          </div>
        )}
        <SubscriptionSidebarCard collapsed={!isSidebarOpen} />
        <div className="border-t border-rule p-3">
          <button
            type="button"
            onClick={handleLogout}
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-alarm-soft hover:text-alarm ${isSidebarOpen ? '' : 'justify-center'}`}
            title={!isSidebarOpen ? 'Sign Out' : undefined}
            aria-label={!isSidebarOpen ? 'Sign Out' : undefined}
          >
            <LogOut size={18} className="shrink-0" aria-hidden="true" />
            {isSidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ground">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-rule bg-surface/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <button 
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation"
              aria-expanded={isSidebarOpen}
              aria-controls="dashboard-sidebar"
              className="btn btn-ghost btn-icon -ml-2 md:hidden"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            {/* The home page is named after the member; the rest are named
                after themselves, because "Librarian Dashboard" over a list of
                invoices would be a lie about which page you are on. */}
            <h2 className="min-w-0 truncate font-serif text-[17px] font-medium text-ink sm:max-w-none sm:text-[19px]">
              {location.pathname === '/dashboard'
                ? dashboardTitle(profile as any)
                : (sidebarItems.find(i => location.pathname === i.path || (i.path !== '/dashboard' && location.pathname.startsWith(i.path)))?.label || 'Dashboard')}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {/* A limit nobody can see is indistinguishable from a broken site. */}
            <ReadingClock allowance={allowance} msLeft={msLeft} msUntil={msUntil} />
            <div className="text-right hidden sm:flex flex-col items-end">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                {profile?.isDemoAccount && (
                  <span className="badge badge-caution">Demo</span>
                )}
                <span className="truncate max-w-[120px] lg:max-w-[200px]">{profile?.displayName || profile?.email}</span>
              </div>
              {/* What they are and where, rather than the internal word for
                  the row their account sits in. */}
              {affiliation(profile as any) ? (
                <p className="max-w-[170px] truncate text-xs text-muted lg:max-w-[260px]">{affiliation(profile as any)}</p>
              ) : (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{profile?.role}</p>
              )}
            </div>
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rule bg-surface-2 font-medium text-muted sm:flex" aria-hidden="true">
              {profile?.displayName?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase()}
            </div>
            <ThemeToggle />
            <div className="mx-1 hidden h-7 w-px bg-rule sm:block" aria-hidden="true"></div>
            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-ghost btn-sm text-muted hover:text-alarm"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        {/* container-app supplies the 16/24/32 side padding; the vertical half
            of p-4 sm:p-6 lg:p-8 lives here so the two do not double up. */}
        <div className="relative flex-1 overflow-y-auto py-4 sm:py-6 lg:py-8">
          <div className="container-app">
            <SeatNotice />
            {children}
          </div>
        </div>
      </main>
      <FeedbackWidget />

    </div>
  );
}
