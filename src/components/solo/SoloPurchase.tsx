import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { CheckCircle2, Download, Loader2, RotateCw, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { DOMAINS } from '../../constants';
import { formatRupees } from '../../lib/institutionPricing';
import {
  SOLO_BULK_THRESHOLD, SOLO_FOUR_DEPT_MESSAGE, calculateSoloSubscriptionPrice, type SoloPrice,
} from '../../lib/soloPricing';
import { fetchSoloQuote, payForSoloSubscription, requestSoloQuotation, SOLO_PLAN_CHANGED, type SoloPlan } from './soloPlanApi';
import { soloPlanToRender } from '../../lib/quotation/quotationModel';
import { downloadQuotationPdf } from '../../lib/quotation/quotationPdf';
import { Dialog } from '../ui';
import { AnnualPricingBlock } from '../pricing/AnnualPricingBlock';
import { PRICE_LABELS, getSoloPricingDisplay } from '../../lib/pricingDisplay';

/**
 * Choose departments, see the price, download the quotation or pay — the one purchase window for
 * an individual's Premium Subscription, used wherever that purchase can start (the Subscription
 * page and the page a new Solo Learner lands on).
 *
 * Prices come from soloPricing.ts and are asked of the server again whenever the selection
 * settles and once more when the order is made; nothing here reads the institution rate card.
 * A payment that does not go through keeps the selection, so it can be retried as it was.
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

type Outcome =
  | { phase: 'choose' }
  | { phase: 'failed'; reason?: string }
  | { phase: 'paid'; count: number; endDate?: string };

export function SoloPurchaseDialog({ open, onClose, plan, onPaid }: {
  open: boolean;
  onClose: () => void;
  plan: SoloPlan;
  /** Called once a payment has gone through, so the page behind can read its subscription again. */
  onPaid?: () => void;
}) {
  const { profile } = useAuth() as any;
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ phase: 'choose' });

  // Each time the window is opened it starts fresh — except that a failed payment is retried
  // from where it was, which only happens without closing it.
  useEffect(() => {
    if (open) { setOutcome({ phase: 'choose' }); setQ(''); }
  }, [open]);

  const held = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of plan.departments || []) {
      const prev = m.get(d.name);
      if (!prev || new Date(d.endDate) > new Date(prev)) m.set(d.name, d.endDate);
    }
    return m;
  }, [plan]);

  const state = plan.state || profile?.state;
  const count = selected.length;
  const preview = count ? calculateSoloSubscriptionPrice(count, { state }) : null;
  const key = count ? [...selected].sort().join('|') : null;
  const server = useServerQuote(key, selected);
  const price = server?.price ?? preview;

  const all = plan.allDepartments?.length ? plan.allDepartments : DOMAINS.map((d) => d.name);
  const visible = all.filter((d) => d.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  const [quoting, setQuoting] = useState(false);
  // The quotation is the server's: priced there, stored, and the PDF is drawn from that record.
  const download = async () => {
    if (!count) { toast.error('Choose at least one department.'); return; }
    setQuoting(true);
    const r = await requestSoloQuotation(selected);
    if (!r.quotation) { setQuoting(false); toast.error(r.error || 'Could not prepare the quotation.'); return; }
    try {
      await downloadQuotationPdf(soloPlanToRender(r.quotation), 'STM_Digital_Library_Solo_Subscription_Quotation.pdf');
    } catch {
      toast.error('Could not create the PDF.');
    }
    setQuoting(false);
  };

  const pay = async () => {
    if (!count) { toast.error('Choose at least one department.'); return; }
    if (server?.error) { toast.error(server.error); return; }
    setPaying(true);
    const r = await payForSoloSubscription(selected, {
      name: profile?.displayName, email: profile?.email, contact: profile?.contact || profile?.whatsapp,
      description: `${count} department${count > 1 ? 's' : ''}, 12 months`,
    });
    setPaying(false);
    if (r.status === 'paid') {
      setOutcome({ phase: 'paid', count, endDate: r.endDate });
      setSelected([]);
      window.dispatchEvent(new Event(SOLO_PLAN_CHANGED));
      onPaid?.();
    } else {
      // Closed without paying, or the payment did not go through: the selection is kept.
      setOutcome({ phase: 'failed', reason: r.status === 'failed' ? r.error : undefined });
    }
  };

  const soloPricing = getSoloPricingDisplay();
  const gstBase = PRICE_LABELS.gst(soloPricing.gstPercent);
  const gstLabel = !price ? gstBase
    : price.gstSplit === 'cgst-sgst' ? `${gstBase} (CGST + SGST)`
    : price.gstSplit === 'igst' ? `${gstBase} (IGST)` : gstBase;

  if (outcome.phase === 'paid') {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        size="sm"
        title="Premium Subscription Active"
        footer={<>
          <button type="button" onClick={onClose} className="btn btn-ghost">Back to Subscription</button>
          <button type="button" onClick={() => { onClose(); navigate('/dashboard/library'); }} className="btn btn-primary">Explore Library</button>
        </>}
      >
        <div className="flex flex-col items-center py-2 text-center" role="status">
          <CheckCircle2 size={40} className="text-accent" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-ink">
            {outcome.count} department{outcome.count === 1 ? '' : 's'} subscribed
          </p>
          {outcome.endDate && <p className="mt-1 text-sm text-muted">Valid until {shortDate(outcome.endDate)}</p>}
        </div>
      </Dialog>
    );
  }

  const failed = outcome.phase === 'failed';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Premium Subscription"
      description="Choose the departments you want full, unlimited access to for twelve months."
      footer={<>
        <button type="button" onClick={onClose} className="btn btn-ghost">{failed ? 'Back to Subscription' : 'Cancel'}</button>
        <button type="button" onClick={download} disabled={!count || quoting} aria-busy={quoting || undefined} className="btn btn-outline">
          {quoting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Download Quotation
        </button>
        <button type="button" onClick={pay} disabled={!count || paying || !!server?.error} aria-busy={paying || undefined} className="btn btn-primary">
          {paying ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : failed ? <RotateCw size={16} aria-hidden="true" /> : null}
          {failed ? 'Retry Payment' : 'Proceed to Payment'}
        </button>
      </>}
    >
      {failed && (
        <div role="alert" className="mb-4 rounded-lg border border-caution bg-caution-soft px-4 py-3 text-sm text-ink-2">
          <p className="font-semibold text-ink">Payment was not completed.</p>
          <p className="mt-0.5">
            {outcome.reason ? `${outcome.reason} ` : ''}Your departments are still selected below — retry, or download the quotation.
          </p>
        </div>
      )}

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
  );
}
