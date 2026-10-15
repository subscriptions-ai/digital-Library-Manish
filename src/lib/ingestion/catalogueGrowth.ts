import { ingestionDb } from './db.js';
import { PROVIDER_FAILURE_SQL } from './runFilter.js';

/**
 * Catalogue growth, reported as two different things that must never be added together:
 *
 *   CURRENT  what the catalogue holds right now, counted from the Journal and Book tables.
 *   EVENTS   what ingestion did in a period, summed from the run log: records it looked at, what was new, what was already held, what went
 *            to review, what was published. A record that was looked at five times is five events and one catalogue entry.
 *
 * Events can exceed growth (duplicates), and growth can exceed events (a manual publish). Neither is ever used to fill in the other.
 *
 *   Discovered / Checked   every record a run examined (the same figure: a run looks at what it discovers).
 *   New                    records that were not held before: published + sent to review (+ metadata-only journals).
 *   Duplicates             records already held, found by ISBN / DOI / provider id / ISSN / title.
 *   Review                 waiting for a person; not public.
 *   Published              made public by the run.
 *   Metadata only          catalogue entries with nowhere to read the work (journals: refused on licence; books: counted from the new rows).
 *   Rejected               records refused by a rule (no title, outside scope, no reliable department).
 *   Provider failures      runs in which a source did not answer — kept apart from record figures, never counted as failed records.
 */

export type GrowthPeriod = '24h' | '7d' | '30d' | 'all';
const HOURS: Record<GrowthPeriod, number | null> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, all: null };
export const isGrowthPeriod = (v: unknown): v is GrowthPeriod => typeof v === 'string' && v in HOURS;

export type GrowthBlock = {
  current: number;
  discovered: number; checked: number; newRecords: number; duplicates: number; review: number; published: number; metadataOnly: number; rejected: number; providerFailures: number;
};

export async function catalogueGrowth(period: GrowthPeriod = '7d', db: any = ingestionDb) {
  const hours = HOURS[period];
  const since = hours ? new Date(Date.now() - hours * 3_600_000) : new Date(0);

  const [runs]: any[] = await db.$queryRawUnsafe(`
    select
      coalesce(sum(r.added) filter (where r.phase = 'Books'), 0)::int "bAdded",
      coalesce(sum(r."skippedHeld") filter (where r.phase = 'Books'), 0)::int "bHeld",
      coalesce(sum(r."needsReview") filter (where r.phase = 'Books'), 0)::int "bReview",
      coalesce(sum(r."skippedRejected") filter (where r.phase = 'Books'), 0)::int "bRejected",
      coalesce(sum(r."skippedFailed") filter (where r.phase = 'Books'), 0)::int "bFailedWrites",
      (count(*) filter (where r.phase = 'Books' and ${PROVIDER_FAILURE_SQL}))::int "bProviderFailures",
      coalesce(sum(r."journalsSeen") filter (where r.phase = 'Journals'), 0)::int "jSeen",
      coalesce(sum(r."journalsAccepted") filter (where r.phase = 'Journals'), 0)::int "jAccepted",
      coalesce(sum(r."journalsRefused") filter (where r.phase = 'Journals'), 0)::int "jRefused",
      coalesce(sum(r."skippedHeld") filter (where r.phase = 'Journals'), 0)::int "jHeld",
      coalesce(sum(r."needsReview") filter (where r.phase = 'Journals'), 0)::int "jReview",
      coalesce(sum(r."skippedRejected") filter (where r.phase = 'Journals'), 0)::int "jRejected",
      (count(*) filter (where r.phase = 'Journals' and ${PROVIDER_FAILURE_SQL}))::int "jProviderFailures"
    from "IngestionRun" r where r."at" >= $1`, since);

  const [cat]: any[] = await db.$queryRawUnsafe(`
    select
      (select count(*) from "Journal")::int "journals",
      (select count(*) from "Journal" where status = 'Accepted')::int "journalsAccepted",
      (select count(*) from "Journal" where status = 'MetadataOnly')::int "journalsMetadataOnly",
      (select count(*) from "Journal" where status = 'NeedsReview')::int "journalsReview",
      (select count(*) from "Book" where status = 'Published')::int "books",
      (select count(*) from "Book" where status = 'Draft')::int "booksReview",
      (select count(*) from "Book" where status = 'Published' and "createdAt" >= $1 and ("accessStatus" is null or "accessStatus" = 'MetadataOnly'))::int "booksNewMetadataOnly"`, since);

  const bChecked = runs.bAdded + runs.bHeld + runs.bReview + runs.bRejected + runs.bFailedWrites;
  const books: GrowthBlock & { failedWrites: number; reviewWaiting: number } = {
    current: cat.books, discovered: bChecked, checked: bChecked, newRecords: runs.bAdded + runs.bReview, duplicates: runs.bHeld, review: runs.bReview,
    published: runs.bAdded, metadataOnly: cat.booksNewMetadataOnly, rejected: runs.bRejected, providerFailures: runs.bProviderFailures,
    failedWrites: runs.bFailedWrites, reviewWaiting: cat.booksReview,
  };
  const journals: GrowthBlock & { accepted: number; metadataOnlyHeld: number; reviewWaiting: number } = {
    current: cat.journals, discovered: runs.jSeen, checked: runs.jSeen, newRecords: runs.jAccepted + runs.jRefused + runs.jReview, duplicates: runs.jHeld, review: runs.jReview,
    published: runs.jAccepted, metadataOnly: runs.jRefused, rejected: runs.jRejected, providerFailures: runs.jProviderFailures,
    accepted: cat.journalsAccepted, metadataOnlyHeld: cat.journalsMetadataOnly, reviewWaiting: cat.journalsReview,
  };
  return { period, since: hours ? since.toISOString() : null, books, journals };
}

/** Who the catalogue came from: books by source and journals by the basis they were admitted on. */
export async function providerCoverage(db: any = ingestionDb) {
  const books: any[] = await db.$queryRawUnsafe(`
    select coalesce(source, '(none)') source, (count(*) filter (where status = 'Published'))::int published, (count(*) filter (where status = 'Draft'))::int review
      from "Book" group by 1 order by 2 desc`);
  const journals: any[] = await db.$queryRawUnsafe(`
    select coalesce("rightsBasis", '(none)') basis, status, count(*)::int n from "Journal" group by 1, 2 order by 3 desc`);
  return { books, journals };
}
