import { fetchSourceJson, fetchRaw, SourceParseError } from '../sourceHealth.js';
import { licenceFromProse } from '../licenceProse.js';
import { canonicalLicence } from './licence.js';
import type { NormalisedBook } from './normalise.js';

/**
 * Pressbooks Directory — openly published textbooks from colleges and universities, through the directory's public OPDS feed.
 *
 *   GET https://pressbooks.directory/opds?page=N     (OPDS 2.0 JSON, 20 books a page, ~3,500 books)
 *
 * The feed gives title, authors, the publishing institution, language, subjects (Thema headings), the book's own site and the links to its
 * exports. It gives NO licence: a Pressbooks book is whatever its author chose, from CC BY to all rights reserved, and the directory lists
 * all of them. So the licence is a second question, asked of the book itself and answered only by what the book says:
 *
 *   · each book's own site publishes its licence at /wp-json/pressbooks/v2/metadata (`license.url` / `license.name`). It is read for books
 *     not already held, a few per batch, with a short deadline and no retries, through the raw transport — a third-party college site that
 *     is slow or down is not a failure of the directory and never counts against its breaker;
 *   · a licence found there is canonicalised ("CC BY 4.0" → CC BY) and decides, through the shared rights rules, whether the book may be
 *     offered as Open External. A book whose licence is not found, is not Creative Commons, or does not parse stays Metadata Only. Nothing is
 *     assumed from the book being in the directory, and the cover is kept only for a book whose licence is open;
 *   · the provider is review-first. Subjects are words and the feed carries no controlled code, so the classifier can only say "review"
 *     (words alone never auto-publish) — a person places the book, with its licence in front of them.
 */
export const PRESSBOOKS_OPDS = 'https://pressbooks.directory/opds';
export const PRESSBOOKS_PROVIDER = 'Pressbooks';

const contact = () => process.env.OPENALEX_CONTACT || 'info@celnet.in';
export const pressbooksHeaders = () => ({ 'User-Agent': `STM Digital Library (mailto:${contact()})`, Accept: 'application/opds+json, application/json' });

const selfLink = (it: any): string | null => {
  const l = (Array.isArray(it?.links) ? it.links : []).find((x: any) => x?.rel === 'self' && /^https?:\/\//i.test(x?.href || ''));
  return l?.href ?? null;
};

export function normalisePressbooksBook(provider: string, it: any): NormalisedBook | null {
  const m = it?.metadata;
  const title = String(m?.title || '').replace(/\s+/g, ' ').trim();
  const id = String(m?.identifier || '').trim();
  const landing = selfLink(it);
  if (!title || !id || !landing) return null;
  const authors = String(m?.author || '').replace(/\s+/g, ' ').trim() || null;
  const publisher = String(m?.publisher || '').trim() || null;
  if (!authors && !publisher) return null;
  const subjects = (Array.isArray(m?.subject) ? m.subject : []).map((s: any) => String(s?.name ?? s).trim()).filter(Boolean)
    // Thema's reading-age headings say nothing about a department.
    .filter((s: string) => !/^children.s\s*\/|^teenage/i.test(s)).slice(0, 20);
  return {
    provider, sourceRecordId: id, title, authors, editors: null, publisherName: publisher,
    year: null, doi: null, isbns: [], language: typeof m?.language === 'string' ? m.language : null,
    description: m?.description ? String(m.description).replace(/\s+/g, ' ').trim() : null,
    subjects, classifications: [], pages: null, lcc: [], edition: null, country: null,
    coverUrl: null,                                   // kept only once the licence is known to be open (see applyPressbooksLicence)
    landingUrl: landing, externalUrl: landing, fileUrl: null,
    licence: null, licenceBasis: 'none',
    modified: m?.modified ?? null, deleted: false,
    extra: { coverCandidate: it?.images?.[0]?.href ?? null },
  };
}

/** The book's own statement of its licence, from the metadata its site publishes. Null when it says nothing usable. */
export function licenceFromMetadata(meta: any): string | null {
  const lic = meta?.license ?? meta?.['license'];
  const text = [lic?.url, lic?.name, typeof lic === 'string' ? lic : null].filter(Boolean).join(' ');
  return canonicalLicence(licenceFromProse(text));
}

export type LicenceCheck = { licence: string | null; reason: 'found' | 'not-found' | 'unreachable' | 'no-statement' };

/** Ask a book's site what licence it declares. One short request, never retried, never counted against the directory. */
export async function checkPressbooksLicence(landing: string, timeoutMs = 8000): Promise<LicenceCheck> {
  let url: string;
  try { const u = new URL(landing); url = `${u.origin}${u.pathname.replace(/\/+$/, '')}/wp-json/pressbooks/v2/metadata`; } catch { return { licence: null, reason: 'unreachable' }; }
  try {
    const r = await fetchRaw(url, { headers: pressbooksHeaders(), signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { licence: null, reason: r.status === 404 ? 'not-found' : 'unreachable' };
    const body = await r.json();
    const licence = licenceFromMetadata(body);
    return licence ? { licence, reason: 'found' } : { licence: null, reason: 'no-statement' };
  } catch { return { licence: null, reason: 'unreachable' }; }
}

/** Give a book the licence its own site declared, and the cover only if that licence is open. Mutates and returns the book. */
export function applyPressbooksLicence(b: NormalisedBook, check: LicenceCheck, coverCandidate?: string | null): NormalisedBook {
  b.extra = { ...(b.extra || {}), licenceCheck: check.reason };
  if (!check.licence) return b;
  b.licence = check.licence; b.licenceBasis = 'title';
  // Only an open licence lets us show their cover; anything else stays a plain record.
  if (/^CC( BY(?!.*(ND|NC))|0)/i.test(check.licence) || /^CC0$/i.test(check.licence)) b.coverUrl = coverCandidate || (b.extra as any)?.coverCandidate || null;
  return b;
}

/** One page of the directory. `page` counts from 1; an empty page is the end. */
export async function fetchPressbooksPage(page: number) {
  return fetchSourceJson(`${PRESSBOOKS_OPDS}?page=${page}`, {
    source: PRESSBOOKS_PROVIDER, timeoutMs: 45_000, attempts: 2, headers: pressbooksHeaders(), countClientErrors: true,
    parse: (body: any) => { if (!Array.isArray(body?.publications)) throw new SourceParseError('invalid_response', 'Pressbooks Directory sent a response in a shape we do not recognise'); return body; },
  });
}
