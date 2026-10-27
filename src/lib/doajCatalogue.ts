import Papa from 'papaparse';
import { ingestionDb as p, licenceAllowsCommercialUse, normaliseIssn } from './ingestionWorker.js';

/**
 * Every journal DOAJ lists, in one go.
 *
 * The search API stops at 1,000 results for any query ("You cannot access
 * results beyond 1000 records via this API"), so a term such as "medicine",
 * which matches 5,377 journals, can never yield more than a fifth of them, and
 * searching by department plateaued near ten thousand of DOAJ's 23,000. DOAJ
 * publishes its whole journal list as one CSV instead, with each title's
 * licence and its Library of Congress class, and that is what this reads.
 *
 * The rights rule is the one discovery already applies: a title is Accepted —
 * full text may be served — only when every licence it declares allows
 * commercial use. Everything else is catalogued as metadata only.
 *
 * Journals already held are left exactly as they are: their department, their
 * licence decision and anything an admin set. Only new titles are written.
 */

export const DOAJ_CSV_URL = 'https://doaj.org/csv';

// ── Department, from the Library of Congress class ─────────────────────────

import { parseLcc, departmentFromLcc } from './ingestion/lcc.js';
import { canonicalDepartmentName } from './departmentRegistry.js';

/**
 * Several departments have no class of their own in the Library of Congress
 * scheme — nanotechnology sits in physics, ayurveda in medicine, energy across
 * three classes. A journal that names itself one of these is put there. The
 * narrower terms are read from the title and keywords; the broader ones from
 * the title alone, so a medical journal with "rehabilitation" among twenty
 * keywords stays in medicine.
 */
const BY_TITLE_OR_KEYWORD: [RegExp, string][] = [
  [/\bnano/, 'Nano Technology'],
  [/biotechnolog/, 'Bio Technology'],
  [/ayurved|\bunani\b|\bsiddha\b|homoeopath|homeopath|traditional (chinese |indian )?medicine|herbal medicine|pharmacognosy|ethnopharmacolog/, 'Ayurveda'],
];
const BY_TITLE: [RegExp, string][] = [
  [/physiotherap|physical therapy|rehabilitat/, 'Physiotherapy'],
  [/nursing|midwifery/, 'Nursing'],
  [/\bdental|dentistry|\boral (health|surgery|medicine|science)|orthodont|periodont|endodont/, 'Dental'],
  [/renewable|solar|\benergy\b|\bfuels?\b|petroleum|power systems?/, 'Energy'],
  [/materials? science|metallurg|polymer|ceramic|composite materials/, 'Material Science'],
  [/(?<!quantum )(?<!fluid )\bmechanics\b/, 'Applied Mechanics'],
  [/\bmanagement\b|marketing|human resource|business administration|entrepreneur|tourism|hospitality/, 'Management'],
];

export function departmentForDoajRow(row: Record<string, string>): string | null {
  const title = (row['Journal title'] || '').toLowerCase();
  const keywords = (row['Keywords'] || '').toLowerCase();
  for (const [re, dep] of BY_TITLE_OR_KEYWORD) if (re.test(title) || re.test(keywords)) return dep;
  for (const [re, dep] of BY_TITLE) if (re.test(title)) return dep;
  for (const code of (row['LCC Codes'] || '').split('|')) {
    const lcc = parseLcc(code);
    const dep = lcc && departmentFromLcc(lcc.cls, lcc.num);
    if (dep) return dep;
  }
  return null;
}

// ── The check, and the import ─────────────────────────────────────────────

export type CatalogueResult = {
  inFile: number; alreadyHeld: number; added: number; accepted: number; metadataOnly: number;
  noDepartment: number; byDepartment: Record<string, number>; dryRun: boolean;
  /** Rows with no ISSN or no title: they cannot be catalogued. */
  unusable?: number;
  /** A new ISSN whose title matches a journal we hold under different ISSNs. Reported, never imported. */
  needsReview?: number;
};

