import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle, Info, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
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
        toast.error(err.message || 'Failed to open video');
        navigate('/dashboard/videos');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-slate-950 text-white rounded-3xl m-4">
        <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
        <h2 className="text-xl font-bold">Loading secure session...</h2>
      </div>
    );
  }

  if (!data || !data.video) return null;

  const { video, related } = data;
  const ytId = extractYoutubeId(video.fileUrl);

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-12 -mt-4">
      {/* Left Column: Player & Meta */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Navigation / Header */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-200 bg-slate-100 text-slate-600 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-md">
              {video.domain}
            </span>
          </div>
        </div>

        {/* Video Player Container */}
        <div className="w-full bg-black rounded-[24px] overflow-hidden shadow-2xl shadow-indigo-900/10 border border-slate-200">
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            {ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&controls=0&disablekb=1&iv_load_policy=3`}
                className="absolute top-0 left-0 w-full h-full"
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-500 flex-col gap-2">
                <PlayCircle size={48} className="opacity-50" />
                <p>Video format not supported for streaming.</p>
              </div>
            )}
          </div>
        </div>

        {/* Video Meta */}
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight mb-4">
            {video.title}
          </h1>
          
          <div className="flex items-center gap-3 border-b border-slate-100 pb-6 mb-6 text-sm text-slate-500 font-medium">
            <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
              <ShieldCheck size={16} />
              <span>Secure Session active</span>
            </div>
          </div>

          <div className="prose prose-slate max-w-none">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-2">
              <Info size={20} className="text-indigo-500" />
              About this video
            </h3>
            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
              {video.description || "No description provided for this video."}
            </p>
          </div>
        </div>
      </div>

      {/* Right Column: Related Videos Sidebar */}
      <div className="w-full lg:w-96 shrink-0 flex flex-col gap-4">
        <h3 className="text-lg font-bold text-slate-900 px-1 pt-2">Related Videos</h3>
        
        <div className="space-y-3">
          {related.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-sm">
              No related videos found in {video.domain}.
            </div>
          ) : (
            related.map((rv: any) => {
              const rvYtId = extractYoutubeId(rv.fileUrl);
              const rvThumb = rvYtId ? `https://img.youtube.com/vi/${rvYtId}/mqdefault.jpg` : rv.thumbnailUrl;

              return (
                <div 
                  key={rv.id}
                  onClick={() => navigate(`/dashboard/videos/player/${rv.id}`)}
                  className="flex gap-3 p-2 hover:bg-white rounded-xl transition-colors cursor-pointer group items-center"
                >
                  <div className="relative w-36 h-20 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                    {rvThumb ? (
                      <img src={rvThumb} alt={rv.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400">
                        <PlayCircle size={24} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-slate-900/10 group-hover:bg-slate-900/0 transition-colors" />
                    <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 rounded-[4px]">
                      <PlayCircle size={10} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <h4 className="text-sm font-bold text-slate-800 leading-tight line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {rv.title}
                    </h4>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
