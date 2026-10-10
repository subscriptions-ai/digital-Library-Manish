/**
 * A licence as one of a small fixed set of spellings, or nothing.
 *
 * Providers write the same licence a dozen ways ("CC-BY", "CC BY 4.0", "CC BY-4", "CC CC-BY-NC-ND",
 * "BY-ND-NC"). The rules that decide whether a book may be hosted compare against the canonical
 * spellings, so a variant that is not recognised would be silently treated as "not permitted". Better
 * to recognise every real variant, and to say plainly that anything else is not a declared licence.
 *
 * "All rights reserved" and its codes are not open licences and come back as null: the book is
 * catalogued with no licence, which is what keeps it metadata-only.
 */
export function canonicalLicence(raw?: string | null): string | null {
  const t = String(raw || '').trim().toUpperCase();
  if (!t) return null;
  if (/ARR|ALL RIGHTS/.test(t)) return null;
  if (/\bCC[\s-]*0\b|\bCC0\b|ZERO|PUBLIC[\s-]?DOMAIN/.test(t)) return 'CC0';
  const m = t.match(/\bBY\b[\s-]*((?:(?:NC|ND|SA)[\s-]*)*)/);
  if (!/\bCC\b|\bBY\b/.test(t) || !m) return null;
  const parts = new Set((m[1].match(/NC|ND|SA/g) || []) as string[]);
  if (parts.has('ND') && parts.has('SA')) return null;                 // contradictory; not a licence that exists
  const order = ['NC', 'ND', 'SA'].filter(x => parts.has(x));
  return `CC BY${order.length ? '-' + order.join('-') : ''}`;
}
