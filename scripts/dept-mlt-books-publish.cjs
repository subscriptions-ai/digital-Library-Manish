/**
 * Publish the MLT Draft books that PASSED the application's publication eligibility (scripts/dept-mlt-books-publish-check.ts): status Draft -> Published, nothing else.
 * Header sets   var __ROWS__ = [ {id, licence, licenceIsNC, rightsStatus, accessStatus, rightsBasis, year}, ... ];  var __RUN__ = "<run id>";
 * The same single conditional statement as src/lib/ingestion/reviewPublish.ts: it only matches while the book is still an ingested Draft of this department with NO file address and the
 * licence, rights, access, basis and year it was judged on, so a book changed by anyone since is left alone. It changes no licence, access, rights or department and attaches no file.
 * One transaction with its audit row (BOOK_SOURCE_PUBLISH). --dry reports and writes nothing. --expect-db=<name> is required to write.
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DRY = process.argv.includes('--dry');
(async () => {
  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (!DRY && arg('expect-db', '') !== db) { console.error(`REFUSED: connected to "${db}", --expect-db is "${arg('expect-db', '')}"`); process.exit(2); }
  if (!/^dept-mlt-books-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(__RUN__)) { console.error('bad run id'); process.exit(3); }
  const out = { database: db, runId: __RUN__, dry: DRY, requested: __ROWS__.length, published: 0, notMatched: [], ids: [] };
  await p.$transaction(async (tx) => {
    const at = new Date().toISOString();
    for (const r of __ROWS__) {
      const note = JSON.stringify({ source: 'dept-mlt-books-publish', runId: __RUN__, eligibility: 'publicationEligibility.ts (licence, rights, access, year, no file)', performedBy: 'ingestion', performedAt: at });
      if (DRY) { const m = await tx.$queryRawUnsafe(`select id from "Book" where id = $1 and status = 'Draft' and domain = 'Medical Laboratory Technology'`, r.id); if (m.length) { out.published++; out.ids.push(r.id); } else out.notMatched.push(r.id); continue; }
      const done = await tx.$queryRawUnsafe(
        `update "Book" set status = 'Published', "updatedAt" = now(), metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{reviewPublication}', $2::jsonb, true)
          where id = $1 and status = 'Draft' and "ownershipSource" = 'Ingested' and "rejectionNote" is null and domain = 'Medical Laboratory Technology' and "pdfUrl" is null
            and licence is not distinct from $3::text and "licenceIsNC" is not distinct from $4::boolean and "rightsStatus" is not distinct from $5::text
            and "accessStatus" is not distinct from $6::text and "rightsBasis" is not distinct from $7::text and year is not distinct from $8::int
          returning id`, r.id, note, r.licence, r.licenceIsNC, r.rightsStatus, r.accessStatus, r.rightsBasis, r.year);
      if (done.length) { out.published++; out.ids.push(r.id); } else out.notMatched.push(r.id);
    }
    if (!DRY && out.ids.length) await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: 'BOOK_SOURCE_PUBLISH', meta: { runId: __RUN__, at: new Date().toISOString(), published: out.ids, notMatched: out.notMatched } } });
  }, { timeout: 60000, maxWait: 15000 });
  process.stdout.write(JSON.stringify(out)); await p.$disconnect();
})().catch(e => { console.error('PUBLISH FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
