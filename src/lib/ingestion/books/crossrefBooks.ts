import { fetchSourceJson, SourceParseError } from '../sourceHealth.js';
import { isbn13s, normaliseDoi } from './identifiers.js';
import type { NormalisedBook } from './normalise.js';

/**
 * Crossref Books — scholarly books Crossref knows about, by DOI. Metadata, not access.
 *
 * Crossref says a book EXISTS: its DOI, title, contributors, publisher, date, ISBNs. It does not say the book can be read, and the `license`
 * entries on a record describe text-and-data-mining terms, not a reader's right to the book. So:
 *   · licence is never set from here, every record is Metadata Only (no Read / Open Access button), and the provider is review-first;
 *   · the department is decided by the same classifier as every other book — and Crossref carries no controlled classification code, so a
 *     Crossref book can at best be "review" (words alone never auto-publish). That ceiling is deliberate, not a gap to loosen.
 *
 * Only the book family is asked for (book, monograph, edited-book, reference-book, textbook). `book-chapter` records are not catalogued as
 * books: a chapter is a part of a book we may hold under its own DOI, and listing each one as a title would inflate the catalogue and bury
 * the books. Chapter linking is a separate piece of work.
 *
 * Paging is Crossref's deep-paging cursor, so a walk is resumable from its token and never asks for the first page again. The same Crossref
 * health row as the article and journal sources governs it: if Crossref is resting, this rests too.
 */
export const CROSSREF_WORKS = 'https://api.crossref.org/works';
export const CROSSREF_BOOK_TYPES = ['book', 'monograph', 'edited-book', 'reference-book', 'textbook'] as const;
const SELECT = 'DOI,title,subtitle,author,editor,publisher,issued,published,published-print,published-online,language,ISBN,subject,type,abstract,URL,indexed,license';

const contact = () => process.env.OPENALEX_CONTACT || 'info@celnet.in';
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const person = (p: any) => String(p?.name || [p?.given, p?.family].filter(Boolean).join(' ') || '').replace(/\s+/g, ' ').trim();

const yearOf = (it: any): number | null => {
  for (const k of ['issued', 'published', 'published-print', 'published-online']) {
    const y = it?.[k]?.['date-parts']?.[0]?.[0];
    if (Number.isInteger(y) && y > 1400 && y < 2200) return y;
  }
  return null;
};

export function normaliseCrossrefBook(provider: string, it: any): NormalisedBook | null {
  if (!CROSSREF_BOOK_TYPES.includes(String(it?.type) as any)) return null;      // never a chapter, article or dataset
  const doi = normaliseDoi(it?.DOI);
  const main = String(Array.isArray(it?.title) ? it.title[0] : it?.title || '').replace(/\s+/g, ' ').trim();
  if (!doi || !main) return null;
  const sub = String(Array.isArray(it?.subtitle) ? it.subtitle[0] : it?.subtitle || '').replace(/\s+/g, ' ').trim();
  const title = sub && !main.toLowerCase().includes(sub.toLowerCase()) ? `${main}: ${sub}` : main;
  const authors = (Array.isArray(it.author) ? it.author : []).map(person).filter(Boolean);
  const editors = (Array.isArray(it.editor) ? it.editor : []).map(person).filter(Boolean);
  const publisher = String(it?.publisher || '').trim() || null;
  // No contributor and no publisher is not enough to identify a book, let alone judge it.
  if (!authors.length && !editors.length && !publisher) return null;
  const landing = `https://doi.org/${doi}`;
  return {
    provider, sourceRecordId: doi, title,
    authors: authors.slice(0, 10).join(', ') || null, editors: editors.slice(0, 10).join(', ') || null,
    publisherName: publisher, year: yearOf(it), doi,
    isbns: isbn13s((Array.isArray(it.ISBN) ? it.ISBN : []).map((v: any) => String(v).split('/').pop())).slice(0, 8),
    language: typeof it.language === 'string' ? it.language : null,
    description: it.abstract ? strip(String(it.abstract)).slice(0, 4000) || null : null,
    subjects: (Array.isArray(it.subject) ? it.subject : []).map((s: any) => String(s).trim()).filter(Boolean).slice(0, 20),
    classifications: [], pages: null, lcc: [], edition: null, country: null, coverUrl: null,
    landingUrl: landing, externalUrl: landing, fileUrl: null,
    // Crossref says nothing about who may read the book. Unknown is not Open Access.
    licence: null, licenceBasis: 'none',
    modified: it?.indexed?.['date-time'] ?? null, deleted: false,
    extra: { crossrefType: it.type, tdmLicenceUrl: Array.isArray(it.license) ? it.license[0]?.URL ?? null : null },
  };
}

/** One page of the book family. `token` is Crossref's cursor ('*' to start); `from` (YYYY-MM-DD) limits it to records indexed since. */
export async function fetchCrossrefBooksPage(token: string | null, from: string | null, rows = 100) {
  const filters = [...CROSSREF_BOOK_TYPES.map(t => `type:${t}`), ...(from ? [`from-index-date:${from.slice(0, 10)}`] : [])].join(',');
  const url = `${CROSSREF_WORKS}?filter=${encodeURIComponent(filters)}&rows=${rows}&select=${encodeURIComponent(SELECT)}&cursor=${encodeURIComponent(token || '*')}&mailto=${encodeURIComponent(contact())}`;
  return fetchSourceJson(url, {
    source: 'Crossref', timeoutMs: 60_000, attempts: 2, headers: { 'User-Agent': `STM Digital Library (mailto:${contact()})` },
    parse: (body: any) => { if (!Array.isArray(body?.message?.items)) throw new SourceParseError('invalid_response', 'Crossref sent a response in a shape we do not recognise'); return body; },
  });
}
