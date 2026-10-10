import { DOMAINS } from '../../../constants.js';
import { parseLcc, departmentFromLcc } from '../lcc.js';

/**
 * Which department does a book belong to?
 *
 * The old answer was "whichever search term found it", which put a book in Dental because the
 * word "dental" appeared somewhere in a result list. This reads the book itself: its BIC subject
 * codes, its subject keywords, its title and a little of its abstract, scores every department,
 * and only assigns one when the evidence is clear.
 *
 *   strong  → assign the department
 *   review  → a plausible department, not clear enough to assign; held for a person
 *   none    → nothing reliable; no department is assigned
 *
 * Evidence comes in four families — a controlled classification code, the title, the subject keywords,
 * the abstract. A department is only assigned (and the book auto-published) when a controlled code AND
 * the title or subject wording agree on it: a publisher's code alone is a claim and publishers mis-code,
 * and keyword wording alone is the weakest evidence there is. Anything less goes to review. The abstract
 * adds to the score but never counts as one of the two.
 *
 * Departments are the ones in constants.ts and nothing else: every rule below is checked against
 * that list when the module loads, so a typo is a failure at start-up, not a book in a department
 * that does not exist. A department is never chosen because it is short of books.
 */

const NAMES = new Set(DOMAINS.map(d => d.name));

/** Evidence weights. A code is the strongest signal, a keyword next, an abstract the weakest. */
const W = { codeSpecific: 5, codeMid: 4, codeBroad: 2, codeGeneric: 1, lcc: 4, keyword: 4, title: 4, abstract: 1 };

/**
 * Departments a code can only point at in the vaguest way. A publisher's "technology: general" or
 * "science" code says almost nothing, so it counts for the least and is never enough by itself.
 */
const GENERIC_DEPARTMENTS = new Set(['Applied Sciences', 'Science', 'Multidisciplinary']);

/** A department needs this much, and this much more than the next best, to be assigned. */
export const STRONG_MIN = 6;
export const STRONG_MARGIN = 3;
/** Below STRONG but at least this much: worth a person's look. */
export const REVIEW_MIN = 4;

/** BIC subject codes → department. Longest matching prefix wins, per code. */
const BIC: [string, string][] = [
  // computing
  ['UY', 'Computer / IT'], ['UB', 'Computer / IT'], ['UM', 'Computer / IT'], ['UN', 'Computer / IT'], ['UT', 'Computer / IT'],
  ['UR', 'Computer / IT'], ['UL', 'Computer / IT'], ['UD', 'Computer / IT'], ['UF', 'Computer / IT'], ['UG', 'Arts'],
  // technology & engineering
  ['TG', 'Mechanical Engineering'], ['TH', 'Energy'], ['THR', 'Electrical Engineering'], ['THF', 'Energy'],
  ['TJ', 'Electronics & Telecommunication Engineering'], ['TJK', 'Electronics & Telecommunication Engineering'], ['TJF', 'Electrical Engineering'],
  ['TN', 'Civil / Construction Engineering'], ['TNK', 'Civil / Construction Engineering'], ['TNF', 'Civil / Construction Engineering'],
  ['TGM', 'Material Science'], ['TDC', 'Bio Technology'], ['TDCB', 'Bio Technology'], ['TC', 'Chemical Engineering'], ['TCB', 'Chemistry'],
  ['TV', 'Agriculture'], ['TB', 'Applied Sciences'], ['TBC', 'Applied Sciences'], ['TQ', 'Life Sciences'], ['TT', 'Applied Sciences'],
  // science
  ['PN', 'Chemistry'], ['PS', 'Life Sciences'], ['PSB', 'Life Sciences'], ['PSG', 'Life Sciences'], ['PST', 'Bio Technology'],
  ['PB', 'Science'], ['PD', 'Science'], ['PH', 'Science'], ['PG', 'Science'], ['RB', 'Science'], ['RN', 'Life Sciences'],
  // medicine
  ['MB', 'Medical Sciences'], ['MJ', 'Medical Sciences'], ['MK', 'Medical Sciences'], ['MM', 'Medical Sciences'], ['MN', 'Medical Sciences'],
  ['MR', 'Medical Sciences'], ['MX', 'Ayurveda'], ['MQ', 'Nursing'], ['MKG', 'Dental'], ['MMG', 'Pharmacy'], ['MQC', 'Nursing'],
  ['MJP', 'Medical Sciences'], ['MBN', 'Medical Sciences'],
  // business, economics, law, social
  ['KJ', 'Management'], ['KJM', 'Management'], ['KJU', 'Management'], ['KF', 'Commerce'], ['KC', 'Commerce'], ['KN', 'Management'],
  ['KJC', 'Commerce'], ['KFF', 'Commerce'], ['KFC', 'Commerce'],
  ['L', 'Law'],
  ['JN', 'Education and Social Sciences'], ['JH', 'Education and Social Sciences'], ['JM', 'Education and Social Sciences'],
  ['JP', 'Education and Social Sciences'], ['JF', 'Education and Social Sciences'], ['JB', 'Education and Social Sciences'], ['JK', 'Education and Social Sciences'],
  // arts & humanities
  ['AM', 'Architecture'], ['AB', 'Arts'], ['AC', 'Arts'], ['AF', 'Arts'], ['AG', 'Arts'], ['AJ', 'Arts'], ['AK', 'Arts'],
  ['C', 'Arts'], ['D', 'Arts'], ['F', 'Arts'], ['H', 'Arts'], ['Q', 'Arts'], ['N', 'Arts'],
];
const BIC_SORTED = [...BIC].sort((a, b) => b[0].length - a[0].length);

