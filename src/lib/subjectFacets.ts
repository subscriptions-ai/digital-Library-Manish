import { cleanSubjectArea } from './subjects.js';

/**
 * What may be offered as a "Subject Area" filter, and what is held back from it.
 *
 * `cleanSubjectArea` already refuses a copied title, a bare number and a sentence. Rows imported from reference lists also carry other
 * things in the column — a DOI, a web address, a journal citation (`J. Appl. Phys. 54 (2019) 1234`), an identifier — and those are short
 * enough to pass. They are not subjects: a checkbox for one matches a single record and puts bibliographic text in the sidebar.
 *
 * Nothing is deleted or rewritten. The original value stays on the record; it is only not offered as a facet. The values held back are
 * counted, with a few examples, so the data can be fixed at its source (see scripts/audit-library-data-quality.ts).
 */

const DOI = /\b10\.\d{4,9}\/\S+/i;
const URLISH = /(https?:\/\/|www\.|\bdoi\s*[:.]|doi\.org)/i;
const CITATION = [
  /\(\s*(19|20)\d{2}\s*\)/,                       // (2019)
  /\b(19|20)\d{2}\s*[;,.]\s*\d+\s*[(:]/,          // 2019; 54(3  /  2019, 54:
  /\bvol(ume)?\.?\s*\d+/i, /\bno\.\s*\d+/i, /\bpp?\.\s*\d+/i,
  /\bet al\b\.?/i,
  /\b\d+\s*\(\d+\)\s*[:,]?\s*\d+/,                // 54(3):123
  /\[\d+\]/,                                      // [12]
  /\bissn\b|\bisbn\b|\barxiv\b|\bpmid\b/i,
];

export function whyNotASubject(value: unknown, title?: string | null): string | null {
  if (cleanSubjectArea(value, title) === null) return typeof value === 'string' && value.trim() ? 'not a category (title, number, placeholder or sentence)' : 'empty';
  const v = String(value).replace(/\s+/g, ' ').trim();
  if (DOI.test(v)) return 'DOI';
  if (URLISH.test(v)) return 'web address';
  if (CITATION.some(r => r.test(v))) return 'bibliographic reference';
  // Mostly digits and punctuation is an identifier, not a name.
  const letters = (v.match(/\p{L}/gu) || []).length;
  if (letters < 2 || letters / v.length < 0.55) return 'identifier';
  return null;
}

/** The subject as it may be offered, or null. */
export const cleanSubjectFacet = (value: unknown, title?: string | null): string | null => (whyNotASubject(value, title) === null ? String(value).replace(/\s+/g, ' ').trim() : null);

export type SubjectFacetResult = {
  subjects: { name: string; count: number }[];
  held: { reason: string; count: number; examples: string[] }[];
};

/** Builds the facet list from grouped rows (`{ subjectArea, count }`) — one row per distinct stored value, counted in the database. */
export function cleanSubjectFacets(rows: { subjectArea: unknown; count: number }[]): SubjectFacetResult {
  const subjects = new Map<string, { name: string; count: number }>();
  const held = new Map<string, { reason: string; count: number; examples: string[] }>();
  for (const r of rows) {
    const why = whyNotASubject(r.subjectArea, null);
    if (why === null) {
      const name = String(r.subjectArea).replace(/\s+/g, ' ').trim();
      // "Oncology" and "oncology" are one subject.
      const key = name.toLowerCase();
      const e = subjects.get(key);
      if (e) e.count += r.count; else subjects.set(key, { name, count: r.count });
    } else if (why !== 'empty') {
      const h = held.get(why) || { reason: why, count: 0, examples: [] };
      h.count += r.count; if (h.examples.length < 5) h.examples.push(String(r.subjectArea).slice(0, 120));
      held.set(why, h);
    }
  }
  return { subjects: [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name)), held: [...held.values()].sort((a, b) => b.count - a.count) };
}
