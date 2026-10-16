import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field } from '../../ui';
import { ago, clock } from '../ingestion/format';

/**
 * AI providers: a PRIMARY and a FALLBACK, each with its own model, credential, connection test and runtime health.
 *
 * What this screen does with keys:
 *  - The saved key is HIDDEN. The server sends only its last four characters; the card shows "••••…Ab12". The full key is fetched only when
 *    a Super Admin presses Show (one POST to a dedicated endpoint, audited on the server; it returns the key in use, whether it was saved here or
 *    comes from the server environment), is held in this component's memory alone — never in storage, a URL, or the page's initial data — and is
 *    dropped from state on Hide, after 60 seconds, when the tab is hidden, or when the page is left.
 *  - The field for a NEW key is separate from the saved key and starts blank. Blank means "keep the saved key", always. Removing a key is its own
 *    button with its own confirmation.
 *  - A new key is tested (unsaved, in server memory) before Save is offered for it.
 * Everything is enforced on the server; hiding a button here is a courtesy. None of this turns the public assistant on or off.
 */
type Health = {
  state: 'healthy' | 'degraded' | 'rate_limited' | 'cooling_down' | 'unavailable' | 'not_configured';
  consecutiveFailures: number; cooldownUntil: string | null; lastSuccessAt: string | null;
  lastError: { category: string; at: string; status?: number } | null;
  last24h: { requests: number; answered: number; errors: number; avgLatencyMs: number | null };
};
type Card_ = {
  id: 'gemini' | 'grok'; label: string; role: 'primary' | 'fallback'; model: string; models: string[];
  credentialConfigured: boolean; credentialSource: 'admin' | 'environment' | 'none';
  adminKeyConfigured: boolean; adminKeyUnreadable: boolean; lastFour: string | null;
  lastChangedAt: string | null; lastChangedBy: string | null;
  health: Health;
  lastTest: { ok: boolean; category: string | null; message: string | null; at: string; latencyMs?: number | null; model?: string | null; httpStatus?: number | null; endpoint?: string | null } | null;
  lastErrorMessage: string | null;
};
type Data = {
  fallbackEnabled: boolean; primaryProvider: 'gemini' | 'grok'; fallbackProvider: 'gemini' | 'grok';
  primary: Card_; fallback: Card_; canStoreKey: boolean;
  failover: { primaryUsable: boolean; fallbackUsable: boolean };
  routing: { requests: number; primaryAnswered: number; fallbackActivated: number; fallbackAnswered: number; bothFailed: number; fallbackSuccessRate: number | null };
  events: { at: string; type: string; provider?: string; category?: string }[];
  auditEvents: { at: string; action: string; by: string | null; provider: string | null; detail: string | null }[];
  last24h: { answered: number; errors: number; timeouts: number; fallbacks: number } | null;
};

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const jsonHeaders = () => ({ ...auth(), 'Content-Type': 'application/json' });
const label = (c: string) => c.toLowerCase().replace(/_/g, ' ').replace(/^./, m => m.toUpperCase());
const PROVIDER_NAME = { gemini: 'Google Gemini', grok: 'xAI Grok' } as const;
const SOURCE = { admin: 'Admin configuration', environment: 'Server environment', none: 'Not configured' } as const;
const HEALTH: Record<Health['state'], [string, 'success' | 'caution' | 'alarm' | 'neutral']> = {
  healthy: ['Healthy', 'success'], degraded: ['Degraded', 'caution'], rate_limited: ['Rate limited', 'caution'],
  cooling_down: ['Cooling down', 'caution'], unavailable: ['Unavailable', 'alarm'], not_configured: ['Not configured', 'neutral'],
};
const REVEAL_MS = 60_000;
const EVENT_TEXT: Record<string, string> = {
  AI_PROVIDER_KEY_ADDED: 'API key added', AI_PROVIDER_KEY_REPLACED: 'API key replaced', AI_PROVIDER_KEY_REMOVED: 'API key removed',
  AI_PROVIDER_KEY_REVEALED: 'Saved API key shown', AI_PROVIDER_MODEL_CHANGED: 'Model changed', AI_PROVIDER_CONNECTION_TESTED: 'Connection tested',
  AI_PRIMARY_PROVIDER_CHANGED: 'Primary provider changed', AI_FALLBACK_ENABLED: 'Automatic fallback turned on', AI_FALLBACK_DISABLED: 'Automatic fallback turned off',
  AI_ASSISTANT_ENABLED: 'Assistant enabled', AI_ASSISTANT_DISABLED: 'Assistant disabled',
  circuit_opened: 'Provider rested after failures', circuit_closed: 'Provider recovered', fallback_used: 'Fallback answered a question', both_failed: 'No provider could answer',
};

