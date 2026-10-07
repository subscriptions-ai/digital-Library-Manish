import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Check, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isIndividualAccount } from '../../constants';
import { fetchSoloPlan, type SoloPlan } from './soloPlanApi';
import { SoloPurchaseDialog } from './SoloPurchase';
import { PageHeader, Skeleton } from '../ui';
import { getSoloPricingDisplay } from '../../lib/pricingDisplay';

/**
 * Choose Your Subscription — what a Solo Learner sees right after registering, and whenever they
 * come back to Subscription.
 *
 * Free is the clock they already have. Premium is departments, by the year, priced from
 * soloPricing.ts and bought in the shared purchase window (SoloPurchase). Nothing on this page
 * reads the institution rate card.
 */

export function SoloSubscribe() {
  const { profile } = useAuth() as any;
  const navigate = useNavigate();
  const [plan, setPlan] = useState<SoloPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<'premium' | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isIndividualAccount(profile)) return;
    let live = true;
    // Read again after a purchase without swapping the page for a placeholder: the purchase
    // window is still showing its confirmation.
    if (!plan) setLoaded(false);
    fetchSoloPlan().then((p) => { if (live) { setPlan(p); setLoaded(true); } });
    return () => { live = false; };
  }, [profile?.uid, attempt]);

  const held = useMemo(() => new Set((plan?.departments || []).map((d) => d.name)), [plan]);

  const continueFree = () => navigate('/dashboard');

  // Only a Solo Learner buys here. Anyone else goes to the page they have always had.
  if (profile && !isIndividualAccount(profile)) return <Navigate to="/dashboard/pro" replace />;

  if (!profile || !loaded) {
    return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader eyebrow="Subscription" title="Choose Your Subscription" />
        <div role="alert" className="card card-pad text-sm text-ink-2">
          <p className="font-semibold text-ink">We could not load your subscription options.</p>
          <p className="mt-1 text-muted">Please check your connection and try again. Your Free Subscription is not affected.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn btn-primary">Try again</button>
            <button type="button" onClick={continueFree} className="btn btn-outline">Continue with Free Subscription</button>
          </div>
        </div>
      </div>
    );
  }

  const soloPricing = getSoloPricingDisplay();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Subscription"
        title="Choose Your Subscription"
        description="Start free, or subscribe to the departments you read most. You can change this later from your dashboard."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-xl border border-rule bg-surface p-5">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-muted" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">Free Subscription</h2>
          </div>
          <p className="mt-1 text-sm text-muted">The whole library, in half-hour sessions.</p>
          <ul className="mt-4 flex-1 space-y-2.5 text-sm text-ink-2">
            <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> Read every department</li>
            <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> No payment, no request forms</li>
            <li className="flex gap-2.5"><Clock size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" /> Timed: half an hour at a time</li>
          </ul>
          <button type="button" onClick={continueFree} className="btn btn-outline mt-5 w-full">Continue with Free Subscription</button>
        </div>

        {/* Premium */}
        <div className={`flex flex-col rounded-xl border p-5 ${choice === 'premium' ? 'border-accent bg-accent-soft' : 'border-rule bg-surface'}`}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">Premium Subscription</h2>
          </div>
          <p className="mt-3 text-[28px] font-bold leading-none text-ink tnum">{soloPricing.tiers[0].price}</p>
          <p className="mt-1 text-sm text-muted">per department / year</p>
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{soloPricing.tiers[1].label}</p>
            <p className="tnum text-sm font-semibold text-ink">{soloPricing.tiers[1].price} per department / year</p>
          </div>
          <ul className="mt-4 flex-1 space-y-2.5 text-sm text-ink-2">
            <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> No reading clock on your departments</li>
            <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> Twelve months from the day you subscribe</li>
          </ul>
          <button type="button" onClick={() => setChoice('premium')} className="btn btn-primary mt-5 w-full" aria-expanded={choice === 'premium'}>
            Choose Departments &amp; Buy
          </button>
        </div>
      </div>

      {plan && held.size > 0 && (
        <div className="mt-4 rounded-lg border border-rule bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Your Premium Subscription covers {held.size} department{held.size > 1 ? 's' : ''}. Use Choose Departments to add more.
        </div>
      )}
      {plan?.wholeLibrary && (
        <div className="mt-4 rounded-lg border border-rule bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Your subscription already covers the whole library. <Link to="/dashboard" className="font-semibold text-accent underline">Go to your dashboard</Link>
        </div>
      )}

      <SoloPurchaseDialog
        open={choice === 'premium' && !plan.wholeLibrary}
        onClose={() => setChoice(null)}
        plan={plan}
        onPaid={() => setAttempt((n) => n + 1)}
      />
    </div>
  );
}
