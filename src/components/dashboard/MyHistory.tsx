import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Clock, BookOpen, PlayCircle } from 'lucide-react';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, buttonClass } from '../ui';

export default function MyHistory() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // A history that failed to load is not an empty history, so it is not shown as one.
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/user/history', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      } else {
        setFailed(true);
      }
    } catch (err) {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const header = <PageHeader title="Reading History" description="Recently viewed articles, books, and videos." />;

  if (loading) {
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

  return (
    <div className="mx-auto max-w-6xl pb-12">
      {header}

      {failed ? (
        <div className="card">
          <ErrorState description="We could not load your reading history right now. Please try again." onRetry={fetchHistory} />
        </div>
      ) : history.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Clock}
            title="No reading history yet"
            description="You haven't read or watched any content yet. Start exploring your library to see your history here."
            action={<Link to="/dashboard/library" className={buttonClass('primary')}>Browse the library</Link>}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {history.map((activity) => {
            const item = activity.content;
            if (!item) return null;
            const isVideo = item.contentType?.toLowerCase().includes('video');
            const Icon = isVideo ? PlayCircle : BookOpen;
            const viewed = activity.accessedAt ? new Date(activity.accessedAt) : null;
            return (
              <li key={activity.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isVideo) navigate(`/dashboard/videos/player/${item.id}`);
                    else navigate(`/dashboard/viewer/${item.id}`);
                  }}
                  className="card group flex h-full w-full flex-col p-5 text-left transition-colors hover:border-accent"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    {item.contentType && <Badge className="max-w-full"><span className="truncate">{item.contentType}</span></Badge>}
                  </div>
                  <h3 className="mb-1 line-clamp-2 font-semibold text-ink transition-colors group-hover:text-accent">
                    {item.title}
                  </h3>
                  {/* A missing author or department is left out, not filled with a stand-in. */}
                  {item.authors && <p className="line-clamp-2 text-sm text-muted">{item.authors}</p>}

                  <div className="mt-auto w-full pt-4"><div className="flex items-center justify-between gap-3 border-t border-rule pt-3 text-xs">
                    {item.domain ? <span className="min-w-0 truncate text-ink-2">{item.domain}</span> : <span />}
                    {viewed && (
                      <span className="tnum flex shrink-0 items-center gap-1 text-muted" title={`Viewed on ${viewed.toLocaleDateString()}`}>
                        <Clock size={12} aria-hidden="true" />
                        {viewed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div></div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
