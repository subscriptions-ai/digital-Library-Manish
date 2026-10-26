import { ingestionDb as db } from './db.js';
import { istDayOf } from './runFilter.js';

/**
 * What is waiting for a person, counted from the catalogue itself (never from the run log): Drafts the engine wrote, by content type and by the
 * source that supplied them. One definition of "awaiting review", used by the Data Ingestion screen, the pipeline strip and the scheduler's
 * backpressure, so they cannot disagree.
 *
 *   Books     status 'Draft' and ownershipSource 'Ingested'   (Content Review → "Needs a department")
 *   Articles  status 'Draft' and ownershipSource 'Ingested'   (Content Review → Articles)
 *   Journals  status 'NeedsReview'                            (no review screen yet — counted and labelled as such, never hidden)
 *
 * A publisher's own submission is not an ingestion candidate and is not counted here.
 */

export type ReviewSlice = { type: 'Books' | 'Articles' | 'Journals'; source: string | null; awaiting: number; newToday: number; oldestAt: string | null };
export type ReviewQueueSummary = {
  awaiting: number; newToday: number;
  /** The creation time of the longest-waiting item, and how many days ago that was. Null when nothing waits. */
  oldestAt: string | null; oldestDays: number | null;
  byContentType: { type: ReviewSlice['type']; awaiting: number; newToday: number; oldestAt: string | null; /** False where there is no screen to review it on yet. */ reviewable: boolean }[];
  byProvider: ReviewSlice[];
  asOf: string;
};

const todayStart = (now = new Date()) => new Date(Date.parse(`${istDayOf(now)}T00:00:00Z`) - 330 * 60_000);

export async function reviewQueue(now = new Date()): Promise<ReviewQueueSummary> {
  const since = todayStart(now).toISOString();
  const q = (table: string, where: string) => db.$queryRawUnsafe(
    `select source, count(*)::int n, (count(*) filter (where "createdAt" >= (($1)::text)::timestamptz at time zone 'UTC'))::int today, min("createdAt") oldest
       from "${table}" where ${where} group by source`, since).catch(() => []);
  const [books, articles, journals] = await Promise.all([
    q('Book', `status = 'Draft' and "ownershipSource" = 'Ingested'`),
    q('Article', `status = 'Draft' and "ownershipSource" = 'Ingested'`),
    db.$queryRawUnsafe(
      `select null::text source, count(*)::int n, (count(*) filter (where "createdAt" >= (($1)::text)::timestamptz at time zone 'UTC'))::int today, min("createdAt") oldest
         from "Journal" where status = 'NeedsReview'`, since).catch(() => []),
  ]);
  const slices: ReviewSlice[] = [
    ...books.map(r => ({ type: 'Books' as const, source: r.source ?? null, awaiting: r.n, newToday: r.today, oldestAt: r.oldest ? new Date(r.oldest).toISOString() : null })),
    ...articles.map(r => ({ type: 'Articles' as const, source: r.source ?? null, awaiting: r.n, newToday: r.today, oldestAt: r.oldest ? new Date(r.oldest).toISOString() : null })),
    ...journals.filter(r => r.n > 0).map(r => ({ type: 'Journals' as const, source: null, awaiting: r.n, newToday: r.today, oldestAt: r.oldest ? new Date(r.oldest).toISOString() : null })),
  ].filter(s => s.awaiting > 0);

  const minIso = (a: (string | null)[]) => a.filter(Boolean).sort()[0] ?? null;
  const byContentType = (['Books', 'Articles', 'Journals'] as const).map(type => {
    const own = slices.filter(s => s.type === type);
    return { type, awaiting: own.reduce((n, s) => n + s.awaiting, 0), newToday: own.reduce((n, s) => n + s.newToday, 0), oldestAt: minIso(own.map(s => s.oldestAt)), reviewable: type !== 'Journals' };
  });
  const oldestAt = minIso(slices.map(s => s.oldestAt));
  return {
    awaiting: slices.reduce((n, s) => n + s.awaiting, 0), newToday: slices.reduce((n, s) => n + s.newToday, 0),
    oldestAt, oldestDays: oldestAt ? Math.floor((now.getTime() - Date.parse(oldestAt)) / 86_400_000) : null,
    byContentType, byProvider: slices.sort((a, b) => b.awaiting - a.awaiting), asOf: now.toISOString(),
  };
}

/** The scheduler's backpressure input, held for a minute (a count over three tables is not something to repeat every turn). */
let cache: { at: number; n: number } | null = null;
export async function draftsWaiting(maxAgeMs = 60_000): Promise<number> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.n;
  const [r] = await db.$queryRawUnsafe(
    `select ((select count(*) from "Book" where status = 'Draft' and "ownershipSource" = 'Ingested')
           + (select count(*) from "Article" where status = 'Draft' and "ownershipSource" = 'Ingested'))::int n`).catch(() => [{ n: 0 }]);
  cache = { at: Date.now(), n: Number(r?.n ?? 0) };
  return cache.n;
}
export const __resetReviewCache = () => { cache = null; };
