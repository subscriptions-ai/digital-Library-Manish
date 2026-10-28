import { Link } from 'react-router-dom';
import { AlertCircle, Lock, LogIn, ServerOff, WifiOff } from 'lucide-react';
import { Badge, Button, buttonClass, type BadgeTone } from '../ui';

/** What /api/sales/registrations/* returns. Read-only: nothing in the workspace writes to these routes. */
export type SubStatus = 'paid' | 'institution' | 'granted' | 'trial' | 'expired' | 'cancelled' | 'none';

export type Growth = { kind: 'pct'; pct: number; delta: number } | { kind: 'new'; delta: number } | { kind: 'flat'; delta: 0 };

export type Summary = {
  generatedAt: string;
  /** True only on a localhost run against a seeded test database. */
  demo?: boolean;
  range: { key: string; fromDay: string; toDay: string; days: number };
  previous: { fromDay: string; toDay: string };
  cards: { total: number; today: number; last7: number; last30: number; verified: number; unverified: number };
  selected: { registrations: number; previousRegistrations: number; growth: Growth; verified: number; unverified: number };
  series: { day: string; count: number }[];
  subscriptions: Record<SubStatus, number> & { withoutActive: number; activePaid: number };
  conversion: { available: true; cohort: number; converted: number; ratePct: number | null } | { available: false; reason: string };
};

export type Member = {
  name: string | null; email: string; organization: string | null; registeredAt: string;
  verified: boolean; subscription: SubStatus; subscriptionLabel: string; leadId: string | null;
};
export type MemberPage = { total: number; page: number; pageSize: number; pages: number; ambiguous?: number; demo?: boolean; members: Member[] };
export type FollowUps = { demo?: boolean; verifiedUnsubscribed: { total: number; members: Member[] }; pendingEnquiries: number };

export const SUB_ORDER: SubStatus[] = ['paid', 'institution', 'granted', 'trial', 'expired', 'cancelled', 'none'];
export const SUB_LABEL: Record<SubStatus, string> = {
  paid: 'Paid · Payment-linked', institution: 'Active · Via institution', granted: 'Active · No payment link',
  trial: 'Trial', expired: 'Expired', cancelled: 'Cancelled', none: 'No subscription',
};
const SUB_TONE: Record<SubStatus, BadgeTone> = {
  paid: 'success', institution: 'accent', granted: 'accent', trial: 'caution', expired: 'neutral', cancelled: 'neutral', none: 'neutral',
};
export const SubscriptionBadge = ({ status }: { status: SubStatus }) => <Badge tone={SUB_TONE[status]} dot>{SUB_LABEL[status]}</Badge>;

/** Said once, so the dashboard and the page word it the same way. */
export const PAID_EXPLAINER =
  'Members holding a running subscription bought through a recorded payment. Subscriptions an administrator granted, Pro approvals and offline payments that were never linked to the subscription are not counted here — nothing records that they were paid — and appear as "No payment link". Trials, expired and cancelled subscriptions are never counted.';

// ── Talking to the server ───────────────────────────────────────────────────

/** Why a request failed, in the terms a person can act on. */
export type ApiErrorKind = 'session' | 'denied' | 'unavailable' | 'network' | 'server' | 'invalid';

export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, message = '') { super(message); }
}

export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export async function getJson<T>(url: string): Promise<T> {
  let r: Response;
  try { r = await fetch(url, { headers: authHeaders() }); }
  catch { throw new ApiError('network'); }

  const isJson = (r.headers.get('content-type') || '').includes('json');
  if (r.status === 401) throw new ApiError('session');
  if (r.status === 403) throw new ApiError('denied');
  // 404, or an app-shell page where JSON was expected: this server does not have the route (an older build that has not been restarted).
  if (r.status === 404 || (r.ok && !isJson)) throw new ApiError('unavailable');
  if (r.status === 400) {
    let msg = '';
    try { msg = (await r.json())?.error || ''; } catch { /* no body */ }
    throw new ApiError('invalid', msg);
  }
  if (!r.ok) throw new ApiError('server');
  try { return await r.json(); } catch { throw new ApiError('server'); }
}

export const asApiError = (e: unknown): ApiError => (e instanceof ApiError ? e : new ApiError('server'));

const COPY: Record<Exclude<ApiErrorKind, 'invalid'>, { title: string; body: string; icon: typeof AlertCircle }> = {
  session: { title: 'Your session has ended', body: 'Sign in again to continue. Nothing here was changed.', icon: LogIn },
  denied: { title: 'You do not have access to this', body: 'Registration figures are available to the sales team. If you should have access, ask an administrator.', icon: Lock },
  unavailable: { title: 'This is not available on the server yet', body: 'The server is running an older version and has not picked up this feature. Restarting it usually fixes this. Try again in a moment.', icon: ServerOff },
  network: { title: 'Could not reach the server', body: 'Check your connection and try again.', icon: WifiOff },
  server: { title: 'Something went wrong on our side', body: 'This is not caused by anything you did. Try again; if it keeps happening, tell an administrator.', icon: AlertCircle },
};

/**
 * One failed request, said plainly, with the way forward: sign in again, ask for access, or retry. Never a stack trace, never a zero. `compact`
 * is for a card inside a page, where the failure of one section should not look like the failure of the page.
 */
export function ApiErrorState({ error, onRetry, subject, compact }: { error: ApiError; onRetry?: () => void; subject: string; compact?: boolean }) {
  const c = COPY[error.kind === 'invalid' ? 'server' : error.kind];
  const Icon = c.icon;
  const retry = error.kind === 'session' || error.kind === 'denied' ? null : onRetry;
  return (
    <div role="alert" className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-12'}`}>
      <span className={`mb-3 flex items-center justify-center rounded-full bg-alarm-soft text-alarm ${compact ? 'h-9 w-9' : 'h-12 w-12'}`} aria-hidden="true"><Icon size={compact ? 18 : 22} strokeWidth={1.75} /></span>
      <p className="text-sm font-semibold text-ink">{c.title}</p>
      <p className="mt-0.5 max-w-sm text-xs text-muted">{c.body}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {error.kind === 'session' && <Link to="/login" className={buttonClass('primary', 'sm')}><LogIn size={14} aria-hidden="true" /> Sign in again</Link>}
        {retry && <Button variant="outline" size="sm" onClick={retry}>Retry</Button>}
      </div>
    </div>
  );
}

/** Marks a screen that is showing seeded test data, so nobody mistakes it for real figures. */
export const DemoBadge = () => <span className="badge badge-caution" title="This server is connected to a seeded test database">Demo data</span>;

// ── Formatting ──────────────────────────────────────────────────────────────

/** "2026-10-05" → "05 Oct". Read as UTC on purpose: it is a calendar day, not an instant, and must not shift with the browser's timezone. */
export const fmtDay = (day: string, withYear = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/** When the figures were computed, in IST, because every window on this page is. */
export const fmtIstTime = (iso: string) =>
  `${new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST`;

/** "28 Oct 2026, 11:42 AM IST" — the moment of registration, in the zone every window here is cut in. */
export const fmtRegistered = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  return `${day}, ${time.toUpperCase()} IST`;
};

export const fmtNum = (n: number) => n.toLocaleString('en-IN');
