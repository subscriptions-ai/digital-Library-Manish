/**
 * Medical Laboratory Technology: department evidence rules for JOURNALS (Phase B). Pure functions, no I/O, no database, no network.
 * Shared by the Phase A audit (existing rows, never moved) and the candidate classifier (net-new rows).
 *
 * Principle (same as the earlier department runs): a journal is MLT only when TWO DIFFERENT KINDS of evidence agree, and nothing in the exclusion list applies.
 *   kinds:  title    a narrow term that names the field itself (not "pathology" in general: plant/veterinary/forensic are excluded below)
 *           topics   the share of the journal's own works that OpenAlex files under laboratory-specific topics
 *           catalogue NLM Catalog subject headings (clinical pathology, blood banks, clinical chemistry ...) matched whole
 *           label    DOAJ / LCC label when the row is already held (Phase A only)
 * Weak terms (laboratory, diagnosis, blood, microbiology, biochemistry ...) are never evidence on their own: they are what general biology also says.
 */

export const norm = (s: unknown) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

// ── Title: terms that name the field ───────────────────────────────────────────────────────────────────────────────
/** Unambiguous: a journal titled this way is about laboratory medicine / laboratory science. */
export const TITLE_NARROW = new RegExp(
  '\\b(' + [
    'clinical (laborator\\w*|chemistry|biochemistry|pathology|cytology|immunology and laborator\\w*)',
    'medical (laborator\\w*|technolog(?:y|ist)s? in laborator\\w*)', 'biomedical laborator\\w*',
    'laboratory (medicine|hematolog\\w*|haematolog\\w*|diagnos\\w*|science|sciences|haematology|investigation\\w*|technolog\\w*|quality|management)',
    'laboratory and diagnostic\\w*', 'diagnostic (laborator\\w*|cytopathology)',
    'blood bank\\w*', 'transfus\\w*', 'immunohaematolog\\w*', 'immunohematolog\\w*', 'haemovigilance', 'hemovigilance',
    'cytopatholog\\w*', 'cytodiagnos\\w*', 'cytolog\\w*', 'histotechnolog\\w*',
    'pathology laboratory',
    'phlebotom\\w*', 'point[- ]of[- ]care (testing|diagnos\\w*|tests?)', 'laboratory automation (?:in|for) (?:clinical|medical)',
    'medical technolog(?:y|ists?) (?:science|sciences|laborator\\w*)', 'jurnal (teknologi laboratorium|analis kesehatan|ilmu laboratorium)', 'teknologi laboratorium (medis|kesehatan)',
    'analis kesehatan', 'biomedical sciences? (?:laborator\\w*)', 'clinical cytometry', 'clinical (?:and|&) laboratory',
  ].join('|') + ')\\b', 'i');
/** Anatomic / surgical pathology and diagnostic microbiology: real parts of laboratory medicine, but also whole physician specialties whose journals are mostly about tumours or infections.
 *  A title like this counts only when the journal's own works include laboratory-practice topics (>= 15% laboratory-specific), never with a catalogue heading alone. */
