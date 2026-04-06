import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { DOMAINS } from "../constants";
import * as Icons from "lucide-react";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Users, FileText,
  ShieldCheck, Zap, ChevronRight
} from "lucide-react";

const THEME_CLASSES: Record<string, { hero: string; badge: string; icon: string; btn: string; accent: string }> = {
  blue:    { hero: "from-blue-900 to-blue-700",   badge: "bg-blue-500/20 text-blue-200",   icon: "bg-blue-500/20 text-blue-300", btn: "bg-blue-500 hover:bg-blue-400", accent: "text-blue-400" },
  indigo:  { hero: "from-indigo-900 to-indigo-700", badge: "bg-indigo-500/20 text-indigo-200", icon: "bg-indigo-500/20 text-indigo-300", btn: "bg-indigo-500 hover:bg-indigo-400", accent: "text-indigo-400" },
  red:     { hero: "from-red-900 to-rose-700",    badge: "bg-red-400/20 text-red-200",     icon: "bg-red-500/20 text-red-300",    btn: "bg-red-500 hover:bg-red-400",    accent: "text-red-400" },
  slate:   { hero: "from-slate-900 to-slate-700", badge: "bg-slate-500/20 text-slate-200", icon: "bg-slate-500/20 text-slate-300", btn: "bg-slate-600 hover:bg-slate-500", accent: "text-slate-400" },
  emerald: { hero: "from-emerald-900 to-emerald-700", badge: "bg-emerald-500/20 text-emerald-200", icon: "bg-emerald-500/20 text-emerald-300", btn: "bg-emerald-500 hover:bg-emerald-400", accent: "text-emerald-400" },
  orange:  { hero: "from-orange-900 to-orange-700", badge: "bg-orange-400/20 text-orange-200", icon: "bg-orange-500/20 text-orange-300", btn: "bg-orange-500 hover:bg-orange-400", accent: "text-orange-400" },
  pink:    { hero: "from-pink-900 to-pink-700",   badge: "bg-pink-400/20 text-pink-200",   icon: "bg-pink-500/20 text-pink-300",  btn: "bg-pink-500 hover:bg-pink-400",  accent: "text-pink-400" },
  amber:   { hero: "from-amber-900 to-amber-700", badge: "bg-amber-400/20 text-amber-200", icon: "bg-amber-500/20 text-amber-300", btn: "bg-amber-500 hover:bg-amber-400", accent: "text-amber-400" },
  purple:  { hero: "from-purple-900 to-purple-700", badge: "bg-purple-400/20 text-purple-200", icon: "bg-purple-500/20 text-purple-300", btn: "bg-purple-500 hover:bg-purple-400", accent: "text-purple-400" },
  green:   { hero: "from-green-900 to-green-700", badge: "bg-green-400/20 text-green-200", icon: "bg-green-500/20 text-green-300", btn: "bg-green-500 hover:bg-green-400", accent: "text-green-400" },
  rose:    { hero: "from-rose-900 to-rose-700",   badge: "bg-rose-400/20 text-rose-200",   icon: "bg-rose-500/20 text-rose-300",  btn: "bg-rose-500 hover:bg-rose-400",  accent: "text-rose-400" },
  sky:     { hero: "from-sky-900 to-sky-700",     badge: "bg-sky-400/20 text-sky-200",     icon: "bg-sky-500/20 text-sky-300",    btn: "bg-sky-500 hover:bg-sky-400",    accent: "text-sky-400" },
  teal:    { hero: "from-teal-900 to-teal-700",   badge: "bg-teal-400/20 text-teal-200",   icon: "bg-teal-500/20 text-teal-300",  btn: "bg-teal-500 hover:bg-teal-400",  accent: "text-teal-400" },
  cyan:    { hero: "from-cyan-900 to-cyan-700",   badge: "bg-cyan-400/20 text-cyan-200",   icon: "bg-cyan-500/20 text-cyan-300",  btn: "bg-cyan-500 hover:bg-cyan-400",  accent: "text-cyan-400" },
  lime:    { hero: "from-lime-900 to-lime-700",   badge: "bg-lime-400/20 text-lime-200",   icon: "bg-lime-500/20 text-lime-300",  btn: "bg-lime-500 hover:bg-lime-400",  accent: "text-lime-400" },
  violet:  { hero: "from-violet-900 to-violet-700", badge: "bg-violet-400/20 text-violet-200", icon: "bg-violet-500/20 text-violet-300", btn: "bg-violet-500 hover:bg-violet-400", accent: "text-violet-400" },
};

const CONTENT_TYPE_ICONS: Record<string, any> = {
  Books: Icons.Book,
  Periodicals: Icons.Newspaper,
  Magazines: Icons.BookOpen,
  "Case Reports": Icons.FileText,
  Theses: Icons.GraduationCap,
  Proceedings: Icons.Users,
  Videos: Icons.Video,
  Newsletters: Icons.Mail,
};

