import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid, Users, LogOut, KeyRound, CreditCard, Briefcase, Globe,
  Book, BookOpen, Newspaper, FileText, GraduationCap, Users2, Video, Mail,
  ChevronDown, UserPlus, ShieldCheck, PenLine, Handshake, MessageSquare, MessageSquareHeart, Tag, PlayCircle,
  Receipt, ReceiptText, Trash2, Database, Activity, Building2, ClipboardCheck, Image as ImageIcon, ShieldAlert,
  Megaphone, Bot, IndianRupee, PanelLeftClose, PanelLeftOpen, type LucideIcon,
} from 'lucide-react';
import './adminSidebar.css';

/* The rail's look in the light theme: 'light' is the white rail, 'ink' the
   near-black one the dark theme always uses. */
export const SIDEBAR_LIGHT_VARIANT: 'light' | 'ink' = 'light';

export const CONTENT_MODULES: { name: string; slug: string; icon: LucideIcon }[] = [
  { name: 'Books',                  slug: 'books',                   icon: Book },
  { name: 'Periodicals',            slug: 'periodicals',              icon: BookOpen },
  { name: 'Magazines',              slug: 'magazines',                icon: Newspaper },
  { name: 'Case Reports',           slug: 'case-reports',             icon: FileText },
  { name: 'Theses',                 slug: 'theses',                   icon: GraduationCap },
  { name: 'Conference Proceedings', slug: 'conference-proceedings',   icon: Users2 },
  { name: 'Educational Videos',     slug: 'educational-videos',       icon: Video },
  { name: 'Newsletters',            slug: 'newsletters',              icon: Mail },
];

export type AdminBadgeKey = 'pendingSubscriptions' | 'newInquiries' | 'openTakedowns' | 'newDemoRequests';

type Match = 'exact' | 'prefix';
interface NavLink { kind?: 'link'; label: string; path: string; icon: LucideIcon; match?: Match; badge?: AdminBadgeKey }
interface NavChild { label: string; path: string; icon?: LucideIcon; match?: Match; badge?: AdminBadgeKey }
interface NavGroup { kind: 'group'; id: string; label: string; icon: LucideIcon; activePrefix?: string; badge?: AdminBadgeKey; children: NavChild[] }
interface NavSection { id: string; label: string | null; items: (NavLink | NavGroup)[] }

