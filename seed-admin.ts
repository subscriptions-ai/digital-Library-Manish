import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Creates the first Super Admin, once. Bootstrap only:
 *
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='…' npx tsx seed-admin.ts
 *
 * If an account with that address already exists it is left exactly as it is (password, email and role untouched), so running this again,
 * or a restart or redeploy, can never reset an administrator's credentials. Change an existing password in Admin > My Account or
 * Admin > Users > Reset password. Nothing runs this automatically.
 */
const prisma = new PrismaClient();

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set SEED_ADMIN_EMAIL to the new Super Admin's address.");
  if (password.length < 8) throw new Error("Set SEED_ADMIN_PASSWORD (at least 8 characters).");

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, role: true } });
  if (existing) {
    console.log(`An account with that address already exists (role ${existing.role}). Nothing was changed.`);
    return;
  }
  await prisma.user.create({
    data: { email, password: await bcrypt.hash(password, 10), displayName: "Super Admin", role: "SuperAdmin", status: "Active" },
  });
  console.log("Super Admin created.");
}

seedAdmin()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
