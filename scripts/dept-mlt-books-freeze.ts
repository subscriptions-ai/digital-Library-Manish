/**
 * Medical Laboratory Technology, BOOKS: judge the OpenAlex candidates (scripts/dept-mlt-books-harvest.py) and freeze a manifest of NEW Draft books for scripts/dept-mlt-books-apply.cjs.
 * Nothing here touches production. It needs the helpers of the books-dept-fill branch (src/lib/ingestion/books/deptFill.ts), so it runs from a worktree of that branch with
 * scripts/dept-mlt-rules.ts copied next to it:
 *
 *   DATABASE_URL=…/stm_books_stage npx tsx scripts/dept-mlt-books-freeze.ts --in <candidates.ndjson> --prod <books export.ndjson> --out <dir> --run <runId>
 *
 * A book is listed for MLT only when TWO different kinds of evidence agree (the same principle as the journals):
 *   title   a narrow laboratory-science term in the TITLE (dept-mlt-rules.ts TITLE_NARROW / TITLE_BOOK)
 *   topic   OpenAlex's own topics for the book are laboratory-specific topics, or its subfield is one of the laboratory subfields AND a topic's wording names the field
 * plus the same safeguards as every earlier book fill: a CC licence declared on the book's OWN record, a publisher / book-platform host (never a self-deposit repository), English,
 * 2001 or later, a whole book with a DOI, not already held in production (DOI, ISBN-10/13, source id, fingerprint, title+author, legacy collection).
 * Every book is written as a DRAFT (never published), ownershipSource Ingested, with its department set.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { normaliseIsbn, titleKey } from '../src/lib/ingestion/books/identifiers.js';
import { normaliseDoi } from '../src/lib/ingestion/dedup.js';
import { candidateFromOpenAlex, fillRow, authorsCompatible, looksNonEnglish, CHAPTER_TITLE, SERIAL_TITLE, COLLECTION_TITLE, FOREIGN_TITLE, PLACEHOLDER_TITLE, NUMBERED_HEADING, SELF_DEPOSIT_HOST, SELF_DEPOSIT_DOI_PREFIX, HOLD_HOST, NOT_A_BOOK_RAW_TYPE, BOOK_RAW_TYPE, type FillCandidate } from '../src/lib/ingestion/books/deptFill.js';
import { TITLE_NARROW, TITLE_HEMATOLOGY, TITLE_HEMATOLOGY_ONCO, EXCLUDE, EXCLUDE_SOFT, TOPIC_CORE_NAMES, norm } from './dept-mlt-rules.js';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const inFile = arg('--in'), prodFile = arg('--prod'), out = arg('--out'), runId = arg('--run');
if (!inFile || !prodFile || !out || !runId) { console.error('usage: dept-mlt-books-freeze.ts --in cand.ndjson --prod export.ndjson --out dir --run runId'); process.exit(2); }
if (/^\/tmp\b/.test(out) && !out.includes('/scratchpad/')) { console.error('write outside /tmp (or in the scratchpad)'); process.exit(2); }
const ANY_LICENCE = process.argv.includes('--any-licence');   // Draft METADATA records: a CC licence on the book's own record is not required (then no licence is claimed)
const MIN_YEAR = 2001;
const DEPT = 'Medical Laboratory Technology';

/** Book titles: the journal terms plus the words textbooks use. */
const TITLE_BOOK = /\b(medical microbiology|clinical microbiology|diagnostic microbiology|medical parasitology|clinical parasitology|histopatholog\w*|cytopatholog\w*|cytolog\w*|clinical pathology|laboratory (techniques|methods|diagnosis|safety|testing|practice|manual)|molecular diagnostics|blood banking|phlebotom\w*|urinalysis|serolog\w*|point[- ]of[- ]care|clinical immunology|diagnostic hematology|laboratory hematology)\b/i;
const LAB_SUBFIELDS = new Set(['Medical Laboratory Technology', 'Clinical Biochemistry', 'Hematology', 'Pathology and Forensic Medicine']);
const LAB_TOPIC_WORDS = /\b(laborator\w*|clinical (chemistry|biochemistry|pathology|microbiology)|transfusion|blood (group|bank|donation|coagulation)|diagnos\w* (testing|assay|microbiology)|cytolog\w*|histolog\w*|patholog\w*|haematolog\w*|hematolog\w*|susceptibility testing|point-of-care|serolog\w*)\b/i;
/** A "laboratory manual" is only MLT when the book says it is clinical / medical; a chemistry or physics lab manual is not. */
const GENERAL_LAB = /\b(chemistry|physics|engineering|electronics|computer|programming|biology lab|general biology|organic|inorganic|physical|geolog\w*|environmental|science education|undergraduate)\b/i;

