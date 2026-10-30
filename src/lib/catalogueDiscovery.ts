import type { PrismaClient } from '@prisma/client';
import { legacyPublicWhere } from './publicStatus.js';
import { publicBookWhere, readableBookWhere } from './publicBooks.js';
import { publicJournalStatusWhere } from './publicJournals.js';
import { canonicalDepartmentName, canonicalOrSelf } from './departmentRegistry.js';
import { plainTitle } from './abstractPreview.js';

/**
 * Catalogue discovery for the AI assistant: one question, every shelf the public catalogue lists.
 *
 * The library keeps its records in four places, and a visitor asking "do you have radiology books?" is asking about all of them:
 *   - Book     the structured collection of books
 *   - Journal  journal titles (public when Accepted or MetadataOnly: the same rule every public journal list uses)
 *   - Article  research articles (public when Published)
 *   - Content  the legacy archive (theses, periodicals, videos, legacy books…), public by the legacy rule
 *
 * Rules, each one so the assistant cannot say more than the catalogue does:
 *   - Visibility. Only what the public catalogue already lists. Drafts, rejected and held records are never read.
 *   - Departments. The caller's department may be an official name, a listed alias ("Paramedical") or an older spelling found in stored
 *     records; all of them find the same records. A name the registry does not know is matched exactly, as it always was.
 *     A question that is itself a department name ("radiology") also finds what is filed under that department.
 *   - No duplicates. A record that exists in two shelves (a legacy copy of a book, an article listed twice) appears once, the structured
 *     record first. The identity is the DOI when there is one, else the title with the first author.
 *   - No full-text claims. `availability` is "full_text_here" only when this site actually serves the file (Book: ViewableHere with a
 *     file; Article: the same; legacy: a viewer check that passed). Everything else is "catalogue_record_only": a record, with the
 *     publisher or source holding the text. Journals are always a record. Whether a given visitor may open it depends on their plan; this
 *     function does not know the visitor and never says that they can.
 */

export type DiscoveryKind = 'book' | 'journal' | 'article' | 'legacy';
export type Availability = 'full_text_here' | 'catalogue_record_only';

export type DiscoveryResult = {
  id: string;
  kind: DiscoveryKind;
  title: string;
  authors: string | null;
  department: string | null;
  contentType: string;
  subjectArea: string | null;
  year: number | null;
  availability: Availability;
};

export type DiscoveryParams = {
  q: string;
  /** Official name, listed alias, or any spelling in use. */
  department?: string;
  /** "Books", "Journals", "Articles", or a legacy type such as "Theses". Absent = every shelf. */
  contentType?: string;
  limit?: number;
  /** Every stored spelling that means these departments (the server's cached lookup). Defaults to the registry's names and aliases. */
  spellings?: (departments: string[]) => Promise<string[]>;
};

export type DiscoveryOutput = {
  results: DiscoveryResult[];
  /** Matches per shelf, before duplicates are removed from the list. */
  matches: Record<DiscoveryKind, number>;
  department: { asked: string | null; official: string | null; searchedAs: string[] };
  /** What the assistant may and may not conclude from the list. */
  note: string;
};

const NOTE = 'These are catalogue records. Say a text can be read here only where availability is "full_text_here"; for "catalogue_record_only" the record points to the publisher or source. Whether a visitor can open a record depends on their subscription, which is not known here.';

