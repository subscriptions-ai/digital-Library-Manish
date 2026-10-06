import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal for a short, focused action: title, a sentence of explanation, the
 * content, then Cancel and the primary action. Escape and the backdrop close
 * it, focus stays inside while it is open and returns to where it was after.
 * `side="right"` turns it into a drawer for longer review.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', side, className }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode;
  children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; side?: 'right'; className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  // Held in a ref so a caller's inline `onClose` does not re-run the effect
  // below on every render — which would pull focus back to the first field
  // while someone is typing in another.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>('[autofocus], ' + FOCUSABLE);
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; before?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return createPortal(
    <div className={cn('fixed inset-0 z-[110] flex p-4', side === 'right' ? 'justify-end p-0' : 'items-center justify-center')}>
      <div className="overlay" onClick={() => closeRef.current()} aria-hidden="true" />
      <div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn('dialog-panel relative', side === 'right' ? 'h-full max-h-none max-w-xl rounded-none sm:rounded-l-[var(--radius-xl)]' : width, className)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-snug text-ink">{title}</h2>
            {description && <p id={descId} className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost btn-sm btn-icon -mr-2 shrink-0">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children && <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>}
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-rule px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A dangerous or irreversible action asks first. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description?: ReactNode;
  confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm"
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}
    />
  );
}
