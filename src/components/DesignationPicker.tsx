import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  OTHER_DESIGNATION, MAX_DESIGNATION_LENGTH, getSuggestedDesignations, isKnownDesignation, normalizeDesignation, type DesignationState,
} from '../lib/memberRoles';

/**
 * Professional designation: a searchable list of the titles suggested for an account type, with "Other" to write in a title that is not listed.
 *
 * The list is guidance, never a restriction. A title already on record that is not in the list (a Researcher who is an Associate Professor, or a title
 * written in long ago) is shown as it is and kept; nothing here empties a stored value. The lists and the rules live in src/lib/memberRoles.ts.
 *
 * It is a combobox (role="combobox" + listbox): type to filter, arrow keys to move, Enter to choose, Escape to close without closing the dialog it may
 * be in, click outside to close. The list is never taller than the room left on the screen (and never more than ~260px), opens upward when there is more
 * room above, and scrolls inside itself, so it cannot push a dialog's Register / Cancel buttons out of reach.
 */
export function DesignationPicker({
  accountType, state, onChange, required, disabled, disabledReason, label = 'Professional Designation', notice, error, id,
}: {
  accountType: string;
  state: DesignationState;
  onChange: (next: DesignationState) => void;
  required?: boolean;
  disabled?: boolean;
  /** Said under the field while it is disabled ("Choose an account type first."). */
  disabledReason?: string;
  label?: string;
  /** A subtle line under the field, e.g. after the account type changed and the title was cleared. */
  notice?: string;
  error?: string;
  id?: string;
}) {
  const auto = useId();
  const inputId = id || `designation-${auto}`;
  const listId = `${inputId}-list`;
  const otherId = `${inputId}-other`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ up: boolean; max: number }>({ up: false, max: 260 });

  const suggestions = useMemo(() => getSuggestedDesignations(accountType), [accountType]);
  // A title on record that this account type does not suggest is listed first, so it can be seen as selected and chosen again.
  const keptOutside = !state.other && !!state.value && !isKnownDesignation(accountType, state.value);
  const options = useMemo(() => {
    const base = suggestions.filter(s => s !== OTHER_DESIGNATION);
    const withKept = keptOutside ? [state.value, ...base.filter(b => b.toLowerCase() !== state.value.toLowerCase())] : base;
    const q = normalizeDesignation(query).toLowerCase();
    const words = q ? q.split(' ') : [];
    const hits = words.length ? withKept.filter(o => words.every(w => o.toLowerCase().includes(w))) : withKept;
    return [...hits, OTHER_DESIGNATION];       // "Other" is always there to fall back on
  }, [suggestions, keptOutside, state.value, query]);

  // The room the list may use is the room left inside whatever scrolls around the field (a dialog's body), within the screen: a list that ran past a
  // dialog's footer would be cut off by it.
  const place_ = useCallback(() => {
    const el = inputRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let top = 0, bottom = window.innerHeight;
    for (let p: HTMLElement | null = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') { const pr = p.getBoundingClientRect(); top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); break; }
    }
    const below = bottom - r.bottom - 8; const above = r.top - top - 8;
    const up = below < 180 && above > below;
    setPlace({ up, max: Math.max(120, Math.min(260, up ? above : below)) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place_();
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', place_);
    window.addEventListener('scroll', place_, true);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', place_); window.removeEventListener('scroll', place_, true); };
  }, [open, place_]);

  useEffect(() => { setActive(0); }, [query, open]);
  // Keep the highlighted option in view when moving with the keys.
  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, listId]);

  const shown = state.other ? OTHER_DESIGNATION : state.value;
  const choose = (opt: string) => {
    setOpen(false); setQuery('');
    if (opt === OTHER_DESIGNATION) { onChange({ value: state.other ? state.value : '', other: true }); setTimeout(() => document.getElementById(otherId)?.focus(), 0); }
    else onChange({ value: opt, other: false });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive(i => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!open) setOpen(true); else setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); const o = options[active]; if (o) choose(o); }     // never submits the form
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(''); }   // closes the list, not the dialog around it
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="field" ref={rootRef}>
      <label htmlFor={inputId} className="field-label">{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text" role="combobox" autoComplete="off" spellCheck={false}
          aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? `${inputId}-error` : '', notice || disabledReason ? `${inputId}-help` : ''].filter(Boolean).join(' ') || undefined}
          disabled={disabled}
          className="input pr-10"
          placeholder={shown || 'Search or select designation…'}
          value={open ? query : shown}
          onFocus={() => { if (!disabled) { setQuery(''); setOpen(true); } }}
          onClick={() => { if (!disabled && !open) { setQuery(''); setOpen(true); } }}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button" tabIndex={-1} disabled={disabled}
          aria-label={open ? 'Close the list of designations' : 'Open the list of designations'}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { if (open) setOpen(false); else { setQuery(''); setOpen(true); inputRef.current?.focus(); } }}
          className="btn btn-ghost btn-sm btn-icon absolute right-1 top-1/2 -translate-y-1/2"
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {open && !disabled && (
          <ul
            id={listId} role="listbox" aria-label={label}
            style={{ maxHeight: place.max }}
            className={`absolute left-0 right-0 z-30 overflow-y-auto overscroll-contain rounded-xl border border-rule bg-surface py-1 shadow-[var(--shadow-pop)] ${place.up ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          >
            {options.map((o, i) => {
              const selected = o === OTHER_DESIGNATION ? state.other : !state.other && o.toLowerCase() === state.value.toLowerCase();
              const outside = keptOutside && i === 0 && o === state.value;
              return (
                <li
                  key={`${o}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={selected}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseMove={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${i === active ? 'bg-accent-soft text-ink' : 'text-ink-2'} ${o === OTHER_DESIGNATION ? 'border-t border-rule font-medium' : ''}`}
                >
                  <span className="min-w-0 truncate">{o}{o === OTHER_DESIGNATION && <span className="ml-1.5 text-xs font-normal text-muted">enter a title that is not listed</span>}{outside && <span className="ml-1.5 text-xs font-normal text-muted">current title</span>}</span>
                  {selected && <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error ? <p id={`${inputId}-error`} className="field-error">{error}</p>
        : disabled && disabledReason ? <p id={`${inputId}-help`} className="field-help">{disabledReason}</p>
        : notice ? <p id={`${inputId}-help`} className="field-help">{notice}</p>
        : keptOutside ? <p id={`${inputId}-help`} className="field-help">Not in the usual list for this account type; it is kept exactly as it is on record.</p> : null}

      {state.other && !disabled && (
        <div className="mt-3">
          <label htmlFor={otherId} className="field-label">Specify designation{required && <span className="req" aria-hidden="true">*</span>}</label>
          <input
            id={otherId} type="text" className="input" maxLength={MAX_DESIGNATION_LENGTH}
            value={state.value} onChange={e => onChange({ value: e.target.value, other: true })}
            placeholder="e.g. Clinical Research Coordinator" autoComplete="off"
            aria-describedby={`${otherId}-help`}
          />
          <p id={`${otherId}-help`} className="field-help">Their actual professional title, up to {MAX_DESIGNATION_LENGTH} characters. It is saved as written, never as the word “Other”.</p>
        </div>
      )}
    </div>
  );
}
