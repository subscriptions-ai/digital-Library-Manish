import { createHash } from 'node:crypto';
import { canonicalLicence } from './licence.js';
import { isbn13s } from './identifiers.js';
import { licenceAllowsCommercialUse } from '../eligibility.js';

/**
 * OPEN LIBRARY / INTERNET ARCHIVE FULL-TEXT ELIGIBILITY — the rules, as pure functions (no network, no database).
 *
 * The question: of the Books we hold only as metadata from Open Library, which have a file the Internet Archive lets anyone read AND a licence that clearly allows us to redistribute it?
 *
 *   Book → (Open Library edition / ISBN / work) → Internet Archive item → how it is accessed → what licence it carries → is there a file → verdict
 *
 * NOTHING that merely says "you can read this" is permission to copy it. Readable, borrowable, downloadable and "preview available" are all about ACCESS; only an explicit licence or a
 * public-domain mark is about RIGHTS. So a full-text CANDIDATE needs all of: Open Library says the item is openly readable (`full`), the Internet Archive item is not access-restricted, its
 * `licenseurl` names a licence our existing book policy allows (CC0, Public Domain Mark, CC BY, CC BY-SA, CC BY-ND — `licenceAllowsCommercialUse`, the one rule the rest of the catalogue
 * uses), the item is the same edition as the Book (identity is cross-checked, never assumed), and a PDF or EPUB that is not DRM-wrapped exists. Everything else stays Metadata Only + a link.
 * The licence is the UPLOADER'S declaration on the item, so a candidate is a candidate for review and ingestion, never an automatic publication.
 */

export const CATEGORIES = ['reuseSafe', 'readableLicenceUnknown', 'readableLicenceRestricted', 'borrowOnly', 'previewOnly', 'noFile', 'ambiguous', 'unmatched', 'couldNotCheck'] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  reuseSafe: 'Full-text candidate — openly readable, explicit reuse licence, a file exists',
  readableLicenceUnknown: 'Openly readable, but no licence that allows reuse is declared',
  readableLicenceRestricted: 'Openly readable, but the licence does not allow our use (non-commercial or similar)',
  borrowOnly: 'Borrow only (lending library / access-restricted)',
  previewOnly: 'Preview, search-inside or print-disabled access only',
  noFile: 'Matched, but there is no usable file (no archive item, or no PDF/EPUB without DRM)',
  ambiguous: 'Cannot be matched with confidence (shared ISBN, several archive items, or identity not confirmed)',
  unmatched: 'Not found at Open Library / the Internet Archive',
  couldNotCheck: 'Could not be checked (source unavailable, rate limited, or the request budget ended)',
};

/** What the audit knows about one Book. */
export type BookRef = { id: string; source: string | null; sourceRecordId: string | null; isbn: string | null; title: string; domain: string | null; suggested: string | null; status: string };
export type BookIds = { edition: string | null; work: string | null; isbn13: string | null };
export function idsOf(b: Pick<BookRef, 'sourceRecordId' | 'isbn'>): BookIds {
  const rid = String(b.sourceRecordId ?? '').trim().toUpperCase();
  return { edition: /^OL\d+M$/.test(rid) ? rid : null, work: /^OL\d+W$/.test(rid) ? rid : null, isbn13: isbn13s([b.isbn])[0] ?? null };
}
export const departmentOf = (b: Pick<BookRef, 'domain' | 'suggested'>) => (b.domain?.trim() ? b.domain.trim() : b.suggested?.trim() ? `${b.suggested.trim()} (suggested)` : 'Unassigned');

// ── Open Library ────────────────────────────────────────────────────────────────

export type Avail = 'full' | 'borrow' | 'restricted' | 'unknown';
export type ArchiveRef = { ocaid: string; availability: Avail };
export type Match = {
  via: 'edition' | 'isbn' | 'work';
  editionKey: string | null; workKey: string | null;
  archive: ArchiveRef[];
  isbns: string[];
};

