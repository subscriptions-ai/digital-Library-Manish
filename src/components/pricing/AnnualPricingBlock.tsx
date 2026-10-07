import { cn } from '../../lib/utils';
import { PRICE_LABELS, type PricingDisplay } from '../../lib/pricingDisplay';

/**
 * The annual department price list, always visible — so how much Premium costs never depends
 * on selecting a department first. Given how many departments are (or would be) held, it marks
 * the rate that applies. The numbers come from `lib/pricingDisplay`, which reads the same price
 * files that price quotations and payments.
 */
export function AnnualPricingBlock({ pricing, count = 0, applied = 'No departments selected yet.', className }: {
  pricing: PricingDisplay;
  /** How many departments the rate is for; the matching tier is highlighted. 0 highlights none. */
  count?: number;
  /** What to say about the current selection above the tiers. */
  applied?: string;
  className?: string;
}) {
  const active = pricing.tierFor(count);
  return (
    <section className={cn('rounded-xl border border-rule bg-surface-2 p-3.5 sm:p-4', className)} aria-label="Annual department pricing">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Annual department pricing</h3>
        <p className="text-xs text-muted">{PRICE_LABELS.perDepartment} · GST @ {pricing.gstPercent}% extra</p>
      </div>
      {applied && <p className="mt-1.5 text-[13px] text-ink-2" aria-live="polite">{applied}</p>}
      {/* As many columns as the space allows — five across a page, three in a dialog, two on a
          phone — so a tile is never squeezed and nothing overflows sideways. */}
      <ul className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))' }}>
        {pricing.tiers.map(t => {
          const on = active?.label === t.label;
          return (
            <li key={t.label}
              className={cn('min-w-0 rounded-lg border px-3 py-2.5',
                on ? 'border-accent bg-accent-soft' : t.best ? 'border-accent/40 bg-surface' : 'border-rule bg-surface')}
              aria-current={on ? 'true' : undefined}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t.label}</p>
              <p className="tnum mt-0.5 whitespace-nowrap text-lg font-bold leading-tight text-ink">
                {t.price}
                {t.suffix && <span className="ml-1 text-xs font-medium text-muted">{t.suffix}</span>}
              </p>
              {t.best && <p className="mt-0.5 text-[11px] font-semibold text-accent">{PRICE_LABELS.bulkRate(t.min)}</p>}
              {on && !t.best && <p className="mt-0.5 text-[11px] font-semibold text-accent">Applied</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
