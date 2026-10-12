import { useEffect, useState } from 'react';

/**
 * Whether the public AI assistant is on, as the server says. The page never decides this itself.
 *
 *  - Three answers, so the page never shows one thing and then another: `null` while the first answer is on its way (the
 *    widget renders nothing), then `true` (the full assistant) or `false` (the quote form only). Any failure — network, a bad
 *    status, an unreadable reply — means `false`: the assistant is never assumed to be on.
 *  - One shared answer, kept for a minute: every page and every mount reads the same value, so moving between pages asks
 *    nothing. While a page stays open it asks again once a minute (only while it is visible), which is how an admin turning
 *    the assistant off reaches a visitor who never refreshes. A failure is not retried sooner than that.
 */
const TTL_MS = 60_000;
const TIMEOUT_MS = 5_000;

let value: boolean | null = null;
let asked = 0;                       // when the last answer — or failure — arrived
let pending: Promise<void> | null = null;
const listeners = new Set<(v: boolean | null) => void>();

function set(next: boolean) {
  if (next === value) return;
  value = next;
  listeners.forEach(l => l(next));
}

function refresh(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch('/api/public/ai-assistant/status', { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
      const data = res.ok ? await res.json().catch(() => null) : null;
      set(data?.enabled === true);
    } catch {
      set(false);
    } finally {
      asked = Date.now();
      pending = null;
    }
  })();
  return pending;
}

/** The server just said "off" in answer to a chat message: remember it now rather than at the next minute. */
export function markAiAssistantDisabled() {
  asked = Date.now();
  set(false);
}

export function useAiAssistantEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(value);
  useEffect(() => {
    listeners.add(setEnabled);
    setEnabled(value);
    if (Date.now() - asked >= TTL_MS) refresh();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - asked >= TTL_MS - 1_000) refresh();
    }, TTL_MS);
    return () => { listeners.delete(setEnabled); clearInterval(t); };
  }, []);
  return enabled;
}
