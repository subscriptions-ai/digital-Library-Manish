// READ-ONLY review of what a rollback of one run would touch (placeholders __IDS__, __RUN__, __LABELS__). Nothing is executed or changed.
// Foreign keys onto "Journal" (and their ON DELETE action), rows that reference the run's journals (hard and soft references), how widely each rightsBasis label is used (to show a label alone is not a scope),
// how many rows the scoped statement would match, and the audit rows of the run (they have no FK and are never deleted).
const { PrismaClient } = require('@prisma/client');
const ids = __IDS__, RUN = '__RUN__', labels = __LABELS__;
(async () => { const p = new PrismaClient();
 const r = await p.$transaction(async tx => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 60000");
  const fks = await tx.$queryRawUnsafe(`select c.conname, c.conrelid::regclass::text tbl, a.attname col, case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE' when 'n' then 'SET NULL' else 'OTHER' end ondelete from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum = any(c.conkey) where c.contype='f' and c.confrelid='"Journal"'::regclass`);
  const issns = (await tx.$queryRawUnsafe('select issn, eissn from "Journal" where id = any($1::text[])', ids)).flatMap(x => [x.issn, x.eissn].filter(Boolean));
  const refs = { articleByJournalId: (await tx.$queryRawUnsafe('select count(*)::int n from "Article" where "journalId" = any($1::text[])', ids))[0].n, articleByIssn: (await tx.$queryRawUnsafe('select count(*)::int n from "Article" where "journalIssn" = any($1::text[])', issns))[0].n,
    ingestionRun: (await tx.$queryRawUnsafe('select count(*)::int n from "IngestionRun" where "journalId" = any($1::text[])', ids))[0].n, libraryEventById: (await tx.$queryRawUnsafe('select count(*)::int n from "LibraryEvent" where "journalId" = any($1::text[])', ids))[0].n, libraryEventByIssn: (await tx.$queryRawUnsafe('select count(*)::int n from "LibraryEvent" where "journalIssn" = any($1::text[])', issns))[0].n };
  const labelUse = await tx.$queryRawUnsafe('select "rightsBasis" rb, count(*)::int total, count(*) filter (where id = any($1::text[]))::int in_run from "Journal" where "rightsBasis" = any($2::text[]) group by 1 order by 1', ids, labels);
  const wouldDelete = (await tx.$queryRawUnsafe('select count(*)::int n from "Journal" j where j.id = any($1::text[]) and j."rightsBasis" = any($2::text[]) and not exists (select 1 from "Article" a where a."journalId" = j.id)', ids, labels))[0].n;
  const aud = await tx.$queryRawUnsafe("select id, \"adminId\", meta->>'batch' batch, jsonb_array_length(coalesce(meta->'inserted','[]'::jsonb)) n from \"IngestionAudit\" where action='JOURNAL_SOURCE_IMPORT' and meta->>'runId'=$1 order by at", RUN);
  const auditFks = (await tx.$queryRawUnsafe(`select count(*)::int n from pg_constraint where contype='f' and conrelid='"IngestionAudit"'::regclass`))[0].n;
  return { foreignKeysOntoJournal: fks, referencesToTheRun: refs, labelUse, scopedDeleteMatches: wouldDelete, auditRows: aud, auditTableForeignKeys: auditFks }; });
 console.log(JSON.stringify(r)); await p.$disconnect(); })();
