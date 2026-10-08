import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Search, Target } from 'lucide-react';
import { Button, ConfirmDialog, Dialog } from '../../ui';
import { DOMAINS } from '../../../constants';
import { api } from './api';
import { scopeLabel } from './format';

export const ALL_DEPARTMENTS: string[] = DOMAINS.map(d => d.name);

/**
 * Department picker, used for the engine's scope and for the one-off import.
 * Search, Select all, Clear and a live count — and no opinion about what is selected.
 */
export function DepartmentPicker({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => ALL_DEPARTMENTS.filter(d => d.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  const toggle = (d: string) => onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" type="search" placeholder="Search departments" aria-label="Search departments" value={q} onChange={e => setQ(e.target.value)} disabled={disabled} />
        </div>
        <Button variant="outline" size="sm" onClick={() => onChange(ALL_DEPARTMENTS)} disabled={disabled}>Select all</Button>
        <Button variant="outline" size="sm" onClick={() => onChange([])} disabled={disabled}>Clear</Button>
      </div>
      <p className="mt-2 text-[12.5px] font-medium text-ink-2" aria-live="polite">{value.length} of {ALL_DEPARTMENTS.length} departments selected</p>
      <ul className="mt-2 grid max-h-72 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-rule p-2 sm:grid-cols-2">
        {shown.map(d => (
          <li key={d}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent-solid)]" checked={value.includes(d)} onChange={() => toggle(d)} disabled={disabled} />
              <span>{d}</span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="px-2 py-3 text-[13px] text-muted">No department matches “{q}”.</li>}
      </ul>
    </div>
  );
}

export function ScopePanel({ state, onChanged }: { state: any; onChanged: () => void }) {
  const running = !!state.enabled;
  const scope = scopeLabel(state.departments);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const open = () => { setDraft(Array.isArray(state.departments) && state.departments.length ? state.departments : ALL_DEPARTMENTS); setEditing(true); };

  const save = async (departments: string[], confirmScopeChange: boolean) => {
    setSaving(true);
    // Selecting every department is saved as an explicit "all" (empty list) so new departments are covered too.
    const body: any = { departments: departments.length === ALL_DEPARTMENTS.length ? [] : departments };
    if (confirmScopeChange) body.confirmScopeChange = true;
    const r = await api('/api/admin/ingest/state', { method: 'POST', body });
    setSaving(false);
    if (r.status === 409 && r.data?.needsConfirmation === 'SCOPE_CHANGE') { setConfirmSave(true); return; }
    if (!r.ok) { toast.error(r.data?.error || 'The scope was not changed.'); return; }
    toast.success('Active scope updated');
    setEditing(false); setConfirmSave(false); setConfirmAll(false);
    onChanged();
  };

  return (
    <section className="card card-pad border-accent/30" aria-labelledby="scope-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Target size={18} /></span>
          <div>
            <h2 id="scope-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Active scope</h2>
            <p className="mt-0.5 text-lg font-semibold text-ink">{scope.short}</p>
            <p className="mt-0.5 text-[13px] text-muted">{scope.long}{!scope.all && ' The scope is only ever changed here, by you.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={open}>Change Scope</Button>
          {!scope.all && <Button variant="secondary" onClick={() => (running ? setConfirmAll(true) : save([], false))} loading={saving && !editing}>Use All Departments</Button>}
        </div>
      </div>
      {!scope.all && state.departments?.length > 1 && (
        <p className="mt-3 text-[12.5px] text-muted">{state.departments.join(' · ')}</p>
      )}

      <Dialog open={editing} onClose={() => !saving && setEditing(false)} size="lg" title="Change active scope"
        description="Choose the departments the engine works on. Nothing already collected is removed."
        footer={<>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => (draft.length ? save(draft, false) : toast.error('Select at least one department, or choose Use All Departments.'))} loading={saving}>{saving ? 'Saving…' : 'Save scope'}</Button>
        </>}>
        <DepartmentPicker value={draft} onChange={setDraft} />
      </Dialog>

      <ConfirmDialog open={confirmSave} onClose={() => setConfirmSave(false)} loading={saving} confirmLabel="Change scope"
        title="Change the scope while the engine is running?"
        description="The engine is running. From the next pass it will work only on the departments you chose. Collected data is not touched."
        onConfirm={() => save(draft, true)} />
      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} loading={saving} confirmLabel="Use all departments"
        title="Widen the scope to every department?"
        description="The engine is running. From the next pass it will work on every department. Collected data is not touched."
        onConfirm={() => save([], true)} />
    </section>
  );
}
