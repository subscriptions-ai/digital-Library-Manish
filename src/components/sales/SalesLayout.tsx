import React, { useEffect, useState, useRef } from 'react';
import { LogOut, LayoutDashboard, Target, Users, ClipboardList, BarChart3, Bell, FileText, Sparkles, Menu, X, ArrowRight } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { Spinner } from '../ui';
import { getDashboardRoute } from '../../lib/dashboardRoute';

// The workspace's sections, in order. `exact` matches the path itself only;
// otherwise the section owns everything beneath it.
const NAV = [
  { to: '/sales', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/sales/leads', label: 'My Leads', icon: Users, exact: false },
  { to: '/sales/pro-applications', label: 'Subscription Enquiries', icon: Sparkles, exact: false },
  { to: '/sales/activity', label: 'Activity Log', icon: ClipboardList, exact: true },
  { to: '/sales/quotations', label: 'My Quotations', icon: FileText, exact: false },
  { to: '/sales/performance', label: 'Performance', icon: BarChart3, exact: true },
] as const;

const ROLE_LABEL: Record<string, string> = { SalesExecutive: 'Sales Executive', SalesManager: 'Sales Manager', SuperAdmin: 'Administrator' };

export function SalesLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading } = useAuth();
  const [notif, setNotif] = useState<any>({ total: 0, list: [] });
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const prevCount = useRef(0);

  const loadNotif = async () => {
    try {
      const r = await fetch('/api/sales/notifications', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) return;
      const d = await r.json();
      if ((d.total || 0) > prevCount.current && prevCount.current !== 0) toast.success(`${d.total} new lead${d.total > 1 ? 's' : ''} assigned to you`);
      prevCount.current = d.total || 0;
      setNotif(d);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!profile) return;
    loadNotif();
    const t = setInterval(loadNotif, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [profile]);
  // Refresh the badge shortly after landing on My Leads (opening it clears the flags server-side)
  useEffect(() => { if (location.pathname.startsWith('/sales/leads')) setTimeout(loadNotif, 1500); /* eslint-disable-next-line */ }, [location.pathname]);
  // The phone menu closes once a section is chosen.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [menuOpen]);
  useEffect(() => { if (!bellOpen) return; const c = () => setBellOpen(false); window.addEventListener('click', c); return () => window.removeEventListener('click', c); }, [bellOpen]);

  const allowed = profile?.role === 'SalesExecutive' || profile?.role === 'SalesManager' || profile?.role === 'SuperAdmin';
  useEffect(() => {
    if (!loading) {
      if (!profile) {
        navigate('/login');
      } else if (!allowed) {
        toast.error('Unauthorized access to Sales Portal');
        navigate(getDashboardRoute(profile), { replace: true });
      }
    }
  }, [profile, loading, navigate, allowed]);

  const handleSignOut = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  if (loading || !profile || !allowed) return <div className="min-h-screen bg-ground flex items-center justify-center"><Spinner /></div>;

  const isActive = (to: string, exact: boolean) => exact ? location.pathname === to : location.pathname.startsWith(to);

  const nav = (
    <nav aria-label="Sales workspace" className="space-y-1">
      {NAV.map(({ to, label, icon: Icon, exact }) => {
        const active = isActive(to, exact);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <Icon size={18} className="shrink-0" aria-hidden="true" /> <span className="truncate">{label}</span>
            {to === '/sales/leads' && notif.total > 0 && (
              <span className="ml-auto badge badge-caution">{notif.total > 9 ? '9+' : notif.total}<span className="sr-only"> new</span></span>
            )}
          </Link>
        );
      })}

      {profile.role === 'SuperAdmin' && (
        <div className="pt-3 mt-3 border-t border-rule">
          <button onClick={() => navigate('/admin/leads')} className="btn btn-outline btn-block">
            Return to Admin
          </button>
        </div>
      )}
    </nav>
  );

  return (
    <div className="app-type min-h-screen bg-ground flex flex-col">
      <header className="bg-surface border-b border-rule sticky top-0 z-50">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-2 h-16">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="btn btn-ghost btn-icon md:hidden -ml-2 shrink-0"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                aria-controls="sales-mobile-nav"
              >
                {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
              </button>
              <Link to="/" title="Go to home page" aria-label="Go to the STM Digital Library home page"
                className="flex items-center gap-2 font-bold text-base sm:text-lg tracking-tight text-ink min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <Target size={20} className="text-accent shrink-0" aria-hidden="true" />
                <span className="truncate">Sales Workspace</span>
              </Link>
            </div>
            <div className="flex items-center gap-1 sm:gap-3 shrink-0">
              <div className="sm:relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { setBellOpen(o => !o); loadNotif(); }}
                  className="btn btn-ghost btn-icon relative"
                  aria-label={notif.total > 0 ? `Notifications, ${notif.total} new` : 'Notifications'}
                  aria-expanded={bellOpen}
                >
                  <Bell size={20} aria-hidden="true" />
                  {notif.total > 0 && (
                    <span className="absolute top-1 right-1 bg-alarm text-[11px] text-white min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold" aria-hidden="true">{notif.total > 9 ? '9+' : notif.total}</span>
                  )}
                </button>
                {bellOpen && (
                  <div className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 bg-surface border border-rule rounded-xl shadow-[var(--shadow-pop)] z-[80] overflow-hidden">
                    <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">Notifications</span>
                      {notif.total > 0 && <span className="badge badge-caution">{notif.total} new</span>}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-rule">
                      {(!notif.list || notif.list.length === 0) && <div className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</div>}
                      {(notif.list || []).map((l: any) => (
                        <button key={l.id} onClick={() => { setBellOpen(false); navigate('/sales/leads'); }} className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors flex items-start gap-3">
                          <Users size={16} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
                          <div className="min-w-0"><div className="text-sm font-semibold text-ink truncate">New lead: {l.name}</div>
                            <div className="text-xs text-muted truncate">{[l.organization, l.source].filter(Boolean).join(' · ') || 'Assigned to you'}</div></div>
                        </button>
                      ))}
                      {notif.total > 0 && (
                        <button onClick={() => { setBellOpen(false); navigate('/sales/leads'); }} className="w-full flex items-center justify-center gap-1 px-4 py-3 text-sm font-semibold text-accent hover:bg-accent-soft transition-colors">View all my leads <ArrowRight size={14} aria-hidden="true" /></button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="hidden sm:block max-w-[200px] text-right leading-tight">
                <p className="truncate text-sm font-semibold text-ink">{profile.displayName || profile.email}</p>
                <p className="truncate text-xs text-muted">{ROLE_LABEL[profile.role] || profile.role}</p>
              </div>
              <button onClick={handleSignOut} className="btn btn-ghost btn-icon" title="Sign Out" aria-label="Sign Out">
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="md:hidden fixed inset-0 top-16 z-40 bg-ink/40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div id="sales-mobile-nav" className="md:hidden fixed left-0 top-16 bottom-0 z-50 w-72 max-w-[85vw] overflow-y-auto border-r border-rule bg-surface p-3 shadow-[var(--shadow-pop)]">
            {nav}
          </div>
        </>
      )}

      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-5 sm:py-8 flex-1 flex flex-col md:flex-row gap-6 lg:gap-8">
        {/* Pinned beside the content on a desktop, clear of the sticky header
            rather than under it; on a phone the header's menu holds it. */}
        <aside className="hidden md:block md:sticky md:top-24 md:w-56 md:shrink-0 md:self-start">
          {nav}
        </aside>

        <main className="flex-1 min-w-0 min-h-[500px]">
          {children}
        </main>
      </div>
    </div>
  );
}
