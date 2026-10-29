/**
 * Department evidence for the net-new journals of the second run (Bio Technology, Electrical Engineering, Electronics & Telecommunication). Reads only.
 * Every kind of evidence is kept SEPARATE so the stage script can require that at least two different kinds agree:
 *   title      a specific term in the title (titleTopicDepartment.TITLE_TERMS)
 *   society    a recognised discipline body (officialListDepartment.BODIES) + title term + topic support (all three legs, officialListDepartment)
 *   catalogue  a subject another catalogue assigned: NLM Subject, SciELO Web of Science area, DOAJ keywords/LCC (never the title)
 *   topics     what OpenAlex says the articles are about: the strict subfield rule (departmentFromTopics) and a scope LEXICON over topic names
 *   site       (stage 3, aims & scope text from the journal's own website)
 *
 *   npx tsx scripts/dept-coverage/classify2.ts [pool.json] [out.json]
 */
import { writeFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { departmentFromTopics, scoreTopics } from '../../src/lib/ingestion/openAlexDepartments.js';
import { officialListDepartment, bodyOf } from '../../src/lib/ingestion/officialListDepartment.js';
import { titleDepartments } from '../../src/lib/ingestion/titleTopicDepartment.js';
import { nlmDepartment } from '../../src/lib/ingestion/nlmJournalDepartment.js';
import { departmentForDoajRow } from '../../src/lib/doajCatalogue.js';
import { canonicalDepartmentName } from '../../src/lib/departmentRegistry.js';
import { classifyJournal } from '../../src/lib/ingestion/journalClassification.js';

export const EL = 'Electrical Engineering', ET = 'Electronics & Telecommunication Engineering', BT = 'Bio Technology';
export const TARGETS = [EL, ET, BT];

/** Scope lexicons over OpenAlex TOPIC names (and their subfield): a topic counts for a department only when its own name says so. Deliberately specific. */
export const LEXICON: Record<string, RegExp> = {
  [EL]: /power (system|electronic|grid|quality|transmission|converter|distribution|line)|smart grid|microgrid|electric (motor|machine|drive|vehicle|power|energy)|high[- ]voltage|hvdc|grid (integration|stability|connected)|electrical (insulation|machine|power|engineering)|transformer|photovoltaic (system|power|inverter)|inverter|wind (power|turbine) (system|control|integration|generation)|protection (relay|scheme)|electromagnetic (field|compatib)|magnetic (material|circuit|levitation)|superconduct|dielectric|plasma (physics|discharge)|control systems|power electronics|battery (management|charging)|energy storage (system|integration)/i,
  [ET]: /wireless|antenna|microwave|millimeter|terahertz|signal processing|5g|6g|mimo|ofdm|channel (coding|estimation)|radar|optical (communication|fib(er|re)|network)|photonic|lightwave|vlsi|integrated circuit|cmos|analog (circuit|design)|radio frequency|\brf\b|semiconductor (device|physics)|transistor|fpga|embedded system|sensor network|telecommunication|network (coding|protocol|security)? ?(communication)|information theory|satellite|gnss|speech (and|processing)|image processing|compressive sensing|spectrum (sensing|sharing)|cognitive radio|modulation|electronic (device|circuit|packaging)|memristor|mems/i,
  [BT]: /bioprocess|fermentation|metabolic engineering|synthetic biology|biocatalys|enzyme (production|catalysis|immobili|engineering|technology)|biofuel|bioreactor|biotechnolog|bioengineering|recombinant|crispr|genetic engineering|bioproduction|biorefiner|tissue engineering|biopolymer|microalga|biosurfactant|biosensor|bioconversion|biomanufactur|downstream processing|cell culture|protein engineering|directed evolution|genome (editing|engineering)|industrial microbiology|microbial (production|cell factor)|bioplastic|biogas|biohydrogen|bioethanol|biodiesel/i,
};
const lexShare = (topics: any[]) => {
  let total = 0; const hit: Record<string, number> = { [EL]: 0, [ET]: 0, [BT]: 0 }; const n: Record<string, number> = { [EL]: 0, [ET]: 0, [BT]: 0 };
  for (const t of topics || []) {
    const w = Number.isFinite(t?.count) && t.count > 0 ? t.count : 1; total += w;
    const nm = `${t?.name || ''} ${t?.subfield || ''}`;
    for (const d of TARGETS) if (LEXICON[d].test(nm)) { hit[d] += w; n[d]++; }
  }
  return { total, share: Object.fromEntries(TARGETS.map(d => [d, total ? Math.round(hit[d] / total * 100) / 100 : 0])), topics: n };
};

const WOS: [RegExp, string][] = [[/telecommunications/i, ET], [/engineering,? electrical (&|and) electronic/i, 'EL_OR_ET'], [/biotechnology (&|and) applied microbiology/i, BT]];
const NLM_BT = new Set(['Biotechnology', 'Industrial Microbiology', 'Genetic Engineering', 'Bioengineering', 'Bioreactors', 'Biofuels', 'Fermentation']);

const inp = process.argv[2] || `data/${process.env.RUN_DIR || 'dept-coverage2'}/work/pool.ndjson`, out = process.argv[3] || `data/${process.env.RUN_DIR || 'dept-coverage2'}/work/classified.json`;
const res: Record<string, any> = {}; let n = 0;
const rl = createInterface({ input: createReadStream(inp, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue; const c = JSON.parse(line);
  if (c.class !== 'net-new' && c.class !== 'held-identifier') continue;          // held-identifier: only to list review candidates that sit in ANOTHER department
  const oa = c.records.find((r: any) => r.src === 'OpenAlex');
  const publisher = c.records.map((r: any) => r.publisher).find(Boolean) || null;
  const listedBy = c.records.filter((r: any) => r.src === 'Crossref member').map((r: any) => String(r.member || r.group));
  const topics = oa ? (oa.topics || []).map((t: any) => ({ display_name: t.name, count: t.count, subfield: { display_name: t.subfield }, field: { display_name: t.field } })) : [];
  const ev = oa ? scoreTopics(c.title, topics) : null;
  const shares = ev ? ev.shares.map(s => ({ department: s.department, share: s.share, topics: s.topics })) : [];
  const strict = oa ? departmentFromTopics({ display_name: c.title, topics }) : null;
  const lex = oa ? lexShare(oa.topics || []) : null;
  const titleD = titleDepartments(c.title).filter(d => TARGETS.includes(d));
  const body = bodyOf({ title: c.title, publisher, listedBy, societies: oa?.societies || [] });
  const official = body ? officialListDepartment({ title: c.title, publisher, listedBy, societies: oa?.societies || [], topicShares: shares, topicTotal: ev?.total || 0 }) : null;
  // catalogue subjects
  const cat: Record<string, string> = {};
  const nl = c.records.find((r: any) => r.src === 'NLM Catalog');
  if (nl) { const subs: string[] = nl.nlmSubjects || []; const d = nlmDepartment(c.title, publisher, subs); if (d.dept === BT && d.confidence === 'high') cat.nlm = BT; else if (subs.some(s => NLM_BT.has(s)) && !subs.includes('Biomedical Engineering')) cat.nlmSubjectOnly = BT; }
  const sc = c.records.find((r: any) => r.src === 'SciELO');
  if (sc) for (const w of sc.wos || []) for (const [re, d] of WOS) if (re.test(w)) cat.scielo = d;
  const dj = c.records.find((r: any) => r.src === 'DOAJ');
  if (dj) { const d = canonicalDepartmentName(departmentForDoajRow({ 'Journal title': c.title, Keywords: (dj.keywords || []).join(' | '), 'LCC Codes': dj.lcc || '' })); if (d && TARGETS.includes(d)) cat.doaj = d; }
  const judge = classifyJournal({ title: c.title, subjects: [] });
  const js = c.records.find((r: any) => r.src === 'J-STAGE');
  res[c.ids[0]] = { title: titleD, body: body?.id || null, official, catalogue: cat, topicsStrict: strict && strict.dept ? { dept: strict.dept, confidence: strict.confidence } : null, shares: Object.fromEntries(shares.map(s => [s.department, Math.round(s.share * 100) / 100])), topicTotal: ev?.total || 0, lexicon: lex, judge: { dept: judge.dept, tier: judge.tier }, jstage: js ? { currentPubdate: js.currentPubdate, totalArticles: js.totalArticles, suspended: js.suspended } : null };
  n++;
}
writeFileSync(out, JSON.stringify(res));
console.log(`classified ${n} clusters -> ${out}`);
