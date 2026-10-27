import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { departmentForDoajRow } from '../doajCatalogue.js';
import { canonicalDepartmentName } from '../departmentRegistry.js';
import { licenceAllowsCommercialUse } from './eligibility.js';

/**
 * DOAJ Journal enrichment and verification — the RULES. Pure: it reads DOAJ CSV rows and the journals held and says, for every journal, what the file could complete and where it
 * disagrees. It never touches a database, never downloads, never writes. The audit, the Preview and the bounded write all call these same functions; the write then re-reads each
 * journal and re-checks it in the database before touching it.
 *
 *   · IDENTITY is an exact ISSN match against BOTH of a held journal's ISSN columns. A title is never an identity: the same normalised title and publisher under different ISSNs is an
 *     IDENTITY_CONFLICT, only reported. A row that shares an ISSN with another row, one that touches two held journals, or a held journal that two rows touch is AMBIGUOUS, only reported.
 *   · PROTECTED journals (ours, Rejected, decided by a person, linked to a publisher) are never evaluated for enrichment.
 *   · ENRICHMENT fills only a field that is EMPTY (whitespace is empty) with a VALID DOAJ value. A held value that agrees (case, accents, punctuation folded) is "same"; one that does not is
 *     a CONFLICT, counted and never replaced. "DOAJ says so" is never a reason to replace a held value. A TITLE conflict makes the whole record a conflict (the match is in doubt).
 *   · RIGHTS and STATUS are never touched. Where DOAJ's licence differs from the held one it is counted as evidence, not applied.
 *   · DEPARTMENT is analysis only.
 *   · The e-ISSN is REVIEW-ONLY: the engine attributes fetched works to a journal by its ISSN or e-ISSN (articleSources, articlePipeline, dedup), so filling it would change which
 *     articles attach. Article ELIGIBILITY (status, ISSN, rights basis, department scope, article count) depends on none of the fields filled here.
 */

export const SNAPSHOT_NAME = /^doaj_journalcsv_(\d{4})(\d{2})(\d{2})_(\d{4})_utf8\.csv$/;

export type Snapshot = { file: string; size: number; sha256: string; /** YYYY-MM-DD from the official file name, or null if the name is not DOAJ's. */ date: string | null; rows: Record<string, string>[] };

/** The staged file, its identity (name, size, sha-256) and its rows. */
export function readSnapshot(file: string): Snapshot {
  const buf = readFileSync(file);
  const name = path.basename(file); const m = SNAPSHOT_NAME.exec(name);
  const rows = Papa.parse<Record<string, string>>(buf.toString('utf8'), { header: true, skipEmptyLines: true }).data;
  return { file: name, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), date: m ? `${m[1]}-${m[2]}-${m[3]}` : null, rows };
}

export type Held = {
  id: string; issn: string | null; eissn: string | null; title: string; publisherName: string | null; publisherId: string | null; country: string | null; homepage: string | null;
  language: string | null; subject: string | null; subjects: string[]; domain: string | null; status: string; licence: string | null; licenceIsNC: boolean | null;
  rightsBasis: string | null; rightsVerifiedBy: string | null; articleCount: number;
};

// ── small, deterministic helpers ─────────────────────────────────────────────
export const issnOf = (raw?: string | null): string | null => { if (!raw) return null; const t = String(raw).replace(/[‐-―]/g, '-').replace(/\s+/g, '').toUpperCase(); const m = t.match(/^(\d{4})-?(\d{3}[\dX])$/); return m ? `${m[1]}-${m[2]}` : null; };
export const blank = (v: unknown) => v == null || String(v).replace(/\s+/g, ' ').trim() === '';
/** Case, accents, punctuation and "&" folded away: two spellings of one name are one name. */
export const fold = (s: unknown) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const urlKey = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase(); } catch { return null; } };
export const validUrl = (u: string) => /^https?:\/\//i.test(u.trim()) && u.length <= 500 && urlKey(u.trim()) !== null;
const words = (s: unknown, sep: string | RegExp) => new Set(String(s ?? '').split(sep).map(fold).filter(Boolean));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
const subset = (a: Set<string>, b: Set<string>) => [...a].every(x => b.has(x));

