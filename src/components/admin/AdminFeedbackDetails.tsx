import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Calendar, ShieldCheck, Box, Tag, Star, Activity, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export function AdminFeedbackDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/admin/feedbacks/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) throw new Error('Failed to fetch');
        setFeedback(await res.json());
      } catch (err) {
        toast.error('Error fetching feedback details');
        navigate('/admin/feedbacks');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!feedback) return null;
  const user = feedback.user;

  return (
    <div className="space-y-6 max-w-4xl">
      <button 
        onClick={() => navigate('/admin/feedbacks')}
        className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-semibold text-sm"
      >
        <ArrowLeft size={16} /> Back to Feedbacks
      </button>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Col: Feedback Info */}
        <div className="flex-1 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800">Feedback Submission</h2>
              <span className="text-xs font-bold px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                {feedback.type}
              </span>
            </div>

            <div className="flex items-center gap-2 mb-6 bg-slate-50 p-4 rounded-2xl">
              <div className="flex items-center">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star 
                    key={star} 
                    size={24} 
                    className={star <= feedback.rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"} 
                  />
                ))}
              </div>
              <span className="ml-auto text-xs text-slate-500 font-bold flex items-center gap-1.5">
                <Calendar size={14} />
                {new Date(feedback.createdAt).toLocaleString()}
              </span>
            </div>

            <div className="bg-indigo-50/50 rounded-2xl p-5 border border-indigo-100 relative">
              <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Comment</h3>
              {feedback.comment ? (
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{feedback.comment}</p>
              ) : (
                <p className="text-slate-400 italic">No comment provided.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: User Context */}
        <div className="w-full md:w-[350px] space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-5 flex items-center gap-2">
              <User size={16} className="text-indigo-500" /> User Profile
            </h2>
            
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1">Name</div>
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  {user?.displayName || 'Unknown'}
                  {user?.isDemoAccount && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200">DEMO</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1">Email</div>
                <div className="text-sm text-slate-600 flex items-center gap-1.5">
                  <Mail size={14} className="text-slate-400" /> {user?.email || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1">Role & Organization</div>
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-indigo-600">{user?.role || 'User'}</span>
                  {user?.organization ? ` at ${user.organization}` : ''}
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1"><Calendar size={12} /> Joined: {new Date(user?.createdAt).toLocaleDateString()}</span>
                <span className="flex items-center gap-1"><Clock size={12} /> Active: {new Date(user?.lastLogin || user?.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-5 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500" /> Subscriptions
            </h2>

            {!user?.subscriptions || user.subscriptions.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-4">No active subscriptions</p>
            ) : (
              <div className="space-y-3">
                {user.subscriptions.map((sub: any) => {
                  const domains = Array.isArray(sub.domains) ? sub.domains : (typeof sub.domains === 'string' ? JSON.parse(sub.domains || '[]') : []);
                  return (
                    <div key={sub.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-700 flex items-center gap-1.5">
                          <Box size={14} className="text-indigo-400" /> {sub.planName}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          sub.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {sub.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mb-2">
                        {new Date(sub.startDate).toLocaleDateString()} - {new Date(sub.endDate).toLocaleDateString()}
                      </div>
                      {domains.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {domains.map((d: string, i: number) => (
                            <span key={i} className="text-[10px] bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                              <Tag size={10} className="text-slate-400" /> {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
