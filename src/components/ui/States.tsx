import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

/** Nothing to show yet — say so, and offer the next step when there is one. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: {
  icon?: LucideIcon; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted" aria-hidden="true">
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Something failed. A plain sentence, never the raw server message, and a retry when retrying can help. */
export function ErrorState({ title = 'Something went wrong', description = 'We could not load this right now. Please try again.', onRetry, className }: {
  title?: ReactNode; description?: ReactNode; onRetry?: () => void; className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-alarm-soft text-alarm" aria-hidden="true">
        <AlertCircle size={22} strokeWidth={1.75} />
      </span>
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {onRetry && <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />;
}

/** Rows of placeholder lines, for a list or table that is loading. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      <span>{label}…</span>
    </span>
  );
}
