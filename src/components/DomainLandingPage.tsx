import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DOMAINS, SUBSCRIPTION_PLANS } from "../constants";
import * as Icons from "lucide-react";
import {
  BookOpen, ChevronRight, Loader2, Check, ShoppingCart,
  AlertCircle, Zap, Download, Search, Users, Shield, Globe,
  RefreshCw, CheckCircle2, Send, ArrowLeft, ArrowRight,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { SubscriptionPlans } from "./SubscriptionPlans";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContentSummaryItem { type: string; count: number; }

interface PricingModule {
  id: string; type: string; userType: string;
  monthlyPrice: number; quarterlyPrice: number;
  halfYearlyPrice: number; yearlyPrice: number;
  yearlyDiscountPct: number; totalCount: number; visible: boolean;
  name?: string; description?: string; features?: string[];
}

interface DomainData {
  content_summary: ContentSummaryItem[];
  pricing_modules: PricingModule[];
}

// ─── Plan options ─────────────────────────────────────────────────────────────
const PLAN_OPTIONS = ["Monthly", "Quarterly", "Half-Yearly", "Yearly"] as const;
type PlanType = typeof PLAN_OPTIONS[number];

function priceForPlan(m: PricingModule, plan: PlanType) {
  if (plan === "Yearly")      return m.yearlyPrice;
  if (plan === "Half-Yearly") return m.halfYearlyPrice;
  if (plan === "Quarterly")   return m.quarterlyPrice;
  return m.monthlyPrice;
}

// ─── Domain → Unsplash hero image map ────────────────────────────────────────
const HERO_IMAGES: Record<string, string> = {
  "electrical-engineering":    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=900&q=80",
  "computer-it":               "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=900&q=80",
  "medical-sciences":          "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=900&q=80",
  "management":                "https://images.unsplash.com/photo-1552664730-d307ca884978?w=900&q=80",
  "chemistry":                 "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=900&q=80",
  "mechanical-engineering":    "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=900&q=80",
  "pharmacy":                  "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=900&q=80",
  "civil-construction":        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&q=80",
  "nano-technology":           "https://images.unsplash.com/photo-1628595351029-c2bf17511435?w=900&q=80",
  "bio-technology":            "https://images.unsplash.com/photo-1576086213369-97a306d36557?w=900&q=80",
  "energy":                    "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=900&q=80",
  "life-sciences":             "https://images.unsplash.com/photo-1530210124550-912dc1381cb8?w=900&q=80",
  "law":                       "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=900&q=80",
  "agriculture":               "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=900&q=80",
  "nursing":                   "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=900&q=80",
  "education-social-sciences": "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=900&q=80",
  "applied-sciences":          "https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=900&q=80",
  "multidisciplinary":         "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=900&q=80",
  "electronics-telecommunication": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80",
  "chemical-engineering":      "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=900&q=80",
  "ayurveda":                  "https://images.unsplash.com/photo-1620662955757-e9b7e820e5da?w=900&q=80",
  "architecture":              "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=900&q=80",
  "material-science":          "https://images.unsplash.com/photo-1548783300-1c4c8f6c5b72?w=900&q=80",
  "applied-mechanics":         "https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=900&q=80",
  "social-sciences":           "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&q=80",
};

// ─── Content type icon + description map ─────────────────────────────────────
const CT_META: Record<string, { icon: any; desc: string }> = {
  Books:                   { icon: Icons.Book,          desc: "Textbooks, reference materials, and specialized e-books." },
  Periodicals:             { icon: Icons.Newspaper,     desc: "Peer-reviewed technical journals and academic bulletins." },
  Magazines:               { icon: Icons.BookOpen,      desc: "Academic and subject-focused issues for broader perspectives." },
  "Case Reports":          { icon: Icons.FileText,      desc: "Detailed clinical, engineering, and legal case studies." },
  Theses:                  { icon: Icons.GraduationCap, desc: "Original UG, PG, and PhD research work and dissertations." },
  "Conference Proceedings":{ icon: Icons.Users,         desc: "Papers from national and international academic conferences." },
  "Educational Videos":    { icon: Icons.Video,         desc: "Expert lectures, tutorials, and academic webinars." },
  Newsletters:             { icon: Icons.Mail,          desc: "Regular institutional and departmental research updates." },
};

// ─── Stat items for importance section ───────────────────────────────────────
const STAT_ITEMS = [
  { icon: Users,  stat: "10k+",  label: "ACTIVE RESEARCHERS" },
  { icon: Shield, stat: "100%",  label: "VERIFIED PEER-REVIEW" },
  { icon: Globe,  stat: "Global",label: "RESEARCH NETWORK" },
];

// ─── Why Subscribe features ───────────────────────────────────────────────────
const WHY_FEATURES = [
  { icon: Zap,      title: "Real-time Updates",  desc: "Get instant access to newly published research, journals, and conference papers as they are released." },
  { icon: Download, title: "Offline Access",      desc: "Download textbooks, theses, and reports for offline reading and research anytime, anywhere." },
  { icon: Search,   title: "Advanced Search",    desc: "Powerful AI-driven search to find specific topics, authors, or citations within thousands of documents." },
];

const SUBSCRIPTION_BENEFITS = [
  "Unlimited downloads of all content types",
  "Personalized research dashboard",
  "Citation management tools",
  "Early access to upcoming publications",
  "Institutional usage analytics",
  "Multi-device synchronization",
];

// ─── Plan badge config ────────────────────────────────────────────────────────
const PLAN_BADGE: Record<string, string> = {
  "Student Scholar":    "BEST FOR INDIVIDUALS",
  "College Excellence": "BEST FOR COLLEGES",
  "University Global":  "BEST FOR UNIVERSITIES",
  "Corporate Innovator":"BEST FOR CORPORATES",
};

// ─── Component ────────────────────────────────────────────────────────────────
export function DomainLandingPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const domain = DOMAINS.find((d) => d.id === domainId);
  const DomainIcon = (Icons as any)[domain?.icon || "BookOpen"] || Icons.BookOpen;

  /* API state */
  const [domainData, setDomainData] = useState<DomainData | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  /* Pricing UI state */
  const [plan, setPlan] = useState<PlanType>("Yearly");

  /* Contact form state */
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", organization: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchDomainData = useCallback(async () => {
    if (!domain) return;
    setApiLoading(true);
    setApiError(false);
    try {
      const params = new URLSearchParams({ domain: domain.name });
      const res = await fetch(`/api/domain-data?${params.toString()}`);
      const data = await res.json();
      setDomainData(data);
    } catch {
      setApiError(true);
    } finally {
      setApiLoading(false);
    }
  }, [domain]);

  useEffect(() => { fetchDomainData(); }, [fetchDomainData]);

  const handleContactSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) { toast.error("Name and email are required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/domain-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: form.name, email: form.email,
          organization: form.organization, domain: domain?.name,
          selectedModules: [], planType: plan, totalPrice: 0,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSubmitted(true);
      toast.success("Request submitted! We'll contact you soon.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- derive displayed data ---------- */
  const contentCounts: ContentSummaryItem[] =
    apiLoading
      ? domain?.contentTypes.map((ct) => ({ type: ct.type, count: 0 })) || []
      : domainData?.content_summary?.length
        ? domainData.content_summary
        : domain?.contentTypes.map((ct) => ({ type: ct.type, count: parseInt(ct.count) || 0 })) || [];

  // Always use SUBSCRIPTION_PLANS constants for the pricing section.
  // The API's pricing_modules are content-type modules (Books, Periodicals, etc.)
  // used for the subscription builder — NOT the plan-tier cards shown in the reference.
  const pricingModules: PricingModule[] = SUBSCRIPTION_PLANS.map((sp) => ({
    id: sp.id,
    type: sp.id,
    userType: sp.userType,
    name: sp.name,
    description: sp.description,
    features: sp.pricing[0].features,
    monthlyPrice: sp.pricing.find(p => p.duration === "Monthly")?.price || 0,
    quarterlyPrice: sp.pricing.find(p => p.duration === "Quarterly")?.price || 0,
    halfYearlyPrice: sp.pricing.find(p => p.duration === "Half-Yearly")?.price || 0,
    yearlyPrice: sp.pricing.find(p => p.duration === "Yearly")?.price || 0,
    yearlyDiscountPct: 0,
    totalCount: 0,
    visible: true,
  }));

  const heroImg = HERO_IMAGES[domainId || ""] || "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=900&q=80";

  /* ---------- guard: domain not found ---------- */
  if (!domain) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-500">
        <BookOpen size={48} className="text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-800">Domain Not Found</h1>
        <Link to="/digital-library" className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
          <ArrowLeft size={14} /> Browse All Domains
        </Link>
      </div>
    );
  }

  const relatedDomains = DOMAINS.filter((d) => d.id !== domain.id).slice(0, 4);

  return (
    <div className="flex flex-col bg-white">

      {/* ══ HERO ════════════════════════════════════════════════════════════════ */}
      <section className="bg-white pt-6 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="mb-10 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            <Link to="/" className="hover:text-slate-600 transition-colors">Home</Link>
            <ChevronRight size={13} />
            <Link to="/digital-library" className="hover:text-slate-600 transition-colors">Digital Library</Link>
            <ChevronRight size={13} />
            <span className="text-slate-700">{domain.name}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: text */}
            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 mb-5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-600">
                <DomainIcon size={13} />
                Academic Domain
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight">
                {domain.name}
              </h1>

              <p className="mt-5 text-base text-slate-500 leading-relaxed max-w-lg">
                {domain.description}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#subscription"
                  className="rounded-full bg-indigo-600 hover:bg-indigo-700 px-7 py-3.5 text-sm font-bold text-white shadow-md transition-all"
                  onClick={(e) => { e.preventDefault(); document.getElementById('subscription')?.scrollIntoView({ behavior: 'smooth' }); }}
                >
                  View Subscription Plans
                </a>
                <a
                  href="#content-types"
                  className="rounded-full border border-slate-300 bg-white hover:bg-slate-50 px-7 py-3.5 text-sm font-bold text-slate-700 transition-all"
                  onClick={(e) => { e.preventDefault(); document.getElementById('content-types')?.scrollIntoView({ behavior: 'smooth' }); }}
                >
                  Explore Content Types
                </a>
              </div>
            </motion.div>

            {/* Right: hero image card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[4/3]"
            >
              <img
                src={heroImg}
                alt={domain.name}
                className="w-full h-full object-cover"
              />
              {/* Dark overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/20 to-transparent" />

              {/* Premium badge */}
              <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 px-4 py-3">
                <div className="h-10 w-10 rounded-xl bg-amber-400 flex items-center justify-center shrink-0">
                  <Icons.Star size={18} className="text-white fill-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Premium Repository</div>
                  <div className="text-xs text-white/70">Verified Academic Content</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ IMPORTANCE ══════════════════════════════════════════════════════════ */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
            {/* Left */}
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
                Importance in Academic &amp; Industry
              </h2>
              <div className="mt-3 h-1 w-14 rounded-full bg-indigo-600" />

              <p className="mt-6 text-slate-600 leading-relaxed">{domain.importance}</p>

              {/* Feature list — 2 cols */}
              <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                {domain.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-700 text-sm">
                    <div className="h-5 w-5 rounded-full border border-indigo-300 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={13} className="text-indigo-500" />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: stat cards grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Active Researchers */}
              <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm flex flex-col gap-2">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Users size={20} className="text-indigo-500" />
                </div>
                <div className="mt-4 text-2xl font-extrabold text-slate-900">10k+</div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Researchers</div>
              </div>

              {/* Verified Peer-Review */}
              <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm flex flex-col gap-2">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Shield size={20} className="text-indigo-500" />
                </div>
                <div className="mt-4 text-2xl font-extrabold text-slate-900">100%</div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Verified Peer-Review</div>
              </div>

              {/* Global Research Network */}
              <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm flex flex-col gap-2">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Globe size={20} className="text-indigo-500" />
                </div>
                <div className="mt-4 text-lg font-extrabold text-slate-900">Global</div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Research Network</div>
              </div>

              {/* E-Books count - dynamic */}
              <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm flex flex-col gap-2">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Icons.Layout size={20} className="text-indigo-500" />
                </div>
                <div className="mt-4 text-2xl font-extrabold text-slate-900">
                  {apiLoading ? "—" : (() => {
                    const bk = contentCounts.find(c => c.type === "Books");
                    return bk && bk.count > 0 ? bk.count.toLocaleString("en-IN") + "+" : "500+";
                  })()}
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">E-Books</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CONTENT TYPES ════════════════════════════════════════════════════════ */}
      <section id="content-types" className="bg-white py-20 scroll-mt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Heading */}
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              What You Get in this Department
            </h2>
            <p className="mt-4 text-slate-500 max-w-2xl mx-auto">
              Subscribers gain full access to a diverse range of academic materials specifically curated for the{" "}
              <span className="text-indigo-600 font-semibold">{domain.name}</span> domain.
            </p>
          </div>

          {apiError && (
            <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-700 text-sm max-w-lg mx-auto">
              <AlertCircle size={16} /> Could not load live counts — showing estimated figures.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {contentCounts.map((ct, i) => {
              const meta = CT_META[ct.type] || { icon: Icons.BookOpen, desc: "" };
              const CTIcon = meta.icon;
              const ctInfo = domain.contentTypes.find(c => c.type === ct.type);
              const desc = ctInfo?.description || meta.desc;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-lg transition-all"
                >
                  {/* Icon in purplish circle */}
                  <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-5">
                    <CTIcon size={22} className="text-indigo-500" />
                  </div>
                  <div className="text-base font-bold text-slate-900">{ct.type}</div>
                  <div className="text-sm font-semibold text-indigo-600 mt-1">
                    {apiLoading
                      ? <span className="inline-block h-4 w-20 bg-slate-200 rounded animate-pulse" />
                      : ct.count > 0
                        ? `${ct.count.toLocaleString("en-IN")}+ Available`
                        : ctInfo?.count
                          ? `${ctInfo.count} Available`
                          : "—"
                    }
                  </div>
                  <p className="mt-3 text-xs text-slate-500 leading-relaxed">{desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ WHY SUBSCRIBE ════════════════════════════════════════════════════════ */}
      <section className="bg-slate-900 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
            {/* Left */}
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-snug">
                Why Subscribe to this Department?
              </h2>
              <p className="mt-5 text-slate-400 leading-relaxed">
                {domain.whySubscribe}
              </p>

              <div className="mt-10 space-y-7">
                {WHY_FEATURES.map(({ icon: FeatureIcon, title, desc }, i) => (
                  <div key={i} className="flex items-start gap-5">
                    <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                      <FeatureIcon size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-white">{title}</div>
                      <p className="mt-1 text-sm text-slate-400 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right card */}
            <div className="rounded-2xl bg-slate-800 border border-slate-700 p-7">
              {/* Target audience */}
              <div className="mb-7">
                <h3 className="text-base font-bold text-white mb-4">Target Audience</h3>
                <div className="grid grid-cols-2 gap-2">
                  {domain.whoShouldSubscribe.map((who, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-700/50 px-3 py-2.5 text-xs text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-indigo-400 shrink-0" />
                      {who}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-700 pt-6">
                <h3 className="text-base font-bold text-white mb-4">Subscription Benefits</h3>
                <ul className="space-y-2.5">
                  {SUBSCRIPTION_BENEFITS.map((benefit, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
                      <div className="h-5 w-5 rounded-full border border-slate-500 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={12} className="text-indigo-400" />
                      </div>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ SUBSCRIPTION PLANS ═══════════════════════════════════════════════════ */}
      <section id="subscription" className="bg-white py-20 scroll-mt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Heading */}
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              Subscription Plans for {domain.name}
            </h2>
            <p className="mt-3 text-slate-500 max-w-xl mx-auto">
              Choose the plan that best fits your academic or institutional needs.{" "}
              All prices are in Indian Rupees (₹).
            </p>
          </div>

          <SubscriptionPlans 
            showTitle={false} 
            isFullPage={false} 
            onPlanClick={() => setFormOpen(true)} 
          />

          {/* Custom quote banner */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-8 py-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Custom Institutional Quote?</h3>
              <p className="mt-1 text-sm text-slate-500">
                For large universities and corporate R&amp;D centers, we offer tailored pricing and multi-campus licenses.
              </p>
            </div>
            <button
              onClick={() => setFormOpen(true)}
              className="shrink-0 rounded-full bg-slate-900 hover:bg-slate-800 px-6 py-3 text-sm font-bold text-white transition-all"
            >
              Contact Sales Team
            </button>
          </div>
        </div>
      </section>

      {/* ══ RELATED DOMAINS ══════════════════════════════════════════════════════ */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-slate-900">Explore Related Domains</h2>
            <Link to="/digital-library" className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700">
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
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-xl hover:border-indigo-200 transition-all"
                >
                  <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    <RdIcon size={22} />
                  </div>
                  <h3 className="mt-4 font-bold text-slate-900 text-sm">{rd.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{rd.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    Explore <ArrowRight size={11} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ CONTACT MODAL ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {formOpen && !submitted && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="bg-indigo-600 px-6 py-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg">Contact Sales Team</h3>
                    <p className="text-indigo-200 text-sm mt-0.5">{domain.name}</p>
                  </div>
                  <button onClick={() => setFormOpen(false)} className="text-indigo-200 hover:text-white">
                    <Icons.X size={20} />
                  </button>
                </div>
              </div>
              <form onSubmit={handleContactSales} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name *</label>
                  <input
                    required value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Dr. Priya Sharma"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email *</label>
                  <input
                    required type="email" value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="librarian@university.edu"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Institution / Organization</label>
                  <input
                    value={form.organization}
                    onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                    placeholder="IIT Bombay / AIIMS Delhi"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Additional Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Departments needed, number of users, access period…"
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 transition-all"
                  >
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {submitting ? "Sending…" : "Submit"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {formOpen && submitted && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl w-full max-w-sm p-10 text-center shadow-2xl"
            >
              <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Request Received!</h3>
              <p className="text-slate-500 mt-2 text-sm">Our team will reach out at <strong>{form.email}</strong> within 24 hours.</p>
              <button
                onClick={() => { setSubmitted(false); setFormOpen(false); setForm({ name: "", email: "", organization: "", notes: "" }); }}
                className="mt-6 rounded-full bg-indigo-600 hover:bg-indigo-700 px-6 py-2.5 text-sm font-bold text-white transition-all"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
