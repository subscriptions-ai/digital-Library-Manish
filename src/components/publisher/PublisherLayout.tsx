import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { LogOut, Building2 } from 'lucide-react';
import { Spinner } from '../ui';
import { getDashboardRoute } from '../../lib/dashboardRoute';

export function PublisherLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { profile, logout, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!profile) navigate('/login');
      else if (profile.role !== 'Publisher' && profile.role !== 'SuperAdmin') {
        toast.error('Unauthorized — Publisher access only');
        navigate(getDashboardRoute(profile), { replace: true });
      }
    }
  }, [profile, loading, navigate]);

  if (loading || !profile || (profile.role !== 'Publisher' && profile.role !== 'SuperAdmin')) {
    return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;
  }

  const signOut = async () => {
    try { await logout(); navigate('/login'); } catch { toast.error('Failed to sign out'); }
  };

  return (
    <div className="app-type min-h-screen bg-ground">
      <header className="sticky top-0 z-40 bg-surface border-b border-rule">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
          <Link to="/" title="Go to home page" aria-label="Go to the STM Digital Library home page"
            className="flex items-center gap-3 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <div className="h-9 w-9 shrink-0 flex items-center justify-center bg-accent-soft text-accent rounded-lg" aria-hidden="true"><Building2 size={18} /></div>
            <div className="min-w-0">
              <p className="font-bold text-ink leading-tight truncate">Publisher Portal</p>
              <p className="text-xs text-muted truncate">STM Digital Library</p>
            </div>
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-ink-2 hidden sm:block max-w-[220px] truncate">{profile?.displayName || profile?.email}</span>
            <button onClick={signOut} className="btn btn-outline btn-sm" aria-label="Sign Out">
              <LogOut size={16} aria-hidden="true" /> <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