export const TITLE_ANATOMIC_MICRO = /\b((anatomic|anatomical|surgical|molecular|digital|diagnostic) pathology|histopatholog\w*|pathology (research and practice|informatics)|clinical (microbiology|virology)|diagnostic microbiology|histology and histopathology)\b/i;
/** Hematology / coagulation: lab-dominated, but oncology and transplantation titles belong to Medical Sciences. Needs topic or catalogue support (never title alone). */
export const TITLE_HEMATOLOGY = /\b(haematolog\w*|hematolog\w*|haemostasis|hemostasis|coagulation|thrombosis and (haemostasis|hemostasis)|haemophilia|hemophilia)\b/i;
export const TITLE_HEMATOLOGY_ONCO = /\b(oncolog\w*|leuk[a]?emia\w*|lymphoma\w*|myeloma|cancer|transplant\w*|stem cell\w*|neoplas\w*|malignan\w*|tumou?r\w*)\b/i;
/** Bare "Pathology" journals (human diagnostic pathology): accepted only as the whole title or "<X> Pathology" with a human-medicine word, never plant/vet/forensic. */
export const TITLE_PATHOLOGY_BARE = /^(pathology|the journal of pathology|journal of pathology|international journal of surgical pathology|human pathology|modern pathology|annals of diagnostic pathology|american journal of clinical pathology|journal of clinical pathology|pathology international|pathology research and practice|virchows archiv|histopathology)(\b.*)?$/i;
/** Words that appear in laboratory titles and in everything else: NEVER evidence on their own. */
export const TITLE_WEAK = /\b(laborator\w*|diagnos\w*|patholog\w*|blood|haem\w*|hem[ao]\w*|microbiolog\w*|biochem\w*|serolog\w*|immunolog\w*|assay\w*|biomarker\w*|infectious|parasit\w*|mycolog\w*|virolog\w*|bacteriolog\w*|urin\w*|biomedical)\b/i;

// ── What it is NOT ─────────────────────────────────────────────────────────────────────────────────────────────────
export const EXCLUDE: [string, RegExp][] = [
  ['plant / agriculture / environment / food', /\b(plant|plants|phyto\w*|crop\w*|agricultur\w*|agronom\w*|soil|forest\w*|horticultur\w*|seed|fung(?:al|i)\b.*(?:plant)|food|dairy|water|wastewater|marine|aquatic|aquacultur\w*|fisher\w*|environmental|ecolog\w*|botan\w*)\b/i],
  ['veterinary / animal', /\b(veterinar\w*|animal\w*|canine|equine|bovine|poultry|livestock|zoonos\w*|fish|avian|wildlife|laboratory animal\w*)\b/i],
  ['forensic-only', /\b(forensic\w*|medico.?legal|legal medicine|toxicolog\w*)\b/i],
  ['dental / oral (Dental owns it)', /\b(dental|dentistry|oral|endodont\w*|periodont\w*|orthodont\w*|stomatolog\w*)\b/i],
  ['eye (Optometry & Ophthalmology owns it)', /\b(ophthalm\w*|optometr\w*|retina\w*|cornea\w*|glaucoma)\b/i],
  ['engineering / materials / physics / industrial (never MLT, even with a laboratory word)', /\b(physics|engineering|materials?|industrial|sensors?|electro\w*|nano\w*|computer\w*|robotics|machine learning|artificial intelligence|biophysic\w*|national laboratory|propulsion laboratory|metallurg\w*|mining|geolog\w*)\b/i],
  ['general (non-clinical) biology / chemistry', /\b(molecular biology|cell biology|microbial biotechnolog\w*|applied microbiology|industrial microbiology|general microbiology|biochemical engineering|analytical chemistry|chemistry|chemical|genomic\w*|proteomic\w*|metabolomic\w*|bioinformatic\w*|biotechnolog\w*|plant)\b/i],
  ['pharmacy / pharmacology / drug discovery', /\b(pharmac\w*|drug\w*|medicinal|therapeutic\w*|toxicity)\b/i],
  ['clinical specialities that merely mention a test', /\b(surgery|surgical (?!pathology)|nursing|midwifery|obstetric\w*|gynae\w*|gynec\w*|cardio\w*|neuro(?!patholog)\w*|psychiatr\w*|dermatolog\w*|orthop\w*|paediatric\w*|pediatric\w*|oncology|cancer|radiolog\w*|anesthe\w*|anaesthe\w*|rehabilitation|physiotherapy|physical therapy|nutrition|dietetic\w*|public health|epidemiolog\w*|health policy|health economics)\b/i],
  ['humanities / social / education', /\b(history|ethic\w*|law|education|social|management|economics|policy|philosoph\w*|religio\w*|literature|language)\b/i],
  ['non-English-script or magazine/news/proceedings', /\b(proceedings|conference|symposium|newsletter|magazine|bulletin of the|annual report|transactions of)\b/i],
];
/** Exclusions that do NOT apply when the title itself carries a narrow MLT term (e.g. "Clinical Chemistry and Laboratory Medicine" mentions chemistry). */
export const EXCLUDE_SOFT = new Set(['general (non-clinical) biology / chemistry', 'clinical specialities that merely mention a test', 'pharmacy / pharmacology / drug discovery', 'humanities / social / education']);

