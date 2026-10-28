import { BY_TITLE, BY_TITLE_OR_KEYWORD } from '../doajCatalogue.js';

/**
 * How much is a TITLE-ONLY department match worth?
 *
 * Crossref gives no subjects, so a journal it lists can only be placed by the words in its title (the engine's own title rules, journalDepartment). Those rules are
 * deliberately simple, and a simple rule has false positives: "Solar Revista de Filosofía Iberoamericana" matches the Energy rule on the Spanish word "solar", "Journal of
 * Vocational Rehabilitation" matches Physiotherapy on "rehabilitat", "International Journal of Periodontal Rehabilitation" matches Physiotherapy although "periodont" is Dental.
 *
 * This reads the same title and says how far to trust the department it was given. It never assigns a department and never changes a rule; it only sorts:
 *   good    a specific term for that department, no other department's term in the title, nothing that points elsewhere
 *   weak    only a generic or ambiguous word ("rehabilitation", "management", "solar", "power systems"), or a non-English title matched on a short word
 *   wrong   another department's specific term is in the title (and is the better fit), or the title says it is about something else
 *   manual  evidence exists but conflicts, and a person should decide
 * Used to review what a title-only import wrote, and to keep weak and wrong matches out of the next one.
 */

export type AuditVerdict = 'good' | 'weak' | 'wrong' | 'manual';
export type MappingAudit = { verdict: AuditVerdict; reasons: string[]; betterDepartment: string | null; rivals: string[]; strong: boolean; nonEnglish: boolean };

/** Terms that are specific to a department, written as they appear in a title. A match on one of these is the kind of evidence a title can give. */
const STRONG: Record<string, RegExp> = {
  'Physiotherapy': /physiotherap|physical therap|physical medicine|physical and rehabilitation|rehabilitation medicine|rehabilitation science|neurorehabilitation|sports therap|physio/i,
  'Dental': /\bdent(al|istry|ist)|orthodont|periodont|endodont|prosthodont|oral (health|surgery|medicine|science|implant)|\bimplantolog/i,
  'Nursing': /\bnurs(e|es|ing)\b|midwif/i,
  'Ayurveda': /ayurved|\bunani\b|\bsiddha\b|homoeopath|homeopath|traditional (chinese |indian )?medicine|herbal medicine|pharmacognosy|ethnopharmacolog/i,
  'Nano Technology': /\bnano/i,
  'Bio Technology': /biotechnolog/i,
  'Material Science': /materials? science|metallurg|polymer|ceramic|composite materials?|\balloys?\b|\bmaterials\b/i,
  'Energy': /renewable energy|\benergy\b|\bfuels?\b|petroleum|\bphotovoltaic|\bbio(energy|fuel)|hydropower|\bwind (energy|power|turbine)|solar (energy|power|cell|thermal|photovoltaic)|solar (&|and) wind|wind (&|and) solar|nuclear (energy|power)/i,
  'Management': /business (management|administration)|human resource|operations management|supply chain|project management|strategic management|financial management|engineering management|public (administration|management)|management (science|review|studies|research|accounting|information|practice|perspectives)|organi[sz]ation(al)? (behaviou?r|management)|marketing|entrepreneur|tourism|hospitality/i,
  'Applied Mechanics': /applied mechanics|solid mechanics|fluid mechanics|\bmechanics\b/i,
};
/** What a department's weak, generic match looks like, for the message only (the evidence test is STRONG alone). */
const GENERIC_WORD: Record<string, string> = { Physiotherapy: 'rehabilitation', Energy: 'solar / power systems', Management: 'management', 'Material Science': 'materials' };

