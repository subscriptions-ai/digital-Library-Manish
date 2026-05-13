import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = "testlogin@test.com";
  const password = "Password123!";
  const hashedPassword = await bcrypt.hash(password, 10);
  
  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      displayName: "Test User",
      role: "Institution",
      status: "Active"
    }
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(password, user.password);
  console.log("Is valid:", valid);
}

main().catch(console.error).finally(() => prisma.$disconnect());
