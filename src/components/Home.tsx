import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { DOMAINS, SUBSCRIPTION_PLANS, CONTENT_TYPES } from "../constants";
import { ArrowRight, BookOpen, ShieldCheck, Zap, Globe, Users, BarChart3, CheckCircle2, PlayCircle, FileText, GraduationCap, Newspaper, Mail, Book } from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "../lib/utils";

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
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 py-32 text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
          <div className="grid h-full w-full grid-cols-12 gap-4 opacity-10">
            {Array.from({ length: 144 }).map((_, i) => (
              <div key={i} className="h-24 border-b border-r border-white/20" />
            ))}
          </div>
        </div>
        
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block rounded-full bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-400 ring-1 ring-inset ring-blue-500/20">
                India's Premier Academic Hub
              </span>
              <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-7xl leading-[1.1]">
                Empowering <span className="text-blue-400">Academic Excellence</span> Through Digital Innovation.
              </h1>
              <p className="mt-8 text-lg leading-8 text-slate-300">
                Access a massive repository of 500+ journals, 10,000+ e-books, and research papers across 25+ domains. Designed for students, researchers, and world-class institutions.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link to="/signup" className="rounded-full bg-blue-600 px-8 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20">
                  Start Your Subscription
                </Link>
                <Link to="/create-quotation" className="rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-bold text-white hover:bg-white/10 transition-all backdrop-blur-sm flex items-center gap-2">
                  <FileText size={18} />
                  Create Quotation
                </Link>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="hidden lg:block relative"
            >
              <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-4 ring-1 ring-white/10">
                <div className="h-full w-full rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-white/10 overflow-hidden relative">
                  <img 
                    src="https://picsum.photos/seed/library/800/600" 
                    alt="Digital Library Interface" 
                    className="w-full h-full object-cover opacity-40"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white mb-4 shadow-xl shadow-blue-600/40">
                        <PlayCircle size={32} />
                      </div>
                      <h3 className="text-xl font-bold">Watch Platform Tour</h3>
                      <p className="text-sm text-slate-400 mt-2">See how STM Digital Library works</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
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
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">What is a Digital Library?</h2>
              <p className="mt-6 text-lg text-slate-600 leading-relaxed">
                A digital library is a specialized collection of digital objects—text, visual material, audio material, video material—stored as electronic media formats, along with means for organizing, storing, and retrieving the files and media contained in the library collection.
              </p>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">
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
                    <CheckCircle2 size={20} className="text-blue-600 shrink-0" />
                    <span className="text-slate-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Types Section */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Diverse Content for Every Need</h2>
            <p className="mt-4 text-lg text-slate-600">
              Our platform hosts a vast array of content types to support every stage of your academic and professional journey.
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CONTENT_TYPES.map((type) => {
              const Icon = contentTypeIconMap[type.icon] || Icons.Book;
              return (
                <div key={type.id} className="rounded-2xl bg-white p-8 border border-slate-200 hover:shadow-xl transition-all group">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Icon size={28} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{type.name}</h3>
                  <p className="mt-3 text-sm text-slate-500 leading-relaxed">{type.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { label: "Journals", value: "500+" },
              { label: "Articles", value: "100k+" },
              { label: "Institutions", value: "1,200+" },
              { label: "Authors", value: "25k+" }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-2">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Domains Showcase */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Academic Departments</h2>
              <p className="mt-4 text-lg text-slate-600">
                Explore specialized research across 25+ disciplines, each with curated content and unique insights.
              </p>
            </div>
            <Link to="/digital-library" className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700">
              View all 25+ departments <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DOMAINS.slice(0, 8).map((domain) => {
              const Icon = (Icons as any)[domain.icon] || Icons.Book;
              return (
                <Link 
                  key={domain.id} 
                  to={`/domain/${domain.id}`}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-6 transition-all hover:bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-sm">
                    <Icon size={24} />
                  </div>
                  <h3 className="mt-6 text-lg font-bold text-slate-900">{domain.name}</h3>
                  <p className="mt-2 text-sm text-slate-500 line-clamp-2">{domain.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    Explore Department <ArrowRight size={12} />
                  </div>
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
              
              <div className="mt-10 space-y-8">
                {[
                  { icon: ShieldCheck, title: "Verified Peer-Review", desc: "Rigorous quality control ensuring only high-quality research is published." },
                  { icon: Zap, title: "Instant IP-Based Access", desc: "Seamless access for all users within your institutional network." },
                  { icon: BarChart3, title: "Usage Analytics", desc: "Detailed insights into how your institution consumes research data." },
                  { icon: Globe, title: "Global Reach", desc: "Connect with authors and researchers from over 150 countries." }
                ].map((benefit, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                      <benefit.icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">{benefit.title}</h4>
                      <p className="mt-1 text-sm text-slate-400">{benefit.desc}</p>
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

      {/* Subscription Plans */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Subscription Plans</h2>
            <p className="mt-4 text-lg text-slate-600">
              Flexible options for individuals and institutions to access our vast repository.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <div key={plan.id} className={cn(
                "relative flex flex-col rounded-3xl border p-8 transition-all hover:shadow-xl",
                plan.userType === "Student" ? "border-blue-200 bg-white" : "border-slate-200 bg-white"
              )}>
                {plan.userType === "Student" && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    Best for Individuals
                  </span>
                )}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">{plan.description}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-900">Starting at</span>
                    <span className="text-3xl font-bold tracking-tight text-slate-900">₹{plan.pricing[0].price}</span>
                    <span className="text-sm font-medium text-slate-500">/{plan.pricing[0].duration.toLowerCase()}</span>
                  </div>
                </div>
                <ul className="mb-8 space-y-4 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-slate-600">
                      <ShieldCheck size={16} className="text-blue-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link to="/subscriptions" className={cn(
                  "w-full rounded-xl py-3 text-sm font-bold transition-all text-center",
                  plan.userType === "Student" ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-900 text-white hover:bg-slate-800"
                )}>
                  View All Plans
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Ready to advance your research?</h2>
          <p className="mt-6 text-lg text-blue-100 max-w-2xl mx-auto">
            Join thousands of researchers and students who trust STM Digital Library for their academic needs.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link to="/signup" className="rounded-full bg-white px-8 py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all">
              Create Free Account
            </Link>
            <Link to="/create-quotation" className="rounded-full border border-white/30 bg-white/10 px-8 py-4 text-sm font-bold text-white hover:bg-white/20 transition-all backdrop-blur-sm flex items-center gap-2">
              <FileText size={18} />
              Create Quotation
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
