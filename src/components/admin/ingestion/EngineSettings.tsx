import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Lock } from 'lucide-react';
import { Button, Field } from '../../ui';
import { api } from './api';

const FIELDS = [
  { key: 'yearsBack', label: 'Years to collect', help: 'Only material published within this many years is collected.' },
  { key: 'batchSize', label: 'Articles per pass', help: 'The most articles one pass writes.' },
  { key: 'articlesPerJournal', label: 'Articles per journal', help: 'The most articles held per journal.' },
  { key: 'discoverEvery', label: 'Look for more every', help: 'In Everything mode, one pass in this many looks for new titles.' },
] as const;

/**
 * Settings are a local draft of the saved values, loaded from the server. Nothing is saved while typing, an empty or
 * out-of-range box is reported rather than replaced with a default, and the whole block is read-only while the engine runs.
 */
export function EngineSettings({ state, onChanged }: { state: any; onChanged: () => void }) {
  const running = !!state.enabled;
  const limits = state.limits || {};
  const saved = (k: string) => String(state[k] ?? '');
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(f => [f.key, saved(f.key)])));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Follow the server until the person starts editing; never overwrite an edit in progress.
  useEffect(() => { if (!dirty) setDraft(Object.fromEntries(FIELDS.map(f => [f.key, saved(f.key)]))); }, [state.yearsBack, state.batchSize, state.articlesPerJournal, state.discoverEvery, dirty]);

  const errorFor = (k: string): string | null => {
    const v = draft[k]; const { min, max } = limits[k] || {};
    if (v.trim() === '' || !/^\d+$/.test(v.trim())) return 'Enter a whole number.';
    if (min != null && (+v < min || +v > max)) return `Must be between ${min} and ${max}.`;
    return null;
  };
  const invalid = FIELDS.some(f => errorFor(f.key));

  const save = async () => {
    setSaving(true);
    const body = Object.fromEntries(FIELDS.map(f => [f.key, Number(draft[f.key])]));
    const r = await api('/api/admin/ingest/state', { method: 'POST', body });
    setSaving(false);
    if (!r.ok) { toast.error(r.data?.error || 'Settings were not saved.'); return; }
    toast.success('Settings saved'); setDirty(false); onChanged();
  };

  return (
    <section className="card card-pad" aria-labelledby="settings-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="settings-heading" className="text-base font-semibold text-ink">Engine settings</h2>
        {running && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted"><Lock size={13} aria-hidden="true" /> Read-only while the engine is running</span>}
      </div>
      {running && <p role="note" className="mt-2 text-[13px] text-ink-2">Pause the engine to edit ingestion settings.</p>}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(f => (
          <Field key={f.key} label={f.label} help={f.help} error={dirty ? errorFor(f.key) : null}>
            <input className="input tabular-nums" inputMode="numeric" value={draft[f.key]} disabled={running || saving}
              onChange={e => { setDraft(d => ({ ...d, [f.key]: e.target.value })); setDirty(true); }} />
          </Field>
        ))}
      </div>
      {!running && (
        <div className="mt-4 flex gap-2">
          <Button onClick={save} loading={saving} disabled={!dirty || invalid}>{saving ? 'Saving…' : 'Save settings'}</Button>
          <Button variant="outline" onClick={() => setDirty(false)} disabled={!dirty || saving}>Discard changes</Button>
        </div>
      )}
    </section>
  );
}
