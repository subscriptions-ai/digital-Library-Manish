/**
 * What may be offered as a "Subject Area".
 *
 * A subject area is a short category — "Power Systems", "Oncology". Some rows carried
 * something else in that column: the article's own title, a bare number from a column
 * that was mapped wrongly, a placeholder. Offering those as filters put a paragraph
 * of text in the sidebar and a checkbox that matches exactly one record.
 *
 * Nothing is invented here. A value that is not a believable category comes back as
 * null, and the caller leaves the subject out rather than guessing a replacement.
 */

const PLACEHOLDERS = new Set(['general', 'n/a', 'na', 'none', 'null', 'undefined', 'unknown', 'other', '-', '--', 'misc', 'miscellaneous']);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function cleanSubjectArea(value: unknown, title?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  if (PLACEHOLDERS.has(v.toLowerCase())) return null;
  // A bare number is a row index or an id from the wrong column, not a subject.
  if (/^[\d\s.,#-]+$/.test(v)) return null;
  // A category is a few words. A sentence is somebody's title or abstract.
  if (v.length > 70 || v.split(' ').length > 8) return null;
  if (/[.?!]$/.test(v) && v.split(' ').length > 5) return null;
  if (title) {
    const t = norm(title), s = norm(v);
    // The title copied into the subject field, whole or cut short. A real subject
    // that merely appears in a longer title ("Magnonics" in "Magnonics in thin
    // films…") is kept: it has to cover most of the title to count as a copy.
    if (s && t && (s === t || s.includes(t) || (s.length >= 20 && t.includes(s) && s.length >= t.length * 0.6))) return null;
  }
  return v;
}
