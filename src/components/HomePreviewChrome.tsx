import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown, Facebook, LayoutGrid, Linkedin, LogOut, Mail, MapPin, Menu, Phone, X,
} from 'lucide-react';
import { DOMAINS } from '../constants';

// The departments menu lists them A to Z, so a visitor can find theirs at a glance.
const DEPARTMENTS_AZ = [...DOMAINS].sort((a, b) => a.name.localeCompare(b.name));
import { COMPANY_DETAILS } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { getDashboardRoute } from '../lib/dashboardRoute';
import { usePublisherSafeMode } from '../lib/publicSettings';
import { HeaderSearch } from './GlobalSearch';
import { ThemeToggle } from './ui/ThemeToggle';

/**
 * The header and footer for the home page and the pages that belong with it,
 * drawn in the same language as the page: the dashboards' tokens and the one
 * typeface, with tabular figures for the counts.
 *
 * They carry exactly what the site's own header and footer carry — the same
 * links, the same departments, the same search, the same sign-in states and the
 * same company details — so the only thing under review is how it looks. Two
 * things were left out on purpose: the Twitter and YouTube icons, whose links
 * pointed nowhere.
 */

const n = (x: number) => x.toLocaleString('en-IN');

/** Department totals, counted the way the department pages count them. */
function useDepartmentTotals() {
  const [totals, setTotals] = useState<{ byName: Record<string, number>; total: number; count: number } | null>(null);
  useEffect(() => {
    fetch('/api/library/stats')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!Array.isArray(d?.departmentTotals) || typeof d.total !== "number" || !Number.isFinite(d.total) || d.total < 0) return;
        if (!d.departmentTotals.every((row: any) => typeof row.name === "string" && typeof row.total === "number" && Number.isFinite(row.total) && row.total >= 0)) return;
        const byName: Record<string, number> = {};
        for (const row of d.departmentTotals) byName[row.name] = row.total;
        setTotals({ byName, total: d.total, count: d.departmentTotals.length });
      })
      .catch(() => {});
  }, []);
  return totals;
}

