import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  filterGroups, groupState, groupsFor, setDepartment, setGroup, summariseSelection, type DepartmentGroup,
} from '../../lib/institutionDepartmentGroups';

/** How many groups start open when nothing is selected yet. */
const OPEN_BY_DEFAULT = 2;

/** A checkbox that can show "some, not all" — the DOM only exposes that as a property. */
function GroupCheckbox({ state, onChange, label, disabled }: {
  state: 'none' | 'some' | 'all'; onChange: (on: boolean) => void; label: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
  return (
    <input
      ref={ref} type="checkbox" aria-label={label} disabled={disabled}
      checked={state === 'all'}
      onChange={() => onChange(state !== 'all')}
      className="h-4 w-4 shrink-0 accent-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    />
  );
}

/**
 * Chooses departments for an institution, laid out under their Subject Groups.
 *
 * It owns no price and no state of its own beyond what is open and what is typed: the selection is
 * the plain list of department names the caller already had, and every change — a single box,
 * a group's "Select all", "Clear all" — is reported through the same `onChange`, so the caller's
 * pricing, validation and saving see exactly what they saw from the old flat list.
 *
 * `locked` marks departments the buyer already holds: shown ticked and unchangeable, with the note
 * given, and never counted as a selection.
 */
export function DepartmentGroupPicker({ departments, selected, onChange, locked, className }: {
  departments: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  locked?: Map<string, React.ReactNode>;
  className?: string;
}) {
  const uid = useId();
  const groups = useMemo(() => groupsFor(departments), [departments]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.slice(0, OPEN_BY_DEFAULT).map((g) => g.id)));
  // Groups whose selection has already been looked at, so a group the person closed stays closed.
  const seen = useRef<Set<string>>(new Set());

  // A group holding a selection starts open — including a selection that arrives after the first
  // render, like a saved quotation being loaded for editing.
  useEffect(() => {
    const fresh = summariseSelection(groups, selected).map((x) => x.group.id).filter((id) => !seen.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seen.current.add(id));
    setOpen((o) => new Set([...o, ...fresh]));
  }, [groups, selected]);

  const searching = query.trim().length > 0;
  const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
  const isLocked = (name: string) => !!locked?.has(name);
  const choosable = (g: DepartmentGroup) => g.departments.filter((d) => !isLocked(d));

  const toggleOpen = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allClosed = !shown.some(({ group }) => open.has(group.id));
  const summary = useMemo(() => summariseSelection(groups, selected), [groups, selected]);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="field-label">Choose Departments</h3>
        <span className="text-xs text-muted" aria-live="polite">{selected.length} selected</span>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Select the Departments your institution needs. Departments are grouped by academic area for easier selection.
        Pricing is based on the total number of Departments selected.
      </p>

      <div className="relative mt-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Search Departments"
          placeholder="Search Departments or groups…"
          className="input pl-9"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted">{searching ? `${shown.reduce((n, s) => n + s.visible.length, 0)} matching` : `${groups.length} Subject Groups`}</span>
        {!searching && (
          <button type="button" className="font-semibold text-accent hover:underline"
            onClick={() => setOpen(allClosed ? new Set(groups.map((g) => g.id)) : new Set())}>
            {allClosed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      <div className="mt-2 space-y-2">
        {shown.length === 0 && (
          <p className="rounded-lg border border-rule px-3 py-4 text-center text-[13px] text-muted">No Department matches.</p>
        )}
        {shown.map(({ group, visible, complete }) => {
          const can = choosable(group);
          const state = groupState(can, selected);
          const picked = can.filter((d) => selected.includes(d)).length;
          const expanded = searching || open.has(group.id);
          const panelId = `${uid}-${group.id}`;
          return (
            <section key={group.id} className="overflow-hidden rounded-lg border border-rule bg-surface">
              <div className="flex items-center gap-2 bg-surface-2 pr-3">
                <button
                  type="button" aria-expanded={expanded} aria-controls={panelId}
                  disabled={searching}
                  onClick={() => toggleOpen(group.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default"
                >
                  <ChevronDown size={16} aria-hidden="true" className={cn('shrink-0 text-muted transition-transform', !expanded && '-rotate-90')} />
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-ink">{group.name}</span>
                  <span className={cn('tnum shrink-0 text-xs', picked ? 'font-semibold text-accent' : 'text-muted')}>
                    {picked ? `${picked} of ${can.length}` : `${group.departments.length}`}
                  </span>
                </button>
                {complete && can.length > 0 && (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-2">
                    <GroupCheckbox
                      state={state} label={`Select all in ${group.name}`}
                      onChange={(on) => onChange(setGroup(selected, can, on))}
                    />
                    <span>Select all</span>
                  </label>
                )}
              </div>
              {expanded && (
                <fieldset id={panelId} className="m-0 min-w-0 border-0 border-t border-rule p-1.5">
                  <legend className="sr-only">Departments in {group.name}</legend>
                  <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">
                    {visible.map((name) => {
                      const note = locked?.get(name);
                      const held = locked?.has(name);
                      return (
                        <label key={name} className={cn(
                          'flex flex-wrap items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]',
                          held ? 'cursor-default text-muted' : 'cursor-pointer text-ink hover:bg-surface-2',
                        )}>
                          <input
                            type="checkbox" disabled={held}
                            checked={held || selected.includes(name)}
                            onChange={(e) => onChange(setDepartment(selected, name, e.target.checked))}
                            className="h-4 w-4 shrink-0 accent-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                          />
                          <span className="min-w-0 flex-1 break-words">{name}</span>
                          {held && note && <span className="badge badge-success">{note}</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg border border-rule bg-surface-2 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-ink">Selected Departments ({selected.length})</p>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="shrink-0 text-xs font-semibold text-accent hover:underline">Clear all</button>
          )}
        </div>
        {summary.length === 0 ? (
          <p className="mt-1 text-xs text-muted">No Department selected.</p>
        ) : (
          <dl className="mt-1.5 max-h-44 space-y-1.5 overflow-y-auto text-xs">
            {summary.map(({ group, picked }) => (
              <div key={group.id}>
                <dt className="font-semibold text-ink-2">{group.name}</dt>
                <dd className="text-muted">{picked.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">Your rate is calculated automatically from the number of selected Departments.</p>
    </div>
  );
}
