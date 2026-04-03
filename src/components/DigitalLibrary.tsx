import React from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
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
  Library
} from "lucide-react";

const BENEFITS = [
  {
    title: "Easy Access to Content",
    description: "Seamless IP-based authentication and remote access for students and faculty members.",
    icon: <Globe className="text-blue-600" size={24} />
  },
  {
    title: "Centralized Digital Library",
    description: "A single, unified platform to manage and access all your subscribed academic resources.",
    icon: <Library className="text-emerald-600" size={24} />
  },
  {
    title: "Cost-Effective Plans",
    description: "Flexible subscription models designed to provide maximum value for institutional budgets.",
    icon: <Zap className="text-amber-600" size={24} />
  },
  {
    title: "Usage Tracking & Reports",
    description: "Detailed analytics and COUNTER-compliant reports to monitor engagement and ROI.",
    icon: <BarChart3 className="text-purple-600" size={24} />
  },
  {
    title: "Multi-User Access",
    description: "Unlimited simultaneous access for your entire campus community without bottlenecks.",
    icon: <Users className="text-rose-600" size={24} />
  },
  {
    title: "Administrative Control",
    description: "Dedicated admin dashboard for librarians to manage users, access, and subscriptions.",
    icon: <ShieldCheck className="text-indigo-600" size={24} />
  }
];

const CATEGORIES = [
  { name: "Journals", icon: <FileText size={32} />, count: "2,500+" },
  { name: "Books", icon: <Book size={32} />, count: "10,000+" },
  { name: "Theses", icon: <GraduationCap size={32} />, count: "5,000+" },
  { name: "Conference Proceedings", icon: <Presentation size={32} />, count: "1,200+" },
  { name: "Videos", icon: <Video size={32} />, count: "800+" },
  { name: "Newsletters", icon: <Newspaper size={32} />, count: "450+" }
];

