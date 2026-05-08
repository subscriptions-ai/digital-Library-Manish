import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const content = await prisma.content.findUnique({ where: { id: "d98277a8-8417-4f37-a597-d6b933d49474" } });
  console.log(content);
}
main().finally(() => prisma.$disconnect());
