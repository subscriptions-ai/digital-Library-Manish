import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Clock, BookOpen, PlayCircle, ExternalLink, FileText, EyeOff, Search } from 'lucide-react';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, buttonClass } from '../ui';
import { SmartPagination } from '../SmartPagination';
import { itemPath, useReaderBase } from '../../lib/readerBase';

type Entry = {
  id: string; kind: 'content' | 'article' | 'book' | 'video'; title: string | null; authors: string | null; contentType: string | null;
  domain: string | null; lastReadAt: string; lastPage: number; access: 'full' | 'external' | 'metadata' | 'video'; available: boolean;
};
type Page = { items: Entry[]; total: number; page: number; pages: number; pageSize: number };

const PAGE_SIZE = 12;

/** What opening it actually gave: a document is "read", a link-out is "opened", a bare record is "viewed". Never more than happened. */
const VERB: Record<Entry['access'], string> = { full: 'Last read', video: 'Last watched', external: 'Last opened', metadata: 'Last viewed' };

/**
 * The signed-in reader's own history, newest first. It is personal: the server returns only this account's entries and nothing else.
 * An entry is the reader's record of having opened something, not a licence to open it: Continue reading goes back through the reader,
 * which applies today's access rules, so an expired subscription or a withdrawn item is met there with its own explanation.
 */
export default function MyHistory() {
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  // A history that failed to load is not an empty history, so it is not shown as one.
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const base = useReaderBase();
  const seq = useRef(0);

  // The search waits for a pause in typing.
  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const fetchHistory = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/user/history?page=${page}&limit=${PAGE_SIZE}${query ? `&q=${encodeURIComponent(query)}` : ''}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (mine !== seq.current) return;
      setData(d && Array.isArray(d.items) ? d : null);
      if (!d || !Array.isArray(d.items)) setFailed(true);
    } catch {
      if (mine === seq.current) setFailed(true);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [page, query]);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  const header = <PageHeader title="Reading History" description="What you have opened recently: articles, books and videos." />;

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-6xl pb-12">
        {header}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading history">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card card-pad space-y-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-6xl pb-12">
        {header}
        <div className="card">
          <ErrorState description="We could not load your reading history right now. Please try again." onRetry={fetchHistory} />
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const searching = query.length > 0;

  return (
    <div className="mx-auto max-w-6xl pb-12">
      {header}

      {(data!.total > 0 || searching) && (
        <div className="relative mb-4 max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your history by title or author…"
            aria-label="Search your reading history" className="input w-full pl-9"
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="card">
          {searching ? (
            <EmptyState icon={Search} title="Nothing in your history matches" description={`No entry has “${query}” in its title or authors.`}
              action={<button type="button" onClick={() => setQ('')} className={buttonClass('outline')}>Clear search</button>} />
          ) : (
            <EmptyState
              icon={Clock}
              title="No reading history yet"
              description="Things you open to read or watch appear here, newest first."
              action={<Link to={`${base}/${base === '/dashboard' ? 'library' : 'explore'}`} className={buttonClass('primary')}>Browse the library</Link>}
            />
          )}
        </div>
      ) : (
        <>
          <ul className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {items.map(e => {
              const Icon = e.kind === 'video' ? PlayCircle : e.access === 'external' ? ExternalLink : e.access === 'metadata' ? FileText : BookOpen;
              const when = new Date(e.lastReadAt);
              const resumable = e.available && e.access === 'full' && e.lastPage > 1;
              // A document goes back to the reader; a link-out or a bare record goes to its record page, where the way out is.
              const target = e.kind === 'article' && e.access !== 'full' ? itemPath(base, 'article', e.id) : itemPath(base, e.kind === 'article' ? 'content' : e.kind, e.id);
              const open = () => navigate(`${target}${resumable ? `?page=${e.lastPage}` : ''}`);
              return (
                <li key={`${e.kind}-${e.id}`} className="card flex h-full flex-col p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true"><Icon size={16} /></span>
                    {e.contentType && <Badge className="max-w-full"><span className="truncate">{e.contentType}</span></Badge>}
                  </div>

                  {e.available ? (
                    <h3 className="mb-1 line-clamp-2 font-semibold text-ink">{e.title}</h3>
                  ) : (
                    <h3 className="mb-1 flex items-center gap-2 font-semibold text-muted"><EyeOff size={14} aria-hidden="true" /> No longer available</h3>
                  )}
                  {e.available && e.authors && <p className="line-clamp-2 text-sm text-muted">{e.authors}</p>}

                  <div className="mt-auto w-full pt-4">
                    <div className="flex items-center justify-between gap-3 border-t border-rule pt-3 text-xs">
                      {e.domain && e.available ? <span className="min-w-0 truncate text-ink-2">{e.domain}</span> : <span />}
                      <span className="tnum flex shrink-0 items-center gap-1 text-muted" title={when.toLocaleString()}>
                        <Clock size={12} aria-hidden="true" />
                        {VERB[e.access]} {when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {e.available && (
                      <button type="button" onClick={open} className={buttonClass('outline', 'sm', 'mt-3 w-full')}>
                        {e.kind === 'video' ? 'Watch again' : resumable ? `Continue reading · page ${e.lastPage}` : e.access === 'full' ? 'Open again' : 'Open record'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <SmartPagination page={data!.page} totalPages={data!.pages} onChange={setPage} total={data!.total} pageSize={data!.pageSize} className="mt-6" />
        </>
      )}
    </div>
  );
}
