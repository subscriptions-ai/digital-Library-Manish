import Papa from 'papaparse';
import { ingestionDb as db } from './db.js';
import { doajRowToJournal, checkDoajCatalogue } from '../doajCatalogue.js';
import { originOf } from './journalReviewAnalysis.js';
import { audit } from './audit.js';

/**
 * DOAJ identity conflicts: a DOAJ journal whose ISSN and e-ISSN we do not hold, but whose TITLE equals a journal we do hold under other ISSNs.
 *
 * The DOAJ check has never imported such a row: a title is not an identity, but it is also a real possibility that the two are one journal under
 * different ISSNs (a renamed title, a print/online mix-up). Both mistakes cost something: importing a duplicate puts one journal in the catalogue
 * twice; holding a genuinely different journal back leaves a real title out. This sorts the cases by the evidence the two records carry, and
 * says which evidence it used, so a person decides with the facts in front of them.
 *
 * Evidence (never the title alone, which is what made the conflict):
 *   publisher     the same publisher, or a clearly different one
 *   homepage      the very same journal web address (not merely the same host: one platform hosts hundreds of journals)
 *   continuity    DOAJ says this journal continues, or is continued by, an ISSN we hold
 *   country       the same or a different country of publication (held journals store a code, DOAJ a name; both are read as names)
 *   issn block    an ISSN of each issued close together (within a few numbers): the print and online ISSNs of one journal usually are
 *
 * Verdicts (a reading aid, not a decision; nothing here writes a Journal):
 *   duplicate   likely the same journal: it continues a held one, shares its web address, has the same publisher (and a country that does not contradict it),
 *               or has ISSNs issued close together
 *   distinct    likely a different journal that shares a name: a different publisher, no shared address or continuity, and a held record (from DOAJ itself)
 *               complete enough to trust that difference. A journal that changed publisher looks "different" against an older listing, so a thin held record
 *               alone never proves it.
 *   ambiguous   the evidence is missing, thin or mixed: a person has to look
 */

export type ConflictVerdict = 'distinct' | 'duplicate' | 'ambiguous';

export type DoajSide = { title: string; issn: string; eissn: string | null; publisher: string | null; country: string | null; homepage: string | null; doajUrl: string | null; alternativeTitle: string | null; continues: string[]; continuedBy: string[] };
export type HeldSide = { id: string; title: string; issn: string | null; eissn: string | null; status: string; publisher: string | null; country: string | null; homepage: string | null; department: string | null; origin: string };

export type Evidence = {
  samePublisher: boolean | null;       // null: one side has no publisher
  similarPublisher: boolean;           // not the same, but sharing a good part of the name
  sameCountry: boolean | null;
  sameHomepage: boolean | null;
  sameHost: boolean;
  continuity: boolean;
  /** An ISSN of each was issued within a few numbers of the other's (the same national block alone proves nothing: whole countries share one). */
  issnBlock: boolean;
  /** The held record is from DOAJ itself, so its publisher, country and address can be trusted as much as DOAJ's. */
  heldFromDoaj: boolean;
};

export type DoajConflict = {
  doaj: DoajSide;
  held: HeldSide[];
  verdict: ConflictVerdict;
  /** The held journal the verdict rests on. */
  against: string;
  evidence: Evidence;
  reasons: string[];
  /** Changes when the DOAJ row or the held journals do: a decision made against an older one is "look again". */
  fingerprint: string;
};

// ── Normalising ─────────────────────────────────────────────────────────

const fold = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const STOP = new Set(['the', 'of', 'and', 'de', 'la', 'del', 'el', 'y', 'e', 'da', 'do', 'di', 'ltd', 'limited', 'inc', 'llc', 'co', 'publishing', 'publisher', 'publishers', 'press', 'journals', 'journal', 'editorial', 'editora']);
const tokens = (s: unknown) => new Set(fold(s).split(' ').filter(w => w.length > 1 && !STOP.has(w)));

