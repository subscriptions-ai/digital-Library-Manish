import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Book, User, Calendar, Tag, FileText, Lock } from "lucide-react";

export function PublicContentPreview() {
  const { id } = useParams();
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/public/content/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setContent(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="p-24 text-center">Loading preview...</div>;
  if (!content || content.error) return <div className="p-24 text-center">Content not found.</div>;

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
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <Helmet>
        <title>{content.title} | STM Digital Library</title>
        <meta name="description" content={content.description || `Explore ${content.title} on STM Digital Library.`} />
        <meta name="author" content={content.author || "Unknown"} />
        <script type="application/ld+json">
          {JSON.stringify(contentSchema)}
        </script>
      </Helmet>

      <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <div className="p-8 md:p-12">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="md:w-1/3 shrink-0">
              {content.coverImage ? (
                <img src={content.coverImage} alt={content.title} className="w-full h-auto rounded-xl shadow-lg border border-slate-200" />
              ) : (
                <div className="w-full aspect-[3/4] bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center">
                  <Book className="w-16 h-16 text-slate-300" />
                </div>
              )}
            </div>
            
            <div className="md:w-2/3 flex flex-col justify-center">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider mb-4 w-fit">
                {content.contentType}
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 leading-tight">{content.title}</h1>
              
              <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-6">
                {content.author && (
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <User size={16} className="text-slate-400" />
                    <span className="font-medium">{content.author}</span>
                  </div>
                )}
                {content.publishedYear && (
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <Calendar size={16} className="text-slate-400" />
                    <span className="font-medium">{content.publishedYear}</span>
                  </div>
                )}
                {content.publisher && (
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <Tag size={16} className="text-slate-400" />
                    <span className="font-medium">{content.publisher}</span>
                  </div>
                )}
              </div>

              <div className="prose prose-slate max-w-none text-slate-600 mb-8">
                {content.description ? (
                  <p className="leading-relaxed">{content.description}</p>
                ) : (
                  <p className="italic text-slate-400">No description available for this content.</p>
                )}
              </div>

              <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
                <div className="flex items-center gap-3 text-blue-900">
                  <Lock className="w-8 h-8 text-blue-500" />
                  <div>
                    <h3 className="font-bold text-sm">Full Content is Protected</h3>
                    <p className="text-xs text-blue-700">Login or request access to read the complete document.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Link to="/login" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-blue-500/30 whitespace-nowrap">
                    Login
                  </Link>
                  <Link to="/contact" className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-900 rounded-xl font-bold text-sm transition-colors border border-slate-200 whitespace-nowrap">
                    Request Access
                  </Link>
                </div>
              </div>

              <p className="mt-6 text-center text-[11px] text-slate-400">
                Rights holder?{" "}
                <Link to="/content-removal" className="font-semibold text-slate-500 underline hover:text-slate-700">
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
