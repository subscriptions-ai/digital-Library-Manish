import React, { useEffect, useState } from 'react';
import {
  ArrowRight, BarChart3, Check, Clock, CreditCard, FileBarChart, Infinity as InfinityIcon, Layers, Lock,
  RefreshCw, ShieldCheck, Timer, UserPlus, Users,
} from 'lucide-react';
import {
  DEPARTMENT_RATES, GST_RATE, MAX_INSTITUTION_USERS, STARTING_DEPARTMENT_RATE, TERM_MONTHS, formatRupees,
} from '../../lib/institutionPricing';
import { SESSION_MS, SESSIONS_PER_DAY, HOLD_MS } from '../../lib/freeAllowance';
import { usePricing } from './pricing/PricingContext';
import { AnnualPricingBlock } from '../pricing/AnnualPricingBlock';
import { getInstitutionPricingDisplay } from '../../lib/pricingDisplay';
import { FROM_PRICE, seatsLabel, uniqueDepartments } from './pricing/PlanWidgets';
import { Badge, EmptyState, Skeleton, StatusBadge, buttonClass } from '../ui';

/**
 * Subscriptions: what Premium is, what the institution holds, and the way to buy more.
 *
 * Laid out after Boss's prototype ("Final Price setup"): a hero and the free-beside-premium
 * comparison while the institution is still on the preview, then the plan it actually has —
 * departments with their end dates, seats used against capacity — and the benefits. Every
 * number comes from src/lib/institutionPricing.ts; what is charged comes from the server.
 */

const shortDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const gstPct = Math.round(GST_RATE * 100);
const bestTier = DEPARTMENT_RATES[0];
const footnote = `*${formatRupees(STARTING_DEPARTMENT_RATE)} per department/year applies when ${bestTier.minDepartments} or more departments are selected. ${gstPct}% GST extra.`;

