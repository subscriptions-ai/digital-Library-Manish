import { ShieldCheck, Globe, Zap, GraduationCap, Microscope, Library, FileText, Database } from "lucide-react";

export function AboutUs() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-slate-900 py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">About Us</h1>
          <p className="mt-6 text-xl text-slate-300 max-w-3xl mx-auto">
            Supporting students, researchers, and institutions through a single, organized academic knowledge platform.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="prose prose-slate lg:prose-lg">
                <p className="text-lg text-slate-600 leading-relaxed">
                  We are an academic knowledge platform dedicated to making high-quality research, learning, and reference material easier to discover, access, and use. Our platform brings together proprietary publications created by our organization and legally sourced open-access materials from trusted academic repositories and publishers.
                </p>
                <p className="text-lg text-slate-600 leading-relaxed mt-4">
                  Our goal is to support students, researchers, librarians, faculty members, and institutions by offering a single, organized environment where academic content can be searched, filtered, and explored efficiently. Instead of spending time across multiple disconnected sources, users can rely on our platform to find relevant material in a structured and user-friendly way.
                </p>
              </div>
              
              <div>
                <h2 className="text-3xl font-bold text-slate-900">Our Mission</h2>
                <p className="mt-4 text-lg text-slate-600 leading-relaxed">
                  Our mission is to simplify academic discovery through:
                </p>
                <ul className="mt-6 space-y-4">
                  {[
                    "Structured knowledge systems that organize content by subject, format, and relevance",
                    "Verified content sources to help ensure authenticity, transparency, and trust",
                    "Advanced search and analytics tools that improve discovery, usability, and research efficiency",
                    "Curated access to both proprietary and open-access resources in one integrated platform"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                      <span className="text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 overflow-hidden shadow-2xl relative flex items-center justify-center border border-slate-800">
                {/* Background decorative elements */}
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.3),transparent_60%)]" />
                  {/* Grid pattern */}
                  <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                </div>

                {/* Floating Icons */}
                <div className="absolute top-16 left-16 p-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 animate-[bounce_4s_infinite]">
                  <Library className="text-blue-300" size={32} />
                </div>
                <div className="absolute bottom-24 left-20 p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 animate-[pulse_3s_infinite]">
                  <Database className="text-sky-300" size={28} />
                </div>
                <div className="absolute top-24 right-20 p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 animate-[pulse_4s_infinite]">
                  <Microscope className="text-indigo-300" size={30} />
                </div>
                <div className="absolute bottom-20 right-16 p-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 animate-[bounce_5s_infinite]">
                  <FileText className="text-blue-200" size={32} />
                </div>
                
                {/* Central Focus */}
                <div className="relative z-10 flex items-center justify-center">
                  <div className="bg-white px-8 py-6 rounded-3xl shadow-[0_0_60px_rgba(255,255,255,0.2)] border border-white/50 flex items-center gap-3">
                    <img src="/logo.png" alt="STM Digital Library Logo" className="h-12 w-12 object-contain drop-shadow-md" />
                    <div className="flex flex-col text-left">
                      <span className="text-xl font-bold tracking-tight text-slate-900">STM</span>
                      <span className="text-[0.65rem] font-bold uppercase tracking-widest text-blue-600">Digital Library</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 rounded-2xl bg-blue-600 p-8 text-white shadow-xl">
                <div className="text-4xl font-bold">Trusted</div>
                <div className="text-sm font-medium opacity-80 uppercase tracking-widest text-center mt-1">Knowledge Partner</div>
              </div>
            </div>
          </div>

          <div className="mt-24 bg-slate-50 rounded-3xl p-12 border border-slate-200">
            <p className="text-xl text-slate-700 leading-relaxed text-center max-w-4xl mx-auto italic">
              "We work closely with institutions, researchers, educators, and knowledge professionals to deliver reliable academic resources that support teaching, learning, and research. Our focus is on creating a trustworthy and scalable academic ecosystem that combines content quality, legal compliance, and ease of access."
            </p>
          </div>
        </div>
      </section>

      {/* Values / Features */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: ShieldCheck, title: "Authenticity", desc: "Verified content sources ensuring transparency and trust in every document." },
              { icon: Zap, title: "Efficiency", desc: "Advanced search and discovery tools designed for modern research workflows." },
              { icon: Globe, title: "Accessibility", desc: "Single integrated platform for both proprietary and open-access resources." }
            ].map((value, i) => (
              <div key={i} className="rounded-2xl bg-white p-8 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                  <value.icon size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{value.title}</h3>
                <p className="mt-4 text-slate-500 leading-relaxed">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
