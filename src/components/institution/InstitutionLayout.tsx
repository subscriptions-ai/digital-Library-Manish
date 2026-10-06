import React, { useState, useEffect } from 'react';
import { Activity, BookOpen, ChevronLeft, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquareHeart, Moon, Search, Sun, UserCircle, Users, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { FeedbackWidget } from '../dashboard/FeedbackWidget';
import { dashboardTitle, affiliation } from '../../lib/identity';
import { ReadingClock, useAllowance } from '../membership/ReadingClock';
import { Sparkles } from 'lucide-react';
import { PricingProvider, usePricing } from './pricing/PricingContext';
import { PlanMiniCard } from './pricing/PlanWidgets';
import { PLAN_CHANGED } from './pricing/planApi';

interface InstitutionLayoutProps {
  children: React.ReactNode;
}

export function InstitutionLayout({ children }: InstitutionLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading, isInstitutionAdmin } = useAuth();
  const { allowance, msLeft, msUntil, refresh: refreshAllowance } = useAllowance();
  const { dark, toggleDark } = useTheme();
  const [q, setQ] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  // The phone drawer is its own state: collapsing the desktop rail to icons
  // and opening the menu on a phone are different things.
  const [mobileOpen, setMobileOpen] = useState(false);

  // A tap on a menu item lands on the page, not on the menu still covering it.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

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

  // A purchase lifts the clock; ask again rather than wait for the next poll.
  useEffect(() => {
    window.addEventListener(PLAN_CHANGED, refreshAllowance);
    return () => window.removeEventListener(PLAN_CHANGED, refreshAllowance);
  }, [refreshAllowance]);

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
      <div className="min-h-screen bg-surface-2 flex items-center justify-center">
        <div role="status" aria-label="Loading" className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
      </div>
    );
  }

  // On a phone the drawer always shows labels; the icon-only rail is a desktop choice.
  const collapsed = !isSidebarOpen && !mobileOpen;

  return (
    <PricingProvider enabled={profile.role === 'Institution'}>
    <div className="app-type min-h-screen bg-surface-2 flex">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      {/* Sidebar */}
      {/* It stays put. The rail scrolled away with the page, taking Sign Out,
          the member block and the Pro card off screen on exactly the pages
          long enough to need them. One viewport tall, pinned to the top, and
          the nav scrolls inside itself if it ever outgrows the screen. */}
      {/* A light rail, not a dark slab. The dark one read as a different piece
          of software bolted to the left of this one; against a light page the
          weight belongs on the content, not on the furniture. */}
      {/* A drawer on a phone, where a 64px rail would leave too little room for
          the page itself; the rail that stays put from tablet width up. */}
      <aside
        id="institution-nav"
        aria-label="Institution menu"
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-rule bg-surface transition-[transform,width] duration-200 md:sticky md:top-0 md:z-auto md:self-start md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarOpen ? 'md:w-64' : 'md:w-20'}`}>
        {/* Everything below is sized so the rail fits a 1366×768 laptop without a
            scrollbar: the menu overflowed by 33px there, and the last item sat
            half out of sight. The nav still scrolls, but only on a shorter screen. */}
        <div className={`flex items-center gap-2 px-5 py-4 ${!collapsed ? 'justify-between' : 'justify-center'}`}>
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight text-ink">
              {profile.institutionProfile?.logoUrl ? (
                <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0 bg-surface shadow-sm border border-accent/30">
                  <img src={profile.institutionProfile.logoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-8 w-8 bg-accent text-accent-on rounded-lg flex items-center justify-center shrink-0" aria-hidden="true">
                  <LayoutDashboard size={18} />
                </div>
              )}
              <span className="text-sm truncate">{profile.organization || 'INSTITUTION'}</span>
            </div>
          )}
          {/* On a phone this closes the drawer; from tablet width up it folds the rail to icons. */}
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu"
            className="btn btn-ghost btn-sm btn-icon md:hidden">
            <X size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? 'Collapse menu' : 'Expand menu'} aria-expanded={isSidebarOpen}
            className="btn btn-ghost btn-sm btn-icon hidden md:inline-flex">
            {isSidebarOpen ? <ChevronLeft size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
          {!collapsed && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Menu</p>}
          <NavButton
            icon={<LayoutDashboard size={18} />}
            label="Dashboard Overview"
            active={location.pathname === '/institution'}
            collapsed={collapsed}
            onClick={() => navigate('/institution')}
          />
          <NavButton
            icon={<Users size={18} />}
            label="User Management"
            active={location.pathname.startsWith('/institution/students')}
            collapsed={collapsed}
            onClick={() => navigate('/institution/students')}
          />
          <NavButton
            icon={<Activity size={18} />}
            label="Learning Analytics"
            active={location.pathname === '/institution/analytics'}
            collapsed={collapsed}
            onClick={() => navigate('/institution/analytics')}
          />
          <NavButton
            icon={<BookOpen size={18} />}
            label="Content Library"
            active={['/institution/library', '/institution/access', '/institution/explore'].includes(location.pathname)}
            collapsed={collapsed}
            onClick={() => navigate('/institution/access')}
          />
          <PlanNavItem timed={!!allowance?.timed} collapsed={collapsed} pathname={location.pathname} navigate={navigate} />
          <NavButton
            icon={<UserCircle size={18} />}
            label="Profile"
            active={location.pathname === '/institution/profile'}
            collapsed={collapsed}
            onClick={() => navigate('/institution/profile')}
          />
          <NavButton
            icon={<MessageSquareHeart size={18} />}
            label="My Feedbacks"
            active={location.pathname === '/institution/feedbacks'}
            collapsed={collapsed}
            onClick={() => navigate('/institution/feedbacks')}
          />
        </nav>

        {/* The plan, where the prototype puts it: the free preview with the way to
            Premium, or what is running and the seats it has. An account that is
            not the librarian has no plan to show, and keeps the Pro card. */}
        {!collapsed && <RailPlan timed={!!allowance?.timed} onPro={() => navigate('/institution/membership')} />}

        {/* Who is signed in is named in the top bar, on every page. Saying it
            a second time at the foot of the rail cost the height that pushed
            the menu into a scroll. */}
        <div className="border-t border-rule px-3 py-2">
          <NavButton icon={<LogOut size={18} />} label="Sign Out" active={false} collapsed={collapsed}
            onClick={handleSignOut} danger />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col min-h-screen overflow-hidden bg-surface-2">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-rule bg-surface px-4 sm:gap-6 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu"
            aria-expanded={mobileOpen} aria-controls="institution-nav"
            className="btn btn-ghost btn-sm btn-icon -ml-2 shrink-0 md:hidden">
            <Menu size={20} aria-hidden="true" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-ink md:flex-none md:shrink-0">
            {location.pathname === '/institution' ? dashboardTitle(profile as any)
            : location.pathname.startsWith('/institution/students') ? 'User Directory'
            : location.pathname === '/institution/analytics' ? 'Learning Analytics'
            : location.pathname === '/institution/library' ? 'Content Library'
            : location.pathname === '/institution/explore' ? 'Content Library'
            : location.pathname === '/institution/subscriptions' ? 'Subscriptions'
            : location.pathname === '/institution/profile' ? 'Institution Profile'
            : location.pathname === '/institution/feedbacks' ? 'My Feedbacks'
            : 'Dashboard'}
          </h1>
          {/* Search where the hand expects it, and the member named on the
              right — the two things every dashboard of this shape has and this
              one did not. */}
          {/* The library reads its search from `q`. I sent `search`, so every
              term typed up here arrived at a page that ignored it and showed the
              whole catalogue as though nothing had been asked. */}
          <form
            onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/institution/explore?q=${encodeURIComponent(q.trim())}`); }}
            role="search"
            className="hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-rule bg-surface-2 px-3 transition-colors focus-within:border-accent md:flex lg:max-w-md"
          >
            <Search size={16} className="shrink-0 text-faint" aria-hidden="true" />
            <input
              aria-label="Search the entire library"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the entire library…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </form>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ReadingClock allowance={allowance} msLeft={msLeft} msUntil={msUntil} />
            <div className="hidden items-center gap-2.5 border-l border-rule pl-3 sm:flex">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent" aria-hidden="true">
                {(profile.displayName || profile.organization || 'IN').substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold text-ink">{profile.displayName || 'Librarian'}</p>
                <p className="max-w-[160px] truncate text-xs text-muted">{profile.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleDark}
              title={dark ? 'Light theme' : 'Dark theme'}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="btn btn-outline btn-sm btn-icon"
            >
              {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="btn btn-outline btn-sm btn-icon hidden hover:bg-alarm-soft hover:text-alarm sm:inline-flex"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
      <FeedbackWidget />
    </div>
    </PricingProvider>
  );
}

