/**
 * What the library says about an account's access, in one place, from facts the server states.
 *
 * Three different things used to be shown side by side and contradicted each other — "Full Access" on a department, a free-preview timer in
 * the header and "No active premium subscription" in the sidebar — because each was derived somewhere else. They are three facts:
 *
 *   basis     WHY the account can open these departments (a subscription, its institution's, or the ones it selected when it registered)
 *   timed     whether reading runs on the free clock (no active subscription)
 *   expiresAt when the running subscription ends, if there is one
 *
 * This only DESCRIBES. It never decides who may read anything; the server does, and the words here follow it.
 */

export type AccessInfo = {
  basis: 'staff' | 'subscription' | 'institution-subscription' | 'selected' | 'institution-selected' | 'none';
  timed: boolean;
  premium: boolean;
  staff: boolean;
  expiresAt: string | null;
};

export type PreviewState = { state?: 'running' | 'paused' | 'available' | 'waiting' | 'spent'; sessionsLeft?: number; nextOpensAt?: string | null } | null;

export type AccessSummary = {
  tone: 'success' | 'caution' | 'neutral';
  headline: string;
  detail: string;
  /** Shown beside the departments: how reading works for this account right now. */
  reading: string;
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const daysUntil = (iso: string, now: number) => Math.ceil((new Date(iso).getTime() - now) / 86_400_000);

export function summariseAccess(a: AccessInfo | null, preview: PreviewState = null, now: number = Date.now()): AccessSummary {
  if (!a) return { tone: 'neutral', headline: '', detail: '', reading: '' };
  if (a.staff) return { tone: 'neutral', headline: 'Staff access', detail: 'Every department is open to your account.', reading: 'Reading is not timed.' };

  if (a.basis === 'none') {
    return { tone: 'caution', headline: 'No departments are included in your access', detail: 'There is no active subscription and no department selected on this account.', reading: '' };
  }

  if (!a.timed) {
    const who = a.basis === 'institution-subscription' ? 'Your institution’s subscription' : 'Your subscription';
    let detail = `${who} covers the departments below.`;
    if (a.expiresAt) {
      const left = daysUntil(a.expiresAt, now);
      detail += left < 0 ? ` It ended on ${day(a.expiresAt)}.` : left <= 30 ? ` It ends on ${day(a.expiresAt)} (${left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'}`} left).` : ` Valid until ${day(a.expiresAt)}.`;
    }
    return { tone: a.expiresAt && daysUntil(a.expiresAt, now) <= 30 ? 'caution' : 'success', headline: 'Premium access is active', detail, reading: 'Reading is not timed.' };
  }

  // No active subscription: the departments are the ones selected (by the person or by their institution), and reading is on the free clock.
  const whose = a.basis === 'institution-selected' ? 'your institution selected' : 'you selected';
  const p = preview;
  const reading =
    p?.state === 'running' ? 'A reading session is running. Its time is shown in the header.'
    : p?.state === 'waiting' ? `Your next session opens at ${p.nextOpensAt ? new Date(p.nextOpensAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'a little later'}.`
    : p?.state === 'spent' ? 'Today’s sessions are used. More open after midnight.'
    : p?.state === 'paused' ? 'You have time kept from an earlier session.'
    : 'Opening a document starts a timed session.';
  return {
    tone: 'caution',
    headline: 'Free preview — no active subscription',
    detail: `These are the departments ${whose}. You can browse and save everything below; reading runs in timed sessions.`,
    reading,
  };
}

/** The line under a department's name: what it holds, in words that say what is counted. */
export function countsLine(total: number, readableForYou: number): string {
  const n = (x: number) => x.toLocaleString('en-IN');
  return `${n(total)} in the catalogue · ${n(readableForYou)} readable here`;
}