/** Contexts that make a department word mean something else. */
const ELSEWHERE: { re: RegExp; says: string; verdict: AuditVerdict; depts?: string[] }[] = [
  { re: /vocational|psychiatr|psychosocial|addiction|substance|offender|prison|counsel+ing|disabilit(y|ies) (studies|policy)/i, says: 'vocational, psychiatric or social rehabilitation, not physical therapy', verdict: 'wrong', depts: ['Physiotherapy'] },
  { re: /filosof|philosoph|literatur|historia|\bhistory\b|\barte\b|religi/i, says: 'a humanities title (philosophy, history, literature, politics)', verdict: 'wrong', depts: ['Energy', 'Management', 'Material Science', 'Physiotherapy'] },
  { re: /\b(pain|waste|water|disease|diabetes|wildlife|forest|fisheries?|land|soil|crop|pest|weed|grassland|rangeland|livestock|conflict|disaster|emergency|traffic|noise|stress|anger|behaviou?r|symptom|clinical|wound|patient|hospital|health care|healthcare) management\b|management of (pain|waste|water|disease|diabetes)/i, says: 'management of a non-business subject', verdict: 'weak', depts: ['Management'] },
];
/** Words that mark a title as Spanish, Portuguese, French, German, Italian, Dutch or Indonesian, where a department word may mean something else. */
const NON_ENGLISH_WORDS = /\b(revista|revue|jurnal|zeitschrift|rivista|tijdschrift|boletin|boletim|anales|anais|cuadernos|estudios|estudos|acta|ciencia|ciência|universidad|universidade|università|universitas|für|und|nuevo|nova|vestnik|vestnyk|journal de|die|der|das)\b|\b(de|la|el|du|da|do|di|et|y|del|dos|las|los)\s/i;
/** A letter outside the Latin script, or a Latin letter with a diacritic the English titles here do not use. */
const NON_LATIN = /(?!\p{Script=Latin})\p{L}/u, DIACRITIC = /[áéíóúñçãõàèìòùâêîôûäöüß]/i;

const RULES: [RegExp, string][] = [...BY_TITLE_OR_KEYWORD, ...BY_TITLE];
/** Departments whose own specific term is in the title (by the engine's own rules, plus the strong terms above). */
function rivalsOf(title: string): string[] {
  const out = new Set<string>();
  for (const [re, dep] of RULES) if (re.test(title.toLowerCase())) out.add(dep);
  for (const [dep, re] of Object.entries(STRONG)) if (re.test(title)) out.add(dep);
  return [...out];
}
const hasSpecific = (title: string, dep: string) => !!STRONG[dep]?.test(title);
/** Which department's specific term is the most telling (a more specific field beats a broader one). */
const SPECIFICITY = ['Nano Technology', 'Ayurveda', 'Bio Technology', 'Dental', 'Nursing', 'Physiotherapy', 'Applied Mechanics', 'Material Science', 'Energy', 'Management'];

export function auditTitleMapping(title: string, publisher: string | null, dept: string): MappingAudit {
  const t = String(title || '');
  const nonEnglish = /[^\u0000-ɏ]/.test(t) || NON_ENGLISH_WORDS.test(t.toLowerCase() + ' ');
  const reasons: string[] = [];
  const rivals = rivalsOf(t);
  const specific = hasSpecific(t, dept);
  const strong = specific;

  // The title says it is about something else.
  for (const e of ELSEWHERE) if ((!e.depts || e.depts.includes(dept)) && e.re.test(t)) return { verdict: e.verdict, reasons: [e.says], betterDepartment: null, rivals, strong, nonEnglish };
  // Another department's specific term is in the title and is the more specific field.
  const others = rivals.filter(r => r !== dept);
  if (others.length) {
    const best = [dept, ...others].sort((a, b) => SPECIFICITY.indexOf(a) - SPECIFICITY.indexOf(b))[0];
    if (best !== dept) return { verdict: 'wrong', reasons: [`the title also names ${best}, the more specific field`], betterDepartment: best, rivals, strong, nonEnglish };
    reasons.push(`the title also names ${others.join(', ')}`);
    return { verdict: 'manual', reasons, betterDepartment: null, rivals, strong, nonEnglish };
  }
  if (!specific) return { verdict: 'weak', reasons: [`only a generic word (${GENERIC_WORD[dept] || 'a short word'}) points to ${dept}`], betterDepartment: null, rivals, strong, nonEnglish };
  // A specific term, but the title is not English: trust it only for a long, unambiguous stem.
  if (nonEnglish && !/dent|nurs|physiotherap|nano|biotechnolog|ayurved|petroleum|metallurg|polymer|ceramic|orthodont|periodont|midwif|photovoltaic|renewable|marketing/i.test(t)) {
    return { verdict: 'weak', reasons: ['a non-English title matched on a short word that has another meaning in its language'], betterDepartment: null, rivals, strong, nonEnglish };
  }
  return { verdict: 'good', reasons: ['a specific term for this department, nothing contradicting it'], betterDepartment: null, rivals, strong, nonEnglish };
}