export function doajRowToJournal(row: Record<string, string>) {
  const pissn = normaliseIssn(row['Journal ISSN (print version)']);
  const eissn = normaliseIssn(row['Journal EISSN (online version)']);
  const issn = pissn || eissn;
  const title = (row['Journal title'] || '').trim();
  if (!issn || !title) return null;

  // "CC BY, CC BY-NC-ND" is a journal that publishes under either; only a title
  // whose every licence allows commercial use is cleared for full text.
  const licences = (row['Journal license'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const ncAttr = /no commercial/i.test(row['License attributes'] || '');
  const ok = licences.length > 0 && !ncAttr && licences.every(l => licenceAllowsCommercialUse(l, false));

  return {
    title,
    issn,
    eissn: eissn && eissn !== issn ? eissn : (pissn ? eissn : null),
    publisherName: (row['Publisher'] || '').trim() || null,
    country: (row['Country of publisher'] || '').trim() || null,
    language: (row['Languages in which the journal accepts manuscripts'] || '').trim() || null,
    domain: canonicalDepartmentName(departmentForDoajRow(row)),
    subject: (row['Subjects'] || '').split('|')[0]?.trim() || null,
    subjects: (row['Subjects'] || '').split('|').map(s => s.trim()).filter(Boolean),
    homepage: (row['Journal URL'] || '').trim() || null,
    licence: licences.join(', ') || null,
    licenceIsNC: !ok,
    rightsBasis: 'DOAJ declaration',
    rightsVerifiedAt: new Date(),
    rightsVerifiedBy: 'ingestion',
    status: ok ? 'Accepted' : 'MetadataOnly',
  };
}

async function readCsv(csvText?: string) {
  const text = csvText ?? await (async () => {
    const r = await fetch(DOAJ_CSV_URL, { headers: { 'User-Agent': 'STM Digital Library (mailto:info@celnet.in)' } });
    if (!r.ok) throw new Error(`DOAJ answered HTTP ${r.status} for the journal list`);
    return r.text();
  })();
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
}

/** One journal we hold, as far as matching and classifying a DOAJ row needs. */
type HeldJournal = { id: string; title: string; issn: string | null; eissn: string | null; status: string; domain: string | null; published: boolean };

/**
 * Everything held, read once: by every ISSN it is known by, and by title (for the review count only).
 *
 * `byIssn` maps an ISSN to EVERY journal that carries it as its ISSN or its e-ISSN, so a DOAJ row that touches two different journals can be told
 * apart from one that touches one. `issns` and `titles` are what the rules have always used and still decide what is "held".
 */
async function readHeld() {
  const issns = new Set<string>(); const titles = new Map<string, string>(); const byIssn = new Map<string, HeldJournal[]>();
  // A public journal may hold no published article yet (publicJournals.ts); which of them have one is kept apart so a person can see where articles are still to arrive.
  const withArticles = new Set<string>((await p.$queryRawUnsafe(`select distinct "journalId" from "Article" where status = 'Published' and "journalId" is not null`) as any[]).map(r => r.journalId));
  for (const j of await p.journal.findMany({ select: { id: true, issn: true, eissn: true, title: true, status: true, domain: true } })) {
    const h: HeldJournal = { id: j.id, title: j.title, issn: j.issn, eissn: j.eissn, status: j.status, domain: j.domain, published: withArticles.has(j.id) };
    // A journal held with the same value as its ISSN and its e-ISSN (an online-only title) is one entry under that key, not two.
    for (const k of new Set([j.issn, j.eissn])) if (k) { issns.add(k); const l = byIssn.get(k); l ? l.push(h) : byIssn.set(k, [h]); }
    titles.set(j.title.trim().toLowerCase(), j.issn || '');
  }
  return { issns, titles, byIssn };
}

// ── What each "already held" journal is, to a person ──────────────────────

/**
 * Every row of the file ends in exactly one of these. They explain the difference between "held" and "public":
 *
 *   heldPublic       held and public (status Accepted or MetadataOnly), with at least one published article
 *   heldNoArticles   held and public (same statuses), but no published article yet. Both are on the public catalogue (publicJournals.ts); the split
 *                    is an ingestion diagnostic: where articles have still to arrive
 *   heldReview       held as NeedsReview, Draft or any other status the public catalogue does not offer
 *   heldRejected     held as Rejected
 *   ambiguous        the row's ISSN and e-ISSN belong to two DIFFERENT held journals; held, and listed here so a person can look
 *   listedTwice      the same journal twice in the file: held by the first
 *   sameTitle        a new ISSN whose title matches a held journal under other ISSNs (reported, never imported)
 *   unusable         no ISSN or no title: it cannot be catalogued
 *   outsideScope / beyondLimit   new, but not asked for (department, or past the limit)
 *   new              will be added
 */
export type DoajCategory = 'new' | 'heldPublic' | 'heldNoArticles' | 'heldReview' | 'heldRejected' | 'ambiguous' | 'listedTwice' | 'sameTitle' | 'unusable' | 'outsideScope' | 'beyondLimit';
export const DOAJ_CATEGORIES: DoajCategory[] = ['new', 'heldPublic', 'heldNoArticles', 'heldReview', 'heldRejected', 'ambiguous', 'listedTwice', 'sameTitle', 'unusable', 'outsideScope', 'beyondLimit'];

/** One row of the file as an inspectable record. Short keys: a whole file's worth is stored beside a check. */
export type DoajEntry = {
  /** The DOAJ title (clipped), its ISSN and its e-ISSN. */
  t: string; i: string; e: string;
  /** The held journal(s) the row matched. */
  j?: string[];
  /** Which of the row's identifiers matched. */
  by?: 'issn' | 'eissn' | 'both';
  /** 1 when the held journal's title shares almost nothing with DOAJ's: matched by identifier, but worth a second look. */
  d?: 1;
};
export type DoajInspection = { v: 1; categories: Partial<Record<DoajCategory, DoajEntry[]>> };

export type DoajBreakdown = {
  checked: number; new: number;
  heldPublic: number; heldNoArticles: number; heldReview: number; heldRejected: number;
  /** Rows that were neither new nor simply held: unusable, same title under other ISSNs, identifiers shared by two journals, listed twice. */
  skippedConflicting: number;
  skipped: { unusable: number; sameTitle: number; ambiguous: number; listedTwice: number };
  outsideScope: number; beyondLimit: number;
  /** Held matches whose title shares almost nothing with the journal DOAJ lists under that identifier (a subset of the held counts, not an addition). */
  titleDiffers: number;
  /** The exact status of every held journal a row matched. */
  heldByStatus: Record<string, number>;
};

const words = (s: string) => new Set(s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length > 1));
/** True when two titles share a good part of their words (or one holds the other). A journal that was renamed or re-spelled still agrees; an unrelated one does not. */
export function titlesAgree(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return true;                                         // nothing to compare is not a disagreement
  let shared = 0; for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size) >= 0.5;
}

