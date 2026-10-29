import { CANONICAL_NAMES, canonicalDepartmentName } from './departmentRegistry';

/**
 * The admin content sections (Books, Periodicals, Magazines, Case Reports, Theses, Conference Proceedings, Educational Videos, Newsletters):
 * one filter builder shared by the table and by the department counts, so the number beside a department is exactly the number of rows the
 * table shows once that department is chosen — in every section.
 *
 * WHAT ONE RECORD IS (it differs by section and by collection; counts are never mixed across units):
 *
 *   Books            new       one `Book` row (a book title)                          archived  one legacy `Content` row, contentType Books
 *   Periodicals      new       one `Article` row, contentType Periodicals — an ARTICLE, not a journal title and not an issue.
 *                              Journal titles are the `Journal` table (Admin > Journals); issues are not stored, only the volume/issue on each article.
 *                    archived  one legacy `Content` row, contentType Periodicals (also an individual paper)
 *   Magazines, Case Reports, Theses, Conference Proceedings, Educational Videos, Newsletters
 *                    new       one `Article` row with that contentType              archived  one legacy `Content` row with that contentType
 *
 * "New" and "Archived" are two COLLECTIONS (two tables), not publication statuses; each table has its own lifecycle. A Published archived
 * item is as public as a Published new one.
 *
 * PUBLIC = what the public library lists: a new record with status Published; an archived record whose status is not Draft (the legacy table
 * holds a lower-case "published" on some rows, so statuses are compared without regard to case).
 *
 * A record is filed under ONE department (a single `domain` string), so department counts plus Unassigned add up to the filtered total with
 * nothing counted twice. UNASSIGNED is no department, a blank one, or one the registry does not recognise; it is never folded into a department
 * by guesswork, and the unrecognised spellings are listed so someone can decide.
 */

export const ADMIN_SECTIONS = ['Books', 'Periodicals', 'Magazines', 'Case Reports', 'Theses', 'Conference Proceedings', 'Educational Videos', 'Newsletters'] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export type Collection = 'new' | 'archived';
export const NO_DEPARTMENT = '__none';
export const isSection = (s: unknown): s is AdminSection => (ADMIN_SECTIONS as readonly string[]).includes(String(s));

/** The words for what one record is, per section and collection — shown on the page so a count is never read as another unit. */
export const SECTION_LABELS: Record<AdminSection, { singular: string; one: string; plural: string; unit: Record<Collection, string> }> = {
  'Books': { singular: 'Book', one: 'book', plural: 'books', unit: { new: 'book title', archived: 'archived book record' } },
  'Periodicals': { singular: 'Periodical', one: 'periodical article', plural: 'periodical articles', unit: { new: 'individual article (not a journal title or an issue)', archived: 'individual paper (not a journal title or an issue)' } },
  'Magazines': { singular: 'Magazine', one: 'magazine item', plural: 'magazine items', unit: { new: 'magazine item', archived: 'magazine item' } },
  'Case Reports': { singular: 'Case Report', one: 'case report', plural: 'case reports', unit: { new: 'case report', archived: 'case report' } },
  'Theses': { singular: 'Thesis', one: 'thesis', plural: 'theses', unit: { new: 'thesis', archived: 'thesis' } },
  'Conference Proceedings': { singular: 'Conference Proceeding', one: 'conference paper', plural: 'conference papers', unit: { new: 'conference paper', archived: 'conference paper' } },
  'Educational Videos': { singular: 'Educational Video', one: 'video', plural: 'videos', unit: { new: 'video', archived: 'video' } },
  'Newsletters': { singular: 'Newsletter', one: 'newsletter item', plural: 'newsletter items', unit: { new: 'newsletter item', archived: 'newsletter item' } },
};

export type ContentFilters = {
  q?: string;
  /** Collection-specific status as stored; the archived table is matched without regard to case. */
  status?: string;
  /** 'public' narrows to what the public library lists; anything else is every record. */
  visibility?: string;
  /** A department name, or NO_DEPARTMENT. Left out of the department counts. */
  domain?: string;
};

