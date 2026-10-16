import { CANONICAL_NAMES } from '../departmentRegistry.js';
import { departmentForDoajRow } from '../doajCatalogue.js';
import { departmentKeywords } from './books/classifier.js';

/**
 * Which department does a journal that came from Crossref or OpenAlex belong to?
 *
 * Neither source files journals under our departments, and the term a journal was FOUND with is not evidence about the journal: searching
 * "architecture" returns whatever mentions it. So the answer is read from the journal itself — its title and the subjects the source gives it:
 *
 *   1. the same title/keyword rules the DOAJ import uses for the departments with no Library of Congress class of their own (nanotechnology,
 *      ayurveda, nursing, dental, energy …), then
 *   2. the book classifier's own department wording, and only when two independent things agree: a subject AND the title say the same
 *      department, or at least two different subjects say it and no other department is close.
 *
 * Anything less is null — the journal is not given a department to make a number look better, and goes to review instead. The broad departments
 * (Applied Sciences, Science, Multidisciplinary) are never inferred from subject wording alone.
 */

const BROAD = new Set(['Applied Sciences', 'Science', 'Multidisciplinary']);

export function journalDepartment(title: string, subjects: string[]): string | null {
  const subs = (subjects || []).map(s => String(s || '').trim()).filter(Boolean);
  const specific = departmentForDoajRow({ 'Journal title': title || '', Keywords: subs.join(' | '), 'LCC Codes': '' });
  if (specific && !BROAD.has(specific)) return specific;

  const score = new Map<string, number>();
  for (const dep of CANONICAL_NAMES) {
    const res = departmentKeywords(dep);
    if (!res.length) continue;
    const inTitle = res.some(re => re.test(title || ''));
    const hits = subs.filter(s => res.some(re => re.test(s))).length;
    if (BROAD.has(dep) && !(inTitle && hits >= 1)) continue;
    if (inTitle && hits >= 1) score.set(dep, 2 + hits);
    else if (hits >= 2) score.set(dep, hits);
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked[1] && ranked[0][1] - ranked[1][1] < 1) return null;           // two departments equally likely: a person decides
  return ranked[0][0];
}
