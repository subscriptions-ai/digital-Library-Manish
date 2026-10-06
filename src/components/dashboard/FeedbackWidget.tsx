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

  // Escape closes the dialog, as every other overlay closes — but never mid-send.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSubmitting) setIsOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isSubmitting]);
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
      {/* The bottom of the floating stack; WhatsApp sits one gap above it. A
          round icon on a phone, a labelled pill from sm up — 48px tall either way. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-[var(--fab-bottom)] right-[var(--fab-right)] mb-[max(var(--pwa-offset,0px),var(--cookie-offset,0px))] z-40 flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-accent text-accent-on shadow-[var(--shadow-pop)] transition-[margin,background-color] duration-200 hover:bg-accent-hover sm:w-auto sm:px-5"
      >
        <MessageSquareHeart size={20} aria-hidden="true" />
        <span className="hidden whitespace-nowrap text-sm font-semibold sm:inline">Feedback</span>
      </button>

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
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.2 }}
              role="dialog" aria-modal="true" aria-label="Feedback"
              className="relative w-full max-w-md max-h-[calc(100dvh-32px)] overflow-y-auto bg-surface rounded-2xl border border-rule shadow-[var(--shadow-modal)]"
            >
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                {!isSuccess && !viewingHistory && (
                  <button
                    onClick={() => setViewingHistory(true)}
                    className="btn btn-ghost btn-sm btn-icon text-accent"
                    title="View past feedback" aria-label="View past feedback"
                  >
                    <History size={18} aria-hidden="true" />
                  </button>
                )}
                {viewingHistory && (
                  <button
                    onClick={() => setViewingHistory(false)}
                    className="btn btn-ghost btn-sm btn-icon"
                    title="Back to the form" aria-label="Back to the form"
                  >
                    <ArrowLeft size={18} aria-hidden="true" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                  className="btn btn-ghost btn-sm btn-icon"
                  aria-label="Close"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              {isSuccess ? (
                <div className="p-10 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="w-16 h-16 bg-success-soft text-success rounded-full flex items-center justify-center mb-5"
                  >
                    <CheckCircle2 size={32} aria-hidden="true" />
                  </motion.div>
                  <h3 className="text-xl font-semibold text-ink mb-2">Thank you</h3>
                  <p className="text-muted">Your feedback helps us improve your digital library experience.</p>
                </div>
              ) : !viewingHistory ? (
                <div className="p-6 sm:p-8">
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-accent-soft text-accent rounded-xl flex items-center justify-center mx-auto mb-4">
                      <MessageSquareHeart size={24} aria-hidden="true" />
                    </div>
                    <h2 className="text-xl font-semibold text-ink mb-1.5">We value your feedback</h2>
                    <p className="text-sm text-muted">How would you rate your experience with the platform so far?</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Star Rating */}
                    <div className="flex justify-center gap-1" role="group" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          disabled={isSubmitting}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                          aria-label={`${star} out of 5`} aria-pressed={rating === star}
                          className="rounded-lg p-2 transition-transform duration-150 hover:scale-110"
                        >
                          <Star
                            size={32}
                            aria-hidden="true"
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
                    <div className="field">
                      <label htmlFor="feedback-comment" className="field-label">Comments <span className="font-normal text-muted">(optional)</span></label>
                      <textarea
                        id="feedback-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        disabled={isSubmitting}
                        placeholder="Tell us what you love or what we can improve..."
                        className="input h-32 resize-none"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting || rating === 0}
                      className="btn btn-primary btn-lg btn-block"
                    >
                      {isSubmitting ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" /> Sending…</>
                      ) : (
                        <>
                          <Send size={16} aria-hidden="true" /> Submit Feedback
                        </>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-accent-soft text-accent rounded-md flex items-center justify-center">
                      <History size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-ink">Your feedback</h2>
                      <p className="text-xs text-muted">History of your past submissions</p>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                    {loadingHistory ? (
                      <div className="flex justify-center py-10"><div role="status" aria-label="Loading" className="w-7 h-7 border-2 border-rule border-t-accent rounded-full animate-spin" /></div>
                    ) : history.length === 0 ? (
                      <div className="text-center py-10">
                        <MessageSquareHeart size={32} className="mx-auto text-faint mb-2" />
                        <p className="text-sm font-semibold text-ink">No feedback submitted yet</p>
                      </div>
                    ) : (
                      history.map((h, i) => (
                        <div key={i} className="bg-surface-2 border border-rule rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} size={12} className={s <= h.rating ? "fill-caution text-caution" : "fill-rule text-faint"} />
                              ))}
                            </div>
                            <span className="text-xs text-muted flex items-center gap-1">
                              <Calendar size={12} aria-hidden="true" /> {new Date(h.createdAt).toLocaleDateString()}
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
