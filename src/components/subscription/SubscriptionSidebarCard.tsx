import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isIndividualAccount } from '../../constants';
import { formatRupees } from '../../lib/institutionPricing';
import { SOLO_BULK_THRESHOLD, SOLO_RATE_BULK, SOLO_RATE_STANDARD } from '../../lib/soloPricing';
import {
  departmentsOfRows, emptySummary, inDays, shortDate, summariseRunning,
  type SubscriptionKind, type SubscriptionSummary,
} from '../../lib/subscriptionStatus';
import { fetchSoloPlan, SOLO_PLAN_CHANGED } from '../solo/soloPlanApi';
import { PLAN_CHANGED, type InstitutionPlan } from '../institution/pricing/planApi';
import { usePricing } from '../institution/pricing/PricingContext';

/**
 * The subscription card at the foot of every user's sidebar, directly above Sign Out.
 *
 * One component for every kind of account. It works out which kind this is, asks the one
 * source that kind has (the institution's plan, the Solo plan, or the account's own
 * subscriptions), reduces the answer to a state (see lib/subscriptionStatus), and shows
 * the card for that state. It is a status and one action — not a pricing page.
 */

const REFRESH_EVENTS = [SOLO_PLAN_CHANGED, PLAN_CHANGED];

/** The roles that have a reader's or an institution's dashboard, and so a card. */
const CARD_ROLES = ['Institution', 'Subscriber', 'Student', 'College', 'University', 'Corporate'];

type Loaded = { summary: SubscriptionSummary | null; failed: boolean };

