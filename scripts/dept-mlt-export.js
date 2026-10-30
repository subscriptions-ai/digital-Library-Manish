// READ ONLY production export for the Medical Laboratory Technology audit (Phase A) and the live de-duplication catalogue. Run inside the app container:
//   ssh … 'docker exec -i -w /app <app> node -' < scripts/dept-mlt-export.js > out.ndjson
// One READ ONLY transaction per query. Prints NDJSON, never a key, never a user record.
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const p = new PrismaClient();
const clean = (v) => (typeof v === 'string' ? v.replace(/\u0000/g, '') : v);
const out = (o) => new Promise((r) => { const s = JSON.stringify(o, (k, v) => clean(v)) + '\n'; process.stdout.write(s) ? r() : process.stdout.once('drain', r); });
const ro = (fn) => p.$transaction(async (tx) => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 90000'); return fn(tx); }, { timeout: 120000, maxWait: 10000 });
// A wide net on purpose: the rules decide, the net does not.
const NET = '(laborator|patholog|haematolog|hematolog|biochem|microbiolog|cytolog|histolog|histopatholog|transfus|blood bank|phlebotom|point.of.care|diagnos|clinical chem|serolog|immunohaemat|immunohemat|coagulat|thrombo|urinaly|parasitolog|mycolog|virolog|bacteriolog|medical technolog|medical technician|biomedical scien|cytogenet|haemostas|hemostas)';
(async () => {
  const meta = await ro((t) => t.$queryRawUnsafe(`select (select count(*)::int from "Journal") journals,
      (select count(*)::int from "Journal" where status in ('Accepted','MetadataOnly')) public_status_rule,
      (select count(*)::int from "Journal" where status = 'Accepted') accepted,
      (select count(*)::int from "Journal" where domain = 'Medical Laboratory Technology') mlt_journals,
      (select count(*)::int from "Journal" where domain = 'Medical Laboratory Technology' and status in ('Accepted','MetadataOnly')) mlt_public,
      (select count(*)::int from "Book" where domain = 'Medical Laboratory Technology') mlt_books,
      (select max("createdAt") from "Journal") newest_journal, now() at, current_setting('transaction_read_only') ro`));
  await out({ t: 'meta', ...meta[0] });
  const st = await ro((t) => t.$queryRawUnsafe(`select domain, status::text status, count(*)::int n from "Journal" where domain ~* 'laborator|medical|paramedic|patholog|radiolog|optom' group by 1,2 order by 1,2`));
  await out({ t: 'dept-status', rows: st });
  // The live catalogue of identifiers and titles (for the offline de-duplication only; the writer re-checks live inside its lock).
  let last = '';
  for (;;) {
    const rows = await ro((t) => t.$queryRawUnsafe(`select id, issn, eissn, title, domain, status::text status, "updatedAt" u from "Journal" where id > $1 order by id limit 5000`, last));
    if (!rows.length) break; for (const r of rows) await out({ t: 'cat', ...r }); last = rows[rows.length - 1].id;
  }
  // Existing journals that may be MLT under another department (Phase A: audit only, nothing is moved).
  last = '';
  for (;;) {
    const rows = await ro((t) => t.$queryRawUnsafe(`select id, issn, eissn, title, domain, status::text status, subject, subjects, "publisherName" publisher, "articleCount" articles, "openAccess" oa
      from "Journal" where id > $1 and (title ~* $2 or subject ~* $2 or subjects::text ~* $2 or domain = 'Medical Laboratory Technology') order by id limit 4000`, last, NET));
    if (!rows.length) break; for (const r of rows) await out({ t: 'journal', ...r }); last = rows[rows.length - 1].id;
  }
  await out({ t: 'end' }); await p.$disconnect();
})().catch((e) => { console.error('EXPORT ERROR', e.message); process.exit(1); });
