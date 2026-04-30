import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = "info@celnet.in";
  const password = "adminpassword123";
  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { password: hashedPassword },
    create: {
      email,
      password: hashedPassword,
      displayName: "Super Admin",
      role: "SuperAdmin",
      status: "Active",
    },
  });

  console.log("Admin user seeded successfully.");
}

seedAdmin()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
