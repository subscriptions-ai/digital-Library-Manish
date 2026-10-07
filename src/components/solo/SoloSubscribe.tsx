import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Check, Clock, Download, Loader2, Search, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { DOMAINS, isSoloAccount } from '../../constants';
import { formatRupees } from '../../lib/institutionPricing';
import {
  SOLO_RATE_BULK, SOLO_RATE_STANDARD, SOLO_BULK_THRESHOLD, SOLO_FOUR_DEPT_MESSAGE,
  calculateSoloSubscriptionPrice, type SoloPrice,
} from '../../lib/soloPricing';
import { fetchSoloPlan, fetchSoloQuote, payForSoloSubscription, SOLO_PLAN_CHANGED, type SoloPlan } from './soloPlanApi';
import { downloadSoloQuotation } from './soloQuotationPdf';
import { Dialog, PageHeader, Skeleton } from '../ui';
import { AnnualPricingBlock } from '../pricing/AnnualPricingBlock';
import { PRICE_LABELS, getSoloPricingDisplay } from '../../lib/pricingDisplay';

/**
 * Choose Your Subscription — what a Solo Learner sees right after registering, and whenever they
 * come back to Subscription.
 *
 * Free is the clock they already have. Premium is departments, by the year, priced here from
 * soloPricing.ts. Nothing on this page reads the institution rate card.
 */

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Asks the server for its price whenever the selection settles, and keeps the answer only if it still matches. */
function useServerQuote(key: string | null, departments: string[]) {
  const [quote, setQuote] = useState<{ key: string; price?: SoloPrice; error?: string } | null>(null);
  useEffect(() => {
    if (!key) { setQuote(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await fetchSoloQuote(departments);
      if (live) setQuote({ key, price: r.quote?.price, error: r.error });
    }, 300);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return quote && quote.key === key ? quote : null;
}

export function SoloSubscribe() {
  const { profile } = useAuth() as any;
  const navigate = useNavigate();
  const [plan, setPlan] = useState<SoloPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<'premium' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSoloAccount(profile)) return;
    let live = true;
    setLoaded(false);
    fetchSoloPlan().then((p) => { if (live) { setPlan(p); setLoaded(true); } });
    return () => { live = false; };
  }, [profile?.uid, attempt]);

  const held = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of plan?.departments || []) {
      const prev = m.get(d.name);
      if (!prev || new Date(d.endDate) > new Date(prev)) m.set(d.name, d.endDate);
    }
    return m;
  }, [plan]);

  const state = plan?.state || profile?.state;
  const count = selected.length;
  const preview = count ? calculateSoloSubscriptionPrice(count, { state }) : null;
  const key = count ? [...selected].sort().join('|') : null;
  const server = useServerQuote(key, selected);
  const price = server?.price ?? preview;

  const all = plan?.allDepartments?.length ? plan.allDepartments : DOMAINS.map((d) => d.name);
  const visible = all.filter((d) => d.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  const download = () => {
    if (!price) { toast.error('Choose at least one department.'); return; }
    downloadSoloQuotation({ name: profile?.displayName, email: profile?.email, state, departments: selected, price });
  };

  const pay = async () => {
    if (!count) { toast.error('Choose at least one department.'); return; }
    if (server?.error) { toast.error(server.error); return; }
    setPaying(true);
    const r = await payForSoloSubscription(selected, {
      name: profile?.displayName, email: profile?.email,
      description: `${count} department${count > 1 ? 's' : ''}, 12 months`,
    });
    setPaying(false);
    if (r.status === 'paid') {
      toast.success(`Your Premium Subscription is active${r.endDate ? ` until ${shortDate(r.endDate)}` : ''}.`);
      window.dispatchEvent(new Event(SOLO_PLAN_CHANGED));
      navigate('/dashboard');
    } else if (r.status === 'failed') {
      toast.error(r.error);
    }
  };

  const continueFree = () => navigate('/dashboard');

  // Only a Solo Learner buys here. Anyone else goes to the page they have always had.
  if (profile && !isSoloAccount(profile)) return <Navigate to="/dashboard/pro" replace />;

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
  const gstBase = PRICE_LABELS.gst(soloPricing.gstPercent);
  const gstLabel = !price ? gstBase
    : price.gstSplit === 'cgst-sgst' ? `${gstBase} (CGST + SGST)`
    : price.gstSplit === 'igst' ? `${gstBase} (IGST)` : gstBase;

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
            Choose Departments
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

      <Dialog
        open={choice === 'premium' && !plan?.wholeLibrary}
        onClose={() => setChoice(null)}
        size="lg"
        title="Premium Subscription"
        description="Choose the departments you want full, unlimited access to for twelve months."
        footer={<>
          <button type="button" onClick={continueFree} className="btn btn-ghost">Continue with Free Subscription</button>
          <button type="button" onClick={download} disabled={!count} className="btn btn-outline"><Download size={16} aria-hidden="true" /> Download Quotation</button>
          <button type="button" onClick={pay} disabled={!count || paying || !!server?.error} aria-busy={paying || undefined} className="btn btn-primary">
            {paying && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Proceed to Payment
          </button>
        </>}
      >
        <div className="flex items-center justify-between">
          <label htmlFor="solo-dept-search" className="field-label">Select departments</label>
          <span className="text-xs text-muted" aria-live="polite">{count} selected</span>
        </div>
        <div className="mt-2 overflow-hidden rounded-lg border border-rule">
          <div className="relative border-b border-rule">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input id="solo-dept-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search department…"
              className="h-10 w-full bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-faint focus-visible:bg-surface-2" />
          </div>
          <ul className="max-h-60 overflow-y-auto p-1.5">
            {visible.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-muted">No department matches.</li>}
            {visible.map((name) => {
              const until = held.get(name);
              const on = selected.includes(name);
              return (
                <li key={name}>
                  <label className={`flex flex-wrap items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${until ? 'cursor-default text-muted' : 'cursor-pointer text-ink hover:bg-surface-2'}`}>
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--accent)]" checked={!!until || on} disabled={!!until}
                      onChange={() => toggle(name)} />
                    <span className="min-w-0 flex-1">{name}</span>
                    {until && <span className="badge badge-success">Active until {shortDate(until)}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-rule bg-surface-2 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-muted">{count ? selected.join(', ') : 'No department selected.'}</span>
            {count > 0 && <button type="button" onClick={() => setSelected([])} className="shrink-0 text-xs font-semibold text-accent hover:underline">Clear</button>}
          </div>
        </div>

        {/* The price list, always: how much it costs does not wait for a selection. */}
        <AnnualPricingBlock
          className="mt-4"
          pricing={soloPricing}
          count={count}
          applied={count ? `${count} department${count === 1 ? '' : 's'} selected.` : 'No new departments selected.'}
        />

        {preview && preview.toUnlockBulk > 0 && (
          <p role="status" className="mt-3 rounded-lg border border-caution/40 bg-caution-soft px-4 py-2.5 text-[13px] font-semibold text-ink-2">
            {SOLO_FOUR_DEPT_MESSAGE}
          </p>
        )}

        {price && (
          <div className="mt-4 rounded-xl bg-navy p-4 on-dark sm:p-5" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider on-dark-2">{PRICE_LABELS.product}</p>
              {price.bulkApplied ? (
                <span className="inline-flex flex-col items-end text-right">
                  <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-navy">Best Value</span>
                  <span className="mt-1 text-[11px] font-semibold on-dark-2">{PRICE_LABELS.bulkRate(SOLO_BULK_THRESHOLD)} Applied</span>
                </span>
              ) : (
                <p className="text-[11px] font-semibold uppercase tracking-wider on-dark-2">
                  {!server ? <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Confirming</span> : 'Confirmed price'}
                </p>
              )}
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="on-dark-2">Selected Departments</dt><dd className="tnum font-semibold">{price.count}</dd></div>
              <div className="flex justify-between gap-4"><dt className="on-dark-2">{PRICE_LABELS.perDepartment}</dt><dd className="tnum font-semibold">{formatRupees(price.rate)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="on-dark-2">{PRICE_LABELS.subtotal}</dt><dd className="tnum font-semibold">{formatRupees(price.subtotal)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="on-dark-2">{gstLabel}</dt><dd className="tnum font-semibold">{formatRupees(price.gst, 2)}</dd></div>
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t on-dark-edge pt-3">
                <dt className="font-semibold">{PRICE_LABELS.grandTotal}</dt>
                <dd className="tnum text-[28px] font-bold leading-none">{formatRupees(price.total, 2)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs on-dark-2">{price.count} × {formatRupees(price.rate)} = {formatRupees(price.subtotal)} + GST</p>
          </div>
        )}
        {server?.error && <p role="alert" className="mt-3 text-[13px] font-semibold text-alarm">{server.error}</p>}

        <p className="mt-3 text-xs text-muted">
          The price is confirmed again when you pay. Twelve months of access to the departments you choose, from the day you subscribe.
        </p>
      </Dialog>
    </div>
  );
}
