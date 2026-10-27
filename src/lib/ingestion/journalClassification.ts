import { CANONICAL_NAMES, canonicalDepartmentName } from '../departmentRegistry.js';
import { departmentForDoajRow } from '../doajCatalogue.js';
import { departmentKeywords } from './books/classifier.js';
import { journalDepartment } from './journalDepartment.js';

/**
 * Journal department classification for Review Automation R3B: which department does a journal that has none belong in, and how sure is that?
 *
 * Books are judged on controlled subject codes (BIC / LCC / NLM / DDC) plus wording. A journal record the review queue holds has none of those: Crossref,
 * OpenAlex and ROAD listings give a title and a few subject labels, and DOAJ's Library of Congress class is not kept on the journal. So the Book rules do not
 * map across, and this does not pretend they do. It reads the two things a journal record reliably has, and counts how many INDEPENDENT ones agree:
 *
 *   title      the title names a department (the same title rules the DOAJ import uses, and the department wording the Book classifier uses)
 *   subject    the subject labels name it (the same rules applied to the subjects, and the same wording)
 *
 * Publisher and ISSN are shown to the person reviewing and used to group the analysis, but they are never evidence of a department: a publisher
 * publishes in many fields, and an ISSN says nothing about subject.
 *
 * The broad departments (Applied Sciences, Science, Multidisciplinary) are never inferred from wording alone, exactly as the engine's own journal rule
 * (journalDepartment.ts) has it: they need the title AND a subject to agree. The engine's own rule is kept as `legacy` on every judgement, so a reviewer can
 * see where this analysis and the import-time rule differ.
 *
 * Tiers (the numbers are provisional until someone approves them, like the Book thresholds):
 *   high            both families agree on one department, with a clear lead over the runner-up
 *   medium          one family (or weak agreement) names one department, with a lead
 *   low             some evidence, but weak or contested
 *   unclassifiable  no evidence at all
 *
 * Reading only. Nothing here writes.
 */

export const JOURNAL_CLASSIFIER_VERSION = 1;
export type JournalTier = 'high' | 'medium' | 'low' | 'unclassifiable';
export type Family = 'title' | 'subject';

export type JournalThresholds = { highMinScore: number; highMinMargin: number; highRequiresBoth: boolean; mediumMinScore: number; mediumMinMargin: number };
export const CURRENT_JOURNAL_THRESHOLDS: JournalThresholds = { highMinScore: 8, highMinMargin: 4, highRequiresBoth: true, mediumMinScore: 4, mediumMinMargin: 2 };

const BROAD = new Set(['Applied Sciences', 'Science', 'Multidisciplinary']);
const MAX_SUBJECTS = 20, MAX_LEN = 120;

/** The subject labels of a journal, as plain trimmed text: its `subjects` list and its single `subject`. Bounded. */
export function subjectsOf(j: { subject?: unknown; subjects?: unknown }): string[] {
  const out: string[] = [];
  const add = (v: unknown) => { const s = String(v ?? '').trim().slice(0, MAX_LEN); if (s && !out.some(x => x.toLowerCase() === s.toLowerCase())) out.push(s); };
  if (Array.isArray(j.subjects)) for (const s of j.subjects as unknown[]) { if (typeof s === 'string' || typeof s === 'number') add(s); }
  add(j.subject);
  return out.slice(0, MAX_SUBJECTS);
}

export type JournalJudgement = {
  dept: string | null; score: number; margin: number; next: string | null; nextScore: number;
  families: Family[];
  /** What the engine's own import-time journal rule says for the same title and subjects. */
  legacy: string | null;
};

type Cell = { score: number; title: boolean; subject: boolean };

export function judgeJournal(j: { title?: unknown; subject?: unknown; subjects?: unknown }): JournalJudgement {
  const title = String(j.title ?? '').trim();
  const subs = subjectsOf(j);
  const cells = new Map<string, Cell>();
  const cell = (d: string | null) => { const name = canonicalDepartmentName(d); if (!name) return null; let c = cells.get(name); if (!c) cells.set(name, c = { score: 0, title: false, subject: false }); return c; };

  // 1. The title rules (the DOAJ import's own), applied to the title alone.
  const byTitle = departmentForDoajRow({ 'Journal title': title, Keywords: '', 'LCC Codes': '' });
  { const c = cell(byTitle); if (c) { c.score += 4; c.title = true; } }
  // 2. The same rules on each subject label: the first agreeing label is worth as much as the title rule, each further one a little.
  const bySubject = new Map<string, number>();
  for (const s of subs) { const d = canonicalDepartmentName(departmentForDoajRow({ 'Journal title': '', Keywords: s, 'LCC Codes': '' })); if (d) bySubject.set(d, (bySubject.get(d) || 0) + 1); }
  for (const [d, n] of bySubject) { const c = cell(d); if (c) { c.score += 4 + Math.min(2, n - 1); c.subject = true; } }
  // 3. The department wording the Book classifier uses: in the title, and in the subjects.
  for (const dep of CANONICAL_NAMES) {
    const res = departmentKeywords(dep);
    if (!res.length) continue;
    const inTitle = res.some(re => re.test(title));
    const hits = subs.filter(s => res.some(re => re.test(s))).length;
    if (!inTitle && !hits) continue;
    const c = cell(dep); if (!c) continue;
    if (inTitle) { c.score += 2; c.title = true; }
    if (hits) { c.score += Math.min(3, hits); c.subject = true; }
  }
  // The broad departments are never inferred from wording alone: they need the title and a subject to agree.
  for (const [d, c] of [...cells]) if (BROAD.has(d) && !(c.title && c.subject)) cells.delete(d);

  const ranked = [...cells.entries()].map(([dept, c]) => ({ dept, ...c })).sort((a, b) => b.score - a.score || a.dept.localeCompare(b.dept));
  const top = ranked[0], second = ranked[1];
  const legacy = canonicalDepartmentName(journalDepartment(title, subs));
  if (!top || top.score < 1) return { dept: null, score: 0, margin: 0, next: null, nextScore: 0, families: [], legacy };
  return {
    dept: top.dept, score: top.score, margin: top.score - (second?.score ?? 0), next: second?.dept ?? null, nextScore: second?.score ?? 0,
    families: ([top.title && 'title', top.subject && 'subject'].filter(Boolean)) as Family[], legacy,
  };
}

export function journalTierOf(score: number, margin: number, families: Family[], t: JournalThresholds = CURRENT_JOURNAL_THRESHOLDS): JournalTier {
  if (score < 1) return 'unclassifiable';
  const both = families.includes('title') && families.includes('subject');
  if (score >= t.highMinScore && margin >= t.highMinMargin && (!t.highRequiresBoth || both)) return 'high';
  if (score >= t.mediumMinScore && margin >= t.mediumMinMargin) return 'medium';
  return 'low';
}

/** One judged journal, with its tier under the given thresholds. */
export function classifyJournal(j: { title?: unknown; subject?: unknown; subjects?: unknown }, t: JournalThresholds = CURRENT_JOURNAL_THRESHOLDS) {
  const r = judgeJournal(j);
  return { ...r, tier: journalTierOf(r.score, r.margin, r.families, t) };
}
