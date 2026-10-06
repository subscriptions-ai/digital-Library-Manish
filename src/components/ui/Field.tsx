import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * A labelled form control. The label is always visible (a placeholder is not a
 * label), and help and error text are wired to the control for screen readers.
 *
 *   <Field label="Email address" error={errors.email}>
 *     <input className="input" type="email" ... />
 *   </Field>
 */
export function Field({ label, help, error, required, className, children }: {
  label: ReactNode; help?: ReactNode; error?: ReactNode; required?: boolean; className?: string;
  children: ReactElement<any>;
}) {
  const auto = useId();
  const id = (isValidElement(children) && (children.props as any).id) || auto;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [errorId, helpId, (children.props as any)['aria-describedby']].filter(Boolean).join(' ') || undefined,
        required: required ?? (children.props as any).required,
      })
    : children;
  return (
    <div className={cn('field', className)}>
      <label htmlFor={id} className="field-label">
        {label}{required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {control}
      {error ? <p id={errorId} className="field-error">{error}</p> : help ? <p id={helpId} className="field-help">{help}</p> : null}
    </div>
  );
}
