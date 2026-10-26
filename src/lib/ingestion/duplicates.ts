import { ingestionDb } from './db.js';
import { multiSourceEnrichmentEnabled } from './policy.js';
import { normaliseDoi } from './dedup.js';

/**
 * What a duplicate is worth. An article that arrives from a second source is not just "already held": it is compared with the record we keep and falls into
 * exactly one of three kinds —
 *
 *   enriched     the held record has an EMPTY descriptive field the newcomer fills (authors, volume, issue, subject, publisher, journal name, journal ISSN).
 *                Only that field is written, only while it is still empty. Nothing that has a value is replaced.
 *   conflicting  the newcomer disagrees with the held record on something that carries rights or identity: the licence family, or the DOI. The record is left
 *                exactly as it is, the disagreement is counted, and a person can look; a program does not decide which source is right.
 *   unchanged    everything else, including a newcomer that only repeats what we hold.
 *
 * Never written, whatever the newcomer says: licence, licenceIsNC, file URL, access status, publication status, year, DOI, fingerprint. A rights decision made
 * once (by the journal's DOAJ declaration, by a person) is not undone by a second source's opinion, and a record that is not public cannot become public here.
 * INGESTION_MULTI_SOURCE_ENRICHMENT=0 switches the writing off (the counts are then all "unchanged").
 */

export type Incoming = {
  authors?: string | null; volume?: unknown; issue?: unknown; subject?: string | null; publisherName?: string | null;
  journalName?: string | null; issn?: string | null; licence?: string | null; doi?: string | null;
};
export type DupResult = { unchanged: number; enriched: number; conflicting: number };

/** held column ← incoming key. Descriptive fields only. */
const FILLABLE: [string, keyof Incoming][] = [
  ['authors', 'authors'], ['volume', 'volume'], ['issue', 'issue'], ['subject', 'subject'],
  ['publisherName', 'publisherName'], ['journalName', 'journalName'], ['journalIssn', 'issn'],
];

/** "CC BY 4.0", "cc-by", "https://creativecommons.org/licenses/by/4.0/" → "ccby". The version is not part of the family. */
export function licenceFamily(l?: string | null): string | null {
  const t = String(l ?? '').toLowerCase().trim();
  if (!t) return null;
  const k = t.replace(/https?:\/\/creativecommons\.org\/(licenses|publicdomain)\//, 'cc-').replace(/\b\d+(\.\d+)*\b/g, '').replace(/[^a-z]/g, '');
  return k || null;
}

const present = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
const CHUNK = 200;

export type DupDecision = { kind: 'unchanged' | 'enriched' | 'conflicting'; /** The empty fields the newcomer would fill (only for `enriched`). */ patch?: Record<string, string> };

/** What a duplicate is worth, decided from the held row and the newcomer alone. Reads nothing, writes nothing. */
export function decideDuplicate(h: any, inc: Incoming): DupDecision {
  // Disagreement on rights or identity: counted, and the record is not touched at all.
  const hf = licenceFamily(h.licence), nf = licenceFamily(inc.licence);
  const doiDiffers = present(h.doi) && present(inc.doi) && normaliseDoi(h.doi) !== normaliseDoi(inc.doi);
  if ((hf && nf && hf !== nf) || doiDiffers) return { kind: 'conflicting' };
  const patch: Record<string, string> = {};
  for (const [col, key] of FILLABLE) if (!present(h[col]) && present(inc[key])) patch[col] = String(inc[key]).trim().slice(0, 500);
  return Object.keys(patch).length ? { kind: 'enriched', patch } : { kind: 'unchanged' };
}

/** The held rows (descriptive fields and the rights-bearing ones the decision needs), by id. */
async function loadHeld(ids: string[], db: any): Promise<Map<string, any>> {
  const held = new Map<string, any>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows: any[] = await db.article.findMany({
      where: { id: { in: ids.slice(i, i + CHUNK) } },
      select: { id: true, authors: true, volume: true, issue: true, subject: true, publisherName: true, journalName: true, journalIssn: true, licence: true, doi: true },
    }).catch(() => []);
    for (const r of rows) held.set(r.id, r);
  }
  return held;
}

/** Read-only: how each held record would be treated by its newcomer. Used to plan a chunk and for a dry run. A held id that cannot be read is "unchanged". */
export async function judgeDuplicates(pairs: { heldId: string; incoming: Incoming }[], db: any = ingestionDb): Promise<Map<string, DupDecision>> {
  const first = new Map<string, Incoming>();
  for (const p of pairs) if (p.heldId && !first.has(p.heldId)) first.set(p.heldId, p.incoming);
  const out = new Map<string, DupDecision>();
  if (!first.size) return out;
  const held = await loadHeld([...first.keys()], db);
  const writing = multiSourceEnrichmentEnabled();
  for (const [id, inc] of first) {
    const h = held.get(id); const d: DupDecision = h ? decideDuplicate(h, inc) : { kind: 'unchanged' };
    out.set(id, d.kind === 'enriched' && !writing ? { kind: 'unchanged' } : d);      // with enrichment switched off nothing would be filled, so nothing is planned
  }
  return out;
}

/** The one write a duplicate may cause: fill the patch's fields, each only while still empty. True when it wrote. */
export async function applyEnrichment(heldId: string, patch: Record<string, string>, db: any = ingestionDb): Promise<boolean> {
  if (!Object.keys(patch).length) return false;
  // Guarded: written only while each of those fields is still empty, so a writer that got there first is never overwritten.
  const done = await db.article.updateMany({ where: { id: heldId, ...Object.fromEntries(Object.keys(patch).map(k => [k, null])) }, data: patch }).catch(() => ({ count: 0 }));
  return done.count === 1;
}

export async function reconcileDuplicates(pairs: { heldId: string; incoming: Incoming }[], db: any = ingestionDb): Promise<DupResult> {
  const out: DupResult = { unchanged: 0, enriched: 0, conflicting: 0 };
  // The same held record met twice in one batch is one duplicate of it, the first time.
  const firstOnly = new Set<string>();
  for (const p of pairs) if (p.heldId) firstOnly.add(p.heldId);
  out.unchanged = pairs.length - firstOnly.size;
  if (!firstOnly.size) return out;
  if (!multiSourceEnrichmentEnabled()) { out.unchanged += firstOnly.size; return out; }

  const decisions = await judgeDuplicates(pairs, db);
  for (const [id, d] of decisions) {
    if (d.kind === 'conflicting') { out.conflicting++; continue; }
    if (d.kind === 'enriched') { (await applyEnrichment(id, d.patch!, db)) ? out.enriched++ : out.unchanged++; continue; }
    out.unchanged++;
  }
  return out;
}
