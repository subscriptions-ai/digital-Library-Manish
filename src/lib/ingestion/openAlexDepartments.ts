import type { DeptDecision } from './journalSourceImport.js';
import { journalDepartment } from './journalDepartment.js';
import { canonicalDepartmentName } from '../departmentRegistry.js';

/**
 * Which department does an OpenAlex SOURCE belong to? Read from what OpenAlex says its articles are about, not from its name.
 *
 * A source carries up to 25 TOPICS, each with the number of its works in that topic, and each topic belongs to a SUBFIELD (one of OpenAlex's 252). The table below says which
 * subfields are evidence for which of our departments. It is deliberately narrow: a subfield with no clear home (Medicine's many specialties, Physics, Mathematics, Psychology, the
 * social sciences) maps to nothing, so a journal whose topics are all there gets no department and goes to review. Nothing is guessed to make a count larger.
 *
 *   high   at least two topics support one department, it holds at least half of the source's topic works, and it leads the next department by at least a quarter
 *          — and the title does not name a different department by the engine's own title rules
 *   low    some support but not that much, a tie, or the title says something else: review, not inserted
 *   none   no topic maps to a department
 * Where one subfield could be two of our departments (electrical engineering versus electronics and telecommunications), the title's own words decide; with none, it is low.
 */

const D = {
  physio: 'Physiotherapy', dental: 'Dental', nursing: 'Nursing', pharmacy: 'Pharmacy', biotech: 'Bio Technology', chem: 'Chemistry', chemEng: 'Chemical Engineering', cs: 'Computer / IT',
  elec: 'Electrical Engineering', electronics: 'Electronics & Telecommunication Engineering', mech: 'Mechanical Engineering', appMech: 'Applied Mechanics', civil: 'Civil / Construction Engineering',
  arch: 'Architecture', material: 'Material Science', commerce: 'Commerce', management: 'Management', energy: 'Energy', agri: 'Agriculture', ayurveda: 'Ayurveda',
};

/** subfield (as OpenAlex names it) → the department it is evidence for. Anything not listed is not evidence for any department. */
export const SUBFIELD_DEPARTMENT: Record<string, string> = {
  'Physical Therapy, Sports Therapy and Rehabilitation': D.physio, 'Rehabilitation': D.physio, 'Complementary and Manual Therapy': D.physio,
  'Orthodontics': D.dental, 'Periodontics': D.dental, 'Oral Surgery': D.dental, 'General Dentistry': D.dental,
  'Research and Theory': D.nursing, 'Issues, ethics and legal aspects': D.nursing, 'Leadership and Management': D.nursing,
  'Pharmacy': D.pharmacy, 'Pharmaceutical Science': D.pharmacy, 'Drug Discovery': D.pharmacy, 'Pharmacology': D.pharmacy,
  'Biotechnology': D.biotech, 'Applied Microbiology and Biotechnology': D.biotech, 'Bioengineering': D.biotech,
  'Organic Chemistry': D.chem, 'Inorganic Chemistry': D.chem, 'Spectroscopy': D.chem, 'Analytical Chemistry': D.chem, 'Physical and Theoretical Chemistry': D.chem, 'Electrochemistry': D.chem,
  'Fluid Flow and Transfer Processes': D.chemEng, 'Catalysis': D.chemEng, 'Chemical Health and Safety': D.chemEng, 'Process Chemistry and Technology': D.chemEng, 'Filtration and Separation': D.chemEng,
  'Information Systems': D.cs, 'Artificial Intelligence': D.cs, 'Computer Networks and Communications': D.cs, 'Computer Vision and Pattern Recognition': D.cs, 'Hardware and Architecture': D.cs,
  'Human-Computer Interaction': D.cs, 'Computer Science Applications': D.cs, 'Software': D.cs, 'Computer Graphics and Computer-Aided Design': D.cs, 'Computational Theory and Mathematics': D.cs,
  'Signal Processing': D.electronics,
  'Electrical and Electronic Engineering': 'ELECTRICAL_OR_ELECTRONICS', 'Control and Systems Engineering': D.elec,
  'Mechanical Engineering': D.mech, 'Automotive Engineering': D.mech, 'Aerospace Engineering': D.mech,
  'Computational Mechanics': D.appMech, 'Mechanics of Materials': D.appMech,
  'Civil and Structural Engineering': D.civil, 'Building and Construction': D.civil,
  'Architecture': D.arch,
  'Materials Chemistry': D.material, 'Electronic, Optical and Magnetic Materials': D.material, 'Polymers and Plastics': D.material, 'Biomaterials': D.material, 'Ceramics and Composites': D.material,
  'Surfaces, Coatings and Films': D.material, 'General Materials Science': D.material, 'Metals and Alloys': D.material,
  'Accounting': D.commerce, 'Marketing': D.commerce, 'Business and International Management': D.commerce, 'Industrial relations': D.commerce, 'Economics and Econometrics': D.commerce, 'Finance': D.commerce,
  'General Economics, Econometrics and Finance': D.commerce,
  'Strategy and Management': D.management, 'Organizational Behavior and Human Resource Management': D.management, 'Management of Technology and Innovation': D.management,
  'Tourism, Leisure and Hospitality Management': D.management, 'Management Science and Operations Research': D.management,
  'Renewable Energy, Sustainability and the Environment': D.energy, 'General Energy': D.energy, 'Energy Engineering and Power Technology': D.energy, 'Fuel Technology': D.energy, 'Nuclear Energy and Engineering': D.energy,
  'Plant Science': D.agri, 'Agronomy and Crop Science': D.agri, 'Soil Science': D.agri, 'Horticulture': D.agri, 'Animal Science and Zoology': D.agri, 'Forestry': D.agri, 'Food Science': D.agri,
  'Complementary and alternative medicine': D.ayurveda,
};

