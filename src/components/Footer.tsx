import { Link } from "react-router-dom";
import { BookOpen, Mail, Phone, MapPin, Facebook, Twitter, Linkedin, Youtube, GraduationCap, Library, Globe, FileText } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 pt-20 pb-10 border-t border-blue-900/30">
      {/* Eye-Catching Animated Library Doodles Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Glowing Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-blue-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-indigo-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />

        {/* Floating Doodles / Icons */}
        <div className="absolute top-10 left-[10%] text-blue-500/10 animate-[bounce_6s_infinite]">
          <BookOpen size={120} />
        </div>
        <div className="absolute bottom-20 left-[30%] text-indigo-500/10 animate-[spin_20s_linear_infinite]">
          <GraduationCap size={160} />
        </div>
        <div className="absolute top-20 right-[20%] text-blue-400/10 animate-[bounce_7s_infinite]" style={{ animationDelay: '1s' }}>
          <Library size={140} />
        </div>
        <div className="absolute bottom-10 right-[10%] text-indigo-400/10 animate-[spin_25s_linear_infinite_reverse]">
          <Globe size={180} />
        </div>
        <div className="absolute top-[40%] left-[50%] -translate-x-1/2 text-slate-500/5 animate-[pulse_4s_infinite]">
          <FileText size={300} />
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-4 md:grid-cols-2">
          {/* Company Info */}
          <div className="space-y-8">
            <Link to="/" className="flex flex-col gap-2">
              <div className="bg-white px-6 py-2.5 rounded-[1.5rem] shadow-lg border border-white/50 flex items-center gap-3 mb-2 w-max group-hover:shadow-xl transition-shadow">
                <img src="/logo.png" alt="STM Digital Library Logo" className="h-11 w-11 object-contain drop-shadow-md" />
                <div className="flex flex-col text-left justify-center">
                  <span className="text-xl font-bold tracking-tight text-slate-900 leading-none mb-1">STM</span>
                  <span className="text-[0.65rem] font-bold uppercase tracking-widest text-blue-600 leading-none">Digital Library</span>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">BY CONSORTIUM ELEARNING NETWORK PVT. LTD.</span>
            </Link>
            <p className="text-sm leading-relaxed text-slate-400 max-w-xs">
              A premier subscription-based digital library providing high-quality academic journals and research papers to institutions and researchers worldwide.
            </p>
            <div className="flex gap-5">
              <a href="#" className="text-slate-500 hover:text-blue-400 transition-colors"><Facebook size={22} /></a>
              <a href="#" className="text-slate-500 hover:text-blue-400 transition-colors"><Twitter size={22} /></a>
              <a href="#" className="text-slate-500 hover:text-blue-400 transition-colors"><Linkedin size={22} /></a>
              <a href="#" className="text-slate-500 hover:text-blue-400 transition-colors"><Youtube size={22} /></a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-8 border-l-4 border-blue-500 pl-4">Quick Links</h3>
            <ul className="space-y-4">
              <li><Link to="/" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Home</Link></li>
              <li><Link to="/digital-library" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Journals</Link></li>
              <li><Link to="/subscriptions" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Subscriptions</Link></li>
              <li><Link to="/about" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> About Us</Link></li>
              <li><Link to="/contact" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Contact Us</Link></li>
            </ul>
          </div>

          {/* Legal & Support */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-8 border-l-4 border-blue-500 pl-4">Legal & Support</h3>
            <ul className="space-y-4">
              <li><Link to="/privacy-policy" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Privacy Policy</Link></li>
              <li><Link to="/terms-and-conditions" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Terms & Conditions</Link></li>
              <li><Link to="/faq" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> FAQs</Link></li>
              <li><Link to="/agency-listing" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Agency Listing</Link></li>
              <li><Link to="/admin" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Admin Login</Link></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-8 border-l-4 border-blue-500 pl-4">Contact Info</h3>
            <ul className="space-y-6">
              <li className="flex items-start gap-4">
                <div className="mt-1 p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-blue-400 backdrop-blur-sm shadow-lg">
                  <MapPin size={18} />
                </div>
                <span className="text-sm leading-relaxed text-slate-400">{COMPANY_DETAILS.address}</span>
              </li>
              <li className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-blue-400 backdrop-blur-sm shadow-lg">
                  <Phone size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-slate-400">{COMPANY_DETAILS.tel[0]}</span>
                  <span className="text-sm text-slate-400">{COMPANY_DETAILS.tel[1]}</span>
                </div>
              </li>
              <li className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-blue-400 backdrop-blur-sm shadow-lg">
                  <Mail size={18} />
                </div>
                <span className="text-sm text-slate-400">{COMPANY_DETAILS.email}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-20 border-t border-slate-800/50 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-slate-500 font-medium tracking-wide">
            © {new Date().getFullYear()} {COMPANY_DETAILS.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">GSTIN</span>
              <span className="text-xs font-mono text-slate-400">{COMPANY_DETAILS.gstin}</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div className="flex gap-4 items-center opacity-80 hover:opacity-100 transition-opacity">
              {/* VISA */}
              <div className="bg-white rounded px-2 py-1 flex items-center justify-center h-7 shadow">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 26" className="h-4 w-auto">
                  <path fill="#1A1F71" d="M30.6 1.7L19.3 24.3h-7.5L6.2 7.2C5.9 6 5.5 5.5 4.6 5c-1.5-.8-4-1.5-6.1-2L-1.3 1.7h12c1.6 0 3 1.1 3.3 2.8l3.1 16.4L24.4 1.7h6.2zm24.6 15.2c0-6-8.3-6.3-8.2-9 0-.8.8-1.7 2.5-1.9 2.1-.2 4.3.3 5.5.9l1-4.7C54.7 1.6 52.9 1 50.2 1c-5.8 0-9.9 3.1-9.9 7.5 0 3.3 2.9 5.1 5.1 6.2 2.3 1.1 3.1 1.8 3 2.8 0 1.5-1.8 2.2-3.5 2.2-2.9 0-4.6-.8-6-1.5l-1.1 4.9c1.3.6 3.8 1.2 6.3 1.2 6 .1 9.9-2.9 9.9-7.4zm14.9 7.4H76L70.8 1.7h-5.3c-1.3 0-2.3.7-2.8 1.8L54.1 24.3h6.2l1.2-3.4h7.6l.9 3.4zm-6.7-8l3.1-8.6 1.8 8.6h-4.9zM38.1 1.7L32.8 24.3h-5.9L32.2 1.7h5.9z" />
                </svg>
              </div>

              {/* MASTERCARD */}
              <div className="bg-white rounded px-2 py-1 flex items-center justify-center h-7 shadow">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 24" className="h-4 w-auto">
                  <rect width="38" height="24" rx="3" fill="white" />
                  <circle cx="15" cy="12" r="7" fill="#EB001B" />
                  <circle cx="23" cy="12" r="7" fill="#F79E1B" />
                  <path d="M19 6.8a7 7 0 0 1 0 10.4A7 7 0 0 1 19 6.8z" fill="#FF5F00" />
                </svg>
              </div>

              {/* PAYPAL */}
              <div className="bg-white rounded px-3 py-1 flex items-center justify-center h-7 shadow">
                <span style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', fontWeight: '900', letterSpacing: '-0.3px' }}>
                  <span style={{ color: '#003087' }}>Pay</span><span style={{ color: '#009cde' }}>Pal</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
