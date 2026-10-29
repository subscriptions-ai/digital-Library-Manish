import { CANONICAL_NAMES, canonicalDepartmentName } from './departmentRegistry';
import { publicBookWhere, publicLegacyBookWhere, readableBookWhere, readableLegacyBookWhere } from './publicBooks';

/**
 * The admin's Books overview: one filter builder shared by the list and by the department counts, so a number beside a department is
 * exactly the number of rows the table shows after that department is chosen.
 *
 * Two collections are handled the same way (see publicBooks.ts): 'new' is the structured `Book` table, 'archived' is legacy `Content`
 * rows with contentType = 'Books'. A book is filed under exactly one department (a single `domain` string), so department counts plus
 * Unassigned add up to the total with nothing counted twice.
 *
 * UNASSIGNED is a book with no department, a blank one, or one the department registry does not recognise ("Engineering", a typo). It
 * is never folded into a department by guesswork; the unrecognised spellings are listed so someone can decide.
 */

export type BookDataset = 'new' | 'archived';
export const NO_DEPARTMENT = '__none';

export type BookFilters = {
  q?: string;
  /** Collection-specific status, exactly as stored. */
  status?: string;
  /** 'public' narrows to the listed population (publicBooks.ts); anything else is every record. */
  visibility?: string;
  /** A department name, or NO_DEPARTMENT. Left out of the department counts. */
  domain?: string;
};

type Spellings = { expand: (departments: string[]) => Promise<string[]> };

/** Prisma where for one collection. `withDomain: false` is the filter the department counts use (every other filter, no department). */
export async function bookWhere(dataset: BookDataset, f: BookFilters, spellings: Spellings, opts: { withDomain?: boolean } = {}): Promise<any> {
  const and: any[] = [];
  if (dataset === 'archived') and.push({ contentType: 'Books' });
  const q = (f.q || '').trim();
  if (q) {
    and.push({ OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { authors: { contains: q, mode: 'insensitive' } },
      // The structured table carries identifiers and a publisher; the legacy table carries a description, which its search always read.
      ...(dataset === 'new'
        ? [{ isbn: { contains: q, mode: 'insensitive' } }, { publisherName: { contains: q, mode: 'insensitive' } }]
        : [{ description: { contains: q, mode: 'insensitive' } }]),
    ] });
  }
  if (f.status) and.push({ status: f.status });
  if (f.visibility === 'public') and.push(dataset === 'new' ? publicBookWhere : { status: { not: 'Draft' } });
  if (opts.withDomain !== false && f.domain) {
    if (f.domain === NO_DEPARTMENT) {
      const known = await spellings.expand(CANONICAL_NAMES);
      and.push({ OR: [{ domain: null }, { domain: '' }, { domain: { notIn: known } }] });
    } else {
      and.push({ domain: { in: await spellings.expand([f.domain]) } });
    }
  }
  return and.length ? { AND: and } : {};
}

export type DepartmentCount = { name: string; total: number; public: number };
export type BooksOverview = {
  dataset: BookDataset;
  /** Every department of the registry, zero or not, then Unassigned. Counts follow q/status, not the department chosen. */
  departments: DepartmentCount[];
  unassigned: { total: number; public: number; blank: number; unrecognised: number; labels: { name: string; count: number }[] };
  /** The figures behind the cards, for the whole collection (no filter). */
  summary: {
    total: number; public: number; draft: number; rejected: number; other: number;
    unassigned: number; readable: number;
  };
  /** Both collections side by side, so "New" and "Archived" are never mistaken for one list. */
  collections: { new: { total: number; public: number } | null; archived: { total: number; public: number } | null };
  /** total of the counts above, to compare with the table's total: departments + unassigned = filtered total. */
  filteredTotal: number;
  filteredPublic: number;
  reconciles: boolean;
};

const modelOf = (db: any, dataset: BookDataset) => (dataset === 'new' ? db.book : db.content);

export async function booksOverview(db: any, spellings: Spellings, dataset: BookDataset, f: BookFilters): Promise<BooksOverview> {
  const model = modelOf(db, dataset);
  const publicOf = dataset === 'new' ? publicBookWhere : publicLegacyBookWhere;
  const readableOf = dataset === 'new' ? readableBookWhere : readableLegacyBookWhere;
  const base = dataset === 'archived' ? { contentType: 'Books' } : {};
  const facet = await bookWhere(dataset, f, spellings, { withDomain: false });
  const publicFacet = { AND: [facet, dataset === 'new' ? publicBookWhere : { status: { not: 'Draft' } }] };

  const [byDomain, publicByDomain, total, listed, draft, rejected, readable, otherCollection] = await Promise.all([
    model.groupBy({ by: ['domain'], where: facet, _count: { _all: true } }),
    model.groupBy({ by: ['domain'], where: publicFacet, _count: { _all: true } }),
    model.count({ where: base }),
    model.count({ where: publicOf }),
    model.count({ where: { ...base, status: 'Draft' } }),
    model.count({ where: { ...base, status: 'Rejected' } }),
    model.count({ where: readableOf }),
    // The other collection, only for the side-by-side line.
    dataset === 'new'
      ? Promise.all([db.content.count({ where: { contentType: 'Books' } }), db.content.count({ where: publicLegacyBookWhere })])
      : Promise.all([db.book.count({}), db.book.count({ where: publicBookWhere })]),
  ]);

  const rows = new Map<string, DepartmentCount>(CANONICAL_NAMES.map(n => [n, { name: n, total: 0, public: 0 }]));
  const unassigned = { total: 0, public: 0, blank: 0, unrecognised: 0, labels: [] as { name: string; count: number }[] };
  const labelCounts = new Map<string, number>();
  const place = (domain: string | null, n: number, key: 'total' | 'public') => {
    const canonical = domain ? canonicalDepartmentName(domain) : null;
    if (canonical) { rows.get(canonical)![key] += n; return; }
    unassigned[key] += n;
    if (key === 'total') {
      if (!domain || !domain.trim()) unassigned.blank += n;
      else { unassigned.unrecognised += n; labelCounts.set(domain, (labelCounts.get(domain) || 0) + n); }
    }
  };
  for (const g of byDomain) place(g.domain, g._count._all, 'total');
  for (const g of publicByDomain) place(g.domain, g._count._all, 'public');
  unassigned.labels = [...labelCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const departments = [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const filteredTotal = departments.reduce((s, d) => s + d.total, 0) + unassigned.total;
  const filteredPublic = departments.reduce((s, d) => s + d.public, 0) + unassigned.public;

  // Unassigned for the whole collection (cards), by the same rule as the filter.
  const known = await spellings.expand(CANONICAL_NAMES);
  const unassignedAll = await model.count({ where: { AND: [base, { OR: [{ domain: null }, { domain: '' }, { domain: { notIn: known } }] }] } });

  const counted = await model.count({ where: facet });
  return {
    dataset, departments, unassigned,
    summary: { total, public: listed, draft, rejected, other: Math.max(0, total - listed - draft - rejected), unassigned: unassignedAll, readable },
    collections: dataset === 'new'
      ? { new: { total, public: listed }, archived: { total: otherCollection[0], public: otherCollection[1] } }
      : { archived: { total, public: listed }, new: { total: otherCollection[0], public: otherCollection[1] } },
    filteredTotal, filteredPublic,
    reconciles: filteredTotal === counted,
  };
}
