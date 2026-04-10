const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const admins = await prisma.user.findMany({ where: { role: 'Institution' } });
  
  for (const admin of admins) {
    if (!admin.institutionId) {
      // Create the Institution row
      const inst = await prisma.institution.create({
        data: {
          name: admin.organization || admin.displayName || 'Unnamed Institution',
          status: 'Active'
        }
      });
      // Link the admin to this institution
      await prisma.user.update({
        where: { id: admin.id },
        data: { institutionId: inst.id }
      });
      console.log(`Created Institution ${inst.id} for Admin API account ${admin.email}`);
      admin.institutionId = inst.id; // update for next step
    } else {
      console.log(`Admin API account ${admin.email} already has Institution ${admin.institutionId}`);
    }

    if (admin.organization) {
      const students = await prisma.user.findMany({ 
        where: { role: 'Student', organization: admin.organization, institutionId: null } 
      });
      for (const st of students) {
        await prisma.user.update({
          where: { id: st.id },
          data: { institutionId: admin.institutionId }
        });
        console.log(`Migrated student ${st.email} to Institution`);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
