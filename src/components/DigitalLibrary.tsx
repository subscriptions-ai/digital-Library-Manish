import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DOMAINS } from "../constants";
import { HERO_IMAGES } from "./DomainLandingPage";
import { 
  BookOpen, 
  ShieldCheck, 
  BarChart3, 
  Users, 
  Globe, 
  Zap, 
  CheckCircle2, 
  ArrowRight,
  Book,
  FileText,
  Video,
  Newspaper,
  GraduationCap,
  Presentation,
  Library,
  Cpu,
  Search,
  Lock,
  Layers,
  Database,
  Network,
  Settings,
  Heart,
  Clock
} from "lucide-react";

const ADVANCED_FEATURES = [
  {
    title: "AI-Powered Semantic Search",
    desc: "Unlike traditional keyword-based systems, our neural search understands the context of your query, finding highly relevant research papers and datasets in milliseconds.",
    icon: <Search className="text-blue-500" size={28} />
  },
  {
    title: "Proprietary 8KB Stream-Limit Engine",
    desc: "Load heavy 100MB+ academic PDFs instantly. Our custom streaming architecture processes documents chunk-by-chunk for zero-latency reading, bypassing standard network timeouts.",
    icon: <Zap className="text-amber-500" size={28} />
  },
  {
    title: "Automated Metadata Validation",
    desc: "Our continuous AI background workers scrub and validate data links 24/7, ensuring 100% active, non-duplicate content across our entire massive repository.",
    icon: <Cpu className="text-emerald-500" size={28} />
  },
  {
    title: "Military-Grade DRM & Access",
    desc: "State-of-the-art encryption combined with dynamic IP-based and Shibboleth/OpenAthens authentication, ensuring airtight institutional data security.",
    icon: <Lock className="text-rose-500" size={28} />
  }
];

const FUNCTIONALITIES = [
  {
    title: "Fully Functional Librarian Dashboard",
    desc: "Manage all your students, monitor institutional usage, and control access easily from a centralized and powerful admin panel.",
    icon: <ShieldCheck size={20} className="text-white" />
  },
  {
    title: "Student Content Access Management",
    desc: "Fine-grained control over who accesses what. Assign specific departments, journals, and content types directly to individual students.",
    icon: <Settings size={20} className="text-white" />
  },
  {
    title: "Smart 'Continue Reading' & Progress Tracking",
    desc: "Our system remembers exactly where you left off. Start reading a thesis on your laptop, and seamlessly resume on your phone.",
    icon: <Clock size={20} className="text-white" />
  },
  {
    title: "Wishlisting & Personal Favorites",
    desc: "Users can effortlessly favorite journals, videos, and e-books to build their own personalized quick-access digital bookshelf.",
    icon: <Heart size={20} className="text-white" />
  }
];

