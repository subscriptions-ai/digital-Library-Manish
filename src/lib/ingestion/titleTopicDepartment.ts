import type { DeptDecision } from './journalSourceImport.js';

/**
 * A second route to a department for a journal OpenAlex's topics support only partly: the journal's OWN TITLE names the discipline by a specific term, AND the topics of its articles
 * independently put that department first. Two different kinds of evidence (what the journal calls itself, what it publishes) agreeing is what the engine's journal classifier already
 * treats as "high" (journalClassification.ts); this applies the same idea to OpenAlex topics, which the strict topic rule (half of all works in one department) cannot do for a
 * journal that spreads over neighbouring subfields.
 *
 *   title    a term that is SPECIFIC to the department (not "engineering", "science", "technology", "research", "applied", "systems", "energy", "materials", "control", "design")
 *   topics   the department holds at least a quarter of the journal's topic works, in at least two topics, at least 30 works in all, and leads the next department by 5 points
 *
 * Both are required. Neither a title alone nor topics alone ever place a journal by this route. Departments whose neighbours are easily confused (general chemistry, general biology,
 * traditional medicine, rehabilitation, broad engineering) therefore need terms that belong to the department and not to its neighbour; see TITLE_TERMS.
 */

export const TITLE_TERMS: Record<string, RegExp> = {
  'Electrical Engineering': /elektrotechnik|elektrotechniek|elektrotechnika|elettrotecnica|[eé]lectrotechnique|\blistrik\b|elektrische (energie|systeme|maschinen|antriebe)|teknik elektro|ingenier[ií]a el[eé]ctrica|engenharia el[eé]trica|g[eé]nie [eé]lectrique|electrical (engineering|power|machines?|systems?|energy|insulation|and electronic)|electric (power|machines?|drives?|vehicles?|energy)|power (systems?|electronics|engineering|grids?|quality|delivery|transmission|apparatus)|smart grids?|high[- ]voltage|\belectrification\b|power (and|&) energy systems|energy systems? (and|&) power|\bswitchgear\b|\btransformers?\b/i,
  'Electronics & Telecommunication Engineering': /teknik elektronik|kejuruteraan elektronik|elektronika|elettronica|[eé]lectronique|nachrichtentechnik|telekomunikasi|telecomunicaci[oó]n|telecomunica[cç][oõ]es|ingenier[ií]a electr[oó]nica|engenharia eletr[oô]nica|telecommunications?|wireless (communications?|networks?|sensor|systems?|power)|communications? (systems|engineering|networks?|technology|letters)|signal processing|microwave|antennas?|optical (communications?|fib(er|re)s?|networks?)|photonics|\bvlsi\b|integrated circuits?|electronic (devices|engineering|circuits|materials|systems)|\brf\b|radio (science|engineering|frequency)|embedded systems|electronics (letters|and communication|engineering)|electronics$/i,
  'Mechanical Engineering': /mechanical (engineering|design|science|systems|and aerospace|and manufacturing|sciences)|machine design|manufacturing (engineering|science|processes|technology|systems|letters)|thermal (engineering|science)|heat (transfer|and mass transfer)|combustion|turbomachinery|tribology|mechatronics|automotive engineering|welding|machining|production engineering|refrigeration|air conditioning|internal combustion|gas turbine|engineering mechanics|teknik mesin|ingenier[ií]a mec[aá]nica|engenharia mec[aâ]nica|maschinenbau|g[eé]nie m[eé]canique/i,
  'Applied Mechanics': /applied mechanics|\bmechanica\b|solid mechanics|fluid mechanics|computational mechanics|structural mechanics|continuum mechanics|mechanics of (materials|solids|structures|composites?)|\bmechanics\b|rheology|vibration|structural dynamics|fracture mechanics/i,
  'Pharmacy': /pharmac(y|eutic|ology|ist|opoeia|oepia|ognosy|ovigilance|oepidemiology)|drug (delivery|development|discovery|design|metabolism|research|safety)|pharmacokinetic|dosage form|medicinal chemistry|\bfarmasi|\bfarmac|\bfarmaz|pharma\b/i,
  'Bio Technology': /biotecnolog[ií]a|biotecnologia|bioteknologi|bioteknoloji|biyoteknoloji|biotechnologia|biotechnologie|biotech\b|biotechnolog|bioprocess|bioengineering|biocatalys|synthetic biology|genetic engineering|bioinformatics|fermentation|metabolic engineering|biorefiner|tissue engineering|biosensors?|biomaterials/i,
  'Chemical Engineering': /chemical engineering|\baiche\b|\bicheme\b|chemical (and|&) (bio)?process|process (engineering|systems|safety|intensification)|reaction engineering|separation (and|&) purification|separation science|chemical reactor|chemical process|membrane science|particle technology|powder technology|unit operations/i,
  'Nano Technology': /\bnano/i,
  'Architecture': /architect|landscape (architecture|design)|urban (design|planning|studies)|town planning|interior design|built environment|building (design|science)|heritage (conservation|and architecture)/i,
  'Physiotherapy': /physiotherap|physical therap|fisioterap|physical medicine|physical (and|&) (occupational therap|rehabilitation)|rehabilitation (medicine|science)|neurorehabilit|kinesiotherap|manual therap|sports (physical therap|physiotherap)|musculoskeletal (science|physiotherap)|\bfisio|\bfizyo/i,
  'Ayurveda': /ayurved|\bunani\b|\bsiddha\b|homoeopath|homeopath|\bayush\b|naturopath|\byoga\b|panchakarma|rasashastra/i,
};