type Held = { authors: string; year: number | null; kind: string };
const prod = { isbn: new Set<string>(), doi: new Set<string>(), pid: new Set<string>(), fp: new Set<string>(), byTitle: new Map<string, Held[]>(), rows: 0, legacy: 0 };
const addHeld = (t: any, a: any, y: any, kind: string) => { const k = titleKey(t); if (!k) return; const l = prod.byTitle.get(k) || []; l.push({ authors: String(a || ''), year: y ?? null, kind }); prod.byTitle.set(k, l); };
for (const l of readFileSync(prodFile, 'utf8').split('\n')) {
  if (l.startsWith('{"t":"bcat"')) { const o = JSON.parse(l); prod.rows++; const i = normaliseIsbn(o.isbn); if (i) { prod.isbn.add(i.isbn13); if (i.isbn10) prod.isbn.add(i.isbn10); } if (o.doi) prod.doi.add(normaliseDoi(o.doi) || String(o.doi).toLowerCase()); if (o.source && o.sid) prod.pid.add(`${o.source}|${o.sid}`); if (o.fingerprint) prod.fp.add(o.fingerprint); addHeld(o.title, o.authors, o.year, 'book'); }
  else if (l.startsWith('{"t":"legacy"')) { const o = JSON.parse(l); prod.legacy++; addHeld(o.title, o.authors, null, 'legacy'); }
}

/** Held by a reader after reading the eligible list (2026-10-30): clinical, not laboratory practice. */
const HAND_HOLD: Record<string, string> = { hemophilia: 'clinical hematology (a disease monograph), not laboratory practice' };
/** Titles a reader judged clinical-specialty (surgery, anaesthesia, obstetrics, critical care, trauma), non-English, proceedings or off-topic after reading the whole eligible list. */
const HAND_HOLD_SUBSTRINGS: [string, string][] = ([
  'joint surgery in the adult patient with hemophilia', 'haemostasis in spine surgery', 'handbook of bleeding and coagulation for neurosurgery', 'haemostasis in surgery', 'obstetric hematology', 'haematology in critical care',
  'hematologic challenges in the critically ill', 'hematologic problems in the critically ill', 'management of hemostasis and coagulopathies', 'haematological system', 'haematological problems', 'haematological and coagulation disorders and anaesthesia',
  'haematological disorders', 'haematological emergencies', 'twin-to-twin', 'neonatology and blood transfusion', 'massive transfusion', 'transfusion ratios in trauma', 'blood conservation and transfusion in anaesthesia', 'anticoagulation and transfusion',
  'transfusion-free medicine', 'alternatives to blood transfusion', 'autologous transfusion', 'red cell transfusion in critically ill', 'perioperative pediatric patient blood management', 'perioperative hemostasis', 'history of blood donation',
  'essentials of vascular laboratory', 'clinical medicine (a textbook of clinical methods', 'clinical laboratory investigation and psychiatry', 'laboratory medicine in psychiatry', "chapel and haeney", 'aptasensors', 'molecular diagnostics and biological safety',
  'urgences-r', 'transfusion sanguine', 'transfusionspraxis', 'laboratory diagnosis of campylobacteriosis', 'laboratory methods in microbiology and molecular biology', 'problems of epidemiology, therapy and laboratory diagnostics', 'german society for transfusion medicine',
  'transfusion in the intensive care unit', 'hemophilia (presentation in emergency surgery)', 'hemophilia care in the new millennium', 'point-of-care tests for severe hemorrhage', 'transfusion management of the obstetrical patient',
] as string[]).map(x => [x, 'clinical specialty / non-English / proceedings / off-topic (reader hold)'] as [string, string]);
const HOLD_PUBLISHER = /bright sky/i;           // a mass publisher of near-duplicate "clinical chemistry" titles (11 in this list)
const mostlyNonLatin = (t: string) => { const letters = [...t].filter(ch => /\p{L}/u.test(ch)); return letters.length > 0 && letters.filter(ch => !/[\u0000-\u024F]/.test(ch)).length / letters.length > 0.5; };

