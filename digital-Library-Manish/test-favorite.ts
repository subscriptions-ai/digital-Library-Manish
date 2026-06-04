import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    // Find a random user
    const user = await prisma.user.findFirst();
    if (!user) return console.log("No users found");
    
    // Find a random content
    const content = await prisma.content.findFirst();
    if (!content) return console.log("No content found");

    console.log(`Testing with user ${user.id} and content ${content.id}`);

    const existing = await prisma.favorite.findFirst({
      where: { userId: user.id, contentId: content.id }
    });

    if (existing) {
      console.log("Already favorited, deleting");
      await prisma.favorite.delete({ where: { id: existing.id } });
    } else {
      console.log("Creating favorite");
      await prisma.favorite.create({
        data: { userId: user.id, contentId: content.id }
      });
    }
    console.log("Success!");
  } catch (e) {
    console.error("Error occurred:", e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
