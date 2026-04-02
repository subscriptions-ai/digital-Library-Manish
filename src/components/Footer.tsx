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
                <span className="text-2xl font-bold tracking-tight text-white">Journals Library</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">By Dhruv Infosystems</span>
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
            <div className="flex gap-4 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/2560px-Visa_Inc._logo.svg.png" alt="Visa" className="h-4" referrerPolicy="no-referrer" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/1280px-Mastercard-logo.svg.png" alt="Mastercard" className="h-4" referrerPolicy="no-referrer" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PayPal.svg/1200px-PayPal.svg.png" alt="PayPal" className="h-4" referrerPolicy="no-referrer" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