type Verdict = { c: FillCandidate; ok: boolean; tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'EXCLUDED' | 'NONE'; checks: string[]; reasons: string[] };
function judge(c: FillCandidate): Verdict {
  const b = c.book, checks: string[] = [], reasons: string[] = [];
  const t = b.title;
  { const lt = t.toLowerCase(); const h = HAND_HOLD_SUBSTRINGS.find(([sub]) => lt.includes(sub)); if (h) return { c, ok: false, tier: 'LOW', checks, reasons: [`held by reviewer: ${h[1]}`] }; }
  if (HOLD_PUBLISHER.test(String(b.publisherName || ''))) return { c, ok: false, tier: 'LOW', checks, reasons: ['held by reviewer: mass publisher of near-duplicate titles'] };
  if (mostlyNonLatin(t)) return { c, ok: false, tier: 'LOW', checks, reasons: ['held by reviewer: title not in English'] };
  if (HAND_HOLD[t.trim().toLowerCase()]) return { c, ok: false, tier: 'LOW', checks, reasons: [`held by reviewer: ${HAND_HOLD[t.trim().toLowerCase()]}`] };
  const topicCore = c.evidence.topics.filter(x => TOPIC_CORE_NAMES.has(norm(x)));
  // A hematology / coagulation title is clinical hematology unless the book's own topics are laboratory-specific (same rule as the journals).
  const narrow = TITLE_NARROW.test(t) || TITLE_BOOK.test(t) || (TITLE_HEMATOLOGY.test(t) && !TITLE_HEMATOLOGY_ONCO.test(t) && topicCore.length > 0);
  const subfieldLab = LAB_SUBFIELDS.has(String(c.evidence.subfield || '')) && c.evidence.topics.some(x => LAB_TOPIC_WORDS.test(x));
  const topicOk = topicCore.length > 0 || subfieldLab;
  const kinds = [narrow && 'title', topicOk && 'topic'].filter(Boolean) as string[];
  if (!kinds.length) return { c, ok: false, tier: 'NONE', checks, reasons: ['no laboratory evidence'] };
  const ex = EXCLUDE.find(([name, re]) => (re.test(t) || re.test(c.evidence.topics.slice(0, 2).join(' '))) && !(narrow && EXCLUDE_SOFT.has(name)));
  if (ex) return { c, ok: false, tier: 'EXCLUDED', checks, reasons: [`excluded:${ex[0]}`] };
  if (/\blaboratory (manual|techniques|methods)\b/i.test(t) && GENERAL_LAB.test(`${t} ${c.evidence.topics.join(' ')}`) && !/\b(clinical|medical|diagnostic)\b/i.test(t)) return { c, ok: false, tier: 'EXCLUDED', checks, reasons: ['excluded:general laboratory manual'] };
  if (kinds.length < 2) return { c, ok: false, tier: 'LOW', checks, reasons: [`one kind only: ${kinds[0]}`] };
  checks.push('title:narrow', topicCore.length ? `topic:${topicCore[0]}` : `subfield:${c.evidence.subfield}+topic_wording`);
  // general book rules (same as every earlier fill)
  if (!b.licence) { if (!ANY_LICENCE) reasons.push(c.evidence.licenceSlug ? `licence_not_recognised:${c.evidence.licenceSlug}` : 'no_licence_on_own_record'); else checks.push('licence:not declared (Draft metadata record)'); } else checks.push(`licence:${b.licence}`);
  if (!b.doi) reasons.push('no_doi');
  if (!/^(en|eng|english)$/i.test(String(b.language || ''))) reasons.push(`language_not_english:${b.language || 'none'}`); else if (FOREIGN_TITLE.test(t) || looksNonEnglish(t, b.description)) reasons.push('language_not_english:text');
  if (b.year == null) reasons.push('no_year'); else if (b.year < MIN_YEAR) reasons.push(`year_before_policy:${b.year}`);
  if (PLACEHOLDER_TITLE.test(t)) reasons.push('not_published_yet:working_title');
  else if (NUMBERED_HEADING.test(t)) reasons.push('not_a_whole_book:numbered_heading');
  else if (CHAPTER_TITLE.test(t)) reasons.push('not_a_whole_book:chapter_or_part');
  else if (SERIAL_TITLE.test(t) || COLLECTION_TITLE.test(t)) reasons.push('not_a_whole_book:serial_or_proceedings');
  else if (COLLECTION_TITLE.test(String(b.authors || '').split(',')[0])) reasons.push('not_a_whole_book:conference_as_author');
  const loc = c.evidence.licenceLocation, host = String(loc?.source || ''), hostType = String(loc?.type || ''), raw = String(loc?.rawType || '');
  if (!loc) { if (!ANY_LICENCE) reasons.push('no_host_record'); }
  else if (hostType === 'repository' || SELF_DEPOSIT_HOST.test(host) || SELF_DEPOSIT_DOI_PREFIX.test(String(b.doi || '').split('/')[0])) reasons.push(`self_deposit_repository:${host || 'unnamed'}`);
  else if (!ANY_LICENCE && (!hostType || !host)) reasons.push('host_not_identified');
  else if (HOLD_HOST.test(host)) reasons.push(`host_held_for_a_person:${host.slice(0, 40)}`);
  else if (NOT_A_BOOK_RAW_TYPE.test(raw) || (raw && !BOOK_RAW_TYPE.test(raw))) reasons.push(`record_type_not_book:${raw}`);
  if (!b.externalUrl) reasons.push('no_address');
  if (ANY_LICENCE && !b.publisherName) reasons.push('no_publisher');
  // already held in production, any status, or the legacy collection
  const held: string[] = [];
  if (b.doi && prod.doi.has(b.doi)) held.push('doi');
  if (prod.pid.has(`${b.provider}|${b.sourceRecordId}`)) held.push('source_id');
  { const i = normaliseIsbn(b.isbns[0]); if (i && (prod.isbn.has(i.isbn13) || (i.isbn10 && prod.isbn.has(i.isbn10)))) held.push('isbn'); }
  for (const e of prod.byTitle.get(titleKey(t)) || []) if (authorsCompatible(b.authors, e.authors)) { held.push(`title+author:${e.kind}`); break; }
  if (held.length) reasons.push(`already_held:${held.join('+')}`);
  return { c, ok: !reasons.length, tier: reasons.length ? 'MEDIUM' : 'HIGH', checks, reasons };
}

