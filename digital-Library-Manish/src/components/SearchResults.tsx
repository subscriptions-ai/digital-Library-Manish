import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search, Loader2, BookOpen, FileText, Newspaper,
  Video, Users, Mail, Book, GraduationCap, ChevronLeft, ChevronRight, Filter,
} from "lucide-react";
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
  price: number;
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

  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalPages = results ? Math.ceil(results.total / LIMIT) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Search Hero Bar ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-6">
            {query ? (
              <>Search results for <span className="text-indigo-600">"{query}"</span></>
            ) : (
              "Search the Library"
            )}
          </h1>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Search journals, books, topics…"
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 px-7 py-3 text-sm font-bold text-white transition-all"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowFilters((f) => !f)}
              className={`flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition-all ${
                showFilters
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <Filter size={15} /> Filters
            </button>
          </form>

          {/* Filters */}
          {showFilters && (
            <div className="mt-4 flex flex-wrap gap-4 pt-4 border-t border-slate-100">
              {/* Domain filter */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Domain</label>
                <select
                  value={domainFilter}
                  onChange={(e) => setFilter("domain", e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                >
                  <option value="">All Domains</option>
                  {DOMAINS.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Content Type filter */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Content Type</label>
                <select
                  value={ctFilter}
                  onChange={(e) => setFilter("contentType", e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                >
                  <option value="">All Types</option>
                  {CONTENT_TYPES.map((ct) => (
                    <option key={ct.id} value={ct.name}>{ct.name}</option>
                  ))}
                </select>
              </div>

              {/* Clear filters */}
              {(domainFilter || ctFilter) && (
                <button
                  onClick={() => { setFilter("domain", ""); setFilter("contentType", ""); }}
                  className="self-end rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition-all"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Results Area ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
            <Loader2 className="animate-spin" size={22} />
            <span className="text-sm">Searching…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-600 text-sm">
            Search failed. Please try again.
          </div>
        )}

        {/* No query */}
        {!loading && !error && !query && (
          <div className="text-center py-24 text-slate-400">
            <Search size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-semibold">Enter a keyword to search the library</p>
            <p className="text-sm mt-1">Try searching for a topic, author, domain, or content type</p>
          </div>
        )}

        {/* No results */}
        {!loading && !error && query && results && results.data.length === 0 && (
          <div className="text-center py-24 text-slate-400">
            <BookOpen size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-semibold text-slate-700">No results for "{query}"</p>
            <p className="text-sm mt-1">Try different keywords, or remove filters</p>
          </div>
        )}

        {/* Results */}
        {!loading && !error && results && results.data.length > 0 && (
          <>
            <p className="text-sm text-slate-500 mb-6">
              Showing <strong className="text-slate-800">{(currentPage - 1) * LIMIT + 1}–{Math.min(currentPage * LIMIT, results.total)}</strong> of{" "}
              <strong className="text-slate-800">{results.total.toLocaleString("en-IN")}</strong> results
              {domainFilter && <> in <span className="text-indigo-600 font-semibold">{domainFilter}</span></>}
              {ctFilter && <> · <span className="text-indigo-600 font-semibold">{ctFilter}</span></>}
            </p>

            <div className="space-y-4">
              {results.data.map((item) => {
                const Icon = CT_ICON[item.contentType] || BookOpen;
                return (
                  <div
                    key={item.id}
                    className="flex gap-5 bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all"
                  >
                    {/* Icon */}
                    <div className="shrink-0 h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                      <Icon size={22} className="text-indigo-500" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                          {item.contentType}
                        </span>
                        {item.domain && (
                          <Link
                            to={`/domain/${DOMAINS.find(d => d.name === item.domain)?.id || ""}`}
                            className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-600 hover:underline"
                            onClick={(e) => { if (!DOMAINS.find(d => d.name === item.domain)) e.preventDefault(); }}
                          >
                            {item.domain}
                          </Link>
                        )}
                        <span className={`ml-auto shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          item.accessType === "Open" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        }`}>
                          {item.accessType === "Open" ? "Open Access" : "Subscription"}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {item.title}
                      </h3>

                      {item.authors && (
                        <p className="text-xs text-slate-500 mt-0.5">{item.authors}</p>
                      )}

                      {item.description && (
                        <p className="text-sm text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={16} /> Prev
                </button>

                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p = i + 1;
                  if (totalPages > 7) {
                    if (currentPage <= 4) p = i + 1;
                    else if (currentPage >= totalPages - 3) p = totalPages - 6 + i;
                    else p = currentPage - 3 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-9 w-9 rounded-full text-sm font-bold transition-all ${
                        p === currentPage
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
