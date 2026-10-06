import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isSoloAccount } from '../../constants';
import { SESSION_MS, SESSIONS_PER_DAY } from '../../lib/freeAllowance';
import { formatRupees } from '../../lib/institutionPricing';
import { SOLO_RATE_STANDARD } from '../../lib/soloPricing';
import { fetchSoloPlan, SOLO_PLAN_CHANGED, type SoloPlan } from './soloPlanApi';

/**
 * The plan, at the foot of a Solo Learner's sidebar: the free allowance with the way to
 * Premium, or what is running. It is the same card the institution rail shows, worded for one
 * person and fed by the Solo plan — never the institution's.
 */
export function SoloPlanMiniCard() {
  const { profile } = useAuth() as any;
  const navigate = useNavigate();
  const [plan, setPlan] = useState<SoloPlan | null>(null);
  const solo = isSoloAccount(profile);

  useEffect(() => {
    if (!solo) return;
    let live = true;
    const load = () => fetchSoloPlan().then((p) => { if (live) setPlan(p); });
    load();
    window.addEventListener(SOLO_PLAN_CHANGED, load);
    return () => { live = false; window.removeEventListener(SOLO_PLAN_CHANGED, load); };
  }, [solo, profile?.uid]);

  if (!solo || !plan) return null;

  const box = 'mx-3 mb-2 rounded-xl bg-accent px-4 py-3 text-accent-on';
  const eyebrow = 'text-[11px] font-semibold uppercase tracking-wider opacity-80';
  const button = 'mt-2.5 h-8 w-full rounded-lg bg-white/15 text-[12px] font-semibold transition-colors hover:bg-white/25';
  const n = new Set(plan.departments.map((d) => d.name)).size;

  if (!plan.wholeLibrary && n === 0) {
    return (
      <div className={box}>
        <p className={eyebrow}>Free Subscription</p>
        <p className="mt-1 text-[13px] font-semibold leading-snug">
          {Math.round(SESSION_MS / 60_000)} min/session • {SESSIONS_PER_DAY}/day
        </p>
        <p className="mt-0.5 text-xs leading-snug opacity-85">Premium department access starts from {formatRupees(SOLO_RATE_STANDARD)}.</p>
        <button type="button" onClick={() => navigate('/dashboard/subscribe')} className={button}>
          Explore Subscription Options
        </button>
      </div>
    );
  }

  const ends = plan.departments.length
    ? plan.departments.reduce((a, d) => (new Date(d.endDate) > new Date(a) ? d.endDate : a), plan.departments[0].endDate)
    : null;
  return (
    <div className={box}>
      <p className={eyebrow}>Premium active</p>
      <p className="mt-1 text-[13px] font-semibold leading-snug">
        {plan.wholeLibrary ? 'Whole library' : `${n} department${n === 1 ? '' : 's'} subscribed`}
      </p>
      {ends && (
        <p className="mt-0.5 text-xs leading-snug opacity-85">
          Until {new Date(ends).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
      <button type="button" onClick={() => navigate('/dashboard/subscribe')} className={button}>
        View subscription
      </button>
    </div>
  );
}
