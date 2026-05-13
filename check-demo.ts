import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { isDemoAccount: true }
  });
  console.log("Demo Users:", users.map(u => ({ email: u.email, role: u.role, isDemo: u.isDemoAccount, created: u.createdAt })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
