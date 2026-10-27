import { ingestionDb as db } from './db.js';
import { DOAJ_CATEGORIES, type CatalogueCheck, type DoajCategory, type DoajEntry, type DoajInspection } from '../doajCatalogue.js';

/**
 * Looking at the rows behind a DOAJ check's counts.
 *
 * A check (or a Quick Import) sorts every row of DOAJ's file into one category (doajCatalogue.ts). The counts are not enough to act on: a person has to see
 * WHICH journals are "held but not public", under which ISSN, and what status each is in now. The rows are kept beside the check, in the same snapshot row
 * (items.inspect), and read back a page at a time. Reading writes nothing. The held journal's status, department and article count are read LIVE, so
 * what is shown is the catalogue as it is now, not as it was when the check ran.
 *
 * The importable snapshot of the checks (kind DOAJ_CATALOGUE) is unchanged apart from the extra key. A Quick Import keeps its own,
 * non-importable snapshot (kind DOAJ_INSPECTION): nothing can be imported from it.
 */

export const INSPECTION_KINDS = ['DOAJ_CATALOGUE', 'DOAJ_INSPECTION'] as const;
/** How long a Quick Import's rows can be opened. Longer than a preview's hour: it is only a reading aid. */
const INSPECTION_TTL_MS = 24 * 60 * 60_000;

/** What is stored in a snapshot's `items` for a check. */
export const checkItems = (check: CatalogueCheck) => ({ newIssns: check.newIssns, reviewSample: check.reviewSample, inspect: check.inspect });

/** A read-only snapshot of a check, for a Quick Import. Nothing can be imported from it. */
export async function saveInspection(check: CatalogueCheck, admin: any, source = 'DOAJ Quick Import'): Promise<string | null> {
  try {
    const row = await db.ingestionPreview.create({
      data: { kind: 'DOAJ_INSPECTION', createdBy: admin?.email || admin?.uid || null, expiresAt: new Date(Date.now() + INSPECTION_TTL_MS), params: { source }, summary: check.breakdown as any, items: { inspect: check.inspect } as any },
    });
    return row.id;
  } catch { return null; }                                  // a reading aid must never fail the run it describes
}

export class InspectionError extends Error { constructor(public status: number, message: string) { super(message); } }

export type InspectedRow = {
  doaj: { title: string; issn: string; eissn: string };
  matchedBy: 'issn' | 'eissn' | 'both' | null;
  titleDiffers: boolean;
  journals: { id: string; title: string; issn: string | null; eissn: string | null; status: string; department: string | null; publishedArticles: number; public: boolean }[];
};

/** The categories a person can open, and the pseudo-category "title differs" (a view over the held ones). */
export type InspectCategory = DoajCategory | 'titleDiffers' | 'allHeld';
const HELD: DoajCategory[] = ['heldPublic', 'heldNoArticles', 'heldReview', 'heldRejected', 'ambiguous'];

export async function listInspection(previewId: string, o: { category: string; q?: string; page?: number; take?: number }) {
  if (!previewId) throw new InspectionError(400, 'A check is required.');
  const row = await db.ingestionPreview.findUnique({ where: { id: previewId } });
  if (!row || !(INSPECTION_KINDS as readonly string[]).includes(row.kind)) throw new InspectionError(404, 'That check does not exist. Run the check again.');
  if (row.expiresAt.getTime() < Date.now()) throw new InspectionError(410, 'That check has expired. Run it again to look at the journals.');
  const insp: DoajInspection | undefined = (row.items as any)?.inspect;
  if (!insp || insp.v !== 1) throw new InspectionError(404, 'That check did not keep its journal list. Run it again.');
  const cat = o.category as InspectCategory;
  if (cat !== 'titleDiffers' && cat !== 'allHeld' && !(DOAJ_CATEGORIES as string[]).includes(cat)) throw new InspectionError(400, 'Unknown category.');

  let entries: DoajEntry[] = cat === 'titleDiffers' ? HELD.flatMap(c => insp.categories[c] || []).filter(e => e.d)
    : cat === 'allHeld' ? HELD.flatMap(c => insp.categories[c] || []) : (insp.categories[cat as DoajCategory] || []);
  const q = (o.q || '').trim().toLowerCase();
  if (q) entries = entries.filter(e => e.t.toLowerCase().includes(q) || e.i.includes(q) || e.e.includes(q));
  const take = Math.min(Math.max(1, o.take || 50), 100), page = Math.max(1, o.page || 1);

  // The held journals of every row on this page, read now: their status is the catalogue's today.
  const slice = entries.slice((page - 1) * take, page * take);
  const ids = [...new Set(slice.flatMap(e => e.j || []))];
  const js: any[] = ids.length ? await db.journal.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, issn: true, eissn: true, status: true, domain: true } }) : [];
  const counts: any[] = ids.length ? await db.$queryRawUnsafe(`select "journalId" id, count(*)::int n from "Article" where status = 'Published' and "journalId" = any($1::text[]) group by 1`, ids) : [];
  const nBy = new Map<string, number>(counts.map(c => [c.id, c.n]));
  const jBy = new Map<string, any>(js.map(j => [j.id, j]));
  const rows: InspectedRow[] = slice.map(e => ({
    doaj: { title: e.t, issn: e.i, eissn: e.e }, matchedBy: e.by ?? null, titleDiffers: !!e.d,
    journals: (e.j || []).map(id => jBy.get(id)).filter(Boolean).map(j => {
      const n = nBy.get(j.id) || 0;
      return { id: j.id, title: j.title, issn: j.issn, eissn: j.eissn, status: j.status, department: j.domain, publishedArticles: n, public: (j.status === 'Accepted' || j.status === 'MetadataOnly') && n > 0 };
    }),
  }));
  return { category: cat, total: entries.length, page, take, rows, asOf: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() };
}
