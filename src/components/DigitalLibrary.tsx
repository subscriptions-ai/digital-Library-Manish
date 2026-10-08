import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DOMAINS } from "../constants";
import { HERO_IMAGES } from "./DomainLandingPage";
import { buttonClass } from "./ui";
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

function validCounts(data: unknown): Record<string, number> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0));
}

const ADVANCED_FEATURES = [
  {
    title: "Academic Search",
    desc: "Search academic records by title, author, subject, and department to find material relevant to your research.",
    icon: <Search size={28} aria-hidden="true" />
  },
  {
    title: "Optimized Document Delivery",
    desc: "Read available documents through the library viewer. Delivery depends on the source, document size, and your connection.",
    icon: <Zap size={28} aria-hidden="true" />
  },
  {
    title: "Metadata and Source-Quality Checks",
    desc: "Metadata validation and source checks support catalogue maintenance. Availability and rights information can vary by record and source.",
    icon: <Cpu size={28} aria-hidden="true" />
  },
  {
    title: "Secure Access Controls",
    desc: "Role-based and subscription-based controls manage access for individual users and institutions.",
    icon: <Lock size={28} aria-hidden="true" />
  }
];

const FUNCTIONALITIES = [
  {
    title: "Fully Functional Librarian Dashboard",
    desc: "Manage all your students, monitor institutional usage, and control access easily from a centralized and powerful admin panel.",
    icon: <ShieldCheck size={20} aria-hidden="true" />
  },
  {
    title: "Student Content Access Management",
    desc: "Fine-grained control over who accesses what. Assign specific departments, journals, and content types directly to individual students.",
    icon: <Settings size={20} aria-hidden="true" />
  },
  {
    title: "Smart 'Continue Reading' & Progress Tracking",
    desc: "Our system remembers exactly where you left off. Start reading a thesis on your laptop, and seamlessly resume on your phone.",
    icon: <Clock size={20} aria-hidden="true" />
  },
  {
    title: "Wishlisting & Personal Favorites",
    desc: "Users can effortlessly favorite journals, videos, and e-books to build their own personalized quick-access digital bookshelf.",
    icon: <Heart size={20} aria-hidden="true" />
  }
];

