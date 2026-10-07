import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { PostImage } from './GeneratedCover';
import { ArrowLeft, ArrowRight, BookOpen, Calendar, Clock, FileQuestion, Newspaper, Search } from 'lucide-react';
import { Button, EmptyState, Skeleton, buttonClass } from '../ui';

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

const LABEL = 'text-xs font-semibold uppercase tracking-[0.14em] text-muted';

function Cover({ post, className, loading = 'lazy' }: { post: Card; className: string; loading?: 'lazy' | 'eager' }) {
  return <PostImage src={post.coverUrl} seed={post.slug} loading={loading} className={className} />;
}

export function BlogList() {
  const [sp, setSp] = useSearchParams();
  const category = sp.get('category') || '';
  const [search, setSearch] = useState(sp.get('q') || '');
  const [q, setQ] = useState(sp.get('q') || '');
  const [data, setData] = useState<{ posts: Card[]; total: number; categories: { name: string; posts: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const page = Math.max(1, parseInt(sp.get('page') || '1') || 1);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    setData(null);
    const p = new URLSearchParams({ page: String(page), limit: '9' });
    if (category) p.set('category', category);
    if (q) p.set('q', q);
    fetch(`/api/blog/posts?${p}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!Array.isArray(d?.posts)) throw new Error("Invalid posts"); setData(d); })
      .catch(() => setFailed(true))
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

      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <p className="on-dark-fill on-dark-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
            The blog
          </p>
          <h1 className="on-dark mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            Writing from the library.
          </h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">
            What open research makes possible, how to get more out of the library, and what has
            changed in the collection.
          </p>
        </div>
      </section>

      <div className="border-b border-rule bg-surface">
        <div className="container-public flex flex-wrap items-center gap-2 py-4">
          <div className="relative w-full sm:w-auto sm:min-w-[240px] sm:max-w-sm sm:flex-1">
            <label htmlFor="blog-search" className="sr-only">Search the writing</label>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input id="blog-search" type="search" value={search} onChange={e => { setSearch(e.target.value); set('q', e.target.value.trim()); }}
              placeholder="Search the writing…"
              className="input pl-9" />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            <button type="button" onClick={() => set('category', '')} aria-pressed={!category}
              className={`btn btn-sm rounded-full ${!category ? 'btn-brand' : 'btn-outline'}`}>
              Everything
            </button>
            {(data?.categories || []).map(c => (
              <button key={c.name} type="button" onClick={() => set('category', c.name)} aria-pressed={category === c.name}
                className={`btn btn-sm rounded-full ${category === c.name ? 'btn-brand' : 'btn-outline'}`}>
                {c.name} <span className={category === c.name ? 'opacity-70' : 'text-muted'}>{c.posts}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="container-public py-12">
        {loading && !data && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading posts">
            {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-72 rounded-xl" />)}
          </div>
        )}

        {!loading && failed && <div className="card"><EmptyState icon={Newspaper} title="Posts are temporarily unavailable" description="Please try again later." /></div>}
        {!loading && !failed && !posts.length && (
          <div className="card">
            {q || category ? (
              <EmptyState
                icon={Search}
                title="No posts match these filters"
                description="Try a different word, or look through every category."
                action={
                  <Button variant="outline" onClick={() => {
                    setSearch('');
                    const next = new URLSearchParams(sp);
                    ['q', 'category', 'page'].forEach(k => next.delete(k));
                    setSp(next);
                  }}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Newspaper}
                title="Nothing here yet."
                description="Published posts will appear here when available."
                action={
                  <Link to="/digital-library" className={buttonClass('brand')}>
                    Browse the library instead
                  </Link>
                }
              />
            )}
          </div>
        )}

        {lead && page === 1 && !q && !category && (
          <Link to={`/blog/${lead.slug}`}
            className="card card-interactive group mb-10 grid grid-cols-1 overflow-hidden lg:grid-cols-2">
            <Cover post={lead} loading="eager" className="h-64 w-full lg:h-full" />
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <p className={LABEL}>{lead.category || 'Latest'}</p>
              <h2 className="mt-3 text-2xl font-bold leading-tight text-ink transition-colors duration-150 group-hover:text-accent sm:text-[28px]">
                {lead.title}
              </h2>
              {lead.excerpt && <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-muted">{lead.excerpt}</p>}
              <p className="mt-5 text-xs text-muted">
                {[lead.authorName, day(lead.publishedAt), `${lead.readMinutes} min read`].filter(Boolean).join(' · ')}
              </p>
            </div>
          </Link>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(page === 1 && !q && !category ? rest : posts).map(p => (
            <Link key={p.slug} to={`/blog/${p.slug}`}
              className="card card-interactive group flex flex-col overflow-hidden">
              <Cover post={p} className="h-44 w-full" />
              <div className="flex flex-1 flex-col p-5">
                <p className={LABEL}>{p.category || 'Post'}</p>
                <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-tight text-ink transition-colors duration-150 group-hover:text-accent">
                  {p.title}
                </h3>
                {p.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{p.excerpt}</p>}
                <p className="mt-auto pt-4 text-xs text-muted">
                  {day(p.publishedAt)} · {p.readMinutes} min
                </p>
              </div>
            </Link>
          ))}
        </div>

        {data && data.total > 9 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
              <ArrowLeft size={14} aria-hidden="true" /> Previous
            </Button>
            <span className="text-sm text-muted tnum">Page {page} of {Math.ceil(data.total / 9)}</span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 9)} onClick={() => set('page', String(page + 1))}>
              Next <ArrowRight size={14} aria-hidden="true" />
            </Button>
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
    setData(null);
    setMissing(false);
    fetch(`/api/blog/posts/${slug}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { if (!d?.post?.title) throw new Error("Invalid post"); setData(d); })
      .catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return (
      <div className="container-public max-w-xl py-16 sm:py-24">
        <Helmet><meta name="robots" content="noindex, follow" /></Helmet>
        <div className="card">
          <EmptyState
            icon={FileQuestion}
            title={<span role="heading" aria-level={1}>This post is unavailable</span>}
            description="Please try again later or browse the published posts."
            action={<Link to="/blog" className={buttonClass('brand')}>All posts</Link>}
          />
        </div>
      </div>
    );
  }
  if (!data) return (
    <div className="container-public max-w-3xl py-12" role="status" aria-label="Loading post">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-10 w-4/5" />
      <Skeleton className="mt-3 h-5 w-3/5" />
      <Skeleton className="mt-8 aspect-[5/3] h-auto rounded-xl" />
    </div>
  );

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

      <article className="container-public max-w-3xl py-12">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
          <ArrowLeft size={16} aria-hidden="true" /> All posts
        </Link>

        <p className={`${LABEL} mt-8`}>{p.category || 'Post'}</p>
        <h1 className="mt-3 text-3xl font-bold leading-[1.15] text-ink sm:text-[40px]">{p.title}</h1>
        {p.excerpt && <p className="mt-4 text-[17px] leading-relaxed text-muted">{p.excerpt}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule py-3 text-xs text-muted">
          <span>{p.authorName || 'STM Digital Library'}</span>
          <span className="flex items-center gap-1.5"><Calendar size={12} aria-hidden="true" /> {day(p.publishedAt)}</span>
          <span className="flex items-center gap-1.5"><Clock size={12} aria-hidden="true" /> {p.readMinutes} min read</span>
        </div>

        <PostImage src={p.coverUrl} seed={p.slug} loading="eager" className="mt-8 aspect-[5/3] w-full rounded-xl border border-rule" />

        {/* The body is cleaned on the server before it is ever stored. */}
        <div className="prose-post mt-8 max-w-[72ch] break-words" dangerouslySetInnerHTML={{ __html: p.body }} />

        {/* What the library holds on this subject */}
        {fromLibrary.length > 0 && (
          <section className="card card-pad mt-12">
            <p className={LABEL}>In the library on this subject</p>
            <ul className="mt-4 divide-y divide-rule">
              {fromLibrary.map((a: any) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <Link to={`/article/${a.id}`} className="group block">
                    <p className="text-sm leading-snug text-ink-2 transition-colors duration-150 group-hover:text-accent">{a.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[a.journalName, a.domain, a.year].filter(Boolean).join(' · ')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/digital-library" className={buttonClass('brand', 'md', 'mt-5')}>
              <BookOpen size={16} aria-hidden="true" /> Browse the library
            </Link>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-12">
            <p className={LABEL}>More like this</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {related.map(r => (
                <Link key={r.slug} to={`/blog/${r.slug}`}
                  className="card card-interactive group p-4">
                  <p className="line-clamp-3 text-[15px] font-semibold leading-snug text-ink transition-colors duration-150 group-hover:text-accent">{r.title}</p>
                  <p className="mt-2 text-xs text-muted">{day(r.publishedAt)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-navy p-6">
          <div>
            <p className="on-dark text-xl font-bold">Read the research itself</p>
            <p className="on-dark-2 mt-1 text-sm">Free to register. The whole library, in half-hour sessions.</p>
          </div>
          <Link to="/signup?ref=blog" className={buttonClass('highlight')}>
            Register Now <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </article>
    </div>
  );
}
