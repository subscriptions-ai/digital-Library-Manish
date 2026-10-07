import { Link } from "react-router-dom";
import {
  ShieldCheck, Globe, Zap, Microscope, Library, FileText, Database, Layers, BadgeCheck, Search, Handshake,
} from "lucide-react";
import { buttonClass } from "./ui";

/** A section's small uppercase label. It is the section's heading, so it is an h2. */
function Label({ children, id }: { children: string; id: string }) {
  return (
    <h2 id={id} className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{children}</h2>
  );
}

// One rhythm for every section: 64px between sections on a phone, 80px on a desktop.
const SECTION = "scroll-mt-24 py-8 lg:py-10";

const MISSION = [
  { icon: Layers, title: "Structured Discovery", text: "Structured knowledge systems that organize content by subject, format, and relevance" },
  { icon: BadgeCheck, title: "Verified Sources", text: "Verified content sources to help ensure authenticity, transparency, and trust" },
  { icon: Search, title: "Advanced Search", text: "Advanced search and analytics tools that improve discovery, usability, and research efficiency" },
  { icon: Library, title: "Integrated Academic Access", text: "Curated access to both proprietary and open-access resources in one integrated platform" },
];

const VALUES = [
  { icon: ShieldCheck, title: "Authenticity", desc: "Verified content sources ensuring transparency and trust in every document." },
  { icon: Zap, title: "Efficiency", desc: "Advanced search and discovery tools designed for modern research workflows." },
  { icon: Globe, title: "Accessibility", desc: "Single integrated platform for both proprietary and open-access resources." },
];

export function AboutUs() {
  return (
    <div className="bg-surface">
      {/* Hero */}
      <section className="bg-navy">
        <div className="container-public py-10 text-center sm:py-12">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">About Us</h1>
          <p className="on-dark-2 mx-auto mt-3 max-w-2xl text-base sm:text-lg">
            Supporting students, researchers, and institutions through a single, organized academic knowledge platform.
          </p>
        </div>
      </section>

      {/* Who we are. The picture stretches to the height of the text beside it, so neither leaves a gap. */}
      <section className={`${SECTION} sm:pt-10 lg:pt-12`} aria-labelledby="about-who">
        <div className="container-public">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch lg:gap-12">
            <div className="max-w-[60ch]">
              <Label id="about-who">Who We Are</Label>
              <div className="mt-4 space-y-4 leading-relaxed text-ink-2">
                <p>
                  We are an academic knowledge platform dedicated to making high-quality research, learning, and reference material easier to discover, access, and use.
                </p>
                <p>
                  Our platform brings together legally sourced open-access materials from trusted academic repositories and publishers, organised so that a researcher can find what they need without hunting across a dozen sites.
                </p>
                <p>
                  Our goal is to support students, researchers, librarians, faculty members, and institutions by offering a single, organized environment where academic content can be searched, filtered, and explored efficiently. Instead of spending time across multiple disconnected sources, users can rely on our platform to find relevant material in a structured and user-friendly way.
                </p>
              </div>
            </div>

            {/* The badge sits inside the picture, so nothing hangs past its edge. */}
            <div className="relative mx-auto w-full max-w-md md:mx-0 md:max-w-none" aria-hidden="true">
              <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl bg-navy md:absolute md:inset-0 md:aspect-auto">
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                </div>

                <div className="on-dark-fill on-dark-edge absolute left-[10%] top-[14%] rounded-xl border p-2.5 sm:p-3">
                  <Library className="text-amber" size={26} />
                </div>
                <div className="on-dark-fill on-dark-edge absolute bottom-[16%] left-[12%] rounded-xl border p-2.5 sm:p-3">
                  <Database className="on-dark-2" size={22} />
                </div>
                <div className="on-dark-fill on-dark-edge absolute right-[10%] top-[14%] rounded-xl border p-2.5 sm:p-3">
                  <Microscope className="on-dark-2" size={22} />
                </div>

                <div className="relative z-10 flex items-center gap-3 rounded-xl bg-white px-5 py-3.5 sm:px-7 sm:py-4">
                  <img src="/logo.png" alt="" className="h-11 w-11 object-contain" />
                  <div className="flex flex-col text-left">
                    <span className="text-xl font-bold tracking-tight text-navy">STM</span>
                    <span className="text-xs font-bold uppercase tracking-widest text-navy-2">Digital Library</span>
                  </div>
                </div>

                <div className="absolute bottom-3 right-3 flex items-center gap-2.5 rounded-lg bg-amber px-3 py-2 text-amber-ink sm:bottom-4 sm:right-4">
                  <FileText size={18} aria-hidden="true" />
                  <div className="leading-tight">
                    <div className="text-sm font-bold">Trusted</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest">Knowledge Partner</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our mission */}
      <section className={SECTION} aria-labelledby="about-mission">
        <div className="container-public">
          <Label id="about-mission">Our Mission</Label>
          <p className="mt-3 text-lg font-semibold leading-snug text-ink">Our mission is to simplify academic discovery through:</p>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {MISSION.map(({ icon: Icon, title, text }) => (
              <li key={title} className="card flex items-start gap-4 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="type-card-title text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Our approach: a statement from the company, not a testimonial, so no quotation marks. */}
      <section className={SECTION} aria-labelledby="about-approach">
        <div className="container-public">
          <div className="flex flex-col gap-4 rounded-xl border border-rule bg-surface-2 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-6 lg:px-8 lg:py-7">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
              <Handshake size={22} />
            </span>
            <div className="min-w-0 max-w-4xl">
              <Label id="about-approach">Our Approach</Label>
              <p className="mt-2 text-base leading-relaxed text-ink-2 sm:text-lg">
                We work closely with institutions, researchers, educators, and knowledge professionals to deliver reliable academic resources that support teaching, learning, and research. Our focus is on creating a trustworthy and scalable academic ecosystem that combines content quality, legal compliance, and ease of access.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What guides us */}
      <section className={SECTION} aria-labelledby="about-guides">
        <div className="container-public">
          <Label id="about-guides">What Guides Us</Label>
          <p className="mt-3 max-w-2xl text-lg font-semibold leading-snug text-ink">
            Built around trusted content, efficient discovery and accessible academic research.
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="card flex h-full flex-col p-5 lg:p-6">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h3 className="type-card-title text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Next steps */}
      <section className={`${SECTION} pb-10 lg:pb-12`} aria-labelledby="about-explore">
        <div className="container-public">
          <div className="flex flex-col gap-5 rounded-xl border border-rule bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 lg:px-8">
            <div className="min-w-0">
              <h2 id="about-explore" className="type-section text-ink">Explore STM Digital Library</h2>
              <p className="mt-1 text-sm text-muted sm:text-base">Discover academic resources or learn about institutional access.</p>
            </div>
            <div className="flex flex-col gap-3 sm:shrink-0 sm:flex-row">
              <Link to="/digital-library" className={buttonClass('primary', 'lg')}>Explore the Library</Link>
              <Link to="/for-institutions" className={buttonClass('outline', 'lg')}>For Institutions</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
