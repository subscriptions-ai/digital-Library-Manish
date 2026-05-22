import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await (prisma as any).contentModule.updateMany({
    where: { domain: 'Medical' },
    data: { domain: 'Medical Sciences' }
  });
  console.log('Updated content modules:', res.count);
}
main().finally(() => prisma.$disconnect());
