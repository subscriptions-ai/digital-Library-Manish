import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field } from '../../ui';
import { ago } from '../ingestion/format';

/**
 * "AI Provider Configuration": which provider and model the assistant uses, and the API key behind it.
 *
 * The key field is write-only. The server never sends a key back (not whole, not a few characters, not a placeholder), so there is
 * nothing here to prefill: a blank field means "leave the key as it is". The typed key lives in this component's state only until
 * the request returns, is never put in storage, a URL or a log, and is cleared as soon as it has been sent. Every action is enforced on the
 * server; hiding a button here is a courtesy. This screen has nothing to do with turning the assistant on or off.
 */
type State = {
  providers: { id: string; label: string; models: string[] }[];
  provider: string; model: string;
  keyConfigured: boolean; adminKeyConfigured: boolean; adminKeyUnreadable: boolean; canStoreKey: boolean;
  credentialSource: 'admin' | 'environment' | 'none';
  updatedAt: string | null; updatedBy: string | null;
  lastTest: { ok: boolean; category: string | null; message: string | null; at: string; by: string | null } | null;
  lastError: { category: string; message: string; at: string } | null;
};

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const json = () => ({ ...auth(), 'Content-Type': 'application/json' });
const SOURCE = { admin: 'Admin configuration', environment: 'Server environment', none: 'None' } as const;
const label = (c: string) => c.toLowerCase().replace(/_/g, ' ').replace(/^./, m => m.toUpperCase());

