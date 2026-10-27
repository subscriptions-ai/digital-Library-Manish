import { DOMAINS } from '../../constants.js';

/**
 * Dewey Decimal Classification → department. Pure; used only by classifier v2 (analysis), never by the ingestion engine.
 *
 * DDC is hierarchical, so the mapping is a table of digit PREFIXES (decimal point removed): "615.82" is "61582", and "61582" is also the
 * prefix of 615.822 and 615.8250. The longest matching prefix wins, which is how a specific class (615.82, physical therapy) beats its
 * broader neighbour (61, medicine). The length of the prefix is the grade: the longer it is, the more specific the claim.
 *
 * Conservative by design:
 *   - only a well-formed number counts: three digits, optionally a decimal part ("639.9", "813.54"). Slash-segmented forms ("813/.54") are
 *     read; fiction markers ("FIC", "[E]"), biography ("B"), two-digit or four-digit-integer values and anything with stray text are
 *     malformed and ignored, never guessed at.
 *   - a prefix mapped to null means "known, but not a department we can name" and stops the search (generalities, geography, home
 *     economics); it never falls through to a broader class.
 *   - several codes that disagree about the department are not averaged: only the most specific ones are kept, and if those still point to
 *     different departments the record is ambiguous and contributes no DDC evidence at all.
 */

const NAMES = new Set(DOMAINS.map(d => d.name));

/** [digit prefix, department or null]. Longest prefix wins. */
const TABLE: [string, string | null][] = [
  // 000 generalities — only computing is a department
  ['0', null], ['004', 'Computer / IT'], ['005', 'Computer / IT'], ['006', 'Computer / IT'],
  // 100 philosophy & psychology, 200 religion
  ['1', 'Arts'], ['15', 'Education and Social Sciences'], ['2', 'Arts'],
  // 300 social sciences
  ['3', 'Education and Social Sciences'], ['33', 'Commerce'], ['33379', 'Energy'], ['34', 'Law'], ['37', 'Education and Social Sciences'], ['38', 'Commerce'],
  // 400 language, 500 science
  ['4', 'Arts'],
  ['5', 'Science'], ['54', 'Chemistry'], ['57', 'Life Sciences'], ['572', 'Education and Social Sciences'], ['58', 'Life Sciences'], ['59', 'Life Sciences'],
  // 600 technology
  ['6', 'Applied Sciences'],
  ['61', 'Medical Sciences'], ['61073', 'Nursing'], ['6151', 'Pharmacy'], ['61582', 'Physiotherapy'], ['6176', 'Dental'],
  ['6201', 'Applied Mechanics'], ['62011', 'Material Science'], ['6205', 'Nano Technology'],
  ['621', 'Mechanical Engineering'], ['6213', 'Electrical Engineering'], ['62138', 'Electronics & Telecommunication Engineering'], ['62147', 'Energy'], ['62148', 'Energy'],
  ['624', 'Civil / Construction Engineering'], ['625', 'Civil / Construction Engineering'], ['627', 'Civil / Construction Engineering'], ['628', 'Civil / Construction Engineering'],
  ['629', 'Mechanical Engineering'],
  ['63', 'Agriculture'], ['6399', 'Life Sciences'],
  ['64', null], ['65', 'Management'], ['657', 'Commerce'],
  ['66', 'Chemical Engineering'], ['6606', 'Bio Technology'], ['67', null], ['68', null], ['69', 'Civil / Construction Engineering'],
  // 700 arts, 800 literature, 900 history & geography
  ['7', 'Arts'], ['71', 'Architecture'], ['72', 'Architecture'], ['8', 'Arts'], ['9', 'Arts'], ['91', null],
];
for (const [, d] of TABLE) if (d && !NAMES.has(d)) throw new Error(`ddc.ts: "${d}" is not a department in constants.ts`);
const SORTED = [...TABLE].sort((a, b) => b[0].length - a[0].length);

/** A DDC number as a digit string, or null when it is not a well-formed number. */
export function normaliseDdc(raw: unknown): { code: string; digits: string } | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = String(raw).trim().replace(/\//g, '').replace(/\s+/g, '');
  if (!/^\d{3}(?:\.\d+)?$/.test(s)) return null;
  return { code: s, digits: s.replace('.', '') };
}

export type DdcGrade = 'specific' | 'mid' | 'broad';
export type DdcEvidence = {
  /** The department the DDC numbers support, or null (none usable, or ambiguous). */
  department: string | null; code: string | null; grade: DdcGrade | null;
  valid: number; malformed: number; unmapped: number; ambiguous: boolean;
};

const gradeOf = (prefixLen: number): DdcGrade => (prefixLen >= 4 ? 'specific' : prefixLen >= 2 ? 'mid' : 'broad');

export function ddcEvidence(values: unknown): DdcEvidence {
  const out: DdcEvidence = { department: null, code: null, grade: null, valid: 0, malformed: 0, unmapped: 0, ambiguous: false };
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  const hits: { code: string; department: string; len: number }[] = [];
  for (const v of list) {
    const n = normaliseDdc(v);
    if (!n) { out.malformed++; continue; }
    out.valid++;
    const hit = SORTED.find(([prefix]) => n.digits.startsWith(prefix));
    if (!hit || !hit[1]) { out.unmapped++; continue; }
    hits.push({ code: n.code, department: hit[1], len: hit[0].length });
  }
  if (!hits.length) return out;
  const best = Math.max(...hits.map(h => h.len));
  const top = hits.filter(h => h.len === best);
  if (new Set(top.map(h => h.department)).size > 1) { out.ambiguous = true; return out; }
  out.department = top[0].department; out.code = top[0].code; out.grade = gradeOf(best);
  return out;
}