/** What the card is showing, and where its button goes; null while there is nothing to say yet. */
export function useSubscriptionCard(): { summary: SubscriptionSummary | null; to: string; failed: boolean } | null {
  const { profile } = useAuth() as any;
  const pricing = usePricing();
  const role: string | undefined = profile?.role;
  const solo = isIndividualAccount(profile);
  const institutionPlan: InstitutionPlan | null | undefined = role === 'Institution' ? pricing?.plan : undefined;
  const kind: SubscriptionKind | null = !role || !CARD_ROLES.includes(role) ? null
    : institutionPlan ? 'institution' : solo ? 'solo' : 'member';
  const [loaded, setLoaded] = useState<Loaded>({ summary: null, failed: false });
  const uid = profile?.uid;

  // Solo and everyone-else read their own record; an institution's comes from its plan below.
  useEffect(() => {
    if (kind !== 'solo' && kind !== 'member') return;
    let live = true;
    const load = async () => {
      try {
        if (kind === 'solo') {
          const plan = await fetchSoloPlan();
          if (!live) return;
          if (!plan) { setLoaded({ summary: null, failed: true }); return; }
          setLoaded({
            summary: summariseRunning({ kind: 'solo', departments: plan.departments, wholeLibrary: plan.wholeLibrary, lapsedOn: plan.lapsedOn, none: 'FREE' }),
            failed: false,
          });
        } else {
          const res = await fetch('/api/user/subscriptions', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
          const rows = res.ok ? await res.json() : null;
          if (!live) return;
          if (!Array.isArray(rows)) { setLoaded({ summary: null, failed: true }); return; }
          const held = departmentsOfRows(rows);
          setLoaded({ summary: summariseRunning({ kind: 'member', ...held, none: 'FREE' }), failed: false });
        }
      } catch {
        if (live) setLoaded({ summary: null, failed: true });
      }
    };
    setLoaded({ summary: null, failed: false });
    load();
    REFRESH_EVENTS.forEach(e => window.addEventListener(e, load));
    return () => { live = false; REFRESH_EVENTS.forEach(e => window.removeEventListener(e, load)); };
  }, [kind, uid]);

  if (!kind) return null;
  if (kind === 'institution' && institutionPlan) {
    const plan = institutionPlan;
    const departments = plan.departments.map(d => ({ name: d.name, endDate: d.endDate }));
    const summary = summariseRunning({
      kind: 'institution',
      departments,
      // A plan with no departments listed is an older, institution-wide subscription.
      wholeLibrary: plan.hasSubscription && !departments.length,
      none: 'NO_SUBSCRIPTION',
      users: plan.hasSubscription ? { used: plan.seats.used, capacity: plan.unlimitedSeats ? null : plan.seats.capacity } : null,
    });
    return { summary, to: '/institution/subscriptions', failed: false };
  }
  if (kind === 'institution') return null;
  // An individual with nothing running goes straight to choosing departments; one who has
  // something running goes to see it (where adding more is a button away).
  const buying = kind === 'solo' && (loaded.failed || !loaded.summary || loaded.summary.state === 'FREE' || loaded.summary.state === 'EXPIRED');
  const to = kind === 'solo' ? (buying ? '/dashboard/pro?choose=1' : '/dashboard/pro')
    : role === 'Subscriber' ? '/dashboard/pro' : '/dashboard/subscriptions';
  return { summary: loaded.summary, to, failed: loaded.failed };
}

const box = 'mx-3 mb-2 min-w-0 rounded-xl bg-accent px-4 py-3 text-accent-on';
const eyebrow = 'text-[11px] font-semibold uppercase tracking-wider opacity-80';
const headline = 'mt-1 break-words text-[13px] font-semibold leading-snug';
const detail = 'mt-0.5 break-words text-xs leading-snug opacity-85';
const button = 'mt-2.5 h-8 w-full truncate rounded-lg bg-white/15 px-2 text-[12px] font-semibold transition-colors hover:bg-white/25';

const departments = (n: number) => `${n} department${n === 1 ? '' : 's'}`;

/** The words for one state: eyebrow, headline, detail lines, and the button. */
export function cardContent(s: SubscriptionSummary): { eyebrow: string; headline: string; lines: string[]; button: string; hint?: string; prices?: string[] } {
  const subscribed = s.wholeLibrary
    ? (s.kind === 'institution' ? 'Institutional subscription' : 'Whole library')
    : `${departments(s.departmentCount)} subscribed`;

  switch (s.state) {
    case 'ACTIVE': {
      const lines: string[] = [];
      let hint: string | undefined;
      if (s.kind === 'institution' && s.users) {
        lines.push(s.users.capacity == null ? 'Unlimited users (current plan)' : `${s.users.used.toLocaleString('en-IN')} / ${s.users.capacity.toLocaleString('en-IN')} users`);
        hint = 'Includes your librarian account';
      } else if (s.validUntil) {
        lines.push(`Valid until ${shortDate(s.validUntil)}`);
      }
      return { eyebrow: 'Premium active', headline: subscribed, lines, button: 'View subscription', hint };
    }
    case 'EXPIRING': {
      const when = s.daysLeft === null ? '' : inDays(s.daysLeft);
      const partial = s.expiringCount > 0 && s.expiringCount < s.departmentCount;
      const line = s.kind === 'institution'
        ? (partial ? `${s.expiringCount} of ${departments(s.departmentCount)} expire ${when}` : `Expires ${when}`)
        : (partial ? `${s.expiringCount} expire ${shortDate(s.nextExpiry!)}` : `Expires ${shortDate(s.nextExpiry!)}`);
      return s.kind === 'institution'
        ? { eyebrow: 'Premium active', headline: subscribed, lines: [line], button: 'View subscription' }
        : { eyebrow: 'Premium subscription', headline: s.wholeLibrary ? 'Whole library' : departments(s.departmentCount), lines: [line], button: 'View subscription' };
    }
    case 'EXPIRED':
      return {
        eyebrow: 'Subscription expired', headline: 'Your premium department access has ended.', lines: [],
        // An individual can buy again from here; anyone else is shown the options.
        button: s.kind === 'solo' ? 'Buy Premium' : 'View subscription options',
      };
    case 'NO_SUBSCRIPTION':
      return {
        eyebrow: 'Institutional access',
        headline: 'No active premium subscription',
        lines: ['Explore institutional access and available departments.'],
        button: 'View subscriptions',
      };
    default: // FREE
      return {
        eyebrow: 'Free subscription',
        headline: 'Free Preview active',
        lines: s.kind === 'solo' ? [] : ['Upgrade for uninterrupted access.'],
        // Only an individual account is shown the Solo rates; no other account is quoted them.
        prices: s.kind === 'solo'
          ? [`Premium from ${formatRupees(SOLO_RATE_STANDARD)} / department / year`, `${SOLO_BULK_THRESHOLD}+ departments: ${formatRupees(SOLO_RATE_BULK)} each`]
          : undefined,
        button: s.kind === 'solo' ? 'Buy Premium' : 'View Premium Plans',
      };
  }
}

export function SubscriptionSidebarCard({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  const card = useSubscriptionCard();
  if (!card) return null;

  // The data could not be read: say what we can rather than guess free or premium.
  const s = card.summary ?? (card.failed ? emptySummary('member', 'FREE') : null);
  if (!s) return null;
  const c = card.failed
    ? { eyebrow: 'Subscription', headline: 'See your subscription', lines: [], button: 'View subscription' } as ReturnType<typeof cardContent>
    : cardContent(s);

  if (collapsed) {
    return (
      <div className="flex justify-center px-3 pb-2">
        <button type="button" onClick={() => navigate(card.to)} title={`${c.eyebrow} — ${c.headline}`} aria-label={`${c.eyebrow}. ${c.button}`}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-on transition-colors hover:bg-accent-hover">
          <Sparkles size={18} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className={box} data-subscription-card data-state={card.failed ? 'UNKNOWN' : s.state} data-kind={s.kind} aria-label="Subscription status" role="region">
      <p className={eyebrow}>{c.eyebrow}</p>
      <p className={headline}>{c.headline}</p>
      {c.lines.map(l => <p key={l} className={detail} title={c.hint}>{l}</p>)}
      {c.prices && (
        <div className="mt-2 border-t border-white/20 pt-2">
          {c.prices.map((p, i) => <p key={p} className={i === 0 ? 'break-words text-[13px] font-semibold leading-snug' : detail}>{p}</p>)}
        </div>
      )}
      <button type="button" onClick={() => navigate(card.to)} className={button}>{c.button}</button>
    </div>
  );
}
