import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Book, User, Calendar, Tag, Lock, SearchX } from "lucide-react";
import { EmptyState, Skeleton, buttonClass } from "./ui";

export function PublicContentPreview() {
  const { id } = useParams();
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setContent(null);
    setFailed(false);
    setImageFailed(false);
    fetch(`/api/public/content/${encodeURIComponent(id || '')}`, { signal: controller.signal })
      .then(async res => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('Unavailable');
        const data = await res.json();
        if (!data?.id || typeof data.title !== 'string' || !data.title.trim()) throw new Error('Invalid record');
        return data;
      })
      .then(data => { if (!controller.signal.aborted) setContent(data); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  if (loading) return (
    <div className="bg-ground px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="card mx-auto max-w-4xl p-6 md:p-10" role="status" aria-label="Loading preview">
        <div className="flex flex-col gap-8 md:flex-row">
          <Skeleton className="aspect-[3/4] h-auto w-full max-w-[240px] rounded-xl md:w-1/3" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </div>
        </div>
      </div>
    </div>
  );
  if (!content || content.error) return (
    <div className="bg-ground px-4 py-8 sm:py-12">
      <Helmet><title>{failed ? "Preview unavailable" : "Content not found"} | STM Digital Library</title><meta name="robots" content="noindex, follow" /></Helmet>
      <div className="card mx-auto max-w-xl">
        <EmptyState
          icon={SearchX}
          title={failed ? "Preview temporarily unavailable" : "Content not found"}
          description={failed ? "Please try again later or search the library." : "This item may have been moved or removed from the library."}
          action={<Link to="/search" className={buttonClass('outline')}>Search the library</Link>}
        />
      </div>
    </div>
  );

  const contentSchema = {
    "@context": "https://schema.org",
    "@type": content.contentType === "Books" ? "Book" : content.contentType === "Educational Videos" ? "VideoObject" : "Article",
    "name": content.title,
    "author": {
      "@type": "Person",
      "name": content.author || "Unknown"
    },
    "datePublished": content.publishedYear ? `${content.publishedYear}` : undefined,
    "image": content.coverImage || "https://journalslibrary.com/logo.png",
    "description": content.description || `Read the full version of ${content.title} on STM Digital Library.`
  };

  return (
    <div className="bg-ground px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Helmet>
        <title>{content.title} | STM Digital Library</title>
        <meta name="description" content={content.description || `Explore ${content.title} on STM Digital Library.`} />
        <meta name="author" content={content.author || "Unknown"} />
        <script type="application/ld+json">
          {JSON.stringify(contentSchema)}
        </script>
      </Helmet>

      <div className="card mx-auto max-w-4xl overflow-hidden">
        <div className="p-5 sm:p-8 md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:gap-8">
            <div className="mx-auto w-full max-w-[240px] shrink-0 md:mx-0 md:w-1/3 md:max-w-none">
              {content.coverImage && !imageFailed ? (
                <img src={content.coverImage} alt={`Cover of ${content.title}`} onError={() => setImageFailed(true)} className="h-auto w-full rounded-xl border border-rule" />
              ) : (
                <div className="flex w-full items-center gap-3 rounded-xl border border-rule bg-surface-2 p-4">
                  <Book size={24} aria-hidden="true" className="shrink-0 text-accent" />
                  <div className="min-w-0"><p className="text-xs font-semibold uppercase text-ink">{content.contentType || "Academic resource"}</p>{content.domain && <p className="mt-1 break-words text-sm text-muted">{content.domain}</p>}</div>
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-col justify-center md:w-2/3">
              {content.contentType && (
                <span className="badge badge-accent mb-4 w-fit">{content.contentType}</span>
              )}
              <h1 className="mb-4 break-words text-2xl font-bold leading-tight text-ink sm:text-3xl md:text-4xl">{content.title}</h1>

              <div className="mb-6 flex flex-wrap gap-2 text-sm text-ink-2">
                {content.author && (
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-rule bg-surface-2 px-3 py-1.5">
                    <User size={16} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="sr-only">Authors: </span>
                    <span className="min-w-0 break-words font-medium">{content.author}</span>
                  </div>
                )}
                {content.publishedYear && (
                  <div className="flex items-center gap-2 rounded-lg border border-rule bg-surface-2 px-3 py-1.5">
                    <Calendar size={16} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="sr-only">Year: </span>
                    <span className="font-medium">{content.publishedYear}</span>
                  </div>
                )}
                {content.publisher && (
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-rule bg-surface-2 px-3 py-1.5">
                    <Tag size={16} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="sr-only">Publisher: </span>
                    <span className="min-w-0 break-words font-medium">{content.publisher}</span>
                  </div>
                )}
              </div>

              <div className="mb-8 max-w-none text-ink-2">
                {content.description ? (
                  <p className="leading-relaxed">{content.description}</p>
                ) : (
                  <p className="italic text-muted">No description available for this content.</p>
                )}
              </div>

              <div className="mt-auto flex flex-col gap-4 rounded-xl border border-rule bg-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                    <Lock size={18} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Full Content is Protected</h2>
                    <p className="text-sm text-muted">Log in, or register free to read the complete document.</p>
                  </div>
                </div>
                <div className="flex gap-2 sm:shrink-0">
                  <Link to="/login" className={buttonClass('brand', 'md', 'flex-1 whitespace-nowrap sm:flex-none')}>
                    Login
                  </Link>
                  <Link to="/signup" className={buttonClass('outline', 'md', 'flex-1 whitespace-nowrap sm:flex-none')}>
                    Register Free
                  </Link>
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-muted">
                Rights holder?{" "}
                <Link to="/content-removal" className="font-semibold text-accent underline hover:text-accent-hover">
                  Request removal of this content
                </Link>
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
