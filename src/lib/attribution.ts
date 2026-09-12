/**
 * Where a visitor came from, carried from the link to the signup.
 *
 * A mailing goes out in batches and the only question that matters afterwards
 * is which batch worked. That question cannot be answered later: a signup with
 * no tag on it is a signup whose origin is gone for good, so this runs on the
 * first page of the first visit, before anything else has a chance to tidy the
 * URL away.
 *
 * It keeps whatever the mailing tool chose to put on the link — our own `ref`,
 * or the utm_* set every tool understands — so it does not matter which tool
 * sends the mail.
 */

const KEY = 'stm_attribution';
/** Ninety days: longer than any campaign, shorter than a stale claim. */
const TTL_MS = 90 * 864e5;

const FIELDS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type Attribution = Partial<Record<typeof FIELDS[number] | 'landing', string>>;

type Stored = { at: number; tags: Attribution };

/**
 * Read the tags off this URL and remember them.
 *
 * First touch wins. Someone who arrives from a mailing, wanders the site for a
 * week and comes back through a search result registered because of the
 * mailing; overwriting on the second visit would quietly credit the wrong
 * thing. Only a fresh tagged link replaces an expired record.
 */
export function captureAttribution(search: string = window.location.search, path = window.location.pathname): void {
  try {
    const q = new URLSearchParams(search);
    const tags: Attribution = {};
    for (const f of FIELDS) {
      const v = (q.get(f) || '').trim();
      if (v) tags[f] = v.slice(0, 120);
    }
    if (!Object.keys(tags).length) return;
    tags.landing = path.slice(0, 300);

    const held = read();
    if (held) return; // first touch wins

    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), tags } satisfies Stored));
  } catch {
    /* private windows and blocked storage are not worth failing a page load over */
  }
}

function read(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const held = JSON.parse(raw) as Stored;
    if (!held?.tags || !held.at || Date.now() - held.at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return held.tags;
  } catch {
    return null;
  }
}

/** What to send with a signup, or undefined when they simply arrived. */
export function getAttribution(): Attribution | undefined {
  const tags = read();
  return tags && Object.keys(tags).length ? tags : undefined;
}

/** After a signup has recorded it, so a shared browser cannot credit the next member. */
export function clearAttribution(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
