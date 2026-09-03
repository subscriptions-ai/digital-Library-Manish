import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Search, FolderOpen, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function extractYoutubeId(urlOrId: string) {
  if (!urlOrId) return "";
  const match = urlOrId.match(/(?:v=|be\/|embed\/)([^&?\n]+)/);
  return match ? match[1] : urlOrId;
}

export function VideoLibrary() {
  const navigate = useNavigate();
  const [groupedVideos, setGroupedVideos] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/videos/grouped', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) toast.error(data.error);
        else setGroupedVideos(data);
      })
      .catch(() => toast.error('Failed to load video library'))
      .finally(() => setLoading(false));
  }, []);

  const getFilteredGroups = () => {
    if (!search.trim()) return groupedVideos;
    const q = search.toLowerCase();
    const filtered: Record<string, any[]> = {};
    Object.entries(groupedVideos).forEach(([domain, videos]) => {
      const matched = videos.filter(v => 
        v.title.toLowerCase().includes(q) || 
        v.description?.toLowerCase().includes(q)
      );
      if (matched.length > 0) filtered[domain] = matched;
    });
    return filtered;
  };

  const filtered = getFilteredGroups();
  const hasVideos = Object.keys(filtered).length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rule border-t-accent rounded-full animate-spin" />
          <p>Loading Video Library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">Video Library</h1>
          <p className="text-muted mt-1">Explore interactive educational videos across domains.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            placeholder="Search videos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-rule rounded-md focus:ring-2 focus:border-accent outline-none transition-shadow text-sm font-medium"
          />
        </div>
      </div>

      {/* Main Content */}
      {!hasVideos ? (
        <div className="bg-surface border border-rule rounded-md p-16 text-center shadow-sm">
          <FolderOpen size={48} className="mx-auto text-faint mb-4" />
          <h3 className="text-lg font-bold text-ink">No videos found</h3>
          <p className="text-muted mt-1">Try adjusting your search criteria.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(filtered).map(([domain, videos]) => (
            <div key={domain} className="space-y-5">
              {/* Domain Header */}
              <div className="flex items-center gap-3 border-b border-rule pb-2">
                <div className="h-8 w-1 bg-accent rounded-full" />
                <h2 className="text-xl font-bold text-ink">{domain}</h2>
                <span className="bg-surface-2 text-ink-2 text-xs font-bold px-2.5 py-1 rounded-lg">
                  {videos.length} Video{videos.length !== 1 && 's'}
                </span>
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {videos.map(video => {
                  const ytId = extractYoutubeId(video.fileUrl);
                  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : video.thumbnailUrl;

                  return (
                    <div 
                      key={video.id}
                      onClick={() => navigate(`/dashboard/videos/player/${video.id}`)}
                      className="group bg-surface rounded-md border border-rule overflow-hidden cursor-pointer hover:border-accent hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col"
                    >
                      {/* Thumbnail Container */}
                      <div className="relative aspect-video bg-surface-2 overflow-hidden">
                        {thumb ? (
                          <img src={thumb} alt={video.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-faint">
                            <Play size={40} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-ink/20 group-hover:bg-transparent transition-colors" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-accent/90 text-white p-4 rounded-full backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-transform">
                            <Play size={24} className="ml-1" />
                          </div>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4 flex-1 flex flex-col">
                        <h3 className="font-bold text-ink leading-snug line-clamp-2 mb-1 group-hover:text-accent transition-colors">
                          {video.title}
                        </h3>
                        {video.description && (
                          <p className="text-xs text-muted line-clamp-2 mt-auto">
                            {video.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
