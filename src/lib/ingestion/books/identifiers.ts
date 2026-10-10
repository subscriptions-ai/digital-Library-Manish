import { normaliseDoi } from '../dedup.js';

export { normaliseDoi };

/**
 * ISBN-10 and ISBN-13 are two spellings of one identifier for one edition. Providers write them
 * with hyphens, spaces, a "ISBN" prefix or a lower-case x; none of that is part of the identity.
 * Everything that reads or writes an ISBN for matching goes through here.
 *
 * Returned only when the check digit is right, because a mistyped ISBN that happens to match
 * another book's would merge two different books.
 */
export type Isbn = { isbn13: string; isbn10: string | null };

const clean = (raw: string) => raw.replace(/isbn(-1[03])?:?/gi, '').replace(/[^0-9Xx]/g, '').toUpperCase();

function check10(d: string) {
  if (!/^\d{9}[\dX]$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (d[i] === 'X' ? 10 : Number(d[i])) * (10 - i);
  return sum % 11 === 0;
}
function check13(d: string) {
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}
function to13(d10: string) {
  const core = '978' + d10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}
function to10(d13: string) {
  if (!d13.startsWith('978')) return null;      // 979- ISBNs have no ISBN-10 form
  const core = d13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return core + (c === 10 ? 'X' : String(c));
}

export function normaliseIsbn(raw?: string | null): Isbn | null {
  if (!raw) return null;
  const d = clean(String(raw));
  if (d.length === 13 && check13(d)) return { isbn13: d, isbn10: to10(d) };
  if (d.length === 10 && check10(d)) return { isbn13: to13(d), isbn10: d };
  return null;
}

/** Every valid ISBN found in a list of strings, as ISBN-13, de-duplicated, order kept. */
export function isbn13s(values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    // A field sometimes carries several, separated by commas, semicolons or slashes.
    for (const part of String(v || '').split(/[;,/|]|\s{2,}/)) {
      const i = normaliseIsbn(part);
      if (i && !out.includes(i.isbn13)) out.push(i.isbn13);
    }
  }
  return out;
}

const squash = (s: string) => s.toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Title reduced to what identifies it: no case, accents, punctuation or leading article. */
export function titleKey(title?: string | null): string {
  return squash(String(title || '')).replace(/^(the|a|an) /, '').slice(0, 180);
}

/** Surname of the first-listed author/editor, for the weakest match. "Larsen, Peter" and "Peter Larsen" agree. */
export function firstAuthorKey(authors?: string | null): string {
  const first = String(authors || '').split(/;|\band\b|\n/)[0].trim();
  if (!first) return '';
  const comma = first.indexOf(',');
  const surname = comma > 0 ? first.slice(0, comma) : first.split(/\s+/).pop() || '';
  return squash(surname);
}
