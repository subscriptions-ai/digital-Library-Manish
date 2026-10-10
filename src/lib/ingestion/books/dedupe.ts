import { ingestionDb } from '../db.js';
import type { NormalisedBook } from './normalise.js';
import { normaliseIsbn, titleKey, firstAuthorKey } from './identifiers.js';

/**
 * Is this book already in the catalogue? One answer for every book provider.
 *
 * Strongest evidence first, and the first that hits decides:
 *   1. DOI            2. ISBN (10 and 13 are the same book)
 *   3. the provider's own id (Handle / fingerprint)
 *   4. title + first author + year — the weakest, REPORTED but never written to
 *
 * Editions are not collapsed. A different ISBN is a different edition, so when both records carry
 * ISBNs and none is shared, the title match is discarded. Matches 1–3 identify a record; match 4
 * only suggests one, so a caller may enrich on 1–3 and must not touch the row on 4.
 */
export type BookMatch = { bookId: string; via: 'doi' | 'isbn' | 'sourceRecordId' | 'fingerprint' | 'title' };

const chunks = <T,>(a: T[], n = 200) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

export function bookFingerprint(b: Pick<NormalisedBook, 'provider' | 'doi' | 'sourceRecordId' | 'title'>): string {
  const p = b.provider.toLowerCase();
  // DOAB and OAPEN identify a title by Handle (and their rows were written that way); other providers by id.
  const idKind = p === 'doab' || p === 'oapen' ? 'handle' : 'id';
  return b.doi ? `${p}:doi:${b.doi}`
    : b.sourceRecordId ? `${p}:${idKind}:${b.sourceRecordId}`
    : `${p}:t:${String(b.title).toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 180)}`;
}

export async function findHeldBooks(books: NormalisedBook[], db: any = ingestionDb): Promise<Map<number, BookMatch>> {
  const found = new Map<number, BookMatch>();
  const mark = (i: number | undefined, m: BookMatch) => { if (i !== undefined && !found.has(i)) found.set(i, m); };
  const idx = (f: (b: NormalisedBook) => string[]) => {
    const m = new Map<string, number[]>();
    books.forEach((b, i) => f(b).forEach(k => { const l = m.get(k); l ? l.push(i) : m.set(k, [i]); }));
    return m;
  };

  // 1. DOI — compared lower-cased and with any resolver prefix removed, because held rows were written both ways.
  const byDoi = idx(b => (b.doi ? [b.doi] : []));
  for (const part of chunks([...byDoi.keys()])) {
    const rows: any[] = await db.$queryRawUnsafe(
      `select id, lower(regexp_replace(trim(doi), '^https?://(dx\\.)?doi\\.org/', '', 'i')) as k from "Book" where doi is not null and lower(regexp_replace(trim(doi), '^https?://(dx\\.)?doi\\.org/', '', 'i')) = any($1::text[])`, part);
    for (const r of rows) byDoi.get(r.k)?.forEach(i => mark(i, { bookId: r.id, via: 'doi' }));
  }

  // 2. ISBN — held ISBNs are written with hyphens, spaces, ISBN-10 or ISBN-13; compare the digits.
  const byIsbn = idx(b => b.isbns);
  const wanted = new Set<string>();
  for (const k of byIsbn.keys()) { wanted.add(k); const i = normaliseIsbn(k); if (i?.isbn10) wanted.add(i.isbn10); }
  for (const part of chunks([...wanted])) {
    const rows: any[] = await db.$queryRawUnsafe(
      `select id, isbn from "Book" where isbn is not null and upper(regexp_replace(isbn, '[^0-9Xx]', '', 'g')) = any($1::text[])`, part);
    for (const r of rows) {
      const k = normaliseIsbn(r.isbn)?.isbn13;
      if (k) byIsbn.get(k)?.forEach(i => mark(i, { bookId: r.id, via: 'isbn' }));
    }
  }

  // 3. The provider's id, and the fingerprint the engine has always written.
  const prints = idx(b => [bookFingerprint(b), ...(b.sourceRecordId ? [`${b.provider.toLowerCase()}:${/^(doab|oapen)$/i.test(b.provider) ? 'handle' : 'id'}:${b.sourceRecordId}`] : [])]);
  for (const part of chunks([...prints.keys()])) {
    const rows: any[] = await db.book.findMany({ where: { fingerprint: { in: part } }, select: { id: true, fingerprint: true } });
    for (const r of rows) prints.get(r.fingerprint)?.forEach(i => mark(i, { bookId: r.id, via: 'fingerprint' }));
  }
  const byRecord = idx(b => (b.sourceRecordId ? [b.sourceRecordId] : []));
  for (const part of chunks([...byRecord.keys()])) {
    const rows: any[] = await db.book.findMany({ where: { sourceRecordId: { in: part }, source: books[0]?.provider }, select: { id: true, sourceRecordId: true } });
    for (const r of rows) byRecord.get(r.sourceRecordId)?.forEach(i => mark(i, { bookId: r.id, via: 'sourceRecordId' }));
  }

  // 4. Title + author + year, for what is left.
  const rest = books.map((b, i) => ({ b, i })).filter(({ i, b }) => !found.has(i) && titleKey(b.title));
  const titles = [...new Set(rest.map(({ b }) => String(b.title).trim().toLowerCase()))];
  for (const part of chunks(titles)) {
    const rows: any[] = await db.$queryRawUnsafe(
      `select id, title, authors, year, isbn from "Book" where lower(trim(title)) = any($1::text[])`, part);
    for (const { b, i } of rest) {
      const mine = titleKey(b.title);
      const hit = rows.find(r => {
        if (titleKey(r.title) !== mine) return false;
        const theirIsbn = normaliseIsbn(r.isbn)?.isbn13;
        // Both have ISBNs and they differ: two editions, not one book.
        if (theirIsbn && b.isbns.length && !b.isbns.includes(theirIsbn)) return false;
        const a1 = firstAuthorKey(b.authors || b.editors), a2 = firstAuthorKey(r.authors);
        const authorAgrees = !!a1 && !!a2 && a1 === a2;
        if (a1 && a2 && a1 !== a2) return false;
        const yearAgrees = !!b.year && !!r.year && b.year === r.year;
        if (b.year && r.year && b.year !== r.year) return false;   // another year is another edition
        return authorAgrees || yearAgrees;
      });
      if (hit) mark(i, { bookId: hit.id, via: 'title' });
    }
  }
  return found;
}