/**
 * One entry for the plan, never two. The librarian has an institution plan to
 * manage, so theirs is Subscriptions; every other account has the Free/Pro
 * membership instead. Showing both sent people to a page that told them it was
 * not theirs.
 */
function PlanNavItem({ timed, collapsed, pathname, navigate }: {
  timed: boolean; collapsed: boolean; pathname: string; navigate: (to: string) => void;
}) {
  const pricing = usePricing();
  if (pricing?.loading) return null;
  if (pricing?.plan) {
    return (
      <NavButton icon={<CreditCard size={18} />} label="Subscriptions"
        active={pathname === '/institution/subscriptions'} collapsed={collapsed}
        onClick={() => navigate('/institution/subscriptions')} />
    );
  }
  if (!timed) return null;
  return (
    <NavButton icon={<Sparkles size={18} />} label="Membership"
      active={pathname === '/institution/membership'} collapsed={collapsed}
      onClick={() => navigate('/institution/membership')} />
  );
}

function RailPlan({ timed, onPro }: { timed: boolean; onPro: () => void }) {
  const pricing = usePricing();
  if (pricing?.plan) return <PlanMiniCard />;
  if (pricing?.loading || !timed) return null;
  return (
    <div className="mx-3 mb-2 rounded-xl bg-accent px-4 py-3 text-accent-on">
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Free membership</p>
      <p className="mt-1 text-[13px] font-semibold leading-snug">Read without a limit</p>
      <button type="button" onClick={onPro} className="mt-2.5 h-8 w-full rounded-lg bg-white/15 text-[12px] font-semibold transition-colors hover:bg-white/25">
        Explore Subscription Options
      </button>
    </div>
  );
}

function NavButton({ icon, label, active, collapsed, onClick, danger = false }: {
  icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-accent-soft text-accent'
        : danger ? 'text-muted hover:bg-alarm-soft hover:text-alarm'
        : 'text-muted hover:bg-surface-2 hover:text-ink'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : undefined}
    >
      {/* The mark that says where you are, on the edge where the eye runs down. */}
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" aria-hidden="true" />
      )}
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
