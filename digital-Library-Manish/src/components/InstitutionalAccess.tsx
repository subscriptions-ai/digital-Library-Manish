import React, { useState, useEffect } from "react";
import { ShieldCheck, Zap, BarChart3, Users, Globe, Check, ArrowRight, BookOpen, MapPin, Phone, Building2, User, Mail, Briefcase, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { COMPANY_DETAILS } from "../config";



import { DOMAINS } from "../constants";

const departments = DOMAINS.map(d => d.name);

export function InstitutionalAccess() {
  const [totalContentCount, setTotalContentCount] = useState<number | null>(null);

  // Fetch dynamic content count from the backend
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await fetch('/api/public/counts');
        if (response.ok) {
          const data = await response.json();
          if (data?.totalContent) {
            setTotalContentCount(data.totalContent);
          }
        }
      } catch (error) {
        console.error("Failed to fetch public counts:", error);
      }
    };
    fetchCounts();
  }, []);

  const handleDownloadBrochure = () => {
    const link = document.createElement('a');
    link.href = '/STM_Digital_Library_Brochure.pdf';
    link.download = 'STM_Digital_Library_Brochure.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Brochure download started!', { id: 'brochure' });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-blue-600 py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Empower Your Entire Institution</h1>
              <p className="mt-8 text-xl text-blue-100 leading-relaxed">
                Provide seamless, unlimited access to STM Digital Library for your students, faculty, and researchers. Trusted by 1,200+ universities worldwide.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link to="/request-demo" className="rounded-full bg-white px-8 py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all">
                  Request a Free Trial
                </Link>
                <button 
                  onClick={handleDownloadBrochure}
                  className="rounded-full border border-white/30 bg-white/10 px-8 py-4 text-sm font-bold text-white hover:bg-white/20 transition-all backdrop-blur-sm"
                >
                  Download Brochure
                </button>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-3xl bg-white/10 p-8 backdrop-blur-xl border border-white/20">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                      <Users className="text-white" size={24} />
                    </div>
                    <div>
                      <div className="text-sm font-bold">STM Digital Library</div>
                      <div className="text-xs text-blue-200">Global Academic Resource</div>
                    </div>
                  </div>
                  <div className="h-4 w-full rounded bg-white/10" />
                  <div className="h-4 w-3/4 rounded bg-white/10" />
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <div className="text-2xl font-bold">{totalContentCount ? `${totalContentCount.toLocaleString()}+` : "..."}</div>
                      <div className="text-[10px] uppercase tracking-widest opacity-60">Articles & Journals</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <div className="text-2xl font-bold">{departments.length}+</div>
                      <div className="text-[10px] uppercase tracking-widest opacity-60">Academic Domains</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Institutional Benefits</h2>
            <p className="mt-4 text-slate-600">Everything you need to manage research access at scale.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "IP-Based Authentication", desc: "No individual logins required. Seamless access for anyone on your campus network." },
              { icon: Globe, title: "Remote Access", desc: "Enable access for students and faculty working from home via proxy or Shibboleth." },
              { icon: BarChart3, title: "Usage Statistics", desc: "COUNTER-compliant reports to help you understand resource utilization." },
              { icon: ShieldCheck, title: "Librarian Dashboard", desc: "Centralized control panel to manage subscriptions and view analytics." },
              { icon: Users, title: "Unlimited Users", desc: "No caps on the number of simultaneous users from your institution." },
              { icon: BookOpen, title: "Archival Rights", desc: "Permanent access to content published during your subscription period." }
            ].map((feature, i) => (
              <div key={i} className="rounded-2xl bg-white p-8 border border-slate-200 shadow-sm">
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                  <feature.icon size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{feature.title}</h3>
                <p className="mt-4 text-slate-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-24" id="trial-form">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">How to Get Started?</h2>
              <p className="mt-6 text-lg text-slate-600">
                Setting up institutional access is a simple 3-step process. Our team will guide you every step of the way.
              </p>
              <div className="mt-10 space-y-8">
                {[
                  { step: "01", title: "Request a Quote", desc: "Tell us about your institution size and required domains." },
                  { step: "02", title: "Setup IP Ranges", desc: "Provide your campus IP ranges for seamless authentication." },
                  { step: "03", title: "Go Live", desc: "Your entire campus gets instant access to the digital library." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="text-4xl font-bold text-blue-100">{item.step}</div>
                    <div>
                      <h4 className="font-bold text-slate-900">{item.title}</h4>
                      <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900 p-8 md:p-12 text-white shadow-2xl flex flex-col items-center text-center justify-center min-h-[400px]">
              <div className="h-16 w-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-6">
                <PlayCircle className="text-blue-500" size={32} />
              </div>
              <h3 className="text-2xl font-bold mb-4">Start Your Institutional Trial</h3>
              <p className="text-slate-400 text-sm mb-8 max-w-sm">
                Ready to explore the STM Digital Library? Click the button below to request your personalized demo and trial access.
              </p>
              
              <Link 
                to="/request-demo"
                className="w-full max-w-sm rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                Request a Demo Session <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