/** The same publisher: equal after folding, or one name wholly inside the other (two or more words), or a very high overlap. */
export function comparePublishers(a: string | null, b: string | null): { same: boolean | null; similar: boolean } {
  if (!fold(a) || !fold(b)) return { same: null, similar: false };
  if (fold(a) === fold(b)) return { same: true, similar: true };
  const fa = familyOf(a);
  if (fa >= 0 && fa === familyOf(b)) return { same: true, similar: true };
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return { same: null, similar: false };
  let shared = 0; for (const w of x) if (y.has(w)) shared++;
  const union = x.size + y.size - shared;
  // Equal word sets, or nearly. One name inside another is NOT enough: "Universidad de Concepción" sits wholly inside "Universidad Católica de la Santísima Concepción".
  const jac = shared / union;
  return { same: jac >= 0.75, similar: jac >= 0.34 };
}

export function hostAndPath(url: string | null): { host: string; path: string } | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const path = u.pathname.replace(/\/+$/, '').replace(/\/(index|default|home)(\.[a-z]+)?$/i, '').toLowerCase();
    return { host: u.hostname.replace(/^www\./, '').toLowerCase(), path };
  } catch { return null; }
}

/** Names one publisher goes by. Listings spell them differently ("BMC" and "BioMed Central" are one publisher); anything not listed is compared by its words. */
const FAMILIES: string[][] = [
  ['bmc', 'biomed central', 'springer', 'springer nature', 'springer science business media', 'springeropen', 'nature publishing group'],
  ['elsevier', 'elsevier b v', 'elsevier ltd', 'elsevier inc', 'sciencedirect'],
  ['taylor francis', 'taylor and francis', 'taylor francis group', 'routledge', 'informa'],
  ['wiley', 'john wiley sons', 'wiley blackwell', 'blackwell publishing'],
  ['oup', 'oxford university press'], ['cup', 'cambridge university press'], ['sage', 'sage publications', 'sage publishing'],
  ['mdpi', 'mdpi ag', 'multidisciplinary digital publishing institute'], ['frontiers', 'frontiers media', 'frontiers media sa'],
  ['de gruyter', 'walter de gruyter', 'degruyter brill'], ['dove medical press', 'dove press', 'dovepress'], ['hindawi', 'hindawi publishing corporation', 'hindawi limited'],
];
const familyOf = (s: string | null) => { const f = fold(s); return FAMILIES.findIndex(g => g.some(n => f === n || f.startsWith(n + ' '))); };

let regionNames: Intl.DisplayNames | null = null;
/** A country as a plain lower-case name: a two-letter code is turned into its name, a name is folded. */
export function countryName(c: string | null): string {
  const s = String(c ?? '').trim(); if (!s) return '';
  if (/^[A-Za-z]{2}$/.test(s)) { try { regionNames ||= new Intl.DisplayNames(['en'], { type: 'region' }); return fold(regionNames.of(s.toUpperCase()) || s); } catch { return fold(s); } }
  return fold(s);
}
/** Same country, reading "Moldova, Republic of" and "Moldova", or "MD", as one. Null when either is missing. */
export function sameCountryName(a: string | null, b: string | null): boolean | null {
  const x = countryName(a), y = countryName(b); if (!x || !y) return null;
  if (x === y) return true;
  const xs = new Set(x.split(' ').filter(w => w.length > 2)), ys = new Set(y.split(' ').filter(w => w.length > 2));
  const [s, l] = xs.size <= ys.size ? [xs, ys] : [ys, xs];
  return s.size > 0 && [...s].every(w => l.has(w));
}

const issnsIn = (s: unknown) => String(s ?? '').match(/\d{4}-\d{3}[\dXx]/g)?.map(x => x.toUpperCase()) ?? [];
export const clip = (s: unknown, n = 160) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// ── Judging one conflict ────────────────────────────────────────────────

