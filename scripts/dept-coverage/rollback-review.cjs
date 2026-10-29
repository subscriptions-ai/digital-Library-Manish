/**
 * READ-ONLY review of what a rollback of this run would do. Sets `var __IDS__ = [...];` and `var __RUN__ = "...";` in front. Counts every dependency on the inserted journals (foreign keys, articles by id
 * and by ISSN, ingestion runs, library events), the rights-label sharing that makes the label an unsafe rollback scope, and the audit rows. Executes NOTHING that changes data.
 */
const { PrismaClient } = require('@prisma/client');
(async () => { const p = new PrismaClient();
  const r = await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 90000');
    const q = (s, ...a) => tx.$queryRawUnsafe(s, ...a);
    const issns = (await q(`select issn, eissn from "Journal" where id = any($1::text[])`, __IDS__)).flatMap(x => [x.issn, x.eissn].filter(Boolean));
    return {
      at: new Date().toISOString(), journals: __IDS__.length, issnCount: issns.length,
      fks: await q(`select conname, conrelid::regclass::text tbl, pg_get_constraintdef(oid) def from pg_constraint where confrelid = '"Journal"'::regclass and contype = 'f'`),
      soft: {
        articleByJournalId: (await q(`select count(*)::int n from "Article" where "journalId" = any($1::text[])`, __IDS__))[0].n,
        articleByIssn: (await q(`select count(*)::int n from "Article" where "journalIssn" = any($1::text[])`, issns))[0].n,
        ingestionRun: (await q(`select count(*)::int n from "IngestionRun" where "journalId" = any($1::text[])`, __IDS__))[0].n,
        libraryEventById: (await q(`select count(*)::int n from "LibraryEvent" where "journalId" = any($1::text[])`, __IDS__))[0].n,
        libraryEventByIssn: (await q(`select count(*)::int n from "LibraryEvent" where "journalIssn" = any($1::text[])`, issns))[0].n,
      },
      labelCounts: await q(`select "rightsBasis" rb, count(*)::int total, count(*) filter (where id = any($1::text[]))::int in_run from "Journal" where "rightsBasis" in (select distinct "rightsBasis" from "Journal" where id = any($1::text[])) group by 1 order by 1`, __IDS__),
      wouldDelete: (await q(`select count(*)::int n from "Journal" j where j.id = any($1::text[]) and not exists (select 1 from "Article" a where a."journalId" = j.id)`, __IDS__))[0].n,
      audit: await q(`select id, "adminId", meta->>'batch' batch, jsonb_array_length(meta->'inserted') n from "IngestionAudit" where action = 'JOURNAL_SOURCE_IMPORT' and meta->>'runId' = $1 order by at`, __RUN__),
    }; });
  process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
