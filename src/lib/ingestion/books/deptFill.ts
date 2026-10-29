import { canonicalLicence } from './licence.js';
import { judgeBookAccess, type NormalisedBook } from './normalise.js';
import { bookFingerprint } from './dedupe.js';
import { normaliseDoi } from './identifiers.js';
import { classifyDepartment, departmentKeywords, REVIEW_MIN } from './classifier.js';
import { DEPARTMENT_PROFILES } from './departmentProfiles.js';
import { licenceAllowsCommercialUse } from '../eligibility.js';

/**
 * Filling a department that has no books: OpenAlex open-access books, judged by a narrow rule written for exactly these departments.
 *
 * Why a separate rule. The ordinary classifier lists a book only when a controlled subject code AND the title or subject wording agree. Nano
 * Technology has no such code at all, and Applied Sciences and Multidisciplinary are catch-all departments no code points at, so by design nothing
 * can reach them and they stay at zero. The owner decided (2026-10-29) that for these departments a book may be listed when ALL of these hold:
 *
 *   1. the department's own word is in the book's TITLE (not its abstract, not a keyword list);
 *   2. OpenAlex's topic for the book agrees (a topic naming the field, or a science/engineering/medicine field for the department);
 *   3. the book carries a Creative Commons licence declared on its OWN record (OpenAlex primary location, open access, licence recognised by
 *      canonicalLicence). A licence found on some repository copy of a title is not the licence of the book: it is ignored;
 *   4. the usual rules still apply untouched: English, published in or after the book policy year, a whole book (not a chapter, serial or
 *      proceedings), a DOI, not already held.
 *
 * Applied Sciences and Multidisciplinary additionally only receive a book that no other department claims, because they are the department of last
 * resort, never a better home than a real subject.
 *
 * Nothing here grants any right to host: every row is LinkOnly, MetadataOnly rights, no file address. The row is the same shape the harvest writes.
 */

export const DEPT_FILL_SOURCE = 'OpenAlex';
export const DEPT_FILL_DEPARTMENTS = ['Nano Technology', 'Ayurveda', 'Applied Sciences', 'Multidisciplinary'] as const;
/**
 * Departments that are short of books after the first fill (production Published counts below 50 on 2026-10-29). They have real subject words and the
 * classifier already knows them, so there the classifier arbitrates (title word + OpenAlex topic words must give one clear leader) instead of the
 * title word alone. Everything else (licence on the book's own record, publisher host, English, whole book, year, not held) is the same.
 */
export const ENGINEERING_FILL_DEPARTMENTS = ['Applied Mechanics', 'Chemical Engineering', 'Material Science', 'Electrical Engineering', 'Mechanical Engineering', 'Electronics & Telecommunication Engineering', 'Civil / Construction Engineering'] as const;
/** The next-thinnest departments (public books under 500 after the engineering fills): same rule, but the engineering-only humanities guard does not apply to them. */
export const NEXT_FILL_DEPARTMENTS = ['Physiotherapy', 'Architecture', 'Management'] as const;
export const MIN_FILL_DEPARTMENTS = [...ENGINEERING_FILL_DEPARTMENTS, ...NEXT_FILL_DEPARTMENTS] as const;
export const ALL_FILL_DEPARTMENTS = [...DEPT_FILL_DEPARTMENTS, ...MIN_FILL_DEPARTMENTS] as const;
export type FillDepartment = (typeof ALL_FILL_DEPARTMENTS)[number];

type Rule = {
  /** What is asked of OpenAlex (title search), one request series per term. */
  queries: string[];
  /** The department's own word, in the title. */
  title: RegExp;
  /** OpenAlex topic names that agree on their own. */
  topicNames: RegExp;
  /** OpenAlex fields that agree because the department lives in them. */
  fields: string[];
  /** A catch-all department: only a book no other department claims. */
  lastResort?: boolean;
};

const SCIENCE_FIELDS = ['Materials Science', 'Chemical Engineering', 'Chemistry', 'Physics and Astronomy', 'Engineering', 'Biochemistry, Genetics and Molecular Biology', 'Pharmacology, Toxicology and Pharmaceutics', 'Medicine', 'Environmental Science', 'Energy', 'Computer Science', 'Agricultural and Biological Sciences', 'Immunology and Microbiology', 'Health Professions'];

