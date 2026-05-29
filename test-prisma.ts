import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function test() {
  await prisma.favorite.findUnique({
    where: { userId_contentId: { userId: '1', contentId: '2' } }
  });
}
