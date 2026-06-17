import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquareHeart, Star, Send, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
        className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-full shadow-2xl shadow-indigo-500/40 hover:shadow-indigo-500/60 transition-all flex items-center justify-center group"
      >
        <MessageSquareHeart size={24} className="group-hover:animate-pulse" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs group-hover:ml-3 transition-all duration-300 ease-in-out font-bold text-sm">
          Share Feedback
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
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                  className="p-2 bg-slate-100/50 hover:bg-slate-200 dark:bg-slate-800/50 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors"
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
                    className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mb-6"
                  >
                    <CheckCircle2 size={40} />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Thank You!</h3>
                  <p className="text-slate-500 dark:text-slate-400">Your feedback helps us improve your digital library experience.</p>
                </div>
              ) : (
                <div className="p-8">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-12">
                      <MessageSquareHeart size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">We value your feedback</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">How would you rate your experience with the platform so far?</p>
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
                                ? 'fill-amber-400 text-amber-400'
                                : 'fill-slate-100 text-slate-200 dark:fill-slate-800 dark:text-slate-700'
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
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white resize-none h-32"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting || rating === 0}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
