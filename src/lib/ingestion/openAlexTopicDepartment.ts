import { canonicalDepartmentName } from '../departmentRegistry.js';
import { departmentForDoajRow } from '../doajCatalogue.js';
import type { TopicEvidence } from './openAlexJournals.js';

/**
 * Which department does an OpenAlex journal belong to, read from its TOPICS?
 *
 * OpenAlex describes every journal by the topics of the works it publishes, and files each topic under a subfield, a field and a domain. Each topic carries the number of
 * the journal's works that fall under it. That is real evidence about what the journal is about, unlike a title (which is a few words and often says nothing) or a search term.
 *
 *   1. Every topic is mapped, by its SUBFIELD (and, where a subfield is too broad, its field), to one of our departments or to "not ours" (a department we do not need
 *      to grow, kept only so that a physics or law journal is not mistaken for something else).
 *   2. The works are added up per department. A department is chosen only when it clearly dominates: at least MIN_SHARE of all the journal's topic works, at least
 *      LEAD times the runner-up, on at least MIN_WORKS topic works. Otherwise the answer is "unclear", and the journal is not given a department.
 *   3. Electrical vs Electronics & Telecom share one OpenAlex subfield ("Electrical and Electronic Engineering"); the title decides between them, and only when it names one.
 *   4. Nano Technology and Ayurveda have no subfield of their own: they are read from the topic NAMES ("Nanoparticles …", "Ayurvedic …", "Herbal …") and need the same dominance.
 *   5. The DOAJ title rules (the engine's own) are a cross-check only: if they name a different specific department, the journal is "disagree" and is held, never guessed.
 *
 * Nothing here writes anything or claims anything about open access or licence.
 */

export const MIN_SHARE = 0.45;       // the department's part of the journal's topic works
export const LEAD = 1.5;             // ... and how far it must lead the runner-up
export const MIN_WORKS = 30;         // topic works needed before the pattern means anything

const D = {
  IT: 'Computer / IT', CHEM: 'Chemistry', COM: 'Commerce', PHARM: 'Pharmacy', EE: 'Electrical Engineering', ME: 'Mechanical Engineering', CHE: 'Chemical Engineering',
  ETC: 'Electronics & Telecommunication Engineering', ARCH: 'Architecture', MULTI: 'Multidisciplinary', MECH: 'Applied Mechanics', DENT: 'Dental', PHYSIO: 'Physiotherapy',
  NURSE: 'Nursing', MAT: 'Material Science', ENERGY: 'Energy', NANO: 'Nano Technology', BIO: 'Bio Technology', AYU: 'Ayurveda',
  MGMT: 'Management', CIVIL: 'Civil / Construction Engineering', AGRI: 'Agriculture', MED: 'Medical Sciences', LIFE: 'Life Sciences', EDU: 'Education and Social Sciences', LAW: 'Law', ARTS: 'Arts', SCI: 'Science',
} as const;
/** Joint bucket for the one OpenAlex subfield our two electrical departments share. */
const EE_OR_ETC = 'EE|ETC';

