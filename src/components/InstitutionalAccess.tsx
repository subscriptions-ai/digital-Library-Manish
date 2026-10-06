import React, { useState, useEffect } from "react";
import { ShieldCheck, Zap, BarChart3, Users, Globe, Check, ArrowRight, BookOpen, MapPin, Phone, Building2, User, Mail, Briefcase, PlayCircle, Download, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { COMPANY_DETAILS } from "../config";
import { buttonClass } from "./ui";



import { DOMAINS } from "../constants";
import { MAX_INSTITUTION_USERS } from "../lib/institutionPricing";

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

  const [preparingBrochure, setPreparingBrochure] = useState(false);

  // Fetched first and checked, then saved from memory — so what lands in the
  // downloads folder is the PDF or nothing, never a web page with a .pdf name,
  // and the success message only appears when there is a real file.
  const handleDownloadBrochure = async () => {
    if (preparingBrochure) return;
    setPreparingBrochure(true);
    toast.loading('Preparing brochure…', { id: 'brochure' });
    let url = '';
    try {
      const res = await fetch('/STM_Digital_Library_Brochure.pdf', { cache: 'no-cache' });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('application/pdf')) throw new Error('not a pdf');
      const bytes = await res.arrayBuffer();
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('not a pdf');
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'STM_Digital_Library_Brochure.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Brochure downloaded', { id: 'brochure' });
    } catch {
      toast.error('We could not download the brochure just now. Please try again, or contact us and we will send it to you.', { id: 'brochure', duration: 6000 });
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
      setPreparingBrochure(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Hero */}
      <section className="bg-navy py-12 sm:py-16 lg:py-24">
        <div className="container-public">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h1 className="on-dark text-5xl font-bold leading-tight">Empower Your Entire Institution</h1>
              <p className="on-dark-2 mt-6 text-base leading-relaxed sm:text-lg">
                Provide seamless, unlimited access to STM Digital Library for your students, faculty, and researchers. Trusted by 1,200+ universities worldwide.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/signup" className={buttonClass("highlight", "lg")}>
                  Create a Free Account
                </Link>
                <button 
                  type="button"
                  onClick={handleDownloadBrochure}
                  disabled={preparingBrochure}
                  aria-busy={preparingBrochure || undefined}
                  className="btn btn-lg on-dark on-dark-fill on-dark-edge"
                >
                  {preparingBrochure ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
                  {preparingBrochure ? 'Preparing brochure…' : 'Download Brochure'}
                </button>
              </div>
            </div>
            <div className="hidden lg:block" aria-hidden="true">
              <div className="on-dark-fill on-dark-edge relative rounded-2xl border p-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="on-dark-fill flex h-12 w-12 items-center justify-center rounded-full">
                      <Users className="text-amber" size={24} />
                    </div>
                    <div>
                      <div className="on-dark text-sm font-bold">STM Digital Library</div>
                      <div className="on-dark-3 text-xs">Global Academic Resource</div>
                    </div>
                  </div>
                  <div className="on-dark-fill h-4 w-full rounded" />
                  <div className="on-dark-fill h-4 w-3/4 rounded" />
                  <div className="mt-8 grid grid-cols-2 gap-4">
                    <div className="on-dark-fill on-dark-edge rounded-xl border p-4">
                      <div className="on-dark text-2xl font-bold tnum">{totalContentCount ? `${totalContentCount.toLocaleString()}+` : "—"}</div>
                      <div className="on-dark-3 text-xs uppercase tracking-widest">Articles & Journals</div>
                    </div>
                    <div className="on-dark-fill on-dark-edge rounded-xl border p-4">
                      <div className="on-dark text-2xl font-bold tnum">{departments.length}+</div>
                      <div className="on-dark-3 text-xs uppercase tracking-widest">Academic Domains</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="bg-ground py-16 sm:py-24">
        <div className="container-public">
          <div className="mb-12 text-center sm:mb-16">
            <h2 className="text-3xl font-bold text-ink">Institutional Benefits</h2>
            <p className="mt-4 text-ink-2">Everything you need to manage research access at scale.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
            {[
              { icon: Zap, title: "IP-Based Authentication", desc: "No individual logins required. Seamless access for anyone on your campus network." },
              { icon: Globe, title: "Remote Access", desc: "Enable access for students and faculty working from home via proxy or Shibboleth." },
              { icon: BarChart3, title: "Usage Statistics", desc: "COUNTER-compliant reports to help you understand resource utilization." },
              { icon: ShieldCheck, title: "Librarian Dashboard", desc: "Centralized control panel to manage access and view analytics." },
              { icon: Users, title: "Users That Scale", desc: `Up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users with every subscription, at no extra charge.` },
              { icon: BookOpen, title: "Archival Rights", desc: "Permanent access to content published during your access period." }
            ].map((feature, i) => (
              <div key={i} className="card card-pad">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <feature.icon size={24} />
                </div>
                <h3 className="text-xl font-bold text-ink">{feature.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="scroll-mt-20 py-16 sm:py-24" id="trial-form">
        <div className="container-public">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-3xl font-bold text-ink">How to Get Started?</h2>
              <p className="mt-5 text-base text-ink-2 sm:text-lg">
                Setting up institutional access is a simple 3-step process. Our team will guide you every step of the way.
              </p>
              <ol className="mt-10 space-y-8">
                {[
                  { step: "01", title: "Request a Quote", desc: "Tell us about your institution size and required domains." },
                  { step: "02", title: "Setup IP Ranges", desc: "Provide your campus IP ranges for seamless authentication." },
                  { step: "03", title: "Go Live", desc: "Your entire campus gets instant access to the digital library." }
                ].map((item, i) => (
                  <li key={i} className="flex gap-6">
                    <div className="w-12 shrink-0 text-3xl font-bold text-accent tnum" aria-hidden="true">{item.step}</div>
                    <div>
                      <h3 className="font-bold text-ink">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl bg-navy p-6 text-center sm:p-10">
              <div className="on-dark-fill mb-6 flex h-16 w-16 items-center justify-center rounded-full" aria-hidden="true">
                <PlayCircle className="text-amber" size={32} />
              </div>
              <h3 className="on-dark mb-4 text-2xl font-bold">Open the library today</h3>
              <p className="on-dark-2 mb-8 max-w-sm text-sm">
                Create a free account and start reading straight away — the whole collection, every subject. Bring your students in when you are ready.
              </p>
              
              <Link to="/signup" className={buttonClass("highlight", "lg", "w-full max-w-sm")}>
                Create a Free Account <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