export type CatalogueCheck = {
  summary: {
    inFile: number; alreadyHeld: number; new: number; fullTextEligible: number; metadataOnly: number;
    rejected: number; needsReview: number; noDepartment: number; byDepartment: Record<string, number>;
    /** With a scope: journals that are new but in a department that was not asked for, and new ones past the limit. */
    outsideScope?: number; beyondLimit?: number;
  };
  /** The ISSNs a confirmed import is allowed to add — exactly the "new" ones, and nothing else. */
  newIssns: string[];
  reviewSample: { title: string; issn: string }[];
  /** Where every row of the file ended, with counts a person can follow. Information only: it changes nothing the import does. */
  breakdown: DoajBreakdown;
  /** The rows behind those counts, by category, so each can be opened. Kept beside the check (see doajInspection.ts). */
  inspect: DoajInspection;
};

/**
 * What an import would do, without doing it.
 *
 * "Already held" means the same ISSN or e-ISSN — an identifier. It used to also mean the same title, which
 * silently refused any journal that merely shares a name with one we hold: there are four different
 * journals called "Revista de Derecho". Those are now counted as "needs review" and, as before, not imported
 * automatically; the difference is that they are reported instead of vanishing into "already held".
 */
export async function checkDoajCatalogue(opts: {
  csvText?: string;
  /** Only journals the department mapping puts in one of these are new for this check. Empty or absent means all. */
  departments?: string[];
  /** At most this many new journals. The rest are counted, not listed, and stay for another time. */
  limit?: number;
} = {}): Promise<CatalogueCheck> {
  const rows = await readCsv(opts.csvText);
  const { issns: held, titles: heldTitles, byIssn } = await readHeld();
  const out: CatalogueCheck = {
    summary: { inFile: rows.length, alreadyHeld: 0, new: 0, fullTextEligible: 0, metadataOnly: 0, rejected: 0, needsReview: 0, noDepartment: 0, byDepartment: {} },
    newIssns: [], reviewSample: [],
    breakdown: { checked: rows.length, new: 0, heldPublic: 0, heldNoArticles: 0, heldReview: 0, heldRejected: 0, skippedConflicting: 0, skipped: { unusable: 0, sameTitle: 0, ambiguous: 0, listedTwice: 0 }, outsideScope: 0, beyondLimit: 0, titleDiffers: 0, heldByStatus: {} },
    inspect: { v: 1, categories: {} },
  };
  const s = out.summary, bd = out.breakdown;
  const note = (cat: DoajCategory, e: DoajEntry) => { (out.inspect.categories[cat] ||= []).push(e); };
  for (const row of rows) {
    const j = doajRowToJournal(row);
    if (!j) { s.rejected++; bd.skipped.unusable++; note('unusable', { t: (row['Journal title'] || '').trim().slice(0, 100), i: (row['Journal ISSN (print version)'] || '').trim(), e: (row['Journal EISSN (online version)'] || '').trim() }); continue; }
    const entry: DoajEntry = { t: j.title.slice(0, 100), i: j.issn, e: j.eissn || '' };
    if (held.has(j.issn) || (j.eissn && held.has(j.eissn))) {
      s.alreadyHeld++;
      // Same rule as ever (any held ISSN or e-ISSN); this only works out WHICH journal, and what it is. The row's own ISSN decides first: two journals
      // that merely share an e-ISSN (DOAJ lists some) are told apart by their print ISSN. Only when no identifier singles out one journal is it ambiguous.
      const byPrimary = byIssn.get(j.issn) || [], byOnline = (j.eissn && byIssn.get(j.eissn)) || [];
      const list = byPrimary.length ? byPrimary : byOnline;
      if (!list.length) { bd.skipped.listedTwice++; note('listedTwice', entry); continue; }          // held only because an earlier row of this file was counted as new
      const first = list[0];
      const viaIssn = list.length === 1 ? [first.issn, first.eissn].includes(j.issn) : byPrimary.length > 0;
      const viaEissn = list.length === 1 ? !!j.eissn && [first.issn, first.eissn].includes(j.eissn) : !!byOnline.length;
      entry.j = list.map(h => h.id); entry.by = viaIssn && viaEissn ? 'both' : viaIssn ? 'issn' : 'eissn';
      for (const h of list) bd.heldByStatus[h.status] = (bd.heldByStatus[h.status] || 0) + 1;
      if (list.some(h => !titlesAgree(j.title, h.title))) { entry.d = 1; bd.titleDiffers++; }
      if (list.length > 1) { bd.skipped.ambiguous++; note('ambiguous', entry); continue; }
      const h = list[0];
      const cat: DoajCategory = h.status === 'Rejected' ? 'heldRejected' : (h.status === 'Accepted' || h.status === 'MetadataOnly') ? (h.published ? 'heldPublic' : 'heldNoArticles') : 'heldReview';
      bd[cat]++; note(cat, entry);
      continue;
    }
    const sameTitle = heldTitles.get(j.title.toLowerCase());
    if (sameTitle !== undefined) {
      s.needsReview++; bd.skipped.sameTitle++;
      note('sameTitle', entry);
      if (out.reviewSample.length < 20) out.reviewSample.push({ title: j.title, issn: j.issn });
      continue;
    }
    if (opts.departments?.length && !opts.departments.includes(j.domain as string)) { s.outsideScope = (s.outsideScope || 0) + 1; bd.outsideScope++; note('outsideScope', entry); continue; }
    if (opts.limit != null && out.newIssns.length >= opts.limit) { s.beyondLimit = (s.beyondLimit || 0) + 1; bd.beyondLimit++; note('beyondLimit', entry); continue; }
    // The same title can appear twice in the file under its two ISSNs.
    held.add(j.issn); if (j.eissn) held.add(j.eissn); heldTitles.set(j.title.toLowerCase(), j.issn);
    out.newIssns.push(j.issn);
    s.new++; bd.new++; note('new', entry);
    j.status === 'Accepted' ? s.fullTextEligible++ : s.metadataOnly++;
    if (!j.domain) s.noDepartment++;
    const k = j.domain || '(none)';
    s.byDepartment[k] = (s.byDepartment[k] || 0) + 1;
  }
  bd.skippedConflicting = bd.skipped.unusable + bd.skipped.sameTitle + bd.skipped.ambiguous + bd.skipped.listedTwice;
  return out;
}

