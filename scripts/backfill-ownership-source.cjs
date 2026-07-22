// One-time, idempotent backfill of Article/Book.ownershipSource for rows created
// before the field existed. Safe to re-run.
//   source = 'Admin'   -> AdminEntered
//   source = 'Manual'  -> PublisherSubmitted (publisher self-submit or admin-on-behalf)
//   everything else (OpenAlex/DOAJ/EuropePMC/arXiv/null) -> Ingested (schema default)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  for (const model of ['article', 'book']) {
    const admin = await prisma[model].updateMany({
      where: { source: 'Admin', ownershipSource: 'Ingested' },
      data: { ownershipSource: 'AdminEntered' },
    });
    const pub = await prisma[model].updateMany({
      where: { source: 'Manual', ownershipSource: 'Ingested' },
      data: { ownershipSource: 'PublisherSubmitted' },
    });
    console.log(`${model}: AdminEntered=${admin.count}, PublisherSubmitted=${pub.count}, (rest stay Ingested)`);
  }
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
