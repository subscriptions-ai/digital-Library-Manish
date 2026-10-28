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
  nano: 'Nano Technology', elec: 'Electrical Engineering', electronics: 'Electronics & Telecommunication Engineering', mech: 'Mechanical Engineering', appMech: 'Applied Mechanics', civil: 'Civil / Construction Engineering',
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

/** FIELD → department, for topics whose subfield the table above does not cover. A field is only a hint, so these are used last, and mostly as COMPETITORS: a journal whose works are half
 *  Dentistry and half Medicine is not clearly Dental. Departments we do not need to grow are here so a physics, law or medicine journal is never mistaken for one of ours. */
const FIELD_DEPARTMENT: Record<string, string> = {
  'Dentistry': D.dental, 'Nursing': D.nursing, 'Pharmacology, Toxicology and Pharmaceutics': D.pharmacy, 'Chemical Engineering': D.chemEng, 'Chemistry': D.chem, 'Energy': D.energy, 'Materials Science': D.material,
  'Computer Science': D.cs, 'Medicine': 'Medical Sciences', 'Health Professions': 'Medical Sciences', 'Veterinary': D.agri, 'Agricultural and Biological Sciences': D.agri,
  'Biochemistry, Genetics and Molecular Biology': 'Life Sciences', 'Immunology and Microbiology': 'Life Sciences', 'Neuroscience': 'Life Sciences',
  'Business, Management and Accounting': D.management, 'Economics, Econometrics and Finance': D.commerce, 'Decision Sciences': D.management,
  'Social Sciences': 'Education and Social Sciences', 'Psychology': 'Education and Social Sciences', 'Arts and Humanities': 'Arts',
  'Mathematics': 'Science', 'Physics and Astronomy': 'Science', 'Earth and Planetary Sciences': 'Science', 'Environmental Science': 'Science',
};
/** Subfields that sit under a department-bearing FIELD but are not that department. */
const NOT_THE_FIELD: Record<string, string> = { 'Nutrition and Dietetics': 'Medical Sciences', 'Law': 'Law' };
const NANO_TOPIC = /\bnano|graphene|quantum dots?|fullerene|carbon nanotube/i;
const AYU_TOPIC = /ayurved|herbal|traditional (chinese |indian )?medicine|homeopath|unani|siddha|phytochemic|medicinal plants?|ethnopharmac/i;

/** The strictest of both designs: the department must hold at least this part of the journal's topic works, lead the runner-up by this factor, and rest on this many works. */
export const MIN_SHARE = 0.5, LEAD = 1.5, MIN_WORKS = 30, MIN_LEAD_POINTS = 0.25;

/** Agriculture versus biology: OpenAlex files botany and zoology under the same "Plant Science" / "Animal Science and Zoology" subfields as farming, and this product keeps botany in Life Sciences. A journal is
 *  Agriculture only when the topics are specifically agricultural (crops, soil, horticulture, forestry, food, general agriculture) or its title says so. */
const AGRI_SPECIFIC = new Set(['Agronomy and Crop Science', 'Soil Science', 'Horticulture', 'Forestry', 'Food Science', 'General Agricultural and Biological Sciences']);
const AGRI_TITLE = /agri|crop|soil|farm|horticult|agronom|livestock|veterin|forest|food|plant breed|pertanian|peternakan|pangan|tarim|agro|fisher|aquacult|dairy|poultry|irrigat|rural|seed|pest|viticult|enolog|fitotecn|cultivo|cultura/i;

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
    const sub = String(t?.subfield?.display_name || ''), topicName = String(t?.display_name || '');
    // A topic's department: its name for Nano and Ayurveda (they have no subfield of their own), then its subfield, then (last, and as a competitor) its field.
    let dept: string | undefined = NANO_TOPIC.test(topicName) ? D.nano : AYU_TOPIC.test(topicName) && /complementary|medicine|pharma|botany|plant|therapy|health/i.test(`${sub} ${t?.field?.display_name || ''}`) ? D.ayurveda
      : NOT_THE_FIELD[sub] || SUBFIELD_DEPARTMENT[sub] || FIELD_DEPARTMENT[String(t?.field?.display_name || '')];
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
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (ev.total < MIN_WORKS) return { dept: top.department, confidence: 'low', reason: `only ${ev.total} topic works: too little to say`, evidence };
  if (top.topics < 2 || top.share < MIN_SHARE) return { dept: top.department, confidence: 'low', reason: `topic support is not strong enough (${pct(top.share)} of its works in ${top.topics} topic${top.topics === 1 ? '' : 's'})`, evidence };
  if (margin < MIN_LEAD_POINTS || (second && top.share < LEAD * second.share)) return { dept: top.department, confidence: 'low', reason: `${top.department} (${pct(top.share)}) does not clearly lead ${second?.department} (${pct(second?.share ?? 0)})`, evidence };
  if (top.department === 'Agriculture') {
    const specific = (source.topics || []).filter(x => AGRI_SPECIFIC.has(String(x?.subfield?.display_name || ''))).reduce((s, x) => s + (x.count || 1), 0) / (ev.total || 1);
    if (specific < 0.25 && !AGRI_TITLE.test(title)) return { dept: top.department, confidence: 'low', reason: 'plant or animal topics alone do not tell agriculture from biology (no crop, soil, food or forestry topic, and the title does not say so)', evidence };
  }
  if (top.department === 'Physiotherapy' && !THERAPY_WORDS.test(title)) return { dept: top.department, confidence: 'low', reason: SPORT_EDUCATION.test(title) ? 'a sport or physical-education journal, not physical therapy' : 'the title does not name therapy, rehabilitation or clinical practice (OpenAlex files sports science under this subfield)', evidence };
  if (top.department === 'Computer / IT' && LIBRARY_SCIENCE.test(title) && !COMPUTING_WORDS.test(title)) return { dept: top.department, confidence: 'low', reason: 'a library or information-science journal, not computing', evidence };
  const fromTitle = titleDepartment(title);
  if (fromTitle && fromTitle !== top.department && !(['Management', 'Energy'].includes(fromTitle))) return { dept: top.department, confidence: 'low', reason: `the title names ${fromTitle}, the topics say ${top.department}`, evidence };
  return { dept: top.department, confidence: 'high', evidence };
}
