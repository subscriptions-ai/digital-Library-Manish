import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquareHeart, Star, User, Calendar, Mail, Search, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function AdminFeedbackManager() {
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/feedbacks', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setFeedbacks(data);
    } catch (err) {
      toast.error('Error fetching feedbacks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const filteredFeedbacks = feedbacks.filter(f => 
    f.comment?.toLowerCase().includes(search.toLowerCase()) || 
    f.user?.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    f.user?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquareHeart className="text-indigo-600" />
            User Feedbacks
          </h1>
          <p className="text-sm text-slate-500 mt-1">Review feedback and ratings submitted by users from their dashboards.</p>
        </div>
        <button 
          onClick={fetchFeedbacks}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-sm font-bold"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <Search className="text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Search feedbacks by user name, email, or content..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-transparent border-none focus:outline-none text-slate-800 placeholder:text-slate-400"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm animate-pulse flex flex-col gap-4">
              <div className="h-6 bg-slate-100 rounded w-1/4" />
              <div className="h-16 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <MessageSquareHeart size={64} className="mx-auto text-slate-200 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No feedbacks found</h3>
          <p className="text-slate-500 text-sm mt-1">Users haven't submitted any feedback yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFeedbacks.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-all flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star 
                      key={star} 
                      size={18} 
                      className={star <= f.rating ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-200"} 
                    />
                  ))}
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(f.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 flex-1 mb-5 relative">
                {f.comment ? (
                  <p className="text-slate-700 text-sm leading-relaxed italic">"{f.comment}"</p>
                ) : (
                  <p className="text-slate-400 text-sm italic flex items-center gap-1">
                    <AlertCircle size={14} /> No written comment provided.
                  </p>
                )}
                <div className="absolute top-0 right-4 -translate-y-1/2">
                  <span className="text-[10px] font-bold px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg">
                    {f.type}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-sm">
                  {(f.user?.displayName || f.user?.email || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1">
                    <User size={14} className="text-slate-400 shrink-0" />
                    {f.user?.displayName || 'Unknown User'}
                  </div>
                  <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                    <Mail size={14} className="text-slate-400 shrink-0" />
                    {f.user?.email}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