const kw = (d: string) => new RegExp(departmentKeywords(d).map(r => r.source).join('|'), 'i');
const ENG = ['Engineering', 'Physics and Astronomy', 'Materials Science', 'Energy', 'Computer Science', 'Chemical Engineering', 'Chemistry', 'Mathematics', 'Earth and Planetary Sciences', 'Environmental Science'];
const minRule = (d: FillDepartment, topicNames: RegExp, fields: string[]): Rule => ({ queries: DEPARTMENT_PROFILES[d].queries, title: kw(d), topicNames, fields });

export const FILL_RULES: Record<FillDepartment, Rule> = {
  'Nano Technology': {
    queries: ['nanotechnology', 'nanomaterials', 'nanoscience', 'nanoparticles', 'nanocomposites', 'nanoelectronics', 'nanomedicine', 'nanostructures', 'nanofabrication', 'nanotubes', 'quantum dots', 'nanoscale'],
    title: /\b(nano-?technolog\w*|nano-?science\w*|nano-?materials?|nano-?particles?|nano-?composites?|nano-?electronics?|nano-?medicine|nano-?structur\w*|nano-?fabrication|nano-?tubes?|nano-?wires?|nano-?scale|nano-?devices?|nano-?sensors?|nano-?photonics|nano-?biotechnology|quantum dots?)\b/i,
    topicNames: /nano|quantum dot|graphene|fullerene/i,
    fields: SCIENCE_FIELDS,
  },
  'Ayurveda': {
    queries: ['ayurveda', 'ayurvedic', 'unani', 'siddha', 'panchakarma', 'homeopathy', 'homoeopathy', 'traditional indian medicine'],
    title: /\b(ayurved\w*|unani|siddha|panchakarma|homoeopath\w*|homeopath\w*|traditional indian medicine|dravyaguna|rasashastra|charaka|sushruta)\b/i,
    topicNames: /ayurved|traditional|herbal|alternative|complementary|medicinal plant|phytochem|pharmacog|homeopath|homoeopath|yoga|integrative/i,
    fields: ['Medicine', 'Pharmacology, Toxicology and Pharmaceutics', 'Health Professions', 'Biochemistry, Genetics and Molecular Biology', 'Agricultural and Biological Sciences', 'Nursing'],
  },
  'Applied Sciences': {
    queries: ['applied sciences', 'applied science'],
    title: /\bapplied sciences?\b/i,
    topicNames: /applied science/i,
    fields: SCIENCE_FIELDS,
    lastResort: true,
  },
  'Multidisciplinary': {
    queries: ['interdisciplinary', 'multidisciplinary', 'transdisciplinary'],
    title: /\b(inter|multi|trans)-?disciplinary\b/i,
    topicNames: /interdisciplinary|multidisciplinary|transdisciplinary/i,
    fields: ['Multidisciplinary'],
    lastResort: true,
  },
  'Applied Mechanics': minRule('Applied Mechanics', /mechanics|vibration|elastic|fracture|stress|dynamics|finite element/i, ['Engineering', 'Physics and Astronomy', 'Materials Science', 'Mathematics', 'Earth and Planetary Sciences']),
  'Chemical Engineering': minRule('Chemical Engineering', /chemical engineering|process|reactor|reaction|catal|separation|membrane|polymer|petrochem|mass transfer/i, ['Chemical Engineering', 'Chemistry', 'Materials Science', 'Engineering', 'Energy', 'Environmental Science']),
  'Material Science': minRule('Material Science', /material|metal|alloy|ceramic|composite|crystal|polymer|coating|corrosion|thin film/i, ['Materials Science', 'Chemistry', 'Physics and Astronomy', 'Engineering', 'Chemical Engineering']),
  'Electrical Engineering': minRule('Electrical Engineering', /power|electric|grid|control|motor|machine|voltage|energy storage|photovoltaic/i, ['Engineering', 'Energy', 'Computer Science', 'Physics and Astronomy']),
  'Mechanical Engineering': minRule('Mechanical Engineering', /mechanic|thermodynamic|fluid|heat|manufactur|robot|machine|combustion|turbine|tribology|additive/i, ['Engineering', 'Materials Science', 'Energy', 'Physics and Astronomy', 'Computer Science']),
  'Electronics & Telecommunication Engineering': minRule('Electronics & Telecommunication Engineering', /electronic|wireless|communication|signal|antenna|circuit|semiconductor|5g|network|radar|embedded|vlsi/i, ['Engineering', 'Computer Science', 'Physics and Astronomy', 'Materials Science']),
  'Physiotherapy': minRule('Physiotherapy', /physio|physical therapy|rehabilit|kinesi|sports|exercise|musculoskeletal|movement/i, ['Health Professions', 'Medicine', 'Nursing']),
  'Architecture': minRule('Architecture', /architect|urban|building|design|landscape|interior|city|housing/i, ['Engineering', 'Arts and Humanities', 'Social Sciences', 'Environmental Science']),
  'Management': minRule('Management', /management|business|leadership|marketing|entrepreneur|organi[sz]ation|strategy|operations|supply chain|human resource/i, ['Business, Management and Accounting', 'Decision Sciences', 'Economics, Econometrics and Finance', 'Social Sciences']),
  'Civil / Construction Engineering': minRule('Civil / Construction Engineering', /civil|structur|concrete|geotech|bridge|construction|transport|hydraulic|water|pavement|building|seismic/i, ['Engineering', 'Environmental Science', 'Earth and Planetary Sciences', 'Materials Science', 'Energy']),
};