/** Close a popover on Escape and on a click outside it. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, close, ref]);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <img src="/logo.png" alt="STM Digital Library" className={`shrink-0 object-contain ${compact ? 'h-8 w-8' : 'h-9 w-9'}`} />
      <span className="leading-none">
        <span className="block whitespace-nowrap text-[16px] font-semibold tracking-tight text-ink sm:text-[17px]">STM Digital Library</span>
      </span>
    </Link>
  );
}

// The current page is marked by a 2px rule under it as well as by darker text,
// and hover draws the same rule, so nothing moves and nothing depends on colour.
const navBase =
  "relative flex h-full items-center whitespace-nowrap text-[14px] font-medium transition-colors duration-150 " +
  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:bg-accent after:transition-transform after:duration-200 " +
  "hover:text-accent focus-visible:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent";
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${navBase} ${isActive ? 'text-ink after:scale-x-100' : 'text-ink-2 after:scale-x-0 hover:after:scale-x-100'}`;

export function PreviewHeader() {
  const safeMode = usePublisherSafeMode();
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const totals = useDepartmentTotals();

  const [deptOpen, setDeptOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileDepts, setMobileDepts] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setDeptOpen(false);
    setSearchOpen(false);
    setMenuOpen(false);
    setProfileOpen(false);
    setMobileDepts(false);
  }, [pathname, search]);

  // The open menu covers the page, so the page behind it must not scroll, and
  // Escape closes it the way it closes every other overlay here.
  useEffect(() => {
    if (!menuOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const deptRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  useDismiss(deptOpen, () => setDeptOpen(false), deptRef);
  useDismiss(profileOpen, () => setProfileOpen(false), profileRef);

  const dashboardPath = getDashboardRoute(profile);
  const initials = (user?.displayName || user?.email || '?').trim().slice(0, 2).toUpperCase();

  const signOut = () => { logout(); navigate('/'); setProfileOpen(false); setMenuOpen(false); };

  return (
    <header className={`sticky top-0 z-50 border-b border-rule bg-surface transition-shadow duration-200 ${scrolled ? 'shadow-[0_1px_8px_rgba(15,23,42,0.06)]' : ''}`}>
      <div className="container-public flex h-16 items-center gap-3 xl:gap-6">
        <Brand />

        {/* Primary navigation */}
        <nav className="hidden h-full flex-1 items-center justify-center gap-5 xl:flex 2xl:gap-7" aria-label="Main">
          <NavLink to="/" end className={navLinkClass}>Home</NavLink>
          <NavLink to="/about" className={navLinkClass}>About</NavLink>
          <NavLink to="/for-institutions" className={navLinkClass}>For Institutions</NavLink>
          <NavLink to="/for-students" className={navLinkClass}>For Researchers</NavLink>

          <div ref={deptRef} className="relative h-full" onMouseLeave={() => setDeptOpen(false)}>
            <button type="button" aria-expanded={deptOpen} aria-haspopup="true"
              onClick={() => setDeptOpen(o => !o)} onMouseEnter={() => setDeptOpen(true)}
              className={`${navBase} gap-1 ${deptOpen || pathname.startsWith('/domain/') || pathname.startsWith('/digital-library') ? 'text-ink after:scale-x-100' : 'text-ink-2 after:scale-x-0 hover:after:scale-x-100'}`}>
              Departments <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-150 ${deptOpen ? 'rotate-180' : ''}`} />
            </button>
            {deptOpen && (
              <div className="absolute left-1/2 top-full z-50 w-[min(880px,calc(100vw-2.5rem))] -translate-x-1/2 pt-0">
                <div className="rounded-xl border border-rule bg-surface p-5 shadow-[var(--shadow-pop)]">
                  <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
                      Departments {totals ? `· ${n(totals.total)} items across ${totals.count}` : ''}
                    </p>
                    <Link to="/digital-library" onClick={() => setDeptOpen(false)}
                      className="font-mono text-[10.5px] uppercase tracking-wider text-accent hover:underline">View all →</Link>
                  </div>
                  <div className="grid max-h-[60vh] grid-cols-3 gap-x-5 gap-y-0.5 overflow-y-auto">
                    {DEPARTMENTS_AZ.map(d => {
                      const count = totals?.byName[d.name];
                      return (
                        <Link key={d.id} to={`/domain/${d.id}`} onClick={() => setDeptOpen(false)}
                          className="flex items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-accent focus-visible:bg-surface-2 focus-visible:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                          <span className="truncate">{d.name}</span>
                          {typeof count === 'number' && count > 0 && (
                            <span className="tnum shrink-0 font-mono text-[11px] text-faint">{n(count)}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {!safeMode && <NavLink to="/faq" className={navLinkClass}>FAQ</NavLink>}
          <NavLink to="/blog" className={navLinkClass}>Blog</NavLink>
          <NavLink to="/contact" className={navLinkClass}>Contact</NavLink>
        </nav>

        {/* Search and account */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 xl:ml-0">
          {!safeMode && (
            <HeaderSearch
              open={searchOpen}
              onOpenChange={open => { if (open) setMenuOpen(false); setSearchOpen(open); }}
            />
          )}

          <ThemeToggle className="btn btn-ghost btn-icon" size={18} />

          {user ? (
            <div ref={profileRef} className="relative hidden xl:block">
              <button type="button" onClick={() => setProfileOpen(o => !o)} aria-expanded={profileOpen}
                aria-haspopup="menu"
                className="flex h-10 items-center gap-2 rounded-lg border border-rule bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[10.5px] font-bold text-accent">{initials}</span>
                <span className="max-w-[110px] truncate">{user.displayName || 'Account'}</span>
                <ChevronDown size={13} aria-hidden="true" className={`text-muted transition-transform duration-150 ${profileOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileOpen && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-rule bg-surface py-1.5 shadow-[var(--shadow-pop)]">
                  <Link to={dashboardPath} role="menuitem" onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink focus-visible:outline-none">
                    <LayoutGrid size={15} aria-hidden="true" /> Dashboard
                  </Link>
                  <div className="my-1 border-t border-rule" />
                  <button type="button" role="menuitem" onClick={signOut}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-alarm hover:bg-alarm-soft focus-visible:bg-alarm-soft focus-visible:outline-none">
                    <LogOut size={15} aria-hidden="true" /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 xl:flex">
              <Link to="/login" className="btn btn-ghost">Log in</Link>
              <Link to="/signup" className="btn btn-brand">Register Now</Link>
            </div>
          )}

          <button type="button" onClick={() => { setSearchOpen(false); setMenuOpen(o => !o); }} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-surface-2 xl:hidden">
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Phone and tablet menu */}
      {menuOpen && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto overscroll-contain border-t border-rule bg-surface px-4 pb-8 pt-2 sm:px-6 xl:hidden">
          <nav className="mx-auto flex max-w-2xl flex-col" aria-label="Main menu">
            {[
              ['/', 'Home'], ['/about', 'About'], ['/for-institutions', 'For Institutions'],
              ['/for-students', 'For Students & Researchers'],
            ].map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `flex min-h-11 items-center border-b border-rule py-3 text-[15px] ${isActive ? 'font-semibold text-accent' : 'text-ink'}`}>{label}</NavLink>
            ))}
            <button type="button" onClick={() => setMobileDepts(o => !o)} aria-expanded={mobileDepts}
              className="flex min-h-11 items-center justify-between border-b border-rule py-3 text-left text-[15px] text-ink">
              Departments <ChevronDown size={17} aria-hidden="true" className={`text-muted transition-transform duration-200 ${mobileDepts ? 'rotate-180' : ''}`} />
            </button>
            {mobileDepts && (
              <div className="border-b border-rule py-2">
                <Link to="/digital-library" onClick={() => setMenuOpen(false)}
                  className="block py-2 font-mono text-[11px] uppercase tracking-wider text-accent">View all departments</Link>
                {DEPARTMENTS_AZ.map(d => (
                  <Link key={d.id} to={`/domain/${d.id}`} onClick={() => setMenuOpen(false)}
                    className="flex min-h-10 items-center justify-between gap-3 py-2 text-[14px] text-ink-2">
                    <span className="min-w-0 break-words">{d.name}</span>
                    {totals?.byName[d.name] ? <span className="tnum font-mono text-[11px] text-faint">{n(totals.byName[d.name])}</span> : null}
                  </Link>
                ))}
              </div>
            )}
            {!safeMode && <NavLink to="/faq" onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex min-h-11 items-center border-b border-rule py-3 text-[15px] ${isActive ? 'font-semibold text-accent' : 'text-ink'}`}>FAQ</NavLink>}
            <NavLink to="/blog" onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex min-h-11 items-center border-b border-rule py-3 text-[15px] ${isActive ? 'font-semibold text-accent' : 'text-ink'}`}>Blog</NavLink>
            <NavLink to="/contact" onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex min-h-11 items-center border-b border-rule py-3 text-[15px] ${isActive ? 'font-semibold text-accent' : 'text-ink'}`}>Contact</NavLink>
          </nav>
          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            {user ? (
              <>
                <Link to={dashboardPath} onClick={() => setMenuOpen(false)}
                  className="btn btn-outline btn-lg"><LayoutGrid size={16} aria-hidden="true" /> Dashboard</Link>
                <button type="button" onClick={signOut}
                  className="btn btn-outline btn-lg text-alarm"><LogOut size={16} aria-hidden="true" /> Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMenuOpen(false)} className="btn btn-outline btn-lg">Log in</Link>
                <Link to="/signup" onClick={() => setMenuOpen(false)} className="btn btn-brand btn-lg">Register Now</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function PreviewFooter() {
  const totals = useDepartmentTotals();
  const year = new Date().getFullYear();
  // "Live" is claimed only while the catalogue is actually answering.
  //
  // The exact total is deliberately not printed here. The backend agrees with itself (stats,
  // insights and public/counts all say the same number), but /digital-library still carries a
  // hand-typed "30,000+", so a precise figure in the footer would contradict a page one click away.
  // TODO: print the count again once that hardcoded figure is replaced with the live one.
  const catalogueLive = totals !== null;

  const colLabel = 'text-[12px] font-semibold uppercase tracking-[0.12em] text-muted';
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const linkClass = `inline-flex min-h-8 items-center rounded text-[14px] text-ink-2 transition-colors hover:text-accent focus-visible:text-accent ${focus}`;
  const socialClass = `flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-surface text-ink-2 transition-colors hover:border-accent hover:bg-accent hover:text-surface ${focus}`;
  const rowIcon = 'h-4 w-4 shrink-0 text-accent';

  const social = [
    { name: 'Facebook', href: COMPANY_DETAILS.social.facebook, Icon: Facebook },
    { name: 'LinkedIn', href: COMPANY_DETAILS.social.linkedin, Icon: Linkedin },
  ].filter(s => s.href);

  return (
    <footer className="border-t border-rule bg-surface">
      <div className="container-public grid grid-cols-1 items-start gap-8 pb-8 pt-9 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1.6fr)_auto_auto_minmax(14rem,1.4fr)] lg:gap-x-12">
        <div className="min-w-0">
          <Link to="/" className={`inline-flex items-center gap-3 rounded ${focus}`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-rule bg-surface p-1.5">
              <img src="/logo.png" alt="" className="h-full w-full object-contain" />
            </span>
            <span className="text-[19px] font-semibold leading-tight tracking-tight text-ink">{COMPANY_DETAILS.name}</span>
          </Link>
          <p className="mt-2.5 text-[13px] text-muted lg:whitespace-nowrap">Operated by {COMPANY_DETAILS.operatorDisplayName}</p>
          <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-ink-2">
            An academic discovery and access platform for journals, books, research literature and learning resources.
          </p>
          {social.length > 0 && (
            <div className="mt-4 flex gap-2.5">
              {social.map(({ name, href, Icon }) => (
                <a key={name} href={href} target="_blank" rel="noopener noreferrer"
                  aria-label={`${COMPANY_DETAILS.name} on ${name} (opens in a new tab)`} title={name} className={socialClass}>
                  <Icon size={16} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>

        <nav aria-label="Explore">
          <p className={colLabel}>Explore</p>
          <ul className="mt-3 space-y-0.5">
            <li><Link to="/" className={linkClass}>Home</Link></li>
            <li><Link to="/digital-library" className={linkClass}>Journals</Link></li>
            <li><Link to="/for-institutions" className={linkClass}>For Institutions</Link></li>
            <li><Link to="/for-students" className={linkClass}>For Students &amp; Researchers</Link></li>
            <li><Link to="/about" className={linkClass}>About Us</Link></li>
            <li><Link to="/contact" className={linkClass}>Contact Us</Link></li>
          </ul>
        </nav>

        <nav aria-label="Trust, policies and support">
          <p className={colLabel}>Trust, Policies &amp; Support</p>
          <ul className="mt-3 space-y-0.5">
            <li><Link to="/content-sources" className={linkClass}>Content Sources</Link></li>
            <li><Link to="/privacy-policy" className={linkClass}>Privacy Policy</Link></li>
            <li><Link to="/terms-and-conditions" className={linkClass}>Terms &amp; Conditions</Link></li>
            <li><Link to="/content-removal" className={linkClass}>Content Removal</Link></li>
            <li><Link to="/faq" className={linkClass}>FAQs</Link></li>
            <li><Link to="/legal-disclaimer" className={linkClass}>Legal Disclaimer</Link></li>
          </ul>
        </nav>

        <div className="min-w-0">
          <p className={colLabel}>Contact</p>
          <ul className="mt-3 space-y-3 text-[14px] text-ink-2">
            <li className="flex gap-3">
              <MapPin className={`${rowIcon} mt-[3px]`} aria-hidden="true" />
              <span className="leading-relaxed">
                <span className="block text-[12px] font-semibold text-muted">{COMPANY_DETAILS.salesOfficeLabel}</span>
                {COMPANY_DETAILS.address}
              </span>
            </li>
            <li className="flex gap-3">
              <Phone className={`${rowIcon} mt-2`} aria-hidden="true" />
              <span className="flex flex-wrap gap-x-3 gap-y-0">
                {COMPANY_DETAILS.tel.map((t: string) => (
                  <a key={t} href={`tel:${t.replace(/[^\d+]/g, '')}`} className={`tnum inline-flex min-h-8 items-center whitespace-nowrap rounded hover:text-accent focus-visible:text-accent ${focus}`}>{t}</a>
                ))}
              </span>
            </li>
            <li className="flex gap-3">
              <Mail className={`${rowIcon} mt-2`} aria-hidden="true" />
              {/* TODO: OFFICIAL_CONTACT_EMAIL_CONFIRMATION — see COMPANY_DETAILS.email. Existing contact
                  column only; this address must not be copied into any new trust or company block. */}
              <a href={`mailto:${COMPANY_DETAILS.email}`} className={`inline-flex min-h-8 items-center break-all rounded hover:text-accent focus-visible:text-accent ${focus}`}>{COMPANY_DETAILS.email}</a>
            </li>
          </ul>
        </div>
      </div>

      {/* One row. The right padding keeps it clear of the floating WhatsApp button. */}
      <div className="border-t border-rule">
        <div className="container-public flex flex-col gap-1 py-3 pr-20 sm:flex-row sm:items-center sm:justify-between sm:pr-24">
          <p className="text-[12px] text-ink-2">© {year} {COMPANY_DETAILS.name}. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
            {catalogueLive && (
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="font-semibold text-success">Catalogue live</span>
              </span>
            )}
            <Link to="/admin" className={`inline-flex min-h-8 items-center rounded text-muted hover:text-accent focus-visible:text-accent ${focus}`}>Admin Login</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
