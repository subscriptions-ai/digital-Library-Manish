import { spellingsOfAll } from '../lib/departmentRegistry.js';

/**
 * Which department spellings the stored records actually use.
 *
 * Historical rows keep the spelling they were written with ("Medical sciences"), and this phase does not rewrite
 * them. A query for the department "Medical Sciences" therefore has to look for every spelling that means it. The
 * registry says which spellings mean what; this reads which ones exist in the data, so a variant nobody listed is
 * still found without any list being kept by hand. A stored value the registry does not recognise is never folded
 * into a department.
 *
 * The distinct values are read from the indexed department columns and cached for a few minutes: a new spelling
 * written by ingestion shows up on the next refresh, and a filter never waits on a scan.
 */
export type SpellingsDb = { $queryRawUnsafe: (sql: string, ...args: any[]) => Promise<any[]> };

const SOURCES = [
  `select distinct "domain" as v from "Journal" where "domain" is not null`,
  `select distinct "domain" from "Article" where "domain" is not null`,
  `select distinct "domain" from "Book" where "domain" is not null`,
  `select distinct "domain" from "Content" where "domain" is not null`,
  `select distinct "domain" from "ContentModule" where "domain" is not null`,
];

export function createDepartmentSpellings(db: SpellingsDb, ttlMs = 5 * 60 * 1000) {
  let cached: { at: number; values: string[] } | null = null;
  let inflight: Promise<string[]> | null = null;

  const observed = async (): Promise<string[]> => {
    if (cached && Date.now() - cached.at < ttlMs) return cached.values;
    if (!inflight) {
      inflight = (async () => {
        try {
          const rows = await db.$queryRawUnsafe(SOURCES.join(' union '));
          const values = rows.map((r: any) => String(r.v)).filter(Boolean);
          cached = { at: Date.now(), values };
          return values;
        } catch (e) {
          // A failed read must not take a catalogue page down: fall back to the last known list, else the registry alone.
          console.error('departmentSpellings: could not read stored spellings:', (e as any)?.message);
          return cached?.values ?? [];
        } finally { inflight = null; }
      })();
    }
    return inflight;
  };

  return {
    observed,
    /** Every stored spelling that means any of `departments`, plus the official names and aliases themselves. */
    expand: async (departments: string[]): Promise<string[]> => spellingsOfAll(departments, await observed()),
    /** Forget what was read, so the next call reads again (after an import, or in tests). */
    refresh: () => { cached = null; },
  };
}
