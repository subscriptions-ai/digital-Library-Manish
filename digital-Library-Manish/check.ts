import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const subs = await prisma.subscription.findMany({
    select: { planName: true, domainName: true, domains: true, contentTypes: true, allowedContentTypes: true }
  });
  console.log(JSON.stringify(subs, null, 2));
}
run();
