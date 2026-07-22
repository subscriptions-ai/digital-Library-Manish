// One-off cleanup: delete Article rows whose PDF does NOT open in-app (landing pages,
// Cloudflare-blocked, dead links). Keeps only articles with a real, fetchable PDF.
// Books are left untouched. Re-run safe.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function isFetchablePdf(url) {
  if (!url) return false;
  try {
    const nodeFetch = (await import('node-fetch')).default;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await nodeFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'application/pdf,*/*', 'Range': 'bytes=0-2047' },
      redirect: 'follow', signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status >= 400) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/pdf')) return true;
    if (ct.includes('text/html')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.slice(0, 5).toString('latin1').startsWith('%PDF');
  } catch { return false; }
}

(async () => {
  const arts = await prisma.article.findMany({ select: { id: true, pdfUrl: true } });
  console.log(`Validating ${arts.length} articles...`);
  const CONC = 10;
  let removed = 0, kept = 0, done = 0;
  for (let i = 0; i < arts.length; i += CONC) {
    const batch = arts.slice(i, i + CONC);
    const results = await Promise.all(batch.map(async a => ({ id: a.id, ok: await isFetchablePdf(a.pdfUrl) })));
    const bad = results.filter(r => !r.ok).map(r => r.id);
    if (bad.length) await prisma.article.deleteMany({ where: { id: { in: bad } } });
    removed += bad.length; kept += results.length - bad.length; done += batch.length;
    if (done % 50 === 0 || done === arts.length) console.log(`  ${done}/${arts.length} — kept ${kept}, removed ${removed}`);
  }
  // Also drop journals that no longer have any articles
  const emptyJournals = await prisma.$executeRawUnsafe(
    `DELETE FROM "Journal" j WHERE NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id)`
  );
  console.log(`\nDONE: kept ${kept} openable, removed ${removed} un-openable. Empty journals removed: ${emptyJournals}`);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
