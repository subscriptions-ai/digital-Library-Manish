// READ ONLY coordinator baseline for the four new departments (run inside the app container: ssh … 'docker exec -i -w /app <app> node -' < this file).
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
const D = ['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology'];
(async () => { const r = await p.$transaction(async tx => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 90000');
  const q = (s, ...a) => tx.$queryRawUnsafe(s, ...a);
  const out = { at: new Date().toISOString(), db: (await q('select current_database() d'))[0].d, commit: process.env.SOURCE_COMMIT || null };
  out.totals = (await q(`select (select count(*)::int from "Journal") journals, (select count(*)::int from "Book") books, (select count(*)::int from "Content" where "contentType"='Books') legacy_books, (select count(*)::int from "Article") articles`))[0];
  out.journals = await q(`select j.domain, count(*)::int total, count(*) filter (where j.status in ('Accepted','MetadataOnly'))::int public, count(*) filter (where j.status='NeedsReview')::int needs_review, count(*) filter (where j.status='Accepted')::int accepted,
      count(*) filter (where j.status in ('Accepted','MetadataOnly') and exists (select 1 from "Article" a where a."journalId"=j.id and a.status='Published'))::int with_published_articles from "Journal" j where j.domain = any($1) group by 1 order by 1`, D);
  out.books = await q(`select domain, count(*)::int total, count(*) filter (where status='Published')::int published, count(*) filter (where status='Draft')::int draft, count(*) filter (where status='Published' and "accessStatus"='ViewableHere')::int readable_here,
      count(*) filter (where status='Published' and "accessStatus"='LinkOnly')::int external_link, count(*) filter (where status='Published' and ("accessStatus"='MetadataOnly' or "accessStatus" is null))::int metadata_only from "Book" where domain = any($1) group by 1 order by 1`, D);
  out.legacyBooks = await q(`select domain, status, count(*)::int n from "Content" where "contentType"='Books' and domain = any($1) group by 1,2 order by 1,2`, D);
  out.articles = await q(`select domain, count(*)::int n from "Article" where status='Published' and domain = any($1) group by 1 order by 1`, D);
  out.recentRuns = await q(`select action, coalesce(meta->>'runId','-') run, count(*)::int batches, min("at") first, max("at") last from "IngestionAudit" where "at" > now() - interval '12 hours' and action in ('JOURNAL_SOURCE_IMPORT','BOOK_SOURCE_IMPORT','BOOK_SOURCE_PUBLISH','REVIEW_BATCH_ASSIGN','JOURNAL_SOURCE_ROLLBACK') group by 1,2 order by 4`);
  out.activeLocks = await q(`select count(*)::int n from pg_locks where locktype='advisory'`);
  out.runningWriters = await q(`select count(*)::int n from pg_stat_activity where state <> 'idle' and query ilike '%insert into "Journal"%' and pid <> pg_backend_pid()`);
  return out; });
  process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })().catch(e => { console.error(e.message); process.exit(1); });