export function DomainLandingPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();

  const domain = DOMAINS.find((d) => d.id === domainId);

  if (!domain) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-600">
        <BookOpen size={48} className="text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-800">Domain Not Found</h1>
        <p>The domain <code className="bg-slate-100 px-2 py-0.5 rounded text-sm">{domainId}</code> does not exist.</p>
        <Link to="/digital-library" className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
          <ArrowLeft size={14} /> Browse All Domains
        </Link>
      </div>
    );
  }

  const theme = THEME_CLASSES[domain.themeColor] || THEME_CLASSES.blue;
  const DomainIcon = (Icons as any)[domain.icon] || Icons.BookOpen;

  const relatedDomains = DOMAINS.filter((d) => d.id !== domain.id).slice(0, 4);

  return (
    <div className="flex flex-col">
      {/* ── HERO ── */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${theme.hero} py-28 text-white`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="grid h-full w-full grid-cols-12 gap-4 opacity-20">
            {Array.from({ length: 144 }).map((_, i) => (
              <div key={i} className="h-24 border-b border-r border-white/20" />
            ))}
          </div>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="mb-8 flex items-center gap-2 text-sm text-white/60">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} />
            <Link to="/digital-library" className="hover:text-white transition-colors">Domains</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium">{domain.name}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest ring-1 ring-white/20 ${theme.badge}`}>
                <DomainIcon size={14} /> {domain.name}
              </span>
              <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl leading-[1.1]">
                {domain.name}
              </h1>
              <p className="mt-6 text-lg leading-8 text-white/70 max-w-xl">
                {domain.description}
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  to="/subscriptions"
                  className={`rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-all ${theme.btn}`}
                >
                  Subscribe Now
                </Link>
                <Link
                  to="/create-quotation"
                  className="rounded-full border border-white/20 bg-white/10 px-8 py-4 text-sm font-bold hover:bg-white/20 transition-all backdrop-blur-sm flex items-center gap-2"
                >
                  <FileText size={16} /> Get a Quotation
                </Link>
              </div>
            </motion.div>

            {/* Content availability cards */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-2 gap-4"
            >
              {domain.contentAvailable.map((item, i) => (
                <div key={i} className={`rounded-2xl p-5 ring-1 ring-white/10 ${theme.icon} backdrop-blur-sm`}>
                  <div className="text-sm font-bold leading-tight">{item}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── WHY THIS DOMAIN MATTERS ── */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Why It Matters</span>
              <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">The Importance of {domain.name}</h2>
              <p className="mt-6 text-lg text-slate-600 leading-relaxed">{domain.importance}</p>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">{domain.whySubscribe}</p>
            </div>
            <div className="bg-slate-50 rounded-3xl p-8 space-y-4 border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-5">Who Should Subscribe?</h3>
              {domain.whoShouldSubscribe.map((who, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${theme.icon}`}>
                    <Users size={15} />
                  </div>
                  <span className="text-slate-700 font-medium">{who}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTENT TYPES ── */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Content Library</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">What's Included</h2>
            <p className="mt-4 text-slate-500">
              Access a curated collection of academic resources spanning all content formats in {domain.name}.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {domain.contentTypes.map((ct, i) => {
              const CTIcon = CONTENT_TYPE_ICONS[ct.type] || Icons.BookOpen;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg hover:border-blue-200 transition-all group"
                >
                  <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors mb-4">
                    <CTIcon size={22} />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{ct.count}</div>
                  <div className="text-sm font-bold text-slate-700 mt-1">{ct.type}</div>
                  <div className="text-xs text-slate-500 mt-2">{ct.description}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Platform Features</span>
              <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">Everything You Need</h2>
              <p className="mt-4 text-slate-500">
                A subscription gives you access to a comprehensive suite of tools and resources tailored for {domain.name}.
              </p>
              <ul className="mt-8 space-y-4">
                {domain.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                    <span className="text-slate-700 font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { Icon: ShieldCheck, label: "Peer-Reviewed", desc: "All content is verified and curated by experts." },
                { Icon: Zap,         label: "Instant Access",  desc: "Stream or download resources immediately." },
                { Icon: Icons.BarChart3, label: "Analytics",  desc: "Track your reading and research habits." },
                { Icon: Icons.RefreshCw, label: "Updated Regularly", desc: "New content added every month." },
              ].map(({ Icon, label, desc }, i) => (
                <div key={i} className="rounded-2xl bg-slate-50 p-6 border border-slate-100">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${theme.icon}`}>
                    <Icon size={20} />
                  </div>
                  <div className="font-bold text-slate-900">{label}</div>
                  <div className="text-sm text-slate-500 mt-1">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={`bg-gradient-to-br ${theme.hero} py-20 text-white`}>
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Ready to explore {domain.name}?</h2>
          <p className="mt-5 text-lg text-white/70 max-w-2xl mx-auto">
            Join thousands of researchers and students who rely on our platform for world-class academic content in {domain.name}.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link to="/subscriptions" className={`rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-all ${theme.btn}`}>
              Start Your Subscription
            </Link>
            <Link to="/digital-library" className="rounded-full border border-white/20 bg-white/10 px-8 py-4 text-sm font-bold hover:bg-white/20 transition-all backdrop-blur-sm flex items-center gap-2">
              <ArrowLeft size={15} /> Browse All Domains
            </Link>
          </div>
        </div>
      </section>

      {/* ── RELATED DOMAINS ── */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <h2 className="text-2xl font-bold text-slate-900">Explore Related Domains</h2>
            <Link to="/digital-library" className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {relatedDomains.map((rd) => {
              const RdIcon = (Icons as any)[rd.icon] || Icons.BookOpen;
              return (
                <Link
                  key={rd.id}
                  to={`/domain/${rd.id}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-xl hover:border-blue-200 transition-all"
                >
                  <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <RdIcon size={22} />
                  </div>
                  <h3 className="mt-4 font-bold text-slate-900">{rd.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{rd.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    Explore <ArrowRight size={11} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
