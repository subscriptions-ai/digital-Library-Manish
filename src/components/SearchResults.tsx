import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search, BookOpen, FileText, Newspaper,
  Video, Users, Mail, Book, GraduationCap, ChevronLeft, ChevronRight, Filter, X, ArrowRight,
} from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "./ui";
import { SEARCH_PLACEHOLDER } from "./GlobalSearch";
import { CONTENT_TYPES } from "../constants";
import { DOMAINS } from "../constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContentItem {
  id: string;
  title: string;
  authors: string;
  domain: string;
  contentType: string;
  description: string;
  subjectArea: string;
  thumbnailUrl: string;
  accessType: string;
  publishedAt: string;
}

interface SearchResponse {
  data: ContentItem[];
  total: number;
  query: string;
  page: number;
  limit: number;
}

// ─── Icon map by content type ─────────────────────────────────────────────────
const CT_ICON: Record<string, any> = {
  Books:                    Book,
  Periodicals:              Newspaper,
  Magazines:                BookOpen,
  "Case Reports":           FileText,
  Theses:                   GraduationCap,
  "Conference Proceedings": Users,
  "Educational Videos":     Video,
  Newsletters:              Mail,
};

const LIMIT = 20;

/** The year a search result was published, or nothing if the date is unusable. */
function yearOf(date: string): number | null {
  if (!date) return null;
  const y = new Date(date).getFullYear();
  return Number.isFinite(y) ? y : null;
}

