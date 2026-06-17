import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquareHeart, Star, Calendar, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function MyFeedbacksPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/feedbacks', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setHistory(await res.json());
      } else {
        toast.error('Failed to load your feedbacks');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquareHeart className="text-indigo-600" />
            My Feedbacks
          </h1>
          <p className="text-sm text-slate-500 mt-1">A history of all the feedback and ratings you have submitted.</p>
        </div>
        <button 
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-sm font-bold disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm animate-pulse h-40" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <MessageSquareHeart size={64} className="mx-auto text-slate-200 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No feedbacks yet</h3>
          <p className="text-slate-500 text-sm mt-1">You haven't submitted any feedback so far. Use the floating button to share your thoughts!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {history.map((h, i) => (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star 
                      key={star} 
                      size={18} 
                      className={star <= h.rating ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-200"} 
                    />
                  ))}
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(h.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 flex-1 relative">
                {h.comment ? (
                  <p className="text-slate-700 text-sm leading-relaxed italic">"{h.comment}"</p>
                ) : (
                  <p className="text-slate-400 text-sm italic">No written comment.</p>
                )}
                <div className="absolute top-0 right-4 -translate-y-1/2">
                  <span className="text-[10px] font-bold px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg shadow-sm border border-indigo-200">
                    {h.type}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
