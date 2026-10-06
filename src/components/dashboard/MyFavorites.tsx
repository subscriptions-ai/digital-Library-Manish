import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, EmptyState, ErrorState, SkeletonRows, buttonClass } from '../ui';

export default function MyFavorites() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // A list that failed to load is not an empty list, so it is not shown as one.
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  const fetchFavorites = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/user/favorites', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data);
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
    fetchFavorites();
  }, []);

  const removeFavorite = async (contentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/user/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ contentId })
      });
      const data = await res.json();
      if (data.success && !data.favorited) {
        setFavorites(prev => prev.filter(f => f.id !== contentId));
        toast.success("Removed from Wish List");
      }
    } catch (err) {
      toast.error("Failed to remove");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="card card-pad"><SkeletonRows rows={4} /></div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="card">
          <ErrorState description="We could not load your saved research right now. Please try again." onRetry={fetchFavorites} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="tnum font-mono text-[11px] uppercase tracking-wider text-muted">
        Saved &mdash; {favorites.length} {favorites.length === 1 ? 'item' : 'items'}
      </h2>

      {favorites.length === 0 ? (
        <div className="card mt-3">
          <EmptyState
            icon={Heart}
            title="No saved research yet"
            description="While reading, use the heart in the reader to keep something here."
            action={<Link to="/dashboard/library" className={buttonClass('primary')}>Browse the library</Link>}
          />
        </div>
      ) : (
        <ul className="card mt-3 divide-y divide-rule overflow-hidden">
          {favorites.map((item, i) => (
            <li key={item.id} className="group flex gap-4 px-4 py-4 sm:px-5">
              <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-[11px] text-faint sm:block" aria-hidden="true">{i + 1}</span>

              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-[16px] font-medium leading-snug text-ink">
                  <button
                    type="button"
                    onClick={() => navigate(item.itemType === 'Article' ? `/dashboard/article/${item.id}` : `/dashboard/viewer/${item.id}`)}
                    className="text-left transition-colors hover:text-accent"
                  >
                    {item.title}
                  </button>
                </h3>

                {(item.authors || item.description) && (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2">
                    {item.authors || item.description}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {item.contentType && <Badge className="max-w-full"><span className="truncate">{item.contentType}</span></Badge>}
                  {item.domain && <Badge className="max-w-full"><span className="truncate">{item.domain}</span></Badge>}
                  {item.favoritedAt && (
                    <span className="tnum font-mono text-[11px] text-muted">
                      saved {new Date(item.favoritedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => removeFavorite(item.id, e)}
                title="Remove from your saved items"
                aria-label={`Remove "${item.title}" from your saved items`}
                className={buttonClass('ghost', 'sm', 'btn-icon shrink-0 self-start text-accent hover:bg-alarm-soft hover:text-alarm')}
              >
                <Heart size={16} fill="currentColor" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
