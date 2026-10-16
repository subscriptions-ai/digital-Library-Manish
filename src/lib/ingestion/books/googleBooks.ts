import { fetchSourceJson, SourceParseError } from '../sourceHealth.js';
import { isbn13s } from './identifiers.js';
import { fillEmptyPatch } from './merge.js';
import type { NormalisedBook } from './normalise.js';

/**
 * Google Books — metadata ENRICHMENT for books we already hold. Not a source of books.
 *
 * Asked for one thing: given a held book's ISBN, what does Google know that the record is missing — description, publisher, date, page
 * count, cover, categories? The answer fills EMPTY fields only (merge.ts: a field with a value is never replaced, nothing is written blank)
 * and is recorded under metadata.sources.googleBooks with its categories and volume id.
 *
 * Deliberately NOT done:
 *   · no discovery and no crawling — it never adds a book, and it reads only books that have an ISBN to ask about;
 *   · no rights. Google's `accessInfo` (viewability, "free ebook") is about Google's own reader, so it is never copied: licence, access
 *     status and rights fields are not touched by this module at all;
 *   · no unbounded use. A daily budget (default 100 volumes; GOOGLE_BOOKS_DAILY_LIMIT) is counted in AppSetting, and the API KEY is required:
 *     without GOOGLE_BOOKS_API_KEY the anonymous quota is shared by every caller on the platform and is routinely exhausted (HTTP 429), so
 *     this module reports "needs an API key" and does nothing rather than hammer it. 429 is honoured by the shared breaker.
 */
export const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
export const GOOGLE_BOOKS_SOURCE = 'GoogleBooks';
const BUDGET_KEY = 'ingestion.googlebooks.v1';

export const googleBooksConfigured = () => !!process.env.GOOGLE_BOOKS_API_KEY;
export const googleBooksDailyLimit = () => { const n = Number(process.env.GOOGLE_BOOKS_DAILY_LIMIT); return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 100; };

const day = () => new Date().toISOString().slice(0, 10);
// Block tags separate words; inline tags (<b>book</b>.) do not, or the full stop would float away from its word.
const strip = (s: string) => s.replace(/<\/?(p|br|div|li|ul|ol|h\d)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** A Google volume as a NormalisedBook, only so the shared fill-empty rules can read it. Never persisted as a book. */
export function volumeToBook(provider: string, v: any): NormalisedBook | null {
  const i = v?.volumeInfo; const title = String(i?.title || '').trim();
  if (!i || !title) return null;
  const ids = Array.isArray(i.industryIdentifiers) ? i.industryIdentifiers.map((x: any) => x?.identifier) : [];
  const y = /^(\d{4})/.exec(String(i.publishedDate || ''))?.[1];
  const img = i.imageLinks?.thumbnail || i.imageLinks?.smallThumbnail || null;
  return {
    provider, sourceRecordId: String(v.id || ''), title,
    authors: Array.isArray(i.authors) ? i.authors.join(', ') : null, editors: null,
    publisherName: i.publisher ? String(i.publisher) : null, year: y ? Number(y) : null, doi: null, isbns: isbn13s(ids),
    language: i.language ? String(i.language) : null,
    description: i.description ? strip(String(i.description)).slice(0, 4000) : null,
    subjects: Array.isArray(i.categories) ? i.categories.map(String) : [],
    classifications: [], pages: i.pageCount ? String(i.pageCount) : null, lcc: [], edition: null, country: null,
    // https only: the API hands back http thumbnails.
    coverUrl: img ? String(img).replace(/^http:/, 'https:') : null,
    landingUrl: null, externalUrl: null, fileUrl: null,
    licence: null, licenceBasis: 'none', modified: null, deleted: false,
  };
}

async function used(db: any): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key: BUDGET_KEY } }).catch(() => null);
  const v = row?.value as any;
  return v?.day === day() ? Number(v.used) || 0 : 0;
}
async function addUsed(db: any, n: number) {
  const total = (await used(db)) + n;
  await db.appSetting.upsert({ where: { key: BUDGET_KEY }, create: { key: BUDGET_KEY, value: { day: day(), used: total } as any, updatedBy: 'googlebooks' }, update: { value: { day: day(), used: total } as any, updatedBy: 'googlebooks' } }).catch(() => {});
}