/** Keywords, matched whole-word in subjects and title. Each department counts once per field. */
const KEYWORDS: [string, RegExp][] = [
  ['Computer / IT', /\b(computer science|computing|software|programming|algorithms?|machine learning|artificial intelligence|data science|databases?|cyber ?security|information technology|operating systems?|computer networks?|internet of things|blockchain|web development|human[- ]computer)\b/i],
  ['Electrical Engineering', /\b(electrical engineering|power systems?|electric machines?|power electronics|control systems?|smart grid|high voltage)\b/i],
  ['Electronics & Telecommunication Engineering', /\b(electronics|telecommunications?|wireless|signal processing|antennas?|microwave|vlsi|embedded systems?|5g|optical communication)\b/i],
  ['Mechanical Engineering', /\b(mechanical engineering|thermodynamics|fluid mechanics|heat transfer|machine design|manufacturing|robotics|mechatronics|automotive engineering)\b/i],
  ['Civil / Construction Engineering', /\b(civil engineering|hydraulic (engineering|structures)|river engineering|fluvial|construction|structural engineering|geotechnical|concrete|bridges?|transportation engineering|surveying|water resources engineering)\b/i],
  ['Chemical Engineering', /\b(chemical engineering|process engineering|reaction engineering|petrochemical|unit operations)\b/i],
  ['Chemistry', /\b(chemistry|organic chemistry|inorganic chemistry|analytical chemistry|spectroscopy|electrochemistry|catalysis|polymers? chemistry)\b/i],
  ['Material Science', /\b(materials? science|metallurgy|ceramics|composites?|alloys?|crystallography|nanomaterials?)\b/i],
  ['Nano Technology', /\b(nanotechnology|nanoscience|nanoparticles?|nanostructures?)\b/i],
  ['Bio Technology', /\b(biotechnology|genetic engineering|bioprocess|bioinformatics|synthetic biology|crispr|bioengineering)\b/i],
  ['Life Sciences', /\b(biology|ecology|zoology|botany|genetics|microbiology|evolution|biodiversity|molecular biology|neuroscience|life sciences)\b/i],
  ['Medical Sciences', /\b(medicine|medical|clinical|surgery|diabetes|cancer|therapy|therapeutic|endocrinology|neurolog\w*|health ?care|hormones?|immunology|infection|oncology|cardiology|epidemiology|public health|pathology|diagnosis|psychiatry|pediatrics|paediatrics|anatomy|physiology|disease)\b/i],
  ['Pharmacy', /\b(pharmacy|pharmaceutical|pharmacology|pharmacokinetics|drug (design|discovery|delivery)|toxicology)\b/i],
  ['Nursing', /\b(nursing|midwifery|patient care|nurses?)\b/i],
  ['Dental', /\b(dentistry|dental|orthodontics?|periodontology|endodontics|oral (health|surgery|medicine))\b/i],
  ['Physiotherapy', /\b(physiotherapy|physical therapy|rehabilitation|kinesiology|sports medicine)\b/i],
  ['Ayurveda', /\b(ayurveda|ayurvedic|unani|siddha|homoeopathy|homeopathy|traditional medicine|herbal medicine)\b/i],
  ['Agriculture', /\b(agriculture|agronomy|crop|horticulture|forestry|soil science|livestock|farming|food security|agroforestry|veterinary|swine|poultry|cattle|livestock|animal (health|husbandry|production))\b/i],
  ['Energy', /\b(renewable energy|solar (energy|power|cells?|panels?)|wind (power|energy)|energy (systems?|storage|policy|transition)|petroleum|biofuels?|nuclear energy|hydrogen)\b/i],
  ['Applied Mechanics', /\b(applied mechanics|solid mechanics|continuum mechanics|vibrations?|statics|dynamics of (machines|structures)|elasticity)\b/i],
  ['Architecture', /\b(architecture|architectural|urban design|urban planning|interior design|landscape architecture|building design)\b/i],
  ['Management', /\b((business|project|public|strategic|operations|financial|human resource|supply chain|quality|knowledge|change|risk) management|management (science|studies|accounting|information systems)|marketing|human resources?|entrepreneurship|leadership|organi[sz]ational|supply chain|business administration)\b/i],
  ['Commerce', /\b(commerce|accounting|finance|banking|economics|taxation|auditing|international trade|investment)\b/i],
  ['Law', /\b(law|legal|jurisprudence|constitutional|human rights law|criminal law|international law|legislation|litigat\w*|jurisdiction|treaty|statutes?|supreme court)\b/i],
  ['Education and Social Sciences', /\b(education|pedagogy|teaching|sociology|psychology|anthropology|political science|gender studies|social work|social sciences|public policy)\b/i],
  ['Arts', /\b(art history|literature|linguistics|philosophy|history|music|theatre|film studies|cultural studies|religion|poetry|humanities|archaeology)\b/i],
  ['Science', /\b(physics|mathematics|astronomy|geology|earth science|statistics|environmental science|climate)\b/i],
];

