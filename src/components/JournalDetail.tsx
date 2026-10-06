import { useParams, Link } from "react-router-dom";
import { FEATURED_JOURNALS, DOMAINS } from "../constants";
import { Calendar, Award, Globe, FileText, Download, Share2, Bookmark, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { logUsage } from "../lib/usageTracker";
import { JournalRecord } from "./library/PublicRecord";
import { buttonClass } from "./ui";

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

  // FEATURED_JOURNALS is a hand-written list of a few showcase titles. Anything
  // else — which is every journal we actually hold — is read from the library.
  if (!journal) return <JournalRecord />;

  return (
    <div className="bg-ground">
      {/* Breadcrumbs */}
      <div className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted">
            <Link to="/" className="hover:text-ink">Home</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <Link to="/digital-library" className="hover:text-ink">Digital Library</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <Link to={`/domain/${domain?.id}`} className="hover:text-ink">{domain?.name}</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span className="min-w-0 truncate text-ink" aria-current="page">{journal.title}</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-surface py-8 sm:py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-4 lg:gap-12">
            <div className="mx-auto w-full max-w-[280px] lg:col-span-1 lg:max-w-none">
              <div className="aspect-[3/4] overflow-hidden rounded-xl border border-rule shadow-sm">
                <img src={journal.coverImage} alt={journal.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="mt-6 space-y-3">
                <Link to="/signup" className={buttonClass('highlight', 'md', 'w-full')}>
                  Register Free
                </Link>
                <button
                  type="button"
                  onClick={handleDownload}
                  className={buttonClass('outline', 'md', 'w-full')}
                >
                  <Download size={16} aria-hidden="true" /> Download Sample Issue
                </button>
              </div>
            </div>

            <div className="min-w-0 lg:col-span-3">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="badge badge-accent">
                  Impact Factor: {journal.impactFactor}
                </span>
                <span className="badge badge-neutral">
                  ISSN: {journal.issn}
                </span>
                <span className="badge badge-neutral">
                  {journal.frequency}
                </span>
              </div>
              <h1 className="break-words text-3xl font-bold tracking-tight text-ink sm:text-4xl lg:text-5xl">{journal.title}</h1>
              <p className="mt-6 text-base leading-relaxed text-ink-2 sm:text-lg">
                {journal.description}
              </p>

              <dl className="mt-10 grid grid-cols-1 gap-6 border-y border-rule py-6 sm:grid-cols-3 sm:gap-8 sm:py-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                    <Globe size={20} />
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Publisher</dt>
                    <dd className="text-sm font-semibold text-ink">{journal.publisher}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                    <Calendar size={20} />
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Established</dt>
                    <dd className="text-sm font-semibold text-ink">2010</dd>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                    <Award size={20} />
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Indexing</dt>
                    <dd className="text-sm font-semibold text-ink">Scopus, Web of Science</dd>
                  </div>
                </div>
              </dl>

              {/* Tabs Placeholder */}
              <div className="mt-10">
                <div className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto border-b border-rule px-4 sm:mx-0 sm:gap-8 sm:px-0">
                  {['Current Issue', 'All Issues', 'Aims & Scope', 'Editorial Board', 'Author Guidelines'].map((tab, i) => (
                    <button key={i} type="button" aria-current={i === 0 ? 'true' : undefined} className={cn(
                      "-mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition-colors",
                      i === 0 ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
                    )}>
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="space-y-4 py-8 sm:py-10">
                  <h2 className="type-section text-ink">Latest Articles</h2>
                  {[
                    { title: "Advanced Methodologies in Modern Research", authors: "Dr. A. Smith, Prof. B. Jones", date: "March 2026" },
                    { title: "A Comprehensive Review of Emerging Technologies", authors: "Dr. C. Williams, Dr. D. Brown", date: "February 2026" },
                    { title: "Impact of Digital Transformation on Academic Publishing", authors: "Prof. E. Davis", date: "January 2026" }
                  ].map((article, i) => (
                    <div key={i} className="card card-pad transition-colors hover:border-rule-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="type-card-title text-ink">{article.title}</h3>
                          <p className="mt-1 text-sm text-ink-2">{article.authors}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <span>{article.date}</span>
                            <span aria-hidden="true">·</span>
                            <span>Article ID: STM-2026-00{i+1}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" className="btn btn-ghost btn-icon text-muted" title="Save" aria-label="Save">
                            <Bookmark size={18} aria-hidden="true" />
                          </button>
                          <button type="button" className="btn btn-ghost btn-icon text-muted" title="Share" aria-label="Share">
                            <Share2 size={18} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-4">
                        <button type="button" className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                          View Abstract <ChevronRight size={14} aria-hidden="true" />
                        </button>
                        <button type="button" className="flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-accent">
                          Full Text (PDF) <FileText size={14} aria-hidden="true" />
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
