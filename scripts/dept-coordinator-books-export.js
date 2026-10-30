// READ ONLY: every Book of the four new departments (any status) with the fields the publication review needs, plus the run id that inserted it (from the audit rows).
// ssh … 'docker exec -i -w /app <app> node -' < scripts/dept-coordinator-books-export.js > out.ndjson
const { PrismaClient } = require('/app/node_modules/@prisma/client'); const p = new PrismaClient();
const D = ['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology'];
const clean = (v) => (typeof v === 'string' ? v.replace(/\u0000/g, '') : v);
const out = (o) => new Promise((r) => { const s = JSON.stringify(o, (k, v) => clean(v)) + '\n'; process.stdout.write(s) ? r() : process.stdout.once('drain', r); });
(async () => {
  const r = await p.$transaction(async (tx) => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 90000');
    const audits = await tx.$queryRawUnsafe(`select meta->>'runId' run, meta->'inserted' ins from "IngestionAudit" where action = 'BOOK_SOURCE_IMPORT' and "at" > now() - interval '3 days'`);
    const runOf = new Map(); for (const a of audits) for (const x of (a.ins || [])) if (x && x.id) runOf.set(x.id, a.run);
    const rows = await tx.$queryRawUnsafe(`select id, title, authors, "publisherName" publisher, year, language, edition, isbn, doi, source, "sourceRecordId" sid, fingerprint, domain, status, "ownershipSource" own, "rejectionNote" rej,
        licence, "licenceIsNC" nc, "rightsBasis" basis, "rightsStatus" rs, "accessStatus" acc, "accessType" atype, "pdfUrl" pdf, "originalUrl" url, left(description, 400) descr, "createdAt" created,
        metadata->'harvest'->'department' dept, metadata->'harvest'->'provider'->'nlmClass' nlm, metadata->'harvest'->'classifications' cls, metadata->'harvest'->'keywords' kw, metadata->'reviewPublication' pub
      from "Book" where domain = any($1) order by id`, D);
    return rows.map(x => ({ ...x, run: runOf.get(x.id) || null })); });
  for (const x of r) await out(x); await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
