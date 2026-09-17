import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronDown, Facebook, LayoutGrid, Linkedin, LogOut, Mail, MapPin, Menu, Phone, Search, X,
} from 'lucide-react';
import { DOMAINS } from '../constants';
import { COMPANY_DETAILS } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { usePublisherSafeMode } from '../lib/publicSettings';

/**
 * The header and footer for /home-preview only, drawn in the same language as
 * the page: the dashboards' tokens, a serif for names, mono for figures.
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
        if (!d?.departmentTotals) return;
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
    <Link to="/" className="flex shrink-0 items-center gap-2.5">
      <img src="/logo.png" alt="STM Digital Library" className={compact ? 'h-8 w-8 object-contain' : 'h-9 w-9 object-contain'} />
      <span className="leading-none">
        <span className="font-serif text-[17px] font-medium tracking-tight text-ink">STM Digital Library</span>
      </span>
    </Link>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative py-1 text-[13.5px] transition-colors ${isActive ? 'text-ink' : 'text-ink-2 hover:text-ink'}`;

export function PreviewHeader() {
  const safeMode = usePublisherSafeMode();
  const { user, logout, isAdmin, isInstitutionAdmin, isSubscriptionManager } = useAuth();
  const navigate = useNavigate();
  const totals = useDepartmentTotals();

  const [deptOpen, setDeptOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileDepts, setMobileDepts] = useState(false);
  const [q, setQ] = useState('');

  const deptRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  useDismiss(deptOpen, () => setDeptOpen(false), deptRef);
  useDismiss(searchOpen, () => setSearchOpen(false), searchRef);
  useDismiss(profileOpen, () => setProfileOpen(false), profileRef);

  const dashboardPath = isAdmin ? '/admin' : isInstitutionAdmin ? '/institution' : isSubscriptionManager ? '/manager' : '/dashboard';
  const initials = (user?.displayName || user?.email || '?').trim().slice(0, 2).toUpperCase();

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    navigate(`/search?q=${encodeURIComponent(term)}`);
    setQ(''); setSearchOpen(false); setMenuOpen(false);
  };
  const signOut = () => { logout(); navigate('/'); setProfileOpen(false); setMenuOpen(false); };

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Brand />

        {/* Primary navigation */}
        <nav className="hidden flex-1 items-center justify-center gap-6 lg:flex" aria-label="Main">
          <NavLink to="/" end className={navLinkClass}>Home</NavLink>
          <NavLink to="/about" className={navLinkClass}>About</NavLink>
          <NavLink to="/for-institutions" className={navLinkClass}>For Institutions</NavLink>
          <NavLink to="/for-students" className={navLinkClass}>For Researchers</NavLink>

          <div ref={deptRef} className="relative" onMouseLeave={() => setDeptOpen(false)}>
            <button type="button" aria-expanded={deptOpen} aria-haspopup="true"
              onClick={() => setDeptOpen(o => !o)} onMouseEnter={() => setDeptOpen(true)}
              className="flex items-center gap-1 py-1 text-[13.5px] text-ink-2 hover:text-ink">
              Departments <ChevronDown size={14} className={`transition-transform ${deptOpen ? 'rotate-180' : ''}`} />
            </button>
            {deptOpen && (
              <div className="absolute left-1/2 top-full z-50 w-[880px] -translate-x-1/2 pt-3">
                <div className="rounded-2xl border border-rule bg-surface p-5 shadow-xl">
                  <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
                      Departments {totals ? `· ${n(totals.total)} items across ${totals.count}` : ''}
                    </p>
                    <Link to="/digital-library" onClick={() => setDeptOpen(false)}
                      className="font-mono text-[10.5px] uppercase tracking-wider text-accent hover:underline">View all →</Link>
                  </div>
                  <div className="grid max-h-[60vh] grid-cols-3 gap-x-5 gap-y-0.5 overflow-y-auto">
                    {DOMAINS.map(d => {
                      const count = totals?.byName[d.name];
                      return (
                        <Link key={d.id} to={`/domain/${d.id}`} onClick={() => setDeptOpen(false)}
                          className="flex items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
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
          <NavLink to="/contact" className={navLinkClass}>Contact</NavLink>
        </nav>

        {/* Search and account */}
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {!safeMode && (
            <div ref={searchRef} className="relative hidden sm:block">
              <button type="button" onClick={() => setSearchOpen(o => !o)} aria-label="Search the library" aria-expanded={searchOpen}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
                <Search size={17} />
              </button>
              {searchOpen && (
                <form onSubmit={submitSearch}
                  className="absolute right-0 top-full z-50 mt-2 flex w-[380px] items-center gap-2 rounded-xl border border-rule bg-surface p-1.5 shadow-xl">
                  <Search size={16} className="ml-2 shrink-0 text-faint" />
                  <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                    placeholder="Search articles, books, journals…"
                    className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-faint" />
                  <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent-hover">Search</button>
                </form>
              )}
            </div>
          )}

          {user ? (
            <div ref={profileRef} className="relative hidden lg:block">
              <button type="button" onClick={() => setProfileOpen(o => !o)} aria-expanded={profileOpen}
                className="flex items-center gap-2 rounded-lg border border-rule px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[10.5px] font-bold text-accent">{initials}</span>
                <span className="max-w-[110px] truncate">{user.displayName || 'Account'}</span>
                <ChevronDown size={13} className={`text-muted transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-rule bg-surface py-1.5 shadow-xl">
                  <Link to={dashboardPath} onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <LayoutGrid size={15} /> Dashboard
                  </Link>
                  <button type="button" onClick={signOut}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-alarm hover:bg-alarm-soft">
                    <LogOut size={15} /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Link to="/login" className="rounded-lg px-3 py-2 text-[13.5px] text-ink-2 hover:bg-surface-2 hover:text-ink">Log in</Link>
              <Link to="/signup" className="rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-surface hover:opacity-90">Register Now</Link>
            </div>
          )}

          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-2 lg:hidden">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Phone and tablet menu */}
      {menuOpen && (
        <div className="max-h-[80vh] overflow-y-auto border-t border-rule bg-surface px-5 pb-6 pt-4 lg:hidden">
          {!safeMode && (
            <form onSubmit={submitSearch} className="mb-4 flex items-center gap-2 rounded-xl border border-rule bg-ground p-1.5">
              <Search size={16} className="ml-2 shrink-0 text-faint" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the library…"
                className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-faint" />
              <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white">Search</button>
            </form>
          )}
          <nav className="flex flex-col" aria-label="Main">
            {[
              ['/', 'Home'], ['/about', 'About'], ['/for-institutions', 'For Institutions'],
              ['/for-students', 'For Students & Researchers'],
            ].map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setMenuOpen(false)}
                className="border-b border-rule py-3 text-[15px] text-ink">{label}</Link>
            ))}
            <button type="button" onClick={() => setMobileDepts(o => !o)} aria-expanded={mobileDepts}
              className="flex items-center justify-between border-b border-rule py-3 text-left text-[15px] text-ink">
              Departments <ChevronDown size={17} className={`text-muted transition-transform ${mobileDepts ? 'rotate-180' : ''}`} />
            </button>
            {mobileDepts && (
              <div className="border-b border-rule py-2">
                <Link to="/digital-library" onClick={() => setMenuOpen(false)}
                  className="block py-2 font-mono text-[11px] uppercase tracking-wider text-accent">View all departments</Link>
                {DOMAINS.map(d => (
                  <Link key={d.id} to={`/domain/${d.id}`} onClick={() => setMenuOpen(false)}
                    className="flex items-baseline justify-between py-2 text-[14px] text-ink-2">
                    <span>{d.name}</span>
                    {totals?.byName[d.name] ? <span className="tnum font-mono text-[11px] text-faint">{n(totals.byName[d.name])}</span> : null}
                  </Link>
                ))}
              </div>
            )}
            {!safeMode && <Link to="/faq" onClick={() => setMenuOpen(false)} className="border-b border-rule py-3 text-[15px] text-ink">FAQ</Link>}
            <Link to="/contact" onClick={() => setMenuOpen(false)} className="border-b border-rule py-3 text-[15px] text-ink">Contact</Link>
          </nav>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {user ? (
              <>
                <Link to={dashboardPath} onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-rule py-3 text-[14px] text-ink"><LayoutGrid size={16} /> Dashboard</Link>
                <button type="button" onClick={signOut}
                  className="flex items-center justify-center gap-2 rounded-lg border border-rule py-3 text-[14px] text-alarm"><LogOut size={16} /> Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMenuOpen(false)} className="flex items-center justify-center rounded-lg border border-rule py-3 text-[14px] text-ink">Log in</Link>
                <Link to="/signup" onClick={() => setMenuOpen(false)} className="flex items-center justify-center rounded-lg bg-ink py-3 text-[14px] font-semibold text-surface">Register Now</Link>
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
  const colLabel = 'font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint';
  const linkClass = 'text-[13.5px] text-ink-2 hover:text-accent';

  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="min-w-0">
          <Brand compact />
          <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">{COMPANY_DETAILS.positioning}</p>
          <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-muted">
            A digital library providing curated academic journals and research papers to institutions and researchers worldwide.
          </p>
          <div className="mt-5 flex gap-2">
            <a href="https://www.facebook.com/STMDigitalLibrary" target="_blank" rel="noopener noreferrer" aria-label="STM Digital Library on Facebook"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-rule text-muted hover:border-accent hover:text-accent"><Facebook size={16} /></a>
            <a href="https://linkedin.com/in/stmdigitallibrary" target="_blank" rel="noopener noreferrer" aria-label="STM Digital Library on LinkedIn"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-rule text-muted hover:border-accent hover:text-accent"><Linkedin size={16} /></a>
          </div>
        </div>

        <div>
          <p className={colLabel}>Explore</p>
          <ul className="mt-4 space-y-2.5">
            <li><Link to="/" className={linkClass}>Home</Link></li>
            <li><Link to="/digital-library" className={linkClass}>Journals</Link></li>
            <li><Link to="/for-institutions" className={linkClass}>For Institutions</Link></li>
            <li><Link to="/for-students" className={linkClass}>For Students & Researchers</Link></li>
            <li><Link to="/about" className={linkClass}>About Us</Link></li>
            <li><Link to="/contact" className={linkClass}>Contact Us</Link></li>
          </ul>
        </div>

        <div>
          <p className={colLabel}>Legal & support</p>
          <ul className="mt-4 space-y-2.5">
            <li><Link to="/privacy-policy" className={linkClass}>Privacy Policy</Link></li>
            <li><Link to="/terms-and-conditions" className={linkClass}>Terms & Conditions</Link></li>
            <li><Link to="/faq" className={linkClass}>FAQs</Link></li>
            <li><Link to="/content-removal" className={linkClass}>Content Removal</Link></li>
            <li><Link to="/content-sources" className={linkClass}>Content Sources</Link></li>
            <li><Link to="/legal-disclaimer" className={linkClass}>Legal Disclaimer</Link></li>
            <li><Link to="/admin" className={linkClass}>Admin Login</Link></li>
          </ul>
        </div>

        <div className="min-w-0">
          <p className={colLabel}>Contact</p>
          <ul className="mt-4 space-y-4 text-[13.5px] text-ink-2">
            <li className="flex gap-3">
              <MapPin size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="leading-relaxed">{COMPANY_DETAILS.address}</span>
            </li>
            <li className="flex gap-3">
              <Phone size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="flex flex-col gap-1">
                {COMPANY_DETAILS.tel.map((t: string) => (
                  <a key={t} href={`tel:${t.replace(/[^\d+]/g, '')}`} className="tnum font-mono text-[13px] hover:text-accent">{t}</a>
                ))}
              </span>
            </li>
            <li className="flex gap-3">
              <Mail size={16} className="mt-0.5 shrink-0 text-accent" />
              <a href={`mailto:${COMPANY_DETAILS.email}`} className="break-all hover:text-accent">{COMPANY_DETAILS.email}</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-[12px] text-faint md:flex-row md:items-center md:justify-between">
          <p>© {year} {COMPANY_DETAILS.name}. All rights reserved.</p>
          {totals && (
            <p className="flex items-center gap-2 font-mono text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {n(totals.total)} items across {totals.count} departments, counted from the catalogue
            </p>
          )}
        </div>
        <p className="mx-auto max-w-6xl select-none px-5 pb-4 text-[10px] text-faint/30">shubham a developer</p>
      </div>
    </footer>
  );
}