export function AiProviderConfig({ onChanged }: { onChanged?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<null | 'test' | 'save' | 'remove'>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const keyInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-assistant/provider', { headers: auth() });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.provider) { setState(body); setModel(m => m || body.model); setLoadFailed(false); } else setLoadFailed(true);
    } catch { setLoadFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const provider = state?.provider ?? 'gemini';
  const models = state?.providers.find(p => p.id === provider)?.models ?? [];
  const typed = apiKey.trim() !== '';
  const modelChanged = !!state && model !== state.model;
  const canSave = !!state && (typed || modelChanged) && (!typed || state.canStoreKey);

  const clearKey = () => { setApiKey(''); if (keyInput.current) keyInput.current.value = ''; };
  const payload = () => ({ provider, model, ...(typed ? { apiKey: apiKey.trim() } : {}) });

  const test = async () => {
    setBusy('test'); setResult(null);
    try {
      const res = await fetch('/api/admin/ai-assistant/provider/test', { method: 'POST', headers: json(), body: JSON.stringify(payload()) });
      const b = await res.json().catch(() => ({}));
      setResult(res.ok && b.ok ? { ok: true, text: 'Connection successful.' } : { ok: false, text: b.message || b.error || 'The test could not be run.' });
      load();
    } catch { setResult({ ok: false, text: 'Could not reach the server.' }); }
    finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('save'); setResult(null);
    try {
      const res = await fetch('/api/admin/ai-assistant/provider', { method: 'POST', headers: json(), body: JSON.stringify(payload()) });
      const b = await res.json().catch(() => ({}));
      clearKey();                                     // the key has left this page either way
      setConfirmSave(false);
      if (!res.ok || !b.ok) { setResult({ ok: false, text: b.error || 'The settings could not be saved.' }); load(); return; }
      setState(b.state); setModel(b.state.model);
      toast.success(b.changed?.key || b.changed?.model ? 'AI provider settings saved and active.' : 'Nothing needed changing.');
      setResult(null);
      onChanged?.();
    } catch { setResult({ ok: false, text: 'Could not reach the server.' }); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      const res = await fetch('/api/admin/ai-assistant/provider/remove-key', { method: 'POST', headers: json(), body: '{}' });
      const b = await res.json().catch(() => ({}));
      setConfirmRemove(false);
      if (!res.ok || !b.ok) { toast.error(b.error || 'The key could not be removed.'); return; }
      setState(b.state); toast.success('Admin API key removed.'); onChanged?.();
    } catch { toast.error('Could not reach the server.'); }
    finally { setBusy(null); }
  };

  if (loadFailed && !state) {
    return <Card className="mt-4"><CardHeader title="AI Provider Configuration" /><p className="text-sm text-muted">The provider settings could not be loaded. <button type="button" className="font-semibold text-accent underline" onClick={load}>Try again</button></p></Card>;
  }
  if (!state) return null;

  const credLabel = state.keyConfigured ? 'Configured' : 'Not configured';

  return (
    <Card className="mt-4">
      <CardHeader title={<span className="flex items-center gap-2"><KeyRound size={18} aria-hidden="true" /> AI Provider Configuration</span>}
        description="The provider, model and API key the assistant uses. Changes apply to the next question, with no restart." />

      <dl className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['Credential status', credLabel],
          ['Credential source', SOURCE[state.credentialSource]],
          ['Last connection test', state.lastTest ? `${state.lastTest.ok ? 'Success' : 'Failed'} · ${ago(state.lastTest.at)}` : 'Not tested yet'],
          ['Last provider error', state.lastError ? `${label(state.lastError.category)} · ${ago(state.lastError.at)}` : 'None recorded'],
        ] as const).map(([l, v]) => (
          <div key={l} className="bg-surface px-3.5 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {state.adminKeyUnreadable && (
        <p role="alert" className="mt-3 rounded-lg bg-caution-soft px-3 py-2 text-[13px] text-ink">
          The stored Admin key cannot be opened with this server's encryption key{state.credentialSource === 'environment' ? ', so the server environment key is being used' : ''}. Enter the key again to replace it.
        </p>
      )}
      {!state.canStoreKey && (
        <p role="note" className="mt-3 rounded-lg bg-caution-soft px-3 py-2 text-[13px] text-ink">
          This server has no encryption key set, so a new API key cannot be stored from here. Ask whoever manages the server to set <b>AI_SECRET_ENCRYPTION_KEY</b>. You can still change the model.
        </p>
      )}

      <form className="mt-4 grid gap-4" onSubmit={e => { e.preventDefault(); if (canSave && !busy) setConfirmSave(true); }} autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <select className="input" value={provider} disabled={state.providers.length < 2} onChange={() => { /* one provider is implemented */ }}>
              {state.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <select className="input" value={model} onChange={e => { setModel(e.target.value); setResult(null); }}>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        <Field label="API Key"
          help={state.adminKeyConfigured ? 'API Key: Configured. Leave blank to keep it; enter a new key to replace it.' : state.credentialSource === 'environment' ? 'The server environment provides a key. Enter one here to override it.' : 'No key is set. Enter one to activate the assistant’s provider.'}>
          <input
            ref={keyInput} className="input" type="password" name="ai-provider-secret" autoComplete="new-password" spellCheck={false}
            autoCapitalize="off" autoCorrect="off" maxLength={512} placeholder={state.adminKeyConfigured ? 'Enter a new key to replace the current one' : 'Paste API key'}
            value={apiKey} onChange={e => { setApiKey(e.target.value); setResult(null); }} disabled={!state.canStoreKey}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={test} loading={busy === 'test'} disabled={!!busy || (!typed && !state.keyConfigured)}>Test connection</Button>
          <Button type="submit" variant="brand" loading={busy === 'save'} disabled={!!busy || !canSave}>Save &amp; activate</Button>
          {state.adminKeyConfigured && (
            <Button type="button" variant="danger" onClick={() => setConfirmRemove(true)} disabled={!!busy} className="sm:ml-auto">Remove Admin API Key</Button>
          )}
        </div>

        {result && (
          <p role={result.ok ? 'status' : 'alert'} aria-live="polite"
            className={`rounded-lg px-3 py-2 text-[13px] text-ink ${result.ok ? 'bg-success-soft' : 'bg-caution-soft'}`}>
            {result.ok ? <Badge tone="success" dot>Success</Badge> : <Badge tone="alarm">Failed</Badge>} <span className="ml-1">{result.text}</span>
          </p>
        )}
      </form>

      <p className="mt-4 text-xs text-muted">API keys are encrypted server-side and are never displayed after saving.</p>
      {state.adminKeyConfigured && state.updatedAt && (
        <p className="mt-1 text-xs text-muted">Key last changed {ago(state.updatedAt)}{state.updatedBy ? ` by ${state.updatedBy}` : ''}.</p>
      )}

      <ConfirmDialog
        open={confirmSave} onClose={() => busy !== 'save' && setConfirmSave(false)} onConfirm={save} loading={busy === 'save'}
        title="Activate these AI provider settings?"
        description={typed && state.adminKeyConfigured
          ? 'Activate this new AI provider key? The previous Admin-configured credential will be replaced.'
          : 'The connection will be tested first. Settings change only if the test succeeds.'}
        confirmLabel="Save & activate"
      />
      <ConfirmDialog
        open={confirmRemove} onClose={() => busy !== 'remove' && setConfirmRemove(false)} onConfirm={remove} danger loading={busy === 'remove'}
        title="Remove the Admin-configured AI credential?"
        description="Removing this key will make the server use its environment credential if one is configured."
        confirmLabel="Remove key"
      />
    </Card>
  );
}