// ── OpenAlex topics ────────────────────────────────────────────────────────────────────────────────────────────────
/** Laboratory-SPECIFIC topics (their works are about doing laboratory tests / transfusion practice). Ids are OpenAlex topic ids; names are matched too in case ids are absent. */
export const TOPIC_CORE_NAMES = new Set([
  'clinical laboratory practices and quality control', 'bacterial identification and susceptibility testing', 'blood groups and transfusion', 'blood transfusion and management',
  'blood donation and transfusion practices', 'digital imaging for blood diseases', 'sars-cov-2 detection and testing',
].map(norm));
/** Hematology-adjacent topics: they count only when the title carries a hematology term (clinical hematology otherwise belongs to Medical Sciences). */
export const TOPIC_HEMA_NAMES = new Set([
  'platelet disorders and treatments', 'hemophilia treatment and research', 'hemoglobinopathies and related disorders', 'erythropoietin and anemia treatment', 'iron metabolism and disorders',
  'hemostasis and retained surgical items', 'syphilis diagnosis and treatment', 'blood coagulation and thrombosis mechanisms',
].map(norm));

export type Topic = { name: string; count: number; subfield?: string | null; field?: string | null };
export function topicEvidence(topics: Topic[]) {
  const total = topics.reduce((a, t) => a + (t.count || 0), 0) || 0;
  let core = 0, hema = 0; const coreNames: string[] = [], hemaNames: string[] = [];
  for (const t of topics) {
    const n = norm(t.name);
    if (TOPIC_CORE_NAMES.has(n)) { core += t.count || 0; coreNames.push(t.name); }
    else if (TOPIC_HEMA_NAMES.has(n)) { hema += t.count || 0; hemaNames.push(t.name); }
  }
  return { total, coreShare: total ? core / total : 0, hemaShare: total ? hema / total : 0, coreNames, hemaNames };
}

// ── NLM Catalog subject headings (matched whole) ───────────────────────────────────────────────────────────────────
/** Narrow headings: the NLM indexer put the journal under laboratory practice / transfusion / clinical pathology. */
export const NLM_NARROW = new Set(['pathology, clinical', 'pathology, surgical', 'blood banks', 'blood transfusion', 'blood coagulation tests', 'chemistry, clinical', 'clinical laboratory techniques', 'clinical chemistry tests',
  'cytodiagnosis', 'histological techniques', 'point-of-care testing', 'hematologic tests', 'immunohematology', 'medical laboratory science', 'phlebotomy'].map(norm));
/** Broad headings (a whole specialty; supportive only, never enough alone). */
export const NLM_BROAD = new Set(['pathology', 'hematology', 'cytology', 'histology', 'diagnostic techniques and procedures', 'laboratory techniques and procedures', 'microbiological techniques', 'parasitology', 'mycology', 'bacteriological techniques'].map(norm));

// ── Decision ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type Evidence = { title: string; topics?: Topic[]; nlmSubjects?: string[]; labels?: string[]; publisher?: string | null };
export type Decision = { include: boolean; tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'EXCLUDED' | 'NONE'; kinds: string[]; reason: string; excludedAs?: string; topicCoreShare?: number };

