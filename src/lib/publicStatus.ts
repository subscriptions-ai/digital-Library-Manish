/**
 * What a record's status means for the public catalogue, said once.
 *
 * TWO tables, two rules, because the tables have different histories:
 *
 *   New collection (`Article`, `Book`)  Draft | Published | Rejected, written only by the application. A record is public ONLY when it says
 *                                       Published. Anything else (including a state added later) is not public.
 *   Archived collection (legacy `Content`)  the scraped/imported library. Its status column was also written by imports, and holds more than the
 *                                       application's own two words: lower-case "published", and — in production — "Open Access", which is an
 *                                       access type that landed in the status column. The public catalogue has always listed everything that is
 *                                       not Draft, and the Open Access theses are on its shelves today.
 *
 * The archived rule therefore stays "listed unless the status says it is withheld", but that is now said as a list and not as "not Draft": a
 * status that means hidden, deleted, rejected, under review or withdrawn is never listed, in any case. None of those exists in the legacy table
 * today, so this changes nothing a reader sees now; it stops a future one from being listed by accident. A status the library does not
 * recognise at all (like "Open Access") stays listed as before — and is reported as such (see classifyStatus), never silently folded into
 * "Published". Whether those records should be Published is a decision for their owners; no status is changed anywhere.
 *
 * Case is ignored for the archived table ("published" is the same word) and nothing else is widened.
 */

export type Collection = 'new' | 'archived';
export type StatusClass = 'published' | 'draft' | 'rejected' | 'withheld' | 'unrecognised';

/** Statuses that mean "not for the public", compared without regard to case. */
export const WITHHELD_STATUSES = ['draft', 'rejected', 'hidden', 'deleted', 'removed', 'pending', 'review', 'in review', 'needs review', 'unpublished', 'withdrawn', 'archived', 'takedown'] as const;

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export function classifyStatus(collection: Collection, status: unknown): StatusClass {
  const s = norm(status);
  if (s === 'published') return 'published';
  if (s === 'draft') return 'draft';
  if (s === 'rejected') return 'rejected';
  if ((WITHHELD_STATUSES as readonly string[]).includes(s)) return 'withheld';
  return 'unrecognised';
}

/** Is a record with this status listed publicly? */
export function isPubliclyListed(collection: Collection, status: unknown): boolean {
  const c = classifyStatus(collection, status);
  // New: only an explicit Published. Archived: everything the status does not withhold (this includes an unrecognised status such as "Open Access").
  return collection === 'new' ? String(status) === 'Published' : c === 'published' || c === 'unrecognised';
}

/** Prisma: the archived records the public catalogue lists. */
export const legacyPublicWhere: { status: { notIn: string[]; mode: 'insensitive' } } = { status: { notIn: [...WITHHELD_STATUSES], mode: 'insensitive' } };
/** SQL twin, for a table aliased `alias`. */
export const legacyPublicSql = (alias = 'c') => `lower(${alias}.status) not in (${WITHHELD_STATUSES.map(s => `'${s}'`).join(', ')})`;
