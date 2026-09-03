import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MyFavorites() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/user/favorites', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data);
      } else {
        toast.error("Failed to load wish list");
      }
    } catch (err) {
      toast.error("Network error");
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
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-faint" size={26} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint">
        Saved &mdash; {favorites.length} {favorites.length === 1 ? 'item' : 'items'}
      </p>

      {favorites.length === 0 ? (
        <div className="mt-3 rounded-md border border-rule bg-surface p-12 text-center">
          <h3 className="font-serif text-lg font-medium text-ink">Nothing saved yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">
            While reading, use the heart in the reader to keep something here.
          </p>
          <button
            onClick={() => navigate('/dashboard/library')}
            className="mt-6 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:bg-accent-hover"
          >
            Browse the library
          </button>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-rule rounded-md border border-rule bg-surface">
          {favorites.map((item, i) => (
            <div key={item.id} className="group flex gap-4 px-5 py-4">
              <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-[11px] text-faint sm:block">{i + 1}</span>

              <div className="min-w-0 flex-1">
                <button
                  onClick={() => navigate(item.itemType === 'Article' ? `/dashboard/article/${item.id}` : `/dashboard/viewer/${item.id}`)}
                  className="block w-full text-left"
                >
                  <h3 className="font-serif text-[16px] font-medium leading-snug text-ink group-hover:text-accent">
                    {item.title}
                  </h3>
                </button>

                {(item.authors || item.description) && (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2">
                    {item.authors || item.description}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {item.contentType && (
                    <span className="rounded-[3px] border border-rule-2 px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-muted">
                      {item.contentType}
                    </span>
                  )}
                  {item.domain && (
                    <span className="rounded-[3px] border border-rule-2 px-1.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-muted">
                      {item.domain}
                    </span>
                  )}
                  <span className="tnum font-mono text-[10.5px] text-faint">
                    saved {new Date(item.favoritedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => removeFavorite(item.id, e)}
                title="Remove from your saved items"
                className="h-7 shrink-0 self-start rounded-md px-2 text-alarm hover:bg-alarm-soft"
              >
                <Heart size={15} fill="currentColor" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
