import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const flagged = await prisma.content.groupBy({
    by: ['flaggedReason'],
    where: { status: 'Draft' },
    _count: { flaggedReason: true },
    orderBy: { _count: { flaggedReason: 'desc' } },
    take: 5
  });
  console.log("Top Flagged Reasons (Drafts):");
  console.log(JSON.stringify(flagged, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
