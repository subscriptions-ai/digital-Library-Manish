import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * The library's search, drawn once.
 *
 * `SearchBox` is the field and its button. The navbar popover and the home
 * page's hero both use it, so a visitor meets the same input — same placeholder,
 * same radius, same icon, same quiet focus ring, a button exactly as tall as the
 * field — wherever they search. The hero is only larger, and sits in a white
 * frame so the navy button reads on its dark photograph.
 *
 * `HeaderSearch` is the navbar's search icon and the panel that opens from it.
 */

export const SEARCH_PLACEHOLDER = 'Search by title, author, DOI, keyword or subject…';
const SEARCH_LABEL = 'Search the library by title, author, DOI, keyword or subject';

export function SearchBox({ value, onChange, onSubmit, variant = 'popover', autoFocus, inputRef, showHint, className }: {
  value: string;
  onChange: (v: string) => void;
  /** Called with the trimmed term, and only when there is one. */
  onSubmit: (term: string) => void;
  variant?: 'popover' | 'hero';
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Say what to type when someone submits an empty box. */
  showHint?: boolean;
  className?: string;
}) {
  const id = useId();
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const [empty, setEmpty] = useState(false);
  const hero = variant === 'hero';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = value.trim();
    if (!term) { setEmpty(true); ref.current?.focus(); return; }
    onSubmit(term);
  };

  return (
    <div className={className}>
      <form
        role="search" onSubmit={submit} noValidate
        className={cn(
          'flex w-full flex-col gap-2 min-[480px]:flex-row min-[480px]:items-stretch',
          hero && 'keep-light rounded-xl bg-white p-1.5 shadow-[var(--shadow-modal)]',
        )}
      >
        <label htmlFor={id} className="sr-only">{SEARCH_LABEL}</label>
        <div
          className={cn(
            'flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg border border-rule-2 px-3.5 min-[480px]:flex-1 min-[480px]:shrink transition-[border-color,box-shadow] duration-150',
            'focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)]',
            hero ? 'keep-light h-12 bg-white text-[#16181d]' : 'h-[46px] bg-surface text-ink',
          )}
        >
          <Search size={hero ? 19 : 18} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
          <input
            id={id} ref={ref} type="search" value={value} autoFocus={autoFocus} autoComplete="off" enterKeyHint="search"
            onChange={e => { onChange(e.target.value); if (empty) setEmpty(false); }}
            placeholder={SEARCH_PLACEHOLDER}
            aria-describedby={empty && showHint ? `${id}-hint` : undefined}
            className={cn(
              'min-w-0 flex-1 text-ellipsis bg-transparent outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden',
              hero ? 'text-[15px]' : 'text-sm',
            )}
          />
          {value && (
            <button
              type="button" aria-label="Clear search"
              onClick={() => { onChange(''); ref.current?.focus(); }}
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
        <button type="submit" className={cn('btn btn-brand w-full shrink-0 px-5 min-[480px]:w-auto', hero ? 'h-12 min-[480px]:px-7' : 'h-[46px]')}>
          Search
        </button>
      </form>
      {showHint && empty && (
        <p id={`${id}-hint`} role="status" className="px-1 pt-2 text-xs text-muted">Enter a title, author, DOI, keyword or subject.</p>
      )}
    </div>
  );
}

/**
 * The navbar's search icon and the panel under it.
 *
 * On a wide screen the panel hangs from the icon with a small pointer, so it
 * reads as that icon's own; on a phone it is a full-width sheet with a 16px
 * gutter and a close button. Escape, a click outside, the icon again, or a
 * search all close it, and each opening starts with an empty box.
 */
export function HeaderSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Always a clean start.
  useEffect(() => { if (open) setQ(''); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onOpenChange(false);
      trigger.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open, onOpenChange]);

  const go = (term: string) => {
    navigate(`/search?q=${encodeURIComponent(term)}`);
    onOpenChange(false);
  };

  return (
    <div ref={wrap} className="sm:relative">
      <button
        ref={trigger} type="button" onClick={() => onOpenChange(!open)}
        aria-label={open ? 'Close search' : 'Open search'} aria-expanded={open} aria-controls="header-search"
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-surface-2 hover:text-accent',
          open ? 'bg-surface-2 text-accent' : 'text-ink-2',
        )}
      >
        <Search size={18} aria-hidden="true" />
      </button>

      {open && (
        <>
          {/* Phones: dim the page under the sheet so it is clear where to tap to leave. */}
          <div aria-hidden="true" onClick={() => onOpenChange(false)} className="fixed inset-x-0 bottom-0 top-16 z-40 bg-ink/30 sm:hidden" />
          <div
            id="header-search"
            className={cn(
              'z-50 rounded-xl border border-rule bg-surface p-3 shadow-[var(--shadow-pop)]',
              'fixed inset-x-4 top-[72px]',
              'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-5 sm:w-[min(520px,calc(100vw-32px))] sm:p-2.5',
            )}
          >
            {/* The pointer that ties the panel to the icon above it. */}
            <span aria-hidden="true" className="absolute -top-[7px] right-[14px] hidden h-3 w-3 rotate-45 border-l border-t border-rule bg-surface sm:block" />
            <div className="mb-2.5 flex items-center justify-between sm:hidden">
              <p className="text-sm font-semibold text-ink">Search the library</p>
              <button type="button" onClick={() => { onOpenChange(false); trigger.current?.focus(); }} aria-label="Close search"
                className="btn btn-ghost btn-sm btn-icon -mr-1.5">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <SearchBox value={q} onChange={setQ} onSubmit={go} autoFocus inputRef={input} showHint />
          </div>
        </>
      )}
    </div>
  );
}
