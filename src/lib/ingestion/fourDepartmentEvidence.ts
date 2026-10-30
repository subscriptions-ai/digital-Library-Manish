/**
 * Evidence rules for PREPARING (never applying) a move of existing records into the four departments added 2026-10-30:
 * Radiology, Optometry & Ophthalmology, Medical Laboratory Technology and Paramedical Sciences.
 *
 * Nothing here is imported by an ingestion engine, a route or a screen. Those four departments stay out of automatic ingestion
 * (`autoIngestion: false`) until rules like these have been checked against reviewed examples and approved. This module only reads
 * records that were exported read-only and says, for each one, what the evidence supports.
 *
 * What counts as evidence, and what does not:
 *   - A proposal needs TWO independent families to agree: a NARROW controlled code and a controlled subject term. A title word is
 *     recorded as support but is never one of the two, and a title alone never proposes anything.
 *   - Narrow codes only: an NLM class that names the field (WN radiology, WW ophthalmology, QY clinical pathology). The broad schemes
 *     (LCC "R", "RC", DDC 610, THEMA/BIC medicine headings) say "medicine" and nothing more, so they are not evidence for any of the four.
 *   - Controlled subject terms are whole MeSH descriptors or whole DOAJ subject labels, matched as a whole, not as a substring.
 *   - Evidence for two departments at once, or for a department the record already belongs to by a specific code (Dental, Nursing, …), is
 *     a conflict, and a conflict is held, not resolved by choosing.
 *   - Paramedical Sciences has no narrow controlled vocabulary in any source we hold, so nothing is ever proposed for it.
 *
 * Access: a department is also the unit of entitlement, and a record has exactly one. Moving a PUBLIC record out of its department takes
 * it away from everyone who reads that department, and no mechanism exists that keeps their access (no second department per record,
 * no alias between departments). Such a move is HELD for as long as that is so. A record that is not public, or has no department, can
 * be re-filed without changing who can read anything today.
 */

export const TARGETS = ['Radiology', 'Optometry & Ophthalmology', 'Medical Laboratory Technology', 'Paramedical Sciences'] as const;
export type Target = (typeof TARGETS)[number];
type Evidenced = Exclude<Target, 'Paramedical Sciences'>;

/** True only if the library gains a way to keep a reader's access to a record that moves department. It has none today. */
export const ACCESS_PRESERVATION_MECHANISM = false;

const NLM_CLASS: Record<string, Evidenced> = { WN: 'Radiology', WW: 'Optometry & Ophthalmology', QY: 'Medical Laboratory Technology' };

const MESH: Record<Evidenced, string[]> = {
  'Radiology': ['Radiology', 'Radiography', 'Diagnostic Imaging', 'Magnetic Resonance Imaging', 'Tomography, X-Ray Computed', 'Ultrasonography', 'Radiology, Interventional',
    'Radionuclide Imaging', 'Nuclear Medicine', 'Mammography', 'Radiographic Image Interpretation, Computer-Assisted', 'Radiology Information Systems'],
  'Optometry & Ophthalmology': ['Ophthalmology', 'Eye Diseases', 'Optometry', 'Vision Disorders', 'Refractive Errors', 'Retinal Diseases', 'Glaucoma', 'Cataract', 'Corneal Diseases',
    'Ophthalmologic Surgical Procedures', 'Contact Lenses', 'Eyeglasses', 'Orthoptics'],
  'Medical Laboratory Technology': ['Clinical Laboratory Techniques', 'Pathology, Clinical', 'Hematologic Tests', 'Clinical Chemistry Tests', 'Blood Specimen Collection',
    'Specimen Handling', 'Clinical Laboratory Services', 'Medical Laboratory Science'],
};

/** Descriptors that look like these fields but belong to another department. Seeing one beside the evidence makes the record ambiguous. */
const OTHER_DEPARTMENT_TERMS: { dept: string; re: RegExp }[] = [
  { dept: 'Dental', re: /\b(dental|dentistry|oral|periodont\w*|endodont\w*|orthodont\w*|teeth|tooth)\b/i },
  { dept: 'Nursing', re: /\bnursing\b/i },
  { dept: 'Pharmacy', re: /\b(pharmac\w*|drug therapy)\b/i },
  { dept: 'Physiotherapy', re: /\b(physical therapy|physiotherap\w*|rehabilitation)\b/i },
  { dept: 'Agriculture', re: /\b(veterinary|animals?)\b/i },
  { dept: 'Computer / IT', re: /\b(computer vision|pattern recognition|neural network\w*)\b/i },
];