const verdicts: Verdict[] = []; const seen = new Set<string>();
for (const l of readFileSync(inFile, 'utf8').split('\n')) {
  if (!l) continue; const o = JSON.parse(l); const c = candidateFromOpenAlex(o.w, o.query);
  if (!c || seen.has(c.book.sourceRecordId!)) continue; seen.add(c.book.sourceRecordId!); verdicts.push(judge(c));
}
// duplicates inside the set
const winners: Verdict[] = [];
for (const v of verdicts.filter(x => x.ok)) {
  const d = winners.find(w => titleKey(w.c.book.title) === titleKey(v.c.book.title) && authorsCompatible(w.c.book.authors, v.c.book.authors)) || winners.find(w => w.c.book.doi && w.c.book.doi === v.c.book.doi);
  if (d) { v.ok = false; v.reasons.push(`duplicate_in_set_of:${d.c.book.sourceRecordId}`); } else winners.push(v);
}
const eligible = verdicts.filter(v => v.ok), rest = verdicts.filter(v => !v.ok);
const count = (xs: Verdict[], f: (v: Verdict) => string) => { const m: Record<string, number> = {}; for (const x of xs) { const k = f(x); m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const waterfall = count(verdicts, v => v.ok ? 'ELIGIBLE (HIGH)' : v.tier === 'NONE' ? 'no laboratory evidence' : v.tier === 'LOW' ? 'only one kind of evidence' : v.tier === 'EXCLUDED' ? v.reasons[0] : (v.reasons[0] || '').replace(/[:(].*$/, '').replace(/^/, 'held: '));
const report = { runId, candidates: verdicts.length, productionBooks: prod.rows, productionLegacy: prod.legacy, eligible: eligible.length, waterfall, total: Object.values(waterfall).reduce((a, b) => a + b, 0) };
mkdirSync(out, { recursive: true });
const when = new Date();
const rows = eligible.map(v => {
  const row: any = fillRow(v.c, DEPT as any, { department: DEPT as any, checks: v.checks, reasons: [] } as any, when);
  row.status = 'Draft';                                   // NEVER published by this run
  if (!row.licence) { row.licenceIsNC = null; row.rightsBasis = 'OpenAlex listing — licence not declared (Draft metadata record)'; row.rightsVerifiedAt = null; row.rightsVerifiedBy = null; row.rightsStatus = 'MetadataOnly'; row.accessStatus = 'MetadataOnly'; }
  row.metadata = { ...row.metadata, harvest: { ...row.metadata.harvest, department: { band: 'strong', rule: 'dept-mlt-books:title+topic+licence', checks: v.checks, topics: v.c.evidence.topics, fields: v.c.evidence.fields, query: v.c.evidence.query ?? null }, runId } };
  return { source: row.source, sourceRecordId: row.sourceRecordId, doi: row.doi, isbn: null, fingerprint: row.fingerprint, row: JSON.parse(JSON.stringify(row)) };
});
const plan = { runId, createdAt: when.toISOString(), bookMinYear: MIN_YEAR, count: rows.length, rows };
const planJson = JSON.stringify(plan), sha = createHash('sha256').update(planJson).digest('hex');
writeFileSync(join(out, 'manifest-frozen.json.gz'), gzipSync(planJson));
writeFileSync(join(out, 'manifest-frozen.json'), planJson);
writeFileSync(join(out, 'manifest-frozen.sha256'), `${sha}  manifest-frozen.json (${planJson.length} bytes, ${rows.length} rows)\n`);
writeFileSync(join(out, 'held.json'), JSON.stringify(rest.map(v => ({ id: v.c.book.sourceRecordId, title: v.c.book.title, year: v.c.book.year, doi: v.c.book.doi, licence: v.c.evidence.licenceSlug, host: v.c.evidence.licenceLocation?.source, topics: v.c.evidence.topics.slice(0, 3), tier: v.tier, reasons: v.reasons }))));
const md = [`# Sample for a person to read before anything is written`, '', `Run ${runId} · ${rows.length} Draft books · sha256 ${sha}`, '', '| # | Title | Year | Licence | Host | Topic |', '|---|---|---|---|---|---|'];
eligible.forEach((v, i) => md.push(`| ${i + 1} | ${v.c.book.title.replace(/\|/g, '/')} | ${v.c.book.year} | ${v.c.book.licence} | ${v.c.evidence.licenceLocation?.source || ''} | ${v.c.evidence.topics[0] || ''} |`));
writeFileSync(join(out, 'sample.md'), md.join('\n'));
writeFileSync(join(out, 'report.json'), JSON.stringify({ ...report, sha256: sha }, null, 2));
console.log(JSON.stringify({ ...report, sha256: sha }, null, 2));
