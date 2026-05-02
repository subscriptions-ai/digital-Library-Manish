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
            <div className="flex gap-4 items-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all">
              <svg className="h-4 w-auto fill-slate-300" viewBox="0 0 32 10" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.368 0l-1.745 9.771h2.793l1.745-9.771zM23.111 0c-.628 0-1.636.18-2.38.544l-.391 1.834c.488-.23 1.111-.383 1.761-.383 1.258 0 1.579.576 1.579 1.189 0 .991-1.396 1.488-1.396 2.378 0 .543.518.891 1.265.891.802 0 1.396-.217 1.884-.469l.366-1.804c-.383.18-.959.333-1.603.333-.923 0-1.484-.45-1.484-1.127 0-1.018 1.413-1.558 1.413-2.457C24.898.315 24.12 0 23.111 0zM30.439 0h-2.181c-.506 0-.89.145-1.117.658L22.95 9.771h2.934s.488-1.388.594-1.685c.315 0 2.585 0 2.969 0 .088.396.383 1.685.383 1.685h2.585L30.439 0zm-2.88 6.307c.106-.297.89-2.505.89-2.505l.45 2.505h-1.34zM9.488 0l-2.481 6.643L6.082.909C5.908.414 5.541.054 4.861.054H0L.07 1.34c1.066.234 2.321.784 3.018 1.306l.36 1.611L5.96 9.771h2.968l4.417-9.771z"/>
              </svg>
              <svg className="h-5 w-auto" viewBox="0 0 32 20" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="10" fill="#EB001B"/>
                <circle cx="22" cy="10" r="10" fill="#F79E1B"/>
                <path d="M16 18c-2.464 0-4.634-1.282-5.918-3.235A9.957 9.957 0 0012.353 10c0-1.954-.56-3.774-1.52-5.32C11.956 3.033 13.856 2 16 2c2.144 0 4.044 1.033 4.887 2.68A9.957 9.957 0 0019.647 10c0 1.954.56 3.774 1.52 5.32C20.324 16.923 18.28 18 16 18z" fill="#FF5F00"/>
              </svg>
              <svg className="h-4 w-auto fill-slate-300" viewBox="0 0 32 8" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.428.167H4.072C3.766.167 3.488.38 3.428.683L1.503 12.871c-.052.332.2.628.537.628h3.332c.264 0 .493-.186.535-.447l.865-5.474a.553.553 0 0 1 .545-.466h1.758c2.909 0 5.17-1.187 5.867-4.148.291-1.233.109-2.215-.558-2.885C13.568.258 12.247.167 10.428.167zm.255 3.518c-.296 1.258-1.42 1.258-2.695 1.258H6.551l.526-3.338h1.22c1.018 0 1.705.019 2.115.441.353.364.444.951.271 1.639zM25.795.167h-3.368c-.264 0-.493.186-.536.446l-1.921 12.164a.544.544 0 0 0 .536.629h3.197c.264 0 .493-.186.536-.447l.829-5.244a.553.553 0 0 1 .545-.466h.749c2.909 0 5.17-1.187 5.867-4.148.291-1.233.109-2.215-.558-2.885-1.116-.913-2.898-.887-5.011-.887zm.143 4.776c-.296 1.258-1.42 1.258-2.694 1.258h-1.096l.526-3.338h1.002c1.018 0 1.705.019 2.115.441.352.364.444.951.272 1.639zM19.462 4.417c0-2.316-1.579-4.25-4.127-4.25h-2.15l-1.905 12.067h3.332l.685-4.337a.553.553 0 0 1 .545-.466h.176c2.548 0 4.127-1.934 4.127-4.25l-.683 1.236zm-3.266.38h-.469l.526-3.338h.469c.89 0 1.488.665 1.488 1.669 0 1.004-.598 1.669-1.488 1.669zM31.256 4.417c0-2.316-1.579-4.25-4.127-4.25h-2.15l-1.905 12.067h3.332l.685-4.337a.553.553 0 0 1 .545-.466h.176c2.548 0 4.127-1.934 4.127-4.25l-.683 1.236zm-3.266.38h-.469l.526-3.338h.469c.89 0 1.488.665 1.488 1.669 0 1.004-.598 1.669-1.488 1.669z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
