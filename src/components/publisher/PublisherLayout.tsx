import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { LogOut, Building2 } from 'lucide-react';

export function PublisherLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { profile, logout, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!profile) navigate('/login');
      else if (profile.role !== 'Publisher' && profile.role !== 'SuperAdmin') {
        toast.error('Unauthorized — Publisher access only');
        navigate('/dashboard');
      }
    }
  }, [profile, loading, navigate]);

  const signOut = async () => {
    try { await logout(); navigate('/login'); } catch { toast.error('Failed to sign out'); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl"><Building2 size={20} /></div>
            <div>
              <p className="font-bold leading-tight">Publisher Portal</p>
              <p className="text-[11px] text-slate-400">STM Digital Library</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300 hidden sm:block">{profile?.displayName || profile?.email}</span>
            <button onClick={signOut} className="inline-flex items-center gap-2 text-sm font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
