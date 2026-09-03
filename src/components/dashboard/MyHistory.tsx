import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Loader2, BookOpen, PlayCircle, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MyHistory() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/user/history', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      } else {
        toast.error("Failed to load history");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <Clock className="text-accent" /> Reading History
        </h1>
        <p className="text-muted mt-1">Recently viewed articles, books, and videos.</p>
      </div>

      {history.length === 0 ? (
        <div className="bg-surface rounded-md p-12 text-center shadow-sm border border-rule flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-accent-soft text-accent rounded-full flex items-center justify-center mb-4">
            <Clock size={28} />
          </div>
          <h3 className="text-lg font-bold text-ink mb-2">No history found</h3>
          <p className="text-muted max-w-sm mb-6">
            You haven't read or watched any content yet. Start exploring your library to see your history here.
          </p>
          <button
            onClick={() => navigate('/dashboard/library')}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-md font-semibold transition-colors"
          >
            Explore Content
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {history.map((activity) => {
            const item = activity.content;
            if (!item) return null;
            const isVideo = item.contentType?.toLowerCase().includes('video');
            return (
              <div 
                key={activity.id} 
                onClick={() => {
                  if (isVideo) navigate(`/dashboard/videos/player/${item.id}`);
                  else navigate(`/dashboard/viewer/${item.id}`);
                }}
                className="group bg-surface rounded-md border border-rule overflow-hidden shadow-sm hover:shadow-xl hover:border-accent cursor-pointer transition-all duration-300 flex flex-col"
              >
                <div className="h-40 bg-surface-2 relative overflow-hidden flex items-center justify-center">
                  {isVideo ? <PlayCircle size={48} className="text-faint" /> : <BookOpen size={48} className="text-faint" />}
                  
                  
                  <div className="absolute bottom-3 left-3 bg-surface/90 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-bold text-ink-2 uppercase tracking-wider">
                    {item.contentType}
                  </div>
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-ink line-clamp-2 mb-2 group-hover:text-accent transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted line-clamp-2 mb-4 flex-1">
                    {item.authors || 'Unknown Author'}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs font-medium pt-4 border-t border-rule">
                    <span className="px-2 py-1 bg-surface-2 text-ink-2 rounded-md truncate max-w-[140px]">
                      {item.domain || 'General'}
                    </span>
                    <span className="flex items-center gap-1 text-faint" title={`Viewed on ${new Date(activity.accessedAt).toLocaleDateString()}`}>
                      <Clock size={12} />
                      {new Date(activity.accessedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