/** Open Library's word for how an item may be accessed → ours. `full` is the only one that means "anyone may read it". */
export function availOf(v: unknown): Avail {
  const s = String(v ?? '').toLowerCase();
  if (s === 'full' || s === 'public') return 'full';
  if (s === 'borrow' || s === 'borrowable') return 'borrow';
  if (s === 'restricted' || s === 'printdisabled' || s === 'no_ebook' || s === 'noview') return 'restricted';
  return 'unknown';
}
const ocaidFromUrl = (u: unknown) => /archive\.org\/details\/([^/?#]+)/.exec(String(u ?? ''))?.[1] ?? null;

/** One entry of `api/books?jscmd=data` (an edition). */
export function matchFromEdition(entry: any, via: 'edition' | 'isbn'): Match {
  const key = /\/books\/(OL\d+M)/.exec(String(entry?.key ?? ''))?.[1] ?? (entry?.identifiers?.openlibrary?.[0] ? String(entry.identifiers.openlibrary[0]) : null);
  const ebooks: any[] = Array.isArray(entry?.ebooks) ? entry.ebooks : [];
  const seen = new Map<string, ArchiveRef>();
  for (const e of ebooks) { const id = ocaidFromUrl(e?.preview_url); if (id && !seen.has(id)) seen.set(id, { ocaid: id, availability: availOf(e?.availability) }); }
  const ids = entry?.identifiers ?? {};
  return { via, editionKey: key, workKey: null, archive: [...seen.values()], isbns: isbn13s([...(ids.isbn_13 ?? []), ...(ids.isbn_10 ?? [])]) };
}
/** One doc of `search.json` (a work), asked for with ia / ebook_access. */
export function matchFromWork(doc: any): Match {
  const ia: string[] = Array.isArray(doc?.ia) ? [...new Set<string>(doc.ia.map(String))] : [];
  const a = availOf(doc?.ebook_access);
  return { via: 'work', editionKey: null, workKey: /(OL\d+W)/.exec(String(doc?.key ?? ''))?.[1] ?? null, archive: ia.map(ocaid => ({ ocaid, availability: a })), isbns: isbn13s(Array.isArray(doc?.isbn) ? doc.isbn.slice(0, 60) : []) };
}

// ── Internet Archive ────────────────────────────────────────────────────────────

export type IaFile = { name: string; format: string | null; size: number | null };
export type IaItem = {
  identifier: string; licenseurl: string | null; rights: string | null; copyrightStatus: string | null; restricted: boolean; collections: string[];
  olEdition: string | null; olWork: string | null; isbns: string[]; files: IaFile[];
};
const one = (v: any): string | null => { const x = Array.isArray(v) ? v[0] : v; const s = x == null ? '' : String(x).trim(); return s || null; };
export function parseIa(json: any): IaItem | null {
  const m = json?.metadata; if (!m || typeof m !== 'object' || !m.identifier) return null;
  const truthy = (v: any) => String(Array.isArray(v) ? v[0] : v ?? '').toLowerCase() === 'true';
  return {
    identifier: String(m.identifier), licenseurl: one(m.licenseurl), rights: one(m.rights), copyrightStatus: one(m['possible-copyright-status']),
    restricted: truthy(m['access-restricted-item']), collections: (Array.isArray(m.collection) ? m.collection : m.collection ? [m.collection] : []).map(String),
    olEdition: one(m.openlibrary_edition), olWork: one(m.openlibrary_work),
    isbns: isbn13s((Array.isArray(m.isbn) ? m.isbn : m.isbn ? [m.isbn] : []).map(String)),
    files: (Array.isArray(json.files) ? json.files : []).map((f: any) => ({ name: String(f?.name ?? ''), format: f?.format ? String(f.format) : null, size: f?.size != null && Number.isFinite(Number(f.size)) ? Number(f.size) : null })),
  };
}

export type LicenceReading = { licence: string | null; allowed: boolean; kind: 'allowed' | 'restricted' | 'unknown'; basis: 'licenseurl' | 'none'; note?: 'publicDomainFlagOnly' | 'unrecognisedLicenceUrl' };
/**
 * The licence the item DECLARES, by its `licenseurl` only. Free-text `rights`, collection names and the Archive's own "possible copyright status" flag are not rights: a flag alone
 * (NOT_IN_COPYRIGHT) is reported as a note for a person to look at, and never makes an item a candidate.
 */
export function licenceFromIa(ia: Pick<IaItem, 'licenseurl' | 'copyrightStatus'>): LicenceReading {
  const u = String(ia.licenseurl ?? '').trim().toLowerCase();
  if (u) {
    let licence: string | null = null;
    if (/creativecommons\.org\/publicdomain\/zero\//.test(u)) licence = 'CC0';
    else if (/creativecommons\.org\/publicdomain\/mark\//.test(u)) licence = 'Public Domain';
    else { const m = /creativecommons\.org\/licenses\/([a-z-]+)(?:\/|$)/.exec(u); if (m) licence = canonicalLicence(`CC ${m[1]}`); }
    if (!licence) return { licence: null, allowed: false, kind: 'unknown', basis: 'licenseurl', note: 'unrecognisedLicenceUrl' };
    const allowed = licenceAllowsCommercialUse(licence);
    return { licence, allowed, kind: allowed ? 'allowed' : 'restricted', basis: 'licenseurl' };
  }
  return { licence: null, allowed: false, kind: 'unknown', basis: 'none', ...(String(ia.copyrightStatus ?? '').toUpperCase() === 'NOT_IN_COPYRIGHT' ? { note: 'publicDomainFlagOnly' as const } : {}) };
}

/** The file we could take: a PDF (best a text-layer one) or an EPUB, never one wrapped in DRM (ACS / LCP / "encrypted"). Never downloaded here: only named. */
export function pickFile(files: IaFile[]): IaFile | null {
  const ok = files.filter(f => /\.(pdf|epub)$/i.test(f.name) && !/encrypted|_lcp|\.lcpdf$|acs/i.test(`${f.name} ${f.format ?? ''}`));
  const rank = (f: IaFile) => (/text pdf/i.test(f.format ?? '') ? 0 : /\.pdf$/i.test(f.name) && !/additional|image/i.test(f.format ?? '') ? 1 : /\.epub$/i.test(f.name) ? 2 : /additional text pdf/i.test(f.format ?? '') ? 3 : 4);
  return ok.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))[0] ?? null;
}

// ── The verdict ─────────────────────────────────────────────────────────────────

export type Verdict = {
  category: Category; reasons: string[];
  ocaid?: string; olEdition?: string | null; licence?: string | null; licenceBasis?: string; file?: { name: string; format: string | null; size: number | null } | null;
  /** A short hash of the source facts the verdict rests on: a later audit that finds a different one knows the source record changed. */
  sourceFingerprint?: string;
};
export type ArchiveLookup = IaItem | 'error' | null;      // null: the Archive has no such item

/** Does the Archive item describe the same book as ours? Cross-checked on the edition, the ISBN, or (for a work-level record) the work. */
function identityConfirmed(b: BookIds, m: Match, ia: IaItem): boolean {
  if (ia.olEdition && ((m.editionKey && ia.olEdition.toUpperCase() === m.editionKey) || (b.edition && ia.olEdition.toUpperCase() === b.edition))) return true;
  if (b.isbn13 && ia.isbns.includes(b.isbn13)) return true;
  if (m.via === 'work' && b.work && ia.olWork && ia.olWork.toUpperCase() === b.work) return true;
  return false;
}

const fp = (o: unknown) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);

/**
 * One Book's verdict from what the sources said. `match` is null when Open Library knows nothing of it, 'error' when it could not be asked.
 * `dupIsbn`: another Book in the catalogue has the same ISBN (nothing is merged here; a shared ISBN is simply not decided).
 */
export function judge(book: BookIds, match: Match | null | 'error', ia: (ocaid: string) => ArchiveLookup | undefined, dupIsbn = false): Verdict {
  if (dupIsbn) return { category: 'ambiguous', reasons: ['another Book in the catalogue has the same ISBN; not decided, never merged'] };
  if (match === 'error') return { category: 'couldNotCheck', reasons: ['Open Library could not be read'] };
  if (!match) return { category: 'unmatched', reasons: ['no Open Library record for this edition, ISBN or work'] };
  if (!match.archive.length) return { category: 'noFile', reasons: ['Open Library lists no Internet Archive item for it'], olEdition: match.editionKey, sourceFingerprint: fp({ m: match.editionKey ?? match.workKey, a: [] }) };
  if (match.archive.length > 1) return { category: 'ambiguous', reasons: [`${match.archive.length} Internet Archive items (${match.archive.slice(0, 3).map(a => a.ocaid).join(', ')}…): a person must say which is this edition`], olEdition: match.editionKey, sourceFingerprint: fp({ a: match.archive.map(a => a.ocaid).sort() }) };
  const a = match.archive[0]; const base = { ocaid: a.ocaid, olEdition: match.editionKey };
  if (a.availability === 'borrow') return { category: 'borrowOnly', reasons: ['lending library: it can be borrowed, not redistributed'], ...base, sourceFingerprint: fp({ a }) };
  if (a.availability === 'restricted') return { category: 'previewOnly', reasons: ['access is a preview, search-inside or print-disabled only'], ...base, sourceFingerprint: fp({ a }) };
  if (a.availability !== 'full') return { category: 'couldNotCheck', reasons: ['Open Library does not say how it may be accessed'], ...base, sourceFingerprint: fp({ a }) };

  const item = ia(a.ocaid);
  if (item === undefined || item === 'error') return { category: 'couldNotCheck', reasons: ['the Internet Archive item could not be read'], ...base };
  if (item === null) return { category: 'noFile', reasons: ['the Internet Archive has no such item'], ...base, sourceFingerprint: fp({ a, gone: true }) };
  if (item.restricted) return { category: 'borrowOnly', reasons: ['Open Library says readable, but the Archive item is access-restricted (lending): treated as borrow only'], ...base, sourceFingerprint: fp({ a, r: true }) };
  if (!identityConfirmed(book, match, item)) return { category: 'ambiguous', reasons: ['the Archive item does not confirm it is this edition (no matching Open Library edition, ISBN or work)'], ...base, sourceFingerprint: fp({ a, e: item.olEdition, i: item.isbns }) };

  const lic = licenceFromIa(item); const file = pickFile(item.files);
  const facts = { a, lic: [lic.licence, lic.kind, lic.note], file: file?.name ?? null, size: file?.size ?? null, status: item.copyrightStatus };
  const out = { ...base, licence: lic.licence, licenceBasis: lic.basis, file: file ? { ...file } : null, sourceFingerprint: fp(facts) };
  if (lic.kind === 'restricted') return { category: 'readableLicenceRestricted', reasons: [`readable, but declared ${lic.licence}: it does not allow our use`], ...out };
  if (lic.kind === 'unknown') return { category: 'readableLicenceUnknown', reasons: [lic.note === 'publicDomainFlagOnly' ? 'readable; the Archive flags it as possibly out of copyright, which is not a declared licence — for a person to check' : lic.note === 'unrecognisedLicenceUrl' ? 'readable; the licence address is not one we recognise' : 'readable, but no licence is declared'], ...out };
  if (!file) return { category: 'noFile', reasons: [`${lic.licence} declared, but the item has no PDF or EPUB without DRM`], ...out };
  return { category: 'reuseSafe', reasons: [`${lic.licence} declared by the uploader; openly readable; ${file.format ?? file.name}`], ...out };
}