/**
 * OpenAlex's own subject taxonomy (a controlled classification, assigned by its model from the whole record) → the departments a book in that subfield may belong to.
 * It plays the part a controlled subject code plays in the book classifier: it is the first of the two agreeing families; the second is the classifier reading the
 * book's title and topic wording and naming the SAME department. Neither alone lists a book.
 */
export const SUBFIELD_DEPARTMENTS: Record<string, FillDepartment[]> = {
  'Electrical and Electronic Engineering': ['Electrical Engineering', 'Electronics & Telecommunication Engineering'],
  'Control and Systems Engineering': ['Electrical Engineering', 'Mechanical Engineering'],
  'Energy Engineering and Power Technology': ['Electrical Engineering'],
  'Signal Processing': ['Electronics & Telecommunication Engineering'], 'Computer Networks and Communications': ['Electronics & Telecommunication Engineering'],
  'Hardware and Architecture': ['Electronics & Telecommunication Engineering'], 'Instrumentation': ['Electronics & Telecommunication Engineering'],
  'Mechanical Engineering': ['Mechanical Engineering', 'Applied Mechanics'], 'Industrial and Manufacturing Engineering': ['Mechanical Engineering'],
  'Automotive Engineering': ['Mechanical Engineering'], 'Aerospace Engineering': ['Mechanical Engineering', 'Applied Mechanics'],
  'Mechanics of Materials': ['Applied Mechanics', 'Material Science'], 'Computational Mechanics': ['Applied Mechanics'],
  'Civil and Structural Engineering': ['Civil / Construction Engineering', 'Applied Mechanics'], 'Building and Construction': ['Civil / Construction Engineering'], 'Ocean Engineering': ['Civil / Construction Engineering'],
  'Materials Chemistry': ['Material Science'], 'Metals and Alloys': ['Material Science'], 'Polymers and Plastics': ['Material Science'], 'Ceramics and Composites': ['Material Science'],
  'Surfaces, Coatings and Films': ['Material Science'], 'Electronic, Optical and Magnetic Materials': ['Material Science'], 'General Materials Science': ['Material Science'], 'Biomaterials': ['Material Science'],
  'Architecture': ['Architecture'], 'Urban Studies': ['Architecture'],
  'Physical Therapy, Sports Therapy and Rehabilitation': ['Physiotherapy'], 'Orthopedics and Sports Medicine': ['Physiotherapy'], 'Rehabilitation': ['Physiotherapy'],
  'Strategy and Management': ['Management'], 'Organizational Behavior and Human Resource Management': ['Management'], 'Marketing': ['Management'], 'Management of Technology and Innovation': ['Management'],
  'Business and International Management': ['Management'], 'Management Science and Operations Research': ['Management'], 'Leadership and Management': ['Management'], 'Tourism, Leisure and Hospitality Management': ['Management'],
  'Fluid Flow and Transfer Processes': ['Chemical Engineering'], 'Catalysis': ['Chemical Engineering'], 'Process Chemistry and Technology': ['Chemical Engineering'], 'Filtration and Separation': ['Chemical Engineering'],
};

