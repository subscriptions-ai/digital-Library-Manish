import { auditTitleMapping } from './journalMappingAudit.js';
import type { DeptDecision } from './journalSourceImport.js';

/**
 * The department of a serial from the NLM Catalog. The evidence is the SUBJECT NLM itself assigned (the catalogue was searched by subject, so every serial carries the subjects it was
 * found under), checked against the title. It is deliberately strict:
 *   · a serial is placed only when exactly one of our departments is named by its subjects;
 *   · four departments are broad in NLM's vocabulary, so a subject alone is not enough for them and the title must name the field itself
 *     (Ayurveda: "Complementary Therapies" / "Medicine, Traditional" cover Chinese, Korean and general complementary medicine; Architecture, Chemical Engineering and
 *     Nano Technology: the subjects pick up neighbouring fields);
 *   · "Rehabilitation" never places a journal on its own, and Physiotherapy needs a therapy word in the title;
 *   · a title that is a newsletter, directory, report, proceedings, series or other non-journal serial is never a journal here.
 * Nothing here assigns a department that the evidence does not name; the answer is "none" and the serial is held for review.
 */
export const NLM_SUBJECT_DEPARTMENT: Record<string, string> = {
  'Nursing': 'Nursing', 'Dentistry': 'Dental', 'Pharmacy': 'Pharmacy', 'Physical Therapy Modalities': 'Physiotherapy', 'Biotechnology': 'Bio Technology',
  'Nanotechnology': 'Nano Technology', 'Complementary Therapies': 'Ayurveda', 'Medicine, Traditional': 'Ayurveda', 'Architecture': 'Architecture',
  'Chemical Engineering': 'Chemical Engineering', 'Energy-Generating Resources': 'Energy',
};
/** Title evidence a broad department must have on top of the subject. */
export const TITLE_EVIDENCE: Record<string, RegExp> = {
  'Ayurveda': /ayurved|\bunani\b|\bsiddha\b|homoeopath|homeopath|\bayush\b|naturopath|\byoga\b|panchakarma/i,
  'Architecture': /architect|landscape|urban (design|planning)|town planning|interior design/i,
  'Chemical Engineering': /chemical engineering|chemical (and|&) (bio)?process|process (engineering|systems|safety)|\baiche\b|reaction engineering|separation (and|&) purification|separation science/i,
  'Nano Technology': /\bnano/i,
  'Physiotherapy': /physio|physical therap|physical medicine|rehabilit|fisioterap|fisio|kinesi|sports (medicine|therap|physical)|athletic therap|\breha\b|rééducation|therapy/i,
};
/** Serials that are not journals: newsletters, directories, reports, proceedings, series, guides, price lists, abstracts and the like. */
export const NLM_NON_JOURNAL = /\b(directory|directories|news ?letter|newsletter|annual report|rapport annuel|reports?|proceedings|yearbook|year book|guide|buyers|catalog(ue)?|who'?s who|abstracts?|monograph series|handbook|bibliography|index|statistics|symposium|conference|workshop|transactions|series|program plans|memoirs|lecture notes|update|digest|manual|standards|sheet|notes|insights|accreditation|chronicles|best practices|profiles of|compendium|primer|calendar|schedule|price|fees|pocket|guidelines|paycheck|advisor|alert)\b/i;

export function nlmDepartment(title: string, publisher: string | null, subjects: string[]): DeptDecision {
  if (NLM_NON_JOURNAL.test(title)) return { dept: null, confidence: 'low', reason: 'the title reads as a newsletter, directory, report, proceedings or other non-journal serial' };
  const depts = new Set<string>();
  for (const s of subjects) if (NLM_SUBJECT_DEPARTMENT[s]) depts.add(NLM_SUBJECT_DEPARTMENT[s]);
  if (subjects.includes('Rehabilitation') && /physiotherap|physical therap|physical medicine|neurorehabilitation|sports (medicine|therap)|physio/i.test(title)) depts.add('Physiotherapy');
  if (!depts.size) return { dept: null, confidence: 'low', reason: 'no NLM subject maps to a department' };
  if (depts.size > 1) return { dept: null, confidence: 'low', reason: `NLM subjects span ${[...depts].join(' / ')}` };
  const dept = [...depts][0];
  const need = TITLE_EVIDENCE[dept];
  if (need && !need.test(title)) return { dept, confidence: 'low', reason: `the NLM subject is broad for ${dept} and the title does not name the field` };
  const a = auditTitleMapping(title, publisher, dept);
  if (a.verdict === 'wrong' || a.verdict === 'manual') return { dept, confidence: 'low', reason: `the title contradicts it: ${a.reasons[0]}` };
  return { dept, confidence: 'high', evidence: { basis: 'nlm-subject', subjects, titleEvidence: !!need, audit: a.verdict } };
}
