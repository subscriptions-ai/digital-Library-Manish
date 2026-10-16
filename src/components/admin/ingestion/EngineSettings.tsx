import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Lock } from 'lucide-react';
import { Button, Field } from '../../ui';
import { api } from './api';
import { N } from './format';

/**
 * The engine's settings, by kind of content. Each kind has its own rule for how old its material may be — there is no single
 * "years to collect": articles and books age very differently, and a journal title is never judged by when it was founded.
 */
type FieldDef = { key: string; label: string; help: string };
const SECTIONS: { title: string; note?: string; fields: FieldDef[] }[] = [
  {
    title: 'Journals',
    note: 'Journal title year restriction: none. A journal founded in 1985 is a valid journal; its articles follow the article rule.',
    fields: [{ key: 'journalsPerPass', label: 'Journals per pass', help: 'Maximum journal candidates checked during each Journals turn.' }],
  },
  {
    title: 'Articles',
    fields: [
      { key: 'articleMinYear', label: 'Minimum publication year', help: 'New articles published before this year are not collected; one with no year waits for review. Existing articles are not changed.' },
      { key: 'articlesPerPass', label: 'Articles per pass', help: 'Maximum article candidates checked during each Articles turn.' },
      { key: 'articlesPerJournal', label: 'Articles per journal', help: 'The most articles retained/processed for one journal according to the current pipeline.' },
    ],
  },
  {
    title: 'Books',
    fields: [
      { key: 'bookMinYear', label: 'Minimum publication year', help: 'New books from this year on are published the normal way. An older book, or one with no year, waits for review — a person may approve an important older title. Existing books are not changed.' },
      { key: 'booksPerPass', label: 'Books per pass', help: 'Maximum book candidates checked during each Books turn. Provider-specific safety limits still apply.' },
    ],
  },
  {
    title: 'General',
    fields: [{ key: 'discoverEvery', label: 'Look for more every', help: 'In Everything mode, one pass in this many looks for new titles.' }],
  },
];
const FIELDS = SECTIONS.flatMap(s => s.fields);

/**
 * Settings are a local draft of the saved values, loaded from the server. Nothing is saved while typing, an empty or
 * out-of-range box is reported rather than replaced with a default, and the whole block is read-only while the engine runs.
 */
