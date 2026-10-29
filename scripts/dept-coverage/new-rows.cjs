// Read-only: every journal created after a given instant (set by `var __SINCE__ = "<iso>";`), to catch anything another writer added since our catalogue snapshot.
const { PrismaClient } = require('@prisma/client');
(async () => { const p = new PrismaClient();
  const r = await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 60000');
    const rows = await tx.$queryRawUnsafe(`select id, title, issn, eissn, status::text status, domain, "publisherName" publisher, "rightsBasis" basis, "createdAt" from "Journal" where "createdAt" > $1::timestamptz order by "createdAt"`, __SINCE__);
    const total = (await tx.$queryRawUnsafe('select count(*)::int n from "Journal"'))[0].n;
    return { at: new Date().toISOString(), total, rows }; });
  process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
