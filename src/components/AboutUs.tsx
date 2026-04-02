import { ShieldCheck, Users, Target, Award, Globe, Zap } from "lucide-react";

export function AboutUs() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-slate-900 py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">About STM Digital Library</h1>
          <p className="mt-6 text-xl text-slate-300 max-w-3xl mx-auto">
            We are a leading academic publisher and digital library provider, dedicated to disseminating high-quality research across the globe.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-bold text-slate-900">Our Mission</h2>
                <p className="mt-4 text-lg text-slate-600 leading-relaxed">
                  To empower the global research community by providing a robust, accessible, and high-quality platform for the publication and discovery of academic knowledge. We strive to bridge the gap between researchers and the information they need to innovate.
                </p>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-slate-900">Our Vision</h2>
                <p className="mt-4 text-lg text-slate-600 leading-relaxed">
                  To become the world's most trusted and comprehensive digital repository for specialized academic research, fostering a culture of excellence and open scholarly communication.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-3xl bg-slate-100 overflow-hidden">
                <img 
                  src="https://picsum.photos/seed/mission/800/800" 
                  alt="Our Mission" 
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 rounded-2xl bg-blue-600 p-8 text-white shadow-xl">
                <div className="text-4xl font-bold">15+</div>
                <div className="text-sm font-medium opacity-80 uppercase tracking-widest">Years of Excellence</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Our Core Values</h2>
            <p className="mt-4 text-slate-600">The principles that guide everything we do.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: ShieldCheck, title: "Integrity", desc: "We maintain the highest standards of publication ethics and peer-review integrity." },
              { icon: Award, title: "Excellence", desc: "We strive for excellence in every journal we publish and every service we provide." },
              { icon: Globe, title: "Inclusivity", desc: "We support researchers from all backgrounds and regions to share their work." },
              { icon: Zap, title: "Innovation", desc: "We continuously evolve our platform to meet the changing needs of the digital age." },
              { icon: Users, title: "Collaboration", desc: "We believe in the power of collaborative research and knowledge sharing." },
              { icon: Target, title: "Impact", desc: "We focus on publishing research that has a real-world impact on society." }
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

      {/* Team / Leadership */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Our Leadership</h2>
            <p className="mt-4 text-slate-600">Meet the experts behind STM Digital Library.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { name: "Dr. Sarah Johnson", role: "Editor-in-Chief", img: "https://picsum.photos/seed/p1/400/400" },
              { name: "Prof. Michael Chen", role: "Director of Research", img: "https://picsum.photos/seed/p2/400/400" },
              { name: "Elena Rodriguez", role: "Head of Digital Strategy", img: "https://picsum.photos/seed/p3/400/400" },
              { name: "David Smith", role: "Institutional Relations", img: "https://picsum.photos/seed/p4/400/400" }
            ].map((member, i) => (
              <div key={i} className="text-center group">
                <div className="aspect-square rounded-2xl overflow-hidden mb-4 grayscale group-hover:grayscale-0 transition-all duration-500">
                  <img src={member.img} alt={member.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">{member.name}</h4>
                <p className="text-sm text-slate-500">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