/** SUBFIELD → department. The most specific evidence; read first. */
const BY_SUBFIELD: Record<string, string> = {
  // Computer / IT
  'Artificial Intelligence': D.IT, 'Computer Networks and Communications': D.IT, 'Computer Science Applications': D.IT, 'Computer Vision and Pattern Recognition': D.IT, 'Information Systems': D.IT,
  'Software': D.IT, 'Human-Computer Interaction': D.IT, 'Computer Graphics and Computer-Aided Design': D.IT, 'Hardware and Architecture': D.IT, 'Computational Theory and Mathematics': D.IT,
  'Theoretical Computer Science': D.IT, 'Information Systems and Management': D.IT, 'Management Information Systems': D.IT, 'Health Informatics': D.IT, 'Library and Information Sciences': D.IT,
  // Electrical / Electronics & Telecom
  'Electrical and Electronic Engineering': EE_OR_ETC, 'Control and Systems Engineering': D.EE, 'Signal Processing': D.ETC,
  // Mechanical / Applied Mechanics
  'Mechanical Engineering': D.ME, 'Automotive Engineering': D.ME, 'Industrial and Manufacturing Engineering': D.ME, 'Aerospace Engineering': D.ME,
  'Computational Mechanics': D.MECH, 'Mechanics of Materials': D.MECH, 'Acoustics and Ultrasonics': D.MECH,
  // Chemical Engineering
  'Fluid Flow and Transfer Processes': D.CHE, 'Process Chemistry and Technology': D.CHE, 'Filtration and Separation': D.CHE, 'Catalysis': D.CHE, 'Chemical Health and Safety': D.CHE, 'General Chemical Engineering': D.CHE,
  // Chemistry
  'Analytical Chemistry': D.CHEM, 'Inorganic Chemistry': D.CHEM, 'Organic Chemistry': D.CHEM, 'Physical and Theoretical Chemistry': D.CHEM, 'Spectroscopy': D.CHEM, 'Electrochemistry': D.CHEM, 'General Chemistry': D.CHEM,
  // Materials
  'Biomaterials': D.MAT, 'Ceramics and Composites': D.MAT, 'Electronic, Optical and Magnetic Materials': D.MAT, 'Materials Chemistry': D.MAT, 'Polymers and Plastics': D.MAT, 'Surfaces, Coatings and Films': D.MAT,
  'Metals and Alloys': D.MAT, 'General Materials Science': D.MAT,
  // Energy
  'Renewable Energy, Sustainability and the Environment': D.ENERGY, 'Energy Engineering and Power Technology': D.ENERGY, 'Fuel Technology': D.ENERGY, 'General Energy': D.ENERGY, 'Nuclear Energy and Engineering': D.ENERGY,
  // Architecture and the built environment
  'Architecture': D.ARCH, 'Building and Construction': D.CIVIL, 'Civil and Structural Engineering': D.CIVIL,
  // Health professions
  'Physical Therapy, Sports Therapy and Rehabilitation': D.PHYSIO, 'Rehabilitation': D.PHYSIO, 'Complementary and Manual Therapy': D.PHYSIO,
  'Pharmacy': D.PHARM, 'Pharmaceutical Science': D.PHARM, 'Drug Discovery': D.PHARM, 'Pharmacology': D.PHARM, 'Toxicology': D.PHARM,
  'Oral Surgery': D.DENT, 'Orthodontics': D.DENT, 'Periodontics': D.DENT, 'General Dentistry': D.DENT, 'Dental Assisting': D.DENT, 'Dental Hygiene': D.DENT,
  'Complementary and alternative medicine': D.AYU,
  // Biotechnology
  'Biotechnology': D.BIO, 'Applied Microbiology and Biotechnology': D.BIO, 'Bioengineering': D.BIO,
  // Commerce
  'Accounting': D.COM, 'Finance': D.COM, 'Marketing': D.COM, 'Economics and Econometrics': D.COM, 'General Economics, Econometrics and Finance': D.COM,
  // Management and other parts of business
  'Strategy and Management': D.MGMT, 'Organizational Behavior and Human Resource Management': D.MGMT, 'Business and International Management': D.MGMT, 'Industrial relations': D.MGMT,
  'Tourism, Leisure and Hospitality Management': D.MGMT, 'Management of Technology and Innovation': D.MGMT, 'Management Science and Operations Research': D.MGMT, 'Public Administration': D.MGMT,
  // Multidisciplinary
  'Multidisciplinary': D.MULTI,
  'Law': D.LAW,
};

/** FIELD → department, for what the subfield table does not cover. A field is only a hint at the department, so it is used last. */
const BY_FIELD: Record<string, string> = {
  'Dentistry': D.DENT, 'Nursing': D.NURSE, 'Pharmacology, Toxicology and Pharmaceutics': D.PHARM, 'Chemical Engineering': D.CHE, 'Chemistry': D.CHEM, 'Energy': D.ENERGY, 'Materials Science': D.MAT,
  'Computer Science': D.IT, 'Medicine': D.MED, 'Health Professions': D.MED, 'Veterinary': D.AGRI, 'Agricultural and Biological Sciences': D.AGRI, 'Biochemistry, Genetics and Molecular Biology': D.LIFE,
  'Immunology and Microbiology': D.LIFE, 'Neuroscience': D.LIFE, 'Business, Management and Accounting': D.MGMT, 'Economics, Econometrics and Finance': D.COM, 'Decision Sciences': D.MGMT,
  'Social Sciences': D.EDU, 'Psychology': D.EDU, 'Arts and Humanities': D.ARTS, 'Mathematics': D.SCI, 'Physics and Astronomy': D.SCI, 'Earth and Planetary Sciences': D.SCI, 'Environmental Science': D.SCI,
  'Multidisciplinary': D.MULTI,
};   // 'Engineering' is deliberately absent: at field level alone it cannot say which branch.
/** Subfields that sit under a department-bearing FIELD but are not that department. */
const NOT_THE_FIELD: Record<string, string> = { 'Nutrition and Dietetics': D.MED };

const NANO_TOPIC = /\bnano|graphene|quantum dots?|fullerene|carbon nanotube/i;
const AYU_TOPIC = /ayurved|herbal|traditional (chinese |indian )?medicine|homeopath|unani|siddha|phytochemic|medicinal plants?|ethnopharmac|yoga/i;
const ETC_TITLE = /electronic|telecommun|communication|wireless|microwave|antenna|signal|optic|photonic|radio|network|vlsi|embedded|sensor|circuit/i;
const EE_TITLE = /electrical|power|energy system|grid|drive|machine|high voltage|control|transmission|smart grid/i;

