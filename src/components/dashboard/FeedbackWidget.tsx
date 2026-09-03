import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquareHeart, Star, Send, X, CheckCircle2, History, ArrowLeft, Calendar } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [viewingHistory, setViewingHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-feedback', handleOpen);
    return () => window.removeEventListener('open-feedback', handleOpen);
  }, []);

  useEffect(() => {
    if (isOpen && viewingHistory) {
      fetchHistory();
    }
  }, [isOpen, viewingHistory]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/user/feedbacks', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (e) {
      toast.error('Failed to load feedback history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error('Please select a star rating.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ rating, comment, type: 'Dashboard Feedback' })
      });

      if (!res.ok) throw new Error('Failed to submit feedback');
      
      setIsSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setTimeout(() => {
          setIsSuccess(false);
          setRating(0);
          setComment('');
        }, 300);
      }, 2500);
    } catch (err) {
      toast.error('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-accent text-white px-5 py-3.5 rounded-full shadow-2xl shadow-indigo-500/40 hover:shadow-indigo-500/60 transition-all flex items-center justify-center gap-2 hover:-translate-y-1 border border-white/10"
      >
        <MessageSquareHeart size={20} className="animate-pulse" />
        <span className="whitespace-nowrap font-bold text-sm">
          Feedback
        </span>
      </motion.button>

      {/* Feedback Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setIsOpen(false)}
              className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-surface rounded-md shadow-2xl overflow-hidden"
            >
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                {!isSuccess && !viewingHistory && (
                  <button
                    onClick={() => setViewingHistory(true)}
                    className="p-2 bg-accent-soft hover:bg-accent-soft text-accent rounded-full transition-colors tooltip-trigger"
                    title="View Past Feedbacks"
                  >
                    <History size={18} />
                  </button>
                )}
                {viewingHistory && (
                  <button
                    onClick={() => setViewingHistory(false)}
                    className="p-2 bg-surface-2 hover:bg-surface-2 text-ink-2 rounded-full transition-colors tooltip-trigger"
                    title="Back to Form"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                  className="p-2 bg-surface-2/50 hover:bg-rule text-muted rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {isSuccess ? (
                <div className="p-10 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", bounce: 0.5 }}
                    className="w-20 h-20 bg-accent-soft text-accent rounded-full flex items-center justify-center mb-6"
                  >
                    <CheckCircle2 size={40} />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-ink mb-2">Thank You!</h3>
                  <p className="text-muted">Your feedback helps us improve your digital library experience.</p>
                </div>
              ) : !viewingHistory ? (
                <div className="p-8">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-accent-soft text-accent rounded-md flex items-center justify-center mx-auto mb-4 rotate-12">
                      <MessageSquareHeart size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-ink mb-2">We value your feedback</h2>
                    <p className="text-sm text-muted">How would you rate your experience with the platform so far?</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Star Rating */}
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          disabled={isSubmitting}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                          className="p-2 transition-transform hover:scale-110 focus:outline-none"
                        >
                          <Star
                            size={36}
                            className={`transition-colors ${
                              star <= (hoverRating || rating)
                                ? 'fill-caution text-caution'
                                : 'fill-rule text-faint'
                            }`}
                          />
                        </button>
                      ))}
                    </div>

                    {/* Comment Area */}
                    <div>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        disabled={isSubmitting}
                        placeholder="Tell us what you love or what we can improve..."
                        className="w-full px-4 py-3 bg-surface-2/50 border border-rule rounded-md text-sm focus:outline-none focus:ring-2 focus:border-accent resize-none h-32"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting || rating === 0}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent text-white rounded-md font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Send size={18} /> Submit Feedback
                        </>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-accent-soft text-accent rounded-md flex items-center justify-center">
                      <History size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-ink">Your Feedbacks</h2>
                      <p className="text-xs text-muted">History of your past submissions</p>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {loadingHistory ? (
                      <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-accent border-t-indigo-600 rounded-full animate-spin" /></div>
                    ) : history.length === 0 ? (
                      <div className="text-center py-10">
                        <MessageSquareHeart size={32} className="mx-auto text-faint mb-2" />
                        <p className="text-muted text-sm">No past feedbacks found.</p>
                      </div>
                    ) : (
                      history.map((h, i) => (
                        <div key={i} className="bg-surface-2 border border-rule rounded-md p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} size={12} className={s <= h.rating ? "fill-caution text-caution" : "fill-rule text-faint"} />
                              ))}
                            </div>
                            <span className="text-[10px] text-faint font-bold flex items-center gap-1">
                              <Calendar size={10} /> {new Date(h.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {h.comment && <p className="text-sm text-ink-2 italic">"{h.comment}"</p>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
