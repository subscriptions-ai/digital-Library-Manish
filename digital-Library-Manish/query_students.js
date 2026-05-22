const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const users = await prisma.user.findMany({ where: { role: 'Student' } });
  console.log(users);
}
run();
