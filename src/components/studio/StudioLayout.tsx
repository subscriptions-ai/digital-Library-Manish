import React, { useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { FileText, LogOut, PenLine, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner } from '../ui';
import { getDashboardRoute } from '../../lib/dashboardRoute';

/**
 * The writer's dashboard.
 *
 * Deliberately small. An editor needs their posts, a place to put pictures and
 * a way out; they have no business in members, leads or payments, and giving
 * somebody the admin dashboard to write a blog post is how accounts end up
 * with more reach than anybody intended.
 */
export function StudioLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!profile) { navigate('/login'); return; }
    if (profile.role !== 'ContentManager' && profile.role !== 'SuperAdmin') {
      navigate(getDashboardRoute(profile), { replace: true });
    }
  }, [profile, loading, navigate]);

  if (loading || !profile || (profile.role !== 'ContentManager' && profile.role !== 'SuperAdmin')) return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
      isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2'}`;
  const mobileLink = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${
      isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2'}`;

  return (
    <div className="app-type flex min-h-screen bg-ground text-ink">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-rule bg-surface p-3 md:flex">
        <Link to="/" title="Go to home page" aria-label="Go to the STM Digital Library home page"
          className="flex items-center gap-2.5 px-2 py-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
          <span className="leading-tight">
            <span className="block font-serif text-[15px] font-medium text-ink">Studio</span>
            <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-faint">The blog</span>
          </span>
        </Link>

        <nav aria-label="Studio" className="mt-4 space-y-1">
          <NavLink to="/studio" end className={link}><FileText size={16} aria-hidden="true" /> Posts</NavLink>
          <NavLink to="/studio/new" className={link}><PenLine size={16} aria-hidden="true" /> Write a post</NavLink>
        </nav>

        <div className="mt-auto space-y-1 border-t border-rule pt-3">
          <a href="/blog" target="_blank" rel="noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors duration-150 hover:bg-surface-2">
            <ExternalLink size={16} aria-hidden="true" /> See the blog
          </a>
          <button onClick={() => { logout(); navigate('/'); }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink">
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
          <p className="px-3 pt-2 text-xs text-muted">
            {profile.displayName || profile.email}
            <span className="block text-[11px] uppercase tracking-wide text-faint">Editor</span>
          </p>
        </div>
      </aside>

      {/* On a phone the rail becomes a strip along the top. */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-rule bg-surface px-4 md:hidden">
          <img src="/logo.png" alt="" className="mr-1 h-7 w-7 object-contain" />
          <NavLink to="/studio" end className={mobileLink}>Posts</NavLink>
          <NavLink to="/studio/new" className={mobileLink}>Write</NavLink>
          <button onClick={() => { logout(); navigate('/'); }} className="btn btn-ghost btn-sm ml-auto">Sign out</button>
        </div>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
