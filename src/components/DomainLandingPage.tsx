import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DOMAINS } from "../constants";
import * as Icons from "lucide-react";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Users, FileText,
  ShieldCheck, Zap, ChevronRight, Loader2, Check, IndianRupee,
  Send, ToggleLeft, ToggleRight, AlertCircle, RefreshCw
} from "lucide-react";
import { toast } from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContentSummaryItem { type: string; count: number; }
interface PricingModule {
  id: string; type: string;
  monthlyPrice: number; quarterlyPrice: number; yearlyPrice: number;
  yearlyDiscountPct: number; totalCount: number; visible: boolean;
}
interface DomainData {
  content_summary: ContentSummaryItem[];
  pricing_modules: PricingModule[];
}

// ─── Theme map ────────────────────────────────────────────────────────────────
const THEME: Record<string, {
  hero: string; badge: string; iconBg: string; btn: string; accent: string; highlight: string;
}> = {
  blue:    { hero: "from-blue-950 via-blue-900 to-blue-800",   badge: "bg-blue-500/20 text-blue-200",    iconBg: "bg-blue-500/20 text-blue-300",    btn: "bg-blue-600 hover:bg-blue-500",    accent: "text-blue-500",    highlight: "ring-blue-500 bg-blue-50" },
  indigo:  { hero: "from-indigo-950 via-indigo-900 to-indigo-800", badge: "bg-indigo-500/20 text-indigo-200", iconBg: "bg-indigo-500/20 text-indigo-300", btn: "bg-indigo-600 hover:bg-indigo-500", accent: "text-indigo-500",  highlight: "ring-indigo-500 bg-indigo-50" },
  red:     { hero: "from-red-950 via-red-900 to-rose-800",     badge: "bg-red-400/20 text-red-200",      iconBg: "bg-red-500/20 text-red-300",      btn: "bg-red-600 hover:bg-red-500",      accent: "text-red-500",     highlight: "ring-red-500 bg-red-50" },
  slate:   { hero: "from-slate-950 via-slate-900 to-slate-800", badge: "bg-slate-400/20 text-slate-200", iconBg: "bg-slate-500/20 text-slate-300",   btn: "bg-slate-700 hover:bg-slate-600",  accent: "text-slate-600",   highlight: "ring-slate-500 bg-slate-50" },
  emerald: { hero: "from-emerald-950 via-emerald-900 to-emerald-800", badge: "bg-emerald-500/20 text-emerald-200", iconBg: "bg-emerald-500/20 text-emerald-300", btn: "bg-emerald-600 hover:bg-emerald-500", accent: "text-emerald-600", highlight: "ring-emerald-500 bg-emerald-50" },
  orange:  { hero: "from-orange-950 via-orange-900 to-orange-800", badge: "bg-orange-400/20 text-orange-200", iconBg: "bg-orange-500/20 text-orange-300", btn: "bg-orange-600 hover:bg-orange-500", accent: "text-orange-500", highlight: "ring-orange-500 bg-orange-50" },
  pink:    { hero: "from-pink-950 via-pink-900 to-pink-800",   badge: "bg-pink-400/20 text-pink-200",    iconBg: "bg-pink-500/20 text-pink-300",    btn: "bg-pink-600 hover:bg-pink-500",    accent: "text-pink-500",    highlight: "ring-pink-500 bg-pink-50" },
  amber:   { hero: "from-amber-950 via-amber-900 to-amber-800", badge: "bg-amber-400/20 text-amber-200", iconBg: "bg-amber-500/20 text-amber-300",   btn: "bg-amber-600 hover:bg-amber-500",  accent: "text-amber-500",   highlight: "ring-amber-500 bg-amber-50" },
  purple:  { hero: "from-purple-950 via-purple-900 to-purple-800", badge: "bg-purple-400/20 text-purple-200", iconBg: "bg-purple-500/20 text-purple-300", btn: "bg-purple-600 hover:bg-purple-500", accent: "text-purple-500", highlight: "ring-purple-500 bg-purple-50" },
  green:   { hero: "from-green-950 via-green-900 to-green-800", badge: "bg-green-400/20 text-green-200", iconBg: "bg-green-500/20 text-green-300",   btn: "bg-green-600 hover:bg-green-500",  accent: "text-green-600",   highlight: "ring-green-500 bg-green-50" },
  rose:    { hero: "from-rose-950 via-rose-900 to-rose-800",   badge: "bg-rose-400/20 text-rose-200",    iconBg: "bg-rose-500/20 text-rose-300",    btn: "bg-rose-600 hover:bg-rose-500",    accent: "text-rose-500",    highlight: "ring-rose-500 bg-rose-50" },
  teal:    { hero: "from-teal-950 via-teal-900 to-teal-800",   badge: "bg-teal-400/20 text-teal-200",    iconBg: "bg-teal-500/20 text-teal-300",    btn: "bg-teal-600 hover:bg-teal-500",    accent: "text-teal-600",    highlight: "ring-teal-500 bg-teal-50" },
  sky:     { hero: "from-sky-950 via-sky-900 to-sky-800",      badge: "bg-sky-400/20 text-sky-200",      iconBg: "bg-sky-500/20 text-sky-300",      btn: "bg-sky-600 hover:bg-sky-500",      accent: "text-sky-500",     highlight: "ring-sky-500 bg-sky-50" },
  cyan:    { hero: "from-cyan-950 via-cyan-900 to-cyan-800",   badge: "bg-cyan-400/20 text-cyan-200",    iconBg: "bg-cyan-500/20 text-cyan-300",    btn: "bg-cyan-600 hover:bg-cyan-500",    accent: "text-cyan-600",    highlight: "ring-cyan-500 bg-cyan-50" },
  lime:    { hero: "from-lime-950 via-lime-900 to-lime-800",   badge: "bg-lime-400/20 text-lime-200",    iconBg: "bg-lime-500/20 text-lime-300",    btn: "bg-lime-600 hover:bg-lime-500",    accent: "text-lime-600",    highlight: "ring-lime-500 bg-lime-50" },
  violet:  { hero: "from-violet-950 via-violet-900 to-violet-800", badge: "bg-violet-400/20 text-violet-200", iconBg: "bg-violet-500/20 text-violet-300", btn: "bg-violet-600 hover:bg-violet-500", accent: "text-violet-500", highlight: "ring-violet-500 bg-violet-50" },
};

