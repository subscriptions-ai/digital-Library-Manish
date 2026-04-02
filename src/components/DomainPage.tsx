import { useParams, Link } from "react-router-dom";
import { DOMAINS, CONTENT_TYPES } from "../constants";
import { ChevronRight, CheckCircle2, Star, Users, Layout, ShieldCheck, Globe, Zap } from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "../lib/utils";
import { SubscriptionPlans } from "./SubscriptionPlans";
import { motion } from "motion/react";

export function DomainPage() {
  const { domainId } = useParams();
  const domain = DOMAINS.find(d => d.id === domainId);

  if (!domain) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900">Domain Not Found</h1>
          <p className="mt-4 text-slate-500">The domain you are looking for does not exist.</p>
          <Link to="/" className="mt-8 inline-block text-blue-600 font-bold">Return Home</Link>
        </div>
      </div>
    );
  }

  const Icon = (Icons as any)[domain.icon] || Icons.Book;

  const themeColors = {
    blue: "bg-blue-600 text-blue-600 border-blue-100 bg-blue-50",
    indigo: "bg-indigo-600 text-indigo-600 border-indigo-100 bg-indigo-50",
    red: "bg-red-600 text-red-600 border-red-100 bg-red-50",
    slate: "bg-slate-900 text-slate-900 border-slate-200 bg-slate-50",
    emerald: "bg-emerald-600 text-emerald-600 border-emerald-100 bg-emerald-50",
    orange: "bg-orange-600 text-orange-600 border-orange-100 bg-orange-50",
    pink: "bg-pink-600 text-pink-600 border-pink-100 bg-pink-50",
    amber: "bg-amber-600 text-amber-600 border-amber-100 bg-amber-50",
    rose: "bg-rose-600 text-rose-600 border-rose-100 bg-rose-50",
    purple: "bg-purple-600 text-purple-600 border-purple-100 bg-purple-50",
    cyan: "bg-cyan-600 text-cyan-600 border-cyan-100 bg-cyan-50",
    violet: "bg-violet-600 text-violet-600 border-violet-100 bg-violet-50",
    sky: "bg-sky-600 text-sky-600 border-sky-100 bg-sky-50",
    teal: "bg-teal-600 text-teal-600 border-teal-100 bg-teal-50",
    lime: "bg-lime-600 text-lime-600 border-lime-100 bg-lime-50",
    stone: "bg-stone-600 text-stone-600 border-stone-100 bg-stone-50",
    zinc: "bg-zinc-600 text-zinc-600 border-zinc-100 bg-zinc-50",
    neutral: "bg-neutral-600 text-neutral-600 border-neutral-100 bg-neutral-50",
    gray: "bg-gray-600 text-gray-600 border-gray-100 bg-gray-50",
    green: "bg-green-600 text-green-600 border-green-100 bg-green-50",
  };

  const colorSet = themeColors[domain.themeColor as keyof typeof themeColors] || themeColors.blue;
  const [bgClass, textClass, borderClass, lightBgClass] = colorSet.split(" ");

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumbs */}
      <div className="bg-slate-50 border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <nav className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
            <ChevronRight size={10} />
            <Link to="/digital-library" className="hover:text-slate-900 transition-colors">Digital Library</Link>
            <ChevronRight size={10} />
            <span className="text-slate-900">{domain.name}</span>
          </nav>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className={cn("absolute inset-0 opacity-5", bgClass)} />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <div className="flex-1 text-center lg:text-left">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-6", lightBgClass, textClass)}
              >
                <Icon size={16} />
                Academic Domain
              </motion.div>
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl"
              >
                {domain.name}
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-6 text-xl leading-relaxed text-slate-600"
              >
                {domain.description}
              </motion.p>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-10 flex flex-wrap justify-center lg:justify-start gap-4"
              >
                <a href="#subscription" className={cn("rounded-full px-8 py-4 text-sm font-bold text-white shadow-xl hover:opacity-90 transition-all", bgClass)}>
                  View Subscription Plans
                </a>
                <a href="#content-types" className="rounded-full border border-slate-200 bg-white px-8 py-4 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-all">
                  Explore Content Types
                </a>
              </motion.div>
            </div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 relative"
            >
              <div className={cn("aspect-square rounded-3xl overflow-hidden shadow-2xl relative border-4", borderClass)}>
                <img 
                  src={`https://picsum.photos/seed/${domain.id}/800/800`} 
                  alt={domain.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                <div className="absolute bottom-8 left-8 right-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                      <Star className="text-yellow-400" fill="currentColor" size={24} />
                    </div>
                    <div>
                      <div className="text-sm font-bold">Premium Repository</div>
                      <div className="text-xs opacity-80">Verified Academic Content</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Importance Section */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Importance in Academic & Industry</h2>
              <div className={cn("mt-4 h-1.5 w-20 rounded-full", bgClass)} />
              <p className="mt-8 text-lg text-slate-600 leading-relaxed">
                {domain.importance}
              </p>
              <div className="mt-10 grid sm:grid-cols-2 gap-6">
                {domain.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", lightBgClass, textClass)}>
                      <CheckCircle2 size={12} />
                    </div>
                    <span className="text-sm font-medium text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4 pt-12">
                <div className="aspect-[4/5] rounded-2xl bg-white p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
                  <Users className={textClass} size={32} />
                  <div>
                    <div className="text-2xl font-bold text-slate-900">10k+</div>
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Active Researchers</div>
                  </div>
                </div>
                <div className="aspect-square rounded-2xl bg-white p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
                  <Layout className={textClass} size={32} />
                  <div>
                    <div className="text-2xl font-bold text-slate-900">500+</div>
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">E-Books</div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="aspect-square rounded-2xl bg-white p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
                  <ShieldCheck className={textClass} size={32} />
                  <div>
                    <div className="text-2xl font-bold text-slate-900">100%</div>
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Verified Peer-Review</div>
                  </div>
                </div>
                <div className="aspect-[4/5] rounded-2xl bg-white p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
                  <Globe className={textClass} size={32} />
                  <div>
                    <div className="text-2xl font-bold text-slate-900">Global</div>
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Research Network</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Types Section */}
      <section id="content-types" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">What You Get in this Department</h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Subscribers gain full access to a diverse range of academic materials specifically curated for the {domain.name} domain.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CONTENT_TYPES.map((type) => {
              const info = domain.contentTypes.find(ct => ct.type === type.name) || { count: "100+", description: type.description };
              const TypeIcon = (Icons as any)[type.icon] || Icons.Book;
              return (
                <motion.div 
                  key={type.id}
                  whileHover={{ y: -5 }}
                  className="group p-8 rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-xl transition-all"
                >
                  <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center mb-6 transition-colors", lightBgClass, textClass, "group-hover:bg-slate-900 group-hover:text-white")}>
                    <TypeIcon size={28} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{type.name}</h3>
                  <div className={cn("mt-2 text-sm font-bold", textClass)}>{info.count} Available</div>
                  <p className="mt-4 text-sm text-slate-500 leading-relaxed">{type.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Subscribe & Benefits */}
      <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
        <div className={cn("absolute top-0 left-0 w-96 h-96 opacity-10 blur-[100px] rounded-full -translate-x-1/2 -translate-y-1/2", bgClass)} />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-20">
            <div>
              <h2 className="text-3xl font-bold sm:text-4xl">Why Subscribe to this Department?</h2>
              <p className="mt-6 text-lg text-slate-400 leading-relaxed">
                {domain.whySubscribe}
              </p>
              <div className="mt-12 space-y-8">
                <div className="flex gap-4">
                  <div className={cn("h-12 w-12 shrink-0 rounded-xl flex items-center justify-center", bgClass)}>
                    <Zap size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">Real-time Updates</h4>
                    <p className="mt-1 text-slate-400 text-sm">Get instant access to newly published research, journals, and conference papers as they are released.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className={cn("h-12 w-12 shrink-0 rounded-xl flex items-center justify-center", bgClass)}>
                    <Icons.Download size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">Offline Access</h4>
                    <p className="mt-1 text-slate-400 text-sm">Download textbooks, theses, and reports for offline reading and research anytime, anywhere.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className={cn("h-12 w-12 shrink-0 rounded-xl flex items-center justify-center", bgClass)}>
                    <Icons.Search size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">Advanced Search</h4>
                    <p className="mt-1 text-slate-400 text-sm">Powerful AI-driven search to find specific topics, authors, or citations within thousands of documents.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 md:p-12 border border-white/10">
              <h3 className="text-2xl font-bold mb-8">Target Audience</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {domain.whoShouldSubscribe.map((target, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3">
                    <div className={cn("h-2 w-2 rounded-full", bgClass)} />
                    <span className="text-sm font-medium text-slate-300">{target}</span>
                  </div>
                ))}
              </div>
              <div className="mt-12 pt-12 border-t border-white/10">
                <h3 className="text-xl font-bold mb-6">Subscription Benefits</h3>
                <ul className="space-y-4">
                  {[
                    "Unlimited downloads of all content types",
                    "Personalized research dashboard",
                    "Citation management tools",
                    "Early access to upcoming publications",
                    "Institutional usage analytics",
                    "Multi-device synchronization"
                  ].map((benefit, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-slate-400">
                      <CheckCircle2 className={textClass} size={16} />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Section */}
      <section id="subscription" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Subscription Plans for {domain.name}</h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Choose the plan that best fits your academic or institutional needs. All prices are in Indian Rupees (₹).
            </p>
          </div>
          
          <SubscriptionPlans domainId={domain.id} domainName={domain.name} />
          
          <div className="mt-16 p-8 rounded-3xl bg-blue-50 border border-blue-100 flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Custom Institutional Quote?</h3>
              <p className="text-slate-600 mt-2">For large universities and corporate R&D centers, we offer tailored pricing and multi-campus licenses.</p>
            </div>
            <Link to="/contact" className="rounded-full bg-slate-900 px-8 py-4 text-sm font-bold text-white hover:bg-slate-800 transition-all whitespace-nowrap">
              Contact Sales Team
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
