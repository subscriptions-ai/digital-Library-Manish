/**
 * The server writes a public page's data into the page it sends (<script id="seo-data">), so the first thing React renders is what the
 * reader and any crawler were already shown, with no loading screen and no second request.
 *
 * The data is a snapshot of the page as it was served. It is used only for the address it was served for, and only for a few minutes:
 * a tab left open for hours fetches fresh data like any other client-side visit.
 */
const FRESH_MS = 5 * 60_000;
let parsed: { kind: string; key: string; at: number; [k: string]: any } | null | undefined;

export function takeSeoData<T = any>(kind: 'post' | 'list', key: string): T | null {
  if (parsed === undefined) {
    parsed = null;
    try {
      const el = typeof document !== 'undefined' ? document.getElementById('seo-data') : null;
      if (el?.textContent) parsed = { ...JSON.parse(el.textContent), at: Date.now() };
    } catch { parsed = null; }
  }
  if (!parsed || parsed.kind !== kind || parsed.key !== key || Date.now() - parsed.at > FRESH_MS) return null;
  return parsed as T;
}
