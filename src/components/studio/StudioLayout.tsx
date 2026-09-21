import React, { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FileText, LogOut, PenLine, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
      navigate(profile.role === 'Institution' ? '/institution' : '/dashboard');
    }
  }, [profile, loading, navigate]);

  if (loading || !profile) return null;

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
      isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2'}`;

  return (
    <div className="flex min-h-screen bg-ground text-ink">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-rule bg-surface p-3 md:flex">
        <div className="flex items-center gap-2.5 px-2 py-3">
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
          <span className="leading-tight">
            <span className="block font-serif text-[15px] font-medium text-ink">Studio</span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-faint">The blog</span>
          </span>
        </div>

        <nav className="mt-4 space-y-1">
          <NavLink to="/studio" end className={link}><FileText size={16} /> Posts</NavLink>
          <NavLink to="/studio/new" className={link}><PenLine size={16} /> Write a post</NavLink>
        </nav>

        <div className="mt-auto space-y-1 border-t border-rule pt-3">
          <a href="/blog" target="_blank" rel="noreferrer"
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink-2 hover:bg-surface-2">
            <ExternalLink size={16} /> See the blog
          </a>
          <button onClick={() => { logout(); navigate('/'); }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] text-alarm hover:bg-alarm-soft">
            <LogOut size={16} /> Sign out
          </button>
          <p className="px-3.5 pt-2 text-[11px] text-faint">
            {profile.displayName || profile.email}
            <span className="block text-[10px] uppercase tracking-wide">Editor</span>
          </p>
        </div>
      </aside>

      {/* On a phone the rail becomes a strip along the top. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-rule bg-surface px-4 py-2 md:hidden">
          <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
          <NavLink to="/studio" end className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink-2">Posts</NavLink>
          <NavLink to="/studio/new" className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink-2">Write</NavLink>
          <button onClick={() => { logout(); navigate('/'); }} className="ml-auto text-[13px] font-semibold text-alarm">Sign out</button>
        </div>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