function ProviderCard({ p, canStoreKey, onState }: { p: Card_; canStoreKey: boolean; onState: (d: Data) => void }) {
  const [model, setModel] = useState(p.model);
  const [newKey, setNewKey] = useState('');
  // What passed a test: the exact key typed ('' = the key already in use) and the exact model. Save is offered only for that same pair.
  const [tested, setTested] = useState<{ key: string; model: string } | null>(null);
  const [busy, setBusy] = useState<null | 'test' | 'save' | 'remove' | 'reveal'>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = `/api/admin/ai-assistant/providers/${p.id}`;

  useEffect(() => { setModel(p.model); }, [p.model]);
  const hide = useCallback(() => { if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = null; setRevealed(null); }, []);
  // The key never outlives the moment it was asked for: not the tab being hidden, not the page being left, not a change of provider state.
  useEffect(() => {
    const onVis = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', hide);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', hide); hide(); };
  }, [hide]);
  useEffect(() => { hide(); }, [p.lastChangedAt, p.adminKeyConfigured, hide]);

  const typed = newKey.trim() !== '';
  const modelChanged = model !== p.model;
  // Save is offered only after a successful test of EXACTLY what would be saved: this key (or the one in use, if none is typed) with this model, on
  // the endpoint the assistant really calls. Change the key or the model afterwards and Save goes away until it is tested again. (The server tests
  // again before it changes anything, so this is a guide for the person, not the guard.)
  const passed = tested?.key === newKey.trim() && tested.model === model;
  const canSave = (typed || modelChanged) && passed && (!typed || canStoreKey);
  const clearKey = () => { setNewKey(''); setTested(null); if (input.current) input.current.value = ''; };
  const [hl, tone] = HEALTH[p.health.state];

  const test = async () => {
    setBusy('test'); setResult(null);
    try {
      const res = await fetch(`${base}/test`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ model, ...(typed ? { apiKey: newKey.trim() } : {}) }) });
      const b = await res.json().catch(() => ({}));
      const ok = res.ok && b.ok === true;
      // The provider's own wording, then the plain facts: HTTP status and category (never the key, never a header), and what was asked.
      const facts = [b.httpStatus ? `HTTP ${b.httpStatus}` : null, !ok && b.category ? label(b.category) : null, b.model || model, b.endpoint || null, b.latencyMs != null ? `${b.latencyMs} ms` : null].filter(Boolean).join(' · ');
      const said = !ok && b.providerMessage ? ` xAI says: "${b.providerMessage}"${b.providerCode ? ` [${b.providerCode}]` : ''}`.replace('xAI', PROVIDER_NAME[p.id]) : '';
      setResult({ ok, text: `${ok ? 'Connection successful.' : b.message || b.error || 'The test could not be run.'}${said}${facts ? `  (${facts})` : ''}` });
      if (ok) setTested({ key: newKey.trim(), model }); else setTested(null);
      const fresh = await (await fetch('/api/admin/ai-assistant/providers', { headers: auth(), cache: 'no-store' })).json().catch(() => null);
      if (fresh?.primary) onState(fresh);          // a refresh that failed (rate limit, network) is ignored, never adopted
    } catch { setResult({ ok: false, text: 'Could not reach the server.' }); }
    finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('save'); setResult(null);
    try {
      const res = await fetch(base, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ model, ...(typed ? { apiKey: newKey.trim() } : {}) }) });
      const b = await res.json().catch(() => ({}));
      clearKey();                                   // the key has left this page either way
      if (!res.ok || !b.ok) { setResult({ ok: false, text: b.error || 'The settings could not be saved.' }); return; }
      onState(b.state);
      toast.success(b.changed?.key || b.changed?.model ? `${PROVIDER_NAME[p.id]} settings saved.` : 'Nothing needed changing.');
    } catch { setResult({ ok: false, text: 'Could not reach the server.' }); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      const res = await fetch(`${base}/remove-key`, { method: 'POST', headers: jsonHeaders(), body: '{}' });
      const b = await res.json().catch(() => ({}));
      setConfirmRemove(false);
      if (!res.ok || !b.ok) { toast.error(b.error || 'The key could not be removed.'); return; }
      hide(); onState(b.state); toast.success(`${PROVIDER_NAME[p.id]} API key removed.`);
    } catch { toast.error('Could not reach the server.'); }
    finally { setBusy(null); }
  };

  const reveal = async () => {
    setBusy('reveal');
    try {
      const res = await fetch(`${base}/reveal-key`, { method: 'POST', headers: jsonHeaders(), body: '{}', cache: 'no-store' });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.ok || typeof b.apiKey !== 'string') { toast.error(b.error || 'The key could not be shown.'); return; }
      setRevealed(b.apiKey);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, REVEAL_MS);
    } catch { toast.error('Could not reach the server.'); }
    finally { setBusy(null); }
  };

  const masked = p.lastFour ? `${'•'.repeat(20)}${p.lastFour}` : p.credentialConfigured ? '•'.repeat(24) : 'No key saved';
  // The last test of THIS model failed: say so in the provider's own words, next to the model, until it is tested again.
  const failedForModel = !!p.lastTest && !p.lastTest.ok && !!p.lastTest.message && p.lastTest.model === model;
  const facts: [string, string][] = [
    ['Credential status', p.credentialConfigured ? 'Configured' : 'Not configured'],
    ['Credential source', SOURCE[p.credentialSource]],
    ['Secure admin storage', canStoreKey ? 'Available' : 'Unavailable'],
    ['Last connection test', p.lastTest ? `${p.lastTest.ok ? 'Success' : `Failed — ${p.lastTest.httpStatus ? `HTTP ${p.lastTest.httpStatus} · ` : ''}${label(p.lastTest.category || 'error')}`}${p.lastTest.model ? ` (${p.lastTest.model})` : ''} · ${ago(p.lastTest.at)}${p.lastTest.latencyMs != null ? ` · ${p.lastTest.latencyMs} ms` : ''}` : 'Not tested yet'],
    ['Runtime health', `${hl}${p.health.cooldownUntil ? ` · retry after ${clock(p.health.cooldownUntil)}` : ''}`],
    ['Last successful answer', p.health.lastSuccessAt ? ago(p.health.lastSuccessAt) : 'None yet'],
    ['Last provider error', p.health.lastError ? `${p.health.lastError.status ? `HTTP ${p.health.lastError.status} · ` : ''}${label(p.health.lastError.category)} · ${ago(p.health.lastError.at)}` : 'None recorded'],
    ['Failures in a row', String(p.health.consecutiveFailures)],
    ['Requests, 24 h', `${p.health.last24h.requests} · ${p.health.last24h.answered} answered · ${p.health.last24h.errors} errors`],
    ['Average latency', p.health.last24h.avgLatencyMs != null ? `${p.health.last24h.avgLatencyMs} ms` : '—'],
  ];

  return (
    <Card className="mt-4">
      <CardHeader
        title={<span className="flex flex-wrap items-center gap-2"><KeyRound size={18} aria-hidden="true" /> {p.role === 'primary' ? 'Primary provider' : 'Fallback provider'} — {PROVIDER_NAME[p.id]} <Badge tone={tone} dot>{hl}</Badge></span>}
        description={p.role === 'primary' ? 'Asked first for every question.' : 'Asked only when the primary could not answer. Visitors are never told which provider answered.'} />

      <dl className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([l, v]) => (
          <div key={l} className="bg-surface px-3.5 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt>
            <dd className="mt-0.5 break-words text-sm font-semibold text-ink">{v}</dd>
          </div>
        ))}
        {/* The grid's gap colour shows through an empty cell, so the last row is filled out. */}
        {Array.from({ length: (3 - (facts.length % 3)) % 3 }, (_, i) => <div key={`pad${i}`} className="hidden bg-surface lg:block" aria-hidden="true" />)}
      </dl>
      {p.lastTest?.ok && p.health.state !== 'healthy' && p.health.state !== 'not_configured' && (
        <p role="note" className="mt-3 rounded-lg bg-caution-soft px-3 py-2 text-[13px] text-ink">
          The connection test passed, but real visitor questions are failing, so runtime health is <b>{hl}</b>. A test is one short request; runtime health is what visitors actually get.
        </p>
      )}
      {p.adminKeyUnreadable && (
        <p role="alert" className="mt-3 rounded-lg bg-caution-soft px-3 py-2 text-[13px] text-ink">
          The saved Admin key cannot be opened with this server’s encryption key{p.credentialSource === 'environment' ? ', so the server environment key is being used' : ''}. Enter the key again to replace it.
        </p>
      )}

      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider"><input className="input" value={PROVIDER_NAME[p.id]} readOnly aria-readonly="true" /></Field>
          <Field label="Model">
            <select className="input" value={model} onChange={e => { setModel(e.target.value); setResult(null); }}>
              {p.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        {failedForModel && !result && <p role="alert" className="-mt-2 text-[13px] font-semibold text-alarm">{p.lastTest!.message}{p.lastTest!.httpStatus ? ` (HTTP ${p.lastTest!.httpStatus})` : ''}</p>}

        <Field label="Saved API key" help={p.credentialSource === 'admin' ? 'Saved here, encrypted. Hidden by default; Show reveals it for 60 seconds and the reveal is recorded.' : p.credentialSource === 'environment' ? 'Provided by the server environment. Hidden by default; Show reveals it for 60 seconds and the reveal is recorded. Saving a key here overrides it.' : 'No key is configured.'}>
          <div className="flex items-center gap-2">
            <input className="input font-mono" readOnly aria-readonly="true" value={revealed ?? masked} aria-label={`Saved ${PROVIDER_NAME[p.id]} API key`} autoComplete="off" spellCheck={false}
              type="text" data-lpignore="true" />
            {revealed
              ? <Button type="button" variant="outline" onClick={hide}><EyeOff size={16} aria-hidden="true" /> Hide</Button>
              : <Button type="button" variant="outline" onClick={reveal} loading={busy === 'reveal'} disabled={!p.credentialConfigured || !!busy}
                  title={p.credentialConfigured ? 'Show the key in use (Super Admin only; every reveal is recorded)' : 'No key is configured'}><Eye size={16} aria-hidden="true" /> Show</Button>}
          </div>
        </Field>

        {!canStoreKey && (
          <div role="alert" className="rounded-lg border border-caution/40 bg-caution-soft px-3.5 py-3 text-[13px] leading-relaxed text-ink">
            <p className="font-semibold">Secure API key storage unavailable</p>
            <p className="mt-1">Secure credential storage is unavailable because <b>AI_SECRET_ENCRYPTION_KEY</b> is not configured on this server. New API keys cannot be saved until it is set (in <code>.env</code> locally, or as an environment variable in Coolify) and the server is restarted.
              You can still change the model and test the key already in use{p.credentialSource === 'environment' ? ' (it comes from the server environment)' : ''}.</p>
          </div>
        )}
        <Field label="Replace API key" help={canStoreKey ? 'Leave blank to keep the current key. Test a new key first; it is saved only after it passes. A new key here overrides the server-environment key.' : 'Unavailable until secure storage is configured (see above).'}>
          <input ref={input} className="input" type="password" name={`ai-${p.id}-new-secret`} autoComplete="new-password" spellCheck={false} autoCapitalize="off" autoCorrect="off"
            maxLength={512} placeholder={canStoreKey ? `Enter a new ${PROVIDER_NAME[p.id]} key to replace the current key` : 'Secure storage unavailable'} value={newKey} disabled={!canStoreKey}
            onChange={e => { setNewKey(e.target.value); setResult(null); }} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={test} loading={busy === 'test'} disabled={!!busy || (!typed && !p.credentialConfigured)}>Test connection</Button>
          <Button type="button" variant="brand" onClick={save} loading={busy === 'save'} disabled={!!busy || !canSave}>Save configuration</Button>
          {p.adminKeyConfigured && <Button type="button" variant="danger" onClick={() => setConfirmRemove(true)} disabled={!!busy} className="sm:ml-auto">Remove API key</Button>}
        </div>
        {(typed || modelChanged) && !passed && <p className="text-xs text-muted">Test {typed ? 'this new key' : 'this model'} with the selected model to enable Save.</p>}
        {result && (
          <p role={result.ok ? 'status' : 'alert'} aria-live="polite" className={`rounded-lg px-3 py-2 text-[13px] text-ink ${result.ok ? 'bg-success-soft' : 'bg-caution-soft'}`}>
            {result.ok ? <Badge tone="success" dot>Success</Badge> : <Badge tone="alarm">Failed</Badge>} <span className="ml-1">{result.text}</span>
          </p>
        )}
        {p.adminKeyConfigured && p.lastChangedAt && <p className="text-xs text-muted">Key last changed {ago(p.lastChangedAt)}{p.lastChangedBy ? ` by ${p.lastChangedBy}` : ''}. Encrypted on the server; the full key is never sent unless you press Show.</p>}
      </div>

      <ConfirmDialog
        open={confirmRemove} onClose={() => busy !== 'remove' && setConfirmRemove(false)} onConfirm={remove} danger loading={busy === 'remove'}
        title={`Remove the saved ${PROVIDER_NAME[p.id]} API key?`}
        description={`The provider may stop working unless a server-environment fallback credential is available. The other provider is not affected.`}
        confirmLabel="Remove key" />
    </Card>
  );
}