/** Journal subject labels (DOAJ's LCC labels, OpenAlex topics) that name the field narrowly. */
const JOURNAL_LABEL: Record<Evidenced, RegExp[]> = {
  'Radiology': [/^medicine:.*\bmedical radiology\b/i, /^radiology\b/i, /\bdiagnostic imaging\b/i, /\bradiography\b/i, /\bnuclear medicine\b/i],
  'Optometry & Ophthalmology': [/^medicine: ophthalmology$/i, /^ophthalmology\b/i, /\boptometry\b/i, /\beye diseases\b/i, /\bvision disorders\b/i],
  'Medical Laboratory Technology': [/\bmedical laborator\w+/i, /\bclinical laborator\w+/i, /\blaboratory medicine\b/i, /\bclinical chemistry\b/i],
};
const JOURNAL_TITLE: Record<Evidenced, RegExp> = {
  'Radiology': /\b(radiolog\w*|radiograph\w*|medical imaging|sonograph\w*|ultrasound)\b/i,
  'Optometry & Ophthalmology': /\b(ophthalm\w*|optometr\w*|orthopt\w*|retina\w*|cornea\w*|glaucoma|ocular)\b/i,
  'Medical Laboratory Technology': /\b(medical laborator\w*|clinical laborator\w*|laboratory medicine|medical technolog\w*)\b/i,
};
/** Title words that mean "this is about something else", in the same sense as OTHER_DEPARTMENT_TERMS. */
const TITLE_BAN = /\b(dental|dentistry|oral|computer vision|veterinary|animal)\b/i;

export type Verdict = 'propose' | 'hold';
export type Judgement = {
  verdict: Verdict;
  proposed: Target | null;
  /** Which independent families agreed, by name. A title never appears here. */
  evidence: string[];
  /** Support that is recorded but never counted. */
  support: string[];
  conflicts: string[];
  reason: string;
};

const whole = (s: unknown) => String(s ?? '').trim().toLowerCase();
const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x ?? '')) : typeof v === 'string' && v ? [v] : []);

export type BookRecord = { id: string; title?: string | null; domain?: string | null; status?: string | null; subject?: string | null; source?: string | null; kw?: unknown; nlm?: unknown };
export type JournalRecord = { id: string; title?: string | null; domain?: string | null; status?: string | null; subject?: string | null; subjects?: unknown };

const SPECIFIC_OTHER = new Set(['Dental', 'Nursing', 'Pharmacy', 'Physiotherapy', 'Ayurveda']);
const placedElsewhere = (domain?: string | null) => !!domain && SPECIFIC_OTHER.has(domain);

function decide(evidenceBy: Map<Evidenced, string[]>, support: string[], conflicts: string[], domain: string | null | undefined, kind: string): Judgement {
  const depts = [...evidenceBy.keys()];
  const full = depts.filter(d => (evidenceBy.get(d) || []).length >= 2);
  if (!depts.length) return { verdict: 'hold', proposed: null, evidence: [], support, conflicts, reason: `no narrow ${kind} evidence for any of the four departments` };
  if (depts.length > 1) return { verdict: 'hold', proposed: null, evidence: depts.flatMap(d => evidenceBy.get(d) || []), support, conflicts: [...conflicts, `evidence for ${depts.join(' and ')}`], reason: 'evidence points to more than one department' };
  const d = depts[0], fam = evidenceBy.get(d) || [];
  if (fam.length < 2) return { verdict: 'hold', proposed: null, evidence: fam, support, conflicts, reason: `one family of evidence only (${fam[0]}); two independent ones are required` };
  if (conflicts.length) return { verdict: 'hold', proposed: null, evidence: fam, support, conflicts, reason: `ambiguous: ${conflicts.join('; ')}` };
  if (placedElsewhere(domain)) return { verdict: 'hold', proposed: null, evidence: fam, support, conflicts: [`already filed under ${domain}`], reason: `already filed under ${domain}, a specific department; a person decides` };
  if (full.length !== 1) return { verdict: 'hold', proposed: null, evidence: fam, support, conflicts, reason: 'no single department' };
  return { verdict: 'propose', proposed: d, evidence: fam, support, conflicts, reason: `${fam.join(' + ')} agree on ${d}` };
}

