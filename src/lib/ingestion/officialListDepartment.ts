import type { DeptDecision } from './journalSourceImport.js';

/**
 * Department evidence from a RECOGNISED PUBLISHER OR SOCIETY, read together with the journal's own title and the topics OpenAlex gives its articles.
 *
 * The topic classifier (openAlexDepartments.ts) is strict on purpose: a journal needs half of its works in one department's subfields, with a clear lead. A learned-society
 * journal can miss that bar for a reason that says nothing about its field: IEEE Transactions on Power Systems spreads over Electrical Engineering, Energy and Control, so no single
 * department holds half. This module adds a second route that is just as demanding but counts a different kind of evidence:
 *
 *   1. BODY       the publisher (or society) is one that publishes in that discipline only: IEEE, IET, IEICE (electrical and electronics), ASME, IMechE, JSME, KSME (mechanical).
 *                 A body never decides the department alone. IEEE also publishes computing, biomedical and robotics journals, so the body only narrows the choice.
 *   2. TITLE      the journal's own title names exactly one department of that body's family by specific words (power, grid, drives → Electrical; communications, microwave, VLSI →
 *                 Electronics & Telecommunication). Words from both families, or from neither, give no answer.
 *   3. TOPICS     OpenAlex's topics for the journal independently support it: the department (or the shared electrical/electronics subfield that the title then resolves) holds at
 *                 least 30% of the topic works in at least two topics, OR at least 60% of the works, in at least three topics, are engineering and neighbouring physical-science topics.
 *                 Either way, no non-engineering field (computing, medicine, arts) may lead by a clear margin.
 *
 * All three are required. Magazines, newsletters, proceedings, letters-to-the-editor style serials, standards and the like are never journals here. Nothing is guessed:
 * any missing leg is `low` and the journal is held.
 */

const D = { elec: 'Electrical Engineering', etc: 'Electronics & Telecommunication Engineering', mech: 'Mechanical Engineering', appMech: 'Applied Mechanics', bio: 'Bio Technology' };

export type Body = { id: string; name: string; test: RegExp; family: string[] };
export const BODIES: Body[] = [
  { id: 'ieee', name: 'IEEE', test: /\bIEEE\b|Institute of Electrical and Electronics Engineers/i, family: [D.elec, D.etc] },
  { id: 'iet', name: 'IET', test: /Institution of Engineering and Technology|\bIET\b/i, family: [D.elec, D.etc] },
  { id: 'ieice', name: 'IEICE', test: /Institute of Electronics,? Information and Communication Engineers|\bIEICE\b/i, family: [D.elec, D.etc] },
  { id: 'ieej', name: 'IEEJ', test: /Institute of Electrical Engineers of Japan|\bIEEJ\b/i, family: [D.elec, D.etc] },
  { id: 'kiee', name: 'KIEE', test: /Korean Institute of Electrical Engineers|Korean Institute of Electrical and Electronic Material Engineers|Institute of Korean Electrical and Electronics Engineers/i, family: [D.elec, D.etc] },
  { id: 'icros', name: 'ICROS', test: /Institute of Control, Robotics and Systems/i, family: [D.elec] },
  { id: 'ite', name: 'ITE', test: /Institute of Image Information and Television Engineers/i, family: [D.etc] },
  { id: 'ema', name: 'EMA', test: /Electromagnetics Academy/i, family: [D.etc] },
  { id: 'optica', name: 'Optica', test: /Optica Publishing Group|\bOptica\b|Optical Society of America/i, family: [D.etc] },
  { id: 'spie', name: 'SPIE', test: /SPIE-Intl Soc Optical Eng|\bSPIE\b/i, family: [D.etc] },
  { id: 'ksbb', name: 'KSBB', test: /Korean Society for Biotechnology and Bioengineering/i, family: [D.bio] },
  { id: 'jsbba', name: 'JSBBA', test: /Society for Biotechnology, Japan|Japan Society for Bioscience, Biotechnology, and Agrochemistry/i, family: [D.bio] },
  { id: 'kiees', name: 'KIEES', test: /Korean Institute of Electromagnetic Engineering and Science/i, family: [D.etc] },
  { id: 'ieek', name: 'IEEK', test: /Institute of Electronics Engineers of Korea/i, family: [D.elec, D.etc] },
  { id: 'sice', name: 'SICE', test: /Society of Instrument and Control Engineers/i, family: [D.elec] },
  { id: 'jsaem', name: 'JSAEM', test: /Japan Society of Applied Electromagnetics and Mechanics/i, family: [D.elec, D.etc] },
  { id: 'ksmb', name: 'KSMB', test: /Korean Society for Microbiology and Biotechnology/i, family: [D.bio] },
  { id: 'msmbb', name: 'MSMBB', test: /Malaysian Society for Molecular Biology and Biotechnology/i, family: [D.bio] },
  { id: 'asme', name: 'ASME', test: /\bASME\b|American Society of Mechanical Engineers/i, family: [D.mech, D.appMech] },
  { id: 'imeche', name: 'IMechE', test: /Institution of Mechanical Engineers|\bIMechE\b/i, family: [D.mech, D.appMech] },
  { id: 'jsme', name: 'JSME', test: /Japan Society of Mechanical Engineers|\bJSME\b/i, family: [D.mech, D.appMech] },
  { id: 'ksme', name: 'KSME', test: /Korean Society of Mechanical Engineers|\bKSME\b/i, family: [D.mech, D.appMech] },
];

