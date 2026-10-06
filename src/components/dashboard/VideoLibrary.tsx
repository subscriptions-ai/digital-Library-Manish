import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Search, FolderOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, EmptyState, PageHeader, Skeleton, friendlyError } from '../ui';

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
        if (data.error) toast.error(friendlyError(data.error, 'Failed to load video library'));
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
      <div className="space-y-6" role="status" aria-label="Loading Video Library">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card overflow-hidden" aria-hidden="true">
              <Skeleton className="aspect-video h-auto rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <PageHeader
        className="mb-0"
        title="Video Library"
        description="Explore interactive educational videos across domains."
        actions={
          <div className="relative w-full md:w-80">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search videos"
              placeholder="Search videos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
        }
      />

      {/* Main Content */}
      {!hasVideos ? (
        <div className="card">
          {search.trim() ? (
            <EmptyState
              icon={Search}
              title="No videos found"
              description="Try adjusting your search criteria."
              action={<Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
            />
          ) : (
            <EmptyState icon={FolderOpen} title="No videos available yet" description="Videos open to you will appear here." />
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(filtered).map(([domain, videos]) => (
            <section key={domain} className="space-y-4" aria-label={domain}>
              {/* Domain Header */}
              <div className="flex flex-wrap items-center gap-3 border-b border-rule pb-2">
                <h2 className="type-section text-ink">{domain}</h2>
                <Badge tone="neutral">
                  {videos.length} Video{videos.length !== 1 && 's'}
                </Badge>
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {videos.map(video => {
                  const ytId = extractYoutubeId(video.fileUrl);
                  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : video.thumbnailUrl;

                  return (
                    <button 
                      type="button"
                      key={video.id}
                      onClick={() => navigate(`/dashboard/videos/player/${video.id}`)}
                      className="card card-interactive group flex flex-col overflow-hidden text-left"
                    >
                      {/* Thumbnail Container */}
                      <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-faint" aria-hidden="true">
                            <Play size={40} />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-ink/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true">
                          <span className="rounded-full bg-accent p-3 text-accent-on">
                            <Play size={20} className="ml-0.5" />
                          </span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="mb-1 line-clamp-2 font-semibold leading-snug text-ink transition-colors duration-150 group-hover:text-accent">
                          {video.title}
                        </h3>
                        {video.description && (
                          <p className="mt-auto line-clamp-2 text-xs text-muted">
                            {video.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
