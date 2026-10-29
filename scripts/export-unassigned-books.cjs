/**
 * Read-only export of every Book with no department (any status), as NDJSON on stdout, for the classification analysis.
 * One REPEATABLE READ, READ ONLY transaction: nothing can be written. Plain Node + @prisma/client, so it runs where the app runs:
 *   ssh … 'docker exec -i -w /app <app> node -' < scripts/export-unassigned-books.cjs > unassigned.ndjson
 * Carries the evidence the classifier reads (codes, keywords, LCC/NLM/DDC, title, a bounded abstract) plus what a person needs to judge the row.
 */
const { PrismaClient } = require('@prisma/client');
const drain = (s) => new Promise((r) => s.write('', r));
(async () => {
  const p = new PrismaClient();
  await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    let after = '';
    for (;;) {
      const rows = JSON.parse(JSON.stringify(await tx.$queryRawUnsafe(
        `select id, title, authors, left(description, 1200) description, year, source, language, licence, "licenceIsNC", status, "ownershipSource", "rejectionNote",
                "accessStatus", ("pdfUrl" is not null) "hasPdf", subject,
                metadata->'harvest'->'classifications' codes, metadata->'harvest'->'keywords' keywords,
                metadata->'harvest'->'provider'->'lcc' lcc, metadata->'harvest'->'provider'->'nlmClass' nlm, metadata->'harvest'->'provider'->'ddc' ddc,
                metadata->'harvest'->'department'->>'suggested' "storedDept", metadata->'harvest'->'department'->>'score' "storedScore"
           from "Book" where (domain is null or btrim(domain) = '') and id > $1 order by id limit 1000`, after)));
      if (!rows.length) break;
      for (const r of rows) if (!process.stdout.write(JSON.stringify(r) + '\n')) await drain(process.stdout);
      after = rows[rows.length - 1].id;
    }
  }, { timeout: 600000, maxWait: 20000 });
  await p.$disconnect();
})().catch((e) => { console.error('EXPORT FAILED', String((e && e.message) || e).slice(0, 300)); process.exit(1); });