/**
 * The same departments in the other languages DOAB is full of (Spanish, Portuguese, French, German).
 * These are word *stems*, matched at the start of a word because those languages inflect; the
 * lookbehind keeps a stem from matching in the middle of an unrelated word, and `\b` is useless here
 * since it treats accented letters as non-letters.
 */
const stem = (alts: string) => new RegExp(`(?<![\\p{L}])(?:${alts})`, 'iu');
const KEYWORDS_OTHER_LANGUAGES: [string, RegExp][] = [
  ['Dental', stem('odontolog|dentist|zahnmedizin|zahnheilkunde|dentaire')],
  ['Nursing', stem('enfermer|enfermagem|infirmi|krankenpflege|pflegewissenschaft')],
  ['Pharmacy', stem('farmac|pharmazie|pharmacolog|farmacolog')],
  ['Medical Sciences', stem('medicin|médic|medizin|salud|saúde|santé|gesundheit|clínic|cirug|cirurg|enfermedad|doença|maladie|krankheit')],
  ['Law', stem('derecho|direito|droit|jurídic|juridic|rechtswissenschaft|gesetz')],
  ['Computer / IT', stem('informátic|informatique|informatik|programaci|programaç|computaci|computaç|inteligencia artificial|inteligência artificial')],
  ['Education and Social Sciences', stem('educaci|educaç|éducation|bildung|pedagog|pédagog|ensino|enseñanza|docente|sociolog|psicolog|psycholog')],
  ['Agriculture', stem('agricultur|agricol|landwirtschaft|agronom|agroalimentar')],
  ['Management', stem('gestión empresarial|gestão empresarial|gestion d.entreprise|administración de empresas|administração de empresas|unternehmensführung|marketing')],
  ['Commerce', stem('contabil|comercio|comércio|économ|economí|econômic|wirtschaftswissenschaft|finanz|finanç')],
  ['Architecture', stem('arquitectur|arquitetur|architektur')],
  ['Energy', stem('energía|energia|énergie|energie|renovable|renovável')],
  ['Civil / Construction Engineering', stem('ingeniería civil|engenharia civil|génie civil|bauingenieur')],
];
KEYWORDS.push(...KEYWORDS_OTHER_LANGUAGES);

/** The classifier's own wording for one department, read-only, so a provider's pre-filter can build on it and not keep a rival list. */
export function departmentKeywords(department: string): RegExp[] {
  return KEYWORDS.filter(([d]) => d === department).map(([, re]) => re);
}

for (const dep of [...BIC.map(r => r[1]), ...KEYWORDS.map(r => r[0])]) {
  if (!NAMES.has(dep)) throw new Error(`classifier names a department that does not exist: "${dep}"`);
}

export type DepartmentVerdict = {
  band: 'strong' | 'review' | 'none';
  /** Set only when band is "strong". */
  department: string | null;
  /** The best candidate even when not assigned, for a person reading the review queue. */
  suggested: string | null;
  score: number;
  runnerUp: { department: string; score: number } | null;
  reasons: string[];
  /** Which independent evidence families support the top department: code, title, subject, abstract. */
  families: string[];
};

export type ClassifyInput = {
  classifications?: string[]; subjects?: string[]; title?: string | null; description?: string | null;
  /** Library of Congress call numbers, when the source gives them (Open Textbook Library does). */
  lcc?: string[];
};

