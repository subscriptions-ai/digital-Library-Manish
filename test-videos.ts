import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const videos = await prisma.content.findMany({
    where: { contentType: { contains: 'Video' } }
  });
  console.log(videos);
}
main().finally(() => prisma.$disconnect());
