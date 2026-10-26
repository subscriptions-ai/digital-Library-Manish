/**
 * Where each article source has got to in one journal, kept in the journal's single `fetchCursor` column.
 *
 * That column used to hold one opaque string — OpenAlex's cursor. With more than one source fetching a journal, each needs its
 * own place, and one source finishing or restarting a journal must never move another's. So the column may hold a small JSON
 * object, `{"openalex":"…","crossref":"60"}`. A plain string, which is every value written before this existed, is OpenAlex's
 * and is read exactly as it always was; it is only rewritten (still carrying the same OpenAlex value) when another source
 * saves a place beside it. No column is added and nothing is migrated.
 */

/**
 * `crossrefSince` and `crossrefWalk` are Crossref's incremental-sync bookkeeping, kept beside its place: `crossrefSince` is "<YYYY-MM-DD>|<from year>", the day
 * from which Crossref is asked for what it has (re)indexed since the last finished walk of this journal; `crossrefWalk` is the day the walk now under way began.
 */
export type CursorProvider = 'openalex' | 'crossref' | 'crossrefSince' | 'crossrefWalk';

function parse(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  if (raw.startsWith('{')) { try { const o = JSON.parse(raw); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } catch { /* a plain cursor that merely starts with a brace */ } }
  return { openalex: raw };
}

export const readCursor = (raw: string | null | undefined, provider: CursorProvider): string | null => parse(raw)[provider] ?? null;

/** The column's new value with this source's place set (or cleared with null) and every other source's place kept. */
export function writeCursor(raw: string | null | undefined, provider: CursorProvider, value: string | null): string | null {
  const o = parse(raw);
  if (value === null || value === undefined) delete o[provider]; else o[provider] = value;
  const keys = Object.keys(o);
  if (!keys.length) return null;
  // Only OpenAlex has a place: keep the original plain form, so a journal only ever one source has touched looks as it always did.
  if (keys.length === 1 && keys[0] === 'openalex') return o.openalex;
  return JSON.stringify(o);
}