export function decide(e: Evidence): Decision {
  const title = e.title || '';
  const anatomicTitle = TITLE_ANATOMIC_MICRO.test(title) || (TITLE_PATHOLOGY_BARE.test(norm(title)) && !TITLE_NARROW.test(title));
  const labTitle = TITLE_NARROW.test(title);
  const te0 = topicEvidence(e.topics || []);
  const narrowTitle = labTitle || (anatomicTitle && te0.coreShare >= 0.15);
  const hemaTitle = TITLE_HEMATOLOGY.test(title) && !TITLE_HEMATOLOGY_ONCO.test(title);
  const te = topicEvidence(e.topics || []);
  const nlm = (e.nlmSubjects || []).map(norm);
  const nlmNarrow = nlm.some(s => NLM_NARROW.has(s)), nlmBroad = nlm.some(s => NLM_BROAD.has(s));
  const labelNarrow = (e.labels || []).some(l => /medical laboratory|clinical pathology|laboratory medicine|pathology \(clinical\)|hematolog|blood transfusion|clinical chemistry/i.test(l));

  const labelBroad = (e.labels || []).some(l => /medicine: pathology|^pathology$|medicine: .*hematolog/i.test(l));
  const kinds: string[] = [];
  if (narrowTitle) kinds.push('title: narrow term'); else if (hemaTitle) kinds.push('title: hematology term');
  if (te.coreShare >= 0.30) kinds.push(`topics: ${Math.round(te.coreShare * 100)}% laboratory-specific`);
  else if (te.coreShare >= 0.12) kinds.push(`topics: ${Math.round(te.coreShare * 100)}% (supportive)`);
  if (hemaTitle && te.coreShare + te.hemaShare >= 0.25) kinds.push(`topics: ${Math.round((te.coreShare + te.hemaShare) * 100)}% hematology/laboratory`);
  if (nlmNarrow) kinds.push('catalogue: NLM narrow heading'); else if (nlmBroad) kinds.push('catalogue: NLM broad heading (supportive)');
  if (labelNarrow) kinds.push('label: laboratory / pathology'); else if (labelBroad) kinds.push('label: LCC Pathology (supportive)');

  const ex = EXCLUDE.find(([name, re]) => re.test(title) && !(narrowTitle && EXCLUDE_SOFT.has(name)));
  // Topic-side exclusions: the journal's own works are mostly something else.
  const text = `${title} ${(e.topics || []).slice(0, 3).map(t => t.name).join(' ')}`;
  const common = { kinds, topicCoreShare: Math.round(te.coreShare * 100) / 100 };
  if (!kinds.length) return { include: false, tier: 'NONE', reason: 'no evidence', ...common };
  if (ex) return { include: false, tier: 'EXCLUDED', reason: `excluded: ${ex[0]}`, excludedAs: ex[0], ...common };

  // Kinds that count as independent evidence (supportive-only kinds do not).
  // Clinical hematology (leukaemia, anaemia, haemophilia care) belongs to Medical Sciences: a hematology title counts only with laboratory-specific works or a narrow catalogue heading.
  const strongTitle = narrowTitle || (hemaTitle && (te.coreShare >= 0.25 || nlmNarrow));
  const strongTopics = te.coreShare >= 0.30;
  const supportTopics = te.coreShare >= 0.12;
  const strongCatalogue = nlmNarrow, supportCatalogue = nlmNarrow || nlmBroad || labelBroad;

  // HIGH: two different strong kinds, or one strong kind plus a supportive one of another kind.
  const strongKinds = [strongTitle, strongTopics, strongCatalogue, labelNarrow].filter(Boolean).length;
  const supportKinds = [strongTitle, supportTopics, supportCatalogue, labelNarrow].filter(Boolean).length;
  if (strongKinds >= 2) return { include: true, tier: 'HIGH', reason: 'two strong kinds agree', ...common };
  if (strongKinds === 1 && supportKinds >= 2) return { include: true, tier: 'MEDIUM', reason: 'one strong kind plus a supportive kind', ...common };
  return { include: false, tier: 'LOW', reason: 'one kind only', ...common };
}
