import { CANONICAL_NAMES } from '../../departmentRegistry.js';

/**
 * What to ask a subject-searchable provider for, per department.
 *
 * A profile is a list of search phrases, and nothing else. It decides what a provider is ASKED; it never decides what a book IS.
 * Whatever comes back goes through the same classifier as every other book — a code AND the title or subject wording must agree on a
 * department before a book is published, a plausible one goes to review, and the rest is skipped — so asking for "architecture" and
 * receiving a cookery book yields nothing. The canonical registry stays the source of truth: every department in it must have a
 * profile, and a profile for a name the registry does not know is refused, both checked when this module loads.
 */

export type DepartmentProfile = {
  /** Search phrases, most specific first. A provider takes them in turn, one query per request. */
  queries: string[];
};

export const DEPARTMENT_PROFILES: Record<string, DepartmentProfile> = {
  'Agriculture': { queries: ['agriculture', 'agronomy', 'crop science', 'soil science', 'horticulture', 'animal husbandry', 'agricultural economics'] },
  'Applied Mechanics': { queries: ['applied mechanics', 'solid mechanics', 'structural mechanics', 'continuum mechanics', 'vibration', 'dynamics and control', 'finite element'] },
  'Applied Sciences': { queries: ['applied science', 'engineering science', 'applied physics', 'technology and society', 'industrial technology', 'applied mathematics'] },
  'Architecture': { queries: ['architecture', 'architectural design', 'urban planning', 'landscape architecture', 'housing', 'building technology', 'architectural history'] },
  'Arts': { queries: ['art history', 'literature', 'linguistics', 'philosophy', 'history', 'music', 'film studies', 'cultural studies', 'religion'] },
  'Ayurveda': { queries: ['ayurveda', 'ayurvedic medicine', 'traditional medicine', 'herbal medicine', 'yoga therapy', 'unani', 'siddha'] },
  'Bio Technology': { queries: ['biotechnology', 'genetic engineering', 'molecular biology', 'bioinformatics', 'bioprocess engineering', 'microbial biotechnology', 'genomics'] },
  'Chemical Engineering': { queries: ['chemical engineering', 'process engineering', 'reaction engineering', 'mass transfer', 'unit operations', 'petrochemical', 'polymer engineering'] },
  'Chemistry': { queries: ['chemistry', 'organic chemistry', 'inorganic chemistry', 'physical chemistry', 'analytical chemistry', 'biochemistry', 'spectroscopy'] },
  'Civil / Construction Engineering': { queries: ['civil engineering', 'structural engineering', 'geotechnical engineering', 'construction management', 'transportation engineering', 'water resources engineering', 'concrete'] },
  'Commerce': { queries: ['commerce', 'accounting', 'finance', 'economics', 'banking', 'taxation', 'international trade', 'auditing'] },
  'Computer / IT': { queries: ['computer science', 'information technology', 'software engineering', 'artificial intelligence', 'cybersecurity', 'data science', 'machine learning', 'databases'] },
  'Dental': { queries: ['dentistry', 'oral health', 'periodontology', 'orthodontics', 'dental materials', 'oral surgery', 'endodontics'] },
  'Education and Social Sciences': { queries: ['education', 'sociology', 'psychology', 'political science', 'pedagogy', 'social work', 'anthropology', 'public policy'] },
  'Electrical Engineering': { queries: ['electrical engineering', 'power systems', 'electric machines', 'control systems', 'power electronics', 'smart grid', 'circuit analysis'] },
  'Electronics & Telecommunication Engineering': { queries: ['electronics', 'telecommunications', 'signal processing', 'wireless communication', 'embedded systems', 'VLSI', 'antennas and propagation'] },
  'Energy': { queries: ['energy', 'renewable energy', 'solar energy', 'wind power', 'energy storage', 'nuclear energy', 'energy policy', 'petroleum engineering'] },
  'Law': { queries: ['law', 'constitutional law', 'international law', 'criminal law', 'human rights', 'jurisprudence', 'commercial law', 'legal theory'] },
  'Life Sciences': { queries: ['life sciences', 'biology', 'ecology', 'zoology', 'botany', 'microbiology', 'genetics', 'evolution'] },
  'Management': { queries: ['management', 'business administration', 'marketing', 'human resource management', 'organizational behavior', 'operations management', 'entrepreneurship', 'strategy'] },
  'Material Science': { queries: ['materials science', 'metallurgy', 'ceramics', 'composite materials', 'polymers', 'corrosion', 'crystallography'] },
  'Mechanical Engineering': { queries: ['mechanical engineering', 'thermodynamics', 'manufacturing', 'machine design', 'fluid mechanics', 'automotive engineering', 'heat transfer', 'robotics'] },
  'Medical Sciences': { queries: ['medicine', 'clinical medicine', 'health science', 'medical education', 'diagnostics', 'public health', 'epidemiology', 'surgery'] },
  'Multidisciplinary': { queries: ['interdisciplinary studies', 'sustainability', 'science and society', 'research methods', 'science policy', 'complex systems'] },
  'Nano Technology': { queries: ['nanotechnology', 'nanomaterials', 'nanoscience', 'nanoelectronics', 'quantum dots', 'nanomedicine'] },
  'Nursing': { queries: ['nursing', 'nursing practice', 'midwifery', 'patient care', 'community health nursing', 'nursing education', 'clinical nursing'] },
  'Pharmacy': { queries: ['pharmacy', 'pharmacology', 'pharmaceutical sciences', 'drug discovery', 'toxicology', 'clinical pharmacy', 'medicinal chemistry'] },
  'Physiotherapy': { queries: ['physiotherapy', 'physical therapy', 'rehabilitation', 'sports medicine', 'musculoskeletal', 'kinesiology', 'occupational therapy'] },
  'Science': { queries: ['science', 'physics', 'mathematics', 'astronomy', 'earth science', 'geology', 'statistics'] },
};

// Checked at load: a department without a profile, or a profile for a department that does not exist, is a failure at start-up.
{
  const known = new Set(CANONICAL_NAMES);
  const missing = CANONICAL_NAMES.filter(n => !DEPARTMENT_PROFILES[n]);
  const unknown = Object.keys(DEPARTMENT_PROFILES).filter(n => !known.has(n));
  if (missing.length || unknown.length) throw new Error(`department profiles disagree with the canonical registry — missing: [${missing.join(', ')}] unknown: [${unknown.join(', ')}]`);
}

export const profileOf = (department: string): DepartmentProfile | null => DEPARTMENT_PROFILES[department] ?? null;