const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Every identity a record has: its DOI when it has one, and always its title with the first author. Two records sharing either are one record. */
const identities = (r: { title: string; authors: string | null; doi?: string | null }): string[] => {
  const ids = [`t:${norm(r.title)}|${norm((r.authors || '').split(/[,;]/)[0])}`];
  const doi = String(r.doi ?? '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  if (doi) ids.push(`doi:${doi}`);
  return ids;
};

const wants = (contentType: string | undefined, shelf: 'books' | 'journals' | 'articles'): boolean => {
  if (!contentType) return true;
  const t = contentType.trim().toLowerCase();
  if (shelf === 'books') return t === 'book' || t === 'books' || t === 'e-books' || t === 'ebooks';
  if (shelf === 'journals') return t === 'journal' || t === 'journals';
  return t === 'article' || t === 'articles';
};
const wantsLegacy = (contentType: string | undefined): boolean => {
  if (!contentType) return true;
  const t = contentType.trim().toLowerCase();
  return !['journal', 'journals', 'article', 'articles'].includes(t);
};

export async function discoverCatalogue(prisma: PrismaClient | any, p: DiscoveryParams): Promise<DiscoveryOutput> {
  const q = String(p.q ?? '').trim();
  const limit = Math.max(1, Math.min(25, Number(p.limit) || 5));
  const asked = p.department?.trim() || null;
  const official = asked ? canonicalDepartmentName(asked) : null;
  const expand = p.spellings ?? (async (ds: string[]) => ds);

  // Departments: what was asked for, and — when the question itself names a department — that one as well.
  const queryDept = canonicalDepartmentName(q);
  const spellingFor = async (name: string) => expand([name]);
  const searchedAs = asked ? (official ? await spellingFor(official) : [asked]) : [];
  const queryDeptSpellings = queryDept && !asked ? await spellingFor(queryDept) : [];

  const empty: DiscoveryOutput = { results: [], matches: { book: 0, journal: 0, article: 0, legacy: 0 }, department: { asked, official, searchedAs }, note: NOTE };
  if (q.length < 2) return empty;

  const text = (fields: string[]) => fields.map(f => ({ [f]: { contains: q, mode: 'insensitive' } }));
  const byDept = (): any => (searchedAs.length ? { domain: { in: searchedAs } } : {});
  // With a department asked for, the text must match inside it. Without one, a question that is a department name matches that department.
  const textOr = (fields: string[]) => ({ OR: [...text(fields), ...(queryDeptSpellings.length ? [{ domain: { in: queryDeptSpellings } }] : [])] });

  const take = limit * 2;   // a little extra, so removing duplicates still leaves a full list
  const jobs: Promise<{ kind: DiscoveryKind; rows: any[]; n: number }>[] = [];

  if (wants(p.contentType, 'books')) {
    const where = { ...publicBookWhere, ...byDept(), ...textOr(['title', 'authors', 'subject']) };
    jobs.push(Promise.all([
      prisma.book.findMany({ where, take, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }], select: { id: true, title: true, authors: true, domain: true, subject: true, year: true, doi: true, isbn: true, accessStatus: true, pdfUrl: true } }),
      prisma.book.count({ where }),
    ]).then(([rows, n]: any) => ({ kind: 'book' as const, rows, n })));
  }
  if (wants(p.contentType, 'journals')) {
    const where = { ...publicJournalStatusWhere, ...byDept(), ...textOr(['title', 'publisherName', 'subject']) };
    jobs.push(Promise.all([
      prisma.journal.findMany({ where, take, orderBy: [{ title: 'asc' }], select: { id: true, title: true, domain: true, subject: true, publisherName: true } }),
      prisma.journal.count({ where }),
    ]).then(([rows, n]: any) => ({ kind: 'journal' as const, rows, n })));
  }
  if (wants(p.contentType, 'articles')) {
    const where = { status: 'Published', ...byDept(), ...textOr(['title', 'authors', 'journalName']) };
    jobs.push(Promise.all([
      prisma.article.findMany({ where, take, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }], select: { id: true, title: true, authors: true, domain: true, journalName: true, year: true, doi: true, accessStatus: true, pdfUrl: true } }),
      prisma.article.count({ where }),
    ]).then(([rows, n]: any) => ({ kind: 'article' as const, rows, n })));
  }
  if (wantsLegacy(p.contentType)) {
    const ct = !p.contentType ? {} : wants(p.contentType, 'books') ? { contentType: 'Books' } : { contentType: { equals: p.contentType.trim(), mode: 'insensitive' } };
    const where: any = { ...legacyPublicWhere, ...byDept(), ...ct, ...textOr(['title', 'authors', 'description', 'subjectArea']) };
    jobs.push(Promise.all([
      prisma.content.findMany({ where, take, orderBy: { publishedAt: 'desc' }, select: { id: true, title: true, authors: true, domain: true, contentType: true, subjectArea: true, publishedAt: true, validationStatus: true, fileUrl: true } }),
      prisma.content.count({ where }),
    ]).then(([rows, n]: any) => ({ kind: 'legacy' as const, rows, n })));
  }

  const done = await Promise.all(jobs);
  const matches = { book: 0, journal: 0, article: 0, legacy: 0 } as Record<DiscoveryKind, number>;
  const all: (DiscoveryResult & { _keys: string[]; _rank: number })[] = [];
  const lowQ = q.toLowerCase();
  for (const { kind, rows, n } of done) {
    matches[kind] = n;
    for (const r of rows) {
      const title = (plainTitle(r.title) as string) || String(r.title || '');
      const authors = (r.authors ?? null) as string | null;
      const res: DiscoveryResult = {
        id: r.id, kind, title, authors,
        department: r.domain ? canonicalOrSelf(r.domain) : null,
        contentType: kind === 'book' ? 'Books' : kind === 'journal' ? 'Journals' : kind === 'article' ? 'Articles' : String(r.contentType || 'Content'),
        subjectArea: (r.subject ?? r.subjectArea ?? null) as string | null,
        year: typeof r.year === 'number' ? r.year : r.publishedAt ? new Date(r.publishedAt).getFullYear() : null,
        availability:
          (kind === 'book' || kind === 'article') && r.accessStatus === 'ViewableHere' && r.pdfUrl ? 'full_text_here'
          : kind === 'legacy' && r.validationStatus === 'VALID_VIEWABLE' && r.fileUrl ? 'full_text_here'
          : 'catalogue_record_only',
      };
      // A title that contains the question is a better answer than one that only mentions it in a subject or an abstract.
      const rank = title.toLowerCase().includes(lowQ) ? 0 : 1;
      all.push({ ...res, _keys: kind === 'journal' ? [`j:${r.id}`] : identities({ title, authors, doi: r.doi }), _rank: rank });
    }
  }
  // The structured shelves come before the archive, so a duplicate keeps the better record.
  const order: Record<DiscoveryKind, number> = { book: 0, article: 1, journal: 2, legacy: 3 };
  all.sort((a, b) => a._rank - b._rank || order[a.kind] - order[b.kind]);
  const seen = new Set<string>();
  const results: DiscoveryResult[] = [];
  for (const r of all) {
    if (r._keys.some(k => seen.has(k))) continue;
    r._keys.forEach(k => seen.add(k));
    const { _keys, _rank, ...clean } = r;
    results.push(clean);
    if (results.length >= limit) break;
  }
  return { results, matches, department: { asked, official, searchedAs }, note: NOTE };
}
