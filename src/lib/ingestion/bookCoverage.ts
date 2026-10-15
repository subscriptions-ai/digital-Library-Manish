import { ingestionDb } from './db.js';
import { CANONICAL_NAMES, canonicalDepartmentName } from '../departmentRegistry.js';

/**
 * How many books each canonical department actually holds, counted from the catalogue — never from a run log, never from a target.
 *
 * Two different questions share this module and are never mixed:
 *   · what the catalogue holds NOW (the counts here), and
 *   · what ingestion has done (the run log, see catalogueGrowth.ts).
 * A target is a scheduling aid. Nothing here rounds up to it, and a department with no books reports 0 until a valid book is published.
 *
 * What is counted for a department:
 *   Published      status Published and the department stored on the row (a stored spelling the registry knows is folded to the official name).
 *   Open/Readable  published and offered for reading here (accessStatus ViewableHere).
 *   External       published and linked to the source that holds it (LinkOnly).
 *   Metadata only  published as a catalogue record with nowhere to read it (MetadataOnly, or not yet judged).
 *   Review         Drafts waiting for a person whose classifier suggestion was this department. They are NOT in the public count.
 *   Total          Published + Review: what the department has been given so far.
 *
 * A stored department the registry does not know ("Engineering") is not folded into any department; it is reported on its own line, so
 * nobody mistakes it for coverage and nobody loses sight of it.
 */

export type CoverageState = 'critical' | 'low' | 'building' | 'target-met';

/** Critical 0–24 · Low 25–49 · Building 50–99 · Initial target met 100+. */
export function coverageState(published: number): CoverageState {
  if (published >= 100) return 'target-met';
  if (published >= 50) return 'building';
  if (published >= 25) return 'low';
  return 'critical';
}
export const COVERAGE_LABEL: Record<CoverageState, string> = { critical: 'Critical', low: 'Low', building: 'Building', 'target-met': 'Initial target met' };

export const TARGETS = { phase1: 100, phase2: 250 } as const;

export type DepartmentBooks = {
  department: string;
  total: number; published: number; readable: number; external: number; metadataOnly: number; review: number;
  state: CoverageState; label: string;
  phase1Met: boolean; phase2Met: boolean;
};

const blank = (department: string): DepartmentBooks => ({
  department, total: 0, published: 0, readable: 0, external: 0, metadataOnly: 0, review: 0,
  state: 'critical', label: COVERAGE_LABEL.critical, phase1Met: false, phase2Met: false,
});

export type BookCoverage = {
  /** Every canonical department, lowest published count first (ties by name). Never missing one. */
  departments: DepartmentBooks[];
  /** Stored departments the registry does not know, and drafts nobody has placed. Not counted toward any department. */
  other: { label: string; published: number; review: number }[];
  totals: { books: number; published: number; review: number };
};

