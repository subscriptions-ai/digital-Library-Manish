import React, { useState, useEffect } from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Bell, Handshake, MessageSquare, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { getDashboardRoute } from '../../lib/dashboardRoute';
import { AdminSidebar, CONTENT_MODULES } from './AdminSidebar';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout, loading } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [newInquiriesCount, setNewInquiriesCount] = useState(0);
  const [openTakedownCount, setOpenTakedownCount] = useState(0);
  const [newDemoRequestsCount, setNewDemoRequestsCount] = useState(0);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role !== 'SuperAdmin') {
        toast.error('Unauthorized access');
        navigate(getDashboardRoute(profile), { replace: true });
      } else {
        // fetch pending subscription requests count for badge
        fetch('/api/admin/subscription-requests?status=Pending', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()).then(data => {
          if (Array.isArray(data)) setPendingCount(data.length);
        }).catch(() => {});
        fetch('/api/admin/contact-inquiries?status=New', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()).then(data => {
          if (Array.isArray(data)) setNewInquiriesCount(data.length);
        }).catch(() => {});
        fetch('/api/admin/demo-requests', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()).then(data => {
          if (Array.isArray(data)) setNewDemoRequestsCount(data.filter((d: any) => d.status === 'Pending').length);
        }).catch(() => {});
        fetch('/api/admin/takedown-requests', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()).then(data => {
          if (data && typeof data.openCount === 'number') setOpenTakedownCount(data.openCount);
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
      <div className="min-h-screen bg-slate-50 dark:bg-ground flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="app-type min-h-screen bg-slate-50 dark:bg-ground flex">
      <AdminSidebar
        name={profile.displayName}
        role={profile.role}
        badges={{
          pendingSubscriptions: pendingCount,
          newInquiries: newInquiriesCount,
          openTakedowns: openTakedownCount,
          newDemoRequests: newDemoRequestsCount,
        }}
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 h-14 flex items-center justify-between gap-3 px-4 md:px-8 shrink-0">
          <h1 className="text-base font-bold text-slate-800">
            {CONTENT_MODULES.find(m => location.pathname.startsWith(`/admin/${m.slug}`))?.name
              || (location.pathname === '/admin/subscription-requests' ? 'Subscription Requests'
              : location.pathname === '/admin/subscriptions' ? 'Subscriptions'
              : location.pathname === '/admin/users/create' ? 'Create User'
              : location.pathname === '/admin/users' ? 'Users'
              : location.pathname.startsWith('/admin/media') ? 'Media Library'
              : location.pathname === '/admin/validator' ? 'System Validator'
              : location.pathname === '/admin/drafts' ? 'Drafts & Cleanup'
              : location.pathname === '/admin/agency-inquiries' ? 'Agency Inquiries'
              : location.pathname === '/admin/contact-inquiries' ? 'Contact Inquiries'
              : location.pathname === '/admin/takedown' ? 'Content Removal Requests'
              : location.pathname === '/admin/email-verifications' ? 'Email Verifications'
              : location.pathname === '/admin/email-settings' ? 'SMTP & Email Configuration'
              : location.pathname === '/admin/ai-assistant' ? 'AI Assistant'
              : location.pathname === '/admin/account' ? 'My Account'
              : location.pathname === '/admin/payments' ? 'Payments'
              : location.pathname.startsWith('/admin/extraction') ? 'AI Extraction Engine'
              : location.pathname.startsWith('/admin/coupons') ? 'Coupons'
              : location.pathname === '/admin/sales-team' ? 'Sales Team'
              : location.pathname === '/admin/campaigns' ? 'Campaigns'
            : location.pathname === '/admin/leads' ? 'Lead Master'
              : location.pathname.startsWith('/admin/sales-team/') ? 'Executive Pipeline'
              : 'Dashboard')}
          </h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <ThemeToggle className="btn btn-ghost btn-icon btn-sm" />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50">
          {children}
        </div>
      </main>
    </div>
  );
}

function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>({ total: 0, messages: [], reviewCount: 0, recentAgreements: [] });
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const r = await fetch('/api/admin/notifications', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (r.ok) setData(await r.json());
    } catch { /* ignore */ }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const close = () => setOpen(false);
    if (open) { window.addEventListener('click', close); return () => window.removeEventListener('click', close); }
  }, [open]);

  const go = (path: string) => { setOpen(false); navigate(path); };
  const total = data.total || 0;

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={() => { setOpen(o => !o); load(); }}
        className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
        <Bell size={19} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-[9px] text-white min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[80] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Notifications</span>
            {total > 0 && <span className="text-[11px] font-bold text-red-500">{total} new</span>}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {total === 0 && (data.recentAgreements || []).length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up 🎉</div>
            )}

            {(data.messages || []).map((m: any) => (
              <button key={m.publisherId} onClick={() => go('/admin/publishers')} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3">
                <MessageSquare size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{m.publisherName} <span className="text-emerald-600">· {m.count} new message{m.count > 1 ? 's' : ''}</span></div>
                  <div className="text-[12px] text-slate-500 truncate">{m.preview}</div>
                </div>
              </button>
            ))}

            {data.reviewCount > 0 && (
              <button onClick={() => go('/admin/review')} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3">
                <ClipboardCheck size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div><div className="text-sm font-semibold text-slate-800">{data.reviewCount} item{data.reviewCount > 1 ? 's' : ''} awaiting review</div>
                  <div className="text-[12px] text-slate-500">Publisher submissions pending approval</div></div>
              </button>
            )}

            {(data.recentAgreements || []).map((a: any, i: number) => (
              <button key={i} onClick={() => go('/admin/publishers')} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3">
                <Handshake size={16} className={`mt-0.5 shrink-0 ${a.status === 'Accepted' ? 'text-emerald-600' : 'text-red-500'}`} />
                <div><div className="text-sm font-semibold text-slate-800">{a.publisherName} {a.status === 'Accepted' ? 'signed' : 'declined'} an agreement</div>
                  <div className="text-[12px] text-slate-500 truncate">{a.title}</div></div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
