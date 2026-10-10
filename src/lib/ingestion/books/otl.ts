import type { NormalisedBook } from './normalise.js';
import { isbn13s } from './identifiers.js';

/**
 * Open Textbook Library (University of Minnesota) — its structured JSON, not its web pages.
 *
 *   GET https://open.umn.edu/opentextbooks/textbooks.json?page=N     (10 books a page, ~2,000 books)
 *
 * Each book carries its own licence, authors, ISBNs, Library of Congress subjects and the places it
 * can be read. There is no "changed since" filter, so a sync is a walk of every page; the page number
 * is the checkpoint cursor.
 */
export const OTL_BASE = 'https://open.umn.edu/opentextbooks/textbooks.json';

/** The licence names the library uses, as the canonical spellings the rights rules compare against. */
const LICENCE: [RegExp, string][] = [
  [/^attribution[\s-]*non-?commercial[\s-]*share-?alike$/i, 'CC BY-NC-SA'],
  [/^attribution[\s-]*non-?commercial[\s-]*no-?deriv\w*$/i, 'CC BY-NC-ND'],
  [/^attribution[\s-]*non-?commercial$/i, 'CC BY-NC'],
  [/^attribution[\s-]*share-?alike$/i, 'CC BY-SA'],
  [/^attribution[\s-]*no-?deriv\w*$/i, 'CC BY-ND'],
  [/^attribution$/i, 'CC BY'],
  [/^(cc0|public domain|cc0 \(public domain\))$/i, 'CC0'],
  // Declared, but not a Creative Commons licence and not one our hosting rule recognises: kept by name so
  // the book is catalogued and linked, and never served from here.
  [/free documentation license|gnu fdl|gfdl/i, 'GNU FDL'],
];

export function otlLicence(raw?: string | null): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  for (const [re, canon] of LICENCE) if (re.test(t)) return canon;
  return null;                                                    // not recognised → treated as undeclared
}

const nameOf = (c: any) => c?.corporate
  ? String(c.last_name || c.first_name || '').trim()
  : [c?.first_name, c?.middle_name, c?.last_name].map((x: any) => String(x || '').trim()).filter(Boolean).join(' ');

/** First free way to read it: online before download. */
function freeFormat(formats: any[]) {
  const free = (formats || []).filter(f => f?.url && /^https?:\/\//i.test(f.url) && (f.price?.cents ?? 0) === 0);
  const pick = (types: string[]) => free.find(f => types.includes(String(f.type)));
  return { read: pick(['Online', 'eBook']) || free[0] || null, pdf: pick(['PDF']) || null };
}

export function normaliseOtlBook(provider: string, it: any): NormalisedBook | null {
  const title = String(it?.title || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const contributors: any[] = it.contributors || [];
  const people = (kind: RegExp) => contributors.filter(c => kind.test(String(c.contribution || ''))).map(nameOf).filter(Boolean);
  const { read, pdf } = freeFormat(it.formats);
  const subjects: any[] = it.subjects || [];

  return {
    provider,
    sourceRecordId: it.id != null ? String(it.id) : null,
    title,
    authors: people(/author/i).join(', ') || null,
    editors: people(/editor/i).join(', ') || null,
    publisherName: it.publishers?.[0]?.name || null,
    year: Number(it.copyright_year) || null,
    doi: null,
    isbns: isbn13s([it.isbn13, it.isbn10, ...(it.formats || []).map((f: any) => f?.isbn)]),
    language: it.language || null,
    description: it.description ? String(it.description).replace(/\s+/g, ' ').trim() : null,
    subjects: subjects.map(s => String(s.name || '').trim()).filter(Boolean),
    classifications: [],
    lcc: subjects.map(s => String(s.call_number || '').trim()).filter(Boolean),
    edition: [it.edition_statement, it.volume && `Vol. ${it.volume}`].filter(Boolean).join(', ') || null,
    pages: null,
    country: null,
    coverUrl: null,
    landingUrl: it.url || null,
    externalUrl: read?.url || pdf?.url || it.url || null,
    // Only an address that is plainly a file is worth asking about; most "PDF" entries are a web page.
    fileUrl: pdf?.url && /\.pdf($|\?)/i.test(pdf.url) ? pdf.url : null,
    licence: otlLicence(it.license),
    licenceBasis: otlLicence(it.license) ? 'title' : 'none',
    modified: it.updated_at || null,
    deleted: false,
  };
}