/** A title term that belongs to ANOTHER department of the target list: the journal then names two fields and is not placed by this route. */
const MIN_SHARE = 0.25, MIN_TOPICS = 2, MIN_WORKS = 30, MIN_LEAD = 0.05;

export type TitleTopicInput = { title: string; topicShares: { department: string; share: number; topics: number }[]; topicTotal: number };

/** Departments whose title terms the title names (could be several). */
export function titleDepartments(title: string): string[] {
  return Object.entries(TITLE_TERMS).filter(([, re]) => re.test(title)).map(([d]) => d);
}

export function titleTopicDepartment(i: TitleTopicInput): DeptDecision {
  const named = titleDepartments(i.title);
  if (named.length === 0) return { dept: null, confidence: 'low', reason: 'the title names no department by a specific term' };
  // Biomechanics, nanomaterials in a pharmacy journal and the like: the title speaks of two departments, so it speaks of none.
  if (named.length > 1) return { dept: null, confidence: 'low', reason: `the title names several departments (${named.join(', ')})`, evidence: { basis: 'title+topics', named } };
  const dept = named[0];
  if (i.topicTotal < MIN_WORKS) return { dept, confidence: 'low', reason: `only ${i.topicTotal} topic works: no independent topic support`, evidence: { basis: 'title+topics' } };
  const shares = [...i.topicShares].sort((a, b) => b.share - a.share);
  const mine = i.topicShares.filter(s => s.department === dept || (s.department === 'AMBIGUOUS_ELECTRICAL' && /Electr/.test(dept)));
  const share = mine.reduce((a, s) => a + s.share, 0), topics = mine.reduce((a, s) => a + s.topics, 0);
  const runner = shares.find(s => !mine.includes(s));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const evidence = { basis: 'title+topics', title: dept, topicShare: r2(share), topics, runnerUp: runner ? { department: runner.department, share: r2(runner.share) } : null };
  if (share < MIN_SHARE || topics < MIN_TOPICS) return { dept, confidence: 'low', reason: `topic support is too thin (${Math.round(share * 100)}% of works in ${topics} topics)`, evidence };
  if (runner && runner.share > share - MIN_LEAD) return { dept, confidence: 'low', reason: `${runner.department} (${Math.round(runner.share * 100)}%) is as strong as ${dept} (${Math.round(share * 100)}%)`, evidence };
  return { dept, confidence: 'high', evidence };
}