export function evidenceFor(d: DoajSide, h: HeldSide): Evidence {
  const pub = comparePublishers(d.publisher, h.publisher);
  const dh = hostAndPath(d.homepage), hh = hostAndPath(h.homepage);
  const sameHost = !!dh && !!hh && dh.host === hh.host;
  const sameHomepage = dh && hh ? (sameHost && dh.path === hh.path) : null;
  const sameCountry = sameCountryName(d.country, h.country);
  const held = new Set([h.issn, h.eissn].filter(Boolean) as string[]);
  const continuity = [...d.continues, ...d.continuedBy].some(i => held.has(i));
  const body = (s: string | null) => (s && /^\d{4}-\d{3}[\dXx]$/.test(s) ? Number(s.replace('-', '').slice(0, 7)) : NaN);
  const issnBlock = [d.issn, d.eissn].some(x => x && [h.issn, h.eissn].some(y => y && Math.abs(body(x) - body(y)) <= 25));
  return { samePublisher: pub.same, similarPublisher: pub.similar, sameCountry, sameHomepage, sameHost, continuity, issnBlock, heldFromDoaj: h.origin === 'DOAJ' };
}

function verdictFor(e: Evidence, h: HeldSide): { verdict: ConflictVerdict; reasons: string[] } {
  const r: string[] = [];
  if (e.continuity) return { verdict: 'duplicate', reasons: ['DOAJ lists the held journal’s ISSN as one it continues or is continued by'] };
  if (e.sameHomepage) return { verdict: 'duplicate', reasons: ['the same journal web address'] };
  if (e.samePublisher) {
    if (e.sameCountry === false) return { verdict: 'ambiguous', reasons: ['the same publisher name, but a different country'] };
    r.push('the same publisher'); if (e.sameCountry) r.push('the same country'); if (e.issnBlock) r.push('ISSNs issued close together');
    return { verdict: 'duplicate', reasons: r };
  }
  // ISSNs issued close together to two records with the same title: print and online ISSNs of one journal are usually issued together. A DOAJ record that
  // differs in both publisher and country is the one thing that outweighs it.
  if (e.issnBlock) {
    if (e.heldFromDoaj && e.samePublisher === false && e.sameCountry === false) return { verdict: 'ambiguous', reasons: ['ISSNs issued close together, but a different publisher and country'] };
    return { verdict: 'duplicate', reasons: ['ISSNs issued close together', ...(e.samePublisher === false ? ['the publisher is named differently (it may have moved)'] : [])] };
  }
  if (e.samePublisher === false) {
    if (e.sameHost) return { verdict: 'ambiguous', reasons: ['different publisher names, but the same website host'] };
    if (e.similarPublisher) return { verdict: 'ambiguous', reasons: ['publisher names that overlap but do not match'] };
    // A journal that changed publisher looks different against an older, thinner listing. Only a held record from DOAJ itself is trusted to prove it.
    if (!e.heldFromDoaj) return { verdict: 'ambiguous', reasons: ['a different publisher name, but the held record comes from a listing with little evidence (journals change publishers, and names are spelled differently)'] };
    r.push('a different publisher'); if (e.sameCountry === false) r.push('a different country'); if (e.sameHomepage === false) r.push('a different web address');
    return { verdict: 'distinct', reasons: r };
  }
  // No publisher on one side: say what is missing.
  const missing = [!h.publisher && 'the held journal has no publisher recorded'].filter(Boolean) as string[];
  if (e.heldFromDoaj && e.sameCountry === false && e.sameHomepage === false) return { verdict: 'distinct', reasons: ['a different country and a different web address', ...missing] };
  return { verdict: 'ambiguous', reasons: missing.length ? missing : ['too little to compare'] };
}

const RANK: Record<ConflictVerdict, number> = { duplicate: 3, ambiguous: 2, distinct: 1 };

/** Judge a DOAJ row against every held journal sharing its title. The strongest evidence of sameness wins: one likely duplicate among four is enough to look. */
export function classifyConflict(doaj: DoajSide, held: HeldSide[]): DoajConflict {
  let best: { h: HeldSide; e: Evidence; v: ConflictVerdict; reasons: string[] } | null = null;
  for (const h of held) {
    const e = evidenceFor(doaj, h), { verdict, reasons } = verdictFor(e, h);
    if (!best || RANK[verdict] > RANK[best.v]) best = { h, e, v: verdict, reasons };
  }
  const b = best!;
  const fingerprint = [doaj.issn, doaj.eissn || '', doaj.title, doaj.publisher || '', ...held.map(h => `${h.id}:${h.issn || ''}:${h.eissn || ''}`).sort()].join('|');
  return { doaj, held, verdict: b.v, against: b.h.id, evidence: b.e, reasons: b.reasons, fingerprint };
}

