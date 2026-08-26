// One-time, idempotent backfill of the issuer stamp on quotations and receipts
// created before stamping existed.
//
// Every document issued up to this point was issued by Consortium eLearning
// Network Pvt. Ltd. under GSTIN 09AACCC6494M1Z1, and filed under that GSTIN.
// Those values are written literally below rather than read from the config on
// purpose: this records history, so it must stay correct even when run after
// the operating entity has changed.
//
// Run this BEFORE switching the config to the new entity.
//
//   node scripts/backfill-document-issuer.cjs           # report only
//   node scripts/backfill-document-issuer.cjs --apply   # write the stamps
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const HISTORICAL_ISSUER = {
  legalName: 'Consortium eLearning Network Pvt. Ltd.',
  positioning: 'A Division of Consortium eLearning Network Pvt. Ltd.',
  gstin: '09AACCC6494M1Z1',
  pan: 'AACCC6494M',
  cin: 'U80302DL2005PTC138759',
  iec: 'AACCC6494M',
  state: 'Uttar Pradesh',
  address: 'A-118, 1st Floor, Sector 63, Noida, Uttar Pradesh, India - 201301',
  registeredOffice: 'A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India',
  email: 'info@celnet.in',
  tel: ['0120-4781200', '0120-4781206'],
  bank: {
    accountNumber: '03942000001153',
    accountName: 'Consortium eLearning Network Pvt. Ltd.',
    bankName: 'HDFC Bank',
    branch: 'Sector-62, Noida, U.P., India',
    ifscCode: 'HDFC0002649',
  },
};

(async () => {
  for (const model of ['quotation', 'receipt']) {
    const total = await prisma[model].count();
    const unstamped = await prisma[model].count({ where: { issuer: { equals: Prisma.DbNull } } });

    console.log(
      `${model}: ${total} total, ${unstamped} without an issuer stamp` +
      (unstamped === 0 ? '  — nothing to do' : '')
    );

    if (unstamped > 0 && APPLY) {
      const { count } = await prisma[model].updateMany({
        where: { issuer: { equals: Prisma.DbNull } },
        data: { issuer: HISTORICAL_ISSUER },
      });
      console.log(`  stamped ${count} as "${HISTORICAL_ISSUER.legalName}"`);
    }
  }

  if (!APPLY) console.log('\nReport only. Re-run with --apply to write the stamps.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
