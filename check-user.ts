import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { email: { contains: "amit" } }
  });
  console.log("Users:", users.map(u => ({ email: u.email, role: u.role, isDemo: u.isDemoAccount })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
