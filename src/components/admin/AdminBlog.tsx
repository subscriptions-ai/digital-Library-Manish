import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, PenLine, RefreshCw, User2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * The blog, as the admin sees it.
 *
 * Writers publish their own posts — the admin is not a gate. What the admin
 * gets instead is the record: every post, who wrote it, who published it and
 * when, and how many people have read it. Read-only on purpose; the place to
 * change a post is the editor's own screen.
 */

type Post = {
  id: string; slug: string; title: string; status: string; category?: string | null;
  authorName?: string | null; publishedBy?: string | null; publishedAt?: string | null;
  updatedAt: string; createdAt: string; views: number; readMinutes: number;
};

const n = (x?: number) => Number(x || 0).toLocaleString('en-IN');
const when = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

export function AdminBlog() {
  const [data, setData] = useState<{ posts: Post[]; counts: Record<string, number>; authors: { name: string; posts: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/blog', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => toast.error('Could not load the blog'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const posts = (data?.posts || []).filter(p => !status || p.status === status);
  const views = (data?.posts || []).reduce((t, p) => t + (p.views || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Blog</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every post, who published it and when. Writers publish their own; this is the record.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} title="Refresh"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm hover:bg-slate-50">
            <RefreshCw size={15} />
          </button>
          <a href="/blog" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <ExternalLink size={15} /> See the blog
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4">
        {[
          ['Published', data?.counts?.Published],
          ['In draft', data?.counts?.Draft],
          ['Reads in all', views],
          ['Writers', data?.authors?.length],
        ].map(([label, value]) => (
          <div key={label as string} className="p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value === undefined ? '—' : n(value as number)}</p>
          </div>
        ))}
      </div>

      {(data?.authors || []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data!.authors.map(a => (
            <span key={a.name} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] text-slate-600">
              <User2 size={13} className="text-slate-400" /> {a.name}
              <span className="font-mono text-[11px] text-slate-400">{a.posts}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([['', 'All'], ['Published', 'Published'], ['Draft', 'Drafts']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setStatus(id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              status === id ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-5 py-3.5">Post</th>
                <th className="border-b border-slate-200 px-5 py-3.5">Written by</th>
                <th className="border-b border-slate-200 px-5 py-3.5">Published</th>
                <th className="border-b border-slate-200 px-5 py-3.5 text-right">Reads</th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-50' : ''}>
              {posts.map(p => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="max-w-[420px] px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        p.status === 'Published' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.status === 'Published' ? <CheckCircle2 size={11} /> : <FileText size={11} />}
                        {p.status}
                      </span>
                      {p.category && <span className="text-[11px] text-slate-400">{p.category}</span>}
                    </div>
                    {p.status === 'Published' ? (
                      <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer"
                        className="mt-1 block truncate text-[14px] font-semibold text-slate-800 hover:text-blue-600">{p.title}</a>
                    ) : (
                      <p className="mt-1 truncate text-[14px] font-semibold text-slate-800">{p.title}</p>
                    )}
                    <p className="truncate text-[11px] text-slate-400">/blog/{p.slug} · {p.readMinutes} min read</p>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-slate-600">{p.authorName || '—'}</td>
                  <td className="px-5 py-3 text-[12.5px] text-slate-600">
                    {p.publishedAt ? (
                      <>
                        {when(p.publishedAt)}
                        <span className="block text-[11px] text-slate-400">by {p.publishedBy || p.authorName || 'unknown'}</span>
                      </>
                    ) : <span className="text-slate-400">Not published · edited {when(p.updatedAt)}</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-[13px] tabular-nums text-slate-700">{n(p.views)}</td>
                </tr>
              ))}
              {!loading && !posts.length && (
                <tr><td colSpan={4} className="px-5 py-14 text-center text-sm text-slate-400">
                  <PenLine size={22} className="mx-auto mb-2 text-slate-300" />
                  No posts yet. An editor writes them at /studio.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
