import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, Inbox, Phone, RefreshCw, Search,
  X, XCircle, ListChecks,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────────────

type Status = 'Pending' | 'Approved' | 'Rejected';
type Tab = Status | '';

interface RequestUser {
  organization?: string | null;
  contact?: string | null;
  whatsapp?: string | null;
  designation?: string | null;
  registrantType?: string | null;
  interestedDomains?: unknown;
}

interface SubscriptionRequest {
  id: string;
  userName: string;
  email: string;
  planType: string;
  durationMonths: number;
  planDescription?: string | null;
  paymentRef?: string | null;
  notes?: string | null;
  status: Status | string;
  rejectionNote?: string | null;
  createdAt?: string;
  user?: RequestUser | null;
}

/** What the page shows for a request, worked out once from the raw record. */
interface Parsed {
  phone: string;
  institution: string;
  userType: string;
  designation: string;
  planTitle: string;
  isDomainRequest: boolean;
  interests: string[];
  sessionsUsed: string;
  inTheirWords: string;
  estTotal: string;
  otherNotes: string[];
}

// ── Reading a request ────────────────────────────────────────────────────────
// Pro applications put their detail in `notes` as "Label: value" lines, and
// public domain requests put theirs in `planDescription` as "A | B: c" segments.
// Both are read here, so the table only ever shows short, clean values.

const NOTE_LABELS = ['Applying for', 'Designation', 'Wants to read', 'Free sessions used so far', 'In their words'];

function parse(r: SubscriptionRequest): Parsed {
  const noteLines = (r.notes || '').split('\n').map(l => l.trim()).filter(Boolean);
  const fromNotes = (label: string) => {
    const line = noteLines.find(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
    return line ? line.slice(label.length + 1).trim() : '';
  };
  const otherNotes = noteLines.filter(l => !NOTE_LABELS.some(k => l.toLowerCase().startsWith(k.toLowerCase() + ':')));

  const desc = r.planDescription || '';
  const isDomainRequest = desc.startsWith('Domain Access Request:');
  const seg: Record<string, string> = {};
  let domain = '';
  if (isDomainRequest) {
    desc.split('|').map(s => s.trim()).forEach((s, i) => {
      const at = s.indexOf(':');
      if (at < 0) return;
      const key = s.slice(0, at).trim();
      const val = s.slice(at + 1).trim();
      if (i === 0) domain = val; else seg[key] = val;
    });
  }

  const wants = fromNotes('Wants to read');
  const stored = Array.isArray(r.user?.interestedDomains) ? (r.user!.interestedDomains as unknown[]).map(String) : [];
  const modules = seg['Modules'] && seg['Modules'] !== 'All' ? seg['Modules'].split(',').map(s => s.trim()) : [];
  const interests = wants ? wants.split(',').map(s => s.trim()).filter(Boolean)
    : isDomainRequest ? [domain, ...modules].filter(Boolean)
    : stored;

  return {
    phone: r.user?.contact || r.user?.whatsapp || '',
    institution: r.user?.organization || seg['Org'] || '',
    userType: r.user?.registrantType || '',
    designation: fromNotes('Designation') || r.user?.designation || '',
    planTitle: isDomainRequest ? `Domain access — ${domain}` : (desc || `${r.planType} plan`),
    isDomainRequest,
    interests,
    sessionsUsed: fromNotes('Free sessions used so far'),
    inTheirWords: fromNotes('In their words'),
    estTotal: seg['Est. Total'] || '',
    otherNotes,
  };
}

const summarise = (items: string[], shown = 2) =>
  items.length <= shown ? items.join(', ') : `${items.slice(0, shown).join(', ')} +${items.length - shown} more`;

const day = (iso?: string) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

// ── Look ─────────────────────────────────────────────────────────────────────

const PLAN_BADGE: Record<string, string> = {
  Pro: 'bg-amber-50 text-amber-800 border-amber-200',
  Monthly: 'bg-blue-50 text-blue-800 border-blue-200',
  Quarterly: 'bg-sky-50 text-sky-800 border-sky-200',
  Yearly: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Custom: 'bg-purple-50 text-purple-800 border-purple-200',
};
const STATUS_BADGE: Record<string, { cls: string; Icon: typeof Clock }> = {
  Pending:  { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock },
  Approved: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
  Rejected: { cls: 'bg-red-50 text-red-800 border-red-200', Icon: XCircle },
};

function PlanBadge({ type }: { type: string }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PLAN_BADGE[type] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
      {type}
    </span>
  );
}

