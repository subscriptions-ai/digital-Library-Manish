import { AVAILABILITY_VALUES, canonicalContentType, type Availability as AvailParam } from './libraryParams.js';
import { OPEN_LICENCE_PREFIXES, availabilityOf, type RecordKind } from './libraryAvailability.js';

/**
 * The library's filters as database conditions, so every one of them runs in the query beside the count. Narrowing the page the browser
 * already holds shows three rows under a heading that says 27,056 — this is the other way: the server filters, counts and pages.
 *
 * Each function returns conditions to AND onto a where clause that already carries the status and the department scope. They are written
 * to agree, row for row, with `availabilityOf` (src/lib/libraryAvailability.ts), which labels a single record; a test compares the two.
 */

type Kind = 'article' | 'book' | 'content';
const HTTP = [{ originalUrl: { startsWith: 'https://' } }, { originalUrl: { startsWith: 'http://' } }];

/** Readable here — the same test `availabilityOf` applies. */
const readable = (kind: Kind): any =>
  kind === 'book' ? { pdfUrl: { not: null }, accessStatus: 'ViewableHere' }
    : kind === 'article' ? { pdfUrl: { not: null }, OR: [{ accessStatus: null }, { accessStatus: 'ViewableHere' }] }
      : { fileUrl: { not: null }, validationStatus: 'VALID_VIEWABLE' };

/** Not readable here: no file, or a file the record's status says is not ours to serve. */
const notReadable = (kind: Kind): any =>
  kind === 'book' ? { OR: [{ pdfUrl: null }, { accessStatus: null }, { accessStatus: { not: 'ViewableHere' } }] }
    : kind === 'article' ? { OR: [{ pdfUrl: null }, { accessStatus: { notIn: ['ViewableHere'] } }] }
      : { OR: [{ fileUrl: null }, { validationStatus: null }, { validationStatus: { not: 'VALID_VIEWABLE' } }] };

export function availabilityWhere(kind: Kind, avail: AvailParam): any | null {
  if (!avail) return null;
  if (avail === 'readable') return readable(kind);
  // The archived shelf keeps no source page for a record: it has nothing that is "at the source".
  if (kind === 'content') return avail === 'external' ? { id: '__none__' } : notReadable(kind);
  if (avail === 'external') return { AND: [notReadable(kind), { OR: HTTP }] };
  return { AND: [notReadable(kind), { OR: [{ originalUrl: null }, { AND: [{ NOT: { originalUrl: { startsWith: 'https://' } } }, { NOT: { originalUrl: { startsWith: 'http://' } } }] }] }] };
}

/** Open access that a recorded open licence supports. A source's "open access" label alone is not evidence. */
export const verifiedOaWhere = (): any => ({
  accessType: { in: ['OpenAccess', 'Free'] },
  OR: OPEN_LICENCE_PREFIXES.map(p => ({ licence: { startsWith: p, mode: 'insensitive' } })),
});

export type DiscoveryFilters = { publisher?: string; language?: string; year?: string; avail?: string; oa?: boolean; atype?: string; q?: string };

/** Reads the filters off a request, keeping only values the library understands. */
export function discoveryFiltersFrom(query: Record<string, any>): DiscoveryFilters {
  const s = (v: any, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const year = Number(query.year);
  const avail = (AVAILABILITY_VALUES as readonly string[]).includes(String(query.avail)) ? String(query.avail) : '';
  return {
    publisher: s(query.publisher, 200), language: s(query.language ?? query.lang, 40),
    year: Number.isInteger(year) && year >= 1000 && year <= 2100 ? String(year) : '',
    avail, oa: query.oa === '1' || query.oa === 'verified',
    atype: canonicalContentType(typeof query.atype === 'string' ? query.atype : typeof query.contentType === 'string' ? query.contentType : ''),
  };
}

/** The AND-able conditions for a set of filters on one table. */
export function discoveryAnd(kind: Kind, f: DiscoveryFilters): any[] {
  const and: any[] = [];
  if (f.publisher && kind !== 'content') and.push({ publisherName: f.publisher });
  if (f.language && kind !== 'content') and.push({ language: { equals: f.language, mode: 'insensitive' } });
  if (f.year && kind !== 'content') and.push({ year: parseInt(f.year, 10) });
  if (f.oa && kind !== 'content') and.push(verifiedOaWhere());
  const a = availabilityWhere(kind, (f.avail || '') as AvailParam);
  if (a) and.push(a);
  // Other article types (Theses, Magazines …) live in Article too; an article with no type is a periodical.
  if (kind === 'article' && f.atype) and.push(f.atype === 'Periodicals' ? { OR: [{ contentType: 'Periodicals' }, { contentType: null }] } : { contentType: f.atype });
  return and;
}

/** Adds conditions to a where clause without clobbering an AND it already has. */
export function andOnto(where: any, clauses: any[]): any {
  if (!clauses.length) return where;
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...clauses];
  return where;
}

