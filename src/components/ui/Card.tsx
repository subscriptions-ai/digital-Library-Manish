import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Card({ padded = true, interactive, className, ...rest }: HTMLAttributes<HTMLDivElement> & {
  padded?: boolean; interactive?: boolean;
}) {
  return <div className={cn('card', padded && 'card-pad', interactive && 'card-interactive', className)} {...rest} />;
}

/** A card's heading row: title, optional description, optional actions on the right. */
export function CardHeader({ title, description, actions, className }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * One metric, one shape: a label, the number, and a line of context.
 *   Licensed Seats / 25 / 22 assigned · 3 available
 * `value` of null shows a placeholder rather than a misleading 0.
 */
export function MetricCard({ label, value, context, icon: Icon, loading, className }: {
  label: ReactNode; value: ReactNode | null | undefined; context?: ReactNode;
  icon?: LucideIcon; loading?: boolean; className?: string;
}) {
  return (
    <div className={cn('card card-pad', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="metric-label">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
            <Icon size={16} strokeWidth={2} />
          </span>
        )}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-8 w-20" aria-hidden="true" />
      ) : (
        <p className="metric-value mt-1">{value ?? '—'}</p>
      )}
      {context && <p className="metric-context mt-1">{context}</p>}
    </div>
  );
}
