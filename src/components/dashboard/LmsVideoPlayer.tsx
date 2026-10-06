import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle, Info, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Spinner, friendlyError } from '../ui';
import { extractYoutubeId } from './VideoLibrary';

export function LmsVideoPlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/videos/${id}/details`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed or unauthorized');
        return res.json();
      })
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(err => {
        toast.error(friendlyError(err, 'Failed to open video'));
        navigate('/dashboard/videos');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="card flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading secure session" />
      </div>
    );
  }

  if (!data || !data.video) return null;

  const { video, related } = data;
  const ytId = extractYoutubeId(video.fileUrl);

  return (
    <div className="flex flex-col gap-6 pb-12 lg:flex-row">
      {/* Left Column: Player & Meta */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Navigation / Header */}
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            title="Go back"
            className="btn btn-outline btn-icon btn-sm rounded-full"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          {video.domain && <Badge tone="accent">{video.domain}</Badge>}
        </div>

        {/* Video Player Container */}
        <div className="w-full overflow-hidden rounded-xl border border-rule bg-black">
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            {ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&controls=1&iv_load_policy=3`}
                className="absolute top-0 left-0 w-full h-full"
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-on-dark-2">
                <PlayCircle size={48} className="opacity-50" aria-hidden="true" />
                <p>Video format not supported for streaming.</p>
              </div>
            )}
          </div>
        </div>

        {/* Video Meta */}
        <div className="card card-pad">
          <h1 className="type-page-title mb-4 text-ink">
            {video.title}
          </h1>
          
          <div className="mb-6 flex items-center gap-3 border-b border-rule pb-6">
            <Badge tone="accent">
              <ShieldCheck size={14} aria-hidden="true" />
              Secure Session active
            </Badge>
          </div>

          <div className="max-w-none">
            <h2 className="mb-2 flex items-center gap-2 type-card-title text-ink">
              <Info size={18} className="text-accent" aria-hidden="true" />
              About this video
            </h2>
            <p className="whitespace-pre-wrap leading-relaxed text-ink-2">
              {video.description || "No description provided for this video."}
            </p>
          </div>
        </div>
      </div>

      {/* Right Column: Related Videos Sidebar */}
      <div className="w-full lg:w-96 shrink-0 flex flex-col gap-4">
        <h2 className="px-1 type-card-title text-ink">Related Videos</h2>
        
        <div className="space-y-2">
          {related.length === 0 ? (
            <div className="rounded-xl border border-rule bg-surface-2 p-8 text-center text-sm text-muted">
              No related videos found in {video.domain}.
            </div>
          ) : (
            related.map((rv: any) => {
              const rvYtId = extractYoutubeId(rv.fileUrl);
              const rvThumb = rvYtId ? `https://img.youtube.com/vi/${rvYtId}/mqdefault.jpg` : rv.thumbnailUrl;

              return (
                <button 
                  type="button"
                  key={rv.id}
                  onClick={() => navigate(`/dashboard/videos/player/${rv.id}`)}
                  className="group flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors duration-150 hover:bg-surface"
                >
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-36">
                    {rvThumb ? (
                      <img src={rvThumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-surface-2 text-faint" aria-hidden="true">
                        <PlayCircle size={24} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pr-2">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-ink transition-colors duration-150 group-hover:text-accent">
                      {rv.title}
                    </h3>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