export function DigitalLibrary() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch content type counts
    fetch("/api/public/content-type-counts")
      .then(res => { if (!res.ok) throw new Error("Unavailable"); return res.json(); })
      .then(data => {
        setCounts(validCounts(data));
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching content counts:", err);
        setLoading(false);
      });

    // Fetch domain counts
    fetch("/api/public/domain-counts")
      .then(res => { if (!res.ok) throw new Error("Unavailable"); return res.json(); })
      .then(data => {
        setDomainCounts(validCounts(data));
      })
      .catch(err => {
        console.error("Error fetching domain counts:", err);
      });
  }, []);

  const OFFERINGS = [
    { name: "Journals", count: counts["Journals"], icon: <BookOpen size={24} aria-hidden="true" />, desc: "Peer-reviewed journals, held as full runs" },
    { name: "Articles", count: counts["Articles"], icon: <FileText size={24} aria-hidden="true" /> },
    { name: "Academic E-Books", count: counts["Books"], icon: <Book size={24} aria-hidden="true" /> },
    { name: "Research Theses", count: counts["Theses"], icon: <GraduationCap size={24} aria-hidden="true" /> },
    { name: "Conference Proceedings", count: counts["Conference Proceedings"], icon: <Presentation size={24} aria-hidden="true" /> },
    { name: "Educational Videos", count: counts["Educational Videos"], icon: <Video size={24} aria-hidden="true" /> },
    { name: "Subject Newsletters", count: counts["Newsletters"], icon: <Newspaper size={24} aria-hidden="true" /> }
  ];
  return (
    <div className="min-h-screen bg-surface">
      
      {/* ─── HERO SECTION ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy py-12 sm:py-16 lg:py-24">
        <div className="container-public relative">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p className="on-dark-fill on-dark-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
                <Network size={14} aria-hidden="true" className="text-amber" />
                Next-Generation Infrastructure
              </p>
              <h1 className="on-dark mt-4 text-5xl font-bold leading-tight">
                The Future of <br/>
                <span className="text-amber">
                  Academic Libraries
                </span>
              </h1>
              <p className="on-dark-2 mt-6 max-w-xl text-base leading-relaxed sm:text-lg">
                Built for modern academic discovery, with organized resources designed
                specifically for top-tier institutions, researchers, and forward-thinking librarians.
              </p>
              
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/signup" className={buttonClass("highlight", "lg")}>
                  Create a Free Account
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a 
                  href="#why-advanced" 
                  className="btn btn-lg on-dark on-dark-fill on-dark-edge"
                >
                  See the Tech Specs
                </a>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="relative hidden lg:block"
            >
              {/* Floating tech cards */}
              <div className="absolute -left-8 top-10 z-20 rounded-xl border border-white/10 bg-navy-2 p-4 shadow-[var(--shadow-pop)]">
                <div className="flex items-center gap-3">
                  <div className="on-dark-fill flex h-10 w-10 items-center justify-center rounded-full text-amber" aria-hidden="true">
                    <Database size={20} />
                  </div>
                  <div>
                    <div className="on-dark-3 text-xs font-semibold">Total Assets</div>
                    <div className="on-dark text-lg font-bold">30,000+</div>
                  </div>
                </div>
              </div>
              
              <div className="absolute -bottom-5 right-10 z-20 rounded-xl border border-white/10 bg-navy-2 p-4 shadow-[var(--shadow-pop)]">
                <div className="flex items-center gap-3">
                  <div className="on-dark-fill flex h-10 w-10 items-center justify-center rounded-full text-amber" aria-hidden="true">
                    <Zap size={20} />
                  </div>
                  <div>
                    <div className="on-dark-3 text-xs font-semibold">Latency</div>
                    <div className="on-dark text-lg font-bold">&lt; 45ms</div>
                  </div>
                </div>
              </div>

              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10">
                <img 
                  src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200" 
                  alt="" 
                  className="h-full w-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy via-transparent to-transparent"></div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── WHY WE ARE TECHNICALLY ADVANCED (The Edge) ────────────────────── */}
      <section id="why-advanced" className="scroll-mt-20 bg-surface py-16 sm:py-24">
        <div className="container-public">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">Academic Discovery</p>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              Built for Modern Academic Discovery
            </h2>
            <p className="mt-5 text-base text-ink-2 sm:text-lg">
              Search, structured metadata, and access controls support academic discovery.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
            {ADVANCED_FEATURES.map((feat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                className="card card-pad card-interactive"
              >
                <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  {feat.icon}
                </div>
                <h3 className="mb-3 text-xl font-bold text-ink">{feat.title}</h3>
                <p className="text-base leading-relaxed text-ink-2">{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT WE ARE OFFERING ─────────────────────────────────────────── */}
      <section className="bg-navy py-16 sm:py-24">
        <div className="container-public">
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber">Our Offerings</p>
              <h2 className="on-dark text-3xl font-bold sm:text-4xl">
                A Massive, Multi-Disciplinary Content Ecosystem
              </h2>
            </div>
            <Link to="/digital-library" className="btn on-dark on-dark-fill on-dark-edge shrink-0 self-start md:self-auto">
              Explore All Content
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {OFFERINGS.map((offer, i) => (
              <div 
                key={i}
                className="on-dark-fill on-dark-edge flex flex-col items-center rounded-xl border p-4 text-center sm:p-6"
              >
                <div className="on-dark-fill mb-4 flex h-14 w-14 items-center justify-center rounded-xl text-amber">
                  {offer.icon}
                </div>
                <div className="on-dark mb-1 text-2xl font-bold tnum">
                  {loading ? <span className="on-dark-fill inline-block h-6 w-16 animate-pulse rounded" aria-label="Loading"></span> : typeof offer.count === "number" ? offer.count.toLocaleString("en-IN") : "Browse resources"}
                </div>
                <div className="on-dark-2 text-xs font-semibold uppercase tracking-wide">{offer.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DOMAINS SECTION (Cards with Images) ───────────────────────────── */}
      <section id="departments" className="scroll-mt-24 bg-surface py-16 sm:py-24">
        <div className="container-public">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">Explore by Department</p>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              Dive into our Specialized Domains
            </h2>
            <p className="mt-5 text-base text-ink-2 sm:text-lg">
              Explore academic records organized by department, with source information where available.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {DOMAINS.map((domain, i) => {
              const bgImg = HERO_IMAGES[domain.id] || "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=900&q=80";
              // A count that did not arrive is left out rather than shown as 0.
              const count = domainCounts[domain.name];
              return (
                <Link
                  to={`/domain/${domain.id}`}
                  key={domain.id}
                  className="group relative flex h-56 flex-col justify-end overflow-hidden rounded-xl bg-surface-2 sm:h-64"
                >
                  <div className="absolute inset-0 z-0">
                    <img 
                      src={bgImg} 
                      alt="" 
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-transparent"></div>
                  </div>
                  <div className="relative z-10 p-5 sm:p-6">
                    <h3 className="on-dark mb-2 text-xl font-bold group-hover:underline">
                      {domain.name}
                    </h3>
                    {count !== undefined && (
                      <div className="on-dark-fill on-dark-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
                        <Database size={12} aria-hidden="true" />
                        {count.toLocaleString("en-IN")} Items Available
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── CORE FUNCTIONALITIES ───────────────────────────────────────────── */}
      <section className="bg-ground py-16 sm:py-24">
        <div className="container-public">
          <div className="mb-12 text-center sm:mb-16">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">Core Functionalities</p>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              Engineered for Institutional Control
            </h2>
          </div>

          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="order-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:order-1">
              {FUNCTIONALITIES.map((func, i) => (
                <div key={i} className="card card-pad">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    {func.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-ink">{func.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-2">{func.desc}</p>
                </div>
              ))}
            </div>
            
            <div className="order-1 lg:order-2">
              <div className="rounded-2xl bg-navy p-6 sm:p-10 lg:p-12">
                <h3 className="on-dark mb-5 text-2xl font-bold sm:text-3xl">Empowering Librarians</h3>
                <p className="on-dark-2 mb-8 leading-relaxed">
                  Our system isn't just a reading portal; it's a comprehensive digital asset management tool. We give you the dashboard needed to effortlessly handle hundreds of thousands of users and monitor engagement with pinpoint accuracy.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="shrink-0 text-amber" size={20} aria-hidden="true" />
                    <span className="on-dark font-semibold">One-Click IP Range Updates</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="shrink-0 text-amber" size={20} aria-hidden="true" />
                    <span className="on-dark font-semibold">Real-Time User Suspension</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="shrink-0 text-amber" size={20} aria-hidden="true" />
                    <span className="on-dark font-semibold">Automated Usage Reports</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────────────────────────────────── */}
      <section className="bg-navy py-16 sm:py-24">
        <div className="container-public max-w-4xl text-center">
          <div className="on-dark-fill mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl text-amber" aria-hidden="true">
            <Library size={32} />
          </div>
          <h2 className="on-dark mb-5 text-3xl font-bold sm:text-4xl">
            Ready to Modernise Your Institution?
          </h2>
          <p className="on-dark-2 mx-auto mb-8 max-w-2xl text-base sm:text-lg">
            Join the hundreds of forward-thinking universities and corporate R&D centers that trust our next-generation digital library platform.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/signup" className={buttonClass("highlight", "lg")}>
              Create a Free Account
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
