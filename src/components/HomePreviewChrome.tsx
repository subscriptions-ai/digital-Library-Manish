import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown, Facebook, LayoutGrid, Linkedin, Lock, LogOut, Mail, MapPin, Menu, Phone, Search, X,
} from 'lucide-react';
import { DOMAINS } from '../constants';

// The departments menu lists them A to Z, so a visitor can find theirs at a glance.
const DEPARTMENTS_AZ = [...DOMAINS].sort((a, b) => a.name.localeCompare(b.name));
import { COMPANY_DETAILS } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { usePublisherSafeMode } from '../lib/publicSettings';

/**
 * The header and footer for the home page and the pages that belong with it,
 * drawn in the same language as the page: the dashboards' tokens, a serif for
 * names, mono for figures.
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
  const { pathname, search } = useLocation();
  const totals = useDepartmentTotals();

  const [deptOpen, setDeptOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileDepts, setMobileDepts] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    setDeptOpen(false);
    setSearchOpen(false);
    setMenuOpen(false);
    setProfileOpen(false);
    setMobileDepts(false);
  }, [pathname, search]);

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
                    {DEPARTMENTS_AZ.map(d => {
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
          <NavLink to="/blog" className={navLinkClass}>Blog</NavLink>
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
                {DEPARTMENTS_AZ.map(d => (
                  <Link key={d.id} to={`/domain/${d.id}`} onClick={() => setMenuOpen(false)}
                    className="flex items-baseline justify-between py-2 text-[14px] text-ink-2">
                    <span>{d.name}</span>
                    {totals?.byName[d.name] ? <span className="tnum font-mono text-[11px] text-faint">{n(totals.byName[d.name])}</span> : null}
                  </Link>
                ))}
              </div>
            )}
            {!safeMode && <Link to="/faq" onClick={() => setMenuOpen(false)} className="border-b border-rule py-3 text-[15px] text-ink">FAQ</Link>}
            <Link to="/blog" onClick={() => setMenuOpen(false)} className="border-b border-rule py-3 text-[15px] text-ink">Blog</Link>
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
  const colLabel = 'font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-faint';
  const linkClass =
    'group inline-flex items-center gap-1 rounded text-[13.5px] leading-7 text-ink-2 transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const arrow = <span aria-hidden="true" className="-ml-1 translate-x-0 text-accent opacity-0 transition-all group-hover:ml-0 group-hover:opacity-100 group-focus-visible:opacity-100">→</span>;
  const socialClass =
    'flex h-10 w-10 items-center justify-center rounded-full border border-rule bg-surface text-ink-2 transition-colors hover:border-accent hover:bg-accent hover:text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const iconBox = 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rule bg-surface text-accent';

  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-14 md:grid-cols-2 lg:grid-cols-[1.5fr_0.9fr_1.1fr_1.5fr] lg:gap-12">
        <div className="min-w-0">
          <Link to="/" className="inline-flex items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface p-1.5 border border-rule">
              <img src="/logo.png" alt="" className="h-full w-full object-contain" />
            </span>
            <span className="font-serif text-[19px] font-medium leading-tight tracking-tight text-ink">STM Digital Library</span>
          </Link>
          <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-accent">{COMPANY_DETAILS.positioning}</p>
          <p className="mt-4 max-w-xs text-[13.5px] leading-[1.8] text-ink-2">
            A digital library providing curated academic journals and research papers to institutions and researchers worldwide.
          </p>
          <div className="mt-6 flex gap-2.5">
            <a href="https://www.facebook.com/STMDigitalLibrary" target="_blank" rel="noopener noreferrer" aria-label="STM Digital Library on Facebook" className={socialClass}><Facebook size={17} aria-hidden="true" /></a>
            <a href="https://linkedin.com/in/stmdigitallibrary" target="_blank" rel="noopener noreferrer" aria-label="STM Digital Library on LinkedIn" className={socialClass}><Linkedin size={17} aria-hidden="true" /></a>
          </div>
        </div>

        <nav aria-label="Explore">
          <p className={colLabel}>Explore</p>
          <ul className="mt-5 space-y-1">
            <li><Link to="/" className={linkClass}>Home{arrow}</Link></li>
            <li><Link to="/digital-library" className={linkClass}>Journals{arrow}</Link></li>
            <li><Link to="/for-institutions" className={linkClass}>For Institutions{arrow}</Link></li>
            <li><Link to="/for-students" className={linkClass}>For Students & Researchers{arrow}</Link></li>
            <li><Link to="/about" className={linkClass}>About Us{arrow}</Link></li>
            <li><Link to="/contact" className={linkClass}>Contact Us{arrow}</Link></li>
          </ul>
        </nav>

        <nav aria-label="Legal and support">
          <p className={colLabel}>Legal & support</p>
          <ul className="mt-5 space-y-1">
            <li><Link to="/privacy-policy" className={linkClass}>Privacy Policy{arrow}</Link></li>
            <li><Link to="/terms-and-conditions" className={linkClass}>Terms & Conditions{arrow}</Link></li>
            <li><Link to="/faq" className={linkClass}>FAQs{arrow}</Link></li>
            <li><Link to="/content-removal" className={linkClass}>Content Removal{arrow}</Link></li>
            <li><Link to="/content-sources" className={linkClass}>Content Sources{arrow}</Link></li>
            <li><Link to="/legal-disclaimer" className={linkClass}>Legal Disclaimer{arrow}</Link></li>
            <li><Link to="/admin" className={linkClass}><Lock size={13} aria-hidden="true" className="text-accent" />Admin Login{arrow}</Link></li>
          </ul>
        </nav>

        <div className="min-w-0">
          <p className={colLabel}>Contact</p>
          <ul className="mt-5 space-y-4 text-[13.5px] text-ink-2">
            <li className="flex gap-3">
              <span className={iconBox}><MapPin size={15} aria-hidden="true" /></span>
              <span className="leading-relaxed"><span className="sr-only">Address: </span>{COMPANY_DETAILS.address}</span>
            </li>
            <li className="flex gap-3">
              <span className={iconBox}><Phone size={15} aria-hidden="true" /></span>
              <span className="flex flex-col">
                {COMPANY_DETAILS.tel.map((t: string) => (
                  <a key={t} href={`tel:${t.replace(/[^\d+]/g, '')}`} className="tnum rounded font-mono text-[13px] leading-7 hover:text-accent focus-visible:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{t}</a>
                ))}
              </span>
            </li>
            <li className="flex gap-3">
              <span className={iconBox}><Mail size={15} aria-hidden="true" /></span>
              <a href={`mailto:${COMPANY_DETAILS.email}`} className="break-all rounded leading-8 hover:text-accent focus-visible:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{COMPANY_DETAILS.email}</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between">
          <p className="text-[12px] text-ink-2">© {year} {COMPANY_DETAILS.name}. All rights reserved.</p>
          {totals && (
            <div className="flex items-start gap-2.5 md:text-right">
              <span className="relative mt-[5px] flex h-2 w-2 shrink-0 md:order-2">
                <span aria-hidden="true" className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
                <span aria-hidden="true" className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="font-mono text-[11px] leading-relaxed text-ink-2 md:order-1">
                <span className="font-semibold text-emerald-700">Catalogue live</span><br />
                {n(totals.total)} items across {totals.count} departments, counted from the catalogue
              </p>
            </div>
          )}
        </div>
        <p className="mx-auto max-w-6xl select-none px-5 pb-4 text-[10px] text-faint/30 md:text-right">shubham a developer</p>
      </div>
    </footer>
  );
}
