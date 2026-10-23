import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Download, Loader2, Lock, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  DEPARTMENT_RATES, GST_RATE, TERM_MONTHS,
  departmentRate, formatRupees,
} from '../../../lib/institutionPricing';
import { COMPANY_DETAILS } from '../../../config';
import { fetchQuote, payForPurchase, requestQuotation, type InstitutionPlan, type Quote, type ServerPrice } from './planApi';
import { institutionPlanToRender } from '../../../lib/quotation/quotationModel';
import { downloadQuotationPdf } from '../../../lib/quotation/quotationPdf';
import { AnnualPricingBlock } from '../../pricing/AnnualPricingBlock';
import { DepartmentGroupPicker } from '../../pricing/DepartmentGroupPicker';
import { PRICE_LABELS, getInstitutionPricingDisplay } from '../../../lib/pricingDisplay';

const gstPct = Math.round(GST_RATE * 100);
const round2 = (v: number) => Math.round(v * 100) / 100;
const shortDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "1 dept ₹9,990; 2 depts ₹9,490 each; … 5+ depts ₹7,990 each", from the price list itself. */
export function departmentRateLine(): string {
  const tiers = [...DEPARTMENT_RATES].sort((a, b) => a.minDepartments - b.minDepartments);
  return tiers.map((t, i) => {
    const last = i === tiers.length - 1;
    const label = `${t.minDepartments}${last ? '+' : ''} dept${t.minDepartments > 1 || last ? 's' : ''}`;
    return `${label} ${formatRupees(t.rate)}${t.minDepartments > 1 ? ' each' : ''}`;
  }).join('; ');
}