/** A serial that is not a research journal, whatever its publisher. */
export const NON_JOURNAL = /magazine|newsletter|news\b|bulletin of the|proceedings|conference|symposium|workshop|standards?\b|yearbook|annual (report|review of)|handbook|directory|digest|reprints?|supplement|abstracts?\b|\bletters? (to|from)\b|\bIEEE (spectrum|potentials|pulse)\b/i;

/** Words that name a department of the family. Specific words only; "engineering", "systems", "technology" and "science" name nothing. */
const TITLE_WORDS: Record<string, RegExp> = {
  [D.elec]: /\bpower (systems?|electronics|delivery|engineering|apparatus|system|and energy|grid)\b|\bpower\b(?!.*\b(communication|wireless))|smart grids?|electric(al)? (machines?|power|drives?|vehicles?|engineering|energy|insulation)|\belectrification\b|industrial (electronics|informatics|automation)|\bdrives?\b|control systems?|automatic control|automation science|\bmagnetics\b|dielectrics?|superconductiv|plasma science|instrumentation and measurement|energy conversion|industry applications|high[- ]voltage|\bswitchgear|\btransformers?\b|photovoltaics?|\bmotors?\b|\bgrid\b/i,
  [D.etc]: /communications?|telecommunication|wireless|signal processing|microwave|antennas?|propagation|photonics|lightwave|optical (communications?|networking|networks?|fib(er|re))|electron devices?|circuits? and systems|\bcircuits\b|\bvlsi\b|solid[- ]state (circuits|electronics)|networking|sensors?\b|information theory|vehicular technology|broadcasting|consumer electronics|terahertz|electromagnetic compatibility|\bradar\b|\brf\b|electronic (devices|materials|packaging|components)|cognitive radio/i,
  [D.mech]: /mechanical (design|engineering|systems?|science)|manufacturing|machining|heat transfer|thermal (science|engineering|management)|turbomachinery|gas turbines?|combustion|tribology|mechatronics|\brobotics?\b|dynamic systems|energy resources technology|engineering for gas turbines|internal combustion|automotive|vehicle (dynamics|design)|machine design|machines? (and|&) mechanisms|refrigeration|hvac|welding|fatigue/i,
  [D.bio]: /biotechnolog|biotech\b|bioprocess|bio-?engineering|biocatalys|fermentation|enzyme (technology|engineering)|synthetic biology|metabolic engineering|biorefin|bioresource technology|bioscience,? biotechnology/i,
  [D.appMech]: /applied mechanics|solid mechanics|fluid mechanics|fluids engineering|\bmechanics\b|vibration|acoustics|structural (mechanics|dynamics)|computational mechanics|continuum|elasticity|plasticity|fracture|fatigue and fracture|computational and nonlinear dynamics|nondestructive evaluation|offshore mechanics/i,
};

const MIN_TOPIC_SHARE = 0.3, MIN_TOPICS = 2, MIN_TOPIC_WORKS = 30, MIN_ENGINEERING_SHARE = 0.6;
/** Departments (as scoreTopics names them) whose topics are consistent with an electrical, electronics or mechanical journal. */
const ENGINEERING_NEIGHBOURS = new Set([D.elec, D.etc, D.mech, D.appMech, 'AMBIGUOUS_ELECTRICAL', 'Material Science', 'Energy', 'Civil / Construction Engineering', 'Science']);

