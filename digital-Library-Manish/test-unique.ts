import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const user = await prisma.user.findFirst();
    const content = await prisma.content.findFirst();

    console.log("Testing findUnique...");
    const existing = await prisma.favorite.findUnique({
      where: { userId_contentId: { userId: user!.id, contentId: content!.id } }
    });
    console.log("existing:", existing);
  } catch (e) {
    console.error("Error occurred:", e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
