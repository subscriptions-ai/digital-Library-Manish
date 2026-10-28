import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Heart, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, EmptyState, ErrorState, PageHeader, SkeletonRows, buttonClass, friendlyError } from '../ui';
import { SmartPagination } from '../SmartPagination';
import { forgetSaved } from '../library/SaveButton';
import { itemPath, useReaderBase } from '../../lib/readerBase';

const PAGE_SIZE = 20;

/**
 * What this reader has saved. "Saved" is the one name for it, here and on every heart.
 *
 * Nothing here changes on a guess: a remove is confirmed by the server before the row goes, and a list that failed to load is an error, not
 * an empty list. A saved item that has since been withdrawn stays visible, named as unavailable, so it can be removed and the count is honest.
 * Saving something is not access to it: opening it again goes through the reader, which applies today's access rules.
 */
export default function MyFavorites({ standalone = false }: { standalone?: boolean }) {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const base = useReaderBase();

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/user/favorites', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setFavorites(Array.isArray(data) ? data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchFavorites(); }, [fetchFavorites]);

  const removeFavorite = async (contentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (removing) return;
    setRemoving(contentId);
    try {
      const res = await fetch('/api/user/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ contentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw { status: res.status, error: data?.error };
      // The toggle answers with the new state. A "saved" here would mean the row was not there to remove; leave it be.
      if (data.favorited) { toast.error('That item was not in your saved list. It has been left as it is.'); return; }
      setFavorites(prev => prev.filter(f => f.id !== contentId));
      forgetSaved(contentId);
      toast.success('Removed from Saved');
    } catch (err) {
      toast.error(friendlyError(err, 'Could not remove it. Your saved items were not changed.'));
    } finally {
      setRemoving(null);
    }
  };

  const header = standalone ? <PageHeader title="Saved" description="Research you have kept to come back to." /> : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <div className="card card-pad" role="status" aria-label="Loading saved items"><SkeletonRows rows={4} /></div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <div className="card">
          <ErrorState description="We could not load your saved research right now. Please try again." onRetry={fetchFavorites} />
        </div>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(favorites.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = favorites.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl">
      {header}
      <h2 className="tnum font-mono text-[11px] uppercase tracking-wider text-muted">
        Saved &mdash; {favorites.length} {favorites.length === 1 ? 'item' : 'items'}
      </h2>

      {favorites.length === 0 ? (
        <div className="card mt-3">
          <EmptyState
            icon={Heart}
            title="No saved research yet"
            description="Use the heart on a result, a record or in the reader to keep something here."
            action={<Link to={`${base}/${base === '/dashboard' ? 'library' : 'explore'}`} className={buttonClass('primary')}>Browse the library</Link>}
          />
        </div>
      ) : (
        <>
          <ul className="card mt-3 divide-y divide-rule overflow-hidden">
            {shown.map((item, i) => {
              const n = (current - 1) * PAGE_SIZE + i + 1;
              const gone = !!item.unavailable;
              const isVideo = String(item.contentType || '').toLowerCase().includes('video');
              const kind = item.itemType === 'Article' ? 'article' : item.itemType === 'Book' ? 'book' : isVideo ? 'video' : 'content';
              return (
                <li key={item.id} className="group flex gap-4 px-4 py-4 sm:px-5">
                  <span className="tnum hidden w-7 shrink-0 pt-1 font-mono text-[11px] text-faint sm:block" aria-hidden="true">{n}</span>

                  <div className="min-w-0 flex-1">
                    {gone ? (
                      <>
                        <p className="flex items-center gap-2 font-serif text-[16px] font-medium leading-snug text-muted">
                          <EyeOff size={15} aria-hidden="true" /> This item is no longer available
                        </p>
                        <p className="mt-1 text-[13px] text-muted">It was withdrawn or removed from the library. You can take it off your list.</p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-serif text-[16px] font-medium leading-snug text-ink">
                          <button type="button" onClick={() => navigate(itemPath(base, kind, item.id))} className="text-left transition-colors hover:text-accent">
                            {item.title}
                          </button>
                        </h3>
                        {(item.authors || item.description) && (
                          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2">{item.authors || item.description}</p>
                        )}
                      </>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {!gone && item.contentType && <Badge className="max-w-full"><span className="truncate">{item.contentType}</span></Badge>}
                      {!gone && item.domain && <Badge className="max-w-full"><span className="truncate">{item.domain}</span></Badge>}
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
                    disabled={removing === item.id}
                    title="Remove from your saved items"
                    aria-label={gone ? 'Remove this unavailable item from your saved items' : `Remove “${item.title}” from your saved items`}
                    className={buttonClass('ghost', 'sm', 'btn-icon shrink-0 self-start text-accent hover:bg-alarm-soft hover:text-alarm disabled:opacity-50')}
                  >
                    <Heart size={16} fill="currentColor" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <SmartPagination page={current} totalPages={pages} onChange={setPage} total={favorites.length} pageSize={PAGE_SIZE} className="mt-4" />
        </>
      )}
    </div>
  );
}