export type TopicVerdict = 'mapped' | 'unclear' | 'disagree' | 'no_topics';
export type TopicDepartment = {
  verdict: TopicVerdict; department: string | null;
  /** The share of the journal's topic works that point at the department, and at the runner-up. */
  share: number; runnerUp: { department: string; share: number } | null; works: number;
  /** The few subfields that carried the decision, for the reviewer. */
  evidence: { subfield: string; department: string; works: number }[]; reason: string;
};

const SPECIFIC_TITLE_DEPTS = new Set<string>([D.PHYSIO, D.NURSE, D.DENT, D.NANO, D.BIO, D.AYU, D.ENERGY, D.MAT, D.MECH, D.PHARM, D.CHE, D.ARCH]);

/** Which department does ONE topic point at? A subfield beats a field; a topic name can pick out Nano and Ayurveda. */
function departmentOfTopic(t: TopicEvidence): string | null {
  if (NANO_TOPIC.test(t.topic)) return D.NANO;
  if (AYU_TOPIC.test(t.topic) && (!t.subfield || /complementary|medicine|pharma|botany|plant|therapy|health/i.test(t.subfield + ' ' + (t.field || '')))) return D.AYU;
  if (t.subfield && NOT_THE_FIELD[t.subfield]) return NOT_THE_FIELD[t.subfield];
  if (t.subfield && BY_SUBFIELD[t.subfield]) return BY_SUBFIELD[t.subfield];
  if (t.field && BY_FIELD[t.field]) return BY_FIELD[t.field];
  return null;
}

export function topicDepartment(title: string, topics: TopicEvidence[] | undefined): TopicDepartment {
  const list = (topics || []).filter(t => t && t.topic);
  const blank = (verdict: TopicVerdict, reason: string, extra: Partial<TopicDepartment> = {}): TopicDepartment => ({ verdict, department: null, share: 0, runnerUp: null, works: 0, evidence: [], reason, ...extra });
  if (!list.length) return blank('no_topics', 'OpenAlex gives this journal no topics');
  const total = list.reduce((s, t) => s + Math.max(0, t.count), 0);
  if (total < MIN_WORKS) return blank('unclear', `only ${total} topic works: too little to say`, { works: total });

  const score = new Map<string, number>(); const subs = new Map<string, { subfield: string; department: string; works: number }>();
  for (const t of list) {
    const d = departmentOfTopic(t); if (!d) continue;
    score.set(d, (score.get(d) || 0) + t.count);
    const k = `${t.subfield || t.field}|${d}`; const e = subs.get(k) || { subfield: t.subfield || t.field || t.topic, department: d, works: 0 }; e.works += t.count; subs.set(k, e);
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return blank('unclear', 'no topic maps to a department', { works: total });
  let [top, topScore] = ranked[0];
  const second = ranked[1];
  const evidence = [...subs.values()].filter(e => e.department === top || (top === EE_OR_ETC && e.department === EE_OR_ETC)).sort((a, b) => b.works - a.works).slice(0, 3);
  const share = topScore / total;
  const runnerUp = second ? { department: second[0], share: second[1] / total } : null;
  const base = { share, runnerUp, works: total, evidence };

  if (share < MIN_SHARE) return blank('unclear', `the strongest department (${top}) covers only ${(share * 100).toFixed(0)}% of the journal's topics`, base);
  if (second && topScore < LEAD * second[1]) return blank('unclear', `${top} (${(share * 100).toFixed(0)}%) does not clearly lead ${second[0]} (${(second[1] / total * 100).toFixed(0)}%)`, base);

  if (top === EE_OR_ETC) {
    const etc = ETC_TITLE.test(title), ee = EE_TITLE.test(title);
    if (etc && !ee) top = D.ETC; else if (ee && !etc) top = D.EE;
    else return blank('unclear', 'Electrical-and-Electronic topics, and the title does not say which of Electrical or Electronics & Telecom', base);
  }
  // 'Engineering' at the field level never decides a department by itself.
  const dept = canonicalDepartmentName(top);
  if (!dept) return blank('unclear', `${top} is not a department we hold`, base);

  // Cross-check with the engine's own title/keyword rules: a different SPECIFIC department there means the evidence disagrees.
  const titleDept = canonicalDepartmentName(departmentForDoajRow({ 'Journal title': title || '', Keywords: '', 'LCC Codes': '' }));
  if (titleDept && titleDept !== dept && SPECIFIC_TITLE_DEPTS.has(titleDept)) return { verdict: 'disagree', department: dept, reason: `topics say ${dept}, the title says ${titleDept}`, ...base };

  return { verdict: 'mapped', department: dept, reason: `${(share * 100).toFixed(0)}% of topic works are ${dept}${runnerUp ? `; next is ${runnerUp.department} at ${(runnerUp.share * 100).toFixed(0)}%` : ''}`, ...base };
}