export type ContentSort = 'added' | 'oldest' | 'title';
export const parseSort = (v: unknown): ContentSort => (v === 'oldest' || v === 'title' ? v : 'added');

type Spellings = { expand: (departments: string[]) => Promise<string[]> };
const modelName = (section: AdminSection, c: Collection) => (c === 'archived' ? 'content' : section === 'Books' ? 'book' : 'article');

/** The rows that belong to the section in the collection, before any filter. */
function baseWhere(section: AdminSection, c: Collection): any {
  if (c === 'archived') return { contentType: section };
  if (section === 'Books') return {};
  // An article with no type is a periodical (the public library treats it so too).
  return section === 'Periodicals' ? { OR: [{ contentType: 'Periodicals' }, { contentType: null }] } : { contentType: section };
}
const draft = (c: Collection) => (c === 'archived' ? { status: { equals: 'Draft', mode: 'insensitive' } } : { status: 'Draft' });
const publicOf = (c: Collection) => (c === 'archived' ? { NOT: { status: { equals: 'Draft', mode: 'insensitive' } } } : { status: 'Published' });

/** Prisma where for one section and collection. `withDomain: false` is what the department counts use: every other filter, no department. */
export async function contentWhere(section: AdminSection, c: Collection, f: ContentFilters, spellings: Spellings, opts: { withDomain?: boolean } = {}): Promise<any> {
  const and: any[] = [baseWhere(section, c)];
  const q = (f.q || '').trim();
  if (q) {
    const ci = (field: string) => ({ [field]: { contains: q, mode: 'insensitive' } });
    const fields = ['title', 'authors'];
    if (c === 'archived') fields.push('description');
    else if (section === 'Books') fields.push('isbn', 'publisherName');
    else if (section === 'Periodicals') fields.push('journalName', 'doi');
    and.push({ OR: fields.map(ci) });
  }
  if (f.status) and.push(c === 'archived' ? { status: { equals: f.status, mode: 'insensitive' } } : { status: f.status });
  if (f.visibility === 'public') and.push(publicOf(c));
  if (opts.withDomain !== false && f.domain) {
    if (f.domain === NO_DEPARTMENT) {
      const known = await spellings.expand(CANONICAL_NAMES);
      and.push({ OR: [{ domain: null }, { domain: '' }, { domain: { notIn: known } }] });
    } else {
      and.push({ domain: { in: await spellings.expand([f.domain]) } });
    }
  }
  return { AND: and };
}

/** The table's order. The archived table has a publication stamp of its own; the new one is ordered by when the row was added. */
export function contentOrderBy(c: Collection, sort: ContentSort): any[] {
  const added = c === 'archived' ? 'publishedAt' : 'createdAt';
  if (sort === 'title') return [{ title: 'asc' }, { id: 'asc' }];
  return [{ [added]: sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }];
}

export type DepartmentCount = { name: string; total: number; public: number };
export type SectionOverview = {
  section: AdminSection;
  collection: Collection;
  /** What one record is here, in words. */
  unit: string;
  /** ISO time every figure below was taken at, so two screens can be compared. */
  generatedAt: string;
  /** Every department of the registry, zero or not. Counts follow q/status, not the department chosen. */
  departments: DepartmentCount[];
  unassigned: { total: number; public: number; blank: number; unrecognised: number; labels: { name: string; count: number }[] };
  /** The whole collection, no filter: what the cards show. */
  summary: { total: number; public: number; draft: number; rejected: number; other: number; unassigned: number; readable: number | null };
  /** Both collections side by side. `archived` is null for an account that may not list it. */
  collections: { new: { total: number; public: number }; archived: { total: number; public: number } | null };
  /** departments + unassigned: compare with the table's total. */
  filteredTotal: number;
  filteredPublic: number;
  reconciles: boolean;
};

