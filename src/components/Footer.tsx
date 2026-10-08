import { Link } from "react-router-dom";
import { BookOpen, Mail, Phone, MapPin, Facebook, Twitter, Linkedin, Youtube, GraduationCap, Library, Globe, FileText } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

/** Inline WhatsApp SVG — used only in the footer social strip. */
function WhatsAppSvgIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.52 3.45A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z" />
    </svg>
  );
}


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
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">{COMPANY_DETAILS.positioning.toUpperCase()}</span>
            </Link>
            <p className="text-sm leading-relaxed text-slate-400 max-w-xs">
              A digital library providing curated academic journals and research papers to institutions and researchers worldwide.
            </p>
            <div className="flex gap-5">
              <a
                href={COMPANY_DETAILS.social.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow STM Digital Library on Facebook"
                title="Follow STM Digital Library on Facebook"
                className="text-slate-500 hover:text-blue-400 transition-colors"
              >
                <Facebook size={22} aria-hidden="true" />
              </a>
              <a href="#" className="text-slate-500 hover:text-blue-400 transition-colors" aria-label="STM Digital Library on Twitter">
                <Twitter size={22} aria-hidden="true" />
              </a>
              <a
                href={COMPANY_DETAILS.social.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow STM Digital Library on LinkedIn"
                title="Follow STM Digital Library on LinkedIn"
                className="text-slate-500 hover:text-blue-400 transition-colors"
              >
                <Linkedin size={22} aria-hidden="true" />
              </a>
              <a href="#" className="text-slate-500 hover:text-blue-400 transition-colors" aria-label="STM Digital Library on YouTube">
                <Youtube size={22} aria-hidden="true" />
              </a>
              {/* WhatsApp Channel — for academic updates and announcements, not support */}
              <a
                href={COMPANY_DETAILS.social.whatsappChannel}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow STM Digital Library WhatsApp Channel"
                title="Follow STM Digital Library on WhatsApp"
                className="text-slate-500 hover:text-[#25D366] transition-colors"
              >
                <WhatsAppSvgIcon size={22} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-8 border-l-4 border-blue-500 pl-4">Quick Links</h3>
            <ul className="space-y-4">
              <li><Link to="/" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Home</Link></li>
              <li><Link to="/digital-library" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Journals</Link></li>
              <li><Link to="/blog" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Blog</Link></li>
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
              <li><Link to="/content-removal" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></span> Content Removal</Link></li>
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
          <div className="flex flex-col gap-1">
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              © {new Date().getFullYear()} {COMPANY_DETAILS.name}. All rights reserved.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/content-sources" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Content Sources</Link>
            <Link to="/legal-disclaimer" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Legal Disclaimer</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
