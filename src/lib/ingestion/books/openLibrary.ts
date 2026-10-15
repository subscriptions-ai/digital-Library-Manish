import { fetchSourceJson, SourceParseError } from '../sourceHealth.js';
import { isbn13s } from './identifiers.js';
import type { NormalisedBook } from './normalise.js';

/**
 * Open Library — a subject-searchable catalogue of books, used for TARGETED coverage of a department that holds few.
 *
 * What it is good for: it can be asked "books about architecture", which DOAB and OAPEN no longer answer (their search APIs refuse
 * us; their OAI feeds can only be read start to end). What it is NOT: a source of open access. Open Library lists books of every
 * kind and says nothing about a book's licence, so:
 *
 *   · licence is never set from here — Unknown licence does not mean Open Access — and every record is Metadata Only, linked to Open Library's own page;
 *   · the provider is REVIEW-FIRST: even a book the classifier is sure of waits as a Draft for a person, because the catalogue is mixed
 *     (trade books and fiction sit beside textbooks) and nothing here has been checked for being scholarly;
 *   · what is asked for is a search phrase; what is accepted is decided by the same classifier as every other book (a code AND the
 *     title or subject wording must agree), so a result for "architecture" that is not about architecture is skipped, never filed there.
 *
 * Use is bounded and polite: one request a second at most (the harvester's page delay), small pages, a User-Agent that names us and
 * how to reach us, and never a bulk crawl — Open Library publishes monthly data dumps for that, which is a different workflow.
 */

export const OPENLIBRARY_SEARCH = 'https://openlibrary.org/search.json';
const PAGE = 20;
const FIELDS = 'key,title,author_name,first_publish_year,isbn,publisher,subject,ebook_access,language,lcc,ddc,number_of_pages_median,cover_i,edition_count';

const contact = () => process.env.OPENALEX_CONTACT || 'info@celnet.in';
export const openLibraryHeaders = () => ({ 'User-Agent': `STM Digital Library (mailto:${contact()})` });

/** "NA-2520.00000000.J4 1946" → "NA2520". Open Library zero-pads the class number; the classifier reads "NA2520". */
export function lccFromOpenLibrary(raw: string): string | null {
  const m = /^([A-Z]{1,3})-?\s*0*(\d{1,4})(?:\.(\d+))?/.exec(String(raw || '').trim().toUpperCase());
  if (!m) return null;
  const frac = m[3] && /[1-9]/.test(m[3]) ? `.${m[3].replace(/0+$/, '')}` : '';
  return `${m[1]}${m[2]}${frac}`;
}

export function normaliseOpenLibraryDoc(provider: string, d: any): NormalisedBook | null {
  const title = String(d?.title || '').replace(/\s+/g, ' ').trim();
  const key = typeof d?.key === 'string' ? d.key : '';
  if (!title || !key) return null;
  const authors = (Array.isArray(d.author_name) ? d.author_name : []).map((a: any) => String(a).trim()).filter(Boolean);
  const publisher = (Array.isArray(d.publisher) ? d.publisher : []).map((p: any) => String(p).trim()).find(Boolean) || null;
  // A record with no author and no publisher is not enough to identify a book, let alone judge it.
  if (!authors.length && !publisher) return null;
  const lcc = [...new Set((Array.isArray(d.lcc) ? d.lcc : []).map(lccFromOpenLibrary).filter(Boolean) as string[])].slice(0, 6);
  const id = key.replace(/^\/works\//, '');
  const landing = `https://openlibrary.org${key}`;
  const lang = (Array.isArray(d.language) ? d.language : []).find((l: string) => l && l !== 'und') || null;
  return {
    provider,
    sourceRecordId: id,
    title,
    authors: authors.slice(0, 8).join(', ') || null,
    editors: null,
    publisherName: publisher,
    year: Number.isInteger(d.first_publish_year) ? d.first_publish_year : null,
    doi: null,
    isbns: isbn13s(Array.isArray(d.isbn) ? d.isbn.slice(0, 40) : []).slice(0, 8),
    language: lang,
    description: null,
    subjects: (Array.isArray(d.subject) ? d.subject : []).map((s: any) => String(s).trim()).filter(Boolean).slice(0, 25),
    classifications: [],
    pages: d.number_of_pages_median ? String(d.number_of_pages_median) : null,
    lcc,
    edition: null,
    country: null,
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    landingUrl: landing,
    // Open Library's own page. Never presented as a place to read it: the licence is unknown, so the access status is Metadata Only.
    externalUrl: landing,
    fileUrl: null,
    licence: null,
    licenceBasis: 'none',
    modified: null,
    deleted: false,
    extra: { ebookAccess: d.ebook_access ?? null, editionCount: d.edition_count ?? null, ddc: Array.isArray(d.ddc) ? d.ddc.slice(0, 4) : [] },
  };
}

/** One page of a subject search. `page` counts from 1. */
export async function fetchOpenLibraryPage(query: string, page: number, size = PAGE) {
  const url = `${OPENLIBRARY_SEARCH}?q=${encodeURIComponent(`subject:"${query}"`)}&language=eng&limit=${size}&page=${page}&fields=${FIELDS}`;
  const r = await fetchSourceJson(url, {
    source: 'OpenLibrary', timeoutMs: 45_000, attempts: 2, headers: openLibraryHeaders(), countClientErrors: true,
    parse: (body: any) => { if (!Array.isArray(body?.docs)) throw new SourceParseError('invalid_response', 'Open Library sent a response in a shape we do not recognise'); return body; },
  });
  return r;
}