const SECTIONS: NavSection[] = [
  { id: 'home', label: null, items: [
    { label: 'Dashboard', path: '/admin', icon: LayoutGrid },
  ] },
  { id: 'library', label: 'Library', items: [
    { kind: 'group', id: 'content', label: 'Content', icon: BookOpen,
      children: CONTENT_MODULES.map(m => ({ label: m.name, path: `/admin/${m.slug}`, icon: m.icon, match: 'prefix' as const })) },
    { label: 'Journals', path: '/admin/journals', icon: BookOpen },
    { label: 'Publishers', path: '/admin/publishers', icon: Building2 },
    { label: 'Content Review', path: '/admin/review', icon: ClipboardCheck },
    { label: 'Media', path: '/admin/media', icon: ImageIcon, match: 'prefix' },
    { label: 'AI Extractor', path: '/admin/extraction', icon: Database, match: 'prefix' },
    { label: 'Data Ingestion', path: '/admin/ingestion', icon: Database },
    { label: 'Drafts & Cleanup', path: '/admin/drafts', icon: Trash2 },
  ] },
  { id: 'users', label: 'Users', items: [
    { label: 'Users', path: '/admin/users', icon: Users },
    { label: 'Create User', path: '/admin/users/create', icon: UserPlus },
    { label: 'Email Verifications', path: '/admin/email-verifications', icon: Mail },
    { label: 'User Feedbacks', path: '/admin/feedbacks', icon: MessageSquareHeart },
  ] },
  { id: 'sales', label: 'Sales CRM', items: [
    { label: 'Lead Master', path: '/admin/leads', icon: Users2 },
    { label: 'Campaigns', path: '/admin/campaigns', icon: Megaphone },
    { label: 'Sales Team', path: '/admin/sales-team', icon: Briefcase },
  ] },
  { id: 'inquiries', label: 'Inquiries', items: [
    { label: 'Contact Inquiries', path: '/admin/contact-inquiries', icon: MessageSquare, badge: 'newInquiries' },
    { label: 'Demo Requests', path: '/admin/demo-requests', icon: PlayCircle, badge: 'newDemoRequests' },
    { label: 'Agency Inquiries', path: '/admin/agency-inquiries', icon: Handshake },
    { label: 'Content Removal', path: '/admin/takedown', icon: ShieldAlert, badge: 'openTakedowns' },
  ] },
  { id: 'billing', label: 'Billing', items: [
    { kind: 'group', id: 'subscriptions', label: 'Subscriptions', icon: CreditCard, activePrefix: '/admin/subscription', badge: 'pendingSubscriptions',
      children: [
        { label: 'All Subscriptions', path: '/admin/subscriptions' },
        { label: 'Subscription Requests', path: '/admin/subscription-requests', badge: 'pendingSubscriptions' },
      ] },
    { label: 'Pricing Modules', path: '/admin/pricing', icon: IndianRupee },
    { label: 'Quotations', path: '/admin/quotations', icon: FileText },
    { label: 'Payments', path: '/admin/payments', icon: Receipt },
    { label: 'Receipts', path: '/admin/receipts', icon: ReceiptText },
    { label: 'Coupons', path: '/admin/coupons', icon: Tag, match: 'prefix' },
  ] },
  { id: 'marketing', label: 'Marketing', items: [
    { label: 'Blog', path: '/admin/blog', icon: PenLine },
    { label: 'Emails', path: '/admin/emails', icon: Mail },
  ] },
  { id: 'system', label: 'System', items: [
    { label: 'Traffic Analytics', path: '/admin/analytics', icon: Activity },
    { label: 'AI Assistant', path: '/admin/ai-assistant', icon: Bot },
    { label: 'Email & SMTP', path: '/admin/email-settings', icon: Globe },
    { label: 'System Validator', path: '/admin/validator', icon: ShieldCheck },
  ] },
];

// Sections start open and the two groups closed; whatever the admin opens or
// closes is kept per browser.
const OPEN_KEY = 'stm.admin.sidebar.open';
const RAIL_KEY = 'stm.admin.sidebar.rail';
const DEFAULT_OPEN: Record<string, boolean> = { content: false, subscriptions: false };

const isSmallScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

function readOpen(): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function isActive(pathname: string, path: string, match: Match = 'exact') {
  return match === 'prefix' ? pathname.startsWith(path) : pathname === path;
}

function groupActive(pathname: string, group: NavGroup) {
  return group.activePrefix ? pathname.startsWith(group.activePrefix) : group.children.some(c => isActive(pathname, c.path, c.match));
}

function itemActive(pathname: string, item: NavLink | NavGroup) {
  return item.kind === 'group' ? groupActive(pathname, item) : isActive(pathname, item.path, item.match);
}

const countLabel = (n: number) => (n > 9 ? '9+' : String(n));

interface AdminSidebarProps {
  name?: string | null;
  role?: string | null;
  badges: Record<AdminBadgeKey, number>;
  onSignOut: () => void;
}

