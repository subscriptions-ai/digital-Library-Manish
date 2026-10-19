import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, ImageOff, PenLine, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState, Skeleton, buttonClass } from '../ui';
import { PostImage } from '../blog/GeneratedCover';

/** Everything the writer has written, drafts first when they are unfinished. */
export function PostList() {
  const [posts, setPosts] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // Whether the pictures the database points at are still on disk. Shown only when something is wrong.
  const [storage, setStorage] = useState<{ filesMissing: number; mediaRecords: number; storage: { resets: number }; persistent: boolean | string; blogCoversMissing: any[];
    mediaStorage?: { driver: string; label: string; healthy: boolean; problem: string | null } } | null>(null);
  useEffect(() => {
    fetch('/api/admin/media/health', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => (r.ok ? r.json() : null)).then(d => d && setStorage(d)).catch(() => {});
  }, []);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ status });
    if (q) p.set('q', q);
    fetch(`/api/studio/posts?${p}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setPosts(d.posts); setCounts(d.counts || {}); })
      .catch(() => toast.error('Could not load your posts'))
      .finally(() => setLoading(false));
  }, [status, q]);

  const when = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-ink">Posts</h1>
          <p className="mt-1 text-sm text-muted">
            {counts.Published || 0} published · {counts.Draft || 0} in draft
          </p>
        </div>
        <Link to="/studio/new" className={buttonClass('primary')}>
          <PenLine size={16} aria-hidden="true" /> Write a post
        </Link>
      </div>

      {/* Where new uploads go, checked now. A problem here means uploads are refused until it is fixed — nothing is saved somewhere temporary. */}
      {storage?.mediaStorage && (storage.mediaStorage.healthy ? (
        <p className="mt-3 text-[12.5px] text-muted">
          Media storage: <b className="font-semibold text-ink-2">{storage.mediaStorage.label}</b> · <span className="text-success">Healthy</span>
        </p>
      ) : (
        <div role="alert" className="mt-4 rounded-lg border border-alarm/40 bg-alarm-soft px-4 py-3 text-[13px] leading-snug text-ink">
          <b className="font-semibold">Media storage: {storage.mediaStorage.label} — uploads are paused.</b>{' '}
          {storage.mediaStorage.problem} Ask the administrator to fix this; existing posts are not affected.
        </div>
      ))}

      {storage && (storage.filesMissing > 0 || storage.blogCoversMissing.length > 0 || storage.storage.resets > 0) && (
        <div role="alert" className="mt-4 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-[13px] leading-snug text-ink">
          <b className="font-semibold">Uploaded images are missing from storage.</b>{' '}
          {storage.blogCoversMissing.length > 0
            ? `The cover image of ${storage.blogCoversMissing.length} post${storage.blogCoversMissing.length === 1 ? '' : 's'} can no longer be found${storage.filesMissing > 0 ? `, and ${storage.filesMissing} of ${storage.mediaRecords} uploaded files in all` : ''}. `
            : storage.filesMissing > 0 ? `${storage.filesMissing} of ${storage.mediaRecords} uploaded files can no longer be found. ` : ''}
          Your posts have not been changed — each keeps its saved cover address — but those covers will not show until the image is uploaded again.
          {storage.storage.resets > 0 && ' The uploads folder was replaced since it was last checked: ask the administrator to put it on a persistent volume so this does not happen again.'}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:basis-auto sm:min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your posts…"
            aria-label="Search your posts" className="input pl-9" />
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter by status">
          {([['all', 'All'], ['Published', 'Published'], ['Draft', 'Drafts']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setStatus(id)} aria-pressed={status === id}
              className={`h-10 rounded-lg px-4 text-sm font-semibold transition-colors duration-150 ${
                status === id ? 'bg-accent text-accent-on' : 'border border-rule bg-surface text-ink-2 hover:bg-surface-2'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {posts.map(p => (
          <Link key={p.id} to={`/studio/posts/${p.id}`}
            className="card card-interactive flex gap-3 p-3 sm:gap-4 sm:p-4">
            {/* The same 16:9 frame and the same fallback as the public blog. */}
            <div className="aspect-video w-24 shrink-0 self-start overflow-hidden rounded-lg bg-surface-2 sm:w-32">
              <PostImage src={p.coverUrl} seed={p.slug} className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${p.status === 'Published' ? 'badge-success' : 'badge-neutral'}`}>
                  {p.status}
                </span>
                {p.category && <span className="text-xs text-muted">{p.category}</span>}
                {p.coverUrl && p.coverMissing && (
                  <span className="badge badge-caution"><ImageOff size={12} aria-hidden="true" /> Cover image unavailable — replace image</span>
                )}
                {!p.coverUrl && (
                  p.status === 'Published'
                    ? <span className="badge badge-caution"><ImageOff size={12} aria-hidden="true" /> Cover image required</span>
                    : <span className="text-xs text-muted">No cover yet</span>
                )}
              </div>
              <p className="mt-1 truncate font-serif text-[17px] text-ink">{p.title}</p>
              {p.excerpt && <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{p.excerpt}</p>}
              <p className="mt-1.5 text-xs text-muted">
                {p.status === 'Published' ? `Published ${when(p.publishedAt)}` : `Edited ${when(p.updatedAt)}`}
                {' · '}{p.readMinutes} min read
                {p.status === 'Published' ? <> · <Eye size={12} className="inline" aria-hidden="true" /> {p.views}<span className="sr-only"> views</span></> : null}
              </p>
            </div>
          </Link>
        ))}

        {!loading && !posts.length && (
          <div className="card">
            <EmptyState
              icon={FileText}
              title="Nothing here yet."
              action={<Link to="/studio/new" className={buttonClass('primary', 'sm')}>Write the first post</Link>}
            />
          </div>
        )}
        {loading && [0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  );
}
