import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, PenLine, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

/** Everything the writer has written, drafts first when they are unfinished. */
export function PostList() {
  const [posts, setPosts] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-ink">Posts</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {counts.Published || 0} published · {counts.Draft || 0} in draft
          </p>
        </div>
        <Link to="/studio/new"
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-accent-hover">
          <PenLine size={15} /> Write a post
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your posts…"
            className="w-full rounded-xl border border-rule bg-surface py-2.5 pl-9 pr-3 text-[13.5px] outline-none focus:border-accent" />
        </div>
        {([['all', 'All'], ['Published', 'Published'], ['Draft', 'Drafts']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setStatus(id)}
            className={`rounded-xl px-4 py-2 text-[13px] font-semibold ${
              status === id ? 'bg-ink text-surface' : 'border border-rule text-ink-2 hover:bg-surface-2'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {posts.map(p => (
          <Link key={p.id} to={`/studio/posts/${p.id}`}
            className="flex gap-4 rounded-2xl border border-rule bg-surface p-4 transition-shadow hover:shadow-md">
            <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-surface-2">
              {p.coverUrl
                ? <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full items-center justify-center text-faint"><FileText size={18} /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${
                  p.status === 'Published' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
                  {p.status}
                </span>
                {p.category && <span className="text-[11.5px] text-faint">{p.category}</span>}
              </div>
              <p className="mt-1 truncate font-serif text-[17px] text-ink">{p.title}</p>
              {p.excerpt && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">{p.excerpt}</p>}
              <p className="mt-1.5 font-mono text-[11px] text-faint">
                {p.status === 'Published' ? `Published ${when(p.publishedAt)}` : `Edited ${when(p.updatedAt)}`}
                {' · '}{p.readMinutes} min read
                {p.status === 'Published' ? <> · <Eye size={11} className="inline" /> {p.views}</> : null}
              </p>
            </div>
          </Link>
        ))}

        {!loading && !posts.length && (
          <div className="rounded-2xl border border-dashed border-rule-2 bg-surface p-12 text-center">
            <FileText size={26} className="mx-auto text-faint" />
            <p className="mt-2 text-[14px] text-muted">Nothing here yet.</p>
            <Link to="/studio/new" className="mt-3 inline-block text-[13.5px] font-semibold text-accent hover:underline">
              Write the first post
            </Link>
          </div>
        )}
        {loading && [0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-2" />)}
      </div>
    </div>
  );
}
