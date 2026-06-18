const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateLeads() {
  console.log('Starting migration...');
  
  // 1. Migrate Demo Requests
  const demos = await prisma.demoRequest.findMany();
  let demoCount = 0;
  for (const d of demos) {
    // Prevent duplicates
    const exists = await prisma.lead.findFirst({ where: { email: d.institutionalEmail, source: 'Demo Request' } });
    if (!exists) {
      await prisma.lead.create({
        data: {
          name: d.fullName,
          email: d.institutionalEmail,
          phone: d.whatsappNumber,
          organization: d.institutionName,
          source: 'Demo Request',
          status: d.status === 'Completed' ? 'Converted' : 'New',
          notes: d.adminNotes || "Requested Demo",
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        }
      });
      demoCount++;
    }
  }

  // 2. Migrate Contact Inquiries
  const contacts = await prisma.contactInquiry.findMany();
  let contactCount = 0;
  for (const c of contacts) {
    const exists = await prisma.lead.findFirst({ where: { email: c.email, source: 'Contact Inquiry' } });
    if (!exists) {
      await prisma.lead.create({
        data: {
          name: c.fullName,
          email: c.email,
          phone: c.mobile || c.whatsapp,
          organization: c.organization,
          source: 'Contact Inquiry',
          status: c.status === 'Resolved' ? 'Converted' : 'New',
          notes: c.message || "Contact Form Inquiry",
          createdAt: c.createdAt || new Date(),
          updatedAt: c.updatedAt || new Date()
        }
      });
      contactCount++;
    }
  }

  console.log(`Migration complete. Added ${demoCount} Demo Requests and ${contactCount} Contact Inquiries to Leads.`);
}

migrateLeads()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
