import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { DOMAINS, SUBSCRIPTION_PLANS, CONTENT_TYPES } from "../constants";
import { ArrowRight, BookOpen, ShieldCheck, Zap, Globe, Users, BarChart3, CheckCircle2, PlayCircle, FileText, GraduationCap, Newspaper, Mail, Book, Search } from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "../lib/utils";
import { KnowledgeCore3D } from "./KnowledgeCore3D";

const contentTypeIconMap: Record<string, any> = {
  Book,
  Newspaper,
  BookOpen: Icons.BookOpen,
  FileText,
  GraduationCap,
  Users,
  Video: Icons.Video,
  Mail,
};

export function Home() {
  const [mousePosition, setMousePosition] = useState({ x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0 });
  const [centerOffset, setCenterOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePosition({ x, y });
    setCenterOffset({
      x: x - rect.width / 2,
      y: y - rect.height / 2
    });
  };

  const statsData = [
    { label: "Proprietary Journals", value: "250+" },
    { label: "Resources", value: "Curated" },
    { label: "Institutions", value: "1,200+" },
    { label: "Years of Trust", value: "21+" }
  ];

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section
        className="relative overflow-hidden bg-[#0a0f1c] min-h-[calc(100vh-80px)] flex items-center py-12 lg:py-0 text-white"
        onMouseMove={handleMouseMove}
      >
        {/* Full Screen 3D Background */}
        <div className="absolute inset-0 z-0">
          <KnowledgeCore3D />
        </div>

        {/* Cursor Responsive Glowing Orbs - Vortex Core */}
        <motion.div
          className="pointer-events-none absolute left-0 top-0 w-[30rem] h-[30rem] rounded-full bg-blue-500/20 blur-[120px] z-0 mix-blend-screen"
          animate={{
            x: mousePosition.x - 240,
            y: mousePosition.y - 240,
            scale: 1 + Math.abs(centerOffset.x * 0.001)
          }}
          transition={{ type: "tween", ease: "easeOut", duration: 0.2 }}
        />
        <motion.div
          className="pointer-events-none absolute left-0 top-0 w-[40rem] h-[40rem] rounded-full bg-indigo-600/15 blur-[150px] z-0 mix-blend-screen"
          animate={{
            x: mousePosition.x - 320,
            y: mousePosition.y - 320,
            scale: 1 + Math.abs(centerOffset.y * 0.001)
          }}
          transition={{ type: "tween", ease: "easeOut", duration: 0.8 }}
        />

        {/* Vortex Grid Layers */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 mix-blend-screen opacity-50">
          {/* Deep layer - Slow Clockwise Twist */}
          <motion.div
            className="absolute inset-[-50%] w-[200%] h-[200%] bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:60px_60px] origin-center"
            animate={{
              x: centerOffset.x * -0.02,
              y: centerOffset.y * -0.02,
              rotate: centerOffset.x * 0.02
            }}
            transition={{ type: "tween", ease: "easeOut", duration: 1.2 }}
          />

          {/* Mid layer - Fast Counter-Clockwise Twist */}
          <motion.div
            className="absolute inset-[-50%] w-[200%] h-[200%] bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:50px_50px] origin-center"
            animate={{
              x: centerOffset.x * -0.04,
              y: centerOffset.y * -0.04,
              rotate: centerOffset.x * -0.04
            }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.8 }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full pointer-events-none">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

            {/* Text Content */}
            <div className="lg:col-span-6 text-left relative z-10 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-4 backdrop-blur-sm"
              >
                <Icons.Sparkles className="w-4 h-4" />
                <span>India's Premier Academic Hub</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.15]"
              >
                Empowering <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Academic Excellence</span><br />
                Through Digital Innovation.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="mt-6 text-lg leading-relaxed text-slate-300 max-w-[480px] drop-shadow-md"
              >
                A curated academic platform combining proprietary publications and legally sourced open-access research. Designed for students, researchers, and world-class institutions.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-8 flex flex-col sm:flex-row gap-4"
              >
                <Link to="/journals" className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2">
                  <Search className="w-5 h-5" />
                  Explore Library
                </Link>
                <Link to="/contact" className="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-all border border-slate-700 flex items-center justify-center gap-2">
                  <Users className="w-5 h-5" />
                  Institutional Access
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-6 rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-sm p-4 max-w-[480px]"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-relaxed">
                  Content includes proprietary publications and legally sourced open-access materials from trusted repositories.
                </p>
              </motion.div>
            </div>

          </div>
        </div>
      </section>

      {/* What is a Digital Library Section */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4 pt-8">
                  <div className="rounded-2xl bg-blue-50 p-6 shadow-sm">
                    <h4 className="font-bold text-blue-600">24/7 Access</h4>
                    <p className="text-sm text-slate-600 mt-2">No physical boundaries. Research anytime from anywhere in India.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-900 p-6 text-white">
                    <h4 className="font-bold text-blue-400">Searchable</h4>
                    <p className="text-sm text-slate-400 mt-2">Find specific data points across millions of pages in seconds.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-100 p-6">
                    <h4 className="font-bold text-slate-900">Cost Effective</h4>
                    <p className="text-sm text-slate-600 mt-2">Save thousands on physical books and journal subscriptions.</p>
                  </div>
                  <div className="rounded-2xl bg-blue-600 p-6 text-white">
                    <h4 className="font-bold">Eco-Friendly</h4>
                    <p className="text-sm text-blue-100 mt-2">Reducing paper waste while preserving global knowledge.</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">What is a Digital Library?</h2>
              <p className="mt-6 text-sm text-slate-600 leading-relaxed">
                A digital library is a specialized collection of digital objects—text, visual material, audio material, video material—stored as electronic media formats, along with means for organizing, storing, and retrieving the files and media contained in the library collection.
              </p>
              <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                In today's academic world, it is the backbone of research, providing instant access to peer-reviewed content that drives innovation and academic success.
              </p>
              <div className="mt-8 flex flex-col gap-4">
                {[
                  "Centralized hub for all academic content types",
                  "Advanced indexing for precise research retrieval",
                  "Collaborative tools for research teams",
                  "Seamless integration with institutional LMS"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-blue-600 text-blue-600">
                      <CheckCircle2 size={12} className="shrink-0" />
                    </div>
                    <span className="text-[13px] text-slate-600 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Transparency Section */}
      <section className="bg-slate-900 py-24 relative overflow-hidden">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
          <ShieldCheck size={400} className="text-white" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-extrabold text-white">Content Transparency</h2>
            <p className="mt-4 text-[13px] text-slate-400 max-w-xl mx-auto">
              We maintain high standards of transparency regarding our content sources and collection methods.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Proprietary Content */}
            <div className="rounded-[40px] bg-slate-800/50 p-10 border border-white/5 backdrop-blur-sm">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Proprietary Content</h3>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">STM Digital Library</p>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { title: "STM Journals", desc: "Our own published peer-reviewed journals." },
                  { title: "Conference Proceedings", desc: "Exclusive materials from partner academic conferences." },
                  { title: "Academic Books", desc: "Curated collection of proprietary educational titles." },
                  { title: "Educational Videos", desc: "In-house produced technical and academic lectures." }
                ].map((item, i) => (
                  <div key={i} className="group rounded-2xl bg-white/5 p-5 border border-white/5 hover:bg-white/10 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                        {i === 0 && <Newspaper size={16} />}
                        {i === 1 && <Users size={16} />}
                        {i === 2 && <Book size={16} />}
                        {i === 3 && <PlayCircle size={16} />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{item.title}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Open Access Content */}
            <div className="rounded-[40px] bg-white p-10 shadow-2xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Globe size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Open Access Sources</h3>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Legally Aggregated Content</p>
                </div>
              </div>

              <p className="text-[13px] text-slate-500 leading-relaxed mb-8">
                We aggregate research papers and academic content from reputable open-access repositories, ensuring they are legally sourced and properly indexed for your convenience.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  "Academic Repositories",
                  "Government Portals",
                  "Open Data Sources",
                  "University Archives",
                  "Trusted OA Hubs",
                  "Public Domain Works"
                ].map((source, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-600">{source}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl bg-emerald-50/50 p-5 border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-700 leading-normal uppercase tracking-wider text-center">
                  Subscription fees cover software services, indexing, platform maintenance, and integrated academic tools—not the ownership of open-access materials.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Types Section */}
      <section className="bg-white py-24 border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Diverse Content for Every Need</h2>
            <p className="mt-4 text-sm text-slate-500 max-w-2xl mx-auto">
              Our platform hosts a vast array of content types to support every stage of your academic and professional journey.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CONTENT_TYPES.map((type) => {
              const Icon = contentTypeIconMap[type.icon] || Icons.Book;
              return (
                <div key={type.id} className="rounded-3xl bg-white p-8 border border-slate-100 hover:shadow-2xl transition-all group">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-colors">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{type.name}</h3>
                  <p className="mt-3 text-[13px] text-slate-500 leading-relaxed line-clamp-3">{type.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {statsData.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-extrabold text-slate-900 tracking-tight">{stat.value}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-3">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Domains Showcase */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="max-w-2xl text-left">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Academic Departments</h2>
              <p className="mt-4 text-[13px] text-slate-500 max-w-lg">
                Explore specialized research across 25+ disciplines, each with curated content and unique insights.
              </p>
            </div>
            <Link to="/digital-library" className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest">
              View all 25+ departments <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DOMAINS.slice(0, 8).map((domain) => {
              const Icon = (Icons as any)[domain.icon] || Icons.Book;
              return (
                <Link
                  key={domain.id}
                  to={`/domain/${domain.id}`}
                  className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 transition-all hover:shadow-2xl hover:-translate-y-1"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <Icon size={22} />
                  </div>
                  <h3 className="mt-8 text-base font-extrabold text-slate-900">{domain.name}</h3>
                  <p className="mt-2 text-[12px] text-slate-500 leading-relaxed line-clamp-2">{domain.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-slate-900 py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Why Institutions Choose Us?</h2>
              <p className="mt-6 text-lg text-slate-300">
                We provide a comprehensive ecosystem for academic excellence, ensuring your students and faculty have the best resources at their fingertips.
              </p>

              <div className="mt-12 space-y-6">
                {[
                  { icon: ShieldCheck, title: "Quality Benchmarks", desc: "Standardized review processes for our proprietary collections." },
                  { icon: Search, title: "Discovery Tools", desc: "Advanced indexing and search across all content sources." },
                  { icon: BarChart3, title: "Usage Analytics", desc: "Detailed insights into how your institution consumes research data." },
                  { icon: Zap, title: "Integrated Features", desc: "Access platform tools for citation, bookmarking, and discovery." }
                ].map((benefit, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-blue-400 border border-white/10">
                      <benefit.icon size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{benefit.title}</h4>
                      <p className="mt-1 text-[13px] text-slate-400">{benefit.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-8 ring-1 ring-white/10">
                <div className="h-full w-full rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-white/10 p-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                      <Users className="text-white" size={24} />
                    </div>
                    <div>
                      <div className="text-sm font-bold">Librarian Dashboard</div>
                      <div className="text-xs text-slate-400">Manage institutional access</div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 w-3/4 rounded bg-slate-700" />
                    <div className="h-4 w-1/2 rounded bg-slate-700" />
                    <div className="grid grid-cols-3 gap-4 mt-8">
                      <div className="h-20 rounded-lg bg-slate-700/50" />
                      <div className="h-20 rounded-lg bg-slate-700/50" />
                      <div className="h-20 rounded-lg bg-slate-700/50" />
                    </div>
                    <div className="h-32 w-full rounded-lg bg-blue-500/10 border border-blue-500/20 mt-8 flex items-center justify-center">
                      <BarChart3 className="text-blue-400 opacity-50" size={48} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-24 border-t border-white/5">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-[-10%] w-[40rem] h-[40rem] bg-blue-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '5s' }}></div>
          <div className="absolute bottom-0 right-[-10%] w-[40rem] h-[40rem] bg-indigo-500/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '7s' }}></div>
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl drop-shadow-md">Ready to advance your research?</h2>
          <p className="mt-6 text-base text-blue-200 max-w-2xl mx-auto opacity-90">
            Join thousands of researchers and students who trust STM Digital Library for their academic needs.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Link to="/subscriptions" className="rounded-full bg-white px-10 py-4 text-sm font-bold text-slate-900 hover:bg-slate-100 transition-all shadow-[0_0_40px_rgba(59,130,246,0.3)] hover:scale-105 hover:shadow-[0_0_60px_rgba(59,130,246,0.5)]">
              View Subscription Plans
            </Link>
            <Link to="/signup" className="rounded-full border border-white/20 bg-white/5 backdrop-blur-md px-10 py-4 text-sm font-bold text-white hover:bg-white/10 transition-all hover:scale-105">
              Create Free Account
            </Link>
            <Link to="/create-quotation" className="rounded-full border border-white/10 bg-transparent px-10 py-4 text-sm font-bold text-white/70 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2 hover:scale-105">
              <FileText size={18} />
              Create Quotation
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