export async function bookCoverageByDepartment(db: any = ingestionDb): Promise<BookCoverage> {
  const rows: any[] = await db.$queryRawUnsafe(`
    select coalesce(domain, '') d,
           (count(*) filter (where status = 'Published'))::int published,
           (count(*) filter (where status = 'Published' and "accessStatus" = 'ViewableHere'))::int readable,
           (count(*) filter (where status = 'Published' and "accessStatus" = 'LinkOnly'))::int external,
           (count(*) filter (where status = 'Published' and ("accessStatus" is null or "accessStatus" not in ('ViewableHere', 'LinkOnly'))))::int "metadataOnly"
      from "Book" where status = 'Published' group by 1`);
  const drafts: any[] = await db.$queryRawUnsafe(`
    select coalesce(metadata->'harvest'->'department'->>'suggested', '') s, count(*)::int n
      from "Book" where status = 'Draft' group by 1`);
  const totalsRow = (await db.$queryRawUnsafe(`select (count(*) filter (where status = 'Published'))::int published, (count(*) filter (where status = 'Draft'))::int review from "Book"`))[0] || { published: 0, review: 0 };

  const by = new Map<string, DepartmentBooks>(CANONICAL_NAMES.map(n => [n, blank(n)]));
  const other = new Map<string, { label: string; published: number; review: number }>();
  const strayOf = (label: string) => other.get(label) ?? other.set(label, { label, published: 0, review: 0 }).get(label)!;

  for (const r of rows) {
    const name = r.d ? canonicalDepartmentName(r.d) : null;
    const target = name ? by.get(name) : null;
    if (!target) { strayOf(r.d ? `${r.d} (not a canonical department)` : 'No department stored').published += r.published; continue; }
    target.published += r.published; target.readable += r.readable; target.external += r.external; target.metadataOnly += r.metadataOnly;
  }
  for (const r of drafts) {
    const name = r.s ? canonicalDepartmentName(r.s) : null;
    const target = name ? by.get(name) : null;
    if (target) target.review += r.n; else strayOf('Review: no confident department suggested').review += r.n;
  }

  const departments = [...by.values()].map(d => {
    const total = d.published + d.review;
    const state = coverageState(d.published);
    return { ...d, total, state, label: COVERAGE_LABEL[state], phase1Met: d.published >= TARGETS.phase1, phase2Met: d.published >= TARGETS.phase2 };
  }).sort((a, b) => a.published - b.published || a.department.localeCompare(b.department));

  return { departments, other: [...other.values()].filter(o => o.published || o.review), totals: { books: totalsRow.published + totalsRow.review, published: totalsRow.published, review: totalsRow.review } };
}

/** The departments below `target` published books, lowest first (so a department with none comes before every other). */
export function belowTarget(coverage: BookCoverage, target: number = TARGETS.phase1): DepartmentBooks[] {
  return coverage.departments.filter(d => d.published < target);
}

// ── Journals ────────────────────────────────────────────────────────────────

export type DepartmentJournals = {
  department: string; total: number;
  /** Full text accepted, on a declaration from DOAJ or the publisher. */
  verifiedOa: number;
  /** Listed by a source that does not verify open access (Crossref, OpenAlex, ROAD), held for a person. */
  oaUnverified: number;
  /** A catalogue entry and a link, nothing more. */
  metadataOnly: number;
  /** Waiting for a person to decide, for any reason. */
  reviewRequired: number;
  low: boolean;
};

/** Below this many journals a department is reported as thinly covered. A report, not a requirement: departments are not forced equal. */
export const LOW_JOURNALS = 100;

export async function journalCoverageByDepartment(db: any = ingestionDb): Promise<{ departments: DepartmentJournals[]; total: number; other: { label: string; total: number }[] }> {
  const rows: any[] = await db.$queryRawUnsafe(`
    select coalesce(domain, '') d, count(*)::int total,
           (count(*) filter (where status = 'Accepted'))::int "verifiedOa",
           (count(*) filter (where status = 'NeedsReview' and coalesce("rightsBasis", '') ilike '%OA unverified%'))::int "oaUnverified",
           (count(*) filter (where status = 'MetadataOnly'))::int "metadataOnly",
           (count(*) filter (where status = 'NeedsReview'))::int "reviewRequired"
      from "Journal" group by 1`);
  const by = new Map<string, DepartmentJournals>(CANONICAL_NAMES.map(n => [n, { department: n, total: 0, verifiedOa: 0, oaUnverified: 0, metadataOnly: 0, reviewRequired: 0, low: true }]));
  const other: { label: string; total: number }[] = [];
  let total = 0;
  for (const r of rows) {
    total += r.total;
    const name = r.d ? canonicalDepartmentName(r.d) : null;
    const t = name ? by.get(name) : null;
    if (!t) { other.push({ label: r.d ? `${r.d} (not a canonical department)` : 'No department stored', total: r.total }); continue; }
    t.total += r.total; t.verifiedOa += r.verifiedOa; t.oaUnverified += r.oaUnverified; t.metadataOnly += r.metadataOnly; t.reviewRequired += r.reviewRequired;
  }
  const departments = [...by.values()].map(d => ({ ...d, low: d.total < LOW_JOURNALS })).sort((a, b) => a.total - b.total || a.department.localeCompare(b.department));
  return { departments, total, other };
}