// ── Finding the conflicts ───────────────────────────────────────────────

export type ConflictSummary = { total: number; distinct: number; duplicate: number; ambiguous: number };
export const summarise = (list: DoajConflict[]): ConflictSummary => ({ total: list.length, distinct: list.filter(c => c.verdict === 'distinct').length, duplicate: list.filter(c => c.verdict === 'duplicate').length, ambiguous: list.filter(c => c.verdict === 'ambiguous').length });

/** Every DOAJ row the check set aside because its title is a held journal's, with the evidence compared. Reads only. */
export async function findConflicts(csvText?: string): Promise<DoajConflict[]> {
  const check = await checkDoajCatalogue({ csvText });
  const rows = (check.inspect.categories.sameTitle || []);
  if (!rows.length) return [];
  const text = csvText ?? (await (await import('./quickImport.js')).loadDoajCsv());
  const byIssn = new Map<string, Record<string, string>>();
  for (const r of Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data) {
    const j = doajRowToJournal(r); if (j && !byIssn.has(j.issn)) byIssn.set(j.issn, r);
  }
  const titles = [...new Set(rows.map(e => e.t.toLowerCase().trim()))];
  // The check clips titles for storage; match on the full title from the file instead.
  const full = new Map<string, string>();
  for (const e of rows) { const r = byIssn.get(e.i); if (r) full.set(e.i, (r['Journal title'] || '').trim()); }
  const wanted = [...new Set([...titles, ...[...full.values()].map(t => t.toLowerCase())])];
  const heldRows: any[] = await db.$queryRawUnsafe(`select id, title, issn, eissn, status, "publisherName", country, homepage, domain, "rightsBasis" from "Journal" where lower(btrim(title)) = any($1::text[])`, wanted);
  const heldBy = new Map<string, HeldSide[]>();
  for (const h of heldRows) {
    const k = String(h.title).toLowerCase().trim();
    (heldBy.get(k) || heldBy.set(k, []).get(k)!).push({ id: h.id, title: h.title, issn: h.issn, eissn: h.eissn, status: h.status, publisher: h.publisherName, country: h.country, homepage: h.homepage, department: h.domain, origin: originOf(h.rightsBasis) });
  }
  const out: DoajConflict[] = [];
  for (const e of rows) {
    const r = byIssn.get(e.i); if (!r) continue;
    const title = (r['Journal title'] || '').trim();
    const held = heldBy.get(title.toLowerCase());
    if (!held?.length) continue;
    const doaj: DoajSide = {
      title: clip(title), issn: e.i, eissn: e.e || null, publisher: clip(r['Publisher'], 120) || null, country: clip(r['Country of publisher'], 60) || null, homepage: clip(r['Journal URL'], 200) || null,
      doajUrl: clip(r['URL in DOAJ'], 200) || null, alternativeTitle: clip(r['Alternative title'], 160) || null, continues: issnsIn(r['Continues']), continuedBy: issnsIn(r['Continued By']),
    };
    out.push(classifyConflict(doaj, held.map(h => ({ ...h, title: clip(h.title), publisher: h.publisher ? clip(h.publisher, 120) : null, homepage: h.homepage ? clip(h.homepage, 200) : null }))));
  }
  return out.sort((a, b) => RANK[b.verdict] - RANK[a.verdict] || a.doaj.title.localeCompare(b.doaj.title));
}

// ── A person's decision on each conflict ────────────────────────────────

/**
 * Recorded, never acted on. A decision is one small AppSetting row per DOAJ ISSN (no schema change), and an audit entry. It creates no Journal and changes no Journal:
 *   distinct   "Accept as distinct": a person judges this a different journal that shares a name. It is NOT imported by this; a later, separately approved step may.
 *   blocked    "Keep blocked": it stays out, as it is today.
 *   hold       "Hold for review": undecided, marked so it is not forgotten.
 * A decision remembers the evidence it was made on (the fingerprint); when the DOAJ row or the held journals change, it is shown as "look again".
 */
