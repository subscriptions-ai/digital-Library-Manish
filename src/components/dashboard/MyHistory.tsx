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
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Clock className="text-blue-600" /> Reading History
        </h1>
        <p className="text-slate-500 mt-1">Recently viewed articles, books, and videos.</p>
      </div>

      {history.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-100 flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-400 rounded-full flex items-center justify-center mb-4">
            <Clock size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">No history found</h3>
          <p className="text-slate-500 max-w-sm mb-6">
            You haven't read or watched any content yet. Start exploring your library to see your history here.
          </p>
          <button
            onClick={() => navigate('/dashboard/library')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
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
                className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-200 cursor-pointer transition-all duration-300 flex flex-col"
              >
                <div className="h-40 bg-slate-50 relative overflow-hidden flex items-center justify-center">
                  {isVideo ? <PlayCircle size={48} className="text-slate-300" /> : <BookOpen size={48} className="text-slate-300" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {item.contentType}
                  </div>
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-slate-900 line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
                    {item.authors || 'Unknown Author'}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs font-medium pt-4 border-t border-slate-100">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md truncate max-w-[140px]">
                      {item.domain || 'General'}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400" title={`Viewed on ${new Date(activity.accessedAt).toLocaleDateString()}`}>
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
