import React, { useState, useEffect } from 'react';
import {
  LayoutGrid, Users, LogOut, ChevronLeft, Menu, CreditCard, Bell, Briefcase, Globe,
  Book, BookOpen, Newspaper, FileText, GraduationCap, Users2, Video, Mail,
  ChevronDown, ChevronRight, UserPlus, ShieldCheck, Handshake, MessageSquare, MessageSquareHeart, Tag, PlayCircle, Receipt, ReceiptText, Trash2, Database, Activity, Building2, ClipboardCheck, Image as ImageIcon
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
  const [newInquiriesCount, setNewInquiriesCount] = useState(0);
  const [newDemoRequestsCount, setNewDemoRequestsCount] = useState(0);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role !== 'SuperAdmin') {
        toast.error('Unauthorized access');
        if (profile.role === 'Institution') navigate('/institution');
        else if (profile.role === 'SubscriptionManager') navigate('/manager');
        else navigate('/dashboard');
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
          <div className="flex items-center gap-2.5 font-extrabold tracking-tight">
            <img src="/logo.png" alt="STM Logo" className="h-8 w-8 object-contain" />
            {isSidebarOpen && <span className="text-base">STM ADMIN</span>}
          </div>
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

          {/* Media Library */}
          <NavButton
            icon={<ImageIcon size={17} />}
            label="Media"
            active={location.pathname.startsWith('/admin/media')}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/media')}
            highlight
          />

          {/* AI Extractor */}
          <NavButton
            icon={<Database size={17} />}
            label="AI Extractor"
            active={location.pathname.startsWith('/admin/extraction')}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/extraction')}
            highlight
          />

          {/* Users */}
          <NavButton
            icon={<Users size={17} />}
            label="Users"
            active={location.pathname === '/admin/users'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/users')}
          />

          {/* Sales CRM */}
          <div className="pt-2 pb-1">
            <p className={`px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${!isSidebarOpen && 'hidden'}`}>Sales CRM</p>
          </div>
          <NavButton
            icon={<Users2 size={17} />}
            label="Lead Master"
            active={location.pathname === '/admin/leads'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/leads')}
            highlight
          />
          <NavButton
            icon={<Briefcase size={17} />}
            label="Sales Team"
            active={location.pathname === '/admin/sales-team'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/sales-team')}
          />

          {/* User Feedbacks */}
          <NavButton
            icon={<MessageSquareHeart size={17} />}
            label="User Feedbacks"
            active={location.pathname === '/admin/feedbacks'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/feedbacks')}
            highlight
          />

          {/* Create User */}
          <NavButton
            icon={<UserPlus size={17} />}
            label="Create User"
            active={location.pathname === '/admin/users/create'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/users/create')}
            highlight
          />

          {/* Email Verifications */}
          <NavButton
            icon={<Mail size={17} />}
            label="Email Verifications"
            active={location.pathname === '/admin/email-verifications'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/email-verifications')}
          />

          {/* Email Settings */}
          <NavButton
            icon={<Globe size={17} />}
            label="Email & SMTP"
            active={location.pathname === '/admin/email-settings'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/email-settings')}
          />

          <NavButton
            icon={<Activity size={17} />}
            label="Traffic Analytics"
            active={location.pathname === '/admin/analytics'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/analytics')}
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

          {/* Data Ingestion */}
          <NavButton
            icon={<Database size={17} />}
            label="Data Ingestion"
            active={location.pathname === '/admin/ingestion'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/ingestion')}
          />

          {/* Publishers */}
          <NavButton
            icon={<Building2 size={17} />}
            label="Publishers"
            active={location.pathname === '/admin/publishers'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/publishers')}
          />

          {/* Content Review */}
          <NavButton
            icon={<ClipboardCheck size={17} />}
            label="Content Review"
            active={location.pathname === '/admin/review'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/review')}
          />

          {/* Receipts */}
          <NavButton
            icon={<ReceiptText size={17} />}
            label="Receipts"
            active={location.pathname === '/admin/receipts'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/receipts')}
          />

          {/* Payments */}
          <NavButton
            icon={<Receipt size={17} />}
            label="Payments"
            active={location.pathname === '/admin/payments'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/payments')}
          />

          {/* System Validator */}
          <NavButton
            icon={<ShieldCheck size={17} />}
            label="System Validator"
            active={location.pathname === '/admin/validator'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/validator')}
          />

          {/* Drafts & Cleanup */}
          <NavButton
            icon={<Trash2 size={17} />}
            label="Drafts & Cleanup"
            active={location.pathname === '/admin/drafts'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/drafts')}
          />

          {/* Agency Inquiries */}
          <NavButton
            icon={<Handshake size={17} />}
            label="Agency Inquiries"
            active={location.pathname === '/admin/agency-inquiries'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/agency-inquiries')}
          />

          {/* Contact Inquiries */}
          <NavButton
            icon={<MessageSquare size={17} />}
            label="Contact Inquiries"
            active={location.pathname === '/admin/contact-inquiries'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/contact-inquiries')}
            badge={newInquiriesCount > 0 ? newInquiriesCount : undefined}
          />

          {/* Demo Requests */}
          <NavButton
            icon={<PlayCircle size={17} />}
            label="Demo Requests"
            active={location.pathname === '/admin/demo-requests'}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/demo-requests')}
            badge={newDemoRequestsCount > 0 ? newDemoRequestsCount : undefined}
          />

          {/* Coupons */}
          <NavButton
            icon={<Tag size={17} />}
            label="Coupons"
            active={location.pathname.startsWith('/admin/coupons')}
            collapsed={!isSidebarOpen}
            onClick={() => navigate('/admin/coupons')}
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
        <header className="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-8 shrink-0">
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
              : location.pathname === '/admin/email-verifications' ? 'Email Verifications'
              : location.pathname === '/admin/email-settings' ? 'SMTP & Email Configuration'
              : location.pathname === '/admin/payments' ? 'Payments'
              : location.pathname.startsWith('/admin/extraction') ? 'AI Extraction Engine'
              : location.pathname.startsWith('/admin/coupons') ? 'Coupons'
              : location.pathname === '/admin/sales-team' ? 'Sales Team'
              : location.pathname === '/admin/leads' ? 'Lead Master'
              : location.pathname.startsWith('/admin/sales-team/') ? 'Executive Pipeline'
              : 'Dashboard')}
          </h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavButton({ icon, label, active, collapsed, onClick, danger = false, highlight = false, badge }: {
  icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; danger?: boolean; highlight?: boolean; badge?: number;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        active ? 'bg-blue-600 text-white'
        : danger ? 'text-red-400 hover:bg-red-500/10'
        : highlight ? 'text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300'
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
      } ${collapsed && 'justify-center'}`}
      title={collapsed ? label : undefined}
    >
      <div className="shrink-0 relative">
        {icon}
        {collapsed && badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-[9px] text-white w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
      {!collapsed && badge && badge > 0 && (
        <span className="bg-red-500 text-[10px] text-white rounded-full px-1.5 py-0.5 font-bold min-w-[18px] text-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
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