export function EngineSettings({ state, onChanged }: { state: any; onChanged: () => void }) {
  const running = !!state.enabled;
  const limits = state.limits || {};
  const rotation = state.status?.rotation;
  const saved = (k: string) => String(state[k] ?? '');
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(f => [f.key, saved(f.key)])));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // The low-coverage priority lives with the Books settings; it is its own setting on the server, read and saved separately.
  const [priority, setPriority] = useState<{ enabled: boolean; target: number; share: number } | null>(null);
  const [priorityDraft, setPriorityDraft] = useState<{ enabled: boolean; target: string } | null>(null);

  useEffect(() => { api('/api/admin/ingest/book-priority').then(r => { if (r.ok) { setPriority(r.data.config); setPriorityDraft({ enabled: r.data.config.enabled, target: String(r.data.config.target) }); } }); }, []);

  // Follow the server until the person starts editing; never overwrite an edit in progress.
  useEffect(() => { if (!dirty) setDraft(Object.fromEntries(FIELDS.map(f => [f.key, saved(f.key)]))); }, [state.articleMinYear, state.bookMinYear, state.articlesPerJournal, state.discoverEvery, state.journalsPerPass, state.articlesPerPass, state.booksPerPass, dirty]);

  const errorFor = (k: string): string | null => {
    const v = draft[k] ?? ''; const { min, max } = limits[k] || {};
    if (v.trim() === '' || !/^\d+$/.test(v.trim())) return 'Enter a whole number.';
    if (min != null && (+v < min || +v > max)) return `Must be between ${min} and ${max}.`;
    return null;
  };
  const targetError = priorityDraft && (!/^\d+$/.test(priorityDraft.target.trim()) || +priorityDraft.target < 25 || +priorityDraft.target > 1000) ? 'Must be between 25 and 1000.' : null;
  const invalid = FIELDS.some(f => errorFor(f.key)) || !!targetError;

  const save = async () => {
    setSaving(true);
    const body = Object.fromEntries(FIELDS.map(f => [f.key, Number(draft[f.key])]));
    const r = await api('/api/admin/ingest/state', { method: 'POST', body });
    let ok = r.ok;
    if (!r.ok) toast.error(r.data?.error || 'Settings were not saved.');
    if (ok && priority && priorityDraft && (priorityDraft.enabled !== priority.enabled || Number(priorityDraft.target) !== priority.target)) {
      const p = await api('/api/admin/ingest/book-priority', { method: 'POST', body: { enabled: priorityDraft.enabled, target: Number(priorityDraft.target) } });
      if (p.ok) setPriority(p.data.config); else { ok = false; toast.error(p.data?.error || 'The book priority was not saved.'); }
    }
    setSaving(false);
    if (ok) { toast.success('Settings saved'); setDirty(false); onChanged(); }
  };

  const fieldHelp = (f: FieldDef) => rotation?.enabled && f.key === 'discoverEvery'
    ? 'Not used while the rotation is on: Everything mode already gives Journals, Articles and Books a turn each.'
    : rotation?.enabled && f.key === 'articlesPerPass'
      ? `Only when a journal has no limit: the most articles asked for in one request. Each turn checks up to ${N(rotation.batchSize || rotation.groups?.Articles?.batchSize || state.articlesPerPass || 0)} candidates.`
      : f.help;

  return (
    <section className="card card-pad" aria-labelledby="settings-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="settings-heading" className="text-base font-semibold text-ink">Engine settings</h2>
        {running && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted"><Lock size={13} aria-hidden="true" /> Read-only while the engine is running</span>}
      </div>
      {running && <p role="note" className="mt-2 text-[13px] text-ink-2">Pause the engine to edit ingestion settings.</p>}

      <div className="mt-4 space-y-5">
        {SECTIONS.map(sec => (
          <fieldset key={sec.title} className="border-t border-rule pt-4 first:border-t-0 first:pt-0">
            <legend className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">{sec.title}</legend>
            {sec.note && <p className="mt-1 text-[12.5px] text-ink-2">{sec.note}</p>}
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sec.fields.map(f => (
                <Field key={f.key} label={f.label} help={fieldHelp(f)} error={dirty ? errorFor(f.key) : null}>
                  <input className="input tabular-nums" inputMode="numeric" aria-label={`${sec.title}: ${f.label}`} value={draft[f.key] ?? ''} disabled={running || saving}
                    onChange={e => { setDraft(d => ({ ...d, [f.key]: e.target.value })); setDirty(true); }} />
                </Field>
              ))}
              {sec.title === 'Books' && priorityDraft && (
                <>
                  <Field label="Prioritize low-coverage Departments" help="When on, most Books turns go first to the department that holds the fewest books. Relevance rules are not loosened.">
                    <label className="flex h-10 items-center gap-2 text-[13.5px] text-ink">
                      <input type="checkbox" role="switch" checked={priorityDraft.enabled} disabled={running || saving}
                        onChange={e => { setPriorityDraft(p => p && { ...p, enabled: e.target.checked }); setDirty(true); }} />
                      {priorityDraft.enabled ? 'On' : 'Off'}
                    </label>
                  </Field>
                  <Field label="Minimum coverage target" help="Published books a department should hold before it stops being prioritised." error={dirty ? targetError : null}>
                    <input className="input tabular-nums" inputMode="numeric" aria-label="Books: Minimum coverage target" value={priorityDraft.target} disabled={running || saving}
                      onChange={e => { setPriorityDraft(p => p && { ...p, target: e.target.value }); setDirty(true); }} />
                  </Field>
                </>
              )}
            </div>
          </fieldset>
        ))}
      </div>

      {!running && (
        <div className="mt-5 flex gap-2">
          <Button onClick={save} loading={saving} disabled={!dirty || invalid}>{saving ? 'Saving…' : 'Save settings'}</Button>
          <Button variant="outline" onClick={() => { setDirty(false); if (priority) setPriorityDraft({ enabled: priority.enabled, target: String(priority.target) }); }} disabled={!dirty || saving}>Discard changes</Button>
        </div>
      )}
    </section>
  );
}
