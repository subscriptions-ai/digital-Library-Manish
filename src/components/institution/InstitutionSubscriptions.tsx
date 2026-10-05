import React, { useEffect, useState } from 'react';
import {
  ArrowRight, BarChart3, Check, Clock, FileBarChart, Infinity as InfinityIcon, Layers, Loader2, Lock,
  RefreshCw, ShieldCheck, Timer, UserPlus, Users,
} from 'lucide-react';
import {
  DEPARTMENT_RATES, GST_RATE, MAX_INSTITUTION_USERS, STARTING_DEPARTMENT_RATE, TERM_MONTHS, formatRupees,
} from '../../lib/institutionPricing';
import { SESSION_MS, SESSIONS_PER_DAY, HOLD_MS } from '../../lib/freeAllowance';
import { usePricing } from './pricing/PricingContext';
import { FROM_PRICE, seatsLabel, uniqueDepartments } from './pricing/PlanWidgets';

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

const btnPrimary = 'inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover';
const btnSoft = 'inline-flex items-center gap-2 rounded-xl border border-rule bg-accent-soft px-4 py-2.5 text-[13px] font-semibold text-accent transition-colors hover:border-accent';

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[26px_1fr] gap-2.5 border-b border-rule py-2.5 text-[13px] leading-relaxed text-ink-2 last:border-b-0">
      <span className="mt-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</span>
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
    <section className="rounded-2xl border border-rule bg-surface p-5">
      <h2 className="font-serif text-[19px] font-medium text-ink">Subscription records</h2>
      <p className="mt-1 text-[12.5px] text-muted">Every subscription on your institution's account, current and past.</p>
      <ul className="mt-3 divide-y divide-rule">
        {subs.map((sub) => {
          const d = domainsOf(sub);
          const active = sub.status === 'Active' && new Date(sub.endDate) > new Date();
          return (
            <li key={sub.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{sub.planName || 'Institution plan'}</p>
                <p className="text-[12px] text-muted">
                  {shortDate(sub.startDate)} → {shortDate(sub.endDate)} · {d.length ? (d.length > 3 ? `${d.length} departments` : d.join(', ')) : 'All departments'}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
                {active ? 'Active' : sub.status === 'Active' ? 'Ended' : sub.status}
              </span>
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
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-faint" size={26} /></div>;
  }
  if (!plan) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">Subscription unavailable</h1>
        <p className="mt-2 text-sm text-muted">Only your institution's librarian account can see and change its subscription.</p>
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
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <div>
        <span className="rounded-full border border-rule bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
          Subscriptions
        </span>
        <h1 className="mt-2 font-serif text-[28px] font-medium tracking-tight text-ink">Premium Subscription</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Review what Premium includes, choose your departments, and manage user access from one place.
        </p>
      </div>

      {!premium && (
        <section className="rounded-2xl bg-gradient-to-br from-[#10263a] to-[#17324d] p-7 shadow-lg on-dark">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#9fe7e8]">Your institution has explored the platform</p>
          <h2 className="mt-2 max-w-3xl font-serif text-[30px] font-medium leading-tight">
            Ready to move from preview to full institutional access?
          </h2>
          <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed on-dark-2">
            Remove session limits, unlock full subscribed content, add your faculty, researchers and students, and follow
            institutional usage through live analytics, user controls and statistical reports. Choose your departments
            first — up to {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users come with it, at no extra charge.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button onClick={subscribe} className="inline-flex items-center gap-2 rounded-xl bg-[#72d8df] px-4 py-2.5 text-[13px] font-bold text-[#17324d] hover:bg-[#8be2e8]">
              Subscribe from {FROM_PRICE} <ArrowRight size={15} />
            </button>
            <a href="mailto:info@celnet.in?subject=Premium%20institutional%20subscription"
              className="inline-flex items-center gap-2 rounded-xl border on-dark-edge on-dark-fill px-4 py-2.5 text-[13px] font-semibold">
              Talk to Our Team
            </a>
          </div>
          <p className="mt-3 text-[11.5px] on-dark-3">{footnote}</p>
        </section>
      )}

      {/* Current plan */}
      <section className="rounded-2xl border border-rule bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-[21px] font-medium text-ink">
              {premium ? 'Premium Institutional Subscription' : 'Free Institutional Preview'}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {premium
                ? 'Full subscribed access is active for the departments below.'
                : 'You can evaluate the platform with timed sessions. Subscribe to departments when you are ready for full access.'}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider ${premium ? 'bg-accent-soft text-accent' : 'bg-caution-soft text-caution'}`}>
            {premium ? 'Premium active' : 'Free preview'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-rule p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Department subscription</p>
            <p className="mt-1 text-[15px] font-semibold text-ink">
              {departments.length
                ? `${departments.length} department${departments.length === 1 ? '' : 's'} active`
                : premium ? 'Institutional plan active' : 'No Premium departments yet'}
            </p>
            {departments.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {departments.map((name) => (
                  <li key={name} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="flex items-center gap-1.5 text-ink-2"><Check size={13} className="text-accent" /> {name}</span>
                    <span className="text-muted">until {shortDate(endOf(name))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-rule p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Full-access users</p>
            {plan.unlimitedSeats ? (
              <>
                <p className="mt-1 text-[15px] font-semibold text-ink">Unlimited users (current plan)</p>
                <p className="mt-1 text-[12.5px] text-muted">
                  {plan.seats.used} in use. Your plan has no cap on users until it is renewed.
                </p>
              </>
            ) : (
              <>
                <p className="tnum mt-1 text-[15px] font-semibold text-ink">
                  {premium ? `${seatsLabel(plan)} users` : `Up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users with a subscription`}
                </p>
                <p className="mt-1 text-[12.5px] text-muted">
                  {premium
                    ? `No charge per user, up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')}. You count as one.`
                    : 'Users are not charged for. Subscribe to at least one department to add them.'}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={subscribe} className={btnPrimary}>
            {premium ? <>Add departments <ArrowRight size={15} /></> : <>Subscribe from {FROM_PRICE} <ArrowRight size={15} /></>}
          </button>
          {!plan.unlimitedSeats && premium && (
            <button onClick={() => pricing.openUserLimit()} className={btnSoft}><Users size={15} /> Need more than {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users?</button>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-caution/40 bg-caution-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-2">
          Departments are priced by the year, and users are not charged for: up to {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} per
          institution. Every purchase runs {TERM_MONTHS} months from the day it is bought, and
          the amount payable is shown before payment.{' '}
          <button onClick={pricing.openTerms} className="font-semibold text-accent underline underline-offset-2">View pricing terms</button>
        </div>
      </section>

      {/* Free beside Premium */}
      <div className="grid gap-4 md:grid-cols-2">
        <article className={`overflow-hidden rounded-2xl border bg-surface ${!premium ? 'border-accent' : 'border-rule'}`}>
          <div className="border-b border-rule px-5 pb-4 pt-5">
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
              {premium ? 'Preview' : 'Current access'}
            </span>
            <h3 className="mt-2.5 font-serif text-[20px] font-medium text-ink">Free Institutional Preview</h3>
            <p className="mt-1 text-[12.5px] text-muted">A working preview so your faculty and researchers can try the platform before subscribing.</p>
          </div>
          <ul className="px-5 py-3">
            <Feature icon={<Check size={12} />}>Browse every <strong className="text-ink">department</strong> in the library.</Feature>
            <Feature icon={<Lock size={12} />}><strong className="text-ink">Adding users unlocks with a subscription.</strong> Subscribe to at least one department before adding faculty, researchers or students.</Feature>
            <Feature icon={<Timer size={12} />}><strong className="text-ink">{sessionMin}-minute sessions</strong>, up to {SESSIONS_PER_DAY} times a day.</Feature>
            <Feature icon={<Clock size={12} />}><strong className="text-ink">{holdH}-hour gap</strong> between sessions.</Feature>
            <Feature icon={<RefreshCw size={12} />}>Collect faculty feedback before you decide.</Feature>
          </ul>
        </article>

        <article className={`overflow-hidden rounded-2xl border-2 bg-surface ${premium ? 'border-accent' : 'border-accent/60'}`}>
          <div className="border-b border-rule bg-accent-soft/40 px-5 pb-4 pt-5">
            <span className="rounded-full bg-[#17324d] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {premium ? 'Current access' : 'Upgrade'}
            </span>
            <h3 className="mt-2.5 font-serif text-[20px] font-medium text-ink">Premium Institutional Subscription</h3>
            <p className="mt-1 text-[18px] font-bold text-accent">Starting from {FROM_PRICE}</p>
            <p className="mt-1 text-[12.5px] text-muted">Full access with no session clock, your own users, analytics, reports and central control.</p>
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
                <button onClick={subscribe} className={btnPrimary}>Subscribe from {FROM_PRICE} <ArrowRight size={15} /></button>
              </li>
            )}
          </ul>
        </article>
      </div>

      {!premium && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-accent-soft/50 p-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Start with the department subscription. Add your people at no extra charge.</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">Up to 1,000 users are included; contact us for more.</p>
          </div>
          <button onClick={subscribe} className={btnPrimary}>Subscribe from {FROM_PRICE} <ArrowRight size={15} /></button>
        </div>
      )}

      {/* Benefits */}
      <section className="rounded-2xl border border-rule bg-surface p-5">
        <h2 className="font-serif text-[20px] font-medium text-ink">Premium Institutional Benefits</h2>
        <p className="mt-1 text-[12.5px] text-muted">Beyond the preview: full subscribed access, unrestricted reading and institutional controls for your academic community.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <InfinityIcon size={16} />, t: 'Full Subscribed Access', d: `No ${sessionMin}-minute session limit or waiting period in your departments.` },
            { icon: <Users size={16} />, t: 'User Management', d: 'Add, remove, suspend or restore your institution\'s users.' },
            { icon: <BarChart3 size={16} />, t: 'Live Analytics', d: 'Active readers, usage timing, engagement and reading activity.' },
            { icon: <Layers size={16} />, t: 'Reports & Live Sync', d: 'Statistical reports from continuously updated usage data.' },
          ].map((b) => (
            <div key={b.t} className="rounded-xl border border-rule bg-surface-2/50 p-3.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">{b.icon}</span>
              <h3 className="mt-2.5 text-[13.5px] font-semibold text-ink">{b.t}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{b.d}</p>
            </div>
          ))}
        </div>
        {!premium && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-accent-soft/40 p-3.5">
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Premium Institutional Subscription starts from {FROM_PRICE}</p>
              <p className="mt-0.5 text-[12px] text-muted">Choose your departments first. Additional users can be added later, only when your institution needs them.</p>
              <p className="mt-1 text-[11px] text-caution">{footnote}</p>
            </div>
            <button onClick={subscribe} className={btnPrimary}>Subscribe from {FROM_PRICE} <ArrowRight size={15} /></button>
          </div>
        )}
      </section>

      <SubscriptionRecords />
    </div>
  );
}
