import { useId, type ReactNode } from 'react';
import { Info } from 'lucide-react';

/**
 * A small "what does this mean" control that works for a mouse, a keyboard and a screen reader.
 * It is a real button (focusable), the text is wired with aria-describedby, and the panel shows on hover AND on focus —
 * a title="" would show on neither a keyboard nor a touch screen.
 */
export function InfoTip({ label, children, align = 'left' }: { label: string; children: ReactNode; align?: 'left' | 'right' }) {
  const id = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={`What ${label} means`} aria-describedby={id}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent">
        <Info size={13} aria-hidden="true" />
      </button>
      <span id={id} role="tooltip"
        className={`pointer-events-none absolute top-full z-30 mt-1 hidden w-64 rounded-lg border border-rule bg-tooltip px-3 py-2 text-left text-[12px] font-normal normal-case leading-snug tracking-normal text-ink-2 shadow-lg group-focus-within:block group-hover:block ${align === 'right' ? 'right-0' : 'left-0'}`}>
        {children}
      </span>
    </span>
  );
}