export function judgeBook(b: BookRecord): Judgement {
  const evidence = new Map<Evidenced, string[]>(), support: string[] = [], conflicts: string[] = [];
  const add = (d: Evidenced, f: string) => { const a = evidence.get(d) || []; if (!a.includes(f)) a.push(f); evidence.set(d, a); };
  for (const c of asArray(b.nlm)) { const m = /^\s*([A-Z]{1,3})\s*\d/.exec(c); if (m && NLM_CLASS[m[1]]) add(NLM_CLASS[m[1]], `NLM class ${m[1]}`); }
  const terms = [...asArray(b.kw), ...(b.subject && whole(b.subject) !== 'none' ? [String(b.subject)] : [])].map(whole);
  for (const d of Object.keys(MESH) as Evidenced[]) if (MESH[d].some(t => terms.includes(whole(t)))) add(d, 'MeSH subject');
  // Dental radiography is Dental's even though it is radiography.
  const otherTerms = [...terms, whole(b.title)].join(' | ');
  for (const o of OTHER_DEPARTMENT_TERMS) if (o.re.test(otherTerms) && evidence.size) conflicts.push(`also reads as ${o.dept}`);
  for (const d of Object.keys(JOURNAL_TITLE) as Evidenced[]) if (JOURNAL_TITLE[d].test(String(b.title ?? ''))) support.push(`title words (${d}) — recorded, not counted`);
  return decide(evidence, support, [...new Set(conflicts)], b.domain, 'code and subject');
}

export function judgeJournal(j: JournalRecord): Judgement {
  const evidence = new Map<Evidenced, string[]>(), support: string[] = [], conflicts: string[] = [];
  const add = (d: Evidenced, f: string) => { const a = evidence.get(d) || []; if (!a.includes(f)) a.push(f); evidence.set(d, a); };
  const labels = [...asArray(j.subjects), ...(j.subject && whole(j.subject) !== 'none' ? [String(j.subject)] : [])];
  for (const d of Object.keys(JOURNAL_LABEL) as Evidenced[]) if (labels.some(l => JOURNAL_LABEL[d].some(re => re.test(l)))) add(d, 'subject label');
  const title = String(j.title ?? '');
  // A journal's second family is its own title, because journals carry no second controlled code. It counts here, and only here, and only
  // beside a subject label that already names the field; a title with no label never proposes (decide() needs two families).
  for (const d of Object.keys(JOURNAL_TITLE) as Evidenced[]) if (evidence.has(d) && JOURNAL_TITLE[d].test(title) && !TITLE_BAN.test(title)) add(d, 'title names the field');
  for (const o of OTHER_DEPARTMENT_TERMS) if (evidence.size && (labels.some(l => o.re.test(l)) || o.re.test(title))) conflicts.push(`also reads as ${o.dept}`);
  return decide(evidence, support, [...new Set(conflicts)], j.domain, 'subject label and title');
}

const PUBLIC_JOURNAL = new Set(['Accepted', 'MetadataOnly']);
export type AccessEffect = { public: boolean; unassigned: boolean; changes: boolean; needsPreservation: boolean; note: string };
/** What re-filing this record would do to who can read it today. */
export function accessEffect(kind: 'book' | 'journal', r: { domain?: string | null; status?: string | null }): AccessEffect {
  const pub = kind === 'book' ? r.status === 'Published' : PUBLIC_JOURNAL.has(String(r.status));
  const unassigned = !r.domain;
  if (!pub) return { public: false, unassigned, changes: false, needsPreservation: false, note: 'not public: nobody reads it today, so re-filing changes no one’s access' };
  if (unassigned) return { public: true, unassigned, changes: false, needsPreservation: false, note: 'public with no department: only staff can open it today; re-filing opens it to the new department’s readers (an addition, not a loss)' };
  return { public: true, unassigned, changes: true, needsPreservation: !ACCESS_PRESERVATION_MECHANISM, note: `public in ${r.domain}: its readers (plans and free-preview accounts that name ${r.domain}) would lose it, and no mechanism keeps their access` };
}

export type ManifestRow = {
  kind: 'book' | 'journal'; id: string; title: string; currentDepartment: string | null; status: string | null;
  decision: 'ready' | 'held-access' | 'held-ambiguous';
  proposedDepartment: Target | null; evidence: string[]; support: string[]; conflicts: string[]; reason: string; accessNote: string;
};

/** One row per record: `ready` (evidence supports it and no one's access changes), `held-access` (evidence supports it, access would change), or `held-ambiguous`. */
export function manifestRow(kind: 'book' | 'journal', r: BookRecord & JournalRecord): ManifestRow {
  const j = kind === 'book' ? judgeBook(r) : judgeJournal(r);
  const eff = accessEffect(kind, r);
  const decision: ManifestRow['decision'] = j.verdict !== 'propose' ? 'held-ambiguous' : eff.needsPreservation ? 'held-access' : 'ready';
  return { kind, id: r.id, title: String(r.title ?? ''), currentDepartment: r.domain ?? null, status: r.status ?? null, decision, proposedDepartment: j.proposed,
    evidence: j.evidence, support: j.support, conflicts: j.conflicts, reason: j.verdict === 'propose' && decision === 'held-access' ? `${j.reason}; HELD: ${eff.note}` : j.reason, accessNote: eff.note };
}