/** Whole books only: a chapter, a part or a serial issue is not a title to list. (Same shapes the book freeze holds.) */
export const CHAPTER_TITLE = /^\s*(chapter|ch\.|section|appendix)\s*[\dIVXLivxl]+\b|^\s*part\s+[\dIVXLivxl]+\b[\s:.\-–—]/i;
export const SERIAL_TITLE = /\b(journal of|research journal|working papers?|proceedings of|proceedings\b|conference on|annual report|investment report|financial report|yearbook|annual review|newsletter|bulletin)\b/i;

/**
 * Who published the record the licence is read from. A licence is only as good as the party that declared it: on a self-deposit repository (Zenodo, Figshare, OSF …)
 * anyone can upload anything, label it a "book" and type a licence, and the first run of this rule found exactly that (a promotional page, a notebook, single papers).
 * So the automatic rule lists a book only when its own record sits on a publisher / book platform / book series. A repository copy, a record with no identified
 * host, a thesis series and the bulk conference-volume publishers are HELD with that reason (the held list is the review list), never discarded.
 */
export const SELF_DEPOSIT_HOST = /zenodo|figshare|open science framework|\bosf\b|preprints?\b|ssrn|researchgate|academia\.edu|authorea|engrxiv|techrxiv|hal\b|archive\.org|internet archive/i;
export const HOLD_HOST = /primedia|scientific route|європейська наукова|book publisher international|linköping studies|dissertation/i;
export const NOT_A_BOOK_RAW_TYPE = /notebook|dataset|thesis|dissertation|report|preprint|article|conference|proceeding|software|image|presentation|poster/i;
export const BOOK_RAW_TYPE = /book|monograph|reference/i;
/** Conference volumes and abstract collections are not books (same reasoning as the proceedings rule in the book freeze). */
export const COLLECTION_TITLE = /\b(conference|congress|congresso|symposium|workshop|abstracts?|atti|actas|colloque|almanac|anthology|international scientific)\b/i;
/** OpenAlex marks some Italian, Spanish, German and French books as English; the title's own function words give them away. */
export const FOREIGN_TITLE = /\b(della|dell|degli|nella|delle|ricerca|terremoto|investigaci[oó]n|sobre|para|und|der|die|das|f[uü]r|des|les|dans|pour|avec|estudio|ingenier[ií]a)\b/i;
/** For the subject departments: a book about the history, culture or economics OF a material or a machine is not in that department. */
export const HUMANITIES_FIELD = /^(Arts and Humanities|Social Sciences|Psychology|Business, Management and Accounting|Economics, Econometrics and Finance|Decision Sciences)$/;
export const HUMANITIES_WORDS = /\b(histor\w*|archaeolog\w*|anthropolog\w*|sociolog\w*|philosoph\w*|cultur\w*|politic\w*|religio\w*|literature|conquest|colonial\w*|folklore|epistemic|scientia|renaissance|early modern|society|policy|planet)\b/i;
/** IntechOpen lists forthcoming volumes under a "[Working Title]"; there is no book yet. */
export const PLACEHOLDER_TITLE = /\[working title\]/i;
export const SELF_DEPOSIT_DOI_PREFIX = /^10\.(5281|6084|31219|17605|20944|2139|13140|31235|31224)$/;

