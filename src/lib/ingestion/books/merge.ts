import type { NormalisedBook } from './normalise.js';

/**
 * What a record already held may be given by a second sighting of the same book.
 *
 * Fill-empty only. A field that has a value is never replaced, and nothing is ever written as
 * null, blank or a placeholder. Rights fields (licence, rightsBasis, rightsStatus, accessStatus)
 * are deliberately absent: a rights decision is made once, by the rules in judgeBookAccess or by
 * a person, and a later sighting does not get to revise it. `domain` is also left alone — the
 * department a book is in is not moved by a harvest.
 */
const blank = (v: unknown) => v == null || (typeof v === 'string' && (!v.trim() || /^(n\/a|none|unknown|-+)$/i.test(v.trim())));

export function fillEmptyPatch(existing: Record<string, any>, b: NormalisedBook, isbn13: string | null, subject: string | null, opts: { sameProvider?: boolean } = {}): Record<string, any> {
  const patch: Record<string, any> = {};
  const set = (field: string, value: unknown) => {
    if (blank(value)) return;
    if (blank(existing[field])) patch[field] = value;
  };
  set('doi', b.doi);
  set('isbn', isbn13);
  set('authors', [b.authors, b.editors].filter(Boolean).join(', ') || null);
  set('publisherName', b.publisherName);
  set('year', b.year);
  set('language', b.language);
  set('description', b.description);
  set('subject', subject);
  set('pages', b.pages);
  set('edition', b.edition);
  set('country', b.country);
  set('coverUrl', b.coverUrl);
  set('originalUrl', b.externalUrl || b.landingUrl);
  set('rightsHolder', b.publisherName);
  // A provider's own id is only ever filled by that provider: another's handle in this column would be
  // read back as ours and break the match on the next sighting.
  if (opts.sameProvider) set('sourceRecordId', b.sourceRecordId);
  return patch;
}