// The icon and the word say the status as well as the colour does.
function StatusBadge({ status }: { status: string }) {
  const { cls, Icon } = STATUS_BADGE[status] || { cls: 'bg-slate-50 text-slate-700 border-slate-200', Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>
      <Icon size={12} aria-hidden="true" /> {status}
    </span>
  );
}

const DATE_RANGES = [
  { value: 'all', label: 'Any date', days: 0 },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
] as const;

const selectCls = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';
const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

// ── Dialog plumbing ──────────────────────────────────────────────────────────

/** Escape closes it, and focus goes in when it opens and back out when it closes. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); before?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900 break-words min-w-0">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-6 py-4">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

// ── Review drawer ────────────────────────────────────────────────────────────

function ReviewDrawer({ req, onClose, onApprove, onReject }: {
  req: SubscriptionRequest; onClose: () => void; onApprove: () => void; onReject: () => void;
}) {
  const ref = useDialog(onClose);
  const p = parse(req);
  const pending = req.status === 'Pending';
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div className="flex-1" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="req-drawer-title"
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Subscription request</p>
            <h2 id="req-drawer-title" className="mt-0.5 truncate text-lg font-bold text-slate-900">{req.userName}</h2>
            <p className="truncate text-sm text-slate-600">{req.email}</p>
            {p.phone && (
              <a href={`tel:${p.phone}`} className={`mt-0.5 inline-flex items-center gap-1 rounded text-sm text-slate-600 hover:text-blue-600 ${focusRing}`}>
                <Phone size={12} aria-hidden="true" /> {p.phone}
              </a>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className={`rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 ${focusRing}`}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="Request">
            <dl>
              <Field label="Plan"><PlanBadge type={req.planType} /> <span className="ml-1">{p.planTitle}</span></Field>
              <Field label="Duration">{months(req.durationMonths)}</Field>
              <Field label="Submitted">{day(req.createdAt)}</Field>
              <Field label="Status"><StatusBadge status={req.status} /></Field>
              {req.status === 'Rejected' && req.rejectionNote && <Field label="Rejection note">{req.rejectionNote}</Field>}
            </dl>
          </Section>

          {(p.designation || p.institution || p.userType) && (
            <Section title="Profile">
              <dl>
                {p.designation && <Field label="Designation">{p.designation}</Field>}
                {p.institution && <Field label="Institution">{p.institution}</Field>}
                {p.userType && <Field label="Registered as">{p.userType}</Field>}
              </dl>
            </Section>
          )}

          {p.interests.length > 0 && (
            <Section title="Research / content interests">
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {p.interests.map(i => (
                  <li key={i} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">{i}</li>
                ))}
              </ul>
            </Section>
          )}

          {(p.sessionsUsed || p.inTheirWords || p.estTotal || p.otherNotes.length > 0) && (
            <Section title="Usage / additional information">
              <dl>
                {p.sessionsUsed && <Field label="Free sessions used">{p.sessionsUsed}</Field>}
                {p.estTotal && <Field label="Estimated total">{p.estTotal}</Field>}
              </dl>
              {p.inTheirWords && (
                <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">“{p.inTheirWords}”</p>
              )}
              {p.otherNotes.length > 0 && (
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{p.otherNotes.join('\n')}</p>
              )}
            </Section>
          )}

          <Section title="Payment">
            <dl>
              <Field label="Payment reference">
                {req.paymentRef
                  ? (req.paymentRef.startsWith('http')
                      ? <a href={req.paymentRef} target="_blank" rel="noreferrer" className="text-blue-600 underline">View screenshot</a>
                      : req.paymentRef)
                  : <span className="font-normal text-slate-500">Not recorded</span>}
              </Field>
            </dl>
          </Section>
        </div>

        {pending ? (
          <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
            <button onClick={onReject} className={`flex-1 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 ${focusRing}`}>
              Reject Request
            </button>
            <button onClick={onApprove} className={`flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 ${focusRing}`}>
              Approve &amp; Activate
            </button>
          </div>
        ) : (
          <div className="border-t border-slate-200 px-6 py-4 text-sm text-slate-500">This request has been {req.status.toLowerCase()}.</div>
        )}
      </div>
    </div>
  );
}

// ── Confirmation dialogs ─────────────────────────────────────────────────────

function ConfirmShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useDialog(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl outline-none">
        <div className="border-b border-slate-100 p-6">
          <h2 id="confirm-title" className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

function ApproveConfirm({ req, processing, onCancel, onConfirm }: {
  req: SubscriptionRequest; processing: boolean; onCancel: () => void;
  onConfirm: (dates: { startDate: string; endDate: string }) => void;
}) {
  const p = parse(req);
  const [dates, setDates] = useState({ startDate: '', endDate: '' });
  return (
    <ConfirmShell title="Activate this subscription?" onClose={onCancel}>
      <div className="space-y-4 p-6">
        <p className="text-sm text-slate-700">
          Activate <b>{req.planType}</b> for <b>{req.userName}</b> for <b>{months(req.durationMonths)}</b>?
          This creates the subscription straight away.
        </p>
        <dl className="rounded-xl bg-slate-50 px-4 py-2">
          <Field label="Applicant">{req.userName}</Field>
          <Field label="Plan">{p.planTitle}</Field>
          <Field label="Duration">{months(req.durationMonths)}</Field>
          {p.institution && <Field label="Institution">{p.institution}</Field>}
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">
            Start date <span className="font-normal text-slate-500">(optional)</span>
            <input type="date" value={dates.startDate} onChange={e => setDates(d => ({ ...d, startDate: e.target.value }))}
              className={`mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm ${focusRing}`} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            End date <span className="font-normal text-slate-500">(optional)</span>
            <input type="date" value={dates.endDate} onChange={e => setDates(d => ({ ...d, endDate: e.target.value }))}
              className={`mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm ${focusRing}`} />
          </label>
          <p className="col-span-2 -mt-1 text-xs text-slate-500">
            Left blank, it starts today and ends {months(req.durationMonths)} later.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 p-6">
        <button onClick={onCancel} className={`rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 ${focusRing}`}>Cancel</button>
        <button onClick={() => onConfirm(dates)} disabled={processing}
          className={`flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 ${focusRing}`}>
          {processing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check size={15} aria-hidden="true" />}
          Confirm Activation
        </button>
      </div>
    </ConfirmShell>
  );
}

function RejectConfirm({ req, processing, onCancel, onConfirm }: {
  req: SubscriptionRequest; processing: boolean; onCancel: () => void; onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <ConfirmShell title="Reject Subscription Request" onClose={onCancel}>
      <div className="p-6">
        <p className="mb-4 text-sm text-slate-700">Reject the request from <b>{req.userName}</b>?</p>
        <label className="block text-sm font-semibold text-slate-700">
          Reason / internal note <span className="font-normal text-slate-500">(optional)</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Kept in admin records…"
            className={`mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-normal ${focusRing}`} />
        </label>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 p-6">
        <button onClick={onCancel} className={`rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 ${focusRing}`}>Cancel</button>
        <button onClick={() => onConfirm(note)} disabled={processing}
          className={`flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 ${focusRing}`}>
          {processing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <X size={15} aria-hidden="true" />}
          Reject Request
        </button>
      </div>
    </ConfirmShell>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export function SubscriptionRequestsPage() {
  const [all, setAll] = useState<SubscriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [tab, setTab] = useState<Tab>('Pending');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [userType, setUserType] = useState('');
  const [range, setRange] = useState<string>('all');

  const [reviewing, setReviewing] = useState<SubscriptionRequest | null>(null);
  const [approving, setApproving] = useState<SubscriptionRequest | null>(null);
  const [rejecting, setRejecting] = useState<SubscriptionRequest | null>(null);
  const [processing, setProcessing] = useState(false);

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  // Every request is loaded once and sliced here: the counts, the tabs and the
  // filters all read the same list, so they cannot disagree.
  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/admin/subscription-requests', { headers: auth() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error();
      setAll(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    Pending: all.filter(r => r.status === 'Pending').length,
    Approved: all.filter(r => r.status === 'Approved').length,
    Rejected: all.filter(r => r.status === 'Rejected').length,
    total: all.length,
  }), [all]);

  const planOptions = useMemo(() => Array.from(new Set(all.map(r => r.planType).filter(Boolean))).sort(), [all]);
  const typeOptions = useMemo(
    () => Array.from(new Set(all.map(r => r.user?.registrantType).filter((x): x is string => !!x))).sort(), [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const days = DATE_RANGES.find(d => d.value === range)?.days || 0;
    const since = days ? Date.now() - days * 86400000 : 0;
    return all.filter(r => {
      if (tab && r.status !== tab) return false;
      if (plan && r.planType !== plan) return false;
      if (userType && r.user?.registrantType !== userType) return false;
      if (since && (!r.createdAt || new Date(r.createdAt).getTime() < since)) return false;
      if (q) {
        const p = parse(r);
        const hay = `${r.userName} ${r.email} ${p.phone} ${p.institution}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, tab, search, plan, userType, range]);

  const hasFilters = !!(search || plan || userType || range !== 'all');
  const resetFilters = () => { setSearch(''); setPlan(''); setUserType(''); setRange('all'); };

  // ── The two actions: the same calls, the same payloads, as before ──
  const handleApprove = async (dates: { startDate: string; endDate: string }) => {
    if (!approving) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/subscription-requests/${approving.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(dates),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to approve'); }
      toast.success('Request approved — subscription created!');
      setApproving(null);
      setReviewing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (rejectionNote: string) => {
    if (!rejecting) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/subscription-requests/${rejecting.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ rejectionNote }),
      });
      if (!res.ok) throw new Error();
      toast.success('Request rejected');
      setRejecting(null);
      setReviewing(null);
      load();
    } catch {
      toast.error('Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  // ── Pieces ──
  const cards: { key: Tab; label: string; value: number; cls: string; dot: string }[] = [
    { key: 'Pending', label: 'Pending', value: counts.Pending, cls: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
    { key: 'Approved', label: 'Approved', value: counts.Approved, cls: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
    { key: 'Rejected', label: 'Rejected', value: counts.Rejected, cls: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
    { key: '', label: 'Total Requests', value: counts.total, cls: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  ];

  const requestCell = (r: SubscriptionRequest) => {
    const p = parse(r);
    return (
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2"><PlanBadge type={r.planType} /><span className="truncate text-sm font-semibold text-slate-800">{p.planTitle}</span></div>
        {(p.designation || p.institution) && (
          <div className="truncate text-sm text-slate-700">{[p.designation, p.institution].filter(Boolean).join(' · ')}</div>
        )}
        {p.interests.length > 0 && <div className="truncate text-xs text-slate-500">{summarise(p.interests)}</div>}
        <button onClick={() => setReviewing(r)} className={`inline-flex items-center gap-1 rounded text-xs font-semibold text-blue-700 hover:underline ${focusRing}`}>
          View details <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>
    );
  };

  const applicantCell = (r: SubscriptionRequest) => {
    const p = parse(r);
    return (
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
          {r.userName?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{r.userName}</div>
          <div className="truncate text-xs text-slate-600">{r.email}</div>
          {p.phone && <div className="truncate text-xs text-slate-600">{p.phone}</div>}
        </div>
      </div>
    );
  };

  const emptyState = (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <Inbox size={32} className="text-slate-300" aria-hidden="true" />
      {hasFilters ? (
        <>
          <p className="font-semibold text-slate-800">No subscription requests match your filters.</p>
          <button onClick={resetFilters} className={`mt-1 rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${focusRing}`}>Reset Filters</button>
        </>
      ) : tab === 'Pending' ? (
        <>
          <p className="font-semibold text-slate-800">No pending subscription requests.</p>
          <p className="text-sm text-slate-500">All incoming requests have been reviewed.</p>
        </>
      ) : (
        <p className="font-semibold text-slate-800">No {tab ? tab.toLowerCase() : ''} subscription requests.</p>
      )}
    </div>
  );

  const th = 'px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscription Requests</h1>
        <p className="text-sm text-slate-600">Review, manage and process incoming subscription access requests.</p>
      </div>

      {/* Summary — each card is also a shortcut to its tab */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(c => (
          <button key={c.label} onClick={() => setTab(c.key)} aria-pressed={tab === c.key}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-shadow hover:shadow-sm ${c.cls} ${tab === c.key ? 'ring-2 ring-slate-900/15' : ''} ${focusRing}`}>
            <span>
              <span className="block text-2xl font-extrabold leading-none text-slate-900">{loading ? '–' : c.value}</span>
              <span className="mt-1 block text-xs font-semibold text-slate-700">{c.label}</span>
            </span>
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Request status" className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {(['Pending', 'Approved', 'Rejected', ''] as const).map(f => (
          <button key={f || 'All'} role="tab" aria-selected={tab === f} onClick={() => setTab(f)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${focusRing} ${tab === f ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search requests"
            placeholder="Search applicant, email, phone or institution…"
            className={`w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm ${focusRing}`} />
        </div>
        <select value={plan} onChange={e => setPlan(e.target.value)} aria-label="Filter by plan" className={selectCls}>
          <option value="">All plans</option>
          {planOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {typeOptions.length > 0 && (
          <select value={userType} onChange={e => setUserType(e.target.value)} aria-label="Filter by user type" className={selectCls}>
            <option value="">All user types</option>
            {typeOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select value={range} onChange={e => setRange(e.target.value)} aria-label="Filter by submitted date" className={selectCls}>
          {DATE_RANGES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button onClick={resetFilters} disabled={!hasFilters}
          className={`rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:text-slate-400 disabled:hover:bg-transparent ${focusRing}`}>
          Reset Filters
        </button>
      </div>

      {/* Results */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {failed ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <AlertTriangle size={30} className="text-amber-500" aria-hidden="true" />
            <p className="font-semibold text-slate-800">Unable to load subscription requests.</p>
            <button onClick={load} className={`flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 ${focusRing}`}>
              <RefreshCw size={14} aria-hidden="true" /> Retry
            </button>
          </div>
        ) : loading ? (
          <div aria-busy="true" aria-label="Loading requests" className="divide-y divide-slate-100">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-5">
                <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-64 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="hidden h-6 w-20 animate-pulse rounded bg-slate-100 md:block" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? emptyState : (
          <>
            {/* Desktop and tablet */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className={th}>Applicant</th>
                  <th scope="col" className={th}>Request</th>
                  <th scope="col" className={`${th} hidden lg:table-cell`}>Duration</th>
                  <th scope="col" className={th}>Submitted</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="align-top transition-colors hover:bg-slate-50">
                    <td className="max-w-[16rem] px-5 py-4">{applicantCell(r)}</td>
                    <td className="max-w-[22rem] px-5 py-4">{requestCell(r)}</td>
                    <td className="hidden whitespace-nowrap px-5 py-4 text-slate-700 lg:table-cell">
                      <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden="true" /> {months(r.durationMonths)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-700">{day(r.createdAt)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={r.status} />
                      {r.rejectionNote && <div className="mt-1 max-w-[12rem] truncate text-xs text-red-700" title={r.rejectionNote}>{r.rejectionNote}</div>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => setReviewing(r)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-800 hover:border-blue-300 hover:text-blue-700 ${focusRing}`}>
                        <ListChecks size={14} aria-hidden="true" /> Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: one card per request */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map(r => {
                const p = parse(r);
                return (
                  <li key={r.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      {applicantCell(r)}
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
                      <PlanBadge type={r.planType} />
                      {p.institution && <span>{p.institution}</span>}
                      <span>{months(r.durationMonths)}</span>
                      <span className="text-slate-500">{day(r.createdAt)}</span>
                    </div>
                    <button onClick={() => setReviewing(r)}
                      className={`w-full rounded-lg border border-slate-200 py-2 text-sm font-bold text-slate-800 hover:border-blue-300 hover:text-blue-700 ${focusRing}`}>
                      Review
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {reviewing && !approving && !rejecting && (
        <ReviewDrawer req={reviewing} onClose={() => setReviewing(null)}
          onApprove={() => setApproving(reviewing)} onReject={() => setRejecting(reviewing)} />
      )}
      {approving && (
        <ApproveConfirm req={approving} processing={processing} onCancel={() => setApproving(null)} onConfirm={handleApprove} />
      )}
      {rejecting && (
        <RejectConfirm req={rejecting} processing={processing} onCancel={() => setRejecting(null)} onConfirm={handleReject} />
      )}
    </div>
  );
}
