// READ ONLY production export for the Medical Laboratory Technology BOOKS work. Run inside the app container:
//   ssh … 'docker exec -i -w /app <app> node -' < scripts/dept-mlt-books-export.js > out.ndjson
// One READ ONLY transaction per query. Prints NDJSON: counts, the identifier/title catalogue of every Book and legacy Books row (for offline de-duplication), and the
// Books that look like MLT today (to see what is already held, under which department; nothing is moved).
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const p = new PrismaClient();
const clean = (v) => (typeof v === 'string' ? v.replace(/\u0000/g, '') : v);
const out = (o) => new Promise((r) => { const s = JSON.stringify(o, (k, v) => clean(v)) + '\n'; process.stdout.write(s) ? r() : process.stdout.once('drain', r); });
const ro = (fn) => p.$transaction(async (tx) => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 90000'); return fn(tx); }, { timeout: 120000, maxWait: 10000 });
const NET = '(laborator|patholog|haematolog|hematolog|clinical chem|clinical biochem|microbiolog|cytolog|histolog|histopatholog|transfus|blood bank|phlebotom|point.of.care|diagnos|serolog|immunohaemat|immunohemat|coagulat|urinaly|parasitolog|mycolog|virolog|bacteriolog|medical technolog|biomedical scien|cytogenet|haemostas|hemostas|medical lab|analis kesehatan)';
(async () => {
  const meta = await ro((t) => t.$queryRawUnsafe(`select (select count(*)::int from "Book") books, (select count(*) filter (where status='Published')::int from "Book") published, (select count(*) filter (where status='Draft')::int from "Book") drafts,
      (select count(*)::int from "Book" where domain = 'Medical Laboratory Technology') mlt_books, (select count(*)::int from "Content" where "contentType" = 'Books') legacy, (select max("createdAt") from "Book") newest_book, now() at, current_setting('transaction_read_only') ro`));
  await out({ t: 'meta', ...meta[0] });
  let last = '';
  for (;;) {
    const rows = await ro((t) => t.$queryRawUnsafe(`select id, isbn, doi, fingerprint, source, "sourceRecordId" sid, title, authors, year, edition, domain, status from "Book" where id > $1 order by id limit 5000`, last));
    if (!rows.length) break; for (const r of rows) await out({ t: 'bcat', ...r }); last = rows[rows.length - 1].id;
  }
  last = '';
  for (;;) {
    const rows = await ro((t) => t.$queryRawUnsafe(`select id, title, authors from "Content" where "contentType" = 'Books' and id > $1 order by id limit 5000`, last));
    if (!rows.length) break; for (const r of rows) await out({ t: 'legacy', ...r }); last = rows[rows.length - 1].id;
  }
  last = '';
  for (;;) {
    const rows = await ro((t) => t.$queryRawUnsafe(`select id, title, authors, year, domain, status, source, subject, "accessStatus" access, licence, isbn, doi,
        metadata->'harvest'->'keywords' kw, metadata->'harvest'->'provider'->'nlmClass' nlm, left(description, 300) descr
      from "Book" where id > $1 and (title ~* $2 or subject ~* $2 or (metadata->'harvest'->'keywords')::text ~* $2 or (metadata->'harvest'->'provider'->'nlmClass')::text ~ '"(QY|QW|WH|QU 2|QZ) ') order by id limit 4000`, last, NET));
    if (!rows.length) break; for (const r of rows) await out({ t: 'book', ...r }); last = rows[rows.length - 1].id;
  }
  await out({ t: 'end' }); await p.$disconnect();
})().catch((e) => { console.error('EXPORT ERROR', e.message); process.exit(1); });