export const DECISION_PREFIX = 'doaj.conflict.v1:';
export type ConflictDecision = 'distinct' | 'blocked' | 'hold';
export const DECISIONS: ConflictDecision[] = ['distinct', 'blocked', 'hold'];
export type Decided = { decision: ConflictDecision; by: string | null; at: string; note: string | null; fingerprint: string };
export type ConflictItem = DoajConflict & { decision: Decided | null; /** Decided on evidence that has since changed. */ changedSinceDecision: boolean };

export class ConflictError extends Error { constructor(public code: 'NOT_FOUND' | 'BAD_REQUEST' | 'CHANGED', message: string, public status = 400) { super(message); } }

let cache: { at: number; list: DoajConflict[] } | null = null;
let inflight: Promise<DoajConflict[]> | null = null;
const TTL_MS = 5 * 60_000;
export const __resetConflictCache = () => { cache = null; inflight = null; };

/** The conflicts, computed once and kept five minutes: finding them reads DOAJ's whole file and every held journal. */
async function conflicts(o: { refresh?: boolean; csvText?: string } = {}): Promise<{ list: DoajConflict[]; asOf: number }> {
  if (!o.refresh && !o.csvText && cache && Date.now() - cache.at < TTL_MS) return { list: cache.list, asOf: cache.at };
  inflight ||= findConflicts(o.csvText).finally(() => { inflight = null; });
  const list = await inflight;
  if (!o.csvText) cache = { at: Date.now(), list };
  return { list, asOf: Date.now() };
}

export async function listConflicts(o: { refresh?: boolean; csvText?: string } = {}) {
  const { list, asOf } = await conflicts(o);
  const rows = await db.appSetting.findMany({ where: { key: { startsWith: DECISION_PREFIX } } });
  const by = new Map<string, Decided>(rows.map((r: any) => [String(r.key).slice(DECISION_PREFIX.length), r.value as Decided]));
  const items: ConflictItem[] = list.map(c => { const d = by.get(c.doaj.issn) ?? null; return { ...c, decision: d, changedSinceDecision: !!d && d.fingerprint !== c.fingerprint }; });
  const tally = { undecided: 0, distinct: 0, blocked: 0, hold: 0, lookAgain: 0 };
  for (const i of items) { if (!i.decision) tally.undecided++; else { tally[i.decision.decision]++; if (i.changedSinceDecision) tally.lookAgain++; } }
  return { asOf: new Date(asOf).toISOString(), summary: summarise(list), decisions: tally, items };
}

export async function decideConflict(admin: { uid?: string; email?: string } | null, issn: unknown, decision: unknown, note?: unknown, expectedFingerprint?: unknown, o: { csvText?: string } = {}) {
  if (!DECISIONS.includes(decision as ConflictDecision)) throw new ConflictError('BAD_REQUEST', 'Choose Accept as distinct, Keep blocked or Hold for review.');
  const id = String(issn ?? '').trim();
  if (!/^\d{4}-\d{3}[\dX]$/.test(id)) throw new ConflictError('BAD_REQUEST', 'A DOAJ ISSN is required.');
  const text = note == null || note === '' ? null : String(note).trim().slice(0, 500) || null;
  const { list } = await conflicts(o);
  const c = list.find(x => x.doaj.issn === id);
  if (!c) throw new ConflictError('NOT_FOUND', 'That journal is no longer an identity conflict. Reload the list.', 404);
  if (expectedFingerprint && String(expectedFingerprint) !== c.fingerprint) throw new ConflictError('CHANGED', 'The evidence for this journal changed since you opened it. Reload and look again.', 409);
  const key = DECISION_PREFIX + id;
  const prev: Decided | null = (await db.appSetting.findUnique({ where: { key } }))?.value as any ?? null;
  const rec: Decided = { decision: decision as ConflictDecision, by: admin?.email ?? null, at: new Date().toISOString(), note: text, fingerprint: c.fingerprint };
  if (prev && prev.decision === rec.decision && (prev.note ?? null) === text && prev.fingerprint === rec.fingerprint) return { ...c, decision: prev, changedSinceDecision: false, unchanged: true };
  await db.appSetting.upsert({ where: { key }, create: { key, value: rec as any, updatedBy: admin?.email ?? null }, update: { value: rec as any, updatedBy: admin?.email ?? null } });
  await audit(admin as any, 'DOAJ_CONFLICT_DECISION', { issn: id, title: c.doaj.title, decision: rec.decision, verdict: c.verdict, previous: prev?.decision ?? null, heldJournals: c.held.map(h => h.id) });
  return { ...c, decision: rec, changedSinceDecision: false, unchanged: false };
}