const ELECTRONICS_WORDS = /telecommunication|communication|wireless|network|signal|electronic|\brf\b|microwave|antenna|photonic|optic|semiconductor|circuit|vlsi|embedded|sensor/i;
const ELECTRICAL_WORDS = /\bpower\b|electrical|electric\b|energy|machines?|drives?|\bgrid\b|high voltage|control|automation|motor/i;
/** Departments the title ITSELF names by the engine's title rules (a Nursing journal's title says nursing). Used only to catch a title that contradicts the topics. */
/** A department word the topics support can still be the wrong field: sports education is not physical therapy, library science is not computing. */
const SPORT_EDUCATION = /sport|olahraga|jasmani|physical education|physical culture|coaching|athlet|exercise|fitness|kinesiolog|educaci[oó]n f[ií]sica|educa[cç][aã]o f[ií]sica|гимнаст|физическ/i;
const THERAPY_WORDS = /therap|terapi|rehabilit|reabilit|реабилит|терапи|physio|fisio|fizyo|clinic|medicine|medical|health|injur|orthop|musculo|neuro/i;
const LIBRARY_SCIENCE = /librar|archiv|museum|bibliotec|documentation|knowledge management|scholarly|publishing/i;
const COMPUTING_WORDS = /comput|software|artificial|\bdata\b|network|cyber|digital|program|information technology|information systems|machine|algorithm|internet|web/i;
const titleDepartment = (title: string) => canonicalDepartmentName(journalDepartment(title, []));

type Topic = { display_name?: string; count?: number; subfield?: { display_name?: string }; field?: { display_name?: string } };
export type TopicEvidence = { shares: { department: string; share: number; topics: number }[]; total: number; supportingTopics: number; fields: number; maxFieldShare: number };

