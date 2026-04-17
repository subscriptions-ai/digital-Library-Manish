import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanGhosts() {
  try {
    const ghosts = await prisma.subscription.findMany({
      where: {
        userId: null,
        institutionId: null
      }
    });

    console.log(`Found ${ghosts.length} ghost subscriptions.`);

    if (ghosts.length > 0) {
      const result = await prisma.subscription.deleteMany({
         where: {
            userId: null,
            institutionId: null
         }
      });
      console.log(`Deleted ${result.count} ghost subscriptions.`);
    }
  } catch (err) {
    console.error("Error cleaning ghosts:", err);
  } finally {
    await prisma.$disconnect();
  }
}

cleanGhosts();