export function AiProviders({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-assistant/providers', { headers: auth(), cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.primary) { setData(body); setFailed(false); } else setFailed(true);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  const adopt = (d: Data) => { if (!d || !d.primary || !d.fallback) return; setData(prev => ({ ...(prev as Data), ...d, auditEvents: d.auditEvents ?? prev?.auditEvents ?? [], last24h: d.last24h ?? prev?.last24h ?? null })); onChanged?.(); load(); };

  const failover = async (patch: { primary?: string; fallbackEnabled?: boolean }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-assistant/providers/failover', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(patch) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.ok) { toast.error(b.error || 'The setting could not be saved.'); return; }
      toast.success('Failover settings saved.'); adopt(b.state);
    } catch { toast.error('Could not reach the server.'); }
    finally { setSaving(false); }
  };

  if (failed && !data) return <Card className="mt-4"><CardHeader title="AI providers" /><p className="text-sm text-muted">The provider settings could not be loaded. <button type="button" className="font-semibold text-accent underline" onClick={load}>Try again</button></p></Card>;
  if (!data) return null;
  const { primary, fallback } = data;
  const r = data.routing;
  const nobody = !data.failover.primaryUsable && !data.failover.fallbackUsable;

  return (
    <>
      <Card className="mt-4">
        <CardHeader title={<span className="flex flex-wrap items-center gap-2"><ShieldCheck size={18} aria-hidden="true" /> Credential storage {data.canStoreKey ? <Badge tone="success" dot>Healthy</Badge> : <Badge tone="caution">Not configured</Badge>}</span>}
          description={data.canStoreKey ? 'API keys entered here are encrypted on the server before they are stored. The encryption key is never shown.' : 'Set AI_SECRET_ENCRYPTION_KEY on the server to enable encrypted Admin API-key storage.'} />
        {!data.canStoreKey && <p role="note" className="text-[13px] text-ink">Until then, new API keys cannot be saved here. Keys already provided by the server environment keep working, and can be tested and shown.</p>}
      </Card>
      {nobody && <p role="alert" className="mt-4 rounded-lg bg-caution-soft px-3 py-2 text-[13px] text-ink">No AI provider is configured, so visitors cannot use the AI chat (Get a quote and WhatsApp still work). Add a key below.</p>}
      {!nobody && !data.failover.primaryUsable && (
        <p role="note" className="mt-4 rounded-lg bg-caution-soft px-3 py-2 text-[13px] text-ink">
          The primary provider ({PROVIDER_NAME[primary.id]}) has no credential. {data.failover.fallbackUsable ? `${PROVIDER_NAME[fallback.id]} is answering questions because automatic fallback is on.` : 'Nothing can answer until a key is added.'}
        </p>
      )}

      <ProviderCard key={primary.id + primary.role} p={primary} canStoreKey={data.canStoreKey} onState={adopt as any} />
      <ProviderCard key={fallback.id + fallback.role} p={fallback} canStoreKey={data.canStoreKey} onState={adopt as any} />

      <Card className="mt-4">
        <CardHeader title={<span className="flex items-center gap-2"><RouteIcon size={18} aria-hidden="true" /> Failover settings</span>}
          description="If the primary cannot answer, the same question goes to the fallback, once. The visitor sees a normal answer and uses one question." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Automatic fallback">
            <select className="input" value={data.fallbackEnabled ? 'on' : 'off'} disabled={saving} onChange={e => failover({ fallbackEnabled: e.target.value === 'on' })}>
              <option value="on">On</option><option value="off">Off</option>
            </select>
          </Field>
          <Field label="Primary">
            <select className="input" value={data.primaryProvider} disabled={saving} onChange={e => failover({ primary: e.target.value })}>
              <option value="gemini">Google Gemini</option><option value="grok">xAI Grok</option>
            </select>
          </Field>
          <Field label="Fallback"><input className="input" readOnly aria-readonly="true" value={PROVIDER_NAME[data.fallbackProvider]} /></Field>
        </div>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['Questions, 24 h', r.requests], ['Answered by primary', r.primaryAnswered], ['Fallback used', r.fallbackActivated],
            ['Fallback answered', r.fallbackAnswered], ['Both failed', r.bothFailed], ['Fallback success', r.fallbackSuccessRate != null ? `${r.fallbackSuccessRate}%` : '—'],
          ] as [string, string | number][]).map(([l, v]) => (
            <div key={l} className="bg-surface px-3.5 py-2.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt><dd className="mt-0.5 text-sm font-semibold text-ink">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">These figures are internal and are never shown to visitors. Changing them does not turn the AI Assistant on or off.</p>
      </Card>

      {(data.auditEvents.length > 0 || data.events.length > 0) && (
        <Card className="mt-4">
          <CardHeader title="Recent AI events" description="Configuration changes and provider events. Keys are never recorded." />
          <ul className="divide-y divide-rule text-sm">
            {[...data.auditEvents.map(e => ({ at: e.at, text: EVENT_TEXT[e.action] || label(e.action.replace(/^AI_/, '')), who: e.by, provider: e.provider, extra: e.detail && e.action === 'AI_PROVIDER_CONNECTION_TESTED' ? label(e.detail) : null })),
              ...data.events.map(e => ({ at: e.at, text: EVENT_TEXT[e.type] || e.type, who: null as string | null, provider: e.provider ?? null, extra: e.category ? label(e.category) : null }))]
              .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map((e, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium text-ink">{e.text}{e.provider ? ` · ${PROVIDER_NAME[e.provider as 'gemini' | 'grok'] ?? e.provider}` : ''}{e.extra ? ` · ${e.extra}` : ''}</span>
                  <span className="text-muted">{e.who ? `${e.who} · ` : ''}{new Date(e.at).toLocaleString()}</span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </>
  );
}
