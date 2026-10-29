import type { PrismaClient } from '@prisma/client';

/**
 * What counts as a book the public catalogue lists, and what counts as a book a reader can open here. One definition, used by every
 * counter and every list that says "books" to a visitor or a member (the Digital Library headline, department pages, the library's
 * Books shelf, the AI assistant) and by the admin's Books overview, so a figure and the list under it cannot disagree.
 *
 * Books live in TWO tables, and that is the whole reason two screens once quoted two numbers:
 *   - `Book`    the structured collection ("New" in the admin). Harvested catalogue records and publisher uploads.
 *   - `Content` the legacy scraped collection ("Archived" in the admin), rows with contentType = 'Books'.
 * "New" and "Archived" are the names of the two COLLECTIONS. They are not lifecycle states: a legacy book that is Published is listed
 * publicly exactly like a structured one. Each table has its own lifecycle (Draft | Published | Rejected on Book; Published | Draft on
 * Content), and the two never share an id, so a book is counted once per row.
 *
 * LISTED (the public figure): a `Book` is listed when its status is Published; a legacy `Content` book when its status is not Draft.
 * Those two tests are the ones the public lists have always applied (src/…/library/books and /content/list); they are written down here
 * instead of being repeated in a dozen queries.
 *
 * READABLE (a different, smaller figure): listed AND a full-text file is actually served from here. A listed record can be metadata
 * only (the licence does not allow hosting, so the reader is sent to the source), and must never be presented as full text.
 *   - `Book`:    accessStatus = ViewableHere and a pdfUrl (the same test the public Books list uses before it hands out a file address).
 *   - `Content`: a fileUrl whose viewer check passed (validationStatus = VALID_VIEWABLE).
 *
 * Draft / review / hidden records are everything that is neither listed nor Rejected. This module never deletes or republishes anything.
 */

/** Book.status values. */
export const BOOK_STATUS = { Published: 'Published', Draft: 'Draft', Rejected: 'Rejected' } as const;

/** Prisma: the structured books that are listed. */
export const publicBookWhere = { status: BOOK_STATUS.Published } as const;
/** Prisma: the legacy books that are listed. */
export const publicLegacyBookWhere = { contentType: 'Books', status: { not: 'Draft' } } as const;

/** Prisma: listed AND readable here. */
export const readableBookWhere = { status: BOOK_STATUS.Published, accessStatus: 'ViewableHere', pdfUrl: { not: null } } as const;
export const readableLegacyBookWhere = {
  contentType: 'Books', status: { not: 'Draft' }, validationStatus: 'VALID_VIEWABLE', fileUrl: { not: null },
} as const;

/** SQL twins of the above, for a table aliased `alias`. */
export const publicBookSql = (alias = 'b') => `${alias}.status = 'Published'`;
export const publicLegacyBookSql = (alias = 'c') => `${alias}."contentType" = 'Books' and ${alias}.status <> 'Draft'`;
export const readableBookSql = (alias = 'b') => `${publicBookSql(alias)} and ${alias}."accessStatus" = 'ViewableHere' and ${alias}."pdfUrl" is not null`;
export const readableLegacyBookSql = (alias = 'c') =>
  `${publicLegacyBookSql(alias)} and ${alias}."validationStatus" = 'VALID_VIEWABLE' and ${alias}."fileUrl" is not null`;

export type PublicBookCounts = {
  /** Books listed in the structured collection. */
  structured: number;
  /** Books listed in the legacy collection. */
  legacy: number;
  /** structured + legacy: the number the public site quotes. Every id is counted once. */
  listed: number;
  /** Listed books whose full text is served from here. */
  readable: { structured: number; legacy: number; total: number };
  /** Listed books that are a catalogue record only (listed − readable). */
  recordOnly: number;
};

/**
 * The public book counts, optionally for a set of department spellings (a member's plan). An EMPTY `domains` list means no department
 * at all and counts nothing; `undefined` is the whole catalogue (the same rule as `collectionCounts`).
 */
export async function publicBookCounts(db: PrismaClient | any, o: { domains?: string[] } = {}): Promise<PublicBookCounts> {
  if (o.domains && o.domains.length === 0) {
    return { structured: 0, legacy: 0, listed: 0, readable: { structured: 0, legacy: 0, total: 0 }, recordOnly: 0 };
  }
  const inDomains = o.domains ? { domain: { in: o.domains } } : {};
  const [structured, legacy, readableStructured, readableLegacy] = await Promise.all([
    db.book.count({ where: { ...publicBookWhere, ...inDomains } }),
    db.content.count({ where: { ...publicLegacyBookWhere, ...inDomains } }),
    db.book.count({ where: { ...readableBookWhere, ...inDomains } }),
    db.content.count({ where: { ...readableLegacyBookWhere, ...inDomains } }),
  ]);
  const listed = structured + legacy;
  const readable = readableStructured + readableLegacy;
  return {
    structured, legacy, listed,
    readable: { structured: readableStructured, legacy: readableLegacy, total: readable },
    recordOnly: listed - readable,
  };
}