export function AdminSidebar({ name, role, badges, onSignOut }: AdminSidebarProps) {
  const location = useLocation();
  const { pathname } = location;
  // On a phone the rail starts folded to icons and opens over the page; on a
  // wider screen it remembers whether it was last folded.
  const [railOpen, setRailOpen] = useState(() => {
    if (isSmallScreen()) return false;
    try { return localStorage.getItem(RAIL_KEY) !== 'collapsed'; } catch { return true; }
  });
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const collapsed = !railOpen;

  const isOpen = (id: string) => open[id] ?? DEFAULT_OPEN[id] ?? true;
  const setOne = (id: string, value: boolean) => setOpen(prev => ({ ...prev, [id]: value }));

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch { /* a convenience, not state */ }
  }, [open]);

  // Going anywhere folds the rail on a small screen, so the page that was asked
  // for is not left hidden behind the menu that asked for it.
  useEffect(() => {
    if (isSmallScreen()) setRailOpen(false);
  }, [location.key]);

  // The section and group holding the current page are always open on arrival.
  useEffect(() => {
    const opened: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      for (const item of section.items) {
        if (!itemActive(pathname, item)) continue;
        if (section.label) opened[section.id] = true;
        if (item.kind === 'group') opened[item.id] = true;
      }
    }
    setOpen(prev => (Object.keys(opened).every(k => prev[k]) ? prev : { ...prev, ...opened }));
  }, [pathname]);

  useEffect(() => { setTip(null); }, [pathname, railOpen]);

  // Escape dismisses a tooltip, or the rail where it lies over the page.
  const dismissible = !!tip || (railOpen && isSmallScreen());
  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setTip(null);
      if (isSmallScreen()) setRailOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible]);

  const toggleRail = () => {
    const next = !railOpen;
    setRailOpen(next);
    if (!isSmallScreen()) {
      try { localStorage.setItem(RAIL_KEY, next ? 'open' : 'collapsed'); } catch { /* a convenience, not state */ }
    }
  };

  const showTip = (el: HTMLElement, label: string) => {
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 8 });
  };
  const tipProps = (label: string | null) => label ? {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, label),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => { if (e.currentTarget.matches(':focus-visible')) showTip(e.currentTarget, label); },
    onBlur: () => setTip(null),
  } : {};

  const count = (key?: AdminBadgeKey) => (key ? badges[key] || 0 : 0);
  const rowTip = (label: string, n: number) => (collapsed ? (n > 0 ? `${label} (${n})` : label) : null);
  const initials = name?.substring(0, 2).toUpperCase() || 'AD';

  const renderRow = (Icon: LucideIcon, label: string, n: number) => (
    <>
      <span className="admin-rail__icon">
        <Icon size={17} aria-hidden="true" />
        {collapsed && n > 0 && <span className="admin-rail__dot">{countLabel(n)}</span>}
      </span>
      <span className={collapsed ? 'sr-only' : 'admin-rail__label'}>{label}</span>
      {!collapsed && n > 0 && <span className="admin-rail__badge">{countLabel(n)}</span>}
    </>
  );

  const renderGroup = (group: NavGroup) => {
    const current = groupActive(pathname, group);
    const expanded = isOpen(group.id);
    const n = count(group.badge);
    return (
      <li key={group.id}>
        <button
          type="button"
          className="admin-rail__item"
          data-has-current={current || undefined}
          aria-current={collapsed && current ? 'true' : undefined}
          aria-expanded={collapsed ? undefined : expanded}
          aria-controls={collapsed ? undefined : `admin-nav-${group.id}`}
          onClick={() => {
            if (collapsed) { setRailOpen(true); setOne(group.id, true); }
            else setOne(group.id, !expanded);
          }}
          {...tipProps(rowTip(group.label, n))}
        >
          {renderRow(group.icon, group.label, n)}
          {!collapsed && <ChevronDown size={14} className="admin-rail__chev" aria-hidden="true" />}
        </button>
        {!collapsed && (
          <div id={`admin-nav-${group.id}`} className="admin-rail__collapse" data-open={expanded}>
            <ul className="admin-rail__list admin-rail__sublist">
              {group.children.map(child => {
                const active = isActive(pathname, child.path, child.match);
                const childCount = active ? 0 : count(child.badge);
                return (
                  <li key={child.path}>
                    <Link to={child.path} className="admin-rail__item admin-rail__subitem" aria-current={active ? 'page' : undefined}>
                      {child.icon && <child.icon size={16} aria-hidden="true" className="shrink-0" />}
                      <span className="admin-rail__label">{child.label}</span>
                      {childCount > 0 && <span className="admin-rail__badge">{countLabel(childCount)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      {railOpen && (
        <>
          {/* Phone only: the page keeps its place behind the open rail, dimmed. */}
          <div className="w-20 shrink-0 md:hidden" aria-hidden="true" />
          <div className="overlay z-40 md:hidden" aria-hidden="true" onClick={() => setRailOpen(false)} />
        </>
      )}

      <aside
        id="admin-sidebar"
        aria-label="Admin sidebar"
        data-variant={SIDEBAR_LIGHT_VARIANT}
        data-collapsed={collapsed || undefined}
        className={`admin-rail shrink-0 ${railOpen
          ? 'w-64 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 md:sticky md:top-0 md:self-start'
          : 'w-20 sticky top-0 self-start'}`}
      >
        <div className="admin-rail__head">
          {railOpen && (
            <Link to="/" className="admin-rail__brand" title="Go to home page">
              <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
              <span>STM ADMIN</span>
            </Link>
          )}
          <button
            type="button"
            className="admin-rail__icon-btn"
            onClick={toggleRail}
            aria-label={railOpen ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={railOpen}
            aria-controls="admin-sidebar-nav"
            {...tipProps(railOpen ? null : 'Expand navigation')}
          >
            {railOpen ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
          </button>
        </div>

        <nav id="admin-sidebar-nav" aria-label="Admin navigation" className="admin-rail__scroll" onScroll={() => setTip(null)}>
          {SECTIONS.map(section => {
            const expanded = collapsed || !section.label || isOpen(section.id);
            return (
              <div key={section.id} className="admin-rail__section">
                {section.label && !collapsed && (
                  <button
                    type="button"
                    className="admin-rail__section-btn"
                    aria-expanded={expanded}
                    aria-controls={`admin-nav-${section.id}`}
                    onClick={() => setOne(section.id, !expanded)}
                  >
                    <span>{section.label}</span>
                    <ChevronDown size={14} className="admin-rail__chev" aria-hidden="true" />
                  </button>
                )}
                {section.label && collapsed && <div className="admin-rail__divider" aria-hidden="true" />}
                <div id={`admin-nav-${section.id}`} className="admin-rail__collapse" data-open={expanded}>
                  <ul className="admin-rail__list" aria-label={section.label ?? undefined}>
                    {section.items.map(item => {
                      if (item.kind === 'group') return renderGroup(item);
                      const active = isActive(pathname, item.path, item.match);
                      const n = count(item.badge);
                      return (
                        <li key={item.path}>
                          <Link
                            to={item.path}
                            className="admin-rail__item"
                            aria-current={active ? 'page' : undefined}
                            {...tipProps(rowTip(item.label, n))}
                          >
                            {renderRow(item.icon, item.label, n)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="admin-rail__foot">
          {railOpen ? (
            <div className="flex items-center gap-2.5">
              <span className="admin-rail__avatar" aria-hidden="true">{initials}</span>
              <div className="min-w-0 flex-1">
                <div className="admin-rail__name truncate">{name || 'Admin User'}</div>
                <div className="admin-rail__role truncate">{role}</div>
              </div>
              <Link
                to="/admin/account"
                className="admin-rail__icon-btn"
                aria-label="My Account"
                aria-current={pathname === '/admin/account' ? 'page' : undefined}
                {...tipProps('My Account')}
              >
                <KeyRound size={16} aria-hidden="true" />
              </Link>
              <button type="button" className="admin-rail__icon-btn admin-rail__icon-btn--danger" aria-label="Sign Out" onClick={onSignOut} {...tipProps('Sign Out')}>
                <LogOut size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Link
                to="/admin/account"
                className="admin-rail__icon-btn"
                aria-label="My Account"
                aria-current={pathname === '/admin/account' ? 'page' : undefined}
                {...tipProps(`My Account · ${name || 'Admin User'}`)}
              >
                <span className="admin-rail__avatar">{initials}</span>
              </Link>
              <button type="button" className="admin-rail__icon-btn admin-rail__icon-btn--danger" aria-label="Sign Out" onClick={onSignOut} {...tipProps('Sign Out')}>
                <LogOut size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {tip && (
          <div role="tooltip" className="admin-rail__tip" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>
        )}
      </aside>
    </>
  );
}
