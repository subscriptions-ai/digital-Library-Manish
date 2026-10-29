// Read-only snapshot of the catalogue for de-duplication (id, title, identifiers, status, department, publisher, rights label, homepage). Run through `docker exec -i -w /app <app> node -`.
const { PrismaClient } = require('@prisma/client');
(async () => { const p = new PrismaClient();
 const r = await p.$transaction(async tx => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 90000");
  const all = await tx.$queryRawUnsafe(`select id, title, issn, eissn, status::text status, domain, "publisherName" publisher, "rightsBasis" basis, homepage, country, "createdAt" from "Journal"`);
  return { at: new Date().toISOString(), all }; });
 process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })();
