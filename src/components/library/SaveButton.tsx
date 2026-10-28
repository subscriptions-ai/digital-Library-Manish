import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { friendlyError } from '../../lib/friendlyError';

/**
 * The heart. One control and one list of what this reader has saved, shared by the reader, the article page and the library results, so
 * the same item is filled or empty everywhere at once.
 *
 * The heart only changes after the server has said so. A save that fails leaves it as it was and says why; it is never shown as saved on hope.
 * Everything is the signed-in reader's own: the list comes from /api/user/favorites/ids, keyed on the token, and is dropped when the token changes.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';
const store = { token: '', ids: new Set<string>(), status: 'idle' as Status, listeners: new Set<() => void>(), version: 0 };
const emit = () => { store.version++; store.listeners.forEach(l => l()); };

const tokenNow = () => { try { return localStorage.getItem('token') || ''; } catch { return ''; } };
const headers = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function load(force = false) {
  const token = tokenNow();
  // A different person on the same browser must never see the previous person's hearts.
  if (store.token !== token) { store.token = token; store.ids = new Set(); store.status = 'idle'; }
  if (!token || store.status === 'loading' || (store.status === 'ready' && !force)) return;
  store.status = 'loading'; emit();
  try {
    const r = await fetch('/api/user/favorites/ids', { headers: headers(token) });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    if (store.token !== token) return;
    store.ids = new Set<string>(Array.isArray(d?.ids) ? d.ids : []);
    store.status = 'ready';
  } catch {
    if (store.token === token) store.status = 'error';
  }
  emit();
}

/** Asks the server to flip the heart. Resolves to the new state, or throws with a sentence the reader can act on. */
async function toggle(id: string): Promise<boolean> {
  const token = tokenNow();
  let r: Response;
  try { r = await fetch('/api/user/favorites', { method: 'POST', headers: headers(token), body: JSON.stringify({ contentId: id }) }); }
  catch (e) { throw new Error(friendlyError(e, 'Could not reach the server. Your saved items were not changed.')); }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.success) throw new Error(friendlyError(d?.error ? { status: r.status, error: d.error } : { status: r.status }, 'Could not update your saved items.'));
  if (store.token !== token) { store.token = token; store.ids = new Set(); }
  if (d.favorited) store.ids.add(id); else store.ids.delete(id);
  store.ids = new Set(store.ids);
  if (store.status !== 'ready') store.status = 'ready';
  emit();
  return !!d.favorited;
}

/** Called by the saved page when it removes an item, so every heart elsewhere agrees. */
export function forgetSaved(id: string) { if (store.ids.delete(id)) { store.ids = new Set(store.ids); emit(); } }

export function useSavedState(id: string | undefined) {
  const subscribe = useCallback((l: () => void) => { store.listeners.add(l); return () => { store.listeners.delete(l); }; }, []);
  useSyncExternalStore(subscribe, () => store.version);
  useEffect(() => { void load(); }, [id]);
  return { saved: !!id && store.ids.has(id), status: store.status };
}

export function SaveButton({ id, title, className = '', labelled = false }: { id: string; title?: string; className?: string; labelled?: boolean }) {
  const { saved, status } = useSavedState(id);
  const [busy, setBusy] = useState(false);
  if (!tokenNow()) return null;

  const what = title ? `“${title}”` : 'this item';
  const label = saved ? `Remove ${what} from your saved items` : `Save ${what} to your saved items`;
  const unknown = status === 'error';

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    // The saved list could not be read, so what the heart shows is not known. Try again rather than guess.
    if (unknown) { await load(true); if (store.status === 'error') toast.error('Could not load your saved items. Please try again.'); return; }
    setBusy(true);
    try {
      const now = await toggle(id);
      toast.success(now ? 'Saved' : 'Removed from Saved');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update your saved items.');
    } finally { setBusy(false); }
  };

  return (
    <button
      type="button" onClick={onClick} disabled={busy || status === 'loading'}
      aria-pressed={saved} aria-label={label} title={unknown ? 'Could not load your saved items. Select to try again.' : saved ? 'Remove from Saved' : 'Save'}
      className={`inline-flex items-center gap-1.5 rounded-lg p-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        saved ? 'text-alarm hover:bg-alarm-soft' : 'text-muted hover:bg-surface-2 hover:text-alarm'} ${className}`}
    >
      <Heart size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      {labelled && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