/** Full text served from here, per the public library's own rule (Books: ViewableHere with a file; articles: a file not marked link-only/metadata-only; archived: a validated file). */
const readableOf = (section: AdminSection, c: Collection): any | null => {
  if (section === 'Educational Videos') return null;
  if (c === 'archived') return { AND: [baseWhere(section, c), publicOf(c), { fileUrl: { not: null }, validationStatus: 'VALID_VIEWABLE' }] };
  if (section === 'Books') return { status: 'Published', accessStatus: 'ViewableHere', pdfUrl: { not: null } };
  return { AND: [baseWhere(section, c), { status: 'Published', pdfUrl: { not: null }, OR: [{ accessStatus: null }, { accessStatus: 'ViewableHere' }] }] };
};

export async function sectionOverview(db: any, spellings: Spellings, section: AdminSection, c: Collection, f: ContentFilters, opts: { canSeeArchived?: boolean } = {}): Promise<SectionOverview> {
  const model = db[modelName(section, c)];
  const base = baseWhere(section, c);
  const facet = await contentWhere(section, c, f, spellings, { withDomain: false });
  const publicFacet = { AND: [facet, publicOf(c)] };
  const readable = readableOf(section, c);
  const other = c === 'new' ? 'archived' : 'new';
  const otherModel = db[modelName(section, other)];
  const otherBase = baseWhere(section, other);

  const [byDomain, publicByDomain, total, listed, drafts, rejected, readableN, counted, otherTotal, otherPublic] = await Promise.all([
    model.groupBy({ by: ['domain'], where: facet, _count: { _all: true } }),
    model.groupBy({ by: ['domain'], where: publicFacet, _count: { _all: true } }),
    model.count({ where: base }),
    model.count({ where: { AND: [base, publicOf(c)] } }),
    model.count({ where: { AND: [base, draft(c)] } }),
    c === 'new' ? model.count({ where: { AND: [base, { status: 'Rejected' }] } }) : Promise.resolve(0),
    readable ? model.count({ where: readable }) : Promise.resolve(null),
    model.count({ where: facet }),
    otherModel.count({ where: otherBase }),
    otherModel.count({ where: { AND: [otherBase, publicOf(other)] } }),
  ]);

  const rows = new Map<string, DepartmentCount>(CANONICAL_NAMES.map(n => [n, { name: n, total: 0, public: 0 }]));
  const unassigned = { total: 0, public: 0, blank: 0, unrecognised: 0, labels: [] as { name: string; count: number }[] };
  const labels = new Map<string, number>();
  const place = (domain: string | null, n: number, key: 'total' | 'public') => {
    const canonical = domain ? canonicalDepartmentName(domain) : null;
    if (canonical) { rows.get(canonical)![key] += n; return; }
    unassigned[key] += n;
    if (key === 'total') {
      if (!domain || !domain.trim()) unassigned.blank += n;
      else { unassigned.unrecognised += n; labels.set(domain, (labels.get(domain) || 0) + n); }
    }
  };
  for (const g of byDomain) place(g.domain, g._count._all, 'total');
  for (const g of publicByDomain) place(g.domain, g._count._all, 'public');
  unassigned.labels = [...labels].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  // Alphabetical, not by count: the order of the list must not move when a filter changes the numbers.
  const departments = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const filteredTotal = departments.reduce((s, d) => s + d.total, 0) + unassigned.total;
  const filteredPublic = departments.reduce((s, d) => s + d.public, 0) + unassigned.public;

  const known = await spellings.expand(CANONICAL_NAMES);
  const unassignedAll = await model.count({ where: { AND: [base, { OR: [{ domain: null }, { domain: '' }, { domain: { notIn: known } }] }] } });

  const mine = { total, public: listed };
  const theirs = { total: otherTotal, public: otherPublic };
  const archivedVisible = c === 'archived' || opts.canSeeArchived !== false;
  return {
    section, collection: c, unit: SECTION_LABELS[section].unit[c], generatedAt: new Date().toISOString(),
    departments, unassigned,
    summary: { total, public: listed, draft: drafts, rejected, other: Math.max(0, total - listed - drafts - rejected), unassigned: unassignedAll, readable: readableN },
    collections: c === 'new' ? { new: mine, archived: archivedVisible ? theirs : null } : { new: theirs, archived: mine },
    filteredTotal, filteredPublic, reconciles: filteredTotal === counted,
  };
}
