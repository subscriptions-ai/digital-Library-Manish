import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, AlertCircle, CreditCard, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, buttonClass, EmptyState, PageHeader, Skeleton, StatusBadge } from '../ui';

export function MySubscriptions() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Active' | 'Expired'>('All');

  useEffect(() => {
    fetch('/api/user/subscriptions', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      // An error answers with an object, not a list; treat it as a failed load.
      .then(d => { if (!Array.isArray(d)) throw new Error(); setSubscriptions(d); })
      .catch(() => toast.error("Failed to load subscriptions"))
      .finally(() => setLoading(false));
  }, []);

  const calculateProgress = (start: string, end: string) => {
    const startDate = new Date(start).getTime();
    const endDate = new Date(end).getTime();
    const now = new Date().getTime();
    if (now > endDate) return 100;
    if (now < startDate) return 0;
    return Math.round(((now - startDate) / (endDate - startDate)) * 100);
  };

  const calculateDaysLeft = (end: string) => {
    const diff = new Date(end).getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 3600 * 24)));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card card-pad space-y-3" aria-hidden="true">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const filteredSubs = subscriptions.filter(sub => filter === 'All' || sub.status === filter);
  const activeCount = subscriptions.filter(s => s.status === 'Active').length;
  const expiredCount = subscriptions.filter(s => s.status !== 'Active').length;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        className="mb-0"
        title="Timeline & Billing"
        description="Manage your active plans and renew expiring subscriptions."
        actions={(activeCount > 0 || expiredCount > 0) ? (
          <>
            {activeCount > 0 && (
              <Badge tone="success">
                <CheckCircle2 size={14} aria-hidden="true" /> {activeCount} Active
              </Badge>
            )}
            {expiredCount > 0 && (
              <Badge tone="caution">
                <AlertCircle size={14} aria-hidden="true" /> {expiredCount} Expired
              </Badge>
            )}
          </>
        ) : undefined}
      />

      {/* Filter Tabs */}
      <div className="flex w-max max-w-full gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Filter subscriptions">
        {(['All', 'Active', 'Expired'] as const).map(tab => (
          <button
            type="button"
            key={tab}
            aria-pressed={filter === tab}
            onClick={() => setFilter(tab)}
            className={`h-8 rounded-md px-4 text-xs font-semibold transition-colors duration-150 ${
              filter === tab 
                ? 'bg-surface text-accent shadow-sm' 
                : 'text-muted hover:text-ink-2'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {filteredSubs.map((sub, idx) => {
            const isExpired = sub.status !== 'Active';
            const progress = calculateProgress(sub.startDate, sub.endDate);
            const daysLeft = calculateDaysLeft(sub.endDate);
            const isUrgent = !isExpired && daysLeft <= 30;
            // The badge speaks the product's words for these two states;
            // anything else is shown as the server wrote it.
            const badgeStatus = sub.status === 'Active' ? 'subscription-active'
              : sub.status === 'Expired' ? 'subscription-expired' : sub.status;

            return (
              <motion.div
                key={sub.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                className={`card card-pad relative overflow-hidden ${
                  isExpired || isUrgent ? 'border-caution' : ''
                }`}
              >
                {/* Subtle left accent bar */}
                <div className={`absolute bottom-0 left-0 top-0 w-1 ${
                  isExpired ? 'bg-rule-2' : isUrgent ? 'bg-caution' : 'bg-accent'
                }`} aria-hidden="true" />

                <div className="flex flex-col justify-between gap-4 pl-2 sm:flex-row sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={badgeStatus} />
                      {sub.planName && <Badge tone="neutral">{sub.planName}</Badge>}
                    </div>
                    {/* A plan that covers no particular department — a Pro
                        membership, say — has no domain name, and heading the
                        card with one left it titleless. */}
                    <h2 className="type-card-title break-words text-ink">{sub.domainName || sub.planName || 'Subscription'}</h2>
                    {sub.allowedContentTypes && (
                      <p className="mt-1 max-w-lg text-sm text-muted">
                        Includes: {(sub.allowedContentTypes).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-left sm:text-right">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink sm:justify-end">
                      <Calendar size={16} className="text-faint" aria-hidden="true" />
                      {new Date(sub.startDate).toLocaleDateString()} — {new Date(sub.endDate).toLocaleDateString()}
                    </div>
                    {!isExpired ? (
                      <p className={`mt-2 flex items-center gap-1 text-xs font-semibold sm:justify-end ${isUrgent ? 'text-caution' : 'text-muted'}`}>
                        {isUrgent && <AlertCircle size={14} aria-hidden="true" />} {daysLeft} days remaining
                      </p>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-caution">Subscription Expired</p>
                    )}
                    {isExpired && (
                      <a href="/contact" className={buttonClass('primary', 'sm', 'mt-3')}>
                        Request Renewal
                      </a>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-6 pl-2">
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-track"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Share of the subscription period elapsed"
                  >
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${progress}%` }} 
                      transition={{ duration: 0.6, delay: 0.1 }}
                      className={`h-full rounded-full ${
                        isExpired ? 'bg-rule-2' : isUrgent ? 'bg-caution' : 'bg-accent'
                      }`}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>Started</span>
                    <span>{progress}% elapsed</span>
                    <span>Ends</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredSubs.length === 0 && (
          <div className="card">
            <EmptyState
              icon={CreditCard}
              title="No subscriptions found"
              description={`You don't have any ${filter === 'All' ? '' : `${filter.toLowerCase()} `}subscriptions at the moment.`}
              action={<a href="/contact" className={buttonClass('primary')}>Request Access</a>}
            />
          </div>
        )}
      </div>
    </div>
  );
}