/**
 * Add exactly the journals a check reported as new — each re-checked against the catalogue as it is now, and
 * `skipDuplicates` guards the unique ISSN column, so running it again adds nothing and overwrites nothing.
 */
export async function importCheckedJournals(allowedIssns: string[], opts: { csvText?: string } = {}) {
  const allowed = new Set(allowedIssns);
  const rows = await readCsv(opts.csvText);
  const { issns: held } = await readHeld();
  const fresh: any[] = []; let alreadyHeldNow = 0, accepted = 0, metadataOnly = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const j = doajRowToJournal(row);
    if (!j || !allowed.has(j.issn)) continue;
    if (seen.has(j.issn)) continue;                                                             // listed twice in the file: one journal
    seen.add(j.issn);
    if (held.has(j.issn) || (j.eissn && held.has(j.eissn))) { alreadyHeldNow++; continue; }     // taken since the check
    fresh.push(j);
    j.status === 'Accepted' ? accepted++ : metadataOnly++;
  }
  let added = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const r = await p.journal.createMany({ data: fresh.slice(i, i + 500), skipDuplicates: true });
    added += r.count;
  }
  return { added, alreadyHeldNow, accepted, metadataOnly, requested: allowed.size };
}

/**
 * The previous single-call entry point, kept for scripts. `dryRun` returns what a check finds; otherwise it
 * checks and then imports what the check found. The admin screen no longer calls this: it checks, shows the
 * result, and imports only after confirmation.
 */
export async function importDoajCatalogue(opts: { dryRun?: boolean; csvText?: string } = {}): Promise<CatalogueResult> {
  const check = await checkDoajCatalogue({ csvText: opts.csvText });
  const s = check.summary;
  const result: CatalogueResult = {
    inFile: s.inFile, alreadyHeld: s.alreadyHeld + s.needsReview, added: 0, accepted: s.fullTextEligible, metadataOnly: s.metadataOnly,
    noDepartment: s.noDepartment, byDepartment: s.byDepartment, dryRun: !!opts.dryRun, unusable: s.rejected, needsReview: s.needsReview,
  };
  if (!opts.dryRun) result.added = (await importCheckedJournals(check.newIssns, { csvText: opts.csvText })).added;
  return result;
}
