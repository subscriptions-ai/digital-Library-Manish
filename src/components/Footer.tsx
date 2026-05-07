import { Link } from "react-router-dom";
import { BookOpen, Mail, Phone, MapPin, Facebook, Twitter, Linkedin, Youtube } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-20 pb-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-4 md:grid-cols-2">
          {/* Company Info */}
          <div className="space-y-8">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-900/20">
                <BookOpen size={28} />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-2xl font-bold tracking-tight text-white">STM Digital Library</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">BY CONSORTIUM ELEARNING NETWORK PVT. LTD.</span>
              </div>
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
            <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-8 border-l-4 border-blue-600 pl-4">Quick Links</h3>
            <ul className="space-y-4">
              <li><Link to="/" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Home</Link></li>
              <li><Link to="/digital-library" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Journals</Link></li>
              <li><Link to="/subscriptions" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Subscriptions</Link></li>
              <li><Link to="/about" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> About Us</Link></li>
              <li><Link to="/contact" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Contact Us</Link></li>
            </ul>
          </div>

          {/* Legal & Support */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-8 border-l-4 border-blue-600 pl-4">Legal & Support</h3>
            <ul className="space-y-4">
              <li><Link to="/privacy-policy" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Privacy Policy</Link></li>
              <li><Link to="/terms-and-conditions" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Terms & Conditions</Link></li>
              <li><Link to="/faq" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> FAQs</Link></li>
              <li><Link to="/agency-listing" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Agency Listing</Link></li>
              <li><Link to="/admin" className="text-sm hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Admin Login</Link></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-8 border-l-4 border-blue-600 pl-4">Contact Info</h3>
            <ul className="space-y-6">
              <li className="flex items-start gap-4">
                <div className="mt-1 p-2 rounded-lg bg-slate-800 text-blue-400">
                  <MapPin size={18} />
                </div>
                <span className="text-sm leading-relaxed text-slate-400">{COMPANY_DETAILS.address}</span>
              </li>
              <li className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-slate-800 text-blue-400">
                  <Phone size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-slate-400">{COMPANY_DETAILS.tel[0]}</span>
                  <span className="text-sm text-slate-400">{COMPANY_DETAILS.tel[1]}</span>
                </div>
              </li>
              <li className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-slate-800 text-blue-400">
                  <Mail size={18} />
                </div>
                <span className="text-sm text-slate-400">{COMPANY_DETAILS.email}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-20 border-t border-slate-800 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-slate-500 font-medium tracking-wide">
            © {new Date().getFullYear()} {COMPANY_DETAILS.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GSTIN</span>
              <span className="text-xs font-mono text-slate-400">{COMPANY_DETAILS.gstin}</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div className="flex gap-4 items-center">
              {/* VISA */}
              <div className="bg-white rounded px-2 py-1 flex items-center justify-center h-7">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 26" className="h-4 w-auto">
                  <path fill="#1A1F71" d="M30.6 1.7L19.3 24.3h-7.5L6.2 7.2C5.9 6 5.5 5.5 4.6 5c-1.5-.8-4-1.5-6.1-2L-1.3 1.7h12c1.6 0 3 1.1 3.3 2.8l3.1 16.4L24.4 1.7h6.2zm24.6 15.2c0-6-8.3-6.3-8.2-9 0-.8.8-1.7 2.5-1.9 2.1-.2 4.3.3 5.5.9l1-4.7C54.7 1.6 52.9 1 50.2 1c-5.8 0-9.9 3.1-9.9 7.5 0 3.3 2.9 5.1 5.1 6.2 2.3 1.1 3.1 1.8 3 2.8 0 1.5-1.8 2.2-3.5 2.2-2.9 0-4.6-.8-6-1.5l-1.1 4.9c1.3.6 3.8 1.2 6.3 1.2 6 .1 9.9-2.9 9.9-7.4zm14.9 7.4H76L70.8 1.7h-5.3c-1.3 0-2.3.7-2.8 1.8L54.1 24.3h6.2l1.2-3.4h7.6l.9 3.4zm-6.7-8l3.1-8.6 1.8 8.6h-4.9zM38.1 1.7L32.8 24.3h-5.9L32.2 1.7h5.9z"/>
                </svg>
              </div>

              {/* MASTERCARD */}
              <div className="bg-white rounded px-2 py-1 flex items-center justify-center h-7">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 24" className="h-4 w-auto">
                  <rect width="38" height="24" rx="3" fill="white"/>
                  <circle cx="15" cy="12" r="7" fill="#EB001B"/>
                  <circle cx="23" cy="12" r="7" fill="#F79E1B"/>
                  <path d="M19 6.8a7 7 0 0 1 0 10.4A7 7 0 0 1 19 6.8z" fill="#FF5F00"/>
                </svg>
              </div>

              {/* PAYPAL */}
              <div className="bg-white rounded px-3 py-1 flex items-center justify-center h-7">
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
