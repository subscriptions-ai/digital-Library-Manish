import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'brand' | 'highlight';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** The class string for a button, for a Link or <a> that should look like one. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, extra);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, and blocks a second click. */
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, cn(block && 'btn-block', className))}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
