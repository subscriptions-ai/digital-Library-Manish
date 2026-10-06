import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'caution' | 'alarm';

export function Badge({ tone = 'neutral', dot, className, children }: {
  tone?: BadgeTone; dot?: boolean; className?: string; children: ReactNode;
}) {
  return <span className={cn('badge', `badge-${tone}`, dot && 'badge-dot', className)}>{children}</span>;
}

/**
 * The words the product uses for a state, and the tone each one gets — kept in
 * one place so "Active" on a librarian's screen and "Active" on an admin's are
 * the same badge. Tone follows meaning: success for live access, caution for
 * something that needs attention, alarm only for what has actually failed or
 * been suspended, neutral for the rest.
 */
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  pending: { label: 'Pending', tone: 'caution' },
  expired: { label: 'Expired', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'alarm' },
  verified: { label: 'Verified', tone: 'success' },
  unverified: { label: 'Unverified', tone: 'caution' },
  suspended: { label: 'Suspended', tone: 'alarm' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'alarm' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'success' },
  'subscription-active': { label: 'Subscription Access Active', tone: 'success' },
  'access-not-assigned': { label: 'Access Not Assigned', tone: 'neutral' },
  'subscription-expired': { label: 'Subscription Expired', tone: 'caution' },
  'no-seat-assigned': { label: 'No Licensed Seat Assigned', tone: 'neutral' },
  'all-seats-assigned': { label: 'All Licensed Seats Assigned', tone: 'caution' },
  'free-preview': { label: 'Free Preview', tone: 'accent' },
  'session-ended': { label: 'Reading Session Ended', tone: 'neutral' },
  'user-addition-restricted': { label: 'User Addition Restricted', tone: 'caution' },
};

export type StatusKey = keyof typeof STATUS;

/** A badge for a known state. Unknown values fall back to a neutral badge with the value as written. */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const key = String(status || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  const known = STATUS[key];
  return (
    <Badge tone={known?.tone ?? 'neutral'} dot className={className}>
      {label ?? known?.label ?? status}
    </Badge>
  );
}
