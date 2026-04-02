import { Link, useNavigate } from "react-router-dom";
import { Search, Menu, X, BookOpen, ChevronDown, LayoutGrid, ShoppingCart, FileText } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { DOMAINS } from "../constants";
import { useCart } from "../contexts/CartContext";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDepartmentsOpen, setIsDepartmentsOpen] = useState(false);
  const { items } = useCart();
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo Section */}
        <div className="flex items-center shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-200">
              <BookOpen size={24} />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-bold tracking-tight text-slate-900">STM</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Digital Library</span>
            </div>
          </Link>
        </div>

        {/* Search Bar - TOP CENTER */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <div className="relative w-full group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search size={18} className="text-slate-400 group-focus-within:text-blue-600 transition-colors" />
            </div>
            <input 
              type="text" 
              placeholder="Search journals, books, topics..." 
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Desktop Navigation & CTAs */}
        <div className="hidden lg:flex flex-col items-end gap-2">
          <div className="flex items-center gap-6">
            <Link to="/cart" className="relative p-2 text-slate-600 hover:text-blue-600 transition-colors">
              <ShoppingCart size={22} />
              {items.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-white">
                  {items.length}
                </span>
              )}
            </Link>
            <Link to="/login" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors px-2">Login</Link>
            <Link to="/signup" className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">Get Started</Link>
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Navigation Row - Desktop Only */}
      <div className="hidden lg:block border-t border-slate-100 bg-slate-50/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            <nav className="flex items-center gap-8">
              <Link to="/" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Home</Link>
              <Link to="/about" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">About Us</Link>
              <Link to="/digital-library" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Library Info</Link>
              
              <div className="relative group">
                <button 
                  className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors py-2"
                  onMouseEnter={() => setIsDepartmentsOpen(true)}
                  onClick={() => setIsDepartmentsOpen(!isDepartmentsOpen)}
                >
                  Departments
                  <ChevronDown size={14} className={cn("transition-transform duration-200", isDepartmentsOpen && "rotate-180")} />
                </button>

                {/* Mega Menu */}
                {isDepartmentsOpen && (
                  <div 
                    className="absolute left-0 top-full mt-0 w-[800px] rounded-b-2xl border border-slate-200 bg-white p-8 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 z-[60]"
                    onMouseLeave={() => setIsDepartmentsOpen(false)}
                  >
                    <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-2">
                        <LayoutGrid size={20} className="text-blue-600" />
                        <h3 className="text-lg font-bold text-slate-900">Academic Departments</h3>
                      </div>
                      <Link to="/digital-library" className="text-sm font-bold text-blue-600 hover:underline">View All</Link>
                    </div>
                    <div className="grid grid-cols-3 gap-x-12 gap-y-3">
                      {DOMAINS.map((domain) => (
                        <Link 
                          key={domain.id} 
                          to={`/domain/${domain.id}`}
                          className="group flex items-center gap-3 rounded-xl p-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all"
                          onClick={() => setIsDepartmentsOpen(false)}
                        >
                          <div className="h-2 w-2 rounded-full bg-slate-200 group-hover:bg-blue-600 transition-colors" />
                          <span className="font-medium">{domain.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link to="/subscriptions" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Subscription Plans</Link>
              <Link to="/agency-listing" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Agency Info</Link>
              <Link to="/contact" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Contact Us</Link>
            </nav>

            <button 
              onClick={() => navigate('/create-quotation')}
              className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
            >
              <FileText size={14} />
              Create Quotation
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="lg:hidden border-t border-slate-100 bg-white px-4 py-8 space-y-6 max-h-[90vh] overflow-y-auto animate-in slide-in-from-top duration-300">
          {/* Mobile Search */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search journals, books..." 
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Main Menu</p>
              <div className="grid grid-cols-1 gap-4">
                <Link to="/" className="text-base font-semibold text-slate-700" onClick={() => setIsMenuOpen(false)}>Home</Link>
                <Link to="/about" className="text-base font-semibold text-slate-700" onClick={() => setIsMenuOpen(false)}>About Us</Link>
                <Link to="/digital-library" className="text-base font-semibold text-slate-700" onClick={() => setIsMenuOpen(false)}>Library Info</Link>
                <Link to="/subscriptions" className="text-base font-semibold text-slate-700" onClick={() => setIsMenuOpen(false)}>Subscription Plans</Link>
                <Link to="/agency-listing" className="text-base font-semibold text-slate-700" onClick={() => setIsMenuOpen(false)}>Agency Info</Link>
                <Link to="/contact" className="text-base font-semibold text-slate-700" onClick={() => setIsMenuOpen(false)}>Contact Us</Link>
              </div>
            </div>

            <Link to="/cart" className="flex items-center justify-between text-lg font-bold text-slate-900" onClick={() => setIsMenuOpen(false)}>
              <div className="flex items-center gap-3">
                <ShoppingCart size={22} className="text-blue-600" />
                Your Cart
              </div>
              {items.length > 0 && (
                <span className="rounded-full bg-blue-600 px-3 py-1 text-xs text-white">
                  {items.length} Items
                </span>
              )}
            </Link>

            <button 
              onClick={() => {
                setIsMenuOpen(false);
                navigate('/create-quotation');
              }}
              className="flex items-center gap-3 text-lg font-bold text-blue-600" 
            >
              <FileText size={22} />
              Create Quotation
            </button>
          </div>

          <div className="pt-6 border-t border-slate-100 flex flex-col gap-4">
            <Link to="/login" className="flex items-center justify-center rounded-xl border border-slate-200 py-4 text-base font-bold text-slate-700" onClick={() => setIsMenuOpen(false)}>Login</Link>
            <Link to="/signup" className="flex items-center justify-center rounded-xl bg-slate-900 py-4 text-base font-bold text-white shadow-lg shadow-slate-200" onClick={() => setIsMenuOpen(false)}>Get Started</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
