import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Download, Loader2, Lock, Search, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  DEPARTMENT_RATES, GST_RATE, MAX_INSTITUTION_USERS, TERM_MONTHS,
  departmentRate, formatRupees,
} from '../../../lib/institutionPricing';
import { COMPANY_DETAILS } from '../../../config';
import { fetchQuote, payForPurchase, type InstitutionPlan, type Quote, type ServerPrice } from './planApi';
import { downloadQuotation } from './quotationPdf';

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

function ModalShell({ title, subtitle, onClose, children, footer, wide = false, z = 'z-50' }: {
  title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode;
  footer?: React.ReactNode; wide?: boolean; z?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className={`flex max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-xl'} flex-col overflow-hidden rounded-2xl border border-rule bg-surface shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div>
            <h2 className="font-serif text-[20px] font-medium text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[12.5px] leading-snug text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg bg-surface-2 p-1.5 text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-rule bg-surface-2 px-6 py-3.5">{footer}</div>}
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
    <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#14284f] to-[#0b6e72] p-4 on-dark">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10.5px] uppercase tracking-wider on-dark-3">{eyebrow}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider on-dark-3">
          {pending ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Confirming</span> : 'Confirmed price'}
        </p>
      </div>
      <p className="tnum mt-1.5 font-mono text-[28px] font-semibold leading-none">{formatRupees(price.total, 2)}</p>
      <p className="mt-1.5 text-[12px] on-dark-2">{equation}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {metrics.map(([k, v]) => (
          <div key={k} className="rounded-lg border on-dark-edge on-dark-fill px-3 py-2">
            <p className="font-mono text-[9.5px] uppercase tracking-wider on-dark-3">{k}</p>
            <p className="tnum mt-0.5 text-[13px] font-semibold">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Disclaimer({ children, onTerms, link = 'View full pricing terms' }: { children: React.ReactNode; onTerms: () => void; link?: string }) {
  return (
    <div className="mt-3 rounded-xl border border-caution/40 bg-caution-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-2">
      {children}{' '}
      <button type="button" onClick={onTerms} className="font-semibold text-accent underline underline-offset-2">{link}</button>
    </div>
  );
}

const btn = 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50';
const btnGhost = `${btn} border border-rule bg-surface text-ink-2 hover:bg-surface-2`;
const btnPrimary = `${btn} bg-accent text-white hover:bg-accent-hover`;

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

/** The department-rate slab a total of `n` departments falls in, worded as the terms word it. */
function slabLabel(n: number): string {
  const tier = DEPARTMENT_RATES.find((t) => n >= t.minDepartments);
  const min = tier?.minDepartments ?? 1;
  const top = DEPARTMENT_RATES[0].minDepartments;
  return min === top ? `${min}+ departments` : min === 1 ? '1 department' : `${min} departments`;
}
const rsText = (n: number) => `Rs. ${Number(n).toLocaleString('en-IN')}`;

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
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState(false);

  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  const visible = plan.allDepartments.filter((d) => d.toLowerCase().includes(q.trim().toLowerCase()));
  const count = selected.length;
  const totalAfter = held.size + count;

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

  const download = () => {
    if (!price) { toast.error('Choose at least one department.'); return; }
    downloadQuotation({
      institution: institutionName(profile),
      contactName: profile?.displayName, contactEmail: profile?.email,
      customerState: profile?.state || profile?.institutionProfile?.state,
      title: 'Premium Institutional Subscription',
      summary: [
        ['Departments', String(count)],
        ['Subscription period', `${TERM_MONTHS} months`],
      ],
      slabNote: `Applied pricing slab: ${slabLabel(totalAfter)} — ${rsText(price.rate)} per department/year.`,
      lines: selected.map((d) => ({ description: `Department subscription: ${d} (${TERM_MONTHS} months)`, quantity: 1, rate: price.rate })),
      base: price.base, gst: price.gst, total: price.total,
      notes: [
        held.size
          ? `Rate for ${totalAfter} departments in total, including the ${held.size} your institution already subscribes to.`
          : `Department rates: ${departmentRateLine()}.`,
      ],
      fileName: 'STM_Digital_Library_Department_Quotation.pdf',
    });
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
      subtitle={`Choose the departments for full subscribed access. Your institution can add up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users at no extra charge.`}
      onClose={onClose}
      footer={<>
        <button onClick={download} disabled={!count} className={btnGhost}><Download size={15} /> Download Quotation</button>
        <button onClick={pay} disabled={!count || paying || !!server?.error} className={btnPrimary}>
          {paying && <Loader2 size={15} className="animate-spin" />} Proceed to Payment
        </button>
      </>}
    >
      <div className="flex items-center justify-between">
        <label className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Select departments</label>
        <span className="text-[12px] text-muted">{count} selected</span>
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-rule">
        <div className="relative border-b border-rule">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search department…"
            className="w-full bg-surface py-2.5 pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-faint" />
        </div>
        <ul className="max-h-60 overflow-y-auto p-1.5">
          {visible.length === 0 && <li className="px-3 py-4 text-center text-[12.5px] text-faint">No department matches.</li>}
          {visible.map((name) => {
            const until = held.get(name);
            const on = selected.includes(name);
            return (
              <li key={name}>
                <label className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${until ? 'cursor-default text-muted' : 'cursor-pointer text-ink hover:bg-surface-2'}`}>
                  <input type="checkbox" className="accent-[var(--accent)]" checked={!!until || on} disabled={!!until}
                    onChange={() => toggle(name)} />
                  <span className="flex-1">{name}</span>
                  {until && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
                      Active until {shortDate(until)}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-rule bg-surface-2 px-3 py-2">
          <span className="truncate text-[11.5px] text-muted">{count ? selected.join(', ') : 'No department selected.'}</span>
          {count > 0 && <button onClick={() => setSelected([])} className="shrink-0 text-[12px] font-semibold text-accent">Clear</button>}
        </div>
      </div>

      {price && (
        <PriceBox
          eyebrow="Annual department subscription"
          pending={!server}
          price={price}
          equation={`${price.quantity} × ${formatRupees(price.rate)} = ${formatRupees(price.base)} + GST${held.size ? ` (rate for ${totalAfter} departments in total)` : ''}`}
          metrics={[
            ['Departments', String(price.quantity)],
            ['Base before GST', formatRupees(price.base)],
            [`GST @ ${gstPct}%`, formatRupees(price.gst, 2)],
          ]}
        />
      )}
      {server?.error && <p className="mt-3 text-[12.5px] font-semibold text-alarm">{server.error}</p>}

      <div className="mt-4 rounded-xl border border-rule bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-2">
        This purchase gives your institution full access to the selected departments for {TERM_MONTHS} months.{' '}
        Users are not charged for: your institution can have up to {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} of them.
      </div>
      <Disclaimer onTerms={onTerms}>
        *Department rate: {departmentRateLine()}. {gstPct}% GST extra.
      </Disclaimer>
    </ModalShell>
  );
}

/* ─────────────────────────────── User limit ─────────────────────────────── */

/** Shown when an institution has reached its user limit: there is no price, only a conversation. */
export function UserLimitModal({ onClose }: { onClose: () => void }) {
  const limit = MAX_INSTITUTION_USERS.toLocaleString('en-IN');
  return (
    <ModalShell title={`Need more than ${limit} users?`}
      subtitle={`A paid subscription covers up to ${limit} users at no extra charge.`}
      onClose={onClose}
      footer={<button onClick={onClose} className={btnPrimary}>Close</button>}>
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        If your institution needs more than {limit} users, please contact us and we will arrange it with you.
      </p>
      <ul className="mt-4 space-y-2 rounded-xl border border-rule bg-surface-2 px-4 py-3 text-[13px] text-ink">
        <li>Email: <a className="font-semibold text-accent underline" href={`mailto:${COMPANY_DETAILS.email}`}>{COMPANY_DETAILS.email}</a></li>
        {COMPANY_DETAILS.tel.map((t: string) => (
          <li key={t}>Phone: <a className="font-semibold text-accent underline" href={`tel:${t.replace(/[^\d+]/g, '')}`}>{t}</a></li>
        ))}
      </ul>
    </ModalShell>
  );
}

/* ─────────────────────────────── Terms ─────────────────────────────── */

export function TermsModal({ onClose }: { onClose: () => void }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <h3 className="mb-1 mt-4 text-[13.5px] font-semibold text-ink first:mt-0">{children}</h3>
  );
  return (
    <ModalShell title="Subscription Pricing Terms" subtitle="How department subscriptions are priced."
      onClose={onClose} z="z-[60]" wide
      footer={<button onClick={onClose} className={btnPrimary}><Check size={15} /> Understood</button>}>
      <div className="text-[13px] leading-relaxed text-ink-2">
        <H>1. Department subscription</H>
        <p>Premium department access is priced per department per year, by how many departments your institution
          holds in total: {departmentRateLine()}. Adding departments later brings the new ones in at the rate for your
          new total. Applicable GST ({gstPct}%) is extra.</p>
        <H>2. Users</H>
        <p>Users are not charged for. A paid subscription covers up to {MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users in your
          institution, you included. If you need more, please contact us at {COMPANY_DETAILS.email}.</p>
        <H>3. Term</H>
        <p>Every purchase runs {TERM_MONTHS} months from the day it is paid for.</p>
        <H>4. Who counts as a user</H>
        <p>Every active member of your institution, you included, counts towards the limit. Suspending a member frees their place;
          restoring them takes one again.</p>
        <H>5. Price before payment</H>
        <p>The rate, GST and total payable are shown before you pay, and the amount shown is the amount charged.
          Usage analytics describe platform activity and are not a measure of anyone's academic performance.</p>
        <p className="mt-4 text-[12px] text-muted">Questions about pricing: info@celnet.in</p>
      </div>
    </ModalShell>
  );
}
