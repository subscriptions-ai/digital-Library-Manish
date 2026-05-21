import { PrismaClient } from '@prisma/client';
import { generateFingerprint } from '../src/lib/dedup.js';

const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting fingerprint backfill...');
  
  const contents = await prisma.content.findMany({
    select: { id: true, title: true, authors: true }
  });
  
  console.log(`Found ${contents.length} records. Processing...`);
  
  let success = 0;
  let skipped = 0;
  let errors = 0;
  
  // We process sequentially to catch unique constraint violations easily
  for (const item of contents) {
    if (!item.title || !item.authors) {
      console.log(`Skipping ID: ${item.id} - missing title or authors`);
      skipped++;
      continue;
    }
    
    const fingerprint = generateFingerprint(item.title, item.authors);
    
    try {
      await prisma.content.update({
        where: { id: item.id },
        data: { fingerprint }
      });
      success++;
      
      if (success % 100 === 0) {
        console.log(`Processed ${success} items...`);
      }
    } catch (e: any) {
      if (e.code === 'P2002') {
        console.error(`Duplicate fingerprint found for ID: ${item.id} (${item.title})`);
      } else {
        console.error(`Error updating ID: ${item.id}`, e.message);
      }
      errors++;
    }
  }
  
  console.log(`\nBackfill complete!`);
  console.log(`Total Success: ${success}`);
  console.log(`Total Skipped: ${skipped}`);
  console.log(`Total Errors: ${errors}`);
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
