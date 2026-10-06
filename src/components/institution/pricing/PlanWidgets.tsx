import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { STARTING_DEPARTMENT_RATE, formatRupees } from '../../../lib/institutionPricing';
import { SESSION_MS, SESSIONS_PER_DAY } from '../../../lib/freeAllowance';
import type { InstitutionPlan } from './planApi';
import { usePricing } from './PricingContext';
import { buttonClass } from '../../ui';

export const FROM_PRICE = `${formatRupees(STARTING_DEPARTMENT_RATE)}*`;

/** "7 / 10", or "Unlimited" on a plan made before seats were priced. */
export function seatsLabel(plan: InstitutionPlan): string {
  if (plan.unlimitedSeats || plan.seats.capacity == null) return 'Unlimited';
  return `${plan.seats.used} / ${plan.seats.capacity}`;
}

export function uniqueDepartments(plan: InstitutionPlan): string[] {
  return [...new Set(plan.departments.map((d) => d.name))];
}

/** The plan, at the foot of the rail: free preview with the way out, or what is running. */
export function PlanMiniCard() {
  const pricing = usePricing();
  const navigate = useNavigate();
  const plan = pricing?.plan;
  if (!plan) return null;

  const box = 'mx-3 mb-2 rounded-xl bg-accent px-4 py-3 text-accent-on';
  const eyebrow = 'text-[11px] font-semibold uppercase tracking-wider opacity-80';
  const button = 'mt-2.5 h-8 w-full rounded-lg bg-white/15 text-[12px] font-semibold transition-colors hover:bg-white/25';

  if (!plan.hasSubscription) {
    return (
      <div className={box}>
        <p className={eyebrow}>Free preview</p>
        <p className="mt-1 text-[13px] font-semibold leading-snug">
          {Math.round(SESSION_MS / 60_000)} min/session • {SESSIONS_PER_DAY}/day
        </p>
        <p className="mt-0.5 text-xs leading-snug opacity-85">Premium department access starts from {FROM_PRICE}.</p>
        <button type="button" onClick={() => navigate('/institution/subscriptions')} className={button}>
          Explore Subscription Options
        </button>
      </div>
    );
  }

  const n = uniqueDepartments(plan).length;
  return (
    <div className={box}>
      <p className={eyebrow}>Premium active</p>
      <p className="mt-1 text-[13px] font-semibold leading-snug">
        {n ? `${n} department${n === 1 ? '' : 's'} subscribed` : 'Institutional subscription'}
      </p>
      <p className="mt-0.5 text-xs leading-snug opacity-85">
        {plan.unlimitedSeats ? 'Unlimited users (current plan)' : `${seatsLabel(plan)} users`}
      </p>
      <button
        type="button"
        onClick={() => navigate('/institution/subscriptions')}
        className={button}
      >
        View subscription
      </button>
    </div>
  );
}

/** Learning Analytics, before there is a subscription to analyse. */
export function AnalyticsLock() {
  const pricing = usePricing();
  return (
    <div className="py-6 sm:py-10">
      <div className="card mx-auto max-w-3xl p-6 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
          <TrendingUp size={24} />
        </div>
        <h1 className="type-section mt-4 text-ink">Unlock Institutional Analytics</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Learning Analytics opens with a Premium department subscription. See who reads, when and how much,
          what they read most, and what they searched for and did not find — for everyone you add.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {['Active Readers', 'User-wise Usage', 'Reading Timeline', 'Most Read Content', 'Statistical Reports', 'Live Sync'].map((c) => (
            <span key={c} className="badge badge-neutral">{c}</span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => pricing?.openDepartments()}
          className={buttonClass('primary', 'md', 'mt-6')}
        >
          Subscribe from {FROM_PRICE}
        </button>
        <p className="mt-3 text-xs text-muted">The summary on your dashboard stays open either way.</p>
      </div>
    </div>
  );
}