export function DigitalLibrary() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch content type counts
    fetch("/api/public/content-type-counts")
      .then(res => res.json())
      .then(data => {
        setCounts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching content counts:", err);
        setLoading(false);
      });

    // Fetch domain counts
    fetch("/api/public/domain-counts")
      .then(res => res.json())
      .then(data => {
        setDomainCounts(data);
      })
      .catch(err => {
        console.error("Error fetching domain counts:", err);
      });
  }, []);

  const OFFERINGS = [
    { name: "Periodicals", count: counts["Periodicals"] ?? 0, icon: <FileText size={24} />, color: "text-indigo-600", bg: "bg-indigo-100" },
    { name: "Academic E-Books", count: counts["Books"] ?? 0, icon: <Book size={24} />, color: "text-blue-600", bg: "bg-blue-100" },
    { name: "Research Theses", count: counts["Theses"] ?? 0, icon: <GraduationCap size={24} />, color: "text-emerald-600", bg: "bg-emerald-100" },
    { name: "Conference Proceedings", count: counts["Conference Proceedings"] ?? 0, icon: <Presentation size={24} />, color: "text-amber-600", bg: "bg-amber-100" },
    { name: "Educational Videos", count: counts["Educational Videos"] ?? 0, icon: <Video size={24} />, color: "text-rose-600", bg: "bg-rose-100" },
    { name: "Subject Newsletters", count: counts["Newsletters"] ?? 0, icon: <Newspaper size={24} />, color: "text-teal-600", bg: "bg-teal-100" }
  ];
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-500 selection:text-white">
      
      {/* ─── HERO SECTION (Dark & High-Tech) ───────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0A0F1C] pt-32 pb-20 lg:pt-40 lg:pb-32">
        {/* Dynamic Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/20 blur-[120px]"></div>
          <div className="absolute bottom-0 right-1/4 h-[600px] w-[600px] translate-x-1/3 translate-y-1/3 rounded-full bg-indigo-600/20 blur-[150px]"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
        </div>
        
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-400 mb-6">
                <Network size={14} />
                Next-Generation Infrastructure
              </div>
              <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.1]">
                The Future of <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                  Academic Libraries
                </span>
              </h1>
              <p className="mt-6 text-lg text-slate-400 leading-relaxed max-w-xl">
                We don't just store static files. We engineer advanced digital ecosystems. 
                Experience the market's most technically advanced repository, designed 
                specifically for top-tier institutions, researchers, and forward-thinking librarians.
              </p>
              
              <div className="mt-10 flex flex-wrap gap-4">
                <Link 
                  to="/request-demo" 
                  className="group relative flex items-center gap-2 rounded-full bg-blue-600 px-8 py-4 text-sm font-bold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                >
                  Experience the Demo
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <a 
                  href="#why-advanced" 
                  className="rounded-full border border-slate-700 bg-slate-800/50 px-8 py-4 text-sm font-bold text-slate-300 transition-all hover:bg-slate-800 hover:text-white backdrop-blur-sm"
                >
                  See the Tech Specs
                </a>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              {/* Floating tech cards */}
              <div className="absolute top-10 -left-10 z-20 animate-bounce-slow rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <Database size={20} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400">Total Assets</div>
                    <div className="text-lg font-bold text-white">30,000+</div>
                  </div>
                </div>
              </div>
              
              <div className="absolute -bottom-5 right-10 z-20 animate-bounce-slow-delayed rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                    <Zap size={20} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400">Latency</div>
                    <div className="text-lg font-bold text-white">&lt; 45ms</div>
                  </div>
                </div>
              </div>

              <div className="aspect-[4/3] overflow-hidden rounded-3xl border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                <img 
                  src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200" 
                  alt="High Tech Data" 
                  className="h-full w-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-transparent to-transparent"></div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── WHY WE ARE TECHNICALLY ADVANCED (The Edge) ────────────────────── */}
      <section id="why-advanced" className="py-24 bg-white relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-sm font-bold tracking-widest text-blue-600 uppercase mb-3">Our Competitive Edge</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Why We Are Technically Advanced Than Others in the Market
            </h3>
            <p className="mt-5 text-lg text-slate-600">
              Legacy library systems rely on outdated databases and slow monolithic servers. 
              We rebuilt the academic repository from the ground up using modern AI and streaming technologies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            {ADVANCED_FEATURES.map((feat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group relative rounded-3xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-2xl hover:border-blue-200 transition-all duration-300"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  {feat.icon}
                </div>
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 shadow-inner group-hover:bg-blue-50 transition-colors">
                  {feat.icon}
                </div>
                <h4 className="text-xl font-bold text-slate-900 mb-3">{feat.title}</h4>
                <p className="text-slate-600 leading-relaxed text-base">{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT WE ARE OFFERING (Bento Box) ─────────────────────────────── */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500 via-slate-900 to-slate-900"></div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-sm font-bold tracking-widest text-blue-400 uppercase mb-3">Our Offerings</h2>
              <h3 className="text-3xl font-extrabold sm:text-4xl">
                A Massive, Multi-Disciplinary Content Ecosystem
              </h3>
            </div>
            <Link to="/digital-library" className="shrink-0 rounded-full border border-slate-600 px-6 py-3 text-sm font-bold hover:bg-white hover:text-slate-900 transition-colors">
              Explore All Content
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {OFFERINGS.filter(offer => loading || offer.count > 0).map((offer, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="flex flex-col items-center text-center rounded-3xl bg-slate-800/50 border border-slate-700/50 p-6 backdrop-blur-sm"
              >
                <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${offer.bg} ${offer.color}`}>
                  {offer.icon}
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {loading ? <span className="animate-pulse bg-slate-700 h-6 w-16 rounded inline-block"></span> : `${offer.count.toLocaleString("en-IN")}+`}
                </div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{offer.name}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DOMAINS SECTION (Cards with Images) ───────────────────────────── */}
      <section className="py-24 bg-white relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-sm font-bold tracking-widest text-indigo-600 uppercase mb-3">Explore by Department</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Dive into our Specialized Domains
            </h3>
            <p className="mt-5 text-lg text-slate-600">
              Access highly curated, peer-reviewed content meticulously organized across 25+ specialized academic departments.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {DOMAINS.map((domain, i) => {
              const bgImg = HERO_IMAGES[domain.id] || "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=900&q=80";
              const count = domainCounts[domain.name] || 0;
              return (
                <Link
                  to={`/domain/${domain.id}`}
                  key={domain.id}
                  className="group relative overflow-hidden rounded-3xl bg-slate-100 shadow-md hover:shadow-2xl transition-all h-64 flex flex-col justify-end"
                >
                  <div className="absolute inset-0 z-0">
                    <img 
                      src={bgImg} 
                      alt={domain.name} 
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>
                  </div>
                  <div className="relative z-10 p-6">
                    <h4 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                      {domain.name}
                    </h4>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-200 backdrop-blur-md">
                      <Database size={12} />
                      {count.toLocaleString("en-IN")} Items Available
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── CORE FUNCTIONALITIES ───────────────────────────────────────────── */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-sm font-bold tracking-widest text-indigo-600 uppercase mb-3">Core Functionalities</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Engineered for Institutional Control
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {FUNCTIONALITIES.map((func, i) => (
                <div key={i} className="rounded-3xl bg-white p-6 shadow-md border border-slate-100">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/30">
                    {func.icon}
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">{func.title}</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">{func.desc}</p>
                </div>
              ))}
            </div>
            
            <div className="order-1 lg:order-2">
              <div className="rounded-[2.5rem] bg-indigo-600 p-10 sm:p-14 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"></div>
                <h3 className="text-3xl font-bold mb-6 relative z-10">Empowering Librarians</h3>
                <p className="text-indigo-100 mb-8 leading-relaxed relative z-10">
                  Our system isn't just a reading portal; it's a comprehensive digital asset management tool. We give you the dashboard needed to effortlessly handle hundreds of thousands of users and monitor engagement with pinpoint accuracy.
                </p>
                <ul className="space-y-4 relative z-10">
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="text-indigo-300" size={20} />
                    <span className="font-semibold">One-Click IP Range Updates</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="text-indigo-300" size={20} />
                    <span className="font-semibold">Real-Time User Suspension</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="text-indigo-300" size={20} />
                    <span className="font-semibold">Automated Usage Reports</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────────────────────────────────── */}
      <section className="py-24 bg-white border-t border-slate-200">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 mb-8">
            <Library size={40} />
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-6">
            Ready to Modernise Your Institution?
          </h2>
          <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
            Join the hundreds of forward-thinking universities and corporate R&D centers that trust our next-generation digital library platform.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              to="/request-demo" 
              className="rounded-full bg-blue-600 px-10 py-4 text-base font-bold text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 transition-all"
            >
              Request a Guided Demo
            </Link>
            <Link
              to="/institutional-access"
              className="rounded-full border-2 border-slate-200 bg-white px-10 py-4 text-base font-bold text-slate-700 hover:border-blue-600 hover:text-blue-600 transition-all"
            >
              Request Institutional Access
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
