import React, { useState, useEffect } from 'react';
import { Activity, BookOpen, ChevronLeft, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquareHeart, Search, UserCircle, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { FeedbackWidget } from '../dashboard/FeedbackWidget';
import { dashboardTitle, affiliation } from '../../lib/identity';
import { ReadingClock, useAllowance } from '../membership/ReadingClock';
import { Sparkles } from 'lucide-react';

interface InstitutionLayoutProps {
  children: React.ReactNode;
}

export function InstitutionLayout({ children }: InstitutionLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading, isInstitutionAdmin } = useAuth();
  const { allowance, msLeft, msUntil } = useAllowance();
  const [q, setQ] = useState('');
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
      <div className="min-h-screen bg-surface-2 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-2 flex">
      {/* Sidebar */}
      {/* A light rail, not a dark slab. The dark one read as a different piece
          of software bolted to the left of this one; against a light page the
          weight belongs on the content, not on the furniture. */}
      <aside className={`flex shrink-0 flex-col border-r border-rule bg-surface transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className={`flex items-center gap-2 p-5 mb-2 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <div className="flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight text-ink">
              {profile.institutionProfile?.logoUrl ? (
                <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0 bg-surface shadow-sm border border-accent/30">
                  <img src={profile.institutionProfile.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-8 w-8 bg-accent rounded-lg flex items-center justify-center shrink-0">
                  <LayoutDashboard size={18} />
                </div>
              )}
              <span className="text-sm truncate">{profile.organization || 'INSTITUTION'}</span>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
            {isSidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {isSidebarOpen && <p className="px-3 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Menu</p>}
          <NavButton
            icon={<LayoutDashboard size={18} />}
            label="Dashboard Overview"
            active={location.pathname === '/institution'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution')}
          />
          <NavButton
            icon={<Users size={18} />}
            label="User Management"
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
          <NavButton
            icon={<BookOpen size={18} />}
            label="Content Library"
            active={['/institution/library', '/institution/access', '/institution/explore'].includes(location.pathname)}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution/access')}
          />
          <NavButton
            icon={<CreditCard size={18} />}
            label="Subscriptions"
            active={location.pathname === '/institution/subscriptions'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution/subscriptions')}
          />
          <NavButton
            icon={<UserCircle size={18} />}
            label="Profile"
            active={location.pathname === '/institution/profile'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution/profile')}
          />
          <NavButton
            icon={<MessageSquareHeart size={18} />}
            label="My Feedbacks"
            active={location.pathname === '/institution/feedbacks'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/institution/feedbacks')}
          />
          {allowance?.timed && (
            <NavButton
              icon={<Sparkles size={18} />}
              label="Membership"
              active={false}
              collapsed={!isSidebarOpen}
              onClick={() => navigate('/dashboard/pro')}
            />
          )}
        </nav>

        {/* The reference put a promotion here; ours is the thing we actually
            want them to take, and only while it would mean something. */}
        {isSidebarOpen && allowance?.timed && (
          <div className="mx-3 mb-3 rounded-2xl bg-accent p-4 text-white">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">Free membership</p>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug">Read without a limit</p>
            <p className="mt-1 text-[11.5px] leading-snug text-white/80">
              Pro removes the half-hour sessions, for you and your students.
            </p>
            <button
              onClick={() => navigate('/dashboard/pro')}
              className="mt-3 w-full rounded-xl bg-white/15 py-2 text-[12px] font-bold hover:bg-white/25"
            >
              Apply for Pro
            </button>
          </div>
        )}

        <div className="space-y-0.5 border-t border-rule px-3 pb-5 pt-4">
          <NavButton icon={<LogOut size={18} />} label="Sign Out" active={false} collapsed={!isSidebarOpen}
            onClick={handleSignOut} danger />
                  <div className={`flex items-center gap-3 px-3 py-2 ${!isSidebarOpen && 'justify-center'} mt-2`}>
            <div className="h-8 w-8 rounded-full bg-ink-2 flex items-center justify-center text-xs font-bold shrink-0">
              {(profile.organization || profile.displayName || 'IN').substring(0, 2).toUpperCase()}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <div className="text-xs font-bold truncate">{profile.displayName || 'Institution Head'}</div>
                <div className="text-[10px] text-faint truncate">{affiliation(profile as any) || 'University Portal'}</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden bg-surface-2">
        <header className="sticky top-0 z-10 flex h-[68px] shrink-0 items-center justify-between gap-6 border-b border-rule bg-surface px-6 lg:px-8">
          <h1 className="shrink-0 text-[17px] font-bold text-ink">
            {location.pathname === '/institution' ? dashboardTitle(profile as any)
            : location.pathname.startsWith('/institution/students') ? 'Student Directory'
            : location.pathname === '/institution/analytics' ? 'Learning Analytics'
            : location.pathname === '/institution/library' ? 'Content Library'
            : location.pathname === '/institution/explore' ? 'Content Library'
            : location.pathname === '/institution/subscriptions' ? 'Subscription Details'
            : location.pathname === '/institution/profile' ? 'Institution Profile'
            : location.pathname === '/institution/feedbacks' ? 'My Feedbacks'
            : 'Dashboard'}
          </h1>
          {/* Search where the hand expects it, and the member named on the
              right — the two things every dashboard of this shape has and this
              one did not. */}
          <form
            onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/institution/explore?search=${encodeURIComponent(q.trim())}`); }}
            className="hidden min-w-0 flex-1 items-center gap-2 rounded-xl border border-rule bg-surface-2 px-3 py-2 md:flex lg:max-w-md"
          >
            <Search size={16} className="shrink-0 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search journals, books, subjects…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </form>

          <div className="flex shrink-0 items-center gap-3">
            <ReadingClock allowance={allowance} msLeft={msLeft} msUntil={msUntil} />
            <div className="hidden items-center gap-2.5 border-l border-rule pl-3 sm:flex">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">
                {(profile.displayName || profile.organization || 'IN').substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold text-ink">{profile.displayName || 'Librarian'}</p>
                <p className="max-w-[160px] truncate text-[11px] text-faint">{profile.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="rounded-xl border border-rule p-2 text-muted transition-colors hover:bg-alarm-soft hover:text-alarm"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </div>
      </main>
      <FeedbackWidget />
    </div>
  );
}

function NavButton({ icon, label, active, collapsed, onClick, danger = false }: {
  icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
        active ? 'bg-accent-soft text-accent'
        : danger ? 'text-muted hover:bg-alarm-soft hover:text-alarm'
        : 'text-muted hover:bg-surface-2 hover:text-ink'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : undefined}
    >
      {/* The mark that says where you are, on the edge where the eye runs down. */}
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
      )}
      <div className="shrink-0">{icon}</div>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
