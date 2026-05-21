import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const contents = await prisma.content.findMany({ where: { domain: 'Medical' } });
  console.log(`Found ${contents.length} items with domain "Medical".`);
  if (contents.length > 0) {
    const res = await prisma.content.updateMany({
      where: { domain: 'Medical' },
      data: { domain: 'Medical Sciences' }
    });
    console.log(`Updated ${res.count} items.`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
