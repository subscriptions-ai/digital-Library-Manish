import { useCallback, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, PageHeader, Skeleton } from '../../ui';
import { ago } from '../ingestion/format';

/**
 * The master switch for the public AI assistant. The server holds the value and enforces it; this screen only shows it and
 * asks for a change. Super admin only (the whole admin area is). Nothing on it is a key, a token or a billing detail.
 */
type SwitchState = {
  enabled: boolean; everChanged: boolean; changedAt: string | null; changedBy: string | null;
  history: { at: string; action: string; by: string | null }[];
  provider: { name: string; model: string } | null;
  lastAnswerAt: string | null;
  last24h: { answered: number; errors: number; timeouts: number } | null;
};

/** "just now", "1 min ago", "3 h ago", "2 days ago". */
function since(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export function AdminAiAssistant() {
  const [data, setData] = useState<SwitchState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-assistant/switch', { headers: auth() });
      const body = await res.json().catch(() => null);
      if (res.ok && typeof body?.enabled === 'boolean') { setData(body); setFailed(false); } else setFailed(true);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-assistant/switch', { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body?.error || 'The setting could not be changed.'); return; }
      toast.success(enabled ? 'AI Assistant enabled.' : 'AI Assistant disabled.');
      setConfirmOff(false);
      await load();
    } catch { toast.error('Could not reach the server.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Public AI Assistant" description="Control whether visitors can use the AI Assistant on the public website." />

      {failed && !data && <Card><ErrorState title="The setting could not be loaded" onRetry={load} /></Card>}
      {!failed && !data && <Card><Skeleton className="h-6 w-40" /><Skeleton className="mt-4 h-9 w-56" /></Card>}

      {data && (
        <>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Bot size={18} aria-hidden="true" /> AI Assistant</span>} description="Public AI chat for STM Digital Library." />

            <p className="flex items-center gap-2 text-sm text-ink" role="status" aria-live="polite">
              <span className="font-semibold">Status:</span>
              {data.enabled
                ? <Badge tone="success" dot>Enabled</Badge>
                : <Badge tone="neutral">○ Disabled</Badge>}
            </p>

            <div className="mt-4">
              {data.enabled
                ? <Button key="disable" variant="danger" onClick={() => setConfirmOff(true)} loading={saving}>Disable AI Assistant</Button>
                : <Button key="enable" variant="brand" onClick={() => change(true)} loading={saving}>Enable AI Assistant</Button>}
            </div>

            <p className="mt-4 text-sm text-muted">
              {data.enabled
                ? 'Disable the public AI chat if the provider is unavailable, the API quota is exhausted, or maintenance is required. Get a quote and WhatsApp will remain available.'
                : 'The public AI chat is off. Visitors see only the Get a quote form, and the server refuses every chat request. Enable it again when the provider is ready. WhatsApp remains available.'}
            </p>
            {data.changedAt && (
              <p className="mt-3 text-xs text-muted">Last changed {since(data.changedAt)}{data.changedBy ? ` by ${data.changedBy}` : ''}.</p>
            )}
          </Card>

          <Card className="mt-4">
            <CardHeader title="Provider" description="Read from the server's settings. Keys and credentials are never shown here." />
            <dl className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4">
              {([
                ['Provider', data.provider ? `${data.provider.name} · ${data.provider.model}` : '—'],
                ['Last answer', data.lastAnswerAt ? ago(data.lastAnswerAt) : 'None yet'],
                ['Answered, 24 h', data.last24h ? String(data.last24h.answered) : '—'],
                ['Provider errors, 24 h', data.last24h ? String(data.last24h.errors) : '—'],
              ] as const).map(([l, v]) => (
                <div key={l} className="bg-surface px-3.5 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {data.last24h && data.last24h.errors > 0 && data.enabled && (
              <p role="note" className="mt-3 rounded-lg bg-caution-soft px-3 py-2 text-[13px] text-ink">
                The provider returned errors in the last 24 hours. If the key, quota or billing has a problem, you can turn the assistant off here.
              </p>
            )}
            <p className="mt-3 text-xs text-muted">The assistant is never switched off or on automatically; only an admin changes it.</p>
          </Card>

          {data.history.length > 0 && (
            <Card className="mt-4">
              <CardHeader title="Recent changes" />
              <ul className="divide-y divide-rule text-sm">
                {data.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium text-ink">{h.action === 'AI_ASSISTANT_ENABLED' ? 'Enabled' : 'Disabled'}</span>
                    <span className="text-muted">{h.by ? `${h.by} · ` : ''}{new Date(h.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOff} onClose={() => !saving && setConfirmOff(false)} onConfirm={() => change(false)} danger loading={saving}
        title="Disable AI Assistant?"
        description="Visitors will no longer see the AI chat, but quotation and WhatsApp options will remain available."
        confirmLabel="Disable"
      />
    </div>
  );
}
