/**
 * Publication-year policy, one rule per kind of content — never one window for everything.
 *
 *   ARTICLES  a new article must be published in or after `articleMinYear` (default 2020). An older one is outside the current article
 *             collection and is not written; one with no year waits for review. Nothing is ever given the current year as a guess.
 *   BOOKS     a new book published in or after `bookMinYear` (default 2000) goes through the normal book rules. An older one, or one with no
 *             year, is not refused — it waits for review, where a person may approve an important older title without the policy changing.
 *   JOURNALS  no year rule for the journal title. A journal founded in 1985 is a valid journal; what its articles may be is the article rule.
 *
 * These apply to NEW ingestion only. Nothing already in the catalogue is re-judged, archived or rewritten by them.
 */

export const ARTICLE_MIN_YEAR_DEFAULT = 2020;
export const BOOK_MIN_YEAR_DEFAULT = 2000;

const valid = (v: unknown, lo: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= new Date().getFullYear() ? (v as number) : null);

/** The article minimum year from the engine's saved state, or the default. */
export const articleMinYear = (state?: { articleMinYear?: unknown } | null) => valid(state?.articleMinYear, 1900) ?? ARTICLE_MIN_YEAR_DEFAULT;
/** The book minimum year from the engine's saved state, or the default. */
export const bookMinYear = (state?: { bookMinYear?: unknown } | null) => valid(state?.bookMinYear, 1500) ?? BOOK_MIN_YEAR_DEFAULT;

/** `ok` true: eligible. Otherwise `outcome` and `reason` say why. (One flat shape: this project does not narrow unions without strict null checks.) */
export type ArticleYear = { ok: boolean; outcome?: 'too-old' | 'no-year'; reason?: string };

export function articleYearVerdict(year: number | null | undefined, minYear: number): ArticleYear {
  if (year == null || !Number.isFinite(year)) return { ok: false, outcome: 'no-year', reason: 'no publication year — held for review, never given the current year' };
  if (year < minYear) return { ok: false, outcome: 'too-old', reason: `published ${year}, before the article policy year ${minYear}` };
  return { ok: true };
}

export type BookYear = { ok: boolean; outcome?: 'older' | 'no-year'; reason?: string };

export function bookYearVerdict(year: number | null | undefined, minYear: number): BookYear {
  if (year == null || !Number.isFinite(year)) return { ok: false, outcome: 'no-year', reason: 'no publication year — held for review' };
  if (year < minYear) return { ok: false, outcome: 'older', reason: `published ${year}, before the book policy year ${minYear} — held for review; a person may approve it if it is an important title and its rights allow` };
  return { ok: true };
}