export function DigitalLibrary() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 py-24 text-white lg:py-32">
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-blue-600 blur-[120px]"></div>
          <div className="absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-indigo-600 blur-[120px]"></div>
        </div>
        
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5 text-sm font-bold text-blue-400 ring-1 ring-blue-500/20 mb-8"
            >
              <Library size={16} />
              For Institutions & Librarians
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl font-extrabold tracking-tight sm:text-6xl"
            >
              Digital Library Solutions for <span className="text-blue-500">Librarians</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8 text-xl text-slate-400 leading-relaxed"
            >
              Empower your institution with a world-class digital repository. Provide seamless access to thousands of peer-reviewed journals and academic resources with advanced administrative controls.
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-12 flex flex-wrap gap-4"
            >
              <Link 
                to="/institutional-access" 
                className="rounded-full bg-blue-600 px-8 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
              >
                Request Subscription
                <ArrowRight size={18} />
              </Link>
              <Link 
                to="/contact" 
                className="rounded-full border border-slate-700 bg-slate-800/50 px-8 py-4 text-sm font-bold text-white hover:bg-slate-800 transition-all backdrop-blur-sm"
              >
                Contact Us
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">About Our Digital Library</h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                STM Digital Library is a comprehensive, centralized platform designed specifically to meet the evolving needs of modern academic and research institutions. We bridge the gap between complex research data and end-user accessibility.
              </p>
              <p className="text-lg text-slate-600 leading-relaxed">
                Our platform hosts a vast repository of peer-reviewed journals, e-books, theses, and conference proceedings across 25+ specialized domains. We help libraries transition from physical stacks to a dynamic digital environment that supports 24/7 learning.
              </p>
              <div className="mt-10 space-y-4">
                {[
                  "Peer-reviewed academic content",
                  "Multi-disciplinary coverage",
                  "Institutional-grade infrastructure",
                  "User-friendly search & discovery"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="text-blue-600" size={20} />
                    <span className="font-semibold text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-3xl bg-slate-100 overflow-hidden shadow-2xl">
                <img 
                  src="https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&q=80&w=1000" 
                  alt="Modern Library" 
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -bottom-10 -left-10 rounded-2xl bg-white p-8 shadow-xl border border-slate-100 hidden md:block">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                    <Users size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">500+</p>
                    <p className="text-sm text-slate-500">Partner Institutions</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Benefits Section */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Key Benefits for Librarians</h2>
            <p className="text-lg text-slate-600">
              We understand the challenges librarians face in managing digital collections. Our platform is built to simplify your workflow.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {BENEFITS.map((benefit, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all"
              >
                <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-6">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">{benefit.title}</h3>
                <p className="text-slate-600 leading-relaxed">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Institutional Features */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[3rem] bg-slate-900 p-8 md:p-20 text-white overflow-hidden relative">
            <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-blue-600/20 to-transparent pointer-events-none"></div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-8">Institutional Access Features</h2>
                <div className="space-y-8">
                  {[
                    {
                      title: "IP-based Authentication",
                      desc: "Automatic access for everyone on your campus network without individual logins."
                    },
                    {
                      title: "Remote Access Solutions",
                      desc: "Support for Shibboleth, OpenAthens, and VPN access for off-campus researchers."
                    },
                    {
                      title: "Librarian Admin Control",
                      desc: "Manage user permissions, update institutional profile, and monitor subscriptions."
                    },
                    {
                      title: "Activity Tracking",
                      desc: "Real-time monitoring of user activity to understand content demand."
                    }
                  ].map((feature, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="mt-1 h-6 w-6 shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white">
                        <CheckCircle2 size={14} />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg mb-1">{feature.title}</h4>
                        <p className="text-slate-400">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-bold text-xl">Usage & Reporting</h3>
                  <BarChart3 className="text-blue-500" />
                </div>
                <p className="text-slate-400 mb-8 leading-relaxed">
                  Librarians can download COUNTER-compliant usage reports directly from the admin dashboard. Monitor engagement metrics, identify top-performing journals, and make data-driven decisions for your collection.
                </p>
                <div className="space-y-4">
                  <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full w-[85%] bg-blue-500"></div>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <span>Journal Engagement</span>
                    <span>85%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full w-[60%] bg-emerald-500"></div>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <span>E-Book Downloads</span>
                    <span>60%</span>
                  </div>
                </div>
                <button className="mt-10 w-full rounded-xl bg-white py-4 text-sm font-bold text-slate-900 hover:bg-slate-100 transition-all">
                  View Sample Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Categories */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Content Categories</h2>
            <p className="text-lg text-slate-600">Diverse academic content formats to support every research need.</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {CATEGORIES.map((cat, i) => (
              <div key={i} className="bg-white p-8 rounded-3xl border border-slate-200 text-center hover:border-blue-300 hover:shadow-lg transition-all group">
                <div className="h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  {cat.icon}
                </div>
                <h4 className="font-bold text-slate-900 mb-2">{cat.name}</h4>
                <p className="text-xs font-bold text-blue-600">{cat.count}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Subscription Model */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  { title: "Annual Plans", desc: "Standard 1-year access for single or multiple domains." },
                  { title: "Multi-Year", desc: "Locked-in pricing for 3-5 years with significant savings." },
                  { title: "Custom Packages", desc: "Tailored content selection for specific departments." },
                  { title: "FTE Based", desc: "Pricing scaled to your institution's size and needs." }
                ].map((plan, i) => (
                  <div key={i} className="p-6 rounded-2xl border border-slate-100 bg-slate-50">
                    <h4 className="font-bold text-slate-900 mb-2">{plan.title}</h4>
                    <p className="text-sm text-slate-600">{plan.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Flexible Subscription Model</h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                We offer transparent and flexible pricing models that cater to institutions of all sizes. Whether you are a small specialized college or a large multi-campus university, we have a plan that fits.
              </p>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-slate-700 font-medium">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  No hidden platform fees
                </li>
                <li className="flex items-center gap-3 text-slate-700 font-medium">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  Free administrative training
                </li>
                <li className="flex items-center gap-3 text-slate-700 font-medium">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  Complimentary metadata for discovery
                </li>
              </ul>
              <Link to="/subscriptions" className="text-blue-600 font-bold hover:underline flex items-center gap-2">
                View Detailed Pricing
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-blue-600 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-8">Ready to Upgrade Your Library?</h2>
          <p className="text-xl text-blue-100 mb-12 max-w-2xl mx-auto">
            Join hundreds of institutions worldwide that trust STM Digital Library for their academic resource needs.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link 
              to="/contact" 
              className="rounded-full bg-white px-10 py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all shadow-xl"
            >
              Request a Demo
            </Link>
            <Link 
              to="/institutional-access" 
              className="rounded-full bg-blue-700 px-10 py-4 text-sm font-bold text-white hover:bg-blue-800 transition-all border border-blue-500"
            >
              Get a Quote
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
