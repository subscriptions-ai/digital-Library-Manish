const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function fixUrls() {
  const contents = await prisma.content.findMany({
    where: { fileUrl: { contains: 'stmjournals.in' } }
  });

  console.log(`Found ${contents.length} contents to fix.`);
  if (contents.length === 0) return;

  const pdfDir = path.join(process.cwd(), 'public', 'extracted_pdfs');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const cookieFile = path.join(process.cwd(), 'ojs-cookies.txt');
  if (fs.existsSync(cookieFile)) fs.unlinkSync(cookieFile);

  // Login
  console.log("Logging in via curl...");
  execSync(`curl -s -c ${cookieFile} https://engineeringjournals.stmjournals.in/index.php/index/login > /dev/null`);
  execSync(`curl -s -b ${cookieFile} -c ${cookieFile} -d 'username=enggstm&password=EEEcal@STM%231&source=' -L https://engineeringjournals.stmjournals.in/index.php/index/login/signIn > /dev/null`);

  for (const item of contents) {
    try {
      console.log(`Downloading ${item.fileUrl}...`);
      const filename = `ojs_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
      const filePath = path.join(pdfDir, filename);
      
      // Get headers first
      const headersStr = execSync(`curl -s -I -b ${cookieFile} -L ${item.fileUrl}`).toString();
      if (!headersStr.toLowerCase().includes('application/pdf')) {
        console.log(`  -> Failed: Not a PDF (Headers:\n${headersStr.split('\\n')[0]})`);
        continue;
      }
      
      execSync(`curl -s -b ${cookieFile} -L ${item.fileUrl} -o ${filePath}`);
      
      await prisma.content.update({
        where: { id: item.id },
        data: { fileUrl: `/extracted_pdfs/${filename}` }
      });
      console.log(`  -> Saved as /extracted_pdfs/${filename}`);
    } catch (e) {
      console.error(`  -> Error downloading ${item.fileUrl}`);
    }
  }

  console.log("Done fixing URLs.");
}

fixUrls().finally(() => prisma.$disconnect());