/** The department scores of a source's topics. Pure. */
export function scoreTopics(title: string, topics: Topic[]): TopicEvidence {
  const by = new Map<string, { w: number; n: number }>(); let total = 0; const fields = new Map<string, number>();
  for (const t of topics || []) {
    const w = Number.isFinite(t?.count) && (t.count as number) > 0 ? (t.count as number) : 1; total += w;
    if (t?.field?.display_name) fields.set(t.field.display_name, (fields.get(t.field.display_name) || 0) + w);
    let dept = SUBFIELD_DEPARTMENT[String(t?.subfield?.display_name || '')];
    if (!dept) continue;
    if (dept === 'ELECTRICAL_OR_ELECTRONICS') dept = ELECTRONICS_WORDS.test(title) && !ELECTRICAL_WORDS.test(title) ? D.electronics : ELECTRICAL_WORDS.test(title) && !ELECTRONICS_WORDS.test(title) ? D.elec : 'AMBIGUOUS_ELECTRICAL';
    const c = by.get(dept) || { w: 0, n: 0 }; c.w += w; c.n++; by.set(dept, c);
  }
  const shares = [...by.entries()].map(([department, c]) => ({ department, share: total ? c.w / total : 0, topics: c.n })).sort((a, b) => b.share - a.share);
  return { shares, total, supportingTopics: shares[0]?.topics ?? 0, fields: fields.size, maxFieldShare: total ? Math.max(0, ...fields.values()) / total : 0 };
}

export function departmentFromTopics(source: { display_name?: string; topics?: Topic[] }): DeptDecision {
  const title = String(source.display_name || '');
  const ev = scoreTopics(title, source.topics || []);
  const top = ev.shares[0], second = ev.shares[1];
  // A multidisciplinary journal says so in its title AND spreads over several fields; neither alone is enough.
  // "Interdisciplinary" in a title is not enough: the journal must really spread across at least five fields, none holding more than 40% of its works.
  if (/multidisciplin|interdisciplin|multi-disciplin/i.test(title) && ev.fields >= 5 && ev.maxFieldShare <= 0.4) return { dept: 'Multidisciplinary', confidence: 'high', evidence: { basis: 'topics', fields: ev.fields, shares: ev.shares.slice(0, 3) } };
  if (!top) return { dept: null, confidence: 'low', reason: 'no topic maps to a department', evidence: { basis: 'topics', shares: [] } };
  const evidence = { basis: 'topics', shares: ev.shares.slice(0, 3).map(s => ({ ...s, share: Math.round(s.share * 100) / 100 })), topics: (source.topics || []).slice(0, 4).map(t => t.subfield?.display_name || t.display_name) };
  if (top.department === 'AMBIGUOUS_ELECTRICAL') return { dept: null, confidence: 'low', reason: 'electrical or electronics engineering: the title does not say which', evidence };
  const margin = top.share - (second?.share ?? 0);
  if (top.topics < 2 || top.share < 0.5 || margin < 0.25) return { dept: top.department, confidence: 'low', reason: `topic support is not strong enough (${Math.round(top.share * 100)}% of its works in ${top.topics} topic${top.topics === 1 ? '' : 's'}, ahead of the next by ${Math.round(margin * 100)} points)`, evidence };
  // OpenAlex files sports science under the physical-therapy subfield. A journal is Physiotherapy here only when its title says therapy, rehabilitation or clinical practice.
  if (top.department === 'Physiotherapy' && !THERAPY_WORDS.test(title)) return { dept: top.department, confidence: 'low', reason: SPORT_EDUCATION.test(title) ? 'a sport or physical-education journal, not physical therapy' : 'the title does not name therapy, rehabilitation or clinical practice (OpenAlex files sports science under this subfield)', evidence };
  if (top.department === 'Computer / IT' && LIBRARY_SCIENCE.test(title) && !COMPUTING_WORDS.test(title)) return { dept: top.department, confidence: 'low', reason: 'a library or information-science journal, not computing', evidence };
  const fromTitle = titleDepartment(title);
  if (fromTitle && fromTitle !== top.department && !(['Management', 'Energy'].includes(fromTitle))) return { dept: top.department, confidence: 'low', reason: `the title names ${fromTitle}, the topics say ${top.department}`, evidence };
  return { dept: top.department, confidence: 'high', evidence };
}