/** Placeholder cards with the same shape as a result, while a search runs. */
function ResultSkeletons() {
  return (
    <div className="space-y-3" role="status" aria-label="Searching">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card card-pad flex gap-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query        = searchParams.get("q") || "";
  const domainFilter = searchParams.get("domain") || "";
  const ctFilter     = searchParams.get("contentType") || "";
  const currentPage  = parseInt(searchParams.get("page") || "1");

  const [inputVal, setInputVal]   = useState(query);
  const [results, setResults]     = useState<SearchResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const doSearch = useCallback(async () => {
    if (!query || query.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ q: query, page: String(currentPage), limit: String(LIMIT) });
      if (domainFilter) params.set("domain", domainFilter);
      if (ctFilter)     params.set("contentType", ctFilter);
      const res  = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      // A failed search answers with { error }, which has no rows to render.
      if (!res.ok || !Array.isArray(data?.data)) throw new Error("search failed");
      setResults(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query, domainFilter, ctFilter, currentPage]);

  useEffect(() => { doSearch(); }, [doSearch]);
  useEffect(() => { setInputVal(query); }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setSearchParams({ q: inputVal.trim(), page: "1" });
  };

  const setFilter = (key: string, val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val); else next.delete(key);
    next.set("page", "1");
    setSearchParams(next);
  };

  // Both filters in one update; two setFilter calls each start from the same
  // stale params, so the second put the first filter back.
  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("domain");
    next.delete("contentType");
    next.set("page", "1");
    setSearchParams(next);
  };

  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalPages = results ? Math.ceil(results.total / LIMIT) : 0;

  // Page numbers to offer: up to seven, centred on the current page.
  const pageNumbers = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    let p = i + 1;
    if (totalPages > 7) {
      if (currentPage <= 4) p = i + 1;
      else if (currentPage >= totalPages - 3) p = totalPages - 6 + i;
      else p = currentPage - 3 + i;
    }
    return p;
  });

  return (
    <div className="bg-ground">
      {/* ── Search Hero Bar ──────────────────────────────────────────── */}
      <div className="border-b border-rule bg-surface py-8 sm:py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="type-page-title mb-5 break-words text-ink">
            {query ? (
              <>Search results for <span className="text-accent">"{query}"</span></>
            ) : (
              "Search the Library"
            )}
          </h1>
          <form onSubmit={handleSubmit} role="search" className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-3">
            <div className="relative w-full sm:flex-1">
              <label htmlFor="search-results-input" className="sr-only">Search the library</label>
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input
                id="search-results-input"
                type="search"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={SEARCH_PLACEHOLDER}
                className="input h-[46px] pl-11 pr-11 text-ellipsis [&::-webkit-search-cancel-button]:hidden"
              />
              {inputVal && (
                <button
                  type="button"
                  onClick={() => setInputVal("")}
                  title="Clear search"
                  aria-label="Clear search"
                  className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <Button type="submit" variant="brand" className="h-[46px] flex-1 sm:flex-none sm:px-6">
              Search
            </Button>
            <button
              type="button"
              onClick={() => setShowFilters((f) => !f)}
              aria-expanded={showFilters}
              aria-controls="search-filters"
              className={`btn h-[46px] flex-1 sm:flex-none ${showFilters ? "btn-outline border-accent bg-accent-soft text-accent" : "btn-outline"}`}
            >
              <Filter size={16} aria-hidden="true" /> Filters
              {(domainFilter || ctFilter) && (
                <span className="badge badge-accent ml-1">{[domainFilter, ctFilter].filter(Boolean).length}</span>
              )}
            </button>
          </form>

          {/* Filters */}
          {showFilters && (
            <div id="search-filters" className="mt-4 grid gap-4 border-t border-rule pt-4 sm:flex sm:flex-wrap sm:items-end">
              {/* Domain filter */}
              <div className="field sm:min-w-[220px]">
                <label htmlFor="search-filter-domain" className="field-label">Domain</label>
                <select
                  id="search-filter-domain"
                  value={domainFilter}
                  onChange={(e) => setFilter("domain", e.target.value)}
                  className="input"
                >
                  <option value="">All Domains</option>
                  {DOMAINS.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Content Type filter */}
              <div className="field sm:min-w-[200px]">
                <label htmlFor="search-filter-type" className="field-label">Content Type</label>
                <select
                  id="search-filter-type"
                  value={ctFilter}
                  onChange={(e) => setFilter("contentType", e.target.value)}
                  className="input"
                >
                  <option value="">All Types</option>
                  {CONTENT_TYPES.map((ct) => (
                    <option key={ct.id} value={ct.name}>{ct.name}</option>
                  ))}
                </select>
              </div>

              {/* Clear filters */}
              {(domainFilter || ctFilter) && (
                <Button
                  variant="ghost"
                  onClick={clearFilters}
                  className="justify-self-start text-accent"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Results Area ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">

        {/* Loading */}
        {loading && <ResultSkeletons />}

        {/* Error */}
        {!loading && error && (
          <div className="card">
            <ErrorState
              title="Search failed"
              description="We could not run this search right now. Please try again."
              onRetry={doSearch}
            />
          </div>
        )}

        {/* No query */}
        {!loading && !error && !query && (
          <EmptyState
            icon={Search}
            title="Enter a keyword to search the library"
            description="Try searching for a topic, author, domain, or content type"
          />
        )}

        {/* No results */}
        {!loading && !error && query && results && results.data.length === 0 && (
          <div className="card">
            <EmptyState
              icon={BookOpen}
              title="No research results match this search"
              description={<>Nothing matched "{query}"{(domainFilter || ctFilter) ? " with these filters" : ""}. Try different keywords, or remove filters.</>}
            />
          </div>
        )}

        {/* Results */}
        {!loading && !error && results && results.data.length > 0 && (
          <>
            <p className="mb-5 text-sm text-muted" aria-live="polite">
              Showing <strong className="text-ink">{(currentPage - 1) * LIMIT + 1}–{Math.min(currentPage * LIMIT, results.total)}</strong> of{" "}
              <strong className="text-ink">{results.total.toLocaleString("en-IN")}</strong> results
              {domainFilter && <> in <span className="font-semibold text-accent">{domainFilter}</span></>}
              {ctFilter && <> · <span className="font-semibold text-accent">{ctFilter}</span></>}
            </p>

            <ul className="space-y-3">
              {results.data.map((item) => {
                const Icon = CT_ICON[item.contentType] || BookOpen;
                const year = yearOf(item.publishedAt);
                const domainId = DOMAINS.find(d => d.name === item.domain)?.id;
                return (
                  <li
                    key={item.id}
                    className="card card-pad flex gap-4 transition-colors hover:border-rule-2"
                  >
                    {/* Icon */}
                    <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent sm:flex" aria-hidden="true">
                      <Icon size={20} />
                    </div>

                    {/* Content: title, authors, source line, badges, action */}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold leading-snug text-ink break-words">
                        <Link to={`/preview/${item.id}`} className="hover:text-accent hover:underline">
                          {item.title}
                        </Link>
                      </h2>

                      {item.authors && (
                        <p className="mt-1 text-sm text-ink-2 line-clamp-2">{item.authors}</p>
                      )}

                      {(item.domain || year) && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          {item.domain && (
                            domainId ? (
                              <Link to={`/domain/${domainId}`} className="font-medium text-accent hover:underline">
                                {item.domain}
                              </Link>
                            ) : (
                              <span className="font-medium">{item.domain}</span>
                            )
                          )}
                          {item.domain && year && <span aria-hidden="true">·</span>}
                          {year && <span>{year}</span>}
                        </p>
                      )}

                      {item.description && (
                        <p className="mt-2 text-sm leading-relaxed text-ink-2 line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.contentType && (
                          <span className="badge badge-neutral">{item.contentType}</span>
                        )}
                        <span className={`badge ${item.accessType === "Open" ? "badge-success" : "badge-caution"}`}>
                          {item.accessType === "Open" ? "Open Access" : "Licensed Access"}
                        </span>
                        <Link
                          to={`/preview/${item.id}`}
                          className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                        >
                          View details <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <nav aria-label="Search results pages" className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="btn btn-outline btn-sm"
                >
                  <ChevronLeft size={16} aria-hidden="true" /> Prev
                </button>

                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === currentPage ? "page" : undefined}
                    className={`btn btn-sm btn-icon ${p === currentPage ? "btn-primary" : "btn-outline"}`}
                  >
                    {p}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  className="btn btn-outline btn-sm"
                >
                  Next <ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
