import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DOMAINS } from "../constants";
import { Helmet } from "react-helmet-async";
import * as Icons from "lucide-react";
import {
  BookOpen, ChevronRight, Check,
  AlertCircle, Zap, Download, Search, Users, Shield, Globe,
  RefreshCw, CheckCircle2, ArrowLeft, ArrowRight,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { EmptyState, ErrorState, Skeleton, buttonClass } from "./ui";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContentSummaryItem { type: string; count: number; }

interface DomainData {
  content_summary: ContentSummaryItem[];
  /** Everything held in the department, counted as the library counts it. */
  total?: number;
}

// ─── Domain → Unsplash hero image map ────────────────────────────────────────
export const HERO_IMAGES: Record<string, string> = {
  "electrical-engineering":    "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=900&q=80",
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
  "life-sciences":             "https://images.unsplash.com/photo-1518152006812-edab29b069ac?w=900&q=80",
  "law":                       "https://images.unsplash.com/photo-1505664194779-8beaceb93744?w=900&q=80",
  "agriculture":               "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=900&q=80",
  "nursing":                   "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=900&q=80",
  "education-social-sciences": "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=900&q=80",
  "applied-sciences":          "https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=900&q=80",
  "multidisciplinary":         "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=900&q=80",
  "electronics-telecommunication": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80",
  "chemical-engineering":      "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=900&q=80",
  "ayurveda":                  "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=900&q=80",
  "architecture":              "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=900&q=80",
  "material-science":          "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=900&q=80",
  "applied-mechanics":         "https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?w=900&q=80",
  "dental":                    "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=900&q=80",
  "physiotherapy":             "https://images.unsplash.com/photo-1576678927484-cc907957088c?w=900&q=80",
  "commerce":                  "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=900&q=80",
  "arts":                      "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=900&q=80",
  "science":                   "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=900&q=80",
};

// ─── Content type icon + description map ─────────────────────────────────────
const CT_META: Record<string, { icon: any; desc: string }> = {
  Journals:                { icon: Icons.BookOpen,      desc: "Peer-reviewed journals, held as full runs of volumes and issues." },
  Articles:                { icon: Icons.FileText,      desc: "Individual research papers, each with its journal, issue and licence." },
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

const WHY_FEATURES = [
  { icon: Zap,      title: "Real-time Updates",  desc: "Get instant access to newly published research, journals, and conference papers as they are released." },
  { icon: BookOpen, title: "Unlimited Reading",      desc: "Read textbooks, theses, and reports online anytime, anywhere across multiple devices." },
  { icon: Search,   title: "Advanced Search",    desc: "Powerful AI-driven search to find specific topics, authors, or citations within thousands of documents." },
];

const ACCESS_BENEFITS = [
  "Unlimited online reading of all content types",
  "Personalized research dashboard",
  "Citation management tools",
  "Early access to upcoming publications",
  "Institutional usage analytics",
  "Multi-device synchronization",
];

// ─── Component ────────────────────────────────────────────────────────────────
export function DomainLandingPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const domain = DOMAINS.find((d) => d.id === domainId);
  const DomainIcon = (Icons as any)[domain?.icon || "BookOpen"] || Icons.BookOpen;

  /* API state */
  const [domainData, setDomainData] = useState<DomainData | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  const fetchDomainData = useCallback(async () => {
    if (!domain) return;
    setDomainData(null);
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


  /* ---------- derive displayed data ---------- */
  // What this department actually holds, in the order a college asks about it.
  //
  // This used to walk a fixed list of eight kinds and look each one up in the
  // answer, so a department holding 81 journals and 2,790 articles rendered
  // eight cards all reading "Launching Soon" — the list did not contain the
  // words the catalogue uses, and the catalogue did not hold the kinds on the
  // list. A promise on a public page that we cannot keep is worse than a short
  // list of what is genuinely there.
  const CT_ORDER = ['Journals', 'Articles', 'Books', 'Theses', 'Case Reports',
                    'Conference Proceedings', 'Magazines', 'Educational Videos', 'Newsletters'];
  const contentCounts: ContentSummaryItem[] = apiLoading
    ? []
    : ((domainData?.content_summary || []) as ContentSummaryItem[])
        .filter(s => s.count > 0)
        .sort((a, b) => {
          const ia = CT_ORDER.indexOf(a.type), ib = CT_ORDER.indexOf(b.type);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });

  const heroImg = HERO_IMAGES[domainId || ""] || "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=900&q=80";

  /* ---------- guard: domain not found ---------- */
  if (!domain) {
    return (
      <div className="container-public flex min-h-[60vh] items-center justify-center py-16">
        <EmptyState
          icon={BookOpen}
          title={<span role="heading" aria-level={1}>Domain Not Found</span>}
          action={
            <Link to="/digital-library" className={buttonClass("brand")}>
              <ArrowLeft size={16} aria-hidden="true" /> Browse All Domains
            </Link>
          }
        />
      </div>
    );
  }

  const relatedDomains = DOMAINS.filter((d) => d.id !== domain.id).slice(0, 4);

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${domain.name} Digital Library Collection`,
    "description": domain.description,
    "publisher": {
      "@type": "Organization",
      "name": "STM Digital Library"
    }
  };

  return (
    <div className="flex flex-col bg-surface">
      <Helmet>
        <title>{domain.name} Research Collection | STM Digital Library</title>
        <meta name="description" content={`Explore comprehensive academic resources, journals, and books in ${domain.name}. ${domain.description}`} />
        <meta name="keywords" content={`${domain.name}, digital library, research papers, journals, academic content, study material`} />
        <script type="application/ld+json">
          {JSON.stringify(schemaData)}
        </script>
      </Helmet>

      {/* ══ HERO ════════════════════════════════════════════════════════════════ */}
      <section className="bg-navy py-12 sm:py-16">
        <div className="container-public">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="on-dark-3 mb-8 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
            <Link to="/" className="transition-colors duration-150 hover:underline">Home</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <Link to="/digital-library" className="transition-colors duration-150 hover:underline">Digital Library</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span className="on-dark-2" aria-current="page">{domain.name}</span>
          </nav>

          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Left: text */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {/* Badge */}
              <p className="on-dark-fill on-dark-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
                <DomainIcon size={14} aria-hidden="true" className="text-amber" />
                Academic Domain
              </p>

              <h1 className="on-dark mt-4 text-5xl font-bold leading-tight break-words">
                {domain.name}
              </h1>

              <p className="on-dark-2 mt-5 max-w-lg text-base leading-relaxed">
                {domain.description}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/signup" className={buttonClass("highlight", "lg")}>
                  Register Free
                </Link>
                <a
                  href="#content-types"
                  className="btn btn-lg on-dark on-dark-fill on-dark-edge"
                  onClick={(e) => { e.preventDefault(); document.getElementById('content-types')?.scrollIntoView({ behavior: 'smooth' }); }}
                >
                  Explore Content Types
                </a>
              </div>
            </motion.div>

            {/* Right: hero image card */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10"
            >
              <img
                src={heroImg}
                alt={domain.name}
                className="h-full w-full object-cover"
              />
              {/* Dark overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-navy/20 to-transparent" />

              {/* Quality badge */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-xl border border-white/20 bg-navy/70 px-4 py-3 sm:bottom-5 sm:left-5 sm:right-auto">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber text-amber-ink" aria-hidden="true">
                  <Icons.Star size={18} className="fill-current" />
                </div>
                <div className="min-w-0">
                  <div className="on-dark text-sm font-bold">Curated Repository</div>
                  <div className="on-dark-2 text-xs">Verified Academic Content</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ IMPORTANCE ══════════════════════════════════════════════════════════ */}
      <section className="bg-ground py-16 sm:py-20">
        <div className="container-public">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-14">
            {/* Left */}
            <div>
              <h2 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">
                Importance in Academic &amp; Industry
              </h2>
              <div className="mt-3 h-1 w-14 rounded-full bg-amber" aria-hidden="true" />

              <p className="mt-6 max-w-[72ch] leading-relaxed text-ink-2">{domain.importance}</p>

              {/* Feature list — 2 cols */}
              <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {domain.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-ink-2">
                    <CheckCircle2 size={16} aria-hidden="true" className="shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: stat cards grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* Active Researchers */}
              <div className="card flex flex-col gap-2 p-4 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <Users size={20} />
                </div>
                <div className="mt-3 text-2xl font-bold text-ink">10k+</div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Active Researchers</div>
              </div>

              {/* Verified Peer-Review */}
              <div className="card flex flex-col gap-2 p-4 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <Shield size={20} />
                </div>
                <div className="mt-3 text-2xl font-bold text-ink">100%</div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Verified Peer-Review</div>
              </div>

              {/* Global Research Network */}
              <div className="card flex flex-col gap-2 p-4 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <Globe size={20} />
                </div>
                <div className="mt-3 text-2xl font-bold text-ink">Global</div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Research Network</div>
              </div>

              {/* E-Books count - dynamic */}
              <div className="card flex flex-col gap-2 p-4 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <Icons.Layout size={20} />
                </div>
                <div className="mt-3 text-2xl font-bold text-ink tnum">
                  {apiLoading || apiError ? "—" : (() => {
                    const bk = contentCounts.find(c => c.type === "Books");
                    return bk ? bk.count.toLocaleString("en-IN") : "0";
                  })()}
                </div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">E-Books</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CONTENT TYPES ════════════════════════════════════════════════════════ */}
      <section id="content-types" className="scroll-mt-8 bg-surface py-16 sm:py-20">
        <div className="container-public">
          {/* Heading */}
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              What You Get in this Department
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-ink-2">
              Get full access to a diverse range of academic materials specifically curated for the{" "}
              <span className="font-semibold text-accent">{domain.name}</span> domain.
            </p>
          </div>

          {/* A failed request is not an empty department: say it failed, and offer to try again. */}
          {apiError && (
            <div className="card mx-auto max-w-3xl">
              <ErrorState
                description="We could not load the live counts for this department."
                onRetry={fetchDomainData}
              />
            </div>
          )}

          {!apiLoading && !apiError && contentCounts.length === 0 && (
            <div className="card mx-auto max-w-3xl">
              <EmptyState
                icon={BookOpen}
                title="We are still building this department."
                description={`Nothing is held under ${domain.name} yet. Tell us what you need and we will point the collection at it.`}
              />
            </div>
          )}

          {/* One figure, not a card per shelf. The cards quoted journals, articles
              and books side by side, which invited adding them up — and journals
              hold the articles, so the sum was wrong by design. The types are
              named underneath so a visitor knows what kinds of material there are. */}
          {(apiLoading || contentCounts.length > 0) && (
            <div className="card mx-auto max-w-3xl px-6 py-10 text-center">
              {apiLoading ? (
                <Skeleton className="mx-auto h-12 w-48 rounded-lg" />
              ) : (
                <p className="text-5xl font-bold tracking-tight text-ink tnum">
                  {Number(domainData?.total ?? 0).toLocaleString('en-IN')}
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-muted">
                items of content in {domain.name}
              </p>

              {!apiLoading && contentCounts.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {/* The three shelves most people come for first, then the rest as held. */}
                  {[...contentCounts].sort((a, b) => {
                    const lead = ['Journals', 'Articles', 'Books'];
                    const ia = lead.indexOf(a.type), ib = lead.indexOf(b.type);
                    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.type.localeCompare(b.type);
                  }).map(ct => {
                    const CTIcon = (CT_META[ct.type] || { icon: Icons.BookOpen }).icon;
                    return (
                      <span key={ct.type}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent">
                        <CTIcon size={14} aria-hidden="true" /> {ct.type}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ══ WHY THIS DEPARTMENT ══════════════════════════════════════════════════ */}
      <section className="bg-navy py-16 sm:py-20">
        <div className="container-public">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-14">
            {/* Left */}
            <div>
              <h2 className="on-dark text-3xl font-bold leading-snug sm:text-4xl">
                Why this Department?
              </h2>
              <p className="on-dark-2 mt-5 leading-relaxed">
                {domain.whyAccess}
              </p>

              <div className="mt-10 space-y-6">
                {WHY_FEATURES.map(({ icon: FeatureIcon, title, desc }, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="on-dark-fill flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-amber" aria-hidden="true">
                      <FeatureIcon size={20} />
                    </div>
                    <div>
                      <h3 className="on-dark text-base font-bold">{title}</h3>
                      <p className="on-dark-2 mt-1 text-sm leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right card */}
            <div className="on-dark-edge rounded-2xl border bg-navy-2 p-5 sm:p-7">
              {/* Target audience */}
              <div className="mb-6">
                <h3 className="on-dark mb-4 text-base font-bold">Target Audience</h3>
                <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                  {domain.whoShouldAccess.map((who, i) => (
                    <div key={i} className="on-dark-fill on-dark-edge on-dark-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber" aria-hidden="true" />
                      {who}
                    </div>
                  ))}
                </div>
              </div>

              <div className="on-dark-edge border-t pt-6">
                <h3 className="on-dark mb-4 text-base font-bold">What You Get</h3>
                <ul className="space-y-3">
                  {ACCESS_BENEFITS.map((benefit, i) => (
                    <li key={i} className="on-dark-2 flex items-center gap-3 text-sm">
                      <CheckCircle2 size={16} aria-hidden="true" className="shrink-0 text-amber" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ ACCESS ═══════════════════════════════════════════════════════════════ */}
      <section id="subscription" className="scroll-mt-8 bg-surface py-16 sm:py-20">
        <div className="container-public max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-ink sm:text-4xl">Access {domain.name} content</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">
            Register free and start reading this department's journals, articles
            and resources straight away.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className={buttonClass("highlight", "lg")}>
              Register Free
            </Link>
          </div>
        </div>
      </section>

      {/* ══ RELATED DOMAINS ══════════════════════════════════════════════════════ */}
      <section className="bg-ground py-16">
        <div className="container-public">
          <div className="mb-8 flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-ink">Explore Related Domains</h2>
            <Link to="/digital-library" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline">
              View all <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {relatedDomains.map((rd) => {
              const RdIcon = (Icons as any)[rd.icon] || Icons.BookOpen;
              return (
                <Link
                  key={rd.id}
                  to={`/domain/${rd.id}`}
                  className="card card-interactive group p-5 sm:p-6"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                    <RdIcon size={22} />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-ink group-hover:text-accent">{rd.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{rd.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-accent">
                    Explore <ArrowRight size={12} aria-hidden="true" />
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
