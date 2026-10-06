import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquareHeart, Star, Calendar, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../ui';

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
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader
        className="mb-0"
        title="My Feedbacks"
        description="A history of all the feedback and ratings you have submitted."
        actions={
          <>
            <Button onClick={() => window.dispatchEvent(new Event('open-feedback'))}>
              <Plus size={16} aria-hidden="true" />
              Add New Feedback
            </Button>
            <Button variant="outline" onClick={fetchHistory} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading">
          {[1, 2, 3].map(i => (
            <div key={i} className="card card-pad space-y-3" aria-hidden="true">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={MessageSquareHeart}
            title="No feedback submitted yet"
            description="You haven't submitted any feedback so far. Share your thoughts and they will appear here."
            action={
              <Button onClick={() => window.dispatchEvent(new Event('open-feedback'))}>
                <Plus size={16} aria-hidden="true" /> Add New Feedback
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {history.map((h, i) => (
            <motion.li
              key={h.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card card-pad flex flex-col"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1" role="img" aria-label={`Rated ${h.rating} out of 5`}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star 
                      key={star} 
                      size={16} 
                      aria-hidden="true"
                      className={star <= h.rating ? "fill-caution text-caution" : "fill-rule text-faint"} 
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Calendar size={12} aria-hidden="true" />
                  {new Date(h.createdAt).toLocaleDateString()}
                </div>
              </div>

              {h.type && <Badge tone="accent" className="mb-3 self-start">{h.type}</Badge>}
              <div className="flex-1 rounded-lg bg-surface-2 p-4">
                {h.comment ? (
                  <p className="text-sm italic leading-relaxed text-ink-2">"{h.comment}"</p>
                ) : (
                  <p className="text-sm italic text-muted">No written comment.</p>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