export type EnrichResult = {
  ran: boolean; reason: string | null;
  asked: number; enriched: number; unchanged: number; notFound: number; failed: number; budgetLeft: number;
  filled: Record<string, number>;
};

/** Enrich up to `limit` held books that have an ISBN and are missing something Google can supply. */
export async function enrichFromGoogleBooks(db: any, opts: { limit?: number; pauseMs?: number } = {}): Promise<EnrichResult> {
  const out: EnrichResult = { ran: false, reason: null, asked: 0, enriched: 0, unchanged: 0, notFound: 0, failed: 0, budgetLeft: 0, filled: {} };
  if (!googleBooksConfigured()) return { ...out, reason: 'needs an API key (set GOOGLE_BOOKS_API_KEY): the anonymous quota is shared and is normally exhausted' };
  const left = Math.max(0, googleBooksDailyLimit() - (await used(db)));
  out.budgetLeft = left;
  if (left <= 0) return { ...out, reason: `today's budget of ${googleBooksDailyLimit()} lookups is used; it resets at midnight UTC` };
  const take = Math.min(opts.limit ?? 25, left, 100);

  // Books with an ISBN, missing at least one thing Google supplies, and not already asked.
  const rows: any[] = await db.$queryRawUnsafe(`
    select id, isbn from "Book"
     where isbn is not null and isbn <> '' and status = 'Published'
       and (description is null or description = '' or "coverUrl" is null or "publisherName" is null or year is null or pages is null)
       and not coalesce((metadata -> 'sources') ? 'googleBooks', false)
     order by "updatedAt" asc limit ${take}`);
  out.ran = true;
  const key = encodeURIComponent(process.env.GOOGLE_BOOKS_API_KEY!);
  for (const r of rows) {
    const isbn = String(r.isbn).replace(/[^0-9Xx]/g, '');
    const res = await fetchSourceJson(`${GOOGLE_BOOKS_API}?q=${encodeURIComponent(`isbn:${isbn}`)}&maxResults=1&projection=lite&key=${key}`, {
      source: GOOGLE_BOOKS_SOURCE, timeoutMs: 20_000, attempts: 1,
      parse: (b: any) => { if (b == null || typeof b !== 'object') throw new SourceParseError('invalid_response', 'Google Books sent a response in a shape we do not recognise'); return b; },
    });
    out.asked++;
    if (res.paused || res.rateLimited) { out.reason = res.rateLimited ? 'Google Books answered HTTP 429; it is resting' : 'Google Books is resting after failures'; break; }
    if (!res.ok) { out.failed++; continue; }
    const v = res.json?.items?.[0];
    const book = v ? volumeToBook(GOOGLE_BOOKS_SOURCE, v) : null;
    // Mark it asked either way, so a book Google does not know is not asked about again every run.
    const existing = await db.book.findUnique({ where: { id: r.id } });
    if (!existing) continue;
    const meta: any = { ...(existing.metadata || {}) };
    meta.sources = { ...(meta.sources || {}), googleBooks: { id: book?.sourceRecordId ?? null, categories: book?.subjects ?? [], checkedAt: new Date().toISOString(), found: !!book } };
    const patch = book ? fillEmptyPatch(existing, book, null, null) : {};
    delete (patch as any).originalUrl; delete (patch as any).rightsHolder; delete (patch as any).sourceRecordId;     // nothing about rights or identity comes from here
    await db.book.update({ where: { id: r.id }, data: { ...patch, metadata: meta } });
    if (!book) out.notFound++; else if (Object.keys(patch).length) { out.enriched++; for (const k of Object.keys(patch)) out.filled[k] = (out.filled[k] || 0) + 1; } else out.unchanged++;
    if (opts.pauseMs !== 0) await new Promise(r2 => setTimeout(r2, opts.pauseMs ?? 300));
  }
  await addUsed(db, out.asked);
  out.budgetLeft = Math.max(0, left - out.asked);
  return out;
}
