const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function fixUrls() {
  const contents = await prisma.content.findMany({
    where: {
      fileUrl: { contains: 'stmjournals.in' }
    }
  });

  console.log(`Found ${contents.length} contents with external OJS links.`);
  if (contents.length === 0) return;

  // 1. Authenticate
  let baseUrl = 'https://engineeringjournals.stmjournals.in';
  let cookieString = '';
  try {
    let initRes = await fetch(`${baseUrl}/index.php/index/login`);
    let initCookies = initRes.headers.get('set-cookie');
    cookieString = initCookies ? initCookies.split(',').map(c => c.split(';')[0]).join('; ') : '';
    
    let loginRes = await fetch(`${baseUrl}/index.php/index/login/signIn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': cookieString,
        'Referer': `${baseUrl}/index.php/index/login`
      },
      redirect: 'manual',
      body: 'username=enggstm&password=EEEcal@STM%231&source=' 
    });
    
    let loginCookies = loginRes.headers.get('set-cookie');
    if (loginCookies) {
      cookieString = loginCookies.split(',').map(c => c.split(';')[0]).join('; ');
    }
    console.log("Logged in. Cookie:", cookieString);
  } catch (e) {
    console.error("Login Error:", e);
    return;
  }

  const pdfDir = path.join(process.cwd(), 'public', 'extracted_pdfs');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  for (const item of contents) {
    try {
      console.log(`Downloading ${item.fileUrl}...`);
      const pdfResponse = await fetch(item.fileUrl, {
        headers: { 'Cookie': cookieString, 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow'
      });
      
      if (pdfResponse.ok && pdfResponse.headers.get('content-type')?.includes('pdf')) {
        const buffer = await pdfResponse.arrayBuffer();
        const filename = `ojs_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
        const filePath = path.join(pdfDir, filename);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        
        await prisma.content.update({
          where: { id: item.id },
          data: { fileUrl: `/extracted_pdfs/${filename}` }
        });
        console.log(`  -> Saved as /extracted_pdfs/${filename}`);
      } else {
        console.log(`  -> Failed: Not a PDF (Type: ${pdfResponse.headers.get('content-type')})`);
      }
    } catch (e) {
      console.error(`  -> Error downloading ${item.fileUrl}:`, e);
    }
  }

  console.log("Done fixing URLs.");
}

fixUrls().finally(() => prisma.$disconnect());