const CT_ICONS: Record<string, any> = {
  Books: Icons.Book, Periodicals: Icons.Newspaper, Magazines: Icons.BookOpen,
  "Case Reports": Icons.FileText, Theses: Icons.GraduationCap,
  "Conference Proceedings": Icons.Users, "Educational Videos": Icons.Video,
  Newsletters: Icons.Mail, Proceedings: Icons.Users, Videos: Icons.Video,
};

const PLAN_OPTIONS = ["Monthly", "Quarterly", "Yearly"] as const;
type PlanType = typeof PLAN_OPTIONS[number];

function priceForPlan(m: PricingModule, plan: PlanType) {
  if (plan === "Yearly") return m.yearlyPrice;
  if (plan === "Quarterly") return m.quarterlyPrice;
  return m.monthlyPrice;
}

const GST = 0.18;

// ─── Component ───────────────────────────────────────────────────────────────
export function DomainLandingPage() {
  const { domainId } = useParams<{ domainId: string }>();

  const domain = DOMAINS.find((d) => d.id === domainId);
  const theme = THEME[domain?.themeColor || "blue"];
  const DomainIcon = (Icons as any)[domain?.icon || "BookOpen"] || Icons.BookOpen;

  // API data
  const [domainData, setDomainData] = useState<DomainData | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  // Subscription builder state
  const [plan, setPlan] = useState<PlanType>("Monthly");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Request form state
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", organization: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchDomainData = useCallback(async () => {
    if (!domain) return;
    setApiLoading(true);
    setApiError(false);
    try {
      const res = await fetch(`/api/domain-data?domain=${encodeURIComponent(domain.name)}`);
      const data = await res.json();
      setDomainData(data);
    } catch {
      setApiError(true);
    } finally {
      setApiLoading(false);
    }
  }, [domain]);

  useEffect(() => { fetchDomainData(); }, [fetchDomainData]);

  // Price calculation
  const activeModules = domainData?.pricing_modules || [];
  const selected = activeModules.filter((m) => selectedIds.has(m.id));
  const subtotal = selected.reduce((s, m) => s + priceForPlan(m, plan), 0);
  const gst = parseFloat((subtotal * GST).toFixed(2));
  const total = parseFloat((subtotal + gst).toFixed(2));

  const toggleModule = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === activeModules.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(activeModules.map((m) => m.id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
          selectedModules: selected.map((m) => m.type),
          planType: plan, totalPrice: total, notes: form.notes,
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

  // Content counts: merge API data with fallback constants
  const contentCounts: ContentSummaryItem[] = apiLoading
    ? domain?.contentTypes.map((ct) => ({ type: ct.type, count: 0 })) || []
    : domainData?.content_summary?.length
      ? domainData.content_summary
      : domain?.contentTypes.map((ct) => ({ type: ct.type, count: parseInt(ct.count) || 0 })) || [];

  if (!domain) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-500">
        <BookOpen size={48} className="text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-800">Domain Not Found</h1>
        <p className="text-sm">No domain with id <code className="bg-slate-100 px-1.5 py-0.5 rounded">{domainId}</code></p>
        <Link to="/digital-library" className="mt-2 flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
          <ArrowLeft size={14} /> Browse All Domains
        </Link>
      </div>
    );
  }

  const relatedDomains = DOMAINS.filter((d) => d.id !== domain.id).slice(0, 4);

  return (
    <div className="flex flex-col">
      {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${theme.hero} py-28 text-white`}>
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_30%_50%,white,transparent_70%)]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBtLTI4IDBhMjgsMjggMCAxLDAgNTYsMGEyOCwyOCAwIDEsMCAtNTYsMCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9nPjwvc3ZnPg==')] opacity-20" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="mb-8 flex items-center gap-2 text-sm text-white/50">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={13} />
            <Link to="/digital-library" className="hover:text-white transition-colors">Domains</Link>
            <ChevronRight size={13} />
            <span className="text-white/80">{domain.name}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55 }}>
              <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest ring-1 ring-white/15 ${theme.badge}`}>
                <DomainIcon size={13} /> {domain.name}
              </span>
              <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl leading-[1.1]">
                {domain.name}
              </h1>
              <p className="mt-6 text-base leading-8 text-white/65 max-w-xl">{domain.description}</p>
              <div className="mt-10 flex flex-wrap gap-4">
                <button onClick={() => { setFormOpen(true); document.getElementById('subscription-builder')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className={`rounded-full px-8 py-4 text-sm font-bold text-white shadow-xl transition-all ${theme.btn}`}>
                  Request Access
                </button>
                <Link to="/subscriptions"
                  className="rounded-full border border-white/20 bg-white/10 px-8 py-4 text-sm font-bold hover:bg-white/20 transition-all backdrop-blur-sm">
                  View Plans
                </Link>
              </div>
            </motion.div>

            {/* Live Content Stats Panel */}
            <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 }}
              className="rounded-3xl bg-white/8 backdrop-blur-md border border-white/10 p-6 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Content Available</span>
                {apiLoading && <Loader2 size={13} className="animate-spin text-white/40" />}
              </div>
              {contentCounts.slice(0, 6).map((ct, i) => {
                const CTIcon = CT_ICONS[ct.type] || Icons.BookOpen;
                return (
                  <div key={i} className="bg-white/8 rounded-2xl p-4 flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                      <CTIcon size={15} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white leading-none">
                        {apiLoading ? "—" : ct.count > 0 ? ct.count.toLocaleString("en-IN") + "+" : "—"}
                      </div>
                      <div className="text-[11px] text-white/50 mt-0.5">{ct.type}</div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ WHY / IMPORTANCE ════════════════════════════════════════════════ */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Why It Matters</span>
              <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">The Importance of {domain.name}</h2>
              <p className="mt-6 text-lg text-slate-600 leading-relaxed">{domain.importance}</p>
              <p className="mt-4 text-slate-500 leading-relaxed">{domain.whySubscribe}</p>
            </div>
            <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
              <h3 className="text-base font-bold text-slate-700 mb-5">Who Should Subscribe?</h3>
              <ul className="space-y-3">
                {domain.whoShouldSubscribe.map((who, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                      <Users size={14} />
                    </div>
                    {who}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══ DYNAMIC CONTENT COUNTS ══════════════════════════════════════════ */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Content Library</span>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">What's Available in {domain.name}</h2>
              <p className="mt-2 text-slate-500 text-sm">Live counts from our database, updated as new content is published.</p>
            </div>
            <button onClick={fetchDomainData} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-200 transition-colors">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {apiError && (
            <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-amber-700 text-sm">
              <AlertCircle size={16} /> Could not load live data — showing estimated figures.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {contentCounts.map((ct, i) => {
              const CTIcon = CT_ICONS[ct.type] || Icons.BookOpen;
              return (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-all group">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-4 transition-colors group-hover:scale-110 ${theme.iconBg}`}>
                    <CTIcon size={22} />
                  </div>
                  {apiLoading ? (
                    <div className="h-8 w-16 bg-slate-200 rounded animate-pulse mb-1" />
                  ) : (
                    <div className="text-2xl font-bold text-slate-900">
                      {ct.count > 0 ? ct.count.toLocaleString("en-IN") + "+" : "—"}
                    </div>
                  )}
                  <div className="text-sm font-bold text-slate-700 mt-1">{ct.type}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ FEATURES ════════════════════════════════════════════════════════ */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Included Features</span>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Everything You Need</h2>
              <ul className="mt-8 space-y-4">
                {domain.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                    <span className="text-slate-700 font-medium">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { Icon: ShieldCheck, label: "Peer-Reviewed", desc: "Curated by domain experts." },
                { Icon: Zap, label: "Instant Access", desc: "Download or stream immediately." },
                { Icon: Icons.BarChart3, label: "Usage Analytics", desc: "Track your research activity." },
                { Icon: Icons.RefreshCw, label: "Always Updated", desc: "New content added monthly." },
              ].map(({ Icon, label, desc }, i) => (
                <div key={i} className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${theme.iconBg}`}>
                    <Icon size={18} />
                  </div>
                  <div className="font-bold text-slate-900 text-sm">{label}</div>
                  <div className="text-xs text-slate-500 mt-1">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ SUBSCRIPTION BUILDER ══════════════════════════════════════════ */}
      <section id="subscription-builder" className="bg-gradient-to-br from-slate-900 to-slate-800 py-24 text-white scroll-mt-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Build Your Plan</span>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Subscription Builder</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto">
              Select the content types you need, choose your billing cycle, and see your price instantly.
            </p>
          </div>

          {apiLoading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
              <Loader2 className="animate-spin" size={20} /> Loading pricing modules…
            </div>
          ) : activeModules.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <IndianRupee size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold text-slate-300">Pricing modules not yet configured for this domain.</p>
              <p className="text-sm mt-2">Please use the Request form below to get a custom quote.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* LEFT: Module checkboxes */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">Available Modules</span>
                  <button onClick={toggleAll}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors">
                    {selectedIds.size === activeModules.length ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    {selectedIds.size === activeModules.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {activeModules.map((m) => {
                  const sel = selectedIds.has(m.id);
                  const price = priceForPlan(m, plan);
                  const ModIcon = CT_ICONS[m.type] || Icons.BookOpen;
                  return (
                    <button key={m.id} onClick={() => toggleModule(m.id)}
                      className={`w-full text-left flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                        sel ? `${theme.highlight} ring-2 border-transparent` : "bg-white/5 border-white/10 hover:bg-white/8"
                      }`}>
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        sel ? theme.iconBg : "bg-white/10 text-slate-400"
                      }`}>
                        <ModIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm ${sel ? "text-slate-900" : "text-white"}`}>{m.type}</div>
                        {m.totalCount > 0 && (
                          <div className={`text-xs mt-0.5 ${sel ? "text-slate-500" : "text-slate-400"}`}>
                            {m.totalCount.toLocaleString("en-IN")}+ items
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {price > 0 ? (
                          <>
                            <div className={`text-sm font-bold ${sel ? "text-slate-900" : "text-white"}`}>
                              ₹{price.toLocaleString("en-IN")}
                            </div>
                            <div className={`text-[10px] ${sel ? "text-slate-400" : "text-slate-500"}`}>/{plan.toLowerCase()}</div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-500">Price on request</div>
                        )}
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        sel ? `${theme.btn} border-transparent` : "border-slate-600"
                      }`}>
                        {sel && <Check size={11} className="text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* RIGHT: Summary + Plan toggle */}
              <div className="lg:col-span-1">
                <div className="sticky top-6 bg-white/8 border border-white/10 rounded-3xl p-6 backdrop-blur-sm space-y-6">
                  {/* Plan toggle */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Billing Cycle</label>
                    <div className="flex flex-col gap-2">
                      {PLAN_OPTIONS.map((p) => (
                        <button key={p} onClick={() => setPlan(p)}
                          className={`py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                            plan === p ? `${theme.btn} text-white shadow-lg` : "bg-white/5 text-slate-400 hover:bg-white/10"
                          }`}>
                          <span>{p}</span>
                          {p === "Yearly" && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Best Value</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price summary */}
                  <div className="border-t border-white/10 pt-4 space-y-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Price Summary</div>
                    {selected.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">Select modules to see pricing.</p>
                    ) : (
                      <>
                        {selected.map((m) => (
                          <div key={m.id} className="flex justify-between text-sm text-slate-300">
                            <span className="truncate mr-2">{m.type}</span>
                            <span className="font-bold shrink-0">₹{priceForPlan(m, plan).toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                        <div className="border-t border-white/10 mt-3 pt-3 space-y-1.5">
                          <div className="flex justify-between text-sm text-slate-400">
                            <span>Subtotal</span><span>₹{subtotal.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex justify-between text-sm text-slate-400">
                            <span>GST (18%)</span><span>₹{gst.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex justify-between font-bold text-white text-base pt-1 border-t border-white/10">
                            <span>Total</span><span>₹{total.toLocaleString("en-IN")}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <button onClick={() => setFormOpen(true)}
                    className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all ${theme.btn}`}>
                    Request Access →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══ REQUEST ACCESS FORM ══════════════════════════════════════════════ */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className={`text-xs font-bold uppercase tracking-widest ${theme.accent}`}>Get Access</span>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Request Access / Generate Invoice</h2>
            <p className="mt-3 text-slate-500 text-sm">
              Fill in your details and we'll prepare a customized proposal for <strong>{domain.name}</strong>.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div key="success"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12 px-6 bg-emerald-50 border border-emerald-200 rounded-3xl">
                <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} className="text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-emerald-900">Request Received!</h3>
                <p className="text-emerald-700 mt-2">Our team will reach out at <strong>{form.email}</strong> within 24 hours.</p>
                <button onClick={() => { setSubmitted(false); setForm({ name: "", email: "", organization: "", notes: "" }); }}
                  className="mt-6 text-sm font-bold text-emerald-700 underline">
                  Submit another request
                </button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="bg-slate-50 border border-slate-200 rounded-3xl p-8 space-y-5">

                {/* Selected modules summary */}
                {selected.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Selected Modules</div>
                    <div className="flex flex-wrap gap-2">
                      {selected.map((m) => (
                        <span key={m.id} className={`text-xs font-bold px-3 py-1.5 rounded-full ring-1 ${theme.highlight}`}>
                          {m.type} — ₹{priceForPlan(m, plan).toLocaleString("en-IN")}/{plan.toLowerCase()}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
                      <IndianRupee size={12} /> Total estimate (incl. GST):
                      <strong className="text-slate-800 ml-1">₹{total.toLocaleString("en-IN")}</strong>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name *</label>
                    <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Dr. Priya Sharma"
                      className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email *</label>
                    <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="librarian@university.edu"
                      className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Institution / Organization</label>
                  <input value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                    placeholder="IIT Bombay / AIIMS Delhi"
                    className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none" />
                </div>

                {/* Plan display */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Billing Cycle</label>
                  <div className="flex gap-2">
                    {PLAN_OPTIONS.map((p) => (
                      <button type="button" key={p} onClick={() => setPlan(p)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                          plan === p ? `${theme.btn} text-white border-transparent` : "bg-white border-slate-200 text-slate-500"
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Additional Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Departments needed, number of users, access period…"
                    rows={3}
                    className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none resize-none" />
                </div>

                <button type="submit" disabled={submitting}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white text-sm transition-all shadow-lg disabled:opacity-60 ${theme.btn}`}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {submitting ? "Submitting…" : "Request Access / Generate Invoice"}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ══ RELATED DOMAINS ══════════════════════════════════════════════════ */}
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
                <Link key={rd.id} to={`/domain/${rd.id}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-xl hover:border-blue-200 transition-all">
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

      {/* ══ CTA ═══════════════════════════════════════════════════════════ */}
      <section className={`bg-gradient-to-br ${theme.hero} py-20 text-white`}>
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Ready to explore {domain.name}?</h2>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <button onClick={() => setFormOpen(true)}
              className={`rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-all ${theme.btn}`}>
              Request Access Now
            </button>
            <Link to="/digital-library"
              className="rounded-full border border-white/20 bg-white/10 px-8 py-4 text-sm font-bold hover:bg-white/20 transition-all backdrop-blur-sm flex items-center gap-2">
              <ArrowLeft size={15} /> Browse All Domains
            </Link>
          </div>
        </div>
      </section>

      {/* ══ REQUEST MODAL (quick) ══════════════════════════════════════════ */}
      <AnimatePresence>
        {formOpen && !submitted && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className={`bg-gradient-to-r ${theme.hero} px-6 py-5 text-white`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg">Quick Access Request</h3>
                    <p className="text-white/60 text-sm">{domain.name}</p>
                  </div>
                  <button onClick={() => setFormOpen(false)} className="text-white/50 hover:text-white"><Icons.X size={20} /></button>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name *</label>
                  <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email *</label>
                  <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="you@institution.edu"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Organization</label>
                  <input value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                    placeholder="University / College"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:border-blue-500 outline-none" />
                </div>
                {selected.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
                    <div className="font-bold text-slate-700 mb-1">Selected: {selected.map(m => m.type).join(", ")}</div>
                    <div className="text-slate-500">Est. total: <strong className="text-slate-800">₹{total.toLocaleString("en-IN")}</strong> ({plan})</div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setFormOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm">Cancel</button>
                  <button type="submit" disabled={submitting}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white ${theme.btn} disabled:opacity-60`}>
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {submitting ? "Sending…" : "Submit"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