// Above the shared Dialog (z-110): the user-limit window can open on top of the
// Add User dialog, which stays open so the form can be sent again.
function ModalShell({ title, subtitle, onClose, children, footer, wide = false, z = 'z-[120]' }: {
  title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode;
  footer?: React.ReactNode; wide?: boolean; z?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }}
        className={`dialog-panel overflow-hidden ${wide ? 'max-w-2xl' : 'max-w-xl'}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm leading-snug text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost btn-sm btn-icon -mr-2 shrink-0">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-rule bg-surface-2 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end sm:px-6">{footer}</div>}
      </motion.div>
    </div>
  );
}

/** The dark price panel: the total, how it was reached, and its three parts. */
function PriceBox({ eyebrow, price, equation, metrics, pending }: {
  eyebrow: string; price: ServerPrice; equation: string;
  metrics: [string, string][]; pending: boolean;
}) {
  return (
    <div className="mt-4 rounded-xl bg-navy p-4 on-dark sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider on-dark-2">{eyebrow}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider on-dark-2">
          {pending ? <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Confirming</span> : 'Confirmed price'}
        </p>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider on-dark-2">{PRICE_LABELS.grandTotal}</p>
      <p className="tnum mt-0.5 text-[28px] font-bold leading-none">{formatRupees(price.total, 2)}</p>
      <p className="mt-2 text-xs on-dark-2">{equation}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([k, v]) => (
          <div key={k} className="rounded-lg border on-dark-edge on-dark-fill px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider on-dark-2">{k}</p>
            <p className="tnum mt-0.5 text-[13px] font-semibold">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Disclaimer({ children, onTerms, link = 'View full pricing terms' }: { children: React.ReactNode; onTerms: () => void; link?: string }) {
  return (
    <div className="mt-3 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-[13px] leading-relaxed text-ink-2">
      {children}{' '}
      <button type="button" onClick={onTerms} className="font-semibold text-accent underline underline-offset-2">{link}</button>
    </div>
  );
}

const btnGhost = 'btn btn-outline';
const btnPrimary = 'btn btn-primary';

/** Asks the server for its price whenever the request settles, and keeps the answer only if it still matches. */
function useServerQuote(key: string | null, body: () => Parameters<typeof fetchQuote>[0]) {
  const [quote, setQuote] = useState<{ key: string; quote?: Quote; error?: string } | null>(null);
  useEffect(() => {
    if (!key) { setQuote(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await fetchQuote(body());
      if (live) setQuote({ key, ...r });
    }, 300);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return quote && quote.key === key ? quote : null;
}

function institutionName(profile: any): string | undefined {
  return profile?.institutionProfile?.name || profile?.organization || undefined;
}

/* ─────────────────────────────── Departments ─────────────────────────────── */

export function DepartmentModal({ plan, onClose, onTerms, onPurchased }: {
  plan: InstitutionPlan; onClose: () => void; onTerms: () => void; onPurchased: () => void;
}) {
  const { profile } = useAuth() as any;
  const held = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of plan.departments) {
      const prev = m.get(d.name);
      if (!prev || new Date(d.endDate) > new Date(prev)) m.set(d.name, d.endDate);
    }
    return m;
  }, [plan.departments]);

  const [selected, setSelected] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);

  // Departments already held are shown ticked and fixed, with when they run until.
  const lockedNotes = useMemo(() => {
    const m = new Map<string, string>();
    for (const [name, end] of held) m.set(name, `Active until ${shortDate(end)}`);
    return m;
  }, [held]);

  const count = selected.length;
  const totalAfter = held.size + count;
  const institutionPricing = useMemo(() => getInstitutionPricingDisplay(), []);

  // The live preview: the rate is the one for the institution's total after this purchase.
  const preview: ServerPrice | null = count ? (() => {
    const rate = departmentRate(totalAfter);
    const base = count * rate;
    const gst = round2(base * GST_RATE);
    return { quantity: count, rate, base, gst, total: round2(base + gst) };
  })() : null;

  const key = count ? [...selected].sort().join('|') : null;
  const server = useServerQuote(key, () => ({ kind: 'departments', departments: selected }));
  const price = server?.quote?.price ?? preview;

  const [quoting, setQuoting] = useState(false);
  // The quotation is the server's: it prices the purchase against what the institution already
  // holds, stores it, and the PDF is drawn from that record — not from this screen's preview.
  const download = async () => {
    if (!count) { toast.error('Choose at least one department.'); return; }
    setQuoting(true);
    const r = await requestQuotation({ kind: 'departments', departments: selected });
    if (!r.quotation) { setQuoting(false); toast.error(r.error || 'Could not prepare the quotation.'); return; }
    try {
      await downloadQuotationPdf(institutionPlanToRender(r.quotation), 'STM_Digital_Library_Department_Quotation.pdf');
    } catch {
      toast.error('Could not create the PDF.');
    }
    setQuoting(false);
  };

  const pay = async () => {
    if (!count) { toast.error('Choose at least one department.'); return; }
    if (server?.error) { toast.error(server.error); return; }
    setPaying(true);
    const r = await payForPurchase(
      { kind: 'departments', departments: selected },
      { name: profile?.displayName, email: profile?.email, description: `${count} department${count > 1 ? 's' : ''}, ${TERM_MONTHS} months` },
    );
    setPaying(false);
    if (r.status === 'paid') {
      toast.success(`Premium access is active${r.endDate ? ` until ${shortDate(r.endDate)}` : ''}.`);
      onPurchased();
    } else if (r.status === 'failed') {
      toast.error(r.error);
    }
  };

  return (
    <ModalShell
      title="Premium Institutional Subscription"
      subtitle="Choose the departments your institution needs for full subscribed access."
      onClose={onClose}
      footer={<>
        <button type="button" onClick={download} disabled={!count || quoting} aria-busy={quoting || undefined} className={btnGhost}>
          {quoting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Download Quotation
        </button>
        <button type="button" onClick={pay} disabled={!count || paying || !!server?.error} aria-busy={paying || undefined} className={btnPrimary}>
          {paying && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Proceed to Payment
        </button>
      </>}
    >
      <DepartmentGroupPicker
        departments={plan.allDepartments}
        selected={selected}
        onChange={setSelected}
        locked={lockedNotes}
      />

      {/* The price list, always: how much it costs does not wait for a selection. The tier that
          applies is marked, counted on the institution's total after this purchase. */}
      <AnnualPricingBlock
        className="mt-4"
        pricing={institutionPricing}
        count={count ? totalAfter : 0}
        applied={count
          ? `${count} department${count === 1 ? '' : 's'} selected${held.size ? ` — rate for ${totalAfter} in total, including the ${held.size} you already hold` : ''}.`
          : 'No new departments selected.'}
      />

      {price && (
        <PriceBox
          eyebrow={PRICE_LABELS.product}
          pending={!server}
          price={price}
          equation={`${price.quantity} × ${formatRupees(price.rate)} = ${formatRupees(price.base)} + GST${held.size ? ` (rate for ${totalAfter} departments in total)` : ''}`}
          metrics={[
            ['Departments', String(price.quantity)],
            [PRICE_LABELS.perDepartment, formatRupees(price.rate)],
            [PRICE_LABELS.subtotal, formatRupees(price.base)],
            [PRICE_LABELS.gst(gstPct), formatRupees(price.gst, 2)],
          ]}
        />
      )}
      {server?.error && <p role="alert" className="mt-3 text-[13px] font-semibold text-alarm">{server.error}</p>}

      <div className="mt-4 rounded-lg border border-rule bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        This purchase gives your institution full access to the selected departments for {TERM_MONTHS} months.{' '}
        Pricing is based on the departments selected.
      </div>
      <Disclaimer onTerms={onTerms}>
        *Department rate: {departmentRateLine()}. {gstPct}% GST extra.
      </Disclaimer>
    </ModalShell>
  );
}

/* ─────────────────────────────── User limit ─────────────────────────────── */

/** Shown when the institution cannot add more users just now: there is no price, only a conversation. */
export function UserLimitModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Add more users"
      subtitle="Your institution cannot add more users at this time."
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className={btnPrimary}>Close</button>}>
      <p className="text-sm leading-relaxed text-ink-2">
        Existing users and library access are not affected. Please contact us and we will help you add more.
      </p>
      <ul className="mt-4 space-y-2 rounded-lg border border-rule bg-surface-2 px-4 py-3 text-[13px] text-ink">
        <li>Email: <a className="font-semibold text-accent underline" href={`mailto:${COMPANY_DETAILS.email}`}>{COMPANY_DETAILS.email}</a></li>
        {COMPANY_DETAILS.tel.map((t: string) => (
          <li key={t}>Phone: <a className="font-semibold text-accent underline" href={`tel:${t.replace(/[^\d+]/g, '')}`}>{t}</a></li>
        ))}
      </ul>
    </ModalShell>
  );
}

/* ─────────────────────────────── Terms ─────────────────────────────── */

/** A numbered heading in the terms. At module level, so it is not a new component on every render. */
function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 mt-4 text-sm font-semibold text-ink first:mt-0">{children}</h3>;
}

export function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Subscription Pricing Terms" subtitle="How department subscriptions are priced."
      onClose={onClose} z="z-[130]" wide
      footer={<button type="button" onClick={onClose} className={btnPrimary}><Check size={16} aria-hidden="true" /> Understood</button>}>
      <div className="text-[13px] leading-relaxed text-ink-2">
        <H>1. Department subscription</H>
        <p>Premium department access is priced per department per year, by how many departments your institution
          holds in total: {departmentRateLine()}. Adding departments later brings the new ones in at the rate for your
          new total. Applicable GST ({gstPct}%) is extra.</p>
        <H>2. Users</H>
        <p>Users are not priced. Subscription pricing is based on the departments selected. You can manage your
          institution's users from the User Management dashboard, and write to {COMPANY_DETAILS.email} with any question.</p>
        <H>3. Term</H>
        <p>Every purchase runs {TERM_MONTHS} months from the day it is paid for.</p>
        <H>4. Members</H>
        <p>Members you add inherit access to the departments your institution has subscribed to, under the same rules as the
          institution. Suspending a member stops their access; restoring them brings it back.</p>
        <H>5. Price before payment</H>
        <p>The rate, GST and total payable are shown before you pay, and the amount shown is the amount charged.
          Usage analytics describe platform activity and are not a measure of anyone's academic performance.</p>
        <p className="mt-4 text-[12px] text-muted">Questions about pricing: info@celnet.in</p>
      </div>
    </ModalShell>
  );
}
