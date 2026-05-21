import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.content.findFirst({
    where: { title: { contains: "Trust-Aware and Energy-Efficient" } }
  });
  console.log("Content:", c?.title, c?.status, c?.validationStatus);
  console.log("URL:", c?.fileUrl);
}
run();
