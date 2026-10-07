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
