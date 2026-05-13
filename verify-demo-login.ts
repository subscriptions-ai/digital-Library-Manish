import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
async function main() {
  // Check the demo user in the DB
  const user = await prisma.user.findUnique({ 
    where: { email: 'vivek.verma@panoptical.org' } 
  });
  
  if (!user) {
    console.log("User NOT found in database!");
    return;
  }
  
  console.log("User found:", {
    email: user.email,
    role: user.role,
    status: user.status,
    isBlocked: user.isBlocked,
    isDemoAccount: user.isDemoAccount,
    demoExpiresAt: user.demoExpiresAt,
    passwordLength: user.password?.length,
    passwordPrefix: user.password?.substring(0, 7)
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
