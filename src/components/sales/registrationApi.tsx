import { Badge, type BadgeTone } from '../ui';

/** What /api/sales/registrations/* returns. Read-only: nothing in the workspace writes to these routes. */
export type SubStatus = 'paid' | 'institution' | 'granted' | 'trial' | 'expired' | 'cancelled' | 'none';

export type Growth = { kind: 'pct'; pct: number; delta: number } | { kind: 'new'; delta: number } | { kind: 'flat'; delta: 0 };

export type Summary = {
  generatedAt: string;
  range: { key: string; fromDay: string; toDay: string; days: number };
  previous: { fromDay: string; toDay: string };
  cards: { total: number; today: number; last7: number; last30: number; verified: number };
  selected: { registrations: number; previousRegistrations: number; growth: Growth; verified: number };
  series: { day: string; count: number }[];
  subscriptions: Record<SubStatus, number> & { withoutActive: number; activePaid: number };
  conversion: { available: true; cohort: number; converted: number; ratePct: number | null } | { available: false; reason: string };
};

export type Member = {
  name: string | null; email: string; organization: string | null; registeredAt: string;
  verified: boolean; subscription: SubStatus; subscriptionLabel: string; leadId: string | null;
};
export type MemberPage = { total: number; page: number; pageSize: number; pages: number; members: Member[] };
export type FollowUps = { verifiedUnsubscribed: { total: number; members: Member[] }; pendingEnquiries: number };

export const SUB_ORDER: SubStatus[] = ['paid', 'institution', 'granted', 'trial', 'expired', 'cancelled', 'none'];
export const SUB_LABEL: Record<SubStatus, string> = {
  paid: 'Active · Paid', institution: 'Active · Via institution', granted: 'Active · Not payment-linked',
  trial: 'Trial', expired: 'Expired', cancelled: 'Cancelled', none: 'No subscription',
};
const SUB_TONE: Record<SubStatus, BadgeTone> = {
  paid: 'success', institution: 'accent', granted: 'accent', trial: 'caution', expired: 'neutral', cancelled: 'neutral', none: 'neutral',
};
export const SubscriptionBadge = ({ status }: { status: SubStatus }) => <Badge tone={SUB_TONE[status]} dot>{SUB_LABEL[status]}</Badge>;

export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json())?.error || ''; } catch { /* no body */ }
    throw new Error(msg || String(r.status));
  }
  return r.json();
}

/** "2026-10-05" → "05 Oct". Read as UTC on purpose: it is a calendar day, not an instant, and must not shift with the browser's timezone. */
export const fmtDay = (day: string, withYear = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/** When the figures were computed, in IST, because every window on this page is. */
export const fmtIstTime = (iso: string) =>
  `${new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST`;

export const fmtRegistered = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export const fmtNum = (n: number) => n.toLocaleString('en-IN');
