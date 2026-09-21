import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowRight, BookOpen, Calendar, Clock, Search } from 'lucide-react';

/**
 * The public blog: the list, and one post.
 *
 * Its job is two-sided. It should be worth reading on its own, and it should
 * end by putting the reader in front of what the library actually holds on the
 * subject — a post about open access that does not lead into the open-access
 * collection has done half of what it was written for.
 */

type Card = {
  slug: string; title: string; excerpt?: string | null; coverUrl?: string | null;
  category?: string | null; authorName?: string | null; publishedAt: string; readMinutes: number;
};

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const LABEL = 'font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint';

function Cover({ post, className }: { post: Card; className: string }) {
  if (post.coverUrl) return <img src={post.coverUrl} alt="" loading="lazy" className={`object-cover ${className}`} />;
  return (
    <div className={`flex items-end bg-accent-soft p-4 ${className}`}>
      <span className="line-clamp-3 font-serif text-[15px] leading-tight text-accent">{post.title}</span>
    </div>
  );
}

export function BlogList() {
  const [sp, setSp] = useSearchParams();
  const category = sp.get('category') || '';
  const [search, setSearch] = useState(sp.get('q') || '');
  const [q, setQ] = useState(sp.get('q') || '');
  const [data, setData] = useState<{ posts: Card[]; total: number; categories: { name: string; posts: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const page = Math.max(1, parseInt(sp.get('page') || '1') || 1);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '9' });
    if (category) p.set('category', category);
    if (q) p.set('q', q);
    fetch(`/api/blog/posts?${p}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, category, q]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    next.delete('page');
    setSp(next);
  };

  const posts = data?.posts || [];
  const [lead, ...rest] = posts;

  return (
    <div className="bg-ground">
      <Helmet>
        <title>Blog — STM Digital Library</title>
        <meta name="description" content="Writing from STM Digital Library: what open-access research makes possible, how to get more from the library, and what has changed in the collection." />
      </Helmet>

      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <p className={LABEL}>The blog</p>
          <h1 className="mt-3 max-w-2xl font-serif text-[34px] font-medium leading-tight text-ink sm:text-[42px]">
            Writing from the library.
          </h1>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">
            What open research makes possible, how to get more out of the library, and what has
            changed in the collection.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input value={search} onChange={e => { setSearch(e.target.value); set('q', e.target.value.trim()); }}
                placeholder="Search the writing…"
                className="w-full rounded-xl border border-rule bg-ground py-2.5 pl-10 pr-3 text-[14px] outline-none focus:border-accent" />
            </div>
            <button onClick={() => set('category', '')}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${!category ? 'bg-ink text-surface' : 'border border-rule text-ink-2 hover:bg-surface-2'}`}>
              Everything
            </button>
            {(data?.categories || []).map(c => (
              <button key={c.name} onClick={() => set('category', c.name)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${
                  category === c.name ? 'bg-ink text-surface' : 'border border-rule text-ink-2 hover:bg-surface-2'}`}>
                {c.name} <span className="text-faint">{c.posts}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12">
        {loading && !data && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-72 animate-pulse rounded-2xl bg-surface-2" />)}
          </div>
        )}

        {!loading && !posts.length && (
          <div className="rounded-2xl border border-dashed border-rule-2 bg-surface p-16 text-center">
            <p className="font-serif text-[20px] text-ink">Nothing here yet.</p>
            <p className="mt-1.5 text-[14px] text-muted">The first post is being written.</p>
            <Link to="/digital-library" className="mt-4 inline-block text-[14px] font-semibold text-accent hover:underline">
              Browse the library instead
            </Link>
          </div>
        )}

        {lead && page === 1 && !q && !category && (
          <Link to={`/blog/${lead.slug}`}
            className="group mb-10 grid grid-cols-1 overflow-hidden rounded-2xl border border-rule bg-surface lg:grid-cols-2">
            <Cover post={lead} className="h-64 w-full lg:h-full" />
            <div className="flex flex-col justify-center p-7">
              <p className={LABEL}>{lead.category || 'Latest'}</p>
              <h2 className="mt-3 font-serif text-[28px] font-medium leading-tight text-ink group-hover:text-accent">
                {lead.title}
              </h2>
              {lead.excerpt && <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-muted">{lead.excerpt}</p>}
              <p className="mt-5 font-mono text-[11.5px] text-faint">
                {lead.authorName} · {day(lead.publishedAt)} · {lead.readMinutes} min read
              </p>
            </div>
          </Link>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(page === 1 && !q && !category ? rest : posts).map(p => (
            <Link key={p.slug} to={`/blog/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-rule bg-surface transition-shadow hover:shadow-lg">
              <Cover post={p} className="h-44 w-full" />
              <div className="flex flex-1 flex-col p-5">
                <p className={LABEL}>{p.category || 'Post'}</p>
                <h3 className="mt-2 line-clamp-2 font-serif text-[19px] font-medium leading-tight text-ink group-hover:text-accent">
                  {p.title}
                </h3>
                {p.excerpt && <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{p.excerpt}</p>}
                <p className="mt-auto pt-4 font-mono text-[11px] text-faint">
                  {day(p.publishedAt)} · {p.readMinutes} min
                </p>
              </div>
            </Link>
          ))}
        </div>

        {data && data.total > 9 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <button disabled={page <= 1} onClick={() => set('page', String(page - 1))}
              className="rounded-xl border border-rule px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40">
              Previous
            </button>
            <span className="font-mono text-[12px] text-faint">Page {page} of {Math.ceil(data.total / 9)}</span>
            <button disabled={page >= Math.ceil(data.total / 9)} onClick={() => set('page', String(page + 1))}
              className="rounded-xl border border-rule px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export function BlogPost() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetch(`/api/blog/posts/${slug}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="font-serif text-[26px] text-ink">That post is not here</h1>
        <p className="mt-2 text-[14.5px] text-muted">It may have been taken down, or the link may be wrong.</p>
        <Link to="/blog" className="mt-5 inline-block text-[14px] font-semibold text-accent hover:underline">All posts</Link>
      </div>
    );
  }
  if (!data) return <div className="mx-auto max-w-3xl px-5 py-16"><div className="h-96 animate-pulse rounded-2xl bg-surface-2" /></div>;

  const p = data.post;
  const related: Card[] = data.related || [];
  const fromLibrary: any[] = data.fromLibrary || [];
  const url = `https://journalslibrary.com/blog/${p.slug}`;

  return (
    <div className="bg-ground">
      <Helmet>
        <title>{`${p.seoTitle || p.title} — STM Digital Library`}</title>
        <meta name="description" content={p.seoDescription || p.excerpt || ''} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={p.seoTitle || p.title} />
        <meta property="og:description" content={p.seoDescription || p.excerpt || ''} />
        {p.ogImage && <meta property="og:image" content={p.ogImage} />}
        <meta property="og:url" content={url} />
        <meta name="twitter:card" content={p.ogImage ? 'summary_large_image' : 'summary'} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org', '@type': 'BlogPosting',
          headline: p.title, description: p.seoDescription || p.excerpt || undefined,
          image: p.ogImage || undefined, datePublished: p.publishedAt, dateModified: p.updatedAt,
          author: { '@type': 'Person', name: p.authorName || 'STM Digital Library' },
          publisher: { '@type': 'Organization', name: 'STM Digital Library' },
          mainEntityOfPage: url,
        })}</script>
      </Helmet>

      <article className="mx-auto max-w-3xl px-5 py-12">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
          <ArrowLeft size={15} /> All posts
        </Link>

        <p className={`${LABEL} mt-8`}>{p.category || 'Post'}</p>
        <h1 className="mt-3 font-serif text-[34px] font-medium leading-[1.15] text-ink sm:text-[42px]">{p.title}</h1>
        {p.excerpt && <p className="mt-4 text-[17px] leading-relaxed text-muted">{p.excerpt}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-4 border-y border-rule py-3 font-mono text-[11.5px] text-faint">
          <span>{p.authorName || 'STM Digital Library'}</span>
          <span className="flex items-center gap-1.5"><Calendar size={12} /> {day(p.publishedAt)}</span>
          <span className="flex items-center gap-1.5"><Clock size={12} /> {p.readMinutes} min read</span>
        </div>

        {p.coverUrl && (
          <img src={p.coverUrl} alt="" className="mt-8 w-full rounded-2xl border border-rule object-cover" />
        )}

        {/* The body is cleaned on the server before it is ever stored. */}
        <div className="prose-post mt-8" dangerouslySetInnerHTML={{ __html: p.body }} />

        {/* What the library holds on this subject */}
        {fromLibrary.length > 0 && (
          <section className="mt-12 rounded-2xl border border-rule bg-surface p-6">
            <p className={LABEL}>In the library on this subject</p>
            <ul className="mt-4 divide-y divide-rule">
              {fromLibrary.map((a: any) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <Link to={`/digital-library?kind=articles&q=${encodeURIComponent(a.title)}`} className="group block">
                    <p className="text-[14px] leading-snug text-ink-2 group-hover:text-accent">{a.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-faint">
                      {[a.journalName, a.domain, a.year].filter(Boolean).join(' · ')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/digital-library"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-accent-hover">
              <BookOpen size={15} /> Browse the library
            </Link>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-12">
            <p className={LABEL}>More like this</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {related.map(r => (
                <Link key={r.slug} to={`/blog/${r.slug}`}
                  className="group rounded-2xl border border-rule bg-surface p-4 hover:shadow-md">
                  <p className="line-clamp-3 font-serif text-[15px] leading-snug text-ink group-hover:text-accent">{r.title}</p>
                  <p className="mt-2 font-mono text-[10.5px] text-faint">{day(r.publishedAt)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rule bg-surface p-6">
          <div>
            <p className="font-serif text-[20px] text-ink">Read the research itself</p>
            <p className="mt-1 text-[13.5px] text-muted">Free to register. The whole library, in half-hour sessions.</p>
          </div>
          <Link to="/signup?ref=blog"
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-[14px] font-semibold text-surface hover:opacity-90">
            Register Now <ArrowRight size={16} />
          </Link>
        </section>
      </article>
    </div>
  );
}