export type OfficialInput = {
  title: string; publisher: string | null; listedBy?: string[]; societies?: string[];
  topicShares: { department: string; share: number; topics: number }[]; topicTotal: number;
};

/** Which recognised body is behind this journal, from its publisher, its title, the Crossref member list it came from and the OpenAlex societies. */
export function bodyOf(i: Partial<Pick<OfficialInput, 'title'>> & Pick<OfficialInput, 'publisher' | 'listedBy' | 'societies'>): Body | null {
  // The title counts too: the Institution of Mechanical Engineers' journals are published through SAGE but are named "Proceedings of the Institution of Mechanical Engineers, Part X".
  const hay = [i.publisher || '', i.title || '', ...(i.listedBy || []), ...(i.societies || [])].join(' | ');
  return BODIES.find(b => b.test.test(hay)) || null;
}

/** Which departments of the family the title names (specific words only). */
export function titleFamilyHits(title: string, family: string[]): string[] {
  return family.filter(d => TITLE_WORDS[d]?.test(title));
}

export function officialListDepartment(i: OfficialInput): DeptDecision {
  const body = bodyOf(i);
  if (!body) return { dept: null, confidence: 'low', reason: 'not a journal of a recognised discipline body' };
  if (NON_JOURNAL.test(i.title)) return { dept: null, confidence: 'low', reason: `${body.name} serial that reads as a magazine, newsletter, proceedings or other non-journal` };
  const hits = titleFamilyHits(i.title, body.family);
  if (hits.length === 0) return { dept: null, confidence: 'low', reason: `the title does not name ${body.family.join(' or ')} by a specific word`, evidence: { basis: 'official-list', body: body.id } };
  if (hits.length > 1) return { dept: null, confidence: 'low', reason: `the title names both ${hits.join(' and ')}`, evidence: { basis: 'official-list', body: body.id } };
  const dept = hits[0];
  if (i.topicTotal < MIN_TOPIC_WORKS) return { dept, confidence: 'low', reason: `only ${i.topicTotal} topic works: no independent topic support`, evidence: { basis: 'official-list', body: body.id } };
  const mine = i.topicShares.filter(s => s.department === dept || (s.department === 'AMBIGUOUS_ELECTRICAL' && body.family.includes(D.elec)));
  const share = mine.reduce((a, s) => a + s.share, 0), topics = mine.reduce((a, s) => a + s.topics, 0);
  // OpenAlex's subfield-to-department table is deliberately narrow, so an antenna, a magnet or a superconductor journal spreads over Engineering, Materials and Physics subfields
  // without any one department holding a third. The second leg is therefore met in either of two ways: the department itself holds a third of the works, or the topics as a whole
  // are engineering and its neighbouring physical sciences (a majority of works, in at least three topics) with no non-engineering field in the lead.
  const eng = i.topicShares.filter(s => ENGINEERING_NEIGHBOURS.has(s.department));
  const engShare = eng.reduce((a, s) => a + s.share, 0), engTopics = eng.reduce((a, s) => a + s.topics, 0);
  const outside = [...i.topicShares].filter(s => !ENGINEERING_NEIGHBOURS.has(s.department)).sort((a, b) => b.share - a.share)[0];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const evidence = { basis: 'official-list', body: body.id, title: hits, topicShare: r2(share), topics, engineeringShare: r2(engShare), engineeringTopics: engTopics, leadingOutside: outside ? { department: outside.department, share: r2(outside.share) } : null };
  const own = share >= MIN_TOPIC_SHARE && topics >= MIN_TOPICS;
  const broad = engShare >= MIN_ENGINEERING_SHARE && engTopics >= 3;
  if (!own && !broad) return { dept, confidence: 'low', reason: `topic support for ${dept} is too thin (${Math.round(share * 100)}% of works in ${topics} topics; engineering topics ${Math.round(engShare * 100)}%)`, evidence };
  // A title that names an engineering department while the journal's articles are really about something else (computing, medicine, arts) is not placed.
  if (outside && outside.share >= Math.max(share, 0.3) + 0.15) return { dept, confidence: 'low', reason: `the topics lean to ${outside.department} (${Math.round(outside.share * 100)}%) over ${dept}`, evidence };
  return { dept, confidence: 'high', evidence };
}