const btnPrimary = buttonClass('primary');
const btnSoft = buttonClass('outline', 'md', 'whitespace-normal text-left h-auto min-h-10 py-2');
const SUB_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted';

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_1fr] gap-3 border-b border-rule py-2.5 text-[13px] leading-relaxed text-ink-2 last:border-b-0">
      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function SubscriptionRecords() {
  const [subs, setSubs] = useState<any[] | null>(null);
  useEffect(() => {
    fetch('/api/institution/subscriptions', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSubs(Array.isArray(d) ? d : []))
      .catch(() => setSubs([]));
  }, []);
  if (!subs?.length) return null;

  const domainsOf = (sub: any): string[] => {
    try {
      const d = Array.isArray(sub.domains) ? sub.domains : sub.domains ? JSON.parse(sub.domains) : [];
      return d.length ? d : sub.domainName ? [sub.domainName] : [];
    } catch { return sub.domainName ? [sub.domainName] : []; }
  };

  return (
    <section className="card card-pad">
      <h2 className="card-title">Subscription records</h2>
      <p className="mt-1 text-[13px] text-muted">Every subscription on your institution's account, current and past.</p>
      <ul className="mt-3 divide-y divide-rule">
        {subs.map((sub) => {
          const d = domainsOf(sub);
          const active = sub.status === 'Active' && new Date(sub.endDate) > new Date();
          return (
            <li key={sub.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{sub.planName || 'Institution plan'}</p>
                <p className="text-xs text-muted">
                  {shortDate(sub.startDate)} → {shortDate(sub.endDate)} · {d.length ? (d.length > 3 ? `${d.length} departments` : d.join(', ')) : 'All departments'}
                </p>
              </div>
              <StatusBadge status={active ? 'active' : sub.status === 'Active' ? 'expired' : sub.status}
                label={active ? 'Active' : sub.status === 'Active' ? 'Ended' : sub.status} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function InstitutionSubscriptions() {
  const pricing = usePricing();
  const plan = pricing?.plan;

  if (!pricing || pricing.loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5" role="status" aria-label="Loading your subscription">
        <div className="space-y-2"><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-full max-w-lg" /></div>
        <div className="card card-pad space-y-4">
          <Skeleton className="h-6 w-1/2" />
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        </div>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="card mx-auto max-w-lg">
        <EmptyState icon={CreditCard} title="Subscription unavailable"
          description="Only your institution's librarian account can see and change its subscription." />
      </div>
    );
  }

  const premium = plan.hasSubscription;
  const departments = uniqueDepartments(plan);
  const endOf = (name: string) =>
    plan.departments.filter((d) => d.name === name).map((d) => d.endDate).sort().pop()!;
  const subscribe = () => pricing.openDepartments();
  const sessionMin = Math.round(SESSION_MS / 60_000);
  const holdH = Math.round(HOLD_MS / 3_600_000);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <p className={SUB_LABEL}>Subscriptions</p>
        <h1 className="type-page-title mt-1 text-ink">Premium Subscription</h1>
        <p className="mt-1 text-sm text-muted">
          Review what Premium includes, choose your departments, and manage user access from one place.
        </p>
      </div>

      {!premium && (
        <section className="rounded-xl bg-navy p-5 on-dark sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber">Your institution has explored the platform</p>
          <h2 className="type-section mt-2 max-w-3xl">
            Ready to move from preview to full institutional access?
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed on-dark-2">
            Remove session limits, unlock full subscribed content, add your faculty, researchers and students, and follow
            institutional usage through live analytics, user controls and statistical reports. Choose your departments
            first — up to {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users come with it, at no extra charge.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button type="button" onClick={subscribe} className={buttonClass('highlight')}>
              Subscribe from {FROM_PRICE} <ArrowRight size={16} aria-hidden="true" />
            </button>
            <a href="mailto:info@celnet.in?subject=Premium%20institutional%20subscription"
              className="btn border on-dark-edge on-dark-fill transition-opacity hover:opacity-90">
              Talk to Our Team
            </a>
          </div>
          <p className="mt-3 text-xs on-dark-3">{footnote}</p>
        </section>
      )}

      {/* Current plan */}
      <section className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="type-section text-ink">
              {premium ? 'Premium Institutional Subscription' : 'Free Institutional Preview'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {premium
                ? 'Full subscribed access is active for the departments below.'
                : 'You can evaluate the platform with timed sessions. Subscribe to departments when you are ready for full access.'}
            </p>
          </div>
          <StatusBadge status={premium ? 'subscription-active' : 'free-preview'} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-rule p-4">
            <p className={SUB_LABEL}>Department subscription</p>
            <p className="mt-1 text-[15px] font-semibold text-ink">
              {departments.length
                ? `${departments.length} department${departments.length === 1 ? '' : 's'} active`
                : premium ? 'Institutional plan active' : 'No Premium departments yet'}
            </p>
            {departments.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {departments.map((name) => (
                  <li key={name} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink-2"><Check size={14} className="shrink-0 text-success" aria-hidden="true" /> {name}</span>
                    <span className="text-muted">until {shortDate(endOf(name))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-rule p-4">
            <p className={SUB_LABEL}>Full-access users</p>
            {plan.unlimitedSeats ? (
              <>
                <p className="mt-1 text-[15px] font-semibold text-ink">Unlimited users (current plan)</p>
                <p className="mt-1 text-[13px] text-muted">
                  {plan.seats.used} in use. Your plan has no cap on users until it is renewed.
                </p>
              </>
            ) : (
              <>
                <p className="tnum mt-1 text-[15px] font-semibold text-ink">
                  {premium ? `${seatsLabel(plan)} users` : `Up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users with a subscription`}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {premium
                    ? `No charge per user, up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')}. You count as one.`
                    : 'Users are not charged for. Subscribe to at least one department to add them.'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* The price list sits with the section it prices; the rate that applies is marked once
            departments are held. */}
        <AnnualPricingBlock
          className="mt-4"
          pricing={getInstitutionPricingDisplay()}
          count={departments.length}
          applied={departments.length
            ? `Your ${departments.length} department${departments.length === 1 ? '' : 's'} ${departments.length === 1 ? 'is' : 'are'} priced in the tier marked below; departments you add are priced for your new total.`
            : 'Departments are priced by how many your institution holds in total.'}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={subscribe} className={btnPrimary}>
            {premium ? <>Add departments <ArrowRight size={16} aria-hidden="true" /></> : <>Subscribe from {FROM_PRICE} <ArrowRight size={16} aria-hidden="true" /></>}
          </button>
          {!plan.unlimitedSeats && premium && (
            <button type="button" onClick={() => pricing.openUserLimit()} className={btnSoft}><Users size={16} className="shrink-0" aria-hidden="true" /> Need more than {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users?</button>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          Departments are priced by the year, and users are not charged for: up to {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} per
          institution. Every purchase runs {TERM_MONTHS} months from the day it is bought, and
          the amount payable is shown before payment.{' '}
          <button type="button" onClick={pricing.openTerms} className="font-semibold text-accent underline underline-offset-2">View pricing terms</button>
        </div>
      </section>

      {/* Free beside Premium */}
      <div className="grid gap-4 md:grid-cols-2">
        <article className={`card overflow-hidden ${!premium ? '!border-accent' : ''}`}>
          <div className="border-b border-rule px-5 pb-4 pt-5">
            <Badge tone="neutral">
              {premium ? 'Preview' : 'Current access'}
            </Badge>
            <h3 className="type-card-title mt-2.5 text-ink">Free Institutional Preview</h3>
            <p className="mt-1 text-[13px] text-muted">A working preview so your faculty and researchers can try the platform before subscribing.</p>
          </div>
          <ul className="px-5 py-3">
            <Feature icon={<Check size={12} />}>Browse every <strong className="text-ink">department</strong> in the library.</Feature>
            <Feature icon={<Lock size={12} />}><strong className="text-ink">Adding users unlocks with a subscription.</strong> Subscribe to at least one department before adding faculty, researchers or students.</Feature>
            <Feature icon={<Timer size={12} />}><strong className="text-ink">{sessionMin}-minute sessions</strong>, up to {SESSIONS_PER_DAY} times a day.</Feature>
            <Feature icon={<Clock size={12} />}><strong className="text-ink">{holdH}-hour gap</strong> between sessions.</Feature>
            <Feature icon={<RefreshCw size={12} />}>Collect faculty feedback before you decide.</Feature>
          </ul>
        </article>

        <article className={`card overflow-hidden border-2 ${premium ? '!border-accent' : '!border-accent/60'}`}>
          <div className="border-b border-rule bg-accent-soft/40 px-5 pb-4 pt-5">
            <span className="badge bg-navy text-white">
              {premium ? 'Current access' : 'Upgrade'}
            </span>
            <h3 className="type-card-title mt-2.5 text-ink">Premium Institutional Subscription</h3>
            <p className="mt-1 text-lg font-bold text-accent">Starting from {FROM_PRICE}</p>
            <p className="mt-1 text-[13px] text-muted">Full access with no session clock, your own users, analytics, reports and central control.</p>
          </div>
          <ul className="px-5 py-3">
            <Feature icon={<Check size={12} />}><strong className="text-ink">Full subscribed content</strong> for the departments you choose.</Feature>
            <Feature icon={<InfinityIcon size={12} />}><strong className="text-ink">No {sessionMin}-minute session limit</strong> and no waiting period.</Feature>
            <Feature icon={<UserPlus size={12} />}><strong className="text-ink">Up to {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users</strong> — faculty, researchers or students, at no extra charge. Need more? Contact us.</Feature>
            <Feature icon={<ShieldCheck size={12} />}><strong className="text-ink">User Management</strong> — add, remove, suspend or restore access.</Feature>
            <Feature icon={<BarChart3 size={12} />}><strong className="text-ink">Live usage analytics</strong> — who used the platform, when and how much.</Feature>
            <Feature icon={<FileBarChart size={12} />}><strong className="text-ink">Statistical reports</strong>, reading timeline and most-read content.</Feature>
            {!premium && (
              <li className="pt-3">
                <button type="button" onClick={subscribe} className={btnPrimary}>Subscribe from {FROM_PRICE} <ArrowRight size={16} aria-hidden="true" /></button>
              </li>
            )}
          </ul>
        </article>
      </div>

      {!premium && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-accent-soft/50 p-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink">Start with the department subscription. Add your people at no extra charge.</h3>
            <p className="mt-0.5 text-[13px] text-muted">Up to 1,000 users are included; contact us for more.</p>
          </div>
          <button type="button" onClick={subscribe} className={btnPrimary}>Subscribe from {FROM_PRICE} <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      )}

      {/* Benefits */}
      <section className="card card-pad">
        <h2 className="type-section text-ink">Premium Institutional Benefits</h2>
        <p className="mt-1 text-[13px] text-muted">Beyond the preview: full subscribed access, unrestricted reading and institutional controls for your academic community.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <InfinityIcon size={16} />, t: 'Full Subscribed Access', d: `No ${sessionMin}-minute session limit or waiting period in your departments.` },
            { icon: <Users size={16} />, t: 'User Management', d: 'Add, remove, suspend or restore your institution\'s users.' },
            { icon: <BarChart3 size={16} />, t: 'Live Analytics', d: 'Active readers, usage timing, engagement and reading activity.' },
            { icon: <Layers size={16} />, t: 'Reports & Live Sync', d: 'Statistical reports from continuously updated usage data.' },
          ].map((b) => (
            <div key={b.t} className="rounded-lg border border-rule bg-surface-2/50 p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">{b.icon}</span>
              <h3 className="mt-3 text-sm font-semibold text-ink">{b.t}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{b.d}</p>
            </div>
          ))}
        </div>
        {!premium && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-accent-soft/40 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Premium Institutional Subscription starts from {FROM_PRICE}</p>
              <p className="mt-0.5 text-[13px] text-muted">Choose your departments first. Additional users can be added later, only when your institution needs them.</p>
              <p className="mt-1 text-xs text-muted">{footnote}</p>
            </div>
            <button type="button" onClick={subscribe} className={btnPrimary}>Subscribe from {FROM_PRICE} <ArrowRight size={16} aria-hidden="true" /></button>
          </div>
        )}
      </section>

      <SubscriptionRecords />
    </div>
  );
}
