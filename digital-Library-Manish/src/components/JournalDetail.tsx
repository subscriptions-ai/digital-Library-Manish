import { useParams, Link } from "react-router-dom";
import { FEATURED_JOURNALS, DOMAINS } from "../constants";
import { BookOpen, Calendar, Award, Globe, FileText, Download, Share2, Bookmark, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { logUsage } from "../lib/usageTracker";

export function JournalDetail() {
  const { journalId } = useParams();
  const { profile } = useAuth();
  const journal = FEATURED_JOURNALS.find(j => j.id === journalId);
  const domain = DOMAINS.find(d => d.id === journal?.domainId);

  useEffect(() => {
    if (journal && profile) {
      logUsage(profile, { id: journal.id, title: journal.title }, 'View');
    }
  }, [journal?.id, profile?.uid]);

  const handleDownload = () => {
    if (journal && profile) {
      logUsage(profile, { id: journal.id, title: journal.title }, 'Download');
    }
  };

  if (!journal) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900">Journal Not Found</h1>
          <Link to="/journals" className="mt-8 inline-block text-blue-600 font-bold">Back to Library</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Breadcrumbs */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Link to="/" className="hover:text-slate-900">Home</Link>
            <ChevronRight size={12} />
            <Link to="/digital-library" className="hover:text-slate-900">Digital Library</Link>
            <ChevronRight size={12} />
            <Link to={`/domain/${domain?.id}`} className="hover:text-slate-900">{domain?.name}</Link>
            <ChevronRight size={12} />
            <span className="text-slate-900">{journal.title}</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 items-start">
            <div className="lg:col-span-1">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
                <img src={journal.coverImage} alt={journal.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="mt-8 space-y-4">
                <button className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-all">
                  Subscribe to Journal
                </button>
                <button 
                  onClick={handleDownload}
                  className="w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <Download size={16} /> Download Sample Issue
                </button>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Impact Factor: {journal.impactFactor}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  ISSN: {journal.issn}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  {journal.frequency}
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">{journal.title}</h1>
              <p className="mt-8 text-lg leading-relaxed text-slate-600">
                {journal.description}
              </p>

              <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8 border-y border-slate-100 py-8">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Globe size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Publisher</div>
                    <div className="text-sm font-bold text-slate-900">{journal.publisher}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Established</div>
                    <div className="text-sm font-bold text-slate-900">2010</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Award size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Indexing</div>
                    <div className="text-sm font-bold text-slate-900">Scopus, Web of Science</div>
                  </div>
                </div>
              </div>

              {/* Tabs Placeholder */}
              <div className="mt-12">
                <div className="flex gap-8 border-b border-slate-200 overflow-x-auto no-scrollbar">
                  {['Current Issue', 'All Issues', 'Aims & Scope', 'Editorial Board', 'Author Guidelines'].map((tab, i) => (
                    <button key={i} className={cn(
                      "pb-4 text-sm font-bold whitespace-nowrap transition-all border-b-2",
                      i === 0 ? "text-blue-600 border-blue-600" : "text-slate-400 border-transparent hover:text-slate-600"
                    )}>
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="py-12 space-y-8">
                  <h3 className="text-xl font-bold text-slate-900">Latest Articles</h3>
                  {[
                    { title: "Advanced Methodologies in Modern Research", authors: "Dr. A. Smith, Prof. B. Jones", date: "March 2026" },
                    { title: "A Comprehensive Review of Emerging Technologies", authors: "Dr. C. Williams, Dr. D. Brown", date: "February 2026" },
                    { title: "Impact of Digital Transformation on Academic Publishing", authors: "Prof. E. Davis", date: "January 2026" }
                  ].map((article, i) => (
                    <div key={i} className="group p-6 rounded-2xl border border-slate-200 bg-white hover:border-blue-200 hover:shadow-lg transition-all">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{article.title}</h4>
                          <p className="mt-2 text-sm text-slate-500">{article.authors}</p>
                          <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                            <span>{article.date}</span>
                            <span>•</span>
                            <span>Article ID: STM-2026-00{i+1}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-colors" title="Save">
                            <Bookmark size={20} />
                          </button>
                          <button className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-colors" title="Share">
                            <Share2 size={20} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-6 flex gap-4">
                        <button className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                          View Abstract <ChevronRight size={12} />
                        </button>
                        <button className="text-xs font-bold text-slate-900 hover:text-blue-600 flex items-center gap-1">
                          Full Text (PDF) <FileText size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
