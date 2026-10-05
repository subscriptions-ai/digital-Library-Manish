import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchPlan, PLAN_CHANGED, type InstitutionPlan } from './planApi';
import { DepartmentModal, TermsModal, UserLimitModal } from './PricingModals';

/**
 * The librarian's plan, and the windows that sell more of it (and say who to ask beyond it).
 *
 * Held once, in the institution shell, so the rail, User Management, Analytics and the
 * Subscriptions page all read the same plan and open the same windows. A screen used outside
 * the shell (an administrator looking at someone else's analytics) gets null and carries on
 * as it did before.
 */

type PricingValue = {
  plan: InstitutionPlan | null;
  loading: boolean;
  reload: () => Promise<void>;
  openDepartments: () => void;
  /** The user limit has been reached: say so, and say who to contact. */
  openUserLimit: () => void;
  openTerms: () => void;
};

const PricingCtx = createContext<PricingValue | null>(null);

export const usePricing = () => useContext(PricingCtx);

export function PricingProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [plan, setPlan] = useState<InstitutionPlan | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [open, setOpen] = useState<'departments' | 'limit' | null>(null);
  const [terms, setTerms] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setPlan(await fetchPlan());
    } catch { /* the screens fall back to their old behaviour */ }
    setLoading(false);
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  // A purchase anywhere reads the plan again everywhere.
  useEffect(() => {
    const on = () => { reload(); };
    window.addEventListener(PLAN_CHANGED, on);
    return () => window.removeEventListener(PLAN_CHANGED, on);
  }, [reload]);

  const value = useMemo<PricingValue>(() => ({
    plan,
    loading,
    reload,
    openDepartments: () => setOpen('departments'),
    openUserLimit: () => setOpen('limit'),
    openTerms: () => setTerms(true),
  }), [plan, loading, reload]);

  const purchased = () => {
    window.dispatchEvent(new Event(PLAN_CHANGED));
  };

  return (
    <PricingCtx.Provider value={value}>
      {children}
      {plan && open === 'departments' && (
        <DepartmentModal
          plan={plan}
          onClose={() => setOpen(null)}
          onTerms={() => setTerms(true)}
          onPurchased={() => { purchased(); setOpen(null); }}
        />
      )}
      {open === 'limit' && <UserLimitModal onClose={() => setOpen(null)} />}
      {terms && <TermsModal onClose={() => setTerms(false)} />}
    </PricingCtx.Provider>
  );
}