/**
 * A list row as the reader's screen needs it: what it offers (availability, the validated source page, what "open access" can truthfully
 * claim), with the file address removed from anything that is not served from here — the screen decides Read / Visit source from
 * `availability`, never from a stored address. `entitled` is whether this reader's plan covers the record; null for a visitor.
 */
export function libraryView(kind: RecordKind, row: any, entitled: boolean | null = null, stripFiles = true): any {
  const a = availabilityOf(kind, row);
  const out: any = { ...row, availability: a.availability, externalUrl: a.externalUrl, sourceOpenAccess: a.sourceOpenAccess, entitled };
  if (stripFiles && a.availability !== 'readable') { out.pdfUrl = null; if ('fileUrl' in out) out.fileUrl = null; }
  return out;
}

export type LibraryFacets = {
  publishers: { name: string; count: number }[];
  languages: { name: string; count: number }[];
  years: { year: number; count: number }[];
  types: { name: string; count: number }[];
  availability: { readable: number; external: number; metadata: number };
  verifiedOa: number;
};

/**
 * What the filters can offer for the records in `where` (the scope, the department and the shelf already applied). A value with nothing
 * behind it is never offered, so a choice cannot lead to an empty page; and an empty facet (no language recorded anywhere) is simply absent.
 */
export async function libraryFacets(db: any, kind: 'article' | 'book', where: any): Promise<LibraryFacets> {
  const model = kind === 'book' ? db.book : db.article;
  const [pubs, langs, years, types, readableN, externalN, total, oaN] = await Promise.all([
    model.groupBy({ by: ['publisherName'], where: { ...where, publisherName: { not: null } }, _count: { _all: true } }),
    model.groupBy({ by: ['language'], where: { ...where, language: { not: null } }, _count: { _all: true } }),
    model.groupBy({ by: ['year'], where: { ...where, year: { not: null } }, _count: { _all: true } }),
    kind === 'article' ? model.groupBy({ by: ['contentType'], where, _count: { _all: true } }) : Promise.resolve([]),
    model.count({ where: andOnto({ ...where }, [availabilityWhere(kind, 'readable')]) }),
    model.count({ where: andOnto({ ...where }, [availabilityWhere(kind, 'external')]) }),
    model.count({ where }),
    model.count({ where: andOnto({ ...where }, [verifiedOaWhere()]) }),
  ]);
  const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;
  // Where two spellings of one language are stored ("en" and "EN"), they are one choice.
  const langMap = new Map<string, { name: string; count: number }>();
  for (const g of langs) { const k = String(g.language).trim().toLowerCase(); if (!k) continue; const e = langMap.get(k); if (e) e.count += g._count._all; else langMap.set(k, { name: String(g.language).trim(), count: g._count._all }); }
  const typeMap = new Map<string, number>();
  for (const g of types) { const n = canonicalContentType(g.contentType ?? 'Periodicals'); if (n) typeMap.set(n, (typeMap.get(n) || 0) + g._count._all); }
  return {
    publishers: pubs.map((g: any) => ({ name: g.publisherName, count: g._count._all })).sort(byCount).slice(0, 200),
    languages: [...langMap.values()].sort(byCount),
    years: years.map((g: any) => ({ year: g.year, count: g._count._all })).sort((a: any, b: any) => b.year - a.year),
    types: [...typeMap].map(([name, count]) => ({ name, count })).sort(byCount),
    availability: { readable: readableN, external: externalN, metadata: Math.max(0, total - readableN - externalN) },
    verifiedOa: oaN,
  };
}
