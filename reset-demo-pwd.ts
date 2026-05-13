import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
async function main() {
  // Set a clean, simple password with no special chars so we can verify login works
  const newPassword = "DemoSTM2024";
  const hash = await bcrypt.hash(newPassword, 10);
  
  await prisma.user.update({
    where: { email: 'vivek.verma@panoptical.org' },
    data: { password: hash, isFirstLogin: true }
  });
  
  console.log(`Password reset for vivek.verma@panoptical.org`);
  console.log(`New password: ${newPassword}`);
  
  // Verify it works
  const user = await prisma.user.findUnique({ where: { email: 'vivek.verma@panoptical.org' } });
  const ok = await bcrypt.compare(newPassword, user!.password);
  console.log("Verification check:", ok ? "✅ Password works" : "❌ Password mismatch");
}
main().catch(console.error).finally(() => prisma.$disconnect());