const EN_WORDS = new Set('the of and in to for a an is are with on by from as that this its their into between through using how what why new'.split(' '));
const FOREIGN_WORDS = new Set(('de la el los las del y que para por con una uno em um uma os dos das nos na no und der die das den dem ein eine zur zum von mit auf im fuer et les des du dans pour sur au aux di il gli della dei delle nel nella per e ed che dan yang untuk dalam pada dengan dari ' +
  'w i na się oraz do jest nie jak z o proces podejmowania decyzji organizacjach teoria praktyka metodologi penelitian bisnis jejak universitas conoscere organizzazioni incubatori impresa progettando nuove antichi territori città estudos gestão gestión empresa desarrollo análisis administración').split(' '));
/** Is this text, judged by its function words and accents, not English? Titles and the start of the abstract; OpenAlex mislabels some Italian, Polish, Indonesian, Spanish and Portuguese books as English. */
export function looksNonEnglish(title: string, description?: string | null): boolean {
  const words = (t: string) => t.toLowerCase().normalize('NFC').split(/[^\p{L}']+/u).filter(Boolean);
  const score = (t: string) => { const w = words(t); let en = 0, fo = 0; for (const x of w) { if (EN_WORDS.has(x)) en++; if (FOREIGN_WORDS.has(x)) fo++; } return { en, fo, n: w.length }; };
  if (/[àèìòùąęłńśźżćãõñ]/i.test(title)) return true;                       // accents that English titles do not carry (café, naïve and the like are not in these)
  const t = score(title); if (t.fo >= 2 || (t.fo >= 1 && t.en === 0 && t.n >= 3)) return true;
  if (description) { const d = score(description.slice(0, 400)); if (d.fo >= 3 && d.fo > d.en) return true; }
  return false;
}
export const NUMBERED_HEADING = /^\s*\d+(\.\d+)+\s/;

/** OpenAlex's licence slug → the application's spelling, or null. Anything that is not a named Creative Commons licence or CC0 is not a licence here. */
export function licenceFromOpenAlex(slug?: string | null): string | null {
  const s = String(slug || '').trim().toLowerCase();
  if (!/^cc0$|^cc-by(-nc|-nd|-sa)*$/.test(s)) return null;                 // "other-oa", "public-domain", "publisher-specific-oa" are not recognised
  return canonicalLicence(s === 'cc0' ? 'CC0' : s.replace(/^cc-/, 'CC ').toUpperCase().replace(/-/g, ' '));
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const shortId = (id?: string | null) => String(id || '').replace(/^https?:\/\/openalex\.org\//, '') || null;

/** OpenAlex stores an abstract as {word: [positions]}; put it back in reading order. */
export function abstractOf(inv: Record<string, number[]> | null | undefined): string | null {
  if (!inv || typeof inv !== 'object') return null;
  const out: string[] = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos || []) out[p] = w;
  const t = out.filter(Boolean).join(' ').trim();
  return t ? stripTags(t).slice(0, 4000) : null;
}

/**
 * Do two author lists name the same first author? "Nico Cloete, Peter Maassen" and "Cloete, Nico" must agree (a surname and a given name in either order),
 * which the harvest's older key got wrong. A missing author on either side agrees: a title match with no author to contradict it is held as a twin.
 */
export function authorsCompatible(a?: string | null, b?: string | null): boolean {
  const toks = (s?: string | null) => new Set(String(s || '').split(/;|\band\b|\n/)[0].toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1));
  const x = toks(a), y = toks(b);
  if (!x.size || !y.size) return true;
  // "Nico Cloete, Peter Maassen": the first author is only the part before the comma when the comma separates people, so compare against every name in a comma list too.
  const all = (s: string) => new Set(s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1));
  const ax = all(String(a)), ay = all(String(b));
  const shared = [...x].filter(t => ay.has(t)).length + [...y].filter(t => ax.has(t)).length;
  return shared > 0;
}

export type FillCandidate = {
  book: NormalisedBook;
  /** Everything the rule judged, kept for the evidence file. */
  evidence: { openalexId: string; licenceSlug: string | null; licenceLocation: any; topics: string[]; fields: string[]; subfield?: string | null; query?: string };
};

/** One OpenAlex work → a candidate, or null when it is not even a book with a title. Rights are judged separately, in `judgeFill`. */
export function candidateFromOpenAlex(w: any, query?: string): FillCandidate | null {
  if (!w || w.type !== 'book') return null;
  const title = String(w.display_name || w.title || '').replace(/\s+/g, ' ').trim();
  const doi = normaliseDoi(w.doi);
  const id = shortId(w.id);
  if (!title || !id) return null;
  const loc = w.primary_location || null;
  // The licence must be declared on the book's own (primary) record, and that record must be open.
  const slug: string | null = loc?.is_oa && loc?.license ? String(loc.license) : null;
  const licence = licenceFromOpenAlex(slug);
  const landing: string | null = loc?.landing_page_url || (doi ? `https://doi.org/${doi}` : null);
  const authors = (Array.isArray(w.authorships) ? w.authorships : []).map((a: any) => String(a?.author?.display_name || '').trim()).filter(Boolean);
  const topics = [w.primary_topic, ...(Array.isArray(w.topics) ? w.topics.slice(0, 3) : [])].filter(Boolean);
  const topicNames = [...new Set(topics.map((t: any) => String(t.display_name || '')).filter(Boolean))] as string[];
  const fields = [...new Set(topics.map((t: any) => String(t.field?.display_name || '')).filter(Boolean))] as string[];
  const publisher = String(loc?.source?.host_organization_name || loc?.source?.display_name || '').trim() || null;
  const book: NormalisedBook = {
    provider: DEPT_FILL_SOURCE, sourceRecordId: id, title, authors: authors.slice(0, 10).join(', ') || null, editors: null,
    publisherName: publisher, year: Number.isInteger(w.publication_year) ? w.publication_year : null, doi, isbns: [],
    language: typeof w.language === 'string' ? w.language : null,
    description: abstractOf(w.abstract_inverted_index), subjects: topicNames, classifications: [], pages: null, lcc: [], edition: null, country: null,
    coverUrl: null, landingUrl: landing, externalUrl: landing, fileUrl: null,
    licence, licenceBasis: licence ? 'title' : 'none',
    modified: w.updated_date ?? null, deleted: false,
    extra: { openalexId: id, oaStatus: w.open_access?.oa_status ?? null, locationSource: loc?.source?.display_name ?? null, locationType: loc?.source?.type ?? null, version: loc?.version ?? null },
  };
  return { book, evidence: { openalexId: id, licenceSlug: slug, licenceLocation: loc ? { source: loc.source?.display_name ?? null, type: loc.source?.type ?? null, rawType: loc.raw_type ?? null, url: landing } : null, topics: topicNames, fields, subfield: w.primary_topic?.subfield?.display_name ?? null, query } };
}

export type FillVerdict = { department: FillDepartment | null; checks: string[]; reasons: string[] };

/**
 * Judge one candidate against every department's rule. A book is listed in a department only if that department's title word is in its title, the topic
 * agrees, and every general rule below holds. A title that names two of these departments is held (a person chooses), never guessed.
 */
export function judgeFill(c: FillCandidate, minYear: number, targets: readonly string[] = ALL_FILL_DEPARTMENTS): FillVerdict {
  const b = c.book, checks: string[] = [], reasons: string[] = [];
  const hits = DEPT_FILL_DEPARTMENTS.filter(d => FILL_RULES[d].title.test(b.title));
  if (hits.length > 1) return { department: null, checks, reasons: [`title_names_several_departments:${hits.join('+')}`] };
  let dept: FillDepartment;
  if (hits.length === 1) dept = hits[0];
  else {
    // The short-of-books subject departments: the classifier reads the title and the OpenAlex topic words and must name ONE of them, clearly ahead.
    const v = classifyDepartment({ classifications: b.classifications, subjects: b.subjects, title: b.title, description: b.description, lcc: b.lcc });
    const cand = v.suggested as FillDepartment | null;
    if (!cand || !(MIN_FILL_DEPARTMENTS as readonly string[]).includes(cand)) return { department: null, checks, reasons: ['title_has_no_department_word'] };
    const lead = v.score - (v.runnerUp?.score ?? 0);
    // Title word (+4) is the evidence; the OpenAlex topic / field agreement below is the second, independent family. So the bar is the classifier's REVIEW_MIN, not STRONG_MIN, with a real lead.
    if (v.score < REVIEW_MIN || lead < 1) return { department: null, checks, reasons: [`classifier_not_clear:${cand} ${v.score}/${lead}`] };
    const strongByCode = v.band === 'strong' && v.department === cand;          // the application's own rule: a controlled code AND the wording agree
    const viaSubfield = !FILL_RULES[cand].title.test(b.title);
    if (viaSubfield && strongByCode) checks.push('classifier:strong (code + wording)');
    else if (viaSubfield) {
      // No department word in the title: allowed only when OpenAlex's subfield maps to this department AND the classifier's own reading of the topic wording leads on it.
      if (!(SUBFIELD_DEPARTMENTS[String(c.evidence.subfield || '')] || []).includes(cand)) return { department: null, checks, reasons: ['title_has_no_department_word'] };
      if (!c.evidence.topics.some(t => FILL_RULES[cand].title.test(t))) return { department: null, checks, reasons: ['title_has_no_department_word'] };
    }
    dept = cand; checks.push(`classifier:${cand} ${v.score}/${lead}`); if (viaSubfield && !strongByCode) checks.push(`subfield:${c.evidence.subfield}+topic_wording`);
  }
  if (!targets.includes(dept)) return { department: null, checks, reasons: [`department_not_a_target:${dept}`] };
  const rule = FILL_RULES[dept];
  checks.push(`title:${dept}`);
  if ((ENGINEERING_FILL_DEPARTMENTS as readonly string[]).includes(dept)) {
    if (c.evidence.fields[0] && HUMANITIES_FIELD.test(c.evidence.fields[0])) return { department: null, checks, reasons: [`field_outside_the_department:${c.evidence.fields[0]}`] };
    if (HUMANITIES_WORDS.test(b.title) || c.evidence.topics.some(t => HUMANITIES_WORDS.test(t))) return { department: null, checks, reasons: ['humanities_wording'] };
  }

  const topicAgrees = c.evidence.topics.some(t => rule.topicNames.test(t)) || c.evidence.fields.some(f => rule.fields.includes(f));
  if (!topicAgrees) reasons.push(`topic_disagrees:${c.evidence.topics[0] || 'none'}/${c.evidence.fields[0] || 'none'}`); else checks.push('topic:agrees');

  if (!b.licence) reasons.push(c.evidence.licenceSlug ? `licence_not_recognised:${c.evidence.licenceSlug}` : 'no_licence_on_own_record'); else checks.push(`licence:${b.licence}`);
  if (!b.doi && !b.isbns.length && !(b.provider !== DEPT_FILL_SOURCE && b.sourceRecordId)) reasons.push('no_doi'); else checks.push('identity');
  if (!/^(en|eng|english)$/i.test(String(b.language || ''))) reasons.push(`language_not_english:${b.language || 'none'}`);
  else if (FOREIGN_TITLE.test(b.title) || looksNonEnglish(b.title, b.description)) reasons.push('language_not_english:text');
  else checks.push('language:english');
  if (b.year == null) reasons.push('no_year'); else if (b.year < minYear) reasons.push(`year_before_policy:${b.year}`); else checks.push('year');
  if (PLACEHOLDER_TITLE.test(b.title)) reasons.push('not_published_yet:working_title');
  else if (NUMBERED_HEADING.test(b.title)) reasons.push('not_a_whole_book:numbered_heading');
  else if (CHAPTER_TITLE.test(b.title)) reasons.push('not_a_whole_book:chapter_or_part');
  else if (SERIAL_TITLE.test(b.title) || COLLECTION_TITLE.test(b.title)) reasons.push('not_a_whole_book:serial_or_proceedings');
  // A proceedings volume published as a "book" often names the conference as its author and not in its title.
  else if (COLLECTION_TITLE.test(String(b.authors || '').split(',')[0])) reasons.push('not_a_whole_book:conference_as_author');
  else checks.push('whole_book');
  // Who declared the licence: a publisher / book platform, not a self-deposit repository or an unidentified host.
  const loc = c.evidence.licenceLocation, host = String(loc?.source || ''), hostType = String(loc?.type || ''), raw = String(loc?.rawType || '');
  if (!loc) reasons.push('no_host_record');
  else if (hostType === 'repository' || SELF_DEPOSIT_HOST.test(host) || SELF_DEPOSIT_DOI_PREFIX.test(String(b.doi || '').split('/')[0])) reasons.push(`self_deposit_repository:${host || 'unnamed'}`);
  else if (!hostType || !host) reasons.push('host_not_identified');
  else if (HOLD_HOST.test(host)) reasons.push(`host_held_for_a_person:${host.slice(0, 40)}`);
  else if (NOT_A_BOOK_RAW_TYPE.test(raw) || (raw && !BOOK_RAW_TYPE.test(raw))) reasons.push(`record_type_not_book:${raw}`);
  else checks.push(`host:${hostType}`);
  if (!b.externalUrl) reasons.push('no_address'); else checks.push('address');

  if (rule.lastResort) {
    // Applied Sciences / Multidisciplinary: held when the ordinary classifier sees a real subject in the book.
    const v = classifyDepartment({ subjects: b.subjects, title: b.title, description: b.description });
    const generic = new Set(['Applied Sciences', 'Science', 'Multidisciplinary']);
    const claimed = v.band === 'strong' && v.department && !generic.has(v.department) ? v.department
      : v.suggested && !generic.has(v.suggested) && v.score >= REVIEW_MIN ? v.suggested : null;
    if (claimed) reasons.push(`claimed_by_other_department:${claimed}`); else checks.push('no_other_department_claims_it');
  }
  return { department: reasons.length ? null : dept, checks, reasons };
}

/** The Book row, in the shape the harvest writes (see oaiHarvest.bookRow). Only a book `judgeFill` accepted should be given here. */
export function fillRow(c: FillCandidate, department: FillDepartment, verdict: FillVerdict, when = new Date()) {
  const b = c.book;
  const a = judgeBookAccess({ licence: b.licence, externalUrl: b.externalUrl, landingUrl: b.landingUrl });
  const where = b.extra?.locationSource ? ` — ${b.extra.locationSource}` : '';
  return {
    title: b.title, authors: b.authors, publisherName: b.publisherName, isbn: b.isbns[0] || null, doi: b.doi, year: b.year, pages: null, edition: null,
    subject: b.subjects[0] || null, domain: department, language: 'en', country: null, description: b.description, coverUrl: null, pdfUrl: null,
    accessType: 'OpenAccess', status: 'Published' as const,
    licence: b.licence, licenceIsNC: !licenceAllowsCommercialUse(b.licence),
    rightsBasis: b.provider === DEPT_FILL_SOURCE ? `OpenAlex record licence (${c.evidence.licenceSlug}, declared on the book's own open-access record${where})` : `${b.provider} title licence`,
    rightsVerifiedAt: when, rightsVerifiedBy: 'ingestion', rightsStatus: a.rightsStatus, accessStatus: a.accessStatus,
    originalUrl: b.externalUrl || b.landingUrl, rightsHolder: b.publisherName, source: b.provider, sourceRecordId: b.sourceRecordId,
    ownershipSource: 'Ingested', rejectionNote: null, lastIngestedAt: when, fingerprint: bookFingerprint(b),
    metadata: {
      harvest: {
        via: b.provider === DEPT_FILL_SOURCE ? 'OpenAlex works (type=book, open access)' : `${b.provider} (curated open textbook directory)`, landingUrl: b.landingUrl, classifications: [], keywords: b.subjects,
        department: { band: 'strong', rule: 'dept-fill:title+topic+licence', checks: verdict.checks, topics: c.evidence.topics, fields: c.evidence.fields, query: c.evidence.query ?? null },
        licenceBasis: 'title', access: a.access, accessReason: a.reason, provider: b.extra, file: null,
      },
    },
  };
}