// ── The rule for a LATER import (nothing here writes) ──────────────────────

/**
 * The only rule by which a DOAJ identity conflict may ever become an importable journal. It is a pure function: it reads items and says which could be
 * imported and why the others cannot. There is no import behind it yet, and building one needs its own approval; this exists so that import cannot be
 * written broader than this.
 *
 *   - Only a row a named administrator explicitly marked "Accept as distinct" (decision `distinct`). The verdict is a reading aid and never enough: a
 *     "likely distinct" row that nobody accepted is refused, and so are `blocked`, `hold` and undecided rows.
 *   - The decision must still stand on the evidence it was made on: a row shown as "look again" (the DOAJ row or a held journal changed) is refused until re-decided.
 *   - A person's "distinct" outranks a "duplicate" verdict, but the plan says so (`contradictsVerdict`) so the preview can put it in front of them.
 *   - Identity, never title: the importer must still refuse a journal whose ISSN or e-ISSN is held NOW (`heldIdentifiers`), and it never merges into, edits or
 *     replaces an existing journal. The title that made the conflict plays no part in any of this.
 *   - Status: the new journal is written as NeedsReview, never Accepted. MetadataOnly is NOT offered: since 2026-10-27 a MetadataOnly journal is public the
 *     moment it exists (publicJournals.ts), so it would skip the second look. A person (or the existing journal review) promotes it afterwards.
 */
export const DISTINCT_IMPORT_STATUS = 'NeedsReview' as const;

export type DistinctImportRow = { issn: string; eissn: string | null; title: string; status: typeof DISTINCT_IMPORT_STATUS; contradictsVerdict: boolean; decidedBy: string; decidedAt: string; against: string };
export type DistinctImportRefusal = { issn: string; title: string; reason: string };

export function planDistinctImports(items: ConflictItem[], o: { heldIdentifiers?: Set<string> } = {}): { importable: DistinctImportRow[]; refused: DistinctImportRefusal[] } {
  const importable: DistinctImportRow[] = []; const refused: DistinctImportRefusal[] = [];
  const no = (c: ConflictItem, reason: string) => refused.push({ issn: c.doaj.issn, title: c.doaj.title, reason });
  const seen = new Set<string>();
  for (const c of items) {
    const d = c.decision;
    if (!d) { no(c, 'Nobody has decided this journal.'); continue; }
    if (d.decision !== 'distinct') { no(c, d.decision === 'blocked' ? 'Kept blocked.' : 'Held for review, not accepted.'); continue; }
    if (!d.by) { no(c, 'The decision has no named administrator.'); continue; }
    if (c.changedSinceDecision || d.fingerprint !== c.fingerprint) { no(c, 'The evidence changed since it was accepted; look again.'); continue; }
    const ids = [c.doaj.issn, c.doaj.eissn].filter(Boolean) as string[];
    if (ids.some(i => o.heldIdentifiers?.has(i))) { no(c, 'Its ISSN or e-ISSN is already held.'); continue; }
    if (ids.some(i => seen.has(i))) { no(c, 'Listed twice in this plan.'); continue; }
    ids.forEach(i => seen.add(i));
    importable.push({ issn: c.doaj.issn, eissn: c.doaj.eissn, title: c.doaj.title, status: DISTINCT_IMPORT_STATUS, contradictsVerdict: c.verdict === 'duplicate', decidedBy: d.by, decidedAt: d.at, against: c.against });
  }
  return { importable, refused };
}
