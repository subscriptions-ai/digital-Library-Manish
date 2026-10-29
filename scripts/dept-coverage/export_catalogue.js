// Read-only snapshot of the catalogue (identity, status, department, rights label, article counts) for de-duplication and before/after counts.
// Run through `docker exec -i -w /app <app> node -`; one READ ONLY transaction, nothing is written.
const { PrismaClient } = require('@prisma/client');
(async () => { const p = new PrismaClient();
 const r = await p.$transaction(async tx => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 120000");
  const all = await tx.$queryRawUnsafe(`select j.id, j.title, j.issn, j.eissn, j.status::text status, j.domain, j."publisherName" publisher, j."rightsBasis" basis, j.homepage, j.country, j."createdAt",
     coalesce(a.n,0)::int pubArticles from "Journal" j left join (select "journalId", count(*) n from "Article" where status::text='Published' and "journalId" is not null group by 1) a on a."journalId"=j.id`);
  return { at: new Date().toISOString(), all }; });
 process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })();
