import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2, BookOpen, Clock, PlayCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MyFavorites() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/user/favorites', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data);
      } else {
        toast.error("Failed to load wish list");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  const removeFavorite = async (contentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/user/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ contentId })
      });
      const data = await res.json();
      if (data.success && !data.favorited) {
        setFavorites(prev => prev.filter(f => f.id !== contentId));
        toast.success("Removed from Wish List");
      }
    } catch (err) {
      toast.error("Failed to remove");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Heart className="text-red-500" fill="currentColor" /> My Wish List
        </h1>
        <p className="text-slate-500 mt-1">Saved articles, books, and videos you love.</p>
      </div>

      {favorites.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-100 flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-red-50 text-red-400 rounded-full flex items-center justify-center mb-4">
            <Heart size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Your wish list is empty</h3>
          <p className="text-slate-500 max-w-sm mb-6">
            You haven't added any content to your wish list yet. While reading or watching, click the heart icon to save items here.
          </p>
          <button
            onClick={() => navigate('/dashboard/content')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
          >
            Explore Content
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((item) => {
            const isVideo = item.contentType?.toLowerCase().includes('video');
            return (
              <div 
                key={item.id} 
                onClick={() => navigate(`/dashboard/viewer/${item.id}`)}
                className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-200 cursor-pointer transition-all duration-300 flex flex-col"
              >
                <div className="h-40 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    isVideo ? <PlayCircle size={48} className="text-slate-300" /> : <BookOpen size={48} className="text-slate-300" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <button
                    onClick={(e) => removeFavorite(item.id, e)}
                    className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-sm text-red-500 hover:bg-red-50 hover:scale-110 transition-all"
                    title="Remove from Wish List"
                  >
                    <Heart size={16} fill="currentColor" />
                  </button>
                  
                  <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {item.contentType}
                  </div>
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-slate-900 line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
                    {item.description || item.authors}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs font-medium pt-4 border-t border-slate-100">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md truncate max-w-[140px]">
                      {item.domain}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400" title={`Added on ${new Date(item.favoritedAt).toLocaleDateString()}`}>
                      <Clock size={12} />
                      {new Date(item.favoritedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
