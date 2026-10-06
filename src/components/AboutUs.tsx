import { ShieldCheck, Globe, Zap, GraduationCap, Microscope, Library, FileText, Database } from "lucide-react";

export function AboutUs() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Hero */}
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">About Us</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            Supporting students, researchers, and institutions through a single, organized academic knowledge platform.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 sm:py-16 lg:py-24">
        <div className="container-public">
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 lg:gap-16">
            <div className="prose-page">
              <p>
                We are an academic knowledge platform dedicated to making high-quality research, learning, and reference material easier to discover, access, and use. Our platform brings together legally sourced open-access materials from trusted academic repositories and publishers, organised so that a researcher can find what they need without hunting across a dozen sites.
              </p>
              <p>
                Our goal is to support students, researchers, librarians, faculty members, and institutions by offering a single, organized environment where academic content can be searched, filtered, and explored efficiently. Instead of spending time across multiple disconnected sources, users can rely on our platform to find relevant material in a structured and user-friendly way.
              </p>

              <h2>Our Mission</h2>
              <p>
                Our mission is to simplify academic discovery through:
              </p>
              <ul>
                {[
                  "Structured knowledge systems that organize content by subject, format, and relevance",
                  "Verified content sources to help ensure authenticity, transparency, and trust",
                  "Advanced search and analytics tools that improve discovery, usability, and research efficiency",
                  "Curated access to both proprietary and open-access resources in one integrated platform"
                ].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            {/* The illustration and its badge stay inside their column: the badge
                used to hang 24px past the right edge and pushed a phone's page sideways;
                it now overlaps only the bottom edge. */}
            <div className="relative mx-auto mb-6 w-full max-w-md md:max-w-none" aria-hidden="true">
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-navy">
                {/* Background decorative elements */}
                <div className="absolute inset-0 opacity-30">
                  {/* Grid pattern */}
                  <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                </div>

                {/* Floating Icons */}
                <div className="on-dark-fill on-dark-edge absolute left-[12%] top-[12%] rounded-xl border p-3">
                  <Library className="text-amber" size={28} />
                </div>
                <div className="on-dark-fill on-dark-edge absolute bottom-[18%] left-[14%] rounded-xl border p-3">
                  <Database className="on-dark-2" size={24} />
                </div>
                <div className="on-dark-fill on-dark-edge absolute right-[14%] top-[18%] rounded-xl border p-3">
                  <Microscope className="on-dark-2" size={24} />
                </div>
                <div className="on-dark-fill on-dark-edge absolute bottom-[14%] right-[12%] rounded-xl border p-3">
                  <FileText className="text-amber" size={28} />
                </div>

                {/* Central Focus */}
                <div className="relative z-10 flex items-center justify-center">
                  <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 sm:px-8 sm:py-6">
                    <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
                    <div className="flex flex-col text-left">
                      <span className="text-xl font-bold tracking-tight text-navy">STM</span>
                      <span className="text-xs font-bold uppercase tracking-widest text-navy-2">Digital Library</span>
                    </div>
                  </div>
                </div>

              </div>
              <div className="absolute -bottom-6 right-4 rounded-xl bg-amber px-5 py-3 text-amber-ink sm:right-6 sm:px-6 sm:py-4">
                <div className="text-xl font-bold leading-tight sm:text-2xl">Trusted</div>
                <div className="mt-1 text-center text-xs font-semibold uppercase tracking-widest">Knowledge Partner</div>
              </div>
            </div>
          </div>

          <figure className="mx-auto mt-16 max-w-4xl rounded-xl border border-rule bg-surface-2 p-6 sm:p-10 lg:mt-24">
            <blockquote className="text-center text-lg italic leading-relaxed text-ink-2 sm:text-xl">
              "We work closely with institutions, researchers, educators, and knowledge professionals to deliver reliable academic resources that support teaching, learning, and research. Our focus is on creating a trustworthy and scalable academic ecosystem that combines content quality, legal compliance, and ease of access."
            </blockquote>
          </figure>
        </div>
      </section>

      {/* Values / Features */}
      <section className="bg-surface-2 py-12 sm:py-16 lg:py-24">
        <div className="container-public">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Authenticity", desc: "Verified content sources ensuring transparency and trust in every document." },
              { icon: Zap, title: "Efficiency", desc: "Advanced search and discovery tools designed for modern research workflows." },
              { icon: Globe, title: "Accessibility", desc: "Single integrated platform for both proprietary and open-access resources." }
            ].map((value, i) => (
              <div key={i} className="card card-pad">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <value.icon size={24} />
                </div>
                <h3 className="text-xl font-bold text-ink">{value.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