export function classifyDepartment(b: ClassifyInput): DepartmentVerdict {
  const scores = new Map<string, number>();
  const why: Record<string, string[]> = {};
  const fams = new Map<string, Set<string>>();
  const add = (dep: string, pts: number, reason: string, family: 'code' | 'title' | 'subject' | 'abstract') => {
    scores.set(dep, (scores.get(dep) || 0) + pts);
    (why[dep] ||= []).push(`${reason} +${pts}`);
    (fams.get(dep) || fams.set(dep, new Set()).get(dep)!).add(family);
  };

  // Codes. DOAB writes them as a path — "THEMA EDITEUR::M MEDICINE AND NURSING::MJ CLINICAL…::MJG ENDOCRINOLOGY"
  // — or as a bare code ("JHM"). Either way, take every code in it. Each is mapped by its longest known
  // prefix, a department is credited once per rule, and the more specific the rule the more it counts.
  const codes: string[] = [];
  for (const raw of b.classifications || []) {
    if (raw.includes('::')) {
      for (const seg of raw.split('::').slice(1)) {
        const c = /^([A-Z0-9]{1,6})(?:\s|$)/.exec(seg.trim().toUpperCase())?.[1];
        if (c) codes.push(c);
      }
    } else {
      const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c && c.length <= 6) codes.push(c);
    }
  }
  const seen = new Set<string>();
  for (const c of codes) {
    const hit = BIC_SORTED.find(([prefix]) => c.startsWith(prefix));
    if (!hit) continue;
    const key = `${hit[1]}|${hit[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pts = GENERIC_DEPARTMENTS.has(hit[1]) ? W.codeGeneric
      : hit[0].length >= 3 ? W.codeSpecific : hit[0].length === 2 ? W.codeMid : W.codeBroad;
    add(hit[1], pts, `code ${c}`, 'code');
  }
  // Library of Congress call numbers, where given. Class-level only, so they count as a mid-strength code.
  const lccSeen = new Set<string>();
  for (const call of b.lcc || []) {
    const l = parseLcc(String(call));
    const dep = l && departmentFromLcc(l.cls, l.num);
    if (!dep || lccSeen.has(dep)) continue;
    lccSeen.add(dep);
    add(dep, W.lcc, `LCC ${call}`, 'code');
  }

  const subjects = (b.subjects || []).join(' ; ');
  const title = b.title || '';
  const abstract = (b.description || '').slice(0, 1200);
  for (const [dep, re] of KEYWORDS) {
    if (subjects && re.test(subjects)) add(dep, W.keyword, 'subject keyword', 'subject');
    if (title && re.test(title)) add(dep, W.title, 'title', 'title');
    if (abstract && re.test(abstract)) add(dep, W.abstract, 'abstract', 'abstract');
  }

  const ranked = [...scores.entries()].sort((a, c) => c[1] - a[1]);
  if (!ranked.length) return { band: 'none', department: null, suggested: null, score: 0, runnerUp: null, reasons: ['no subject, code, title or abstract evidence for any department'], families: [] };

  const [top, topScore] = ranked[0];
  const second = ranked[1];
  const margin = topScore - (second?.[1] ?? 0);
  const runnerUp = second ? { department: second[0], score: second[1] } : null;

  const families = [...(fams.get(top) || [])];
  // To auto-publish, a controlled classification code must support the department AND the title or the
  // subject wording must independently agree. Words alone never auto-publish, however high they score: in
  // review, words-only was right 84% of the time and code-plus-words 97%. The abstract adds to the score but
  // is not a witness.
  const witnesses = families.filter(f => f !== 'abstract');
  const corroborated = witnesses.includes('code') && (witnesses.includes('title') || witnesses.includes('subject'));

  if (topScore >= STRONG_MIN && margin >= STRONG_MARGIN && corroborated) {
    return { band: 'strong', department: top, suggested: top, score: topScore, runnerUp, reasons: why[top], families };
  }
  if (topScore >= REVIEW_MIN) {
    const why2 = topScore >= STRONG_MIN && margin >= STRONG_MARGIN
      ? (families.includes('code')
          ? `a code supports it but no title or subject wording does`
          : `words only (${families.join(' + ')}) — no controlled code agrees, so it is not auto-published`)
      : margin < STRONG_MARGIN && second ? `close to ${second[0]} (${second[1]})` : `only ${topScore} points of evidence`;
    return { band: 'review', department: null, suggested: top, score: topScore, runnerUp, reasons: [...why[top], why2], families };
  }
  return { band: 'none', department: null, suggested: top, score: topScore, runnerUp, reasons: [`best candidate ${top} scored only ${topScore}`], families };
}