/** A DOAJ row, read once. */
export type Row = {
  i: number; title: string; p: string | null; e: string | null; issns: string[]; publisher: string; country: string; language: string; homepage: string; subject: string; subjects: string[];
  licences: string[]; ruleStatus: 'Accepted' | 'MetadataOnly'; dept: string | null; added: string;
};
export function readRow(raw: Record<string, string>, i: number): Row {
  const p = issnOf(raw['Journal ISSN (print version)']), e = issnOf(raw['Journal EISSN (online version)']);
  const licences = (raw['Journal license'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const ncAttr = /no commercial/i.test(raw['License attributes'] || '');
  const subjects = (raw['Subjects'] || '').split('|').map(s => s.trim()).filter(Boolean);
  return {
    i, title: (raw['Journal title'] || '').trim(), p, e, issns: [p, e].filter(Boolean) as string[], publisher: (raw['Publisher'] || '').trim(), country: (raw['Country of publisher'] || '').trim(),
    language: (raw['Languages in which the journal accepts manuscripts'] || '').trim(), homepage: (raw['Journal URL'] || '').trim(), subject: subjects[0] || '', subjects, licences,
    ruleStatus: licences.length > 0 && !ncAttr && licences.every(l => licenceAllowsCommercialUse(l, false)) ? 'Accepted' : 'MetadataOnly',
    dept: canonicalDepartmentName(departmentForDoajRow(raw)), added: (raw['Added on Date'] || '').trim(),
  };
}

export const FIELDS = ['eissn', 'publisherName', 'country', 'homepage', 'language', 'subject', 'subjects'] as const;
export type Field = typeof FIELDS[number];
/** Descriptive fields a bounded write may fill. */
export const AUTO_FIELDS: Field[] = ['homepage', 'country', 'publisherName', 'language', 'subject', 'subjects'];
/** Fields the rules can SEE but a write never fills by itself (see the header). */
export const REVIEW_ONLY_FIELDS: Field[] = ['eissn'];
const HIGH_VALUE: Field[] = ['homepage', 'country', 'publisherName'];

export type ProtectReason = 'our own' | 'Rejected' | 'decided by a person' | 'linked to a publisher';
/** Why a held journal is never enriched (all reasons that apply). */
export function protectedReasons(j: Pick<Held, 'rightsBasis' | 'status' | 'rightsVerifiedBy' | 'publisherId'>): ProtectReason[] {
  const r: ProtectReason[] = [];
  if (j.rightsBasis === 'our own') r.push('our own');
  if (j.status === 'Rejected') r.push('Rejected');
  if (j.rightsVerifiedBy && j.rightsVerifiedBy !== 'ingestion') r.push('decided by a person');
  if (j.publisherId) r.push('linked to a publisher');
  return r;
}

// ── identity ────────────────────────────────────────────────────────────────
/** Which rows of the whole file carry each ISSN: the file-wide fact that "an ISSN is shared" or "a held journal is touched twice" rests on. */
export type FileIndex = { rows: number; rowsByIssn: Map<string, number[]> };
export function newFileIndex(): FileIndex { return { rows: 0, rowsByIssn: new Map() }; }
export function addToFileIndex(idx: FileIndex, r: Row) { idx.rows++; for (const k of r.issns) { const l = idx.rowsByIssn.get(k); l ? l.push(r.i) : idx.rowsByIssn.set(k, [r.i]); } }

export type HeldIndex = { byIssn: Map<string, Held[]>; byTitle: Map<string, Held[]> };
export function indexHeld(held: Held[]): HeldIndex {
  const byIssn = new Map<string, Held[]>(), byTitle = new Map<string, Held[]>();
  const add = (m: Map<string, Held[]>, k: string | null, j: Held) => { if (!k) return; const l = m.get(k); l ? (l.includes(j) || l.push(j)) : m.set(k, [j]); };
  for (const j of held) { add(byIssn, j.issn, j); add(byIssn, j.eissn, j); add(byTitle, fold(j.title) || null, j); }
  return { byIssn, byTitle };
}

export type Relation = 'identical' | 'rowHasExtraIssn' | 'heldHasExtraIssn';
export type Verdict =
  | { kind: 'unusable' }
  | { kind: 'matched'; j: Held; relation: Relation; crossField: boolean }
  | { kind: 'issnDisagreement'; j: Held }
  | { kind: 'ambiguous'; reason: 'sharedIssnInFile' | 'splitAcrossHeld' | 'heldTouchedByManyRows'; held?: Held[] }
  | { kind: 'identityConflict'; held: Held[] }
  | { kind: 'titleOnly'; held: Held[] }
  | { kind: 'unmatched' };

export function matchRow(r: Row, held: HeldIndex, file: FileIndex): Verdict {
  if (!r.title || !r.issns.length) return { kind: 'unusable' };
  const hits = [...new Set(r.issns.flatMap(k => held.byIssn.get(k) ?? []))];
  if (!hits.length) {
    const sameTitle = held.byTitle.get(fold(r.title)) ?? [];
    if (sameTitle.some(j => fold(r.publisher) && fold(j.publisherName) === fold(r.publisher))) return { kind: 'identityConflict', held: sameTitle };
    return sameTitle.length ? { kind: 'titleOnly', held: sameTitle } : { kind: 'unmatched' };
  }
  if (hits.length > 1) return { kind: 'ambiguous', reason: 'splitAcrossHeld', held: hits };
  if (r.issns.some(k => (file.rowsByIssn.get(k) ?? []).length > 1)) return { kind: 'ambiguous', reason: 'sharedIssnInFile' };
  const j = hits[0];
  const H = new Set([j.issn, j.eissn].filter(Boolean) as string[]);
  const touching = new Set([...H].flatMap(k => file.rowsByIssn.get(k) ?? []));
  if (touching.size > 1) return { kind: 'ambiguous', reason: 'heldTouchedByManyRows', held: [j] };
  const C = new Set(r.issns);
  const hOnly = [...H].filter(x => !C.has(x)), cOnly = [...C].filter(x => !H.has(x));
  if (hOnly.length && cOnly.length) return { kind: 'issnDisagreement', j };
  const relation: Relation = !hOnly.length && !cOnly.length ? 'identical' : cOnly.length ? 'rowHasExtraIssn' : 'heldHasExtraIssn';
  // a shared ISSN that DOAJ files in the other role (print vs electronic) than we do
  const crossField = !!((j.eissn && r.p === j.eissn) || (j.issn && r.e === j.issn && r.p && r.p !== j.issn));
  return { kind: 'matched', j, relation, crossField };
}

// ── field by field ──────────────────────────────────────────────────────────
export type ConflictKey = 'title' | 'publisherName' | 'eissn' | 'country' | 'language' | 'languageHeldIsSubset' | 'homepage' | 'subject' | 'subjects' | 'subjectsOneIsSubset' | 'licenceListDiffers' | 'licenceHeldIsSubset';
/** Conflicts that are genuine disagreements. The "…IsSubset" kinds only say that one list is a subset of the other (older, shorter) and are counted as notes. */
export const HARD_CONFLICTS: ConflictKey[] = ['title', 'publisherName', 'eissn', 'country', 'language', 'homepage', 'subject', 'subjects', 'licenceListDiffers'];
export type SameKey = 'title' | 'publisherName' | 'country' | 'countryAsIsoCode' | 'language' | 'homepage' | 'subject' | 'subjects';
export type Eval = {
  gain: Partial<Record<Field, string | string[]>>;
  same: SameKey[];
  conflicts: { key: ConflictKey; held: unknown; doaj: unknown }[];
  malformed: Field[];
  eissnNotStorable: boolean; rightsEvidenceHeldLicenceEmpty: boolean;
  drift: null | 'heldAcceptedRuleMetadataOnly' | 'heldMetadataOnlyRuleAccepted';
};

/** What DOAJ's row would complete in a held journal, and where it disagrees. Reads nothing else; changes nothing. */
export function evaluate(j: Held, r: Row): Eval {
  const E: Eval = { gain: {}, same: [], conflicts: [], malformed: [], eissnNotStorable: false, rightsEvidenceHeldLicenceEmpty: false, drift: null };
  const conflict = (key: ConflictKey, held: unknown, doaj: unknown) => E.conflicts.push({ key, held, doaj });
  // title
  if (fold(j.title) === fold(r.title)) E.same.push('title'); else conflict('title', j.title, r.title);
  // e-ISSN (review-only)
  if (blank(j.eissn)) { if (r.e && r.p === j.issn && r.e !== j.issn) E.gain.eissn = r.e; else if (r.e && r.e !== j.issn) E.eissnNotStorable = true; }
  else if (r.e && j.eissn !== r.e && j.issn !== r.e) conflict('eissn', j.eissn, r.e);
  // publisher
  if (blank(j.publisherName)) { if (r.publisher && r.publisher.length <= 300) E.gain.publisherName = r.publisher; else if (r.publisher) E.malformed.push('publisherName'); }
  else if (r.publisher) { if (fold(j.publisherName) === fold(r.publisher)) E.same.push('publisherName'); else conflict('publisherName', j.publisherName, r.publisher); }
  // country. We hold both ISO codes ("ID", stored by the DOAJ search sweep) and names ("Indonesia", stored by the CSV importer); DOAJ's file has names. A held CODE is the same country in
  // another format and is neither a gap nor a conflict (it cannot be compared without guessing a table).
  if (blank(j.country)) { if (r.country && r.country.length <= 100 && !/^https?:/i.test(r.country)) E.gain.country = r.country; else if (r.country) E.malformed.push('country'); }
  else if (r.country) {
    const held = String(j.country).trim();
    if (/^[A-Z]{2}$/.test(held)) E.same.push('countryAsIsoCode');
    else if (fold(held) === fold(r.country)) E.same.push('country'); else conflict('country', j.country, r.country);
  }
  // language
  if (blank(j.language)) { if (r.language && r.language.length <= 200) E.gain.language = r.language; else if (r.language) E.malformed.push('language'); }
  else if (r.language) { const a = words(j.language, ','), b = words(r.language, ','); if (sameSet(a, b)) E.same.push('language'); else if (subset(a, b)) conflict('languageHeldIsSubset', j.language, r.language); else conflict('language', j.language, r.language); }
  // homepage
  if (blank(j.homepage)) { if (r.homepage && validUrl(r.homepage)) E.gain.homepage = r.homepage.trim(); else if (r.homepage) E.malformed.push('homepage'); }
  else if (r.homepage && validUrl(r.homepage)) { if (urlKey(j.homepage!.trim()) === urlKey(r.homepage.trim())) E.same.push('homepage'); else conflict('homepage', j.homepage, r.homepage); }
  // subject (the single stored string) and subjects (the stored list)
  if (blank(j.subject)) { if (r.subject && r.subject.length <= 300) E.gain.subject = r.subject; else if (r.subject) E.malformed.push('subject'); }
  else if (r.subject) { if (fold(j.subject) === fold(r.subject)) E.same.push('subject'); else conflict('subject', j.subject, r.subject); }
  if (!j.subjects.length) { if (r.subjects.length) E.gain.subjects = r.subjects; }
  else if (r.subjects.length) {
    // DOAJ files a subject as its whole path ("Technology: Engineering (General): Systems engineering"); we hold the leaf term. Compare leaf with leaf.
    const leaf = (x: string) => fold(x.split(':').pop());
    const held = new Set(j.subjects.map(leaf).filter(Boolean)), theirs = new Set(r.subjects.map(leaf).filter(Boolean));
    if (sameSet(held, theirs)) E.same.push('subjects'); else if (subset(held, theirs) || subset(theirs, held)) conflict('subjectsOneIsSubset', j.subjects, r.subjects); else conflict('subjects', j.subjects, r.subjects);
  }
  // licence and status: evidence only, never applied
  if (j.rightsBasis === 'DOAJ declaration' || !blank(j.licence)) {
    if (blank(j.licence)) { if (r.licences.length) E.rightsEvidenceHeldLicenceEmpty = true; }
    else if (r.licences.length) { const a = words(j.licence, ','), b = words(r.licences.join(','), ','); if (!sameSet(a, b)) conflict(subset(a, b) ? 'licenceHeldIsSubset' : 'licenceListDiffers', j.licence, r.licences.join(', ')); }
  }
  if (j.status === 'Accepted' && r.ruleStatus === 'MetadataOnly') E.drift = 'heldAcceptedRuleMetadataOnly';
  else if (j.status === 'MetadataOnly' && r.ruleStatus === 'Accepted') E.drift = 'heldMetadataOnlyRuleAccepted';
  return E;
}

/** The fields a write may fill (automatic fields only, and never when the title casts the match in doubt). */
export function fillable(ev: Eval): Partial<Record<Field, string | string[]>> {
  if (ev.conflicts.some(c => c.key === 'title')) return {};
  return Object.fromEntries(Object.entries(ev.gain).filter(([f]) => AUTO_FIELDS.includes(f as Field))) as Partial<Record<Field, string | string[]>>;
}
export const hardConflicts = (ev: Eval) => ev.conflicts.filter(c => HARD_CONFLICTS.includes(c.key));

// ── the whole-catalogue plan (audit) ─────────────────────────────────────────
export type Sample = Record<string, unknown>;
const cap = 25, perField = 3;
const push = (a: Sample[], v: Sample) => { if (a.length < cap) a.push(v); };
const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
export type EnrichItem = { heldId: string; row: number; fields: Partial<Record<Field, string | string[]>> };

export function planEnrichment(snap: Snapshot, held: Held[], opts: { keepItems?: boolean } = {}) {
  const rows = snap.rows.map(readRow);
  const heldIdx = indexHeld(held); const fileIdx = newFileIndex(); for (const r of rows) addToFileIndex(fileIdx, r);

  const M = {
    rows: rows.length, unusable: 0, matched: 0, unmatched: 0,
    ambiguous: { total: 0, sharedIssnInFile: 0, splitAcrossHeld: 0, heldTouchedByManyRows: 0 },
    identityConflict: 0, titleOnly: 0,
    relation: { identical: 0, rowHasExtraIssn: 0, heldHasExtraIssn: 0, crossField: 0, issnDisagreement: 0 },
  };
  const samples = { enrichable: [] as Sample[], conflicts: [] as Sample[], ambiguous: [] as Sample[], identityConflicts: [] as Sample[] };
  const matched: { j: Held; r: Row; disagreement: boolean }[] = [];
  for (const r of rows) {
    const v = matchRow(r, heldIdx, fileIdx);
    if (v.kind === 'unusable') M.unusable++;
    else if (v.kind === 'unmatched') M.unmatched++;
    else if (v.kind === 'titleOnly') M.titleOnly++;
    else if (v.kind === 'identityConflict') { M.identityConflict++; push(samples.identityConflicts, { title: r.title, doajIssns: r.issns, heldIssns: v.held.map(j => [j.issn, j.eissn]) }); }
    else if (v.kind === 'ambiguous') { M.ambiguous.total++; M.ambiguous[v.reason]++; push(samples.ambiguous, { reason: v.reason, title: r.title, issns: r.issns, held: v.held?.map(h => h.title) }); }
    else if (v.kind === 'issnDisagreement') { M.relation.issnDisagreement++; M.matched++; matched.push({ j: v.j, r, disagreement: true }); push(samples.conflicts, { field: 'issn', title: v.j.title, held: [v.j.issn, v.j.eissn], doaj: r.issns }); }
    else { M.relation[v.relation]++; if (v.crossField) M.relation.crossField++; M.matched++; matched.push({ j: v.j, r, disagreement: false }); }
  }

  const P = { total: 0, byReason: { 'our own': 0, Rejected: 0, 'decided by a person': 0, 'linked to a publisher': 0 } as Record<ProtectReason, number>, anyReasonCounts: { 'our own': 0, Rejected: 0, 'decided by a person': 0, 'linked to a publisher': 0 } as Record<ProtectReason, number> };
  const PC = { total: 0, byReason: { 'our own': 0, Rejected: 0, 'decided by a person': 0, 'linked to a publisher': 0 } as Record<ProtectReason, number>, ofWhichInDoajFile: 0 };
  const eligible: { j: Held; r: Row }[] = [];
  for (const m of matched) { const why = protectedReasons(m.j); if (why.length) { P.total++; P.byReason[why[0]]++; for (const w of why) P.anyReasonCounts[w]++; } else if (!m.disagreement) eligible.push(m); }
  { const inDoaj = new Set(matched.map(p => p.j.id)); for (const j of held) { const w = protectedReasons(j); if (w.length) { PC.total++; for (const x of w) PC.byReason[x]++; if (inDoaj.has(j.id)) PC.ofWhichInDoajFile++; } } }

  const GAIN = zero(FIELDS), MALFORMED = zero(FIELDS);
  const SAME = zero(['title', 'publisherName', 'country', 'countryAsIsoCode', 'language', 'homepage', 'subject', 'subjects'] as const);
  const CONFLICT = zero(['title', 'publisherName', 'eissn', 'country', 'language', 'languageHeldIsSubset', 'homepage', 'subject', 'subjects', 'subjectsOneIsSubset', 'licenceListDiffers', 'licenceHeldIsSubset'] as const);
  const INFO = { eissnNotStorable: 0, rightsEvidenceHeldLicenceEmpty: 0, statusRuleDrift: { heldAcceptedRuleMetadataOnly: 0, heldMetadataOnlyRuleAccepted: 0, ofFirstWithArticles: 0 } };
  const G = { eissnReviewOnly: 0, journalsWithAnyGain: 0, highValue: 0, onlyLanguageOrSubject: 0, twoOrMore: 0, withArticles: 0, byStatus: {} as Record<string, number>, metadataOnlyGainsHomepage: 0, blockedByTitleConflict: 0 };
  const items: EnrichItem[] = [];
  for (const { j, r } of eligible) {
    const ev = evaluate(j, r);
    for (const s of ev.same) SAME[s]++;
    for (const c of ev.conflicts) { CONFLICT[c.key]++; if (samples.conflicts.filter(x => x.field === c.key).length < perField) push(samples.conflicts, { field: c.key, title: j.title, issn: j.issn, held: c.held, doaj: c.doaj }); }
    for (const f of ev.malformed) MALFORMED[f]++;
    if (ev.eissnNotStorable) INFO.eissnNotStorable++;
    if (ev.rightsEvidenceHeldLicenceEmpty) INFO.rightsEvidenceHeldLicenceEmpty++;
    if (ev.drift === 'heldAcceptedRuleMetadataOnly') { INFO.statusRuleDrift.heldAcceptedRuleMetadataOnly++; if (j.articleCount > 0) INFO.statusRuleDrift.ofFirstWithArticles++; }
    if (ev.drift === 'heldMetadataOnlyRuleAccepted') INFO.statusRuleDrift.heldMetadataOnlyRuleAccepted++;
    for (const f of Object.keys(ev.gain) as Field[]) GAIN[f]++;
    if (ev.gain.eissn) G.eissnReviewOnly++;
    const fill = fillable(ev); const names = Object.keys(fill) as Field[];
    if (!names.length && Object.keys(ev.gain).some(f => AUTO_FIELDS.includes(f as Field))) G.blockedByTitleConflict++;
    if (names.length) {
      G.journalsWithAnyGain++; G.byStatus[j.status] = (G.byStatus[j.status] ?? 0) + 1;
      if (names.some(f => HIGH_VALUE.includes(f))) G.highValue++; else G.onlyLanguageOrSubject++;
      if (names.length >= 2) G.twoOrMore++;
      if (j.articleCount > 0) G.withArticles++;
      if (fill.homepage && j.status === 'MetadataOnly') G.metadataOnlyGainsHomepage++;
      push(samples.enrichable, { title: j.title, issn: j.issn, status: j.status, fills: names });
      if (opts.keepItems) items.push({ heldId: j.id, row: r.i, fields: fill });
    }
  }

  // department: analysis only
  const D = { held: held.length, unassigned: 0, unassignedMatched: 0, suggestible: 0, unclassifiable: 0, unassignedNotInFile: 0, assignedMatched: 0, agree: 0, disagree: 0, disagreeBy: {} as Record<string, number> };
  const matchedByHeld = new Map(matched.map(p => [p.j.id, p]));
  for (const j of held) {
    const pair = matchedByHeld.get(j.id);
    if (blank(j.domain)) { D.unassigned++; if (!pair) D.unassignedNotInFile++; else { D.unassignedMatched++; pair.r.dept ? D.suggestible++ : D.unclassifiable++; } }
    else if (pair && pair.r.dept) { D.assignedMatched++; if (canonicalDepartmentName(j.domain) === pair.r.dept) D.agree++; else { D.disagree++; const k = `${j.domain} → ${pair.r.dept}`; D.disagreeBy[k] = (D.disagreeBy[k] ?? 0) + 1; } }
  }
  // verification
  const V = { heldUnverifiedListedByDoaj: 0, heldDoajDeclaredNotInFile: 0 };
  for (const j of held) {
    if (j.rightsBasis === 'DOAJ declaration' && ![j.issn, j.eissn].some(k => k && fileIdx.rowsByIssn.has(k))) V.heldDoajDeclaredNotInFile++;
    if (j.rightsBasis && /unverified/i.test(j.rightsBasis) && matchedByHeld.has(j.id)) V.heldUnverifiedListedByDoaj++;
  }

  const top = (o: Record<string, number>, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    snapshot: { file: snap.file, date: snap.date, size: snap.size, sha256: snap.sha256, rows: snap.rows.length },
    held: { total: held.length, byStatus: held.reduce((a, j) => ((a[j.status] = (a[j.status] ?? 0) + 1), a), {} as Record<string, number>), byRightsBasis: held.reduce((a, j) => ((a[j.rightsBasis ?? '(none)'] = (a[j.rightsBasis ?? '(none)'] ?? 0) + 1), a), {} as Record<string, number>) },
    matching: M, protected: P, protectedWholeCatalogue: PC, eligibleForEnrichment: eligible.length, autoFields: AUTO_FIELDS, reviewOnlyFields: REVIEW_ONLY_FIELDS,
    gains: { byField: GAIN, ...G, malformedSourceValuesIgnored: MALFORMED },
    unchanged: SAME, conflicts: CONFLICT, evidenceNotApplied: INFO,
    department: { ...D, disagreeTop: top(D.disagreeBy) }, verification: V,
    samples, ...(opts.keepItems ? { items } : {}),
  };
}
export type EnrichmentPlan = ReturnType<typeof planEnrichment>;

/** Read-only: every journal this catalogue holds, as the rules need it. The caller opens a READ ONLY transaction; this only runs one SELECT. */
export async function loadHeld(tx: { $queryRawUnsafe: (sql: string, ...v: any[]) => Promise<any[]> }): Promise<Held[]> {
  const rows = await tx.$queryRawUnsafe(`select id, issn, eissn, title, "publisherName", "publisherId", country, homepage, language, subject, subjects::text as subjects, domain, status, licence, "licenceIsNC", "rightsBasis", "rightsVerifiedBy", "articleCount" from "Journal"`);
  return rows.map(toHeld);
}
export const toHeld = (j: any): Held => ({ ...j, articleCount: Number(j.articleCount) || 0, subjects: (() => { try { const v = typeof j.subjects === 'string' ? JSON.parse(j.subjects || '[]') : (j.subjects ?? []); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } })() });
