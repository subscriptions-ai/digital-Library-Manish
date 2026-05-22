const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const inst = await prisma.user.findFirst({ where: { role: 'Institution' } });
  if (!inst) return console.log('No institution found');
  console.log('Inst ID:', inst.id);
  const result = await prisma.user.updateMany({
    where: { role: 'Student' },
    data: { institutionId: inst.id }
  });
  console.log('Updated students:', result);
}
run();
